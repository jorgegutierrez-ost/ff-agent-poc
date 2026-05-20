import { useState, useCallback, useEffect } from 'react';
import type { Patient, Visit, ChatMessage, ScheduleItem, SuctionEvent, SeizureEvent } from '../types';
import type { ActiveForm } from './ChatPanel';
import { API_BASE } from '../config';
import { fuzzyMatch } from '../lib/medicationMatch';
import VisitSchedule from './VisitSchedule';
import ChatPanel from './ChatPanel';
import LastShiftHighlights from './LastShiftHighlights';
import PatientIdentificationStep from './PatientIdentificationStep';

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

// Shape of a PRN order as the backend returns it. Mirrored from
// patient_prn_orders so the in-visit sidebar can list them mid-visit.
export interface PrnOrder {
  id: string;
  medication: string;
  dose: string;
  route: string;
  indication: string;
  max_frequency_hours: number | null;
  notes: string | null;
}

// Shape of a logged medication used by the in-visit panel to compute
// "PRNs given so far this shift" without re-fetching.
export interface LoggedMed {
  id?: string;
  name: string;
  given: boolean;
  reason_withheld?: string;
  administered_at?: string | null;
  recorded_at: string;
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
  const [prnOrders, setPrnOrders] = useState<PrnOrder[]>([]);
  const [loggedMeds, setLoggedMeds] = useState<LoggedMed[]>([]);
  const [suctionEvents, setSuctionEvents] = useState<SuctionEvent[]>([]);
  const [seizureEvents, setSeizureEvents] = useState<SeizureEvent[]>([]);
  // Live list of change orders for this patient. Powers the schedule
  // header button label ("3 pending sig") and the sidebar list. Re-
  // fetched after every submit so the demo updates without a refresh.
  const [patientChangeOrders, setPatientChangeOrders] = useState<Array<{
    id: string;
    medication_name: string;
    change_type: string;
    status: 'pending_signature' | 'signed' | 'discontinued' | 'cancelled';
    new_dose: string | null;
    new_route: string | null;
    new_frequency: string | null;
    source_type: string;
    source_physician: string | null;
    source_obtained_at: string | null;
    submitted_at: string;
  }>>([]);
  const [activeForm, setActiveForm] = useState<ActiveForm | null>(null);
  // Identification gate. `null` = still loading, `false` = check not on
  // file (modal will block the visit), `true` = check is done (visit
  // proceeds normally). Modal will not render until we know which.
  const [identified, setIdentified] = useState<boolean | null>(null);
  // Head-to-toe completion gate. Mirrors `identified`: the close-out
  // path checks this so the visit can't be signed off before the
  // mandatory assessment.
  const [headToToeDone, setHeadToToeDone] = useState<boolean>(false);

  // Check whether this visit's patient identification step has been
  // completed. We never auto-mark; the modal must explicitly submit.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/visits/${visit.id}/identification`)
      .then((r) => {
        if (cancelled) return;
        // 200 → check exists; 404 → not yet done. Anything else we
        // treat as "not done" so the nurse is forced through the
        // safety step rather than silently bypassed.
        setIdentified(r.ok);
      })
      .catch(() => {
        if (!cancelled) setIdentified(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visit.id]);

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
      fetch(`${API_BASE}/api/patients/${patient.id}/prn-orders`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_BASE}/api/visits/${visit.id}/head-to-toe`).then((r) =>
        r.ok ? r.json() : { assessment: null },
      ),
    ])
      .then(
        ([tasks, summary, prn, h2t]: [
          Array<{
            id: string;
            type: string;
            label: string;
            sublabel: string | null;
            scheduled_time: string;
            dose?: string | null;
            concentration?: string | null;
            route?: string | null;
            indication?: string | null;
            instructions?: string | null;
          }>,
          {
            vitals: { recorded_at?: string } | null;
            all_vitals?: Array<{ recorded_at: string }>;
            interventions: Array<{ name: string; recorded_at: string }>;
            medications: Array<{ name: string; given: boolean; reason_withheld?: string; administered_at?: string | null; recorded_at: string }>;
            narrative: { updated_at?: string } | null;
            suction_events?: SuctionEvent[];
          },
          PrnOrder[],
          { assessment: { completed_at?: string; systems?: Record<string, { wdl: boolean; exceptions: string[] }> } | null },
        ]) => {
          const h2tDone = !!h2t.assessment;
          const h2tCompletedAt = h2t.assessment?.completed_at;
          const h2tExceptions = h2t.assessment?.systems
            ? Object.values(h2t.assessment.systems).filter((s) => !s.wdl || (s.exceptions ?? []).length > 0).length
            : 0;
          setHeadToToeDone(h2tDone);
          setPrnOrders(prn);
          setLoggedMeds((summary.medications ?? []) as LoggedMed[]);
          setSuctionEvents(summary.suction_events ?? []);
          setSeizureEvents((summary as { seizure_events?: SeizureEvent[] }).seizure_events ?? []);
          const isSuctionLabel = (label: string) => /suction/i.test(label);

          const quickActionsForTask = (
            type: string,
            label: string,
          ): ScheduleItem['quickActions'] => {
            // Suctioning is structurally an intervention but has its own
            // form (route, amount, color, consistency, count). Detect by
            // label so a single override covers nasal/oral/trach variants.
            if (type === 'intervention' && isSuctionLabel(label)) {
              return [
                { label: 'Log suction', value: 'log_suction', variant: 'primary' },
                { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
              ];
            }
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
                  { label: 'Change Order', value: 'change_order', variant: 'secondary' },
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
              case 'head_to_toe':
                return [
                  { label: 'Start assessment', value: 'do_head_to_toe', variant: 'primary' },
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
            } else if (t.type === 'head_to_toe' && h2tDone) {
              status = 'completed';
              completedAction = h2tExceptions === 0 ? 'all WDL' : `${h2tExceptions} flagged`;
              completedAt = formatTime(h2tCompletedAt);
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
              quickActions: quickActionsForTask(t.type, t.label),
              completedAt,
              completedAction,
              dose: t.dose ?? null,
              concentration: t.concentration ?? null,
              route: t.route ?? null,
              indication: t.indication ?? null,
              instructions: t.instructions ?? null,
            };
          });

          setScheduleItems(items);
        },
      )
      .catch(() => {});
  }, [visit.id, patient.id]);

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

        // Prefer the actual administration time the agent passed in, when
        // present and well-formed (HH:MM or ISO). Falls back to now() only
        // when the tool-call did not carry a time — e.g. vitals, narrative.
        const completedAt = formatCompletedAt(tool, input);

        const updated = [...prev];
        updated[matchIdx] = {
          ...updated[matchIdx],
          status: tool === 'log_medication' && input.given === false ? 'skipped' : 'completed',
          completedAt,
          completedAction,
        };
        return updated;
      });
    });
  }, [onToolCall]);

  // Quick action tapped on schedule → open the form in the chat.
  // Identification check is the regulatory gate: until it's done, no
  // task may be marked. The modal already blocks the schedule visually
  // but we guard here too so a stale event can't sneak through.
  const handleQuickAction = useCallback(
    (item: ScheduleItem, actionValue: string) => {
      if (identified !== true) return;
      setActiveForm({ item, actionValue });
    },
    [identified],
  );

  // Initial change-orders fetch + when patient changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/patients/${patient.id}/change-orders`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (!cancelled && Array.isArray(rows)) setPatientChangeOrders(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [patient.id]);

  // "+ New change order" entry point — opens the form with no existing
  // schedule item attached, requiring the nurse to name the medication.
  const handleNewChangeOrder = useCallback(() => {
    if (identified !== true) return;
    const synthetic: ScheduleItem = {
      id: 'new-change-order',
      type: 'medication',
      status: 'pending',
      scheduledTime: '',
      label: '',
      sublabel: '',
      quickActions: [],
    };
    setActiveForm({ item: synthetic, actionValue: 'change_order_new' });
  }, [identified]);

  // Quick-log strip → synthesize a stand-in ScheduleItem so the existing
  // chat form pipeline renders the suction / seizure form without a
  // real scheduled task row backing it. Mid-shift events (a fresh
  // suction surge, a breakthrough seizure) don't have a slot on the
  // calendar — these buttons are the entry point.
  const handleQuickLog = useCallback(
    (kind: 'suction' | 'seizure') => {
      if (identified !== true) return;
      const isSuction = kind === 'suction';
      const synthetic: ScheduleItem = {
        id: isSuction ? 'quick-log-suction' : 'quick-log-seizure',
        type: isSuction ? 'intervention' : 'intervention',
        status: 'pending',
        scheduledTime: '',
        label: isSuction ? 'Suction event' : 'Seizure event',
        sublabel: 'Mid-shift quick log',
        quickActions: [],
      };
      setActiveForm({
        item: synthetic,
        actionValue: isSuction ? 'log_suction' : 'log_seizure',
      });
    },
    [identified],
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
      } else if (action === 'record_vitals' || !action) {
        completedAction = 'recorded';
      } else if (action === 'intervention_done') {
        completedAction = 'done';
      } else if (action === 'write_narrative') {
        completedAction = 'done';
      } else if (action === 'head_to_toe_logged') {
        const exc = parseInt(data.exceptions ?? '0', 10);
        completedAction = exc === 0 ? 'all WDL' : `${exc} flagged`;
      } else if (action === 'seizure_logged') {
        completedAction = 'seizure logged';
      } else if (action === 'change_order_submitted') {
        completedAction = 'change order submitted';
      }

      // Save directly to DB (don't rely on agent calling the tool).
      // Head-to-toe, seizure, and change orders own their own POST
      // inside the form so we don't double-write here.
      if (
        action !== 'head_to_toe_logged' &&
        action !== 'seizure_logged' &&
        action !== 'change_order_submitted'
      ) {
        saveFormToDb(item, data, visit.id);
      }

      // Suction is high-frequency: keep the schedule item available for
      // re-submission instead of marking it completed after one entry.
      // We bump a counter on the item itself so the card can show
      // "3 logged" rather than a green check.
      const isSuction = action === 'suction_logged';

      // Change orders are different: the schedule card stays pending
      // but flips to the NEW dose/route/frequency so the nurse can
      // document against the new order immediately. Discontinue marks
      // it completed (with action='discontinued') so it no longer
      // appears in the active queue. "Add new" injects a fresh row.
      if (action === 'change_order_submitted') {
        const ct = data.change_type;
        setScheduleItems((prev) => {
          if (ct === 'add') {
            const newId = `pending-change-${Date.now()}`;
            return [
              ...prev,
              {
                id: newId,
                type: 'medication',
                status: 'pending',
                scheduledTime: '08:00',
                label: data.medication_name,
                sublabel: data.new_frequency || 'Pending signature',
                quickActions: [
                  { label: 'Yes, given', value: 'med_given', variant: 'primary' },
                  { label: 'Skipped',    value: 'med_skipped', variant: 'secondary' },
                  { label: 'Change Order', value: 'change_order', variant: 'secondary' },
                ],
                dose: data.new_dose || null,
                route: data.new_route || null,
              },
            ];
          }
          return prev.map((si) => {
            if (si.id !== item.id) return si;
            if (ct === 'discontinue') {
              return {
                ...si,
                status: 'skipped',
                completedAt: new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit', minute: '2-digit', hour12: false,
                }),
                completedAction: 'discontinued',
              };
            }
            return {
              ...si,
              status: 'pending',
              dose:     ct === 'modify_dose'      && data.new_dose  ? data.new_dose  : si.dose,
              route:    ct === 'modify_route'     && data.new_route ? data.new_route : si.route,
              sublabel: ct === 'modify_frequency' && data.new_frequency ? data.new_frequency : si.sublabel,
            };
          });
        });
        // Refresh the change-order list so the patient sidebar updates.
        fetch(`${API_BASE}/api/patients/${patient.id}/change-orders`)
          .then((r) => (r.ok ? r.json() : null))
          .then((rows) => { if (rows) setPatientChangeOrders(rows); })
          .catch(() => {});
        return;
      }

      setScheduleItems((prev) =>
        prev.map((si) =>
          si.id === item.id
            ? isSuction
              ? {
                  ...si,
                  // Stay pending so the quick action remains; the badge
                  // count is computed downstream from suctionEvents.
                  status: 'pending',
                }
              : {
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

      // After any save, refresh the per-visit summary so dependent UI
      // (PRN "last given today" hint, suction-log entries, completed
      // counts) reflects the new state without waiting for the chat
      // round-trip. Without this the PRN tab silently shows stale data.
      const isMedAction = action === 'med_given';
      if (isSuction || isMedAction) {
        fetch(`${API_BASE}/api/visits/${visit.id}/summary`)
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => {
            if (!s) return;
            if (s.suction_events) setSuctionEvents(s.suction_events);
            if (s.medications) setLoggedMeds(s.medications);
            if ((s as { seizure_events?: SeizureEvent[] }).seizure_events) {
              setSeizureEvents((s as { seizure_events?: SeizureEvent[] }).seizure_events ?? []);
            }
          })
          .catch(() => {});
      }

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
      {/* Regulatory ID gate. Renders on top of the visit page until the
          nurse confirms 2+ identifiers. We don't render an empty
          placeholder while loading — let the visit show through so the
          modal flash matches what the nurse expects after the check. */}
      {identified === false && (
        <PatientIdentificationStep
          patient={patient}
          visitId={visit.id}
          onConfirmed={() => setIdentified(true)}
        />
      )}

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
            disabled={!headToToeDone}
            title={
              headToToeDone
                ? 'Export visit to Excel'
                : 'Complete the head-to-toe assessment before signing off'
            }
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
              headToToeDone
                ? 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                : 'cursor-not-allowed border-gray-100 text-gray-300'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export
          </button>
        </div>
      </div>

      <LastShiftHighlights
        patientId={patient.id}
        visitId={visit.id}
        patientFirstName={patient.full_name.split(' ')[0]}
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <VisitSchedule
          patient={patient}
          items={scheduleItems}
          prnOrders={prnOrders}
          loggedMeds={loggedMeds}
          suctionEvents={suctionEvents}
          seizureCount={seizureEvents.length}
          pendingChangeOrders={patientChangeOrders.filter((c) => c.status === 'pending_signature').length}
          headToToeDone={headToToeDone}
          onQuickAction={handleQuickAction}
          onQuickLog={handleQuickLog}
          onNewChangeOrder={handleNewChangeOrder}
        />
        <ChatPanel
          patientId={patient.id}
          visitId={visit.id}
          messages={messages}
          isStreaming={isStreaming}
          activeToolCall={activeToolCall}
          activeForm={activeForm}
          lastLoadedMsgId={lastLoadedMsgId}
          onSendMessage={onSendMessage}
          onFormSubmit={handleFormSubmit}
          onFormCancel={handleFormCancel}
        />
      </div>

      {/* ── Persistent close-out footer ──
          Always visible at the bottom of the visit page. Surfaces the
          full check-in gate (Patient ID + head-to-toe + baseline
          vitals) so the nurse always knows what's blocking sign-off,
          plus overall progress and the Close-out button. */}
      {(() => {
        const baselineVitals = scheduleItems
          .filter((i) => i.type === 'vitals')
          .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))[0];
        const baselineVitalsDone = baselineVitals?.status === 'completed';
        const canCloseOut = identified === true && headToToeDone && baselineVitalsDone;
        const blockers: string[] = [];
        if (identified !== true) blockers.push('Patient ID');
        if (!headToToeDone)      blockers.push('Head-to-toe');
        if (!baselineVitalsDone) blockers.push('Baseline vitals');
        return (
          <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-white px-6 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-xs font-semibold tabular-nums text-gray-700">
                {completedCount}/{totalItems} complete
              </span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {!canCloseOut && (
                <span className="truncate text-[11px] text-gray-500">
                  Waiting on: {blockers.join(' · ')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={!canCloseOut}
              title={canCloseOut ? 'Export and close out the visit' : `Complete ${blockers.join(', ')} before sign-off`}
              className={`min-h-11 shrink-0 rounded-lg px-5 py-2 text-sm font-semibold transition-colors ${
                canCloseOut
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'cursor-not-allowed bg-gray-200 text-gray-400'
              }`}
            >
              Close out visit
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// Resolve the time to display on the schedule item when a tool fires.
// log_medication uses administered_at; log_vitals and log_intervention
// use occurred_at. We honor whichever the agent supplied so the panel
// matches what was stored. Anything else (or a malformed value) falls
// back to the current local time.
function formatCompletedAt(tool: string, input: Record<string, unknown>): string {
  const timeKey =
    tool === 'log_medication' ? 'administered_at' :
    (tool === 'log_vitals' || tool === 'log_intervention') ? 'occurred_at' :
    null;

  if (timeKey && typeof input[timeKey] === 'string') {
    const raw = (input[timeKey] as string).trim();
    const hhmm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
    if (hhmm) {
      const h = Number(hhmm[1]);
      const m = Number(hhmm[2]);
      if (h <= 23 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    }
  }
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
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
    if (data.occurred_at) body.occurred_at = data.occurred_at;
    fetch(`${base}/vitals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => console.error('[save vitals]', e));
  }

  if (item.type === 'medication') {
    const action = data.action ?? '';
    const given = action !== 'med_skipped';
    // PRN orders synthesized in the in-visit PRN tab carry their dose and
    // route on the item itself, so we read them straight from there — the
    // give/skip flow no longer accepts nurse-entered dose/route edits
    // (those go through the KanTime Change Order workflow).
    const body: Record<string, unknown> = {
      name: item.label,
      given,
    };
    if (item.dose) body.dose = item.dose;
    if (item.route) body.route = item.route;
    if (data.reason) body.reason_withheld = data.reason;
    if (data.notes) body.dose = (body.dose ?? '') + (data.notes ? ` (${data.notes})` : '');
    // Administered time only applies when the dose was actually given. The
    // form requires it; backend tolerates HH:MM or ISO and stores it
    // explicitly instead of falling back to now().
    if (given && data.administered_at) body.administered_at = data.administered_at;
    fetch(`${base}/medications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => console.error('[save medication]', e));
  }

  if (item.type === 'intervention') {
    const action = data.action ?? '';
    // Suction events go to a different table and route — handled below.
    if (action === 'suction_logged') {
      const body: Record<string, unknown> = {
        route: data.route,
        occurred_at: data.occurred_at,
        count: data.count ? Number(data.count) : 1,
      };
      if (data.amount) body.amount = data.amount;
      if (data.color) body.color = data.color;
      if (data.consistency) body.consistency = data.consistency;
      if (data.notes) body.notes = data.notes;
      fetch(`${base}/suction-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((e) => console.error('[save suction]', e));
    } else if (action !== 'intervention_skip') {
      const body: Record<string, unknown> = {
        name: item.label,
      };
      if (data.outcome) body.outcome = data.outcome;
      if (data.notes) body.description = data.notes;
      if (data.reason) body.description = data.reason;
      if (data.occurred_at) body.occurred_at = data.occurred_at;
      fetch(`${base}/interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch((e) => console.error('[save intervention]', e));
    } else {
      // intervention_skip — no DB write today (skipped is UI-only state
      // for non-suction interventions). Left explicit for future
      // reasons-for-skipping audit trails.
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
    if (data.occurred_at) msg += ` (taken at ${data.occurred_at})`;
    if (data.notes) msg += `. Notes: ${data.notes}`;
    return msg;
  }

  if (action === 'skipped' || action === 'med_skipped' || action === 'intervention_skip') {
    return `Skipped ${item.label}. Reason: ${data.reason || 'not specified'}`;
  }

  if (action === 'med_given') {
    let msg = `${item.label} — given`;
    if (data.administered_at) msg += ` at ${data.administered_at}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  if (action === 'intervention_done') {
    let msg = `${item.label} — completed`;
    if (data.occurred_at) msg += ` at ${data.occurred_at}`;
    if (data.outcome) msg += `. Outcome: ${data.outcome}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  if (action === 'suction_logged') {
    const count = data.count && Number(data.count) > 1 ? `${data.count} passes` : '1 pass';
    const parts: string[] = [count, `${data.route} suction`];
    if (data.amount) parts.push(`amount: ${data.amount.toLowerCase()}`);
    if (data.color) parts.push(`color: ${data.color.toLowerCase()}`);
    if (data.consistency) parts.push(`consistency: ${data.consistency.toLowerCase()}`);
    let msg = `Suction logged at ${data.occurred_at}: ${parts.join(', ')}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg;
  }

  if (action === 'write_narrative') {
    let msg = `Visit narrative: ${data.content}`;
    if (data.patient_tolerated === 'yes') msg += ' Patient tolerated visit well.';
    if (data.patient_tolerated === 'no') msg += ' Patient did not tolerate visit well.';
    return msg;
  }

  if (action === 'change_order_submitted') {
    const ct = data.change_type;
    const diff: string[] = [];
    if (data.new_dose)      diff.push(`dose: ${data.new_dose}`);
    if (data.new_route)     diff.push(`route: ${data.new_route}`);
    if (data.new_frequency) diff.push(`frequency: ${data.new_frequency}`);
    const verb =
      ct === 'discontinue'      ? 'discontinued' :
      ct === 'add'              ? 'added' :
      ct === 'modify_dose'      ? 'dose modified' :
      ct === 'modify_route'     ? 'route modified' :
      ct === 'modify_frequency' ? 'frequency modified' : 'changed';
    let src = '';
    if (data.source_type === 'verbal' && data.source_physician) {
      const at = data.source_obtained_at ? new Date(data.source_obtained_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      src = ` Verbal from ${data.source_physician}${at ? ` at ${at}` : ''}.`;
    } else if (data.source_type === 'pharmacy_label') {
      src = ' Source: pharmacy label.';
    } else if (data.source_type === 'written_note') {
      src = ' Source: written note from office visit.';
    }
    const detail = diff.length > 0 ? ` New ${diff.join(', ')}.` : '';
    return `Change order submitted for ${data.medication_name} — ${verb}.${detail}${src} Pending physician signature.`;
  }

  if (action === 'seizure_logged') {
    const secs = parseInt(data.duration_seconds ?? '0', 10);
    const dur = secs > 0
      ? secs >= 60
        ? `${Math.floor(secs / 60)}m ${secs % 60}s`
        : `${secs}s`
      : 'duration not noted';
    const parts: string[] = [];
    if (data.seizure_type) parts.push(`type: ${data.seizure_type.toLowerCase()}`);
    parts.push(`duration: ${dur}`);
    if (data.loc) parts.push(`LOC: ${data.loc}`);
    if (data.intervention) parts.push(`intervention: ${data.intervention}`);
    let msg = `Seizure event at ${data.occurred_at} — ${parts.join(', ')}`;
    if (data.notes) msg += `. ${data.notes}`;
    return msg + '.';
  }

  if (action === 'head_to_toe_logged') {
    const exc = parseInt(data.exceptions ?? '0', 10);
    if (exc === 0) {
      return 'Head-to-toe assessment done — all 12 systems WDL, no exceptions.';
    }
    const flagged = (data.flagged ?? '').split(' | ').filter(Boolean);
    const heading = `Head-to-toe assessment done — ${exc} system${exc === 1 ? '' : 's'} flagged.`;
    const detail = flagged.length > 0 ? ` Findings: ${flagged.join('; ')}.` : '';
    const note = data.summary_notes ? ` Note: ${data.summary_notes}.` : '';
    return `${heading}${detail}${note}`;
  }

  return `${item.label} — ${action || 'completed'}`;
}
