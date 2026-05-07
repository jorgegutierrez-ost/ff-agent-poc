import { useEffect, useMemo, useState } from 'react';
import type { Patient, Visit } from '../types';
import { API_BASE } from './../config';
import { fuzzyMatch } from '../lib/medicationMatch';
import { CARE_NOTES } from '../lib/careNotes';

interface PatientDetailSidebarProps {
  patient: Patient;
  visit: Visit;
  visits: Visit[];
  onClose: () => void;
  onBeginVisit: (patientId: string) => void;
}

interface ScheduledTask {
  id: string;
  type: 'medication' | 'intervention' | 'vitals' | 'narrative';
  label: string;
  sublabel: string | null;
  scheduled_time: string;
  // Medication-only structured fields. Null on non-med tasks.
  dose?: string | null;
  concentration?: string | null;
  route?: string | null;
  indication?: string | null;
  instructions?: string | null;
}

interface LoggedMedication {
  id: string;
  name: string;
  dose?: string;
  route?: string;
  given: boolean;
  reason_withheld?: string;
  administered_at?: string | null;
  recorded_at: string;
}

interface PrnOrder {
  id: string;
  medication: string;
  dose: string;
  route: string;
  indication: string;
  max_frequency_hours: number | null;
  notes: string | null;
}

type MedicationStatus = 'given' | 'withheld' | 'pending';

interface MedicationRow {
  id: string;
  time: string; // HH:MM
  label: string;        // drug name only — e.g. "Ranitidine"
  frequency: string;    // e.g. "Twice daily" (was sublabel)
  dose: string | null;
  concentration: string | null;
  route: string | null;
  indication: string | null;
  instructions: string | null;
  status: MedicationStatus;
  reasonWithheld?: string;
  // When status === 'given', the actual administration time the nurse
  // recorded (HH:MM, today's local time). Falls back to recorded_at if
  // administered_at is null on legacy rows.
  lastGivenAt?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatAge(patient: Patient): string {
  if (patient.age_months != null && patient.age_months > 0 && patient.age_months < 12) {
    return `${patient.age_months} months old`;
  }
  if (patient.age_months != null && patient.age_months >= 12) {
    return `${Math.floor(patient.age_months / 12)} years old`;
  }
  if (patient.age_years != null) {
    return `${patient.age_years} years old`;
  }
  return '';
}

function getFirstName(name: string): string {
  return name.split(' ')[0];
}

function parseDate(dateStr: string): Date {
  const s = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
  return new Date(s);
}

function isOlderThan7Days(dateStr: string): boolean {
  const d = parseDate(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs > 7 * 24 * 60 * 60 * 1000;
}

function to12h(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function timeRange(start: string, end: string): string {
  return `${to12h(start)} – ${to12h(end)}`;
}

export default function PatientDetailSidebar({
  patient,
  visit,
  visits,
  onClose,
  onBeginVisit,
}: PatientDetailSidebarProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loggedMeds, setLoggedMeds] = useState<LoggedMedication[]>([]);
  const [loggedInterventions, setLoggedInterventions] = useState<
    Array<{ id: string; name: string; recorded_at: string; occurred_at?: string | null }>
  >([]);
  const [hasVitals, setHasVitals] = useState(false);
  const [hasNarrative, setHasNarrative] = useState(false);
  const [prnOrders, setPrnOrders] = useState<PrnOrder[]>([]);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [prnExpanded, setPrnExpanded] = useState(false);
  // Optimistic completion tracking — tap-to-complete adds the task ID
  // here immediately so the UI reflects the change before the POST resolves.
  // Reverted on failure.
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API_BASE}/api/visits/${visit.id}/schedule`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_BASE}/api/visits/${visit.id}/summary`).then((r) =>
        r.ok ? r.json() : { medications: [], interventions: [], all_vitals: [], narrative: null },
      ),
      fetch(`${API_BASE}/api/patients/${patient.id}/prn-orders`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([schedule, summary, prn]) => {
        if (cancelled) return;
        setTasks(schedule as ScheduledTask[]);
        setLoggedMeds((summary?.medications ?? []) as LoggedMedication[]);
        setLoggedInterventions(summary?.interventions ?? []);
        setHasVitals((summary?.all_vitals ?? []).length > 0);
        setHasNarrative(summary?.narrative != null);
        setPrnOrders(prn as PrnOrder[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visit.id, patient.id]);

  // ── Derived values ──────────────────────────────────────────────────────
  const totalTasks = tasks.length;

  // Match each scheduled medication against the logged ones (fuzzy name match,
  // consume each logged entry only once).
  const medications: MedicationRow[] = useMemo(() => {
    const scheduled = tasks
      .filter((t) => t.type === 'medication')
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));

    const pool = [...loggedMeds];
    return scheduled.map((t) => {
      const matchIdx = pool.findIndex((m) => fuzzyMatch(t.label, m.name));
      const match = matchIdx >= 0 ? pool.splice(matchIdx, 1)[0] : null;

      let status: MedicationStatus = 'pending';
      if (match) status = match.given ? 'given' : 'withheld';

      // Prefer the explicit administered_at the nurse entered; only fall
      // back to recorded_at if a legacy row pre-dates that field.
      let lastGivenAt: string | undefined;
      if (match && match.given) {
        const src = match.administered_at ?? match.recorded_at;
        if (src) {
          const d = new Date(src);
          if (!Number.isNaN(d.getTime())) {
            lastGivenAt = d.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          }
        }
      }

      return {
        id: t.id,
        time: t.scheduled_time.slice(0, 5),
        label: t.label,
        frequency: t.sublabel ?? '',
        dose: t.dose ?? null,
        concentration: t.concentration ?? null,
        route: t.route ?? null,
        indication: t.indication ?? null,
        instructions: t.instructions ?? null,
        status,
        reasonWithheld: match && !match.given ? match.reason_withheld : undefined,
        lastGivenAt,
      };
    });
  }, [tasks, loggedMeds]);

  // ── Unified task list (Today's tasks checklist) ─────────────────────
  type TaskStatus = 'pending' | 'completed' | 'withheld';
  interface TaskRow {
    id: string;
    type: 'medication' | 'intervention' | 'vitals' | 'narrative';
    time: string;            // HH:MM
    label: string;
    sublabel: string;
    status: TaskStatus;
    completedAt?: string;    // HH:MM when status === 'completed'
    reasonWithheld?: string;
    dose?: string | null;
    route?: string | null;
  }

  function formatHHMM(src: string | null | undefined): string | undefined {
    if (!src) return undefined;
    const d = new Date(src);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  const taskRows: TaskRow[] = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    const medPool = [...loggedMeds];
    const intPool = [...loggedInterventions];
    let vitalsConsumed = 0;
    let narrativeConsumed = false;
    const totalVitalsTasks = sorted.filter((t) => t.type === 'vitals').length;
    const seededVitals = hasVitals;

    return sorted.map((t) => {
      let status: TaskStatus = 'pending';
      let completedAt: string | undefined;
      let reasonWithheld: string | undefined;

      if (localCompleted.has(t.id)) {
        status = 'completed';
        completedAt = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
      } else if (t.type === 'medication') {
        const idx = medPool.findIndex((m) => fuzzyMatch(t.label, m.name));
        const match = idx >= 0 ? medPool.splice(idx, 1)[0] : null;
        if (match) {
          if (match.given) {
            status = 'completed';
            completedAt = formatHHMM(match.administered_at ?? match.recorded_at);
          } else {
            status = 'withheld';
            reasonWithheld = match.reason_withheld;
          }
        }
      } else if (t.type === 'intervention') {
        const idx = intPool.findIndex((i) => fuzzyMatch(t.label, i.name));
        const match = idx >= 0 ? intPool.splice(idx, 1)[0] : null;
        if (match) {
          status = 'completed';
          completedAt = formatHHMM(match.occurred_at ?? match.recorded_at);
        }
      } else if (t.type === 'vitals') {
        // Fold the count of vitals rows across vitals tasks. If we have
        // fewer rows than vitals tasks, the earliest tasks are marked
        // complete first.
        if (seededVitals && vitalsConsumed < totalVitalsTasks) {
          status = 'completed';
          vitalsConsumed += 1;
        }
      } else if (t.type === 'narrative') {
        if (hasNarrative && !narrativeConsumed) {
          status = 'completed';
          narrativeConsumed = true;
        }
      }

      return {
        id: t.id,
        type: t.type,
        time: t.scheduled_time.slice(0, 5),
        label: t.label,
        sublabel: t.sublabel ?? '',
        status, completedAt, reasonWithheld,
        dose: t.dose ?? null,
        route: t.route ?? null,
      };
    });
  }, [tasks, loggedMeds, loggedInterventions, hasVitals, hasNarrative, localCompleted]);

  const totalCount = taskRows.length;
  const completedCount = taskRows.filter((t) => t.status !== 'pending').length;
  const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Tap handler — meds + interventions write directly via the existing form
  // endpoints. Vitals + narrative bounce to the live visit because they
  // require values the dashboard doesn't capture.
  async function handleTaskTap(t: TaskRow) {
    if (t.status !== 'pending') return;
    if (t.type === 'vitals' || t.type === 'narrative') {
      onBeginVisit(patient.id);
      return;
    }

    setLocalCompleted((prev) => {
      const next = new Set(prev);
      next.add(t.id);
      return next;
    });

    const nowIso = new Date().toISOString();
    try {
      const url = t.type === 'medication'
        ? `${API_BASE}/api/visits/${visit.id}/medications`
        : `${API_BASE}/api/visits/${visit.id}/interventions`;
      const body = t.type === 'medication'
        ? { name: t.label, dose: t.dose, route: t.route, given: true, administered_at: nowIso }
        : { name: t.label, occurred_at: nowIso };
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('save failed');
    } catch {
      setLocalCompleted((prev) => {
        const next = new Set(prev);
        next.delete(t.id);
        return next;
      });
    }
  }

  // Overdue = pending meds whose scheduled time is in the past (only while
  // the visit is actively in progress).
  const overdueMedsCount = useMemo(() => {
    if (visit.status !== 'in_progress') return 0;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return medications.filter((m) => {
      if (m.status !== 'pending') return false;
      const [h, mm] = m.time.split(':').map(Number);
      return h * 60 + mm < nowMinutes;
    }).length;
  }, [medications, visit.status]);

  // Other visits on the nurse's roster for the PREV / CURRENT / NEXT strip
  const sortedVisits = useMemo(
    () => [...visits].sort((a, b) => a.planned_start_time.localeCompare(b.planned_start_time)),
    [visits],
  );
  const currentIdx = sortedVisits.findIndex((v) => v.id === visit.id);
  const prevVisit = currentIdx > 0 ? sortedVisits[currentIdx - 1] : null;
  const nextVisit =
    currentIdx >= 0 && currentIdx < sortedVisits.length - 1
      ? sortedVisits[currentIdx + 1]
      : null;

  // Build alerts list
  const realAllergies = patient.allergies.filter(
    (a) => !a.toLowerCase().includes('no known'),
  );
  const vitalsDateStale = isOlderThan7Days(patient.last_vitals_date);

  type Alert = { kind: 'allergy' | 'cpr' | 'vitals'; severity: 'red' | 'amber'; title: string; body: string };
  const alerts: Alert[] = [];
  realAllergies.forEach((a) => {
    alerts.push({
      kind: 'allergy',
      severity: 'red',
      title: 'Allergy',
      body: `${a} allergy – Anaphylaxis risk. Verify all medications.`,
    });
  });
  if (patient.cpr_code === 'DNR') {
    alerts.push({
      kind: 'cpr',
      severity: 'red',
      title: 'DNR',
      body: 'Do Not Resuscitate on file. Confirm with family before any resuscitative measures.',
    });
  }
  if (vitalsDateStale) {
    alerts.push({
      kind: 'vitals',
      severity: 'amber',
      title: 'Vital signs',
      body: `Last vitals recorded more than 7 days ago (${patient.last_weight_lbs} lbs). Recheck before meds.`,
    });
  }

  // CTA label based on visit status
  let ctaLabel: string;
  let ctaDisabled = false;
  if (visit.status === 'completed') {
    ctaLabel = 'View completed visit';
    ctaDisabled = true;
  } else if (visit.status === 'in_progress') {
    ctaLabel = `Continue visit with ${getFirstName(patient.full_name)}`;
  } else {
    ctaLabel = `Begin visit with ${getFirstName(patient.full_name)}`;
  }

  const careNote = CARE_NOTES[patient.id];

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-gray-200 bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        {/* ── Back link ── */}
        <div className="px-6 pt-5">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
            Back to list
          </button>
        </div>

        {/* ── 1. Header ── */}
        <div className="flex items-center gap-4 px-6 pt-5 pb-4">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl bg-indigo-400 text-base font-semibold text-white">
            {getInitials(patient.full_name)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {patient.full_name}
            </h2>
            <p className="text-sm text-gray-500">
              {formatAge(patient)} &middot; ID {patient.kantime_patient_id}
            </p>
          </div>
        </div>

        {/* ── 2. CTA Button ── */}
        <div className="px-6 pb-5">
          <button
            onClick={() => onBeginVisit(patient.id)}
            disabled={ctaDisabled}
            className={`flex w-full items-center justify-between rounded-2xl px-6 py-4 text-sm font-semibold transition-colors ${
              ctaDisabled
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            <span className="flex-1 text-center">{ctaLabel}</span>
            {!ctaDisabled && (
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            )}
          </button>
        </div>

        {/* ── 3. Your Shift card ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Your Shift
          </h3>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span className="text-sm font-semibold text-gray-900">
                {timeRange(visit.planned_start_time, visit.planned_end_time)}
              </span>
            </div>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              {totalTasks} task{totalTasks === 1 ? '' : 's'} assigned to your shift
            </p>

            {/* 3-step PREV / CURRENT / NEXT */}
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              <div
                className={`h-1 rounded-full ${prevVisit ? 'bg-gray-300' : 'bg-gray-200'}`}
              />
              <div className="h-1 rounded-full bg-indigo-500" />
              <div
                className={`h-1 rounded-full ${nextVisit ? 'bg-gray-300' : 'bg-gray-200'}`}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div>
                <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
                  Previous
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                  {prevVisit ? to12h(prevVisit.planned_start_time) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wider text-indigo-600 uppercase">
                  Current
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-gray-900">
                  {timeRange(visit.planned_start_time, visit.planned_end_time)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
                  Next
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                  {nextVisit ? to12h(nextVisit.planned_start_time) : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Emergency Contact card ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Emergency Contact
          </h3>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">
              {patient.emergency_contact_name}
            </p>
            <p className="text-xs text-gray-500">
              {patient.emergency_contact_relation}
            </p>
            <a
              href={`tel:${patient.emergency_contact_phone}`}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                />
              </svg>
              {patient.emergency_contact_phone}
            </a>
          </div>
        </div>

        {/* ── 5. Overdue medication banner ── */}
        {overdueMedsCount > 0 && (
          <div className="px-6 pb-4">
            <button className="flex w-full items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 transition-colors hover:bg-red-100">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 shrink-0 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
                <span className="text-sm font-semibold text-red-700">
                  {overdueMedsCount} overdue medication
                  {overdueMedsCount === 1 ? '' : 's'}
                </span>
              </div>
              <svg
                className="h-4 w-4 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          </div>
        )}

        {/* ── 6. Active Alerts ── */}
        {alerts.length > 0 && (
          <div className="px-6 pb-4">
            <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
              Active Alerts ({alerts.length})
            </h3>
            <div className="space-y-2">
              {alerts.map((a, i) => {
                const isRed = a.severity === 'red';
                const bg = isRed ? 'bg-red-50' : 'bg-amber-50';
                const border = isRed ? 'border-red-200' : 'border-amber-200';
                const iconColor = isRed ? 'text-red-500' : 'text-amber-500';
                const titleColor = isRed ? 'text-red-700' : 'text-amber-700';
                const bodyColor = isRed ? 'text-red-800' : 'text-amber-800';

                return (
                  <div
                    key={i}
                    className={`rounded-2xl border ${border} ${bg} px-4 py-3`}
                  >
                    <div className="flex items-start gap-2">
                      <svg
                        className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                        />
                      </svg>
                      <div className="min-w-0">
                        <p
                          className={`text-[11px] font-bold tracking-widest uppercase ${titleColor}`}
                        >
                          {a.title}
                        </p>
                        <p className={`mt-1 text-sm ${bodyColor}`}>{a.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 7. Diagnosis ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Diagnosis
          </h3>
          <p className="text-sm text-gray-900">{patient.primary_diagnosis}</p>
        </div>

        {/* ── 8. Today's tasks (unified checklist with tap-to-complete) ── */}
        {totalCount > 0 && (
          <div className="px-6 pb-4">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setTasksExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
                aria-expanded={tasksExpanded}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">Today's tasks</span>
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">
                      {completedCount}/{totalCount}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${completedPct}%` }}
                    />
                  </div>
                </div>
                <svg
                  className={`ml-3 h-4 w-4 shrink-0 text-gray-400 transition-transform ${tasksExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {tasksExpanded && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {taskRows.map((t) => {
                    const isCompleted = t.status === 'completed';
                    const isWithheld = t.status === 'withheld';
                    const isOpenOnly = t.type === 'vitals' || t.type === 'narrative';
                    const isTappable = !isCompleted && !isWithheld;

                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => handleTaskTap(t)}
                          disabled={!isTappable}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                            isTappable ? 'hover:bg-gray-50' : 'cursor-default'
                          }`}
                        >
                          {/* Status icon — circle when pending, check when done */}
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                              isCompleted
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : isWithheld
                                  ? 'border-amber-500 bg-amber-50 text-amber-600'
                                  : 'border-gray-300 bg-white text-transparent group-hover:border-emerald-400'
                            }`}
                            aria-hidden
                          >
                            {(isCompleted || isWithheld) && (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={isWithheld ? 'M6 18 18 6M6 6l12 12' : 'm4.5 12.75 6 6 9-13.5'} />
                              </svg>
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-medium tabular-nums text-gray-500">
                                {to12h(t.time)}
                              </span>
                              <span className={`truncate text-sm font-medium ${isCompleted || isWithheld ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                {t.label}
                              </span>
                            </div>
                            {t.sublabel && (
                              <p className="mt-0.5 text-xs text-gray-400">{t.sublabel}</p>
                            )}
                            {isCompleted && t.completedAt && (
                              <p className="mt-0.5 text-xs text-emerald-600">
                                Done at {to12h(t.completedAt)}
                              </p>
                            )}
                            {isWithheld && t.reasonWithheld && (
                              <p className="mt-0.5 text-xs text-amber-700">
                                Withheld — {t.reasonWithheld}
                              </p>
                            )}
                          </div>

                          {/* Right edge affordance: arrow for vitals/narrative pending,
                              type label otherwise */}
                          {isOpenOnly && isTappable ? (
                            <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                          ) : (
                            <span className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 capitalize">
                              {t.type === 'medication' ? 'med' : t.type}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mt-2 px-1 text-[11px] text-gray-400">
              Tap a med or intervention to mark it done. Vitals and narrative open in the visit.
            </p>
          </div>
        )}

        {/* ── 9b. PRN orders (as-needed standing orders) ── */}
        {prnOrders.length > 0 && (
          <div className="px-6 pb-4">
            <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
              PRN orders available ({prnOrders.length})
            </h3>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setPrnExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
                aria-expanded={prnExpanded}
              >
                <div className="flex items-center gap-2">
                  <svg
                    className="h-4 w-4 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">
                    As-needed medications
                  </span>
                </div>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${prnExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m19.5 8.25-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>

              {prnExpanded && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {prnOrders.map((o) => (
                    <li key={o.id} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900">
                          {o.medication} {o.dose}
                        </span>
                        {o.max_frequency_hours != null && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            max q{o.max_frequency_hours}h
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{o.route}</p>
                      <p className="mt-1 text-xs text-gray-700">
                        <span className="font-medium text-gray-500">For: </span>
                        {o.indication}
                      </p>
                      {o.notes && (
                        <p className="mt-1 text-xs text-gray-500 italic">
                          {o.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── 10. Care Note ── */}
        {careNote && (
          <div className="px-6 pb-8">
            <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
              Care Note
            </h3>
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-sm leading-relaxed text-gray-600 italic">
                {careNote}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
