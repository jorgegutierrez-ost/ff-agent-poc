import type { Patient, Visit } from '../types';

interface PatientListProps {
  patients: Patient[];
  visits: Visit[];
  selectedPatientId: string | null;
  onSelectPatient: (patientId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-amber-400',
  in_progress: 'bg-emerald-400',
  completed: 'bg-gray-300',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatAge(patient: Patient): string {
  if (patient.age_months != null && patient.age_months > 0) {
    return `${patient.age_months}mo`;
  }
  if (patient.age_years != null) {
    return `${patient.age_years}y`;
  }
  return '';
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default function PatientList({
  patients,
  visits,
  selectedPatientId,
  onSelectPatient,
}: PatientListProps) {
  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">Today's Visits</h2>
        <p className="mt-0.5 text-xs text-gray-500">{patients.length} patients scheduled</p>
      </div>

      {/* Patient cards */}
      <div className="flex-1 overflow-y-auto">
        {patients.map((patient) => {
          const visit = visits.find((v) => v.patient_id === patient.id);
          const isSelected = patient.id === selectedPatientId;

          return (
            <button
              key={patient.id}
              onClick={() => onSelectPatient(patient.id)}
              className={`w-full border-b border-gray-100 px-5 py-4 text-left transition-colors ${
                isSelected
                  ? 'bg-gray-50 ring-inset ring-1 ring-gray-900'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    isSelected
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {getInitials(patient.full_name)}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Name + status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-gray-900">
                      {patient.full_name}
                    </span>
                    {visit && (
                      <span
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[visit.status]}`}
                        title={STATUS_LABELS[visit.status]}
                      />
                    )}
                  </div>

                  {/* Age + diagnosis */}
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {formatAge(patient)} &middot; {patient.primary_diagnosis.split(' - ')[0].split(' (')[0]}
                  </p>

                  {/* Visit info */}
                  {visit && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
                      <span>{formatTime(visit.planned_start_time)}</span>
                      <span>&middot;</span>
                      <span>{visit.service_type}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
