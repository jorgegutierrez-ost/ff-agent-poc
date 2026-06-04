// Verbal-order routing destinations surfaced on the change-order
// phone card. James' guidance (2026-06-03): nurses cannot finalize a
// change independently — they submit the request, then call HQ or the
// physician on file for verbal approval. The exact HQ vs physician
// routing per agency may move into the patient record later; for the
// POC the HQ contact is a shared constant and the physician on file
// is looked up by patient id.

export interface OrgContact {
  name: string;
  subtitle: string;
  phone: string;
}

// On-call coordinator at the agency. Same number for every patient.
// Replace with the real Family First on-call line before production.
export const HQ_CONTACT: OrgContact = {
  name: 'Family First HQ',
  subtitle: 'On-call coordinator',
  phone: '(863) 555-0100',
};

// Physician on file per patient. Keyed by patient.id (the UUIDs in
// seed.ts). When a patient has no assigned physician we fall back to
// a generic placeholder so the card still renders something callable.
const PHYSICIAN_BY_PATIENT_ID: Record<string, OrgContact> = {
  // Liam O'Brien — pediatric neurology (CP, spastic quadriplegia)
  '10000000-0000-0000-0000-000000000003': {
    name: 'Dr. Sanjay Patel',
    subtitle: 'Pediatric Neurology · on file',
    phone: '(407) 555-0188',
  },
  // Carlos Mendoza — pediatric pulmonology / LTC
  '10000000-0000-0000-0000-000000000001': {
    name: 'Dr. Elena Ramirez',
    subtitle: 'Pediatric Pulmonology · on file',
    phone: '(863) 555-0144',
  },
  // Dorothy Hargrove — cardiology
  '10000000-0000-0000-0000-000000000002': {
    name: 'Dr. Marcus Whitfield',
    subtitle: 'Cardiology · on file',
    phone: '(863) 555-0177',
  },
};

export function physicianForPatient(patientId: string): OrgContact {
  return (
    PHYSICIAN_BY_PATIENT_ID[patientId] ?? {
      name: 'Physician on file',
      subtitle: 'Not on file — call HQ',
      phone: HQ_CONTACT.phone,
    }
  );
}

// Strip everything that isn't a digit so we can build a tel: URI that
// works on iOS Safari and Android Chrome. The user-facing label still
// shows the formatted number.
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `tel:+1${digits}`;
}
