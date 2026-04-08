import { useState, useCallback, useEffect } from 'react';
import type { Patient, Visit, ChatMessage, ScheduleItem } from '../types';
import type { ActiveForm } from './ChatPanel';
import { API_BASE } from '../config';
import VisitSchedule from './VisitSchedule';
import ChatPanel from './ChatPanel';
import { MOCK_SCHEDULES } from '../mockSchedule';

interface VisitPageProps {
  patient: Patient;
  visit: Visit;
  messages: ChatMessage[];
  isStreaming: boolean;
  activeToolCall: string | null;
  lastLoadedMsgId: string | null;
  onSendMessage: (content: string) => void;
  onToolCall: (listener: (tool: string, input: Record<string, unknown>) => void) => void;
  onGoBack: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Fuzzy match: check if the tool input name is close enough to a schedule item label
function fuzzyMatch(scheduleLabel: string, toolName: string): boolean {
  const a = scheduleLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = toolName.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Exact match after normalization
  if (a === b) return true;
  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;
  // Match on first word (e.g. "Metoprolol" matches "Metoprolol 25mg")
  const aFirst = scheduleLabel.toLowerCase().split(/\s+/)[0];
  const bFirst = toolName.toLowerCase().split(/\s+/)[0];
  if (aFirst.length > 3 && bFirst.length > 3 && (aFirst.includes(bFirst) || bFirst.includes(aFirst))) return true;
  return false;
}

export default function VisitPage({
  patient,
  visit,
  messages,
  isStreaming,
  activeToolCall,
  lastLoadedMsgId,
  onSendMessage,
  onToolCall,
  onGoBack,
}: VisitPageProps) {
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>(
    () => MOCK_SCHEDULES[patient.id] ?? [],
  );
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);

  const totalItems = scheduleItems.length;
  const completedCount = scheduleItems.filter(
    (i) => i.status === 'completed' || i.status === 'skipped',
  ).length;
  const progressPct = totalItems > 0 ? (completedCount / totalItems) * 100 : 0;

  // Mark a schedule item as completed
  const markItemCompleted = useCallback(
    (itemId: string, action: string) => {
      setScheduleItems((prev) =>
        prev.map((si) =>
          si.id === itemId
            ? {
                ...si,
                status: 'completed' as const,
                completedAt: new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }),
                completedAction: action,
              }
            : si,
        ),
      );
    },
    [],
  );

  // Listen for agent tool calls and match them to schedule items
  useEffect(() => {
    onToolCall((tool: string, input: Record<string, unknown>) => {
      setScheduleItems((prev) => {
        const toolInputName = (input.name as string) ?? '';

        // Find the first pending/overdue item that matches
        let matchIdx = -1;

        if (tool === 'log_vitals') {
          matchIdx = prev.findIndex(
            (si) => si.type === 'vitals' && (si.status === 'pending' || si.status === 'overdue'),
          );
        } else if (tool === 'log_medication') {
          // Try exact fuzzy match on medication name first
          matchIdx = prev.findIndex(
            (si) =>
              si.type === 'medication' &&
              (si.status === 'pending' || si.status === 'overdue') &&
              fuzzyMatch(si.label, toolInputName),
          );
          // Fallback: first pending medication
          if (matchIdx === -1) {
            matchIdx = prev.findIndex(
              (si) => si.type === 'medication' && (si.status === 'pending' || si.status === 'overdue'),
            );
          }
        } else if (tool === 'log_intervention') {
          matchIdx = prev.findIndex(
            (si) =>
              si.type === 'intervention' &&
              (si.status === 'pending' || si.status === 'overdue') &&
              fuzzyMatch(si.label, toolInputName),
          );
          if (matchIdx === -1) {
            matchIdx = prev.findIndex(
              (si) => si.type === 'intervention' && (si.status === 'pending' || si.status === 'overdue'),
            );
          }
        } else if (tool === 'update_narrative') {
          matchIdx = prev.findIndex(
            (si) => si.type === 'narrative' && (si.status === 'pending' || si.status === 'overdue'),
          );
        }

        if (matchIdx === -1) return prev;

        // Determine the completion action label
        let completedAction = 'done';
        if (tool === 'log_vitals') completedAction = 'recorded';
        else if (tool === 'log_medication') {
          completedAction = input.given === false ? 'withheld' : 'given';
        }
        else if (tool === 'log_intervention') completedAction = 'done';
        else if (tool === 'update_narrative') completedAction = 'done';

        const updated = [...prev];
        updated[matchIdx] = {
          ...updated[matchIdx],
          status: tool === 'log_medication' && input.given === false ? 'skipped' : 'completed',
          completedAt: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          completedAction,
        };
        return updated;
      });
    });
  }, [onToolCall]);

  // Quick action tapped on schedule → open the form in the chat
  const handleQuickAction = useCallback(
    (item: ScheduleItem, actionValue: string) => {
      setActiveForm({ item, actionValue });
    },
    [],
  );

  // Form submitted → mark item, build chat message, send to agent
  const handleFormSubmit = useCallback(
    (item: ScheduleItem, data: Record<string, string>) => {
      const action = data.action ?? '';

      let newStatus: ScheduleItem['status'] = 'completed';
      let completedAction = 'done';

      if (action === 'skipped' || action === 'med_skipped' || action === 'intervention_skip') {
        newStatus = 'skipped';
        completedAction = 'skipped';
      } else if (action === 'med_given') {
        completedAction = 'given';
      } else if (action === 'med_modified') {
        completedAction = 'modified';
      } else if (action === 'record_vitals' || !action) {
        completedAction = 'recorded';
      } else if (action === 'intervention_done') {
        completedAction = 'done';
      } else if (action === 'write_narrative') {
        completedAction = 'done';
      }

      setScheduleItems((prev) =>
        prev.map((si) =>
          si.id === item.id
            ? {
                ...si,
                status: newStatus,
                completedAt: new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }),
                completedAction,
              }
            : si,
        ),
      );

      const chatMsg = buildChatMessage(item, data);
      onSendMessage(chatMsg);
      setActiveForm(null);
    },
    [onSendMessage],
  );

  const handleFormCancel = useCallback(() => {
    setActiveForm(null);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/visits/${visit.id}/export`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visit_${patient.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_${visit.visit_date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[export] Failed:', err);
    }
  }, [visit.id, visit.visit_date, patient.full_name]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {getInitials(patient.full_name)}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{patient.full_name}</h2>
            <p className="text-xs text-gray-400">{totalItems} items today</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-gray-500">
            {completedCount}/{totalItems} complete
          </span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gray-900 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <button
            onClick={handleExport}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            title="Export visit to Excel"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          activeForm={activeForm}
          lastLoadedMsgId={lastLoadedMsgId}
          onSendMessage={onSendMessage}
          onFormSubmit={handleFormSubmit}
          onFormCancel={handleFormCancel}
        />
        <VisitSchedule items={scheduleItems} onQuickAction={handleQuickAction} />
      </div>
    </div>
  );
}

// Build a natural-language summary of the form data to send as a chat message
function buildChatMessage(item: ScheduleItem, data: Record<string, string>): string {
  const action = data.action ?? '';

  if (item.type === 'vitals' && action !== 'skipped') {
    const parts: string[] = [];
    if (data.bp_systolic && data.bp_diastolic) parts.push(`BP ${data.bp_systolic}/${data.bp_diastolic}`);
    else if (data.bp_systolic) parts.push(`BP sys ${data.bp_systolic}`);
    if (data.heart_rate) parts.push(`HR ${data.heart_rate}`);
    if (data.temperature_f) parts.push(`Temp ${data.temperature_f}°F`);
    if (data.respiratory_rate) parts.push(`RR ${data.respiratory_rate}`);
    if (data.o2_saturation) parts.push(`O2 ${data.o2_saturation}%`);
    if (data.weight_lbs) parts.push(`Weight ${data.weight_lbs} lbs`);
    if (data.pain_score) parts.push(`Pain ${data.pain_score}/10`);
    let msg = `Vitals recorded: ${parts.join(', ')}`;
    if (data.notes) msg += `. Notes: ${data.notes}`;
    return msg;
  }

  if (action === 'skipped' || action === 'med_skipped' || action === 'intervention_skip') {
    return `Skipped ${item.label}. Reason: ${data.reason || 'not specified'}`;
  }

  if (action === 'med_given') {
    let msg = `${item.label} — given`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  if (action === 'med_modified') {
    const parts: string[] = [];
    if (data.dose) parts.push(`dose: ${data.dose}`);
    if (data.route) parts.push(`route: ${data.route}`);
    if (data.notes) parts.push(data.notes);
    return `${item.label} — modified (${parts.join(', ')})`;
  }

  if (action === 'intervention_done') {
    let msg = `${item.label} — completed`;
    if (data.outcome) msg += `. Outcome: ${data.outcome}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  if (action === 'write_narrative') {
    let msg = `Visit narrative: ${data.content}`;
    if (data.patient_tolerated === 'yes') msg += ' Patient tolerated visit well.';
    if (data.patient_tolerated === 'no') msg += ' Patient did not tolerate visit well.';
    return msg;
  }

  return `${item.label} — ${action || 'completed'}`;
}
