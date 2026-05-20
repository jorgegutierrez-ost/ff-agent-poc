import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config';
import {
  type Highlight,
  buildResume,
  relativeDay,
} from '../lib/recapHighlights';

interface BriefResponse {
  highlights: Highlight[];
  visitsScanned: number;
}

interface LastShiftHighlightsProps {
  patientId: string;
  visitId: string;
  patientFirstName: string;
}

// ─── Per-flag rendering helpers (used in expanded view) ──────────────────

function flagStyle(kind: Highlight['kind']) {
  switch (kind) {
    case 'withheld_med':
      return { dot: 'bg-amber-500',  label: 'Med held',       bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-900' };
    case 'prn_admin':
      return { dot: 'bg-sky-500',    label: 'PRN given',      bg: 'bg-sky-50',    border: 'border-sky-100',    text: 'text-sky-900' };
    case 'abnormal_vital':
      return { dot: 'bg-rose-500',   label: 'Vital flag',     bg: 'bg-rose-50',   border: 'border-rose-100',   text: 'text-rose-900' };
    case 'narrative_keyword':
      return { dot: 'bg-violet-500', label: 'Narrative flag', bg: 'bg-violet-50', border: 'border-violet-100', text: 'text-violet-900' };
  }
}

function flagDetail(h: Highlight): { primary: string; secondary?: string } {
  switch (h.kind) {
    case 'withheld_med':
      return { primary: `${h.medication} held`, secondary: h.reason ?? undefined };
    case 'prn_admin':
      return { primary: h.count > 1 ? `PRN ${h.medication} ×${h.count}` : `PRN ${h.medication}` };
    case 'abnormal_vital':
      return { primary: `${h.metric} ${h.value}`, secondary: `Threshold ${h.threshold}` };
    case 'narrative_keyword':
      return { primary: `"${h.keyword}"`, secondary: h.excerpt };
  }
}

function groupByDate(highlights: Highlight[]): Array<{ date: string; items: Highlight[] }> {
  const map = new Map<string, Highlight[]>();
  for (const h of highlights) {
    const arr = map.get(h.visitDate) ?? [];
    arr.push(h);
    map.set(h.visitDate, arr);
  }
  return [...map.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Component ───────────────────────────────────────────────────────────

export default function LastShiftHighlights({
  patientId,
  visitId,
  patientFirstName,
}: LastShiftHighlightsProps) {
  const [data, setData] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/patients/${patientId}/recent-brief?excludeVisitId=${visitId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('brief load failed'))))
      .then((d: BriefResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId, visitId]);

  const resume = useMemo(() => {
    if (!data || data.highlights.length === 0) return null;
    return buildResume(data.highlights, data.visitsScanned);
  }, [data]);

  const grouped = useMemo(() => {
    if (!data) return [];
    return groupByDate(data.highlights);
  }, [data]);

  if (loading || dismissed || !data || !resume) return null;

  return (
    <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white">
      {/* ── Summary row (always visible) ── */}
      <div className="flex items-start gap-3 px-6 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.732 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold tracking-widest text-amber-900 uppercase">
              Last shift highlights · {patientFirstName}
            </p>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {resume.counts}
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug text-gray-800">{resume.sentence}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
            aria-expanded={expanded}
          >
            <span>{expanded ? 'Hide' : 'Details'}</span>
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1 text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss highlights"
            title="Dismiss"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Expanded detail (per-visit grouping) ── */}
      {expanded && (
        <div className="border-t border-amber-100 bg-white/60 px-6 py-4">
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.date}>
                <p className="mb-1.5 text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
                  {relativeDay(g.date)} · {new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                <div className="space-y-1.5">
                  {g.items.map((h, i) => {
                    const s = flagStyle(h.kind);
                    const d = flagDetail(h);
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-3 rounded-lg border ${s.border} ${s.bg} px-3 py-2`}
                      >
                        <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${s.text}`}>
                              {s.label}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{d.primary}</span>
                          </div>
                          {d.secondary && (
                            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{d.secondary}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
