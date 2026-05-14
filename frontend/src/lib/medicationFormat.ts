// Canonical medication line shared by every place that displays a med:
// schedule cards, the activity timeline, the chat confirmation header,
// the PRN tab, and the patient detail sidebar's PRN section.
//
// Format: "Give dosis: <dose> · concentration: <concentration> · <route>"
// Each labeled segment is dropped when the underlying value is null. The
// "Give" prefix only appears when a dose is present — without a dose
// there's nothing to administer, so the verb would be misleading.
export function buildMedLine(
  dose?: string | null,
  concentration?: string | null,
  route?: string | null,
): string {
  const segments: string[] = [];
  if (dose) segments.push(`Give dosis: ${dose}`);
  if (concentration) segments.push(`concentration: ${concentration}`);
  if (route) segments.push(route);
  return segments.join(' · ');
}
