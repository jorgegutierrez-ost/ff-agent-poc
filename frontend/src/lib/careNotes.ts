// Per-patient care notes for the demo (POC: hardcoded by patient UUID).
// Lifted out of PatientDetailSidebar so the in-visit Patient tab can use
// the same source of truth without duplicating prose.
//
// In production this would be backed by a "care notes" or "patient
// preferences" table fed from KanTime.

export const CARE_NOTES: Record<string, string> = {
  '10000000-0000-0000-0000-000000000001':
    'Infant on private duty nursing. Watch trach site for redness or secretions. Feeds via G-tube every 3 hours. Mother is primary caregiver and should be updated after each intervention.',
  '10000000-0000-0000-0000-000000000002':
    'Patient prefers morning medications with breakfast. Check blood pressure before administering Metoprolol. Monitor for signs of hypoglycemia and edema.',
  '10000000-0000-0000-0000-000000000003':
    'Patient requires full assist for mobility and transfers. Monitor for seizure activity. Use latex-free gloves only — known latex allergy.',
};

export function getCareNote(patientId: string): string | undefined {
  return CARE_NOTES[patientId];
}
