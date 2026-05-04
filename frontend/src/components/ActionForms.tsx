import { useState } from 'react';
import type { ScheduleItem } from '../types';

// ─── Shared time-field helper ────────────────────────────────
//
// Reused by every form that captures a clinical event time
// (vitals taken, medication given, intervention performed). The
// reason this exists as a shared component instead of inline
// inputs is that the WHEN matters as much as the WHAT —
// nurses chart hours after the fact, so we always want a
// required, editable time with a "Now" anchor and a hint that
// reminds them this is the EVENT time, not the LOG time.

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

interface TimeFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  onClearError?: () => void;
}

function TimeField({ label, hint, value, onChange, error, onClearError }: TimeFieldProps) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
        {label} <span className="text-red-500">*</span>
      </label>
      <div className="flex gap-2">
        <input
          type="time"
          required
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onClearError?.();
          }}
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-300 focus:bg-white"
        />
        <button
          type="button"
          onClick={() => {
            onChange(nowHHMM());
            onClearError?.();
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Now
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      ) : (
        <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
      )}
    </div>
  );
}

// ─── Vitals Form ─────────────────────────────────────────────

interface VitalsFormData {
  bp_systolic: string;
  bp_diastolic: string;
  temperature_f: string;
  respiratory_rate: string;
  o2_saturation: string;
  heart_rate: string;
  weight_lbs: string;
  pain_score: string;
  notes: string;
}

const EMPTY_VITALS: VitalsFormData = {
  bp_systolic: '',
  bp_diastolic: '',
  temperature_f: '',
  respiratory_rate: '',
  o2_saturation: '',
  heart_rate: '',
  weight_lbs: '',
  pain_score: '',
  notes: '',
};

function hasAtLeastOneVital(data: VitalsFormData): boolean {
  return (
    data.bp_systolic.trim() !== '' ||
    data.temperature_f.trim() !== '' ||
    data.respiratory_rate.trim() !== '' ||
    data.o2_saturation.trim() !== '' ||
    data.heart_rate.trim() !== ''
  );
}

interface VitalsFormProps {
  item: ScheduleItem;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function VitalsForm({ item, onSubmit, onCancel }: VitalsFormProps) {
  const [data, setData] = useState<VitalsFormData>(EMPTY_VITALS);
  const [occurredAt, setOccurredAt] = useState<string>(nowHHMM);
  const [showError, setShowError] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  const set = (field: keyof VitalsFormData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
    if (showError) setShowError(false);
  };

  const handleSubmit = () => {
    if (!hasAtLeastOneVital(data)) {
      setShowError(true);
      return;
    }
    if (!HHMM_RE.test(occurredAt.trim())) {
      setTimeError('Enter the time you took the vitals (HH:MM, 24-hour).');
      return;
    }
    onSubmit(item, {
      ...(data as unknown as Record<string, string>),
      occurred_at: occurredAt.trim(),
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Record Vital Signs</h4>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {showError && (
        <p className="mb-3 text-xs text-red-500">
          Please enter at least one vital sign.
        </p>
      )}

      <TimeField
        label="Time taken"
        hint="Enter the time you actually took the vitals, not when you're logging them."
        value={occurredAt}
        onChange={setOccurredAt}
        error={timeError}
        onClearError={() => timeError && setTimeError(null)}
      />

      <div className="space-y-3">
        {/* Blood Pressure */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Blood Pressure
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="Sys"
              value={data.bp_systolic}
              onChange={(e) => set('bp_systolic', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
            />
            <span className="text-gray-400">/</span>
            <input
              type="number"
              placeholder="Dia"
              value={data.bp_diastolic}
              onChange={(e) => set('bp_diastolic', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
            />
            <span className="shrink-0 text-xs text-gray-400">mmHg</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Heart Rate / Pulse */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Pulse / HR
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="—"
                value={data.heart_rate}
                onChange={(e) => set('heart_rate', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
              />
              <span className="shrink-0 text-xs text-gray-400">bpm</span>
            </div>
          </div>

          {/* Temperature */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Temperature
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.1"
                placeholder="—"
                value={data.temperature_f}
                onChange={(e) => set('temperature_f', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
              />
              <span className="shrink-0 text-xs text-gray-400">°F</span>
            </div>
          </div>

          {/* Resp. Rate */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Resp. Rate
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="—"
                value={data.respiratory_rate}
                onChange={(e) => set('respiratory_rate', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
              />
              <span className="shrink-0 text-xs text-gray-400">/min</span>
            </div>
          </div>

          {/* O2 Saturation */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              O2 Saturation
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="—"
                value={data.o2_saturation}
                onChange={(e) => set('o2_saturation', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
              />
              <span className="shrink-0 text-xs text-gray-400">%</span>
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Weight
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.1"
                placeholder="—"
                value={data.weight_lbs}
                onChange={(e) => set('weight_lbs', e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
              />
              <span className="shrink-0 text-xs text-gray-400">lbs</span>
            </div>
          </div>

          {/* Pain Score */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Pain (0–10)
            </label>
            <input
              type="number"
              min="0"
              max="10"
              placeholder="—"
              value={data.pain_score}
              onChange={(e) => set('pain_score', e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Any additional observations..."
            value={data.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Save vitals
      </button>
    </div>
  );
}

// ─── Medication Form ─────────────────────────────────────────

interface MedicationFormProps {
  item: ScheduleItem;
  action: 'med_given' | 'med_skipped' | 'med_modified';
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function MedicationForm({ item, action, onSubmit, onCancel }: MedicationFormProps) {
  const [reason, setReason] = useState('');
  const [dose, setDose] = useState('');
  const [route, setRoute] = useState('');
  const [notes, setNotes] = useState('');
  // Administration time for med_given. Prefilled with the current time as a
  // suggestion, but the nurse must confirm or edit it — never silently
  // committed as "now". Empty string is invalid; HH:MM is required.
  const [administeredAt, setAdministeredAt] = useState<string>(nowHHMM);
  const [showError, setShowError] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (action === 'med_skipped' && !reason.trim()) {
      setShowError(true);
      return;
    }
    if (action === 'med_modified' && !dose.trim() && !route.trim() && !notes.trim()) {
      setShowError(true);
      return;
    }
    if (action === 'med_given') {
      const t = administeredAt.trim();
      if (!t || !HHMM_RE.test(t)) {
        setTimeError('Enter the time you gave the dose (HH:MM, 24-hour).');
        return;
      }
    }

    const data: Record<string, string> = { action };
    if (action === 'med_given') {
      data.notes = notes;
      data.administered_at = administeredAt.trim();
    } else if (action === 'med_skipped') {
      data.reason = reason;
    } else {
      data.dose = dose;
      data.route = route;
      data.notes = notes;
    }
    onSubmit(item, data);
  };

  if (action === 'med_given') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Confirm: {item.label}
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">{item.sublabel}</p>

        <TimeField
          label="Time administered"
          hint="Enter the time you actually gave the dose, not when you're logging it."
          value={administeredAt}
          onChange={setAdministeredAt}
          error={timeError}
          onClearError={() => timeError && setTimeError(null)}
        />

        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. patient tolerated well"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
        <button
          onClick={handleSubmit}
          className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Confirm given
        </button>
      </div>
    );
  }

  if (action === 'med_skipped') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Skip: {item.label}
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {showError && (
          <p className="mb-2 text-xs text-red-500">
            Please provide a reason for skipping.
          </p>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Reason for skipping
          </label>
          <input
            type="text"
            placeholder="e.g. patient refused, held per MD"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (showError) setShowError(false);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
        <button
          onClick={handleSubmit}
          className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Confirm skipped
        </button>
      </div>
    );
  }

  // med_modified
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">
          Modify: {item.label}
        </h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showError && (
        <p className="mb-2 text-xs text-red-500">
          Please describe what was modified.
        </p>
      )}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              New dose
            </label>
            <input
              type="text"
              placeholder="e.g. 12.5mg"
              value={dose}
              onChange={(e) => {
                setDose(e.target.value);
                if (showError) setShowError(false);
              }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
              Route
            </label>
            <input
              type="text"
              placeholder="e.g. IV"
              value={route}
              onChange={(e) => {
                setRoute(e.target.value);
                if (showError) setShowError(false);
              }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Notes
          </label>
          <input
            type="text"
            placeholder="Reason for modification..."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              if (showError) setShowError(false);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Confirm modification
      </button>
    </div>
  );
}

// ─── Intervention Form ───────────────────────────────────────

interface InterventionFormProps {
  item: ScheduleItem;
  action: 'intervention_done' | 'intervention_skip';
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function InterventionForm({ item, action, onSubmit, onCancel }: InterventionFormProps) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [occurredAt, setOccurredAt] = useState<string>(nowHHMM);
  const [showError, setShowError] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (action === 'intervention_skip' && !reason.trim()) {
      setShowError(true);
      return;
    }
    if (action === 'intervention_done' && !HHMM_RE.test(occurredAt.trim())) {
      setTimeError('Enter the time you performed this (HH:MM, 24-hour).');
      return;
    }
    const data: Record<string, string> = { action };
    if (action === 'intervention_done') {
      data.outcome = outcome;
      data.notes = notes;
      data.occurred_at = occurredAt.trim();
    } else {
      data.reason = reason;
    }
    onSubmit(item, data);
  };

  if (action === 'intervention_skip') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Skip: {item.label}
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {showError && (
          <p className="mb-2 text-xs text-red-500">
            Please provide a reason.
          </p>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Reason
          </label>
          <input
            type="text"
            placeholder="Why was this not needed?"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (showError) setShowError(false);
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
        <button
          onClick={handleSubmit}
          className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Confirm skipped
        </button>
      </div>
    );
  }

  // intervention_done
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">
          Complete: {item.label}
        </h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-500">{item.sublabel}</p>

      <TimeField
        label="Time performed"
        hint="Enter the time you actually did this, not when you're logging it."
        value={occurredAt}
        onChange={setOccurredAt}
        error={timeError}
        onClearError={() => timeError && setTimeError(null)}
      />

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Outcome <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. clear secretions obtained"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="Additional observations..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Mark complete
      </button>
    </div>
  );
}

// ─── Narrative Form ──────────────────────────────────────────

interface NarrativeFormProps {
  item: ScheduleItem;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function NarrativeForm({ item, onSubmit, onCancel }: NarrativeFormProps) {
  const [content, setContent] = useState('');
  const [tolerated, setTolerated] = useState<'yes' | 'no' | ''>('');
  const [showError, setShowError] = useState(false);

  const handleSubmit = () => {
    if (!content.trim()) {
      setShowError(true);
      return;
    }
    onSubmit(item, {
      action: 'write_narrative',
      content,
      patient_tolerated: tolerated,
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Visit Narrative</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showError && (
        <p className="mb-2 text-xs text-red-500">Please write a narrative.</p>
      )}
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
            Narrative
          </label>
          <textarea
            rows={4}
            placeholder="Describe the visit findings, observations, and plan..."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (showError) setShowError(false);
            }}
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-gray-500 uppercase">
            Patient tolerated visit?
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setTolerated('yes')}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                tolerated === 'yes'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setTolerated('no')}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                tolerated === 'no'
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              No
            </button>
          </div>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="mt-4 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Save narrative
      </button>
    </div>
  );
}

// ─── Skip Vitals Form (simple reason) ────────────────────────

interface SkipFormProps {
  item: ScheduleItem;
  label: string;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function SkipForm({ item, label, onSubmit, onCancel }: SkipFormProps) {
  const [reason, setReason] = useState('');
  const [showError, setShowError] = useState(false);

  const handleSubmit = () => {
    if (!reason.trim()) {
      setShowError(true);
      return;
    }
    onSubmit(item, { action: 'skipped', reason });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">
          Skip: {label}
        </h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {showError && (
        <p className="mb-2 text-xs text-red-500">Please provide a reason.</p>
      )}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Reason
        </label>
        <input
          type="text"
          placeholder="Why was this skipped?"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (showError) setShowError(false);
          }}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>
      <button
        onClick={handleSubmit}
        className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Confirm skipped
      </button>
    </div>
  );
}
