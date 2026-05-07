import type { Patient } from '../types';

// Recent-history brief shape — mirrors the rows that come out of
// getPatientRecentBrief(). Kept narrow on purpose: only the fields the
// flag computer reads, so this module stays decoupled from DB types.

export interface BriefVitals {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  respiratory_rate: number | null;
  temperature_f: number | null;
  o2_saturation: number | null;
  pain_score: number | null;
}

export interface BriefMedication {
  name: string;
  given: boolean;
  reason_withheld: string | null;
}

export interface BriefVisit {
  visit_id: string;
  visit_date: string;
  planned_start_time: string;
  vitals: BriefVitals[];
  medications: BriefMedication[];
  narrative: string | null;
}

export type RecapHighlight =
  | { kind: 'withheld_med';      visitDate: string; medication: string; reason: string | null }
  | { kind: 'prn_admin';         visitDate: string; medication: string; count: number }
  | { kind: 'abnormal_vital';    visitDate: string; metric: string; value: string; threshold: string }
  | { kind: 'narrative_keyword'; visitDate: string; keyword: string; excerpt: string };

interface VitalThresholds {
  hr?:   { low: number; high: number };
  rr?:   { low: number; high: number };
  temp?: { low: number; high: number };
  spo2?: { low: number };
  bpSys?: { low: number; high: number };
}

// Pediatric infant (< 1 yr) — wider HR/RR ranges, no BP gate
const INFANT_THRESHOLDS: VitalThresholds = {
  hr:   { low: 90,  high: 160 },
  rr:   { low: 20,  high: 50  },
  temp: { low: 96.0, high: 100.4 },
  spo2: { low: 94 },
};

// Pediatric child (1–12 yr)
const CHILD_THRESHOLDS: VitalThresholds = {
  hr:   { low: 70,  high: 120 },
  rr:   { low: 15,  high: 30  },
  temp: { low: 96.0, high: 100.4 },
  spo2: { low: 94 },
  bpSys:{ low: 80,  high: 120 },
};

// Adult / geriatric — matches systemPrompt CLINICAL AWARENESS limits
const ADULT_THRESHOLDS: VitalThresholds = {
  hr:   { low: 50,  high: 120 },
  rr:   { low: 12,  high: 24  },
  temp: { low: 96.0, high: 100.4 },
  spo2: { low: 94 },
  bpSys:{ low: 90,  high: 180 },
};

function thresholdsFor(patient: Patient): VitalThresholds {
  if (patient.age_months != null && patient.age_months < 12) return INFANT_THRESHOLDS;
  if (patient.age_years != null && patient.age_years <= 12)  return CHILD_THRESHOLDS;
  return ADULT_THRESHOLDS;
}

// Narrative phrases that should always pull a clinician's eye when reviewing
// the prior shift. Keep them clinically meaningful — not generic words like
// "concern" — so the recap card doesn't fire on every visit.
const NARRATIVE_KEYWORDS: RegExp[] = [
  /\bseizur\w*/i,                 // seizure, seizures
  /\bfever\w*/i,
  /\bdesat\w*/i,                  // desat, desaturation
  /\bdistress\b/i,
  /\bbreakthrough\b/i,
  /\bcyanosis\b/i,
  /\baspirat\w*/i,                // aspirate, aspiration, aspirating
  /\bER\b|\bemergency room\b/i,
  /\bhospitali?z\w*/i,
  /\bwheez\w*/i,
  /\bunresponsive\b/i,
  /\bbleeding\b/i,
];

function findKeywordExcerpt(content: string, match: RegExpMatchArray): string {
  const idx = match.index ?? 0;
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + match[0].length + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

/**
 * Pure deterministic flag computer. Given recent visit data and the patient,
 * returns a list of highlights ordered most-recent-first. Intentionally has
 * NO LLM call — the recap card and Aria's prompt both read these rows
 * verbatim, so paraphrasing of clinical detail is impossible.
 */
export function buildRecapHighlights(
  visits: BriefVisit[],
  patient: Patient,
  prnOrderNames: string[] = [],
): RecapHighlight[] {
  const thresholds = thresholdsFor(patient);
  const prnSet = new Set(prnOrderNames.map((n) => n.toLowerCase()));
  const out: RecapHighlight[] = [];

  // Visits are expected pre-sorted DESC by date. Iterate in that order so
  // earlier-out highlights are the most recent.
  for (const v of visits) {
    // Withheld meds — always notable
    for (const m of v.medications) {
      if (!m.given) {
        out.push({
          kind: 'withheld_med',
          visitDate: v.visit_date,
          medication: m.name,
          reason: m.reason_withheld,
        });
      }
    }

    // PRN admins — bucket by drug per visit so 5 doses surface as one row
    const prnGivenCounts = new Map<string, number>();
    for (const m of v.medications) {
      if (m.given && prnSet.has(m.name.toLowerCase())) {
        prnGivenCounts.set(m.name, (prnGivenCounts.get(m.name) ?? 0) + 1);
      }
    }
    for (const [name, count] of prnGivenCounts) {
      out.push({
        kind: 'prn_admin',
        visitDate: v.visit_date,
        medication: name,
        count,
      });
    }

    // Abnormal vitals — earliest reading per visit only, to avoid noise
    if (v.vitals.length > 0) {
      const r = v.vitals[0];
      const checks: Array<{ value: number | null; metric: string; rule?: { low: number; high?: number; cmpHighOnly?: boolean } }> = [
        { value: r.heart_rate,       metric: 'HR',   rule: thresholds.hr ? { low: thresholds.hr.low,  high: thresholds.hr.high }    : undefined },
        { value: r.respiratory_rate, metric: 'RR',   rule: thresholds.rr ? { low: thresholds.rr.low,  high: thresholds.rr.high }    : undefined },
        { value: r.temperature_f,    metric: 'Temp', rule: thresholds.temp ? { low: thresholds.temp.low, high: thresholds.temp.high } : undefined },
        { value: r.bp_systolic,      metric: 'BP',   rule: thresholds.bpSys ? { low: thresholds.bpSys.low, high: thresholds.bpSys.high } : undefined },
      ];
      for (const c of checks) {
        if (c.value == null || !c.rule) continue;
        const { low, high } = c.rule;
        if (high != null && c.value > high) {
          out.push({
            kind: 'abnormal_vital',
            visitDate: v.visit_date,
            metric: c.metric,
            value: String(c.value),
            threshold: `> ${high}`,
          });
        } else if (c.value < low) {
          out.push({
            kind: 'abnormal_vital',
            visitDate: v.visit_date,
            metric: c.metric,
            value: String(c.value),
            threshold: `< ${low}`,
          });
        }
      }
      // SpO2 — low only
      if (r.o2_saturation != null && thresholds.spo2 && r.o2_saturation < thresholds.spo2.low) {
        out.push({
          kind: 'abnormal_vital',
          visitDate: v.visit_date,
          metric: 'SpO₂',
          value: `${r.o2_saturation}%`,
          threshold: `< ${thresholds.spo2.low}%`,
        });
      }
    }

    // Narrative keywords — emit one row per distinct keyword class per visit
    if (v.narrative) {
      const seen = new Set<string>();
      for (const re of NARRATIVE_KEYWORDS) {
        const m = v.narrative.match(re);
        if (!m) continue;
        const word = m[0].toLowerCase();
        if (seen.has(word)) continue;
        seen.add(word);
        out.push({
          kind: 'narrative_keyword',
          visitDate: v.visit_date,
          keyword: m[0],
          excerpt: findKeywordExcerpt(v.narrative, m),
        });
      }
    }
  }

  return out;
}

/**
 * Renders the highlights as a compact text block for injection into Aria's
 * system prompt. If there are no highlights, returns a single line so Aria
 * knows the prior history was unremarkable and skips the recap.
 */
export function renderHighlightsForPrompt(highlights: RecapHighlight[]): string {
  if (highlights.length === 0) {
    return 'No notable findings from the last few shifts.';
  }
  const lines: string[] = [];
  for (const h of highlights) {
    switch (h.kind) {
      case 'withheld_med':
        lines.push(`  • ${h.visitDate} — ${h.medication} held${h.reason ? ` (${h.reason})` : ''}`);
        break;
      case 'prn_admin':
        lines.push(`  • ${h.visitDate} — PRN ${h.medication} given ×${h.count}`);
        break;
      case 'abnormal_vital':
        lines.push(`  • ${h.visitDate} — ${h.metric} ${h.value} (${h.threshold})`);
        break;
      case 'narrative_keyword':
        lines.push(`  • ${h.visitDate} — narrative noted "${h.keyword}": ${h.excerpt}`);
        break;
    }
  }
  return lines.join('\n');
}
