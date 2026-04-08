import type { Patient, Visit } from '../types';

interface PatientDetailSidebarProps {
  patient: Patient;
  visit: Visit;
  onClose: () => void;
  onBeginVisit: (patientId: string) => void;
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
    return `${patient.age_months} months`;
  }
  if (patient.age_months != null && patient.age_months >= 12) {
    return `${Math.floor(patient.age_months / 12)} years`;
  }
  if (patient.age_years != null) {
    return `${patient.age_years} years`;
  }
  return '';
}

function getFirstName(name: string): string {
  return name.split(' ')[0];
}

function parseDate(dateStr: string): Date {
  // Handle both "2026-04-01" and "2026-04-01T00:00:00.000Z"
  const s = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00';
  return new Date(s);
}

function formatShortDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOlderThan7Days(dateStr: string): boolean {
  const d = parseDate(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs > 7 * 24 * 60 * 60 * 1000;
}

export default function PatientDetailSidebar({
  patient,
  visit,
  onClose,
  onBeginVisit,
}: PatientDetailSidebarProps) {
  const noKnownAllergies = patient.allergies.some((a) =>
    a.toLowerCase().includes('no known'),
  );
  const vitalsDateStale = isOlderThan7Days(patient.last_vitals_date);

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

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white">
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
        <div className="flex items-center gap-4 px-6 pt-5 pb-5">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-base font-semibold text-indigo-700">
            {getInitials(patient.full_name)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {patient.full_name}
            </h2>
            <p className="text-sm text-gray-500">
              {formatAge(patient)} &middot; {patient.kantime_patient_id}
            </p>
          </div>
        </div>

        {/* ── 2. CTA Button ── */}
        <div className="px-6 pb-5">
          <button
            onClick={() => onBeginVisit(patient.id)}
            disabled={ctaDisabled}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-colors ${
              ctaDisabled
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {ctaLabel}
            {!ctaDisabled && (
              <svg
                className="h-4 w-4"
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

        {/* ── 3. CPR Status Alert ── */}
        <div className="px-6 pb-4">
          {patient.cpr_code === 'DNR' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
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
                <span className="text-sm font-bold text-red-700">
                  DNR – Do Not Resuscitate
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 shrink-0 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
                <span className="text-sm font-bold text-emerald-700">Full Code</span>
              </div>
            </div>
          )}
        </div>

        {/* ── 4. Allergies Section ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Allergies ({patient.allergies.length})
          </h3>

          {noKnownAllergies ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 shrink-0 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m4.5 12.75 6 6 9-13.5"
                  />
                </svg>
                <span className="text-sm text-emerald-700">No Known Allergies</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {patient.allergies.map((allergy) => (
                <div
                  key={allergy}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
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
                    <span className="text-sm text-red-800">{allergy}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 5. Diagnosis ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Diagnosis
          </h3>
          <p className="text-sm text-gray-900">{patient.primary_diagnosis}</p>
        </div>

        {/* ── 6. Last Vitals ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Last Vitals &middot;{' '}
            <span className={vitalsDateStale ? 'text-amber-500' : ''}>
              {formatShortDate(patient.last_vitals_date)}
            </span>
          </h3>
          <p className="text-sm text-gray-900">
            {patient.last_weight_lbs} lbs &middot; {patient.last_height_inches} in
          </p>
        </div>

        {/* ── 7. Today's Visit ── */}
        <div className="px-6 pb-4">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Today's Visit
          </h3>
          <p className="text-sm text-gray-900">
            {visit.planned_start_time} – {visit.planned_end_time} &nbsp;{' '}
            {visit.service_type}
          </p>
          <p className="mt-0.5 text-sm text-gray-500">Payer: {visit.payer}</p>
        </div>

        {/* ── 8. Emergency Contact ── */}
        <div className="px-6 pb-8">
          <h3 className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Emergency Contact
          </h3>
          <p className="text-sm text-gray-900">
            {patient.emergency_contact_name} ({patient.emergency_contact_relation})
          </p>
          <a
            href={`tel:${patient.emergency_contact_phone}`}
            className="mt-0.5 inline-block text-sm text-indigo-600 hover:text-indigo-800"
          >
            {patient.emergency_contact_phone}
          </a>
        </div>
      </div>
    </div>
  );
}
