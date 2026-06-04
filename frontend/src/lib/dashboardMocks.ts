// Demo data for the nurse home dashboard. The "Needs your attention"
// pile (chart-not-submitted, QA-returned items, etc.) maps to a real
// concept — past-shift exceptions queued for the nurse — but we don't
// track those events in the backend yet. Keeping the seed here makes
// the demo deterministic; once the office-clinician workflow is
// modeled, this whole file moves behind an API call.

export type AttentionStatus = 'not_submitted' | 'qa_returned' | 'survey' | 'awaiting_signature' | 'care_plan_ack' | 'messages';
export type AttentionSeverity = 'overdue' | 'open';

export interface AttentionItem {
  id: string;
  status: AttentionStatus;
  severity: AttentionSeverity;
  /** Headline shown bold on the card */
  title: string;
  /** Sub-line giving the operational context */
  detail: string;
  /** Relative time stamp shown on the right ("3 d ago") */
  age: string;
}

export const ATTENTION_ITEMS: AttentionItem[] = [
  {
    id: 'a1',
    status: 'not_submitted',
    severity: 'overdue',
    title: 'Chart not submitted · May 25 shift',
    detail: 'Saved as draft. End-of-shift narrative missing.',
    age: '3 d ago',
  },
  {
    id: 'a2',
    status: 'not_submitted',
    severity: 'overdue',
    title: 'Chart not submitted · May 27 shift',
    detail: 'Clock-out 22:01. Last activity 21:45. Chart saved as draft.',
    age: '9 h ago',
  },
  {
    id: 'a3',
    status: 'qa_returned',
    severity: 'overdue',
    title: 'Med time outside clock-in · May 20',
    detail: 'Baclofen logged 08:58. Clock-in was 09:01.',
    age: '1 wk ago',
  },
  {
    id: 'a4',
    status: 'qa_returned',
    severity: 'overdue',
    title: 'Narrative too sparse · May 23',
    detail: '13:00 narrative reads only "family present, no change." Please clarify findings.',
    age: '5 d ago',
  },
  {
    id: 'a5',
    status: 'qa_returned',
    severity: 'overdue',
    title: 'Vitals out of range · May 22',
    detail: 'HR 162 at 14:30 not noted in narrative. Add follow-up.',
    age: '6 d ago',
  },
  {
    id: 'a6',
    status: 'awaiting_signature',
    severity: 'overdue',
    title: 'Change order awaiting signature · May 26',
    detail: 'Baclofen dose ↑ 7.5 mg TID. Verbal from Dr. Patel. Fax pending.',
    age: '2 d ago',
  },
  {
    id: 'a7',
    status: 'awaiting_signature',
    severity: 'overdue',
    title: 'Care plan ack pending · May 21',
    detail: 'New PT eval added. Acknowledge before next visit.',
    age: '7 d ago',
  },
];

export const BY_TYPE_COUNTS: Array<{ status: AttentionStatus; label: string; count: number }> = [
  { status: 'not_submitted',     label: 'Not submitted',      count: 2 },
  { status: 'qa_returned',       label: 'QA returned',        count: 3 },
  { status: 'survey',            label: 'Survey drafts',      count: 1 },
  { status: 'awaiting_signature', label: 'Awaiting signature', count: 2 },
  { status: 'care_plan_ack',     label: 'Care plan acks',     count: 2 },
  { status: 'messages',          label: 'Messages',           count: 2 },
];

export interface HoursThisWeek {
  worked: number;
  authorized: number;
  perDay: Array<{ day: 'M' | 'T' | 'W' | 'Th' | 'F' | 'Sa' | 'Su'; hours: number | null; state: 'past' | 'today' | 'future' }>;
}

export const HOURS_THIS_WEEK: HoursThisWeek = {
  worked: 48,
  authorized: 60,
  perDay: [
    { day: 'M',  hours: 12, state: 'past' },
    { day: 'T',  hours: 12, state: 'past' },
    { day: 'W',  hours: 12, state: 'past' },
    { day: 'Th', hours: 0,  state: 'today' },
    { day: 'F',  hours: 12, state: 'future' },
    { day: 'Sa', hours: null, state: 'future' },
    { day: 'Su', hours: null, state: 'future' },
  ],
};
