import { useState, useCallback } from 'react';
import type { Patient, Visit, ChatMessage, ScheduleItem } from '../types';
import type { ActiveForm } from './ChatPanel';
import VisitSchedule from './VisitSchedule';
import ChatPanel from './ChatPanel';
import { MOCK_SCHEDULES } from '../mockSchedule';

interface VisitPageProps {
  patient: Patient;
  visit: Visit;
  messages: ChatMessage[];
  isStreaming: boolean;
  activeToolCall: string | null;
  onSendMessage: (content: string) => void;
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

export default function VisitPage({
  patient,
  visit: _visit,
  messages,
  isStreaming,
  activeToolCall,
  onSendMessage,
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

      // Determine status
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
        // Vitals form doesn't set action — it's a vitals submission
        completedAction = 'recorded';
      } else if (action === 'intervention_done') {
        completedAction = 'done';
      } else if (action === 'write_narrative') {
        completedAction = 'done';
      }

      // Update schedule item
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

      // Build a human-readable chat message from the form data
      const chatMsg = buildChatMessage(item, data);
      onSendMessage(chatMsg);

      // Clear the form
      setActiveForm(null);
    },
    [onSendMessage],
  );

  const handleFormCancel = useCallback(() => {
    setActiveForm(null);
  }, []);

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
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <VisitSchedule items={scheduleItems} onQuickAction={handleQuickAction} />
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          activeForm={activeForm}
          onSendMessage={onSendMessage}
          onFormSubmit={handleFormSubmit}
          onFormCancel={handleFormCancel}
        />
      </div>
    </div>
  );
}

// Build a natural-language summary of the form data to send as a chat message
function buildChatMessage(item: ScheduleItem, data: Record<string, string>): string {
  const action = data.action ?? '';

  // Vitals — no action field, has raw vital sign values
  if (item.type === 'vitals' && action !== 'skipped') {
    const parts: string[] = [];
    if (data.bp_systolic && data.bp_diastolic) {
      parts.push(`BP ${data.bp_systolic}/${data.bp_diastolic}`);
    } else if (data.bp_systolic) {
      parts.push(`BP sys ${data.bp_systolic}`);
    }
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

  // Skipped anything
  if (action === 'skipped' || action === 'med_skipped' || action === 'intervention_skip') {
    return `Skipped ${item.label}. Reason: ${data.reason || 'not specified'}`;
  }

  // Medication given
  if (action === 'med_given') {
    let msg = `${item.label} — given`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  // Medication modified
  if (action === 'med_modified') {
    const parts: string[] = [];
    if (data.dose) parts.push(`dose: ${data.dose}`);
    if (data.route) parts.push(`route: ${data.route}`);
    if (data.notes) parts.push(data.notes);
    return `${item.label} — modified (${parts.join(', ')})`;
  }

  // Intervention done
  if (action === 'intervention_done') {
    let msg = `${item.label} — completed`;
    if (data.outcome) msg += `. Outcome: ${data.outcome}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  // Narrative
  if (action === 'write_narrative') {
    let msg = `Visit narrative: ${data.content}`;
    if (data.patient_tolerated === 'yes') msg += ' Patient tolerated visit well.';
    if (data.patient_tolerated === 'no') msg += ' Patient did not tolerate visit well.';
    return msg;
  }

  return `${item.label} — ${action || 'completed'}`;
}
