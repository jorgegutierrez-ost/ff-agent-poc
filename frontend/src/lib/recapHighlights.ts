// Pure helpers for rendering the deterministic recap highlights produced
// by /api/patients/:id/recent-brief. Shared between the in-visit
// LastShiftHighlights card and the patient detail sidebar's "Last 3 days"
// section so both speak the same clinical wording.

export type Highlight =
  | { kind: 'withheld_med';      visitDate: string; medication: string; reason: string | null }
  | { kind: 'prn_admin';         visitDate: string; medication: string; count: number }
  | { kind: 'abnormal_vital';    visitDate: string; metric: string; value: string; threshold: string }
  | { kind: 'narrative_keyword'; visitDate: string; keyword: string; excerpt: string };

export const KIND_PRIORITY: Record<Highlight['kind'], number> = {
  abnormal_vital: 0,
  narrative_keyword: 1,
  withheld_med: 2,
  prn_admin: 3,
};

export function relativeDay(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function vitalPhrase(metric: string, value: string): string {
  if (metric === 'SpO₂') return 'a brief desaturation';
  if (metric === 'Temp') return 'an elevated temperature';
  if (metric === 'HR'  ) return 'an abnormal heart rate';
  if (metric === 'RR'  ) return 'an abnormal respiratory rate';
  if (metric === 'BP'  ) return 'an abnormal blood pressure';
  return `${metric} ${value}`;
}

export function highlightClause(h: Highlight): string {
  switch (h.kind) {
    case 'abnormal_vital':
      return `${vitalPhrase(h.metric, h.value)} ${relativeDay(h.visitDate)}`;
    case 'narrative_keyword':
      return `"${h.keyword}" noted ${relativeDay(h.visitDate)}`;
    case 'withheld_med':
      return `${h.medication} held ${relativeDay(h.visitDate)}`;
    case 'prn_admin':
      return h.count > 1
        ? `PRN ${h.medication} given ×${h.count} ${relativeDay(h.visitDate)}`
        : `PRN ${h.medication} given ${relativeDay(h.visitDate)}`;
  }
}

export function humanJoin(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export function buildResume(
  highlights: Highlight[],
  visitsScanned: number,
): { sentence: string; counts: string } {
  const sorted = [...highlights].sort((a, b) => {
    if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]) {
      return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    }
    return b.visitDate.localeCompare(a.visitDate);
  });

  // Pick at most one highlight per distinct visit so the resume spans
  // different days instead of saying the same thing twice for one event.
  const seenDates = new Set<string>();
  const top: Highlight[] = [];
  for (const h of sorted) {
    if (top.length >= 3) break;
    if (seenDates.has(h.visitDate)) continue;
    seenDates.add(h.visitDate);
    top.push(h);
  }
  const remaining = highlights.length - top.length;

  const phrases = top.map(highlightClause);
  let sentence = `Recent shifts had ${humanJoin(phrases)}.`;
  if (remaining > 0) {
    sentence += ` (+${remaining} more)`;
  }

  const total = highlights.length;
  const counts = `${total} flag${total === 1 ? '' : 's'} across ${visitsScanned} shift${visitsScanned === 1 ? '' : 's'}`;
  return { sentence, counts };
}

// Filter highlights to those whose visitDate falls within the last N days
// (today counts as day 0, yesterday as day 1, etc.).
export function filterLastDays(highlights: Highlight[], days: number): Highlight[] {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffMs = cutoff.getTime();
  return highlights.filter((h) => {
    const d = new Date(h.visitDate);
    return !Number.isNaN(d.getTime()) && d.getTime() >= cutoffMs;
  });
}
