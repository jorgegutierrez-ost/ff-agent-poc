import { useEffect, useState } from 'react';
import type { ScheduleItem } from '../types';
import { buildMedLine } from '../lib/medicationFormat';
import { API_BASE } from '../config';
import {
  type DatedReading,
  type Metric,
  type VitalThresholds,
  buildVitalWarning,
} from '../lib/vitalRanges';

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

// Convert HH:MM to a 12-hour display so the reference banner reads
// the same way the schedule and bedside MAR do.
function to12h(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

// Reference banner shown at the top of every confirmation form.
// Surfaces the scheduled time and (for medications) the same six
// safety fields the nurse sees on the med card. Per Julie's P0 #3,
// these must be visible on chat confirmation cards too — not just
// on the right-panel schedule.
interface ScheduledHeaderProps {
  item: ScheduleItem;
}

function ScheduledHeader({ item }: ScheduledHeaderProps) {
  const isMed = item.type === 'medication';
  const doseLine = isMed ? buildMedLine(item.dose, item.concentration, item.route) : '';
  const indication = isMed ? item.indication : null;

  // PRN orders carry no scheduled time. Show a PRN badge instead so the
  // nurse never sees a misleading "Scheduled 00:00".
  const timeBadge = item.isPrn ? (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700">
      PRN
    </span>
  ) : (
    <span className="text-[11px] font-medium tabular-nums text-gray-500">
      Scheduled {to12h(item.scheduledTime)}
    </span>
  );

  // For PRNs, append max-frequency hint to the existing "For: …" line so
  // the nurse sees the dosing limit before confirming.
  const freqHint =
    item.isPrn && item.maxFrequencyHours
      ? `max q${item.maxFrequencyHours}h`
      : '';

  return (
    <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-gray-900">{item.label}</span>
        {timeBadge}
      </div>
      {doseLine && (
        <p className="mt-0.5 text-xs text-gray-700">{doseLine}</p>
      )}
      {(indication || item.sublabel || freqHint) && (
        <p className="mt-0.5 text-[11px] text-gray-500">
          {indication ? `For: ${indication}` : ''}
          {indication && (item.sublabel || freqHint) ? ' · ' : ''}
          {item.sublabel}
          {item.sublabel && freqHint ? ' · ' : ''}
          {freqHint}
        </p>
      )}
    </div>
  );
}

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

// Inline non-blocking alert rendered under each vital input. Hidden
// when text is null so the form stays compact when nothing's flagged.
// Color is informational (amber, not red) — the nurse can still submit.
function VitalAlert({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1">
      <svg
        className="mt-0.5 h-3 w-3 shrink-0 text-amber-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <p className="text-[11px] leading-snug text-amber-800">{text}</p>
    </div>
  );
}


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
  patientId: string;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function VitalsForm({ item, patientId, onSubmit, onCancel }: VitalsFormProps) {
  const [data, setData] = useState<VitalsFormData>(EMPTY_VITALS);
  const [occurredAt, setOccurredAt] = useState<string>(nowHHMM);
  const [showError, setShowError] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<VitalThresholds>({});
  const [recent, setRecent] = useState<DatedReading[]>([]);

  // Fetch patient-age-appropriate thresholds and the last 3 days of
  // vitals when the form opens. If the call fails we silently fall back
  // to no warnings — the form must remain usable offline.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/patients/${patientId}/recent-vitals?days=3`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setThresholds(d.thresholds ?? {});
        setRecent((d.readings ?? []) as DatedReading[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const warn = (metric: Metric, raw: string): string | null =>
    buildVitalWarning(metric, raw, thresholds, recent);

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

      <ScheduledHeader item={item} />

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
          <VitalAlert text={warn('bpSys', data.bp_systolic)} />
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
            <VitalAlert text={warn('hr', data.heart_rate)} />
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
            <VitalAlert text={warn('temp', data.temperature_f)} />
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
            <VitalAlert text={warn('rr', data.respiratory_rate)} />
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
            <VitalAlert text={warn('spo2', data.o2_saturation)} />
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
  action: 'med_given' | 'med_skipped';
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function MedicationForm({ item, action, onSubmit, onCancel }: MedicationFormProps) {
  const [reason, setReason] = useState('');
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
    } else {
      data.reason = reason;
    }
    onSubmit(item, data);
  };

  if (action === 'med_given') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">
            Confirm administration
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ScheduledHeader item={item} />

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
            Skip dose
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ScheduledHeader item={item} />

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

  return null;
}

// ─── Change Order Form ───────────────────────────────────────────
//
// Real KanTime-style workflow: nurse documents the physician-authorized
// change with a required source (verbal / pharmacy label / written
// note), the new dose/route/frequency, and submits. The fax pipeline is
// stubbed server-side; the schedule card flips to the new values
// immediately so the nurse can document against the new order without
// waiting for the signature.
//
// Per Renee/Nichole's meeting: a nurse must not be able to change a
// dose/route on her own — the source-of-authority section gates submit.

type ChangeOrderType = 'add' | 'modify_dose' | 'modify_route' | 'modify_frequency' | 'discontinue';
type ChangeOrderSource = 'verbal' | 'pharmacy_label' | 'written_note';

const CHANGE_TYPE_OPTIONS: Array<{ value: ChangeOrderType; label: string; hint: string }> = [
  { value: 'modify_dose',      label: 'Modify dose',      hint: 'New dose for an existing order.' },
  { value: 'modify_route',     label: 'Modify route',     hint: 'Same drug, new route.' },
  { value: 'modify_frequency', label: 'Modify frequency', hint: 'Same drug + dose, new schedule.' },
  { value: 'discontinue',      label: 'Discontinue',      hint: 'Stop this medication.' },
  { value: 'add',              label: 'Add new med',      hint: 'Brand new order — needs full source.' },
];

const SOURCE_OPTIONS: Array<{ value: ChangeOrderSource; label: string }> = [
  { value: 'verbal',         label: 'Verbal from physician' },
  { value: 'pharmacy_label', label: 'Pharmacy label' },
  { value: 'written_note',   label: 'Written note (office visit)' },
];

interface ChangeOrderFormProps {
  item: ScheduleItem;
  visitId: string;
  /** Set to true when the form is opened from the "+ New change order"
   *  header button rather than from a specific med card. We drop the
   *  pre-filled medication name and require the nurse to type it in. */
  isHeaderInitiated?: boolean;
  /** Fired with the saved change-order payload so the visit page can
   *  flip the matching schedule item in-state without a full refetch. */
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function ChangeOrderForm({
  item,
  visitId,
  isHeaderInitiated = false,
  onSubmit,
  onCancel,
}: ChangeOrderFormProps) {
  // Default change type depends on entry point: header → add new med;
  // card tap → modify dose (the common case).
  const [changeType, setChangeType] = useState<ChangeOrderType>(
    isHeaderInitiated ? 'add' : 'modify_dose',
  );
  const [medName, setMedName] = useState(isHeaderInitiated ? '' : item.label);
  const [newDose, setNewDose] = useState('');
  const [newRoute, setNewRoute] = useState('');
  const [newFreq, setNewFreq] = useState('');
  const [newConcentration, setNewConcentration] = useState('');
  const [newIndication, setNewIndication] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [reason, setReason] = useState('');

  const [sourceType, setSourceType] = useState<ChangeOrderSource>('verbal');
  const [sourcePhysician, setSourcePhysician] = useState('');
  const [sourceTime, setSourceTime] = useState<string>(nowHHMM);
  const [sourceDescription, setSourceDescription] = useState('');

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which "new value" fields are required for each change type.
  const requires = (field: 'dose' | 'route' | 'frequency'): boolean => {
    if (changeType === 'add') return field === 'dose'; // add at minimum needs a dose
    if (changeType === 'modify_dose')      return field === 'dose';
    if (changeType === 'modify_route')     return field === 'route';
    if (changeType === 'modify_frequency') return field === 'frequency';
    return false;
  };

  function sourceComplete(): boolean {
    if (sourceType === 'verbal') return sourcePhysician.trim() !== '' && HHMM_RE.test(sourceTime.trim());
    return sourceDescription.trim() !== '';
  }

  function readyToSubmit(): boolean {
    if (!medName.trim()) return false;
    if (!sourceComplete()) return false;
    if (changeType === 'modify_dose'      && !newDose.trim())  return false;
    if (changeType === 'modify_route'     && !newRoute.trim()) return false;
    if (changeType === 'modify_frequency' && !newFreq.trim())  return false;
    if (changeType === 'add'              && !newDose.trim())  return false;
    return true;
  }

  async function handleSubmit() {
    if (!readyToSubmit() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Synthesize an ISO timestamp for the verbal source when the
      // nurse only entered HH:MM. The backend tolerates either, but
      // storing ISO keeps the audit trail sortable.
      let sourceObtainedAt: string | null = null;
      if (sourceType === 'verbal' && HHMM_RE.test(sourceTime.trim())) {
        const today = new Date().toISOString().slice(0, 10);
        sourceObtainedAt = `${today}T${sourceTime.trim()}:00`;
      }
      const payload = {
        scheduled_task_id: isHeaderInitiated ? null : item.id,
        medication_name: medName.trim(),
        change_type: changeType,
        old_dose: isHeaderInitiated ? null : item.dose ?? null,
        old_route: isHeaderInitiated ? null : item.route ?? null,
        old_frequency: isHeaderInitiated ? null : item.sublabel ?? null,
        new_dose: newDose.trim() || null,
        new_route: newRoute.trim() || null,
        new_frequency: newFreq.trim() || null,
        new_concentration: newConcentration.trim() || null,
        new_indication: newIndication.trim() || null,
        new_instructions: newInstructions.trim() || null,
        reason: reason.trim() || null,
        source_type: sourceType,
        source_physician: sourceType === 'verbal' ? sourcePhysician.trim() : null,
        source_obtained_at: sourceObtainedAt,
        source_description: sourceType === 'verbal' ? null : sourceDescription.trim(),
        notes: notes.trim() || null,
      };
      const resp = await fetch(`${API_BASE}/api/visits/${visitId}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        throw new Error(detail?.error ?? 'Could not save change order.');
      }
      onSubmit(item, {
        action: 'change_order_submitted',
        medication_name: payload.medication_name,
        change_type: changeType,
        new_dose: payload.new_dose ?? '',
        new_route: payload.new_route ?? '',
        new_frequency: payload.new_frequency ?? '',
        source_type: sourceType,
        source_physician: payload.source_physician ?? '',
        source_obtained_at: sourceObtainedAt ?? '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save change order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Change Order</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Pre-change snapshot. Reminds the nurse what she's replacing. */}
      {!isHeaderInitiated && <ScheduledHeader item={item} />}

      {/* SECTION 1 — Source of authority (required, gates submit) */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="mb-2 text-[10px] font-semibold tracking-widest text-amber-800 uppercase">
          1 · Source of authority <span className="text-amber-600">(required)</span>
        </p>
        <p className="mb-2 text-[11px] leading-snug text-amber-900">
          Nurses cannot change orders independently. Document where the
          authorization came from.
        </p>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {SOURCE_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSourceType(s.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                sourceType === s.value
                  ? 'bg-amber-700 text-white'
                  : 'bg-white text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {sourceType === 'verbal' && (
          <div className="space-y-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-amber-900 uppercase">
                Physician <span className="text-amber-700">*</span>
              </label>
              <input
                type="text"
                value={sourcePhysician}
                onChange={(e) => setSourcePhysician(e.target.value)}
                placeholder="e.g. Dr. Patel"
                className="w-full rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-amber-400 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-amber-900 uppercase">
                Verbal obtained at <span className="text-amber-700">*</span>
              </label>
              <input
                type="time"
                value={sourceTime}
                onChange={(e) => setSourceTime(e.target.value)}
                className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs tabular-nums text-gray-900 outline-none focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {sourceType !== 'verbal' && (
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-amber-900 uppercase">
              {sourceType === 'pharmacy_label' ? 'Label details / pharmacy' : 'Note details / office visit date'}{' '}
              <span className="text-amber-700">*</span>
            </label>
            <input
              type="text"
              value={sourceDescription}
              onChange={(e) => setSourceDescription(e.target.value)}
              placeholder={
                sourceType === 'pharmacy_label'
                  ? 'e.g. CVS label, filled 5/19, Rx#7842'
                  : 'e.g. Office visit 5/19 — note from Dr. Patel'
              }
              className="w-full rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-amber-400 outline-none focus:border-amber-500"
            />
          </div>
        )}
      </div>

      {/* SECTION 2 — The change */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
          2 · The change
        </p>

        <label className="mb-1 block text-[11px] font-medium text-gray-600 uppercase">
          Medication <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={medName}
          onChange={(e) => setMedName(e.target.value)}
          disabled={!isHeaderInitiated}
          placeholder={isHeaderInitiated ? 'Drug name' : ''}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isHeaderInitiated
              ? 'border-gray-200 bg-gray-50 text-gray-900 focus:border-gray-300 focus:bg-white'
              : 'border-gray-100 bg-gray-100 text-gray-600'
          }`}
        />

        <label className="mb-1 block text-[11px] font-medium text-gray-600 uppercase">
          Change type
        </label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {CHANGE_TYPE_OPTIONS
            .filter((o) => isHeaderInitiated || o.value !== 'add')
            .map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setChangeType(o.value)}
                title={o.hint}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  changeType === o.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
        </div>

        {/* New-value inputs — only render the fields that the chosen
            change type cares about. Discontinue has none. */}
        {changeType !== 'discontinue' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                New dose {requires('dose') && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newDose}
                onChange={(e) => setNewDose(e.target.value)}
                placeholder="e.g. 7.5 mg"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                New route {requires('route') && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newRoute}
                onChange={(e) => setNewRoute(e.target.value)}
                placeholder="e.g. Oral"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                New frequency {requires('frequency') && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={newFreq}
                onChange={(e) => setNewFreq(e.target.value)}
                placeholder="e.g. Three times daily"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                New concentration
              </label>
              <input
                type="text"
                value={newConcentration}
                onChange={(e) => setNewConcentration(e.target.value)}
                placeholder="e.g. 5 mg / 5 mL"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
          </div>
        )}

        {changeType === 'add' && (
          <div className="mt-2 grid grid-cols-1 gap-2">
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                Indication
              </label>
              <input
                type="text"
                value={newIndication}
                onChange={(e) => setNewIndication(e.target.value)}
                placeholder="What is this med for?"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
                Special instructions
              </label>
              <input
                type="text"
                value={newInstructions}
                onChange={(e) => setNewInstructions(e.target.value)}
                placeholder="e.g. Give 30 min before meals"
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
              />
            </div>
          </div>
        )}

        <div className="mt-2">
          <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
            Reason for change
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Worsening spasticity per parent"
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
          />
        </div>
      </div>

      {/* SECTION 3 — Notes + submit */}
      <div className="mb-3">
        <label className="mb-0.5 block text-[10px] font-medium text-gray-500 uppercase">
          Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything else the office should know"
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      <p className="mb-3 text-[10px] leading-snug text-gray-500">
        On submit: this change order is queued for the physician's
        signature (fax pipeline). You can document against the new order
        immediately — you don't have to wait for the signature.
      </p>

      {error && (
        <p className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!readyToSubmit() || submitting}
        className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
          !readyToSubmit() || submitting
            ? 'cursor-not-allowed bg-gray-200 text-gray-400'
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
      >
        {submitting ? 'Submitting…' : 'Submit change order'}
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
            Mark not needed
          </h4>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ScheduledHeader item={item} />

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
          Mark complete
        </h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ScheduledHeader item={item} />

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
          Skip {label.toLowerCase()}
        </h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ScheduledHeader item={item} />

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

// ─── Suction Form ────────────────────────────────────────────
//
// Specialized form for high-frequency tracheal/oral/nasal suctioning.
// Distinct from InterventionForm because Renee's spec calls for
// structured fields (route, amount, color, consistency) and a "count"
// for consolidating a hour's worth of similar passes into one entry.

const SUCTION_ROUTES: Array<{ value: 'nasal' | 'oral' | 'trach'; label: string }> = [
  { value: 'trach', label: 'Trach' },
  { value: 'oral',  label: 'Oral' },
  { value: 'nasal', label: 'Nasal' },
];
const AMOUNT_CHIPS = ['Small', 'Moderate', 'Copious'];
const COLOR_CHIPS = ['Clear', 'White', 'Yellow', 'Green', 'Blood-tinged'];
const CONSISTENCY_CHIPS = ['Thin', 'Thick', 'Tenacious'];

interface SuctionFormProps {
  item: ScheduleItem;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

function ChipRow({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value: string;
  onSelect: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value.toLowerCase() === opt.toLowerCase();
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(active ? '' : opt)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function SuctionForm({ item, onSubmit, onCancel }: SuctionFormProps) {
  const [route, setRoute] = useState<'nasal' | 'oral' | 'trach' | ''>('trach');
  const [occurredAt, setOccurredAt] = useState<string>(nowHHMM);
  const [amount, setAmount] = useState('');
  const [color, setColor] = useState('');
  const [consistency, setConsistency] = useState('');
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [routeError, setRouteError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!route) {
      setRouteError('Pick a route.');
      return;
    }
    if (!HHMM_RE.test(occurredAt.trim())) {
      setTimeError('Enter the time you suctioned (HH:MM, 24-hour).');
      return;
    }
    onSubmit(item, {
      action: 'suction_logged',
      route,
      occurred_at: occurredAt.trim(),
      amount,
      color,
      consistency,
      count: String(count),
      notes,
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Log suction</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ScheduledHeader item={item} />

      <TimeField
        label="Time suctioned"
        hint="Use the time of the first pass if you're consolidating a window."
        value={occurredAt}
        onChange={setOccurredAt}
        error={timeError}
        onClearError={() => timeError && setTimeError(null)}
      />

      {/* Route — required, segmented buttons */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Route <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-1.5">
          {SUCTION_ROUTES.map((r) => {
            const active = route === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setRoute(r.value);
                  if (routeError) setRouteError(null);
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        {routeError && (
          <p className="mt-1 text-xs text-red-500">{routeError}</p>
        )}
      </div>

      {/* Amount */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Amount
        </label>
        <ChipRow options={AMOUNT_CHIPS} value={amount} onSelect={setAmount} />
        <input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Or enter measured volume (e.g. 5 mL)"
          className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      {/* Color */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Color
        </label>
        <ChipRow options={COLOR_CHIPS} value={color} onSelect={setColor} />
      </div>

      {/* Consistency */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Consistency
        </label>
        <ChipRow options={CONSISTENCY_CHIPS} value={consistency} onSelect={setConsistency} />
      </div>

      {/* Count — for consolidating multiple passes per Renee's spec */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Number of passes
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            aria-label="Decrease count"
          >
            −
          </button>
          <span className="min-w-[2ch] text-center text-base font-semibold tabular-nums text-gray-900">
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(30, c + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            aria-label="Increase count"
          >
            +
          </button>
          <span className="text-[11px] text-gray-400">
            Use this to consolidate multiple passes ("5 times this hour").
          </span>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-1">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Notes <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. tolerated well, no desat"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      <button
        onClick={handleSubmit}
        className="mt-3 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Log {count > 1 ? `${count} passes` : 'pass'}
      </button>
    </div>
  );
}

// ─── Seizure Form ────────────────────────────────────────────
// Mirrors the KanTime seizure log: occurred_at, duration, type, LOC,
// intervention, notes. Mid-shift triggerable (no scheduled task
// required) so the quick-log strip can open it independent of the
// regular schedule flow.

const SEIZURE_TYPES = [
  'Absence', 'Atonic', 'Autonomic', 'Clonic', 'Emotional',
  'Myoclonic', 'Sensory', 'Tonic', 'Tonic-Clonic', 'Other',
];
const LOC_OPTIONS: Array<{ value: 'alert' | 'oriented' | 'lethargic'; label: string }> = [
  { value: 'alert',     label: 'Alert' },
  { value: 'oriented',  label: 'Oriented' },
  { value: 'lethargic', label: 'Lethargic' },
];

interface SeizureFormProps {
  item: ScheduleItem;
  visitId: string;
  onSubmit: (item: ScheduleItem, data: Record<string, string>) => void;
  onCancel: () => void;
}

export function SeizureForm({ item, visitId, onSubmit, onCancel }: SeizureFormProps) {
  const [occurredAt, setOccurredAt] = useState<string>(nowHHMM);
  const [durationMin, setDurationMin] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [seizureType, setSeizureType] = useState('');
  const [otherType, setOtherType] = useState('');
  const [loc, setLoc] = useState<'alert' | 'oriented' | 'lethargic' | ''>('');
  const [intervention, setIntervention] = useState('');
  const [notes, setNotes] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!HHMM_RE.test(occurredAt.trim())) {
      setTimeError('Enter when the seizure started (HH:MM, 24-hour).');
      return;
    }
    const minutes = parseInt(durationMin || '0', 10);
    const seconds = parseInt(durationSec || '0', 10);
    const durationTotal = minutes * 60 + seconds;
    const resolvedType = seizureType === 'Other' ? otherType.trim() : seizureType;

    setError(null);
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/visits/${visitId}/seizure-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          occurred_at: occurredAt.trim(),
          duration_seconds: durationTotal > 0 ? durationTotal : null,
          seizure_type: resolvedType || null,
          loc: loc || null,
          intervention: intervention.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!resp.ok) throw new Error('Save failed');
      onSubmit(item, {
        action: 'seizure_logged',
        occurred_at: occurredAt.trim(),
        duration_seconds: String(durationTotal),
        seizure_type: resolvedType,
        loc,
        intervention: intervention.trim(),
        notes: notes.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Log seizure event</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <TimeField
        label="Time started"
        hint="Time the seizure began."
        value={occurredAt}
        onChange={setOccurredAt}
        error={timeError}
        onClearError={() => timeError && setTimeError(null)}
      />

      {/* Duration */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Duration <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            placeholder="0"
            className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-300 focus:bg-white"
          />
          <span className="text-xs text-gray-400">min</span>
          <input
            type="number"
            min="0"
            max="59"
            value={durationSec}
            onChange={(e) => setDurationSec(e.target.value)}
            placeholder="0"
            className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-900 outline-none focus:border-gray-300 focus:bg-white"
          />
          <span className="text-xs text-gray-400">sec</span>
        </div>
      </div>

      {/* Type */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SEIZURE_TYPES.map((t) => {
            const active = seizureType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setSeizureType(active ? '' : t)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        {seizureType === 'Other' && (
          <input
            type="text"
            value={otherType}
            onChange={(e) => setOtherType(e.target.value)}
            placeholder="Describe activity witnessed"
            className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
          />
        )}
      </div>

      {/* LOC */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          LOC after event
        </label>
        <div className="flex gap-1.5">
          {LOC_OPTIONS.map((o) => {
            const active = loc === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setLoc(active ? '' : o.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Intervention */}
      <div className="mb-3">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Intervention
        </label>
        <input
          type="text"
          value={intervention}
          onChange={(e) => setIntervention(e.target.value)}
          placeholder="e.g. positioned on side, suctioned, gave PRN Diazepam"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      {/* Notes */}
      <div className="mb-1">
        <label className="mb-1 block text-[11px] font-medium text-gray-500 uppercase">
          Notes <span className="font-normal normal-case text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Witnessed activity, trigger, post-ictal state"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-300 focus:bg-white"
        />
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className={`mt-3 w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
          submitting
            ? 'cursor-not-allowed bg-gray-200 text-gray-400'
            : 'bg-gray-900 text-white hover:bg-gray-800'
        }`}
      >
        {submitting ? 'Saving…' : 'Save seizure event'}
      </button>
    </div>
  );
}
