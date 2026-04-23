import { useState, useCallback, useEffect } from 'react';
import type { Patient, Visit, ChatMessage, ScheduleItem } from '../types';
import type { ActiveForm } from './ChatPanel';
import { API_BASE } from '../config';
import { fuzzyMatch } from '../lib/medicationMatch';
import VisitSchedule from './VisitSchedule';
import ChatPanel from './ChatPanel';

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
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([],
  );
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);

  // Load scheduled tasks AND already-logged events, then mark scheduled
  // items as completed if they were already fulfilled on a prior visit open.
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/visits/${visit.id}/schedule`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_BASE}/api/visits/${visit.id}/summary`).then((r) =>
        r.ok ? r.json() : { vitals: null, interventions: [], medications: [], narrative: null },
      ),
    ])
      .then(
        ([tasks, summary]: [
          Array<{ id: string; type: string; label: string; sublabel: string | null; scheduled_time: string }>,
          {
            vitals: { recorded_at?: string } | null;
            all_vitals?: Array<{ recorded_at: string }>;
            interventions: Array<{ name: string; recorded_at: string }>;
            medications: Array<{ name: string; given: boolean; reason_withheld?: string; recorded_at: string }>;
            narrative: { updated_at?: string } | null;
          },
        ]) => {
          const quickActionsForType = (type: string): ScheduleItem['quickActions'] => {
            switch (type) {
              case 'vitals':
                return [
                  { label: 'Record vitals', value: 'record_vitals', variant: 'primary' },
                  { label: 'Skipped', value: 'skip_vitals', variant: 'secondary' },
                ];
              case 'medication':
                return [
                  { label: 'Yes, given', value: 'med_given', variant: 'primary' },
                  { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
                  { label: 'Modified', value: 'med_modified', variant: 'secondary' },
                ];
              case 'intervention':
                return [
                  { label: 'Done', value: 'intervention_done', variant: 'primary' },
                  { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
                ];
              case 'narrative':
                return [
                  { label: 'Write narrative', value: 'write_narrative', variant: 'primary' },
                ];
              default:
                return [];
            }
          };

          const now = new Date();
          const nowMinutes = now.getHours() * 60 + now.getMinutes();

          // Mutable pools we "consume" as we match against schedule items,
          // so one logged entry never counts toward two scheduled slots.
          const medsPool = [...(summary.medications ?? [])];
          const intPool = [...(summary.interventions ?? [])];
          const vitalsPool = [...(summary.all_vitals ?? [])];
          const hasNarrative = !!summary.narrative;

          const formatTime = (iso?: string): string | undefined => {
            if (!iso) return undefined;
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return undefined;
            return d.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          };

          // Schedule order matters for vitals (start-of-shift consumes the
          // first logged row, end-of-shift the second, etc.), so keep the
          // server's sort_order by iterating in-place.
          const items: ScheduleItem[] = tasks.map((t) => {
            const [h, m] = t.scheduled_time.split(':').map(Number);
            const taskMinutes = h * 60 + m;

            let status: ScheduleItem['status'] = 'pending';
            let completedAt: string | undefined;
            let completedAction: string | undefined;

            if (t.type === 'medication') {
              const idx = medsPool.findIndex((lm) => fuzzyMatch(t.label, lm.name));
              if (idx >= 0) {
                const match = medsPool.splice(idx, 1)[0];
                status = match.given ? 'completed' : 'skipped';
                completedAction = match.given ? 'given' : 'withheld';
                completedAt = formatTime(match.recorded_at);
              }
            } else if (t.type === 'intervention') {
              const idx = intPool.findIndex((li) => fuzzyMatch(t.label, li.name));
              if (idx >= 0) {
                const match = intPool.splice(idx, 1)[0];
                status = 'completed';
                completedAction = 'done';
                completedAt = formatTime(match.recorded_at);
              }
            } else if (t.type === 'vitals') {
              const match = vitalsPool.shift();
              if (match) {
                status = 'completed';
                completedAction = 'recorded';
                completedAt = formatTime(match.recorded_at);
              }
            } else if (t.type === 'narrative' && hasNarrative) {
              status = 'completed';
              completedAction = 'done';
              completedAt = formatTime(summary.narrative?.updated_at);
            }

            const isOverdue = status === 'pending' && taskMinutes < nowMinutes;
            const lateMinutes = isOverdue ? nowMinutes - taskMinutes : undefined;

            return {
              id: t.id,
              type: t.type as ScheduleItem['type'],
              status: isOverdue ? 'overdue' : status,
              scheduledTime: t.scheduled_time,
              label: t.label,
              sublabel: t.sublabel ?? '',
              lateMinutes,
              quickActions: quickActionsForType(t.type),
              completedAt,
              completedAction,
            };
          });

          setScheduleItems(items);
        },
      )
      .catch(() => {});
  }, [visit.id]);

  const totalItems = scheduleItems.length;
  const completedCount = scheduleItems.filter(
    (i) => i.status === 'completed' || i.status === 'skipped',
  ).length;
  const progressPct = totalItems > 0 ? (completedCount / totalItems) * 100 : 0;

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
          // Name must fuzzy-match a scheduled med. PRN meds and ad-hoc
          // admins are not on the schedule — if we fall back to "first
          // pending" we mark an unrelated item as done.
          matchIdx = prev.findIndex(
            (si) =>
              si.type === 'medication' &&
              (si.status === 'pending' || si.status === 'overdue') &&
              fuzzyMatch(si.label, toolInputName),
          );
        } else if (tool === 'log_intervention') {
          // Same rule as medications — strict name match, no fallback.
          matchIdx = prev.findIndex(
            (si) =>
              si.type === 'intervention' &&
              (si.status === 'pending' || si.status === 'overdue') &&
              fuzzyMatch(si.label, toolInputName),
          );
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

  // Form submitted → save to DB directly, mark item, send chat message
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

      // Save directly to DB (don't rely on agent calling the tool)
      saveFormToDb(item, data, visit.id);

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
    [onSendMessage, visit.id],
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

// Save form data directly to the backend DB
function saveFormToDb(item: ScheduleItem, data: Record<string, string>, visitId: string): void {
  const base = `${API_BASE}/api/visits/${visitId}`;

  if (item.type === 'vitals' && data.action !== 'skipped') {
    const body: Record<string, unknown> = {};
    if (data.bp_systolic) body.bp_systolic = Number(data.bp_systolic);
    if (data.bp_diastolic) body.bp_diastolic = Number(data.bp_diastolic);
    if (data.heart_rate) body.heart_rate = Number(data.heart_rate);
    if (data.respiratory_rate) body.respiratory_rate = Number(data.respiratory_rate);
    if (data.temperature_f) body.temperature_f = Number(data.temperature_f);
    if (data.o2_saturation) body.o2_saturation = Number(data.o2_saturation);
    if (data.weight_lbs) body.weight_lbs = Number(data.weight_lbs);
    if (data.pain_score) body.pain_score = Number(data.pain_score);
    if (data.notes) body.notes = data.notes;
    fetch(`${base}/vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => console.error('[save vitals]', e));
  }

  if (item.type === 'medication') {
    const action = data.action ?? '';
    const given = action !== 'med_skipped';
    const body: Record<string, unknown> = {
      name: item.label,
      given,
    };
    if (data.dose) body.dose = data.dose;
    if (data.route) body.route = data.route;
    if (data.reason) body.reason_withheld = data.reason;
    if (data.notes) body.dose = (body.dose ?? '') + (data.notes ? ` (${data.notes})` : '');
    fetch(`${base}/medications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => console.error('[save medication]', e));
  }

  if (item.type === 'intervention') {
    const action = data.action ?? '';
    if (action !== 'intervention_skip') {
      const body: Record<string, unknown> = {
        name: item.label,
      };
      if (data.outcome) body.outcome = data.outcome;
      if (data.notes) body.description = data.notes;
      if (data.reason) body.description = data.reason;
      fetch(`${base}/interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((e) => console.error('[save intervention]', e));
    }
  }

  if (item.type === 'narrative') {
    if (data.content) {
      fetch(`${base}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: data.content,
          patient_tolerated_ok: data.patient_tolerated === 'yes' ? true : data.patient_tolerated === 'no' ? false : undefined,
        }),
      }).catch((e) => console.error('[save narrative]', e));
    }
  }
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
