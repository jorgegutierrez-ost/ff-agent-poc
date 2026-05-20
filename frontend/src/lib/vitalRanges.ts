// Vital-sign warning logic for the in-form pre-submit alerts.
//
// Three orthogonal checks per metric — each returns a short sentence (or
// null when nothing to flag). The form concatenates them so a single
// value can surface "out of range" + "rising trend" + "big delta" if
// all three apply at once.
//
// Source of truth for the age-appropriate ranges:
// backend/src/agent/recapHighlights.ts thresholdsFor(). The API echoes
// those numbers down to us in the `thresholds` field so the two paths
// can never disagree. We never invent thresholds here.

export interface VitalThresholds {
  hr?:   { low: number; high: number };
  rr?:   { low: number; high: number };
  temp?: { low: number; high: number };
  spo2?: { low: number };
  bpSys?: { low: number; high: number };
}

export interface PastReading {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature_f: number | null;
  o2_saturation: number | null;
  pain_score: number | null;
}

export interface DatedReading {
  visit_date: string; // YYYY-MM-DD
  reading: PastReading;
}

export type Metric = 'hr' | 'rr' | 'temp' | 'spo2' | 'bpSys';

// Fixed per-metric deltas that count as a clinically meaningful change
// from the last reading. Conservative defaults — easier to explain to a
// nurse than a percent threshold ("up 20 from last reading" reads more
// usefully than "up 22%").
const DELTA_THRESHOLDS: Record<Metric, number> = {
  hr:   20,   // bpm
  rr:   6,    // breaths/min
  temp: 1.5,  // °F
  spo2: 4,    // percentage points
  bpSys: 20,  // mmHg
};

const METRIC_LABEL: Record<Metric, string> = {
  hr:    'HR',
  rr:    'RR',
  temp:  'Temp',
  spo2:  'SpO₂',
  bpSys: 'BP',
};

const METRIC_UNIT: Record<Metric, string> = {
  hr:    'bpm',
  rr:    '/min',
  temp:  '°F',
  spo2:  '%',
  bpSys: 'mmHg',
};

function readingValue(r: PastReading, metric: Metric): number | null {
  switch (metric) {
    case 'hr':    return r.heart_rate;
    case 'rr':    return r.respiratory_rate;
    case 'temp':  return r.temperature_f;
    case 'spo2':  return r.o2_saturation;
    case 'bpSys': return r.bp_systolic;
  }
}

// (1) Out-of-range vs. the patient-appropriate threshold. Returns null
//     when in range or no threshold defined for that metric.
export function rangeWarning(
  metric: Metric,
  value: number,
  thresholds: VitalThresholds,
): string | null {
  const t = thresholds[metric];
  if (!t) return null;
  const label = METRIC_LABEL[metric];
  const unit = METRIC_UNIT[metric];
  if ('high' in t && value > t.high) {
    return `${label} ${value} ${unit} — above expected ${t.low}–${t.high}${unit} for age.`;
  }
  if (value < t.low) {
    return `${label} ${value} ${unit} — below expected ${'high' in t ? `${t.low}–${t.high}` : `${t.low}+`}${unit} for age.`;
  }
  return null;
}

// (2) Multi-day trend: when the most recent 3 readings (including the
//     one being entered) all move in the same direction, surface the
//     sequence so the nurse sees the progression. Only fires when the
//     spread is non-trivial (≥ half a delta threshold) to suppress
//     noise from naturally jittery vitals.
export function trendWarning(
  metric: Metric,
  currentValue: number,
  recent: DatedReading[],
): string | null {
  const past = recent
    .map((r) => readingValue(r.reading, metric))
    .filter((v): v is number => v != null);
  if (past.length < 2) return null;

  const last3 = [...past.slice(-2), currentValue];
  const rising = last3[0] < last3[1] && last3[1] < last3[2];
  const falling = last3[0] > last3[1] && last3[1] > last3[2];
  if (!rising && !falling) return null;

  const spread = Math.abs(last3[2] - last3[0]);
  if (spread < DELTA_THRESHOLDS[metric] / 2) return null;

  const arrow = rising ? 'rising' : 'falling';
  return `3-day trend ${arrow}: ${last3.join(' → ')}.`;
}

// (3) Sharp delta from the immediately previous reading. Independent
//     from trend — a single 20-point HR jump matters even without a
//     prior data point.
export function deltaWarning(
  metric: Metric,
  currentValue: number,
  recent: DatedReading[],
): string | null {
  const past = recent
    .map((r) => readingValue(r.reading, metric))
    .filter((v): v is number => v != null);
  if (past.length === 0) return null;
  const last = past[past.length - 1];
  const diff = currentValue - last;
  if (Math.abs(diff) < DELTA_THRESHOLDS[metric]) return null;
  const direction = diff > 0 ? 'Up' : 'Down';
  return `${direction} ${Math.abs(diff).toFixed(metric === 'temp' ? 1 : 0)} from last reading (${last}).`;
}

// Compose all three checks. Returns the joined warning lines or null
// when the metric is silent. Form callers render this as one amber
// inline alert under the field.
export function buildVitalWarning(
  metric: Metric,
  rawValue: string,
  thresholds: VitalThresholds,
  recent: DatedReading[],
): string | null {
  const trimmed = rawValue.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;

  const parts = [
    rangeWarning(metric, value, thresholds),
    trendWarning(metric, value, recent),
    deltaWarning(metric, value, recent),
  ].filter((s): s is string => !!s);
  return parts.length === 0 ? null : parts.join(' ');
}
