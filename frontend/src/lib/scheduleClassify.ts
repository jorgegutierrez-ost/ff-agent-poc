// Lifecycle classification of schedule items — used by the visit
// dashboard to bucket items into the four sections the nurse actually
// thinks in: check-in, due now, coming up, recurring care.
//
// Heuristic for now: type + label matching. When KanTime tells us how
// to model "this is a q2h intervention" vs "this is a one-time
// procedure", we replace the heuristic with a real `frequency_class`
// column. The call sites won't change.

import type { ScheduleItem } from '../types';

export type LifecycleClass =
  | 'check_in'        // patient ID (modal), head-to-toe, baseline vitals
  | 'recurring'       // q-based interventions (ROM, repositioning, suction)
  | 'narrative_close' // visit narrative
  | 'scheduled';      // everything else (meds, mid/end-of-shift vitals, etc.)

// Labels that map to a recurring (frequency-driven) intervention. The
// nurse logs these whenever they happen, not at a specific scheduled
// minute. Match is case-insensitive substring.
const RECURRING_LABEL_RE = /range of motion|positioning|skin check|suction/i;

/** Returns the id of the earliest-time vitals item — that becomes the
 *  baseline vitals task in the Check-in section. Subsequent vitals
 *  tasks (mid-shift, end-of-shift) are regular scheduled work. */
export function findBaselineVitalsId(items: ScheduleItem[]): string | null {
  const vitals = items
    .filter((i) => i.type === 'vitals')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  return vitals[0]?.id ?? null;
}

export function classifyScheduleItem(item: ScheduleItem, baselineVitalsId: string | null): LifecycleClass {
  if (item.type === 'head_to_toe') return 'check_in';
  if (item.type === 'vitals' && item.id === baselineVitalsId) return 'check_in';
  if (item.type === 'narrative') return 'narrative_close';
  if (item.type === 'intervention' && RECURRING_LABEL_RE.test(item.label)) return 'recurring';
  return 'scheduled';
}

/** Items that go into the "Due now" group: pending OR overdue, and
 *  scheduled within the next 30 minutes (or already past). Items
 *  scheduled further out land in "Coming up". */
export function isDueNow(item: ScheduleItem, nowMinutes: number): boolean {
  if (item.status === 'completed' || item.status === 'skipped') return false;
  if (item.status === 'overdue') return true;
  const [h, m] = item.scheduledTime.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const taskMinutes = h * 60 + m;
  return taskMinutes - nowMinutes <= 30;
}

