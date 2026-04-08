import { useState } from 'react';
import type { VisitSummaryData } from '../types';

interface VisitSummaryProps {
  summary: VisitSummaryData;
  patientName: string | null;
}

function CheckIcon({ filled }: { filled: boolean }) {
  if (!filled) {
    return (
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-300">
        <span className="sr-only">Not completed</span>
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    </div>
  );
}

function Section({
  title,
  filled,
  defaultOpen,
  children,
}: {
  title: string;
  filled: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? filled);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <CheckIcon filled={filled} />
        <span className="flex-1 text-sm font-medium text-gray-900">{title}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="px-5 pb-3">{children}</div>}
    </div>
  );
}

function VitalRow({ label, value, unit }: { label: string; value?: number; unit?: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-900">
        {value}
        {unit && <span className="ml-0.5 text-gray-400">{unit}</span>}
      </span>
    </div>
  );
}

export default function VisitSummary({ summary, patientName }: VisitSummaryProps) {
  if (!patientName) {
    return (
      <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">Visit Summary</h2>
        </div>
        <div className="flex flex-1 items-center justify-center px-5">
          <p className="text-center text-sm text-gray-400">
            Select a patient to view the visit summary.
          </p>
        </div>
      </div>
    );
  }

  const hasVitals = summary.vitals !== null;
  const hasInterventions = summary.interventions.length > 0;
  const hasMedications = summary.medications.length > 0;
  const hasNarrative = summary.narrative !== null;

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">Visit Summary</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          {[hasVitals, hasInterventions, hasMedications, hasNarrative].filter(Boolean).length}/4
          sections documented
        </p>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Vitals */}
        <Section title="Vitals" filled={hasVitals} defaultOpen>
          {hasVitals && summary.vitals ? (
            <div className="space-y-0.5">
              {summary.vitals.bp_systolic != null && summary.vitals.bp_diastolic != null && (
                <VitalRow
                  label="Blood Pressure"
                  value={summary.vitals.bp_systolic}
                  unit={`/${summary.vitals.bp_diastolic} mmHg`}
                />
              )}
              <VitalRow label="Heart Rate" value={summary.vitals.heart_rate} unit="bpm" />
              <VitalRow label="Resp. Rate" value={summary.vitals.respiratory_rate} unit="/min" />
              <VitalRow label="Temperature" value={summary.vitals.temperature_f} unit="°F" />
              <VitalRow label="O2 Sat" value={summary.vitals.o2_saturation} unit="%" />
              <VitalRow label="Weight" value={summary.vitals.weight_lbs} unit="lbs" />
              <VitalRow label="Pain Score" value={summary.vitals.pain_score} unit="/10" />
              {summary.vitals.notes && (
                <p className="mt-1 text-xs text-gray-500 italic">{summary.vitals.notes}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No vitals logged yet.</p>
          )}
        </Section>

        {/* Interventions */}
        <Section title="Interventions" filled={hasInterventions}>
          {hasInterventions ? (
            <div className="space-y-2">
              {summary.interventions.map((intervention, i) => (
                <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-900">{intervention.name}</p>
                  {intervention.description && (
                    <p className="mt-0.5 text-xs text-gray-500">{intervention.description}</p>
                  )}
                  {intervention.outcome && (
                    <p className="mt-0.5 text-xs text-emerald-600">Outcome: {intervention.outcome}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No interventions logged yet.</p>
          )}
        </Section>

        {/* Medications */}
        <Section title="Medications" filled={hasMedications}>
          {hasMedications ? (
            <div className="space-y-2">
              {summary.medications.map((med, i) => (
                <div key={i} className="flex items-start justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{med.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[med.dose, med.route].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      med.given
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {med.given ? 'Given' : 'Withheld'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No medications logged yet.</p>
          )}
        </Section>

        {/* Narrative */}
        <Section title="Narrative" filled={hasNarrative}>
          {hasNarrative && summary.narrative ? (
            <div>
              <p className="text-xs leading-relaxed text-gray-700">{summary.narrative.content}</p>
              {summary.narrative.patient_tolerated_ok != null && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      summary.narrative.patient_tolerated_ok ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-[10px] text-gray-500">
                    Patient {summary.narrative.patient_tolerated_ok ? 'tolerated well' : 'did not tolerate well'}
                  </span>
                </div>
              )}
              {summary.narrative.patient_tolerated_notes && (
                <p className="mt-1 text-xs text-gray-500 italic">
                  {summary.narrative.patient_tolerated_notes}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No narrative written yet.</p>
          )}
        </Section>
      </div>

      {/* Close out button */}
      <div className="border-t border-gray-200 px-5 py-4">
        <button
          disabled={!hasVitals || !hasInterventions || !hasMedications || !hasNarrative}
          className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          Close out visit
        </button>
      </div>
    </div>
  );
}
