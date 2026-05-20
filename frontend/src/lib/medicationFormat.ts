// Canonical medication line shared by every place that displays a med:
// schedule cards, the activity timeline, the chat confirmation header,
// the PRN tab, and the patient detail sidebar's PRN section.
//
// Format: "dosis: give <dose> (<equivalent>) · concentration: <concentration> · <route>"
// The equivalent in native units ("5 mL", "0.5 scoop", "2 pills") is
// computed from dose + concentration so the nurse never does math. Each
// labeled segment is dropped when the underlying value is null. The
// "give" verb is part of the dose segment — without a dose there's
// nothing to administer, so we omit it entirely in that case.
export function buildMedLine(
  dose?: string | null,
  concentration?: string | null,
  route?: string | null,
): string {
  const segments: string[] = [];
  if (dose) {
    const equiv = computeEquivalent(dose, concentration);
    segments.push(equiv ? `dosis: give ${dose} (${equiv})` : `dosis: give ${dose}`);
  }
  if (concentration) segments.push(`concentration: ${concentration}`);
  if (route) segments.push(route);
  return segments.join(' · ');
}

// ─── Equivalent-in-native-units computation ──────────────────────────────
//
// Concentration in the seed comes in two shapes:
//   Slash form: "5 mg / 5 mL", "100 mg / mL", "250 mg / 5 mL"
//   Per   form: "17 g per scoop", "3 mg per chewable", "5 mg per pill"
// Both reduce to the same model — "<numAmount> <numUnit> per <denAmount>
// <denUnit>" with denAmount defaulting to 1 when omitted.
//
// Equivalent = dose / (numAmount / denAmount), expressed in denUnit.
// Returns null when the strings can't be parsed or the units don't match
// the dose unit — better to show nothing than to show wrong math.

interface ParsedConcentration {
  numAmount: number;
  numUnit: string;
  denAmount: number;
  denUnit: string;
}

interface ParsedDose {
  amount: number;
  unit: string;
}

const VOLUME_OR_MASS_UNITS = new Set([
  'ml', 'l', 'mg', 'g', 'kg', 'mcg', 'µg', 'oz', 'tsp', 'tbsp',
]);

const PLURAL_OVERRIDES: Record<string, string> = {
  suppository: 'suppositories',
  supp: 'supps',
};

function pluralize(unit: string, count: number): string {
  if (count === 1) return unit;
  const lower = unit.toLowerCase();
  if (VOLUME_OR_MASS_UNITS.has(lower)) return unit;
  return PLURAL_OVERRIDES[lower] ?? `${unit}s`;
}

function formatCount(n: number): string {
  // Two decimals max, trailing zeros trimmed: 5 → "5", 2.5 → "2.5", 0.5 → "0.5".
  return (Math.round(n * 100) / 100).toString();
}

function parseDose(s: string): ParsedDose | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)/.exec(s);
  return m ? { amount: parseFloat(m[1]), unit: m[2] } : null;
}

function parseConcentration(s: string): ParsedConcentration | null {
  const trimmed = s.trim();
  const slash = /^(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)\s*\/\s*(?:(\d+(?:\.\d+)?)\s*)?([a-zA-Zµ]+)$/.exec(trimmed);
  if (slash) {
    return {
      numAmount: parseFloat(slash[1]),
      numUnit: slash[2],
      denAmount: slash[3] ? parseFloat(slash[3]) : 1,
      denUnit: slash[4],
    };
  }
  const per = /^(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)\s+per\s+(?:(\d+(?:\.\d+)?)\s+)?(.+?)$/i.exec(trimmed);
  if (per) {
    return {
      numAmount: parseFloat(per[1]),
      numUnit: per[2],
      denAmount: per[3] ? parseFloat(per[3]) : 1,
      denUnit: per[4].trim(),
    };
  }
  return null;
}

export function computeEquivalent(
  dose: string | null | undefined,
  concentration: string | null | undefined,
): string | null {
  if (!dose || !concentration) return null;
  const d = parseDose(dose);
  const c = parseConcentration(concentration);
  if (!d || !c) return null;
  // Only compute when the dose unit matches the concentration's numerator
  // unit — otherwise we'd need a mass-conversion table and a wrong guess
  // is worse than no guess.
  if (d.unit.toLowerCase() !== c.numUnit.toLowerCase()) return null;
  const ratePerOne = c.numAmount / c.denAmount;
  if (!Number.isFinite(ratePerOne) || ratePerOne === 0) return null;
  const denCount = d.amount / ratePerOne;
  if (!Number.isFinite(denCount)) return null;
  return `${formatCount(denCount)} ${pluralize(c.denUnit, denCount)}`;
}
