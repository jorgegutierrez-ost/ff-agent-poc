import { useState, useMemo } from 'react';
import type { Patient, Visit } from '../types';
import {
  ATTENTION_ITEMS,
  BY_TYPE_COUNTS,
  HOURS_THIS_WEEK,
  type AttentionItem,
  type AttentionStatus,
} from '../lib/dashboardMocks';

interface PatientListPageProps {
  patients: Patient[];
  visits: Visit[];
  onBeginVisit: (patientId: string) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatAge(patient: Patient): string {
  if (patient.age_months != null && patient.age_months > 0 && patient.age_months < 12) {
    return `${patient.age_months} months`;
  }
  if (patient.age_months != null && patient.age_months >= 12) {
    return `${Math.floor(patient.age_months / 12)} years`;
  }
  if (patient.age_years != null) {
    return `${patient.age_years} years`;
  }
  return '';
}

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)} — ${end.slice(0, 5)}`;
}

function formatEyebrowDate(): string {
  return new Date()
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    .toUpperCase();
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getCurrentTime(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Iconography for the attention status badges + by-type list ────
function StatusIcon({ status, className }: { status: AttentionStatus; className?: string }) {
  const cn = className ?? 'h-4 w-4';
  switch (status) {
    case 'not_submitted':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      );
    case 'qa_returned':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      );
    case 'survey':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
        </svg>
      );
    case 'awaiting_signature':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
        </svg>
      );
    case 'care_plan_ack':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case 'messages':
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      );
  }
}

const STATUS_LABEL: Record<AttentionStatus, string> = {
  not_submitted: 'Not submitted',
  qa_returned: 'QA returned',
  survey: 'Survey draft',
  awaiting_signature: 'Awaiting signature',
  care_plan_ack: 'Care plan ack',
  messages: 'Message',
};

// ─── Components ────────────────────────────────────────────────────

function AttentionCard({ item }: { item: AttentionItem }) {
  // Subtle red tint on the icon chip + a colored uppercase badge so the
  // status is readable at a glance without dominating the row.
  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 rounded-xl border border-[#EFEEEC] bg-white px-4 py-3 text-left transition-colors hover:border-[#E5E5E3] hover:bg-[#F8F8F6]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF1ED] text-[#FD593E]">
        <StatusIcon status={item.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF1ED] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#FD593E]">
            <StatusIcon status={item.status} className="h-3 w-3" />
            {STATUS_LABEL[item.status]}
          </span>
          <span className="text-xs text-[#9A9A9A]">{item.age}</span>
        </div>
        <p className="text-sm font-semibold text-[#1B1B1B]">{item.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[#767676]">{item.detail}</p>
      </div>
      <svg className="mt-1 h-4 w-4 shrink-0 text-[#9A9A9A] transition-colors group-hover:text-[#1B1B1B]"
           fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  );
}

function HoursThisWeekCard() {
  const { worked, authorized, perDay } = HOURS_THIS_WEEK;
  const pct = Math.round((worked / authorized) * 100);
  return (
    <div className="rounded-2xl border border-[#EFEEEC] bg-white p-5">
      <p className="eyebrow mb-3">Hours this week</p>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="cairo text-4xl text-[#1B1B1B]">{worked}</span>
        <span className="text-sm text-[#767676]">of {authorized} h auth</span>
        <span className="ml-auto rounded-full bg-[#E4F5EC] px-2 py-0.5 text-[11px] font-semibold text-[#2D9D74]">
          {pct}%
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#F1F0EC]">
        <div className="h-full rounded-full bg-[#1B1B1B]" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="flex items-stretch gap-1.5">
        {perDay.map((d, i) => {
          const isToday = d.state === 'today';
          const isPast  = d.state === 'past';
          const cls = isToday
            ? 'border-[#1B1B1B] bg-[#1B1B1B] text-white'
            : isPast
              ? 'border-[#B7E2CC] bg-[#E4F5EC] text-[#2D9D74]'
              : 'border-[#EFEEEC] bg-white text-[#9A9A9A]';
          return (
            <div
              key={i}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-2 ${cls}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">{d.day}</span>
              <span className="text-[11px] font-semibold tabular-nums">
                {d.hours == null ? '—' : `${d.hours}h`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ByTypeCard() {
  return (
    <div className="rounded-2xl border border-[#EFEEEC] bg-white p-5">
      <p className="eyebrow mb-3">By type</p>
      <ul className="space-y-2.5">
        {BY_TYPE_COUNTS.map((row) => (
          <li key={row.status} className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FFF1ED] text-[#FD593E]">
              <StatusIcon status={row.status} className="h-3.5 w-3.5" />
            </div>
            <span className="flex-1 text-sm text-[#1B1B1B]">{row.label}</span>
            <span className="text-sm font-semibold tabular-nums text-[#1B1B1B]">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WhatLivesHereCard() {
  return (
    <div className="rounded-2xl border border-dashed border-[#E5E5E3] bg-[#F8F8F6] p-5">
      <p className="eyebrow mb-2">What lives here</p>
      <p className="text-xs leading-relaxed text-[#767676]">
        Only items from past shifts or things outside today's visit. Today's tasks — vitals, meds,
        narratives — stay inside Liam's chart so this dashboard doesn't pull you off the floor.
      </p>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────

export default function PatientListPage({
  patients,
  visits,
  onBeginVisit,
}: PatientListPageProps) {
  const [search, setSearch] = useState('');
  const [overdueOpen, setOverdueOpen] = useState(true);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [patients, search]);

  const overdueItems = useMemo(
    () => ATTENTION_ITEMS.filter((i) => i.severity === 'overdue'),
    [],
  );

  const overdueCount   = overdueItems.length;
  const attentionTotal = ATTENTION_ITEMS.length;

  return (
    <div className="flex h-full flex-1 overflow-hidden bg-[#F8F8F6]">
      <div className="flex flex-1 overflow-y-auto">
        {/* ───────── Main column ───────── */}
        <main className="flex-1 px-10 pb-12 pt-6">
          {/* Header */}
          <header className="mb-8 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow mb-1">{formatEyebrowDate()}</p>
              <h1 className="cairo text-3xl text-[#1B1B1B]">
                {getGreeting()}, Sarah
              </h1>
              <p className="mt-2 text-sm text-[#3D3D3D]">
                You have{' '}
                <span className="font-semibold text-[#FD593E]">
                  {overdueCount} overdue item{overdueCount === 1 ? '' : 's'}
                </span>{' '}
                from previous shifts. Next shift starts at 8:00 AM tomorrow.
              </p>
            </div>
            <div className="rounded-full border border-[#EFEEEC] bg-white px-4 py-1.5 text-sm tabular-nums text-[#3D3D3D]">
              {getCurrentTime()}
            </div>
          </header>

          {/* Select your patient */}
          <section className="mb-9">
            <h2 className="text-base font-semibold text-[#1B1B1B]">Select your patient</h2>
            <p className="mt-0.5 text-sm text-[#767676]">
              Search by name or address to begin your visit
            </p>

            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A9A]"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patients..."
                  className="w-full rounded-xl border border-[#E5E5E3] bg-white py-3 pl-11 pr-4 text-sm text-[#1B1B1B] placeholder-[#9A9A9A] outline-none transition-colors focus:border-[#1B1B1B]"
                />
              </div>
              <button
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E3] bg-white text-[#9A9A9A] transition-colors hover:bg-[#F8F8F6] hover:text-[#1B1B1B]"
                title="Voice search"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              </button>
            </div>

            <p className="mt-4 text-xs text-[#9A9A9A]">
              {filteredPatients.length} visit{filteredPatients.length === 1 ? '' : 's'} on your roster today
            </p>

            <div className="mt-3 space-y-2">
              {filteredPatients.map((patient) => {
                const visit = visits.find((v) => v.patient_id === patient.id);
                const statusLabel =
                  visit?.status === 'in_progress' ? 'In Progress'
                  : visit?.status === 'completed' ? 'Complete'
                  : 'Scheduled';
                const statusColor =
                  visit?.status === 'in_progress' ? 'bg-[#FDD26A]'
                  : visit?.status === 'completed' ? 'bg-[#2D9D74]'
                  : 'bg-[#9A9A9A]';
                return (
                  <button
                    key={patient.id}
                    onClick={() => onBeginVisit(patient.id)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-[#EFEEEC] bg-white px-4 py-3.5 text-left transition-all hover:border-[#1B1B1B] hover:shadow-sm"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F0EC] text-sm font-semibold text-[#3D3D3D]">
                      {getInitials(patient.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#1B1B1B]">{patient.full_name}</p>
                      <p className="mt-0.5 text-xs text-[#767676]">
                        {formatAge(patient)}
                        {visit && ` · ${formatTimeRange(visit.planned_start_time, visit.planned_end_time)} · ${visit.service_type}`}
                      </p>
                    </div>
                    {visit && (
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-[#3D3D3D]">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor}`} />
                        {statusLabel}
                      </span>
                    )}
                    <svg className="h-4 w-4 shrink-0 text-[#9A9A9A] transition-colors group-hover:text-[#1B1B1B]"
                         fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                );
              })}
              {filteredPatients.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#E5E5E3] py-10 text-center text-sm text-[#9A9A9A]">
                  No patients match your search.
                </div>
              )}
            </div>
          </section>

          {/* Needs your attention */}
          <section>
            <div className="mb-1 flex items-end justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#1B1B1B]">
                  Needs your attention <span className="text-[#9A9A9A]">({attentionTotal})</span>
                </h2>
                <p className="mt-0.5 text-sm text-[#767676]">
                  From past shifts and items outside today's visit. Today's tasks live inside Liam's chart.
                </p>
              </div>
              <button className="text-xs font-medium text-[#3D3D3D] underline-offset-2 hover:underline">
                See all
              </button>
            </div>

            {/* Overdue accordion */}
            <div className="mt-4 overflow-hidden rounded-xl border border-[#FAD0C2] bg-[#FFF1ED]">
              <button
                type="button"
                onClick={() => setOverdueOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3"
                aria-expanded={overdueOpen}
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-[#FD593E]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#FD593E]" />
                  Overdue · {overdueCount} · Open and resolve first
                </span>
                <svg
                  className={`h-4 w-4 text-[#FD593E] transition-transform ${overdueOpen ? '' : 'rotate-180'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
                </svg>
              </button>
              {overdueOpen && (
                <div className="space-y-2 p-3">
                  {overdueItems.map((item) => (
                    <AttentionCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>

        {/* ───────── Right rail ───────── */}
        <aside className="hidden w-[340px] shrink-0 border-l border-[#EFEEEC] bg-[#F8F8F6] px-6 pb-12 pt-7 lg:block">
          <div className="space-y-4">
            <HoursThisWeekCard />
            <ByTypeCard />
            <WhatLivesHereCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
