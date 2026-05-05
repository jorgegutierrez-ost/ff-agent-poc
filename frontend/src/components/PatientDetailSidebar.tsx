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
  const [prnOrders, setPrnOrders] = useState<PrnOrder[]>([]);
  const [medsExpanded, setMedsExpanded] = useState(false);
  const [prnExpanded, setPrnExpanded] = useState(false);
  // Per-card expand state for the medication detail panel. Stored as a Set
  // of scheduled-task IDs so multiple cards can be open at once.
  const [expandedMedCards, setExpandedMedCards] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleMedCard = (id: string) => {
    setExpandedMedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API_BASE}/api/visits/${visit.id}/schedule`).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_BASE}/api/visits/${visit.id}/summary`).then((r) =>
        r.ok ? r.json() : { medications: [] },
      ),
      fetch(`${API_BASE}/api/patients/${patient.id}/prn-orders`).then((r) =>
        r.ok ? r.json() : [],
      ),
    ])
      .then(([schedule, summary, prn]) => {
        if (cancelled) return;
        setTasks(schedule as ScheduledTask[]);
        setLoggedMeds((summary?.medications ?? []) as LoggedMedication[]);
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

  const totalMeds = medications.length;
  const medsCompleted = medications.filter(
    (m) => m.status === 'given' || m.status === 'withheld',
  ).length;
  const medsPct = totalMeds > 0 ? Math.round((medsCompleted / totalMeds) * 100) : 0;

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

        {/* ── 7. Medications completed ── */}
        {totalMeds > 0 && (
          <div className="px-6 pb-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
                  Medications Completed
                </h3>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">
                  {medsCompleted}/{totalMeds}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${medsPct}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs text-gray-500">
                {medsPct}% complete
              </p>
            </div>
          </div>
        )}

        {/* ── 8. Diagnosis ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Diagnosis
          </h3>
          <p className="text-sm text-gray-900">{patient.primary_diagnosis}</p>
        </div>

        {/* ── 9. All medications (expandable list) ── */}
        {totalMeds > 0 && (
          <div className="px-6 pb-4">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <button
                onClick={() => setMedsExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
                aria-expanded={medsExpanded}
              >
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
                      d="m13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                    />
                  </svg>
                  <span className="text-sm font-medium text-gray-900">
                    All medications
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {totalMeds}
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${medsExpanded ? 'rotate-180' : ''}`}
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
                </div>
              </button>

              {medsExpanded && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {medications.map((m) => {
                    const pill =
                      m.status === 'given'
                        ? { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Given' }
                        : m.status === 'withheld'
                          ? { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Withheld' }
                          : { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400', label: 'Pending' };

                    // Always-visible safety line: dose · concentration · route.
                    // Drop any piece that's null so we don't render trailing "·".
                    const doseLine = [m.dose, m.concentration, m.route]
                      .filter((p): p is string => Boolean(p))
                      .join(' · ');

                    const isOpen = expandedMedCards.has(m.id);
                    const allergies = patient.allergies.join(', ');

                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => toggleMedCard(m.id)}
                          aria-expanded={isOpen}
                          className="block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium tabular-nums text-gray-500">
                                  {to12h(m.time)}
                                </span>
                                <span className="text-sm font-semibold text-gray-900">
                                  {m.label}
                                </span>
                              </div>

                              {/* Safety line — six fields visible without click */}
                              {doseLine && (
                                <p className="mt-0.5 text-xs text-gray-700">
                                  {doseLine}
                                </p>
                              )}
                              {(m.indication || m.frequency) && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {m.indication ? `For: ${m.indication}` : ''}
                                  {m.indication && m.frequency ? ' · ' : ''}
                                  {m.frequency}
                                </p>
                              )}

                              {m.status === 'withheld' && m.reasonWithheld && (
                                <p className="mt-1 text-xs text-amber-700">
                                  Withheld: {m.reasonWithheld}
                                </p>
                              )}
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <div
                                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.bg} ${pill.text}`}
                              >
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${pill.dot}`}
                                />
                                {pill.label}
                              </div>
                              <svg
                                className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs">
                            <dt className="text-gray-500">Instructions</dt>
                            <dd className="text-gray-900">
                              {m.instructions ?? (
                                <span className="text-gray-400 italic">
                                  None on file
                                </span>
                              )}
                            </dd>

                            <dt className="text-gray-500">Last given</dt>
                            <dd className="text-gray-900 tabular-nums">
                              {m.lastGivenAt ? to12h(m.lastGivenAt) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </dd>

                            <dt className="text-gray-500">Allergies</dt>
                            <dd className="text-gray-900">{allergies}</dd>

                            <dt className="text-gray-500">Order source</dt>
                            <dd className="text-gray-900">Scheduled (KanTime)</dd>
                          </dl>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
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
