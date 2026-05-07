import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '../config';
import type { Patient } from '../types';

interface PastVisitsPageProps {
  patients: Patient[];
}

interface PastVisitRow {
  id: string;
  visit_date: string;
  planned_start_time: string;
  planned_end_time: string;
  service_type: string;
  payer: string | null;
  patient_id: string;
  patient_name: string;
  narrative_excerpt: string | null;
}

interface VitalSignsDto {
  id: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature_f: number | null;
  o2_saturation: number | null;
  weight_lbs: number | null;
  pain_score: number | null;
  notes: string | null;
  occurred_at: string | null;
  recorded_at: string;
}

interface MedicationDto {
  id: string;
  name: string;
  dose: string | null;
  route: string | null;
  given: boolean;
  reason_withheld: string | null;
  administered_at: string | null;
  recorded_at: string;
}

interface InterventionDto {
  id: string;
  name: string;
  description: string | null;
  outcome: string | null;
  occurred_at: string | null;
  recorded_at: string;
}

interface SuctionEventDto {
  id: string;
  occurred_at: string;
  route: 'nasal' | 'oral' | 'trach';
  amount: string | null;
  color: string | null;
  consistency: string | null;
  count: number;
  notes: string | null;
}

interface NarrativeDto {
  content: string;
  patient_tolerated_ok: boolean | null;
  patient_tolerated_notes: string | null;
  updated_at: string;
}

interface VisitSummary {
  vitals: VitalSignsDto | null;
  all_vitals: VitalSignsDto[];
  interventions: InterventionDto[];
  medications: MedicationDto[];
  narrative: NarrativeDto | null;
  suction_events: SuctionEventDto[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatLongDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatTimeRange(start: string, end: string): string {
  // Server returns HH:MM:SS — trim the seconds.
  return `${start.slice(0, 5)} – ${end.slice(0, 5)}`;
}

function formatTimeOfDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: false,
  });
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface ExcerptProps {
  content: string;
  query: string;
  maxLen: number;
}

// Renders a narrative excerpt centered on the first match (if any)
// with the matched substring highlighted. Falls back to a leading slice.
function Excerpt({ content, query, maxLen }: ExcerptProps) {
  const trimmed = query.trim();
  if (!trimmed) {
    const text = content.length > maxLen ? content.slice(0, maxLen).trim() + '…' : content;
    return <>{text}</>;
  }

  const lower = content.toLowerCase();
  const idx = lower.indexOf(trimmed.toLowerCase());
  if (idx < 0) {
    const text = content.length > maxLen ? content.slice(0, maxLen).trim() + '…' : content;
    return <>{text}</>;
  }

  const half = Math.floor((maxLen - trimmed.length) / 2);
  const start = Math.max(0, idx - half);
  const end = Math.min(content.length, idx + trimmed.length + half);
  const slice = content.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';

  // Highlight every occurrence of the query inside the slice.
  const re = new RegExp(escapeRegex(trimmed), 'gi');
  const parts: Array<{ text: string; match: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    if (m.index > last) parts.push({ text: slice.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < slice.length) parts.push({ text: slice.slice(last), match: false });

  return (
    <>
      {prefix}
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-amber-900">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
      {suffix}
    </>
  );
}

export default function PastVisitsPage({ patients }: PastVisitsPageProps) {
  const [rows, setRows] = useState<PastVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [patientFilter, setPatientFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VisitSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/visits/past`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load past visits');
        return r.json();
      })
      .then((data: PastVisitRow[]) => {
        setRows(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (patientFilter && r.patient_id !== patientFilter) return false;
      if (!q) return true;
      const haystack = `${r.patient_name} ${r.narrative_excerpt ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, patientFilter]);

  // Auto-select first result when filter/query changes and the current
  // selection is no longer in the result set.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((r) => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Fetch detail when selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    fetch(`${API_BASE}/api/visits/${selectedId}/summary`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Detail load failed'))))
      .then((d: VisitSummary) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const selectedRow = filtered.find((r) => r.id === selectedId) ?? null;

  // Patient filter chips — derived from patients we actually have past
  // visits for (so we don't show a chip that yields zero results).
  const patientChips = useMemo(() => {
    const ids = new Set(rows.map((r) => r.patient_id));
    return patients.filter((p) => ids.has(p.id));
  }, [patients, rows]);

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* ───── Left: list ───── */}
      <div className="flex w-[58%] min-w-0 flex-col border-r border-gray-200">
        <div className="px-8 pt-6 pb-4">
          <p className="text-[11px] font-medium tracking-widest text-gray-400 uppercase">
            HISTORY
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight text-gray-900">
            Past Visits
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Search by patient name or anything in the narrative
          </p>

          <div className="mt-4 relative">
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. seizure, suction, fever..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
          </div>

          {/* Filter chips — only useful with multiple patients in history */}
          {patientChips.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPatientFilter(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  patientFilter === null
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {patientChips.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPatientFilter(p.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    patientFilter === p.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-gray-400">
            {loading
              ? 'Loading…'
              : `${filtered.length} visit${filtered.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">
                {rows.length === 0 ? 'No past visits yet.' : 'No visits match your search.'}
              </p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((r) => {
              const isSelected = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`group flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${
                    isSelected
                      ? 'border-gray-900 bg-gray-900 shadow-lg'
                      : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {getInitials(r.patient_name)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        {r.patient_name}
                      </p>
                      <p className={`shrink-0 text-xs tabular-nums ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                        {formatDate(r.visit_date)}
                      </p>
                    </div>
                    <p className={`mt-0.5 text-xs ${isSelected ? 'text-white/60' : 'text-gray-400'}`}>
                      {formatTimeRange(r.planned_start_time, r.planned_end_time)} · {r.service_type}
                    </p>
                    {r.narrative_excerpt && (
                      <p className={`mt-1.5 text-xs leading-relaxed ${isSelected ? 'text-white/75' : 'text-gray-500'}`}>
                        <Excerpt content={r.narrative_excerpt} query={query} maxLen={180} />
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ───── Right: detail ───── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
        {!selectedRow ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Select a visit to view details</p>
          </div>
        ) : (
          <DetailPanel
            row={selectedRow}
            detail={detail}
            loading={detailLoading}
          />
        )}
      </div>
    </div>
  );
}

interface DetailPanelProps {
  row: PastVisitRow;
  detail: VisitSummary | null;
  loading: boolean;
}

function DetailPanel({ row, detail, loading }: DetailPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 pt-6 pb-5">
        <p className="text-[11px] font-medium tracking-widest text-gray-400 uppercase">
          {formatLongDate(row.visit_date)}
        </p>
        <h2 className="mt-1 text-[20px] font-semibold leading-tight text-gray-900">
          {row.patient_name}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {formatTimeRange(row.planned_start_time, row.planned_end_time)} · {row.service_type}
          {row.payer ? ` · ${row.payer}` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {loading && <p className="text-sm text-gray-400">Loading visit details…</p>}

        {!loading && detail && (
          <>
            {/* Narrative */}
            <Section title="Narrative">
              {detail.narrative ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                  {detail.narrative.content}
                  {detail.narrative.patient_tolerated_notes && (
                    <p className="mt-3 text-xs text-gray-500">
                      <span className="font-medium text-gray-700">Tolerated: </span>
                      {detail.narrative.patient_tolerated_notes}
                    </p>
                  )}
                </div>
              ) : (
                <EmptyHint>No narrative recorded.</EmptyHint>
              )}
            </Section>

            {/* Vitals */}
            <Section title={`Vitals (${detail.all_vitals.length})`}>
              {detail.all_vitals.length === 0 ? (
                <EmptyHint>No vitals recorded.</EmptyHint>
              ) : (
                <div className="space-y-2">
                  {detail.all_vitals.map((v) => (
                    <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                      <p className="text-xs text-gray-400">
                        {formatTimeOfDay(v.occurred_at ?? v.recorded_at)}
                      </p>
                      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700 sm:grid-cols-3">
                        {v.bp_systolic != null && v.bp_diastolic != null && (
                          <Stat label="BP" value={`${v.bp_systolic}/${v.bp_diastolic}`} />
                        )}
                        {v.heart_rate != null && <Stat label="HR" value={`${v.heart_rate}`} />}
                        {v.respiratory_rate != null && <Stat label="RR" value={`${v.respiratory_rate}`} />}
                        {v.temperature_f != null && <Stat label="Temp" value={`${v.temperature_f}°F`} />}
                        {v.o2_saturation != null && <Stat label="SpO₂" value={`${v.o2_saturation}%`} />}
                        {v.weight_lbs != null && <Stat label="Weight" value={`${v.weight_lbs} lb`} />}
                        {v.pain_score != null && <Stat label="Pain" value={`${v.pain_score}/10`} />}
                      </div>
                      {v.notes && <p className="mt-2 text-xs text-gray-500">{v.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Medications */}
            <Section title={`Medications (${detail.medications.length})`}>
              {detail.medications.length === 0 ? (
                <EmptyHint>No medications recorded.</EmptyHint>
              ) : (
                <div className="space-y-2">
                  {detail.medications.map((m) => (
                    <div key={m.id} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
                      <span
                        className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                          m.given ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900">{m.name}</p>
                          <p className="shrink-0 text-xs text-gray-400 tabular-nums">
                            {m.given ? formatTimeOfDay(m.administered_at) : 'Held'}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">
                          {[m.dose, m.route].filter(Boolean).join(' · ')}
                        </p>
                        {!m.given && m.reason_withheld && (
                          <p className="mt-1 text-xs text-amber-700">{m.reason_withheld}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Interventions */}
            <Section title={`Interventions (${detail.interventions.length})`}>
              {detail.interventions.length === 0 ? (
                <EmptyHint>No interventions recorded.</EmptyHint>
              ) : (
                <div className="space-y-2">
                  {detail.interventions.map((i) => (
                    <div key={i.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900">{i.name}</p>
                        <p className="shrink-0 text-xs text-gray-400 tabular-nums">
                          {formatTimeOfDay(i.occurred_at ?? i.recorded_at)}
                        </p>
                      </div>
                      {i.description && (
                        <p className="mt-1 text-xs text-gray-500">{i.description}</p>
                      )}
                      {i.outcome && (
                        <p className="mt-1 text-xs text-gray-600">
                          <span className="font-medium text-gray-700">Outcome: </span>
                          {i.outcome}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Suction Events (only if any) */}
            {detail.suction_events.length > 0 && (
              <Section title={`Suction events (${detail.suction_events.length})`}>
                <div className="space-y-2">
                  {detail.suction_events.map((s) => (
                    <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 capitalize">{s.route} · ×{s.count}</p>
                        <p className="shrink-0 text-xs text-gray-400 tabular-nums">
                          {formatTimeOfDay(s.occurred_at)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {[s.amount, s.color, s.consistency].filter(Boolean).join(' · ')}
                      </p>
                      {s.notes && <p className="mt-1 text-xs text-gray-500">{s.notes}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold tracking-widest text-gray-400 uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-gray-400">{label}: </span>
      <span className="font-medium text-gray-800 tabular-nums">{value}</span>
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-3 text-xs text-gray-400">
      {children}
    </div>
  );
}
