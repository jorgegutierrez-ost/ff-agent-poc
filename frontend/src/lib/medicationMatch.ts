// Extract the drug/procedure name from a label, stripping common dose units.
export function extractName(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+(\.\d+)?\s*(mg|mcg|ml|g|units?|iu|meq|%)/gi, '')
    .replace(/[^a-z]/g, '')
    .trim();
}

// Compare a scheduled label (e.g. "Ranitidine 15mg") to a logged/tool name
// (e.g. "ranitidine"), ignoring formatting and doses.
export function fuzzyMatch(scheduleLabel: string, toolName: string): boolean {
  const a = scheduleLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = toolName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aName = extractName(scheduleLabel);
  const bName = extractName(toolName);
  if (aName.length > 3 && bName.length > 3) {
    if (aName === bName) return true;
    if (aName.includes(bName) || bName.includes(aName)) return true;
  }

  const aFirst = scheduleLabel.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
  const bFirst = toolName.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
  if (
    aFirst.length > 3 &&
    bFirst.length > 3 &&
    (aFirst === bFirst || aFirst.includes(bFirst) || bFirst.includes(aFirst))
  ) {
    return true;
  }

  return false;
}
