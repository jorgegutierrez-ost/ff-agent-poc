import { useState, useMemo } from 'react';
import type { ScheduleItem } from '../types';

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
  items: ScheduleItem[];
  onQuickAction: (item: ScheduleItem, actionValue: string) => void;
}

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
            {formatTime(item.scheduledTime)}
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

export default function VisitSchedule({ items, onQuickAction }: VisitScheduleProps) {
  const [showCompleted, setShowCompleted] = useState(false);

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

  const pendingCount = overdue.length + upcoming.length;

  const groupIcons: Record<string, string> = {
    Morning: '\u2600\uFE0F',
    Afternoon: '\u26C5',
    Evening: '\uD83C\uDF19',
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: ANIMATIONS_CSS }} />
      <div className="flex-1 overflow-y-auto px-6 pb-4 pt-2">
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

        {/* Completed section */}
        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="mb-2 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span className="text-[11px] font-semibold tracking-widest uppercase">
                Completed ({completed.length})
              </span>
              <svg
                className={`h-3 w-3 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {completed.map((item) => (
                  <ScheduleCard
                    key={item.id}
                    item={item}
                    onQuickAction={onQuickAction}
                  />
                ))}
              </div>
            )}
          </div>
        )}
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
