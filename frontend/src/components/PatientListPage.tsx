import { useState, useMemo } from 'react';
import type { Patient, Visit } from '../types';
import PatientDetailSidebar from './PatientDetailSidebar';

interface PatientListPageProps {
  patients: Patient[];
  visits: Visit[];
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

function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

function formatGreetingDate(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).toUpperCase();
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  scheduled: {
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    dot: 'bg-gray-300',
    label: 'Scheduled',
  },
  in_progress: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
    label: 'In Progress',
  },
  completed: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-400',
    label: 'Complete',
  },
};

export default function PatientListPage({
  patients,
  visits,
  onBeginVisit,
}: PatientListPageProps) {
  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [patients, search]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;
  const selectedVisit = visits.find((v) => v.patient_id === selectedPatientId) ?? null;

  return (
    <div className="flex h-full flex-1">
      {/* ───── Main patient list area ───── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-6 pb-1">
          <div>
            <p className="text-[11px] font-medium tracking-widest text-gray-400 uppercase">
              {formatGreetingDate()}
            </p>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight text-gray-900">
              {getGreeting()}, Sarah
            </h1>
          </div>
          <div className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm tabular-nums text-gray-500">
            {getCurrentTime()}
          </div>
        </div>

        {/* Search section */}
        <div className="px-8 pt-5 pb-1">
          <h2 className="text-base font-semibold text-gray-900">Select your patient</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Search by name or address to begin your visit
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patients..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-300 focus:bg-white"
              />
            </div>
            <button className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Patient count */}
        <div className="px-8 pt-4 pb-2">
          <p className="text-xs text-gray-400">
            {filteredPatients.length} visit{filteredPatients.length !== 1 ? 's' : ''} on
            your roster today
          </p>
        </div>

        {/* ───── Patient list ───── */}
        <div className="flex-1 overflow-y-auto px-8 pb-6">
          <div className="space-y-1">
            {filteredPatients.map((patient) => {
              const visit = visits.find((v) => v.patient_id === patient.id);
              const isSelected = patient.id === selectedPatientId;
              const badge = visit ? STATUS_BADGE[visit.status] : null;

              return (
                <button
                  key={patient.id}
                  onClick={() =>
                    setSelectedPatientId(isSelected ? null : patient.id)
                  }
                  className={`group flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-gray-900 bg-gray-900 shadow-lg'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {getInitials(patient.full_name)}
                  </div>

                  {/* Name + meta */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-medium ${
                        isSelected ? 'text-white' : 'text-gray-900'
                      }`}
                    >
                      {patient.full_name}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        isSelected ? 'text-white/60' : 'text-gray-400'
                      }`}
                    >
                      {formatAge(patient)}
                      {visit &&
                        ` · ${formatTimeRange(
                          visit.planned_start_time,
                          visit.planned_end_time,
                        )} · ${visit.service_type}`}
                    </p>
                  </div>

                  {/* Status badge */}
                  {badge && (
                    <div
                      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        isSelected
                          ? visit!.status === 'in_progress'
                            ? 'bg-amber-400/30 text-amber-200'
                            : visit!.status === 'completed'
                              ? 'bg-emerald-400/30 text-emerald-200'
                              : 'bg-white/15 text-white/70'
                          : `${badge.bg} ${badge.text}`
                      }`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          isSelected
                            ? visit!.status === 'in_progress'
                              ? 'bg-amber-300'
                              : visit!.status === 'completed'
                                ? 'bg-emerald-300'
                                : 'bg-white/50'
                            : badge.dot
                        }`}
                      />
                      {badge.label}
                    </div>
                  )}

                  {/* Chevron */}
                  <svg
                    className={`h-4 w-4 shrink-0 ${
                      isSelected ? 'text-white/40' : 'text-gray-300'
                    }`}
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
              );
            })}

            {filteredPatients.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">No patients match your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───── Right sidebar — patient detail (desktop) ───── */}
      <div
        className={`hidden md:block transition-all duration-200 ${
          selectedPatient && selectedVisit ? 'w-[380px]' : 'w-0'
        } shrink-0 overflow-hidden`}
      >
        {selectedPatient && selectedVisit && (
          <PatientDetailSidebar
            patient={selectedPatient}
            visit={selectedVisit}
            onClose={() => setSelectedPatientId(null)}
            onBeginVisit={onBeginVisit}
          />
        )}
      </div>

      {/* ───── Mobile overlay ───── */}
      {selectedPatient && selectedVisit && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelectedPatientId(null)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm">
            <PatientDetailSidebar
              patient={selectedPatient}
              visit={selectedVisit}
              onClose={() => setSelectedPatientId(null)}
              onBeginVisit={onBeginVisit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
