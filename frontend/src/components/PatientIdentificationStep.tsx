import { useMemo, useState } from 'react';
import type { Patient } from '../types';
import { API_BASE } from '../config';

interface PatientIdentificationStepProps {
  patient: Patient;
  visitId: string;
  /** Called after the check is successfully saved so the parent can
   *  lift the gate and start the visit. Receives the saved record. */
  onConfirmed: (check: { identifiers: string[]; confirmed_with: string | null }) => void;
}

// Per regulatory requirement, the nurse must confirm at least TWO
// identifiers before proceeding with any documentation. The list below
// matches Renee's spec — the order is fixed so QA can rely on it.
const IDENTIFIER_OPTIONS: Array<{
  id: 'full_name' | 'dob' | 'picture_id' | 'address' | 'visual';
  label: string;
  description: string;
}> = [
  { id: 'full_name',  label: 'Full name',          description: 'Verified verbally with the adult in charge.' },
  { id: 'dob',        label: 'Date of birth',      description: 'Verified verbally against the chart.' },
  { id: 'picture_id', label: 'Picture ID',         description: 'Compared a government-issued photo ID to the patient.' },
  { id: 'address',    label: 'Home address',       description: 'Verified verbally — confirms we are at the right home.' },
  { id: 'visual',     label: 'Visual confirmation', description: 'Recognized the patient from a prior visit.' },
];

function formatDob(dob: string): string {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function PatientIdentificationStep({
  patient,
  visitId,
  onConfirmed,
}: PatientIdentificationStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmedWith, setConfirmedWith] = useState(
    patient.emergency_contact_name
      ? `${patient.emergency_contact_name} (${patient.emergency_contact_relation})`
      : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetsMin = selected.size >= 2;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (error) setError(null);
  }

  async function handleSubmit() {
    if (!meetsMin || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await fetch(`${API_BASE}/api/visits/${visitId}/identification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiers: Array.from(selected),
          confirmed_with: confirmedWith.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error('Could not save identification check.');
      const data = await resp.json();
      onConfirmed({
        identifiers: data.identifiers ?? Array.from(selected),
        confirmed_with: data.confirmed_with ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save identification check.');
    } finally {
      setSubmitting(false);
    }
  }

  const photoSrc = useMemo(() => patient.photo_url ?? null, [patient.photo_url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-100 px-7 pt-6 pb-4">
          <p className="text-[11px] font-semibold tracking-widest text-amber-700 uppercase">
            Required · Patient identification
          </p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">
            Confirm the patient before you begin
          </h2>
          <p className="mt-1.5 text-sm text-gray-500">
            Select <span className="font-medium text-gray-700">at least two</span> identifiers
            verified through the adult in charge.
          </p>
        </div>

        <div className="overflow-y-auto px-7 py-5">
          {/* Patient card */}
          <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={patient.full_name}
                className="h-20 w-20 shrink-0 rounded-2xl bg-white object-cover ring-1 ring-gray-200"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gray-200 text-xl font-semibold text-gray-600">
                {initials(patient.full_name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-gray-900">{patient.full_name}</p>
              <p className="mt-0.5 text-sm text-gray-500">DOB · {formatDob(patient.date_of_birth)}</p>
              <p className="mt-0.5 text-xs text-gray-400">
                Chart {patient.kantime_patient_id}
              </p>
            </div>
          </div>

          {/* Identifier checkboxes */}
          <fieldset className="mt-5 space-y-2">
            <legend className="mb-2 text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
              Identifiers verified ({selected.size} of 2 required)
            </legend>
            {IDENTIFIER_OPTIONS.map((opt) => {
              const checked = selected.has(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    checked
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-gray-500">{opt.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* Confirmed with */}
          <div className="mt-5">
            <label className="mb-1 block text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
              Confirmed with{' '}
              <span className="font-normal normal-case text-gray-400">(adult in charge)</span>
            </label>
            <input
              type="text"
              value={confirmedWith}
              onChange={(e) => setConfirmedWith(e.target.value)}
              placeholder="e.g. Siobhan O'Brien (Mother)"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
            />
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
          <p className="text-xs text-gray-400">
            {meetsMin ? 'Ready to confirm.' : 'Pick at least two identifiers to continue.'}
          </p>
          <button
            type="button"
            disabled={!meetsMin || submitting}
            onClick={handleSubmit}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
              meetsMin && !submitting
                ? 'bg-gray-900 text-white hover:bg-gray-800'
                : 'cursor-not-allowed bg-gray-200 text-gray-400'
            }`}
          >
            {submitting ? 'Saving…' : 'Confirm identification'}
          </button>
        </div>
      </div>
    </div>
  );
}
