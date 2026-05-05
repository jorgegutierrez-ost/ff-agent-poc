import { useState, useMemo } from 'react';
import type { Patient, ScheduleItem, SuctionEvent } from '../types';
import type { PrnOrder, LoggedMed } from './VisitPage';
import { getCareNote } from '../lib/careNotes';
import { fuzzyMatch } from '../lib/medicationMatch';

const ANIMATIONS_CSS = `
@keyframes popIn {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes fadeSlideIn {
  0% { opacity: 0; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes completeCard {
  0% { background-color: rgb(209 250 229); border-color: rgb(110 231 183); }
  100% { background-color: rgb(236 253 245 / 0.5); border-color: rgb(209 250 229); }
}
`;

interface VisitScheduleProps {
  patient: Patient;
  items: ScheduleItem[];
  prnOrders: PrnOrder[];
  loggedMeds: LoggedMed[];
  suctionEvents: SuctionEvent[];
  onQuickAction: (item: ScheduleItem, actionValue: string) => void;
}

type Tab = 'schedule' | 'prn' | 'patient';

// Icons per type
function TypeIcon({ type, className }: { type: ScheduleItem['type']; className?: string }) {
  const cn = className ?? 'h-4 w-4';
  switch (type) {
    case 'medication':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.893 13.393-1.135-1.135a2.252 2.252 0 0 1-.421-.585l-1.08-2.16a.414.414 0 0 0-.663-.107.827.827 0 0 1-.812.21l-1.273-.363a.89.89 0 0 0-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 0 1-1.81 1.025 1.055 1.055 0 0 1-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 0 1-1.383-2.46l.007-.042a2.25 2.25 0 0 1 .29-.787l.09-.15a2.25 2.25 0 0 1 2.37-1.048l1.178.236a1.125 1.125 0 0 0 1.302-.795l.208-.73a1.125 1.125 0 0 0-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 0 1-1.591.659h-.18a.94.94 0 0 0-.662.274.931.931 0 0 1-1.458-1.137l1.411-2.353a2.25 2.25 0 0 0 .286-.76m11.928 9.869A9 9 0 0 0 8.965 3.525m11.928 9.868A9 9 0 1 1 8.965 3.525" />
        </svg>
      );
    case 'intervention':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743" />
        </svg>
      );
    case 'vitals':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
      );
    case 'narrative':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function getTimeGroup(time: string): string {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

interface ScheduleCardProps {
  item: ScheduleItem;
  isOverdue?: boolean;
  onQuickAction: (item: ScheduleItem, actionValue: string) => void;
}

function ScheduleCard({ item, isOverdue, onQuickAction }: ScheduleCardProps) {
  const isDone = item.status === 'completed' || item.status === 'skipped';

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-all duration-500 ${
        isDone
          ? 'border-emerald-100 bg-emerald-50/50 animate-[completeCard_0.5s_ease-out]'
          : isOverdue
            ? 'border-red-200 bg-white'
            : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Animated check / type icon */}
          <div className="mt-0.5 shrink-0">
            {isDone ? (
              <div className="flex h-5 w-5 animate-[popIn_0.3s_ease-out] items-center justify-center rounded-full bg-emerald-500">
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
            ) : (
              <div className={isOverdue ? 'text-red-400' : 'text-gray-400'}>
                <TypeIcon type={item.type} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p
              className={`text-sm font-medium transition-all duration-300 ${
                isDone
                  ? 'text-gray-400 line-through'
                  : 'text-gray-900'
              }`}
            >
              {item.label}
            </p>
            <p className={`mt-0.5 text-xs transition-colors duration-300 ${isDone ? 'text-gray-300' : 'text-gray-400'}`}>
              {item.sublabel}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-sm tabular-nums transition-colors duration-300 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>
            {formatTime(isDone && item.completedAt ? item.completedAt : item.scheduledTime)}
          </span>
          {isOverdue && item.lateMinutes && (
            <p className="mt-0.5 text-xs font-medium text-red-500">
              {item.lateMinutes} min late
            </p>
          )}
          {item.status === 'completed' && item.completedAction && (
            <p className="mt-0.5 animate-[fadeSlideIn_0.4s_ease-out] text-xs font-medium text-emerald-500 capitalize">
              {item.completedAction}
            </p>
          )}
          {item.status === 'skipped' && (
            <p className="mt-0.5 animate-[fadeSlideIn_0.4s_ease-out] text-xs text-amber-500">Skipped</p>
          )}
        </div>
      </div>

      {/* Quick actions — only show for pending/overdue items */}
      {!isDone && item.quickActions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.quickActions.map((action) => (
            <button
              key={action.value}
              onClick={(e) => {
                e.stopPropagation();
                onQuickAction(item, action.value);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                action.variant === 'primary'
                  ? 'bg-gray-900 text-white hover:bg-gray-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// One row in the unified activity timeline. Built from completed
// schedule items, suction events, and any PRN-given medication that
// doesn't match a scheduled task.
type TimelineKind = 'medication' | 'vitals' | 'intervention' | 'narrative' | 'suction' | 'prn' | 'skipped';

interface TimelineEntry {
  id: string;
  occurredAt: string;     // HH:MM, used for sort + display
  kind: TimelineKind;
  primary: string;        // headline ("Ranitidine 15 mg")
  detail?: string;        // secondary line ("Oral · given")
  meta?: string;          // optional third line (notes / tolerated, etc.)
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// Render a YYYY-MM-DD as a human-friendly date with relative context.
// Examples:
//   today                     → "Today"
//   yesterday                 → "Yesterday"
//   2 days ago, this year     → "Apr 3 · 2 days ago"
//   34 days ago, this year    → "Apr 1 · 34 days ago"
//   prior year                → "Dec 12, 2025 · 5 mo ago"
// Returns the raw string back if it doesn't parse (defensive).
function humanizeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const anchored = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`;
  const d = new Date(anchored);
  if (Number.isNaN(d.getTime())) return dateStr;

  const today = new Date();
  // Compare at day granularity (ignore time of day).
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';

  const sameYear = d.getFullYear() === today.getFullYear();
  const absolute = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  let relative: string;
  if (diffDays > 0 && diffDays < 30) {
    relative = `${diffDays} days ago`;
  } else if (diffDays >= 30 && diffDays < 365) {
    const months = Math.round(diffDays / 30);
    relative = `${months} mo ago`;
  } else if (diffDays >= 365) {
    const years = Math.round(diffDays / 365);
    relative = `${years} yr ago`;
  } else {
    // Future dates — keep simple.
    relative = `in ${Math.abs(diffDays)} days`;
  }

  return `${absolute} · ${relative}`;
}

function formatTimeFromISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

const KIND_STYLES: Record<TimelineKind, { dot: string; label: string }> = {
  medication:   { dot: 'bg-emerald-500',  label: 'Med' },
  vitals:       { dot: 'bg-rose-500',     label: 'Vitals' },
  intervention: { dot: 'bg-violet-500',   label: 'Procedure' },
  narrative:    { dot: 'bg-gray-700',     label: 'Note' },
  suction:      { dot: 'bg-cyan-500',     label: 'Suction' },
  prn:          { dot: 'bg-indigo-500',   label: 'PRN' },
  skipped:      { dot: 'bg-amber-500',    label: 'Skipped' },
};

// Existing schedule body extracted from the original render — overdue +
// upcoming sections still answer "what's still due?" while the new
// Activity Timeline below answers "what already happened?". Per Renee's
// feedback those are two different framings, so we keep them split.
function ScheduleTab({
  items,
  suctionEvents,
  loggedMeds,
  onQuickAction,
}: {
  items: ScheduleItem[];
  suctionEvents: SuctionEvent[];
  loggedMeds: LoggedMed[];
  onQuickAction: (item: ScheduleItem, actionValue: string) => void;
}) {

  const { overdue, upcoming, completed } = useMemo(() => {
    const ov: ScheduleItem[] = [];
    const up: ScheduleItem[] = [];
    const co: ScheduleItem[] = [];

    for (const item of items) {
      if (item.status === 'completed' || item.status === 'skipped') {
        co.push(item);
      } else if (item.status === 'overdue') {
        ov.push(item);
      } else {
        up.push(item);
      }
    }

    return { overdue: ov, upcoming: up, completed: co };
  }, [items]);

  // Group upcoming by time period
  const upcomingGroups = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {};
    for (const item of upcoming) {
      const group = getTimeGroup(item.scheduledTime);
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    }
    return groups;
  }, [upcoming]);

  const groupIcons: Record<string, string> = {
    Morning: '\u2600\uFE0F',
    Afternoon: '\u26C5',
    Evening: '\uD83C\uDF19',
  };

  // Build the unified Activity Timeline: every event that already
  // happened during the visit, sorted by event time. Sources:
  //   1. Completed / skipped scheduled tasks (med, vitals, intervention,
  //      narrative)
  //   2. All suction events
  //   3. PRN-given medications \u2014 i.e. given meds that don't fuzzy-match
  //      any scheduled medication label. Without this filter the
  //      scheduled meds would appear twice.
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    // 1. Completed/skipped scheduled items
    for (const item of completed) {
      const isSkipped = item.status === 'skipped';
      const time = item.completedAt ?? item.scheduledTime;
      let kind: TimelineKind;
      let primary = item.label;
      let detail = '';
      if (isSkipped) {
        kind = 'skipped';
        detail = `Skipped${item.completedAction ? ' \u00B7 ' + item.completedAction : ''}`;
      } else if (item.type === 'medication') {
        kind = 'medication';
        const dosePart = [item.dose, item.route].filter((p): p is string => Boolean(p)).join(' \u00B7 ');
        primary = `${item.label}${item.dose ? ' ' + item.dose : ''}`;
        detail = dosePart ? `${dosePart} \u00B7 given` : 'Given';
      } else if (item.type === 'vitals') {
        kind = 'vitals';
        detail = item.completedAction ?? 'Recorded';
      } else if (item.type === 'narrative') {
        kind = 'narrative';
        detail = 'Documented';
      } else {
        kind = 'intervention';
        detail = item.completedAction ?? 'Done';
      }
      entries.push({
        id: `task-${item.id}`,
        occurredAt: time,
        kind,
        primary,
        detail: detail || undefined,
      });
    }

    // 2. Suction events
    for (const e of suctionEvents) {
      const detailBits = [e.amount, e.color, e.consistency]
        .filter((v): v is string => Boolean(v));
      entries.push({
        id: `suction-${e.id}`,
        occurredAt: formatTimeFromISO(e.occurred_at),
        kind: 'suction',
        primary: `${capitalize(e.route)} suction \u00B7 ${e.count > 1 ? `${e.count} passes` : '1 pass'}`,
        detail: detailBits.length ? detailBits.join(' \u00B7 ').toLowerCase() : undefined,
        meta: e.notes ?? undefined,
      });
    }

    // 3. PRN admins \u2014 given meds with no scheduled-task match.
    // Group by drug name so a med given five times becomes ONE timeline
    // row ("Acetaminophen \u00B7 PRN given (5\u00D7) \u00B7 last 10:15") instead of
    // flooding the list. Mirrors the consolidation pattern already used
    // for suction events and the "Given 5\u00D7" pill on the PRN tab order
    // cards. The full per-event detail still lives in the conversation
    // transcript and the visit export.
    const prnGroups = new Map<
      string,
      { name: string; count: number; latestTime: string }
    >();
    for (const m of loggedMeds) {
      if (!m.given) continue;
      const matchesScheduled = items.some(
        (si) => si.type === 'medication' && fuzzyMatch(si.label, m.name),
      );
      if (matchesScheduled) continue;

      const src = m.administered_at ?? m.recorded_at;
      const time = src ? formatTimeFromISO(src) : '';
      const key = m.name.toLowerCase().trim();
      const prev = prnGroups.get(key);
      if (!prev) {
        prnGroups.set(key, { name: m.name, count: 1, latestTime: time });
      } else {
        prev.count += 1;
        // Lexicographic compare works on zero-padded HH:MM strings.
        if (time && time > prev.latestTime) prev.latestTime = time;
      }
    }
    for (const [key, g] of prnGroups) {
      entries.push({
        id: `prn-${key}`,
        occurredAt: g.latestTime,
        kind: 'prn',
        primary: `${g.name} \u00B7 PRN given${g.count > 1 ? ` (${g.count}\u00D7)` : ''}`,
        detail: g.count > 1 ? `Last given at ${g.latestTime}` : undefined,
      });
    }

    // Sort ascending by HH:MM. Strings sort lexicographically which is
    // correct for zero-padded 24-hour times. Empty times sort first.
    return entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }, [completed, suctionEvents, loggedMeds, items]);

  return (
    <>
      {/* Overdue section */}
      {overdue.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              <h3 className="text-[11px] font-semibold tracking-widest text-red-600 uppercase">
                Overdue
              </h3>
            </div>
            <div className="space-y-2">
              {overdue.map((item) => (
                <ScheduleCard
                  key={item.id}
                  item={item}
                  isOverdue
                  onQuickAction={onQuickAction}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming section */}
        {upcoming.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-900" />
              <h3 className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
                Upcoming · Grouped by time
              </h3>
            </div>

            {Object.entries(upcomingGroups).map(([group, groupItems]) => (
              <div key={group} className="mb-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="text-xs">{groupIcons[group] ?? ''}</span>
                  <span className="text-xs font-medium text-gray-500">
                    {group} ({groupItems.length}{' '}
                    {groupItems.length === 1 ? 'item' : 'items'})
                  </span>
                </div>
                <div className="space-y-2">
                  {groupItems.map((item) => (
                    <ScheduleCard
                      key={item.id}
                      item={item}
                      onQuickAction={onQuickAction}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Activity Timeline — every event that already happened, in
          chronological order. Replaces the old Completed list and the
          separate Suction log. */}
      {timelineEntries.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <h3 className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
              Activity today ({timelineEntries.length})
            </h3>
          </div>
          <ol className="relative ml-1.5 border-l border-gray-200">
            {timelineEntries.map((e, i) => {
              const style = KIND_STYLES[e.kind];
              const isLast = i === timelineEntries.length - 1;
              return (
                <li
                  key={e.id}
                  className={`relative ${isLast ? '' : 'pb-3'} pl-4`}
                >
                  {/* Dot — sits ON the rail, hence -left-[5px] to center */}
                  <span
                    className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${style.dot}`}
                  />
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs font-medium text-gray-900">
                      {e.primary}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                      {e.occurredAt}
                    </span>
                  </div>
                  {e.detail && (
                    <p className="mt-0.5 text-[11px] text-gray-500">{e.detail}</p>
                  )}
                  {e.meta && (
                    <p className="mt-0.5 text-[11px] italic text-gray-500">
                      {e.meta}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </>
  );
}

// Sticky safety band — code status pill, allergies, PRN-available badge.
// Always visible regardless of which tab is active. Renee + Julie both
// flagged code status + allergies as the two reminders the nurse must
// see at bedside.
function SafetyBand({
  patient,
  prnCount,
}: {
  patient: Patient;
  prnCount: number;
}) {
  const isDnr = /dnr/i.test(patient.cpr_code ?? '');
  const codeBg = isDnr ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700';
  const codeDot = isDnr ? 'bg-red-500' : 'bg-emerald-500';
  const allergies = patient.allergies?.join(', ') || 'None on file';
  const allergyHasReal =
    (patient.allergies?.length ?? 0) > 0 &&
    !/no known/i.test(patient.allergies.join(', '));

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${codeBg}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${codeDot}`} />
          {patient.cpr_code ?? 'Code unknown'}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            allergyHasReal ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
          }`}
          title={`Allergies: ${allergies}`}
        >
          {allergyHasReal && (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          )}
          <span className="max-w-[180px] truncate">{allergies}</span>
        </span>
        {prnCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {prnCount} PRN{prnCount === 1 ? '' : 's'} available
          </span>
        )}
      </div>
    </div>
  );
}

// Synthesize a ScheduleItem from a PRN order so the existing
// MedicationForm flow handles logging — same time-required input,
// same DB write, same chat transcript. Marking isPrn switches the
// confirmation header from "Scheduled HH:MM" to a "PRN" badge.
function prnAsScheduleItem(order: PrnOrder): ScheduleItem {
  return {
    id: `prn-${order.id}`,
    type: 'medication',
    status: 'pending',
    scheduledTime: '00:00',
    label: order.medication,
    sublabel: '',
    quickActions: [],
    dose: order.dose,
    concentration: null,
    route: order.route,
    indication: order.indication,
    instructions: order.notes,
    isPrn: true,
    maxFrequencyHours: order.max_frequency_hours,
  };
}

// Resolve "given today" stats for a PRN by fuzzy-matching against
// logged meds. Returns null when nothing matches.
function givenStatsFor(
  orderName: string,
  loggedMeds: LoggedMed[],
): { count: number; lastTime: string } | null {
  const matches = loggedMeds
    .filter((m) => m.given && m.name.toLowerCase().includes(orderName.toLowerCase()))
    .sort((a, b) => {
      const ta = new Date(a.administered_at ?? a.recorded_at).getTime();
      const tb = new Date(b.administered_at ?? b.recorded_at).getTime();
      return tb - ta;
    });
  if (matches.length === 0) return null;
  const m = matches[0];
  const src = m.administered_at ?? m.recorded_at;
  if (!src) return null;
  const d = new Date(src);
  if (Number.isNaN(d.getTime())) return null;
  return {
    count: matches.length,
    lastTime: d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

function PrnTab({
  prnOrders,
  loggedMeds,
  onQuickAction,
}: {
  prnOrders: PrnOrder[];
  loggedMeds: LoggedMed[];
  onQuickAction: (item: ScheduleItem, actionValue: string) => void;
}) {
  if (prnOrders.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-gray-400">
        No PRN orders on file for this patient.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="mb-3 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
        Available as needed ({prnOrders.length})
      </p>
      {prnOrders.map((order) => {
        const stats = givenStatsFor(order.medication, loggedMeds);
        const freq = order.max_frequency_hours
          ? ` · max q${order.max_frequency_hours}h`
          : '';
        return (
          <div
            key={order.id}
            className={`rounded-xl border p-3 transition-colors ${
              stats
                ? 'border-emerald-200 bg-emerald-50/60'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {order.medication}
                  </p>
                  {stats && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Given {stats.count > 1 ? `${stats.count}× ` : ''}today
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-700">
                  {order.dose} · {order.route}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  For: {order.indication}
                  {freq}
                </p>
                {order.notes && (
                  <p className="mt-1 text-[11px] italic text-gray-500">
                    {order.notes}
                  </p>
                )}
                {stats && (
                  <p className="mt-1 text-[11px] tabular-nums text-emerald-700">
                    Last given at {stats.lastTime}
                  </p>
                )}
              </div>
              <button
                onClick={() =>
                  onQuickAction(prnAsScheduleItem(order), 'med_given')
                }
                className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
              >
                {stats ? 'Log again' : 'Log given'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PatientTab({ patient }: { patient: Patient }) {
  const careNote = getCareNote(patient.id);
  const phoneHref = patient.emergency_contact_phone
    ? `tel:${patient.emergency_contact_phone.replace(/[^\d+]/g, '')}`
    : null;

  return (
    <div className="space-y-5">
      {/* Diagnosis */}
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
          Diagnosis
        </h3>
        <p className="text-sm text-gray-900">{patient.primary_diagnosis}</p>
      </section>

      {/* Last vitals — weight is the comparison baseline for the
          weight-gain alert nurses already trust. */}
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
          Last vitals
        </h3>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-gray-500">Weight</dt>
          <dd className="text-gray-900 tabular-nums">
            {patient.last_weight_lbs} lbs
          </dd>
          <dt className="text-gray-500">Height</dt>
          <dd className="text-gray-900 tabular-nums">
            {patient.last_height_inches} in
          </dd>
          <dt className="text-gray-500">Recorded</dt>
          <dd className="text-gray-900">{humanizeDate(patient.last_vitals_date)}</dd>
        </dl>
      </section>

      {/* Emergency contact — tap-to-call for tablet workflow. */}
      <section>
        <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
          Emergency contact
        </h3>
        <p className="text-sm text-gray-900">
          {patient.emergency_contact_name}{' '}
          <span className="text-xs text-gray-500">
            · {patient.emergency_contact_relation}
          </span>
        </p>
        {phoneHref ? (
          <a
            href={phoneHref}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
            </svg>
            {patient.emergency_contact_phone}
          </a>
        ) : (
          <p className="mt-1 text-sm text-gray-400">No phone on file</p>
        )}
      </section>

      {/* Care notes */}
      {careNote && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
            Care notes
          </h3>
          <p className="text-xs leading-relaxed text-gray-700">{careNote}</p>
        </section>
      )}
    </div>
  );
}

export default function VisitSchedule({
  patient,
  items,
  prnOrders,
  loggedMeds,
  suctionEvents,
  onQuickAction,
}: VisitScheduleProps) {
  const [tab, setTab] = useState<Tab>('schedule');

  const pendingCount = useMemo(
    () => items.filter((i) => i.status === 'pending' || i.status === 'overdue').length,
    [items],
  );

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'schedule', label: 'Schedule', count: pendingCount },
    { id: 'prn',      label: 'PRN',      count: prnOrders.length },
    { id: 'patient',  label: 'Patient' },
  ];

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS_CSS }} />

      <SafetyBand patient={patient} prnCount={prnOrders.length} />

      {/* Tab bar */}
      <nav className="flex border-b border-gray-200 bg-white" role="tablist">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                    active ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto px-6 pb-4 pt-3">
        {tab === 'schedule' && (
          <ScheduleTab
            items={items}
            suctionEvents={suctionEvents}
            loggedMeds={loggedMeds}
            onQuickAction={onQuickAction}
          />
        )}
        {tab === 'prn' && (
          <PrnTab
            prnOrders={prnOrders}
            loggedMeds={loggedMeds}
            onQuickAction={onQuickAction}
          />
        )}
        {tab === 'patient' && <PatientTab patient={patient} />}
      </div>

      {/* Footer bar */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-amber-50 px-6 py-3">
        <div>
          <span className="text-sm font-semibold text-gray-900">
            {pendingCount} pending
          </span>
          <p className="text-xs text-gray-500">Verify all before closing</p>
        </div>
        <button
          disabled={pendingCount > 0}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          Close out visit
        </button>
      </div>
    </div>
  );
}
