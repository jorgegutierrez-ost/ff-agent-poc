// Canonical head-to-toe body systems and the exception flags surfaced
// in the WDL form. Sourced from the KanTime first-inspection screens:
// every flag below maps to a checkbox that appears in the FL variant.
// Keeping the list here (not the database) means a tweak to the form
// doesn't require a migration — and Aria reads the same definition so
// the voice flow stays in sync with the UI checklists.

export interface H2TSystemDef {
  id: string;
  label: string;
  exceptions: string[];
  /** Subform link surfaced in FL mode (vent, suction, seizure, wound).
   *  Empty when the system has no dedicated subform. */
  subforms?: string[];
}

export const HEAD_TO_TOE_SYSTEMS: H2TSystemDef[] = [
  {
    id: 'ent',
    label: 'ENT',
    exceptions: [
      'Airway concern',
      'S/S infection',
      'Ear drainage',
      'Nasal congestion',
    ],
  },
  {
    id: 'cv',
    label: 'Cardiovascular',
    exceptions: [
      'Irregular rhythm',
      'Murmur',
      'Edema',
      'Weak peripheral pulses',
      'Capillary refill > 3 sec',
      'Mottling',
      'Shortness of breath',
    ],
  },
  {
    id: 'resp',
    label: 'Respiratory',
    exceptions: [
      'Rales',
      'Rhonchi',
      'Wheeze',
      'Diminished',
      'Coarse',
      'Dyspnea',
      'Labored breathing',
      'Productive cough',
    ],
    subforms: ['suction_log', 'vent_flow_sheet'],
  },
  {
    id: 'gi',
    label: 'GI & Nutrition',
    exceptions: [
      'Abdomen distended',
      'Abdomen firm',
      'Constipation',
      'Diarrhea',
      'S/S GI bleeding',
      'Dehydration',
      'Appetite changes',
      'Hypoactive bowel sounds',
      'Hyperactive bowel sounds',
      'G-tube site concern',
    ],
  },
  {
    id: 'skin',
    label: 'Skin',
    exceptions: [
      'Rash',
      'Bruising',
      'Irritation',
      'Pale',
      'Dusky',
      'Jaundiced',
      'Mottled',
      'Wound',
      'Ulcer',
      'Diaphoretic',
    ],
    subforms: ['wound_care'],
  },
  {
    id: 'neuro',
    label: 'Neuro',
    exceptions: [
      'Headache',
      'Dizziness',
      'Visual changes',
      'Motor impact',
      'Lethargic',
      'Agitated',
      'Numbness',
      'Sensory loss',
      'Hallucinations',
      'Dysphasia',
      'Seizure activity',
    ],
    subforms: ['seizure_log'],
  },
  {
    id: 'endo',
    label: 'Endocrine / Metabolic',
    exceptions: ['S/S hypoglycemia', 'S/S hyperglycemia'],
  },
  {
    id: 'pain',
    label: 'Pain',
    exceptions: ['Pain present'],
  },
  {
    id: 'gu',
    label: 'Genitourinary',
    exceptions: [
      'Polyuria',
      'Oliguria',
      'Urinary retention',
      'Incontinent',
      'Foley/catheter in place',
      'Abnormal urine color/odor',
    ],
  },
  {
    id: 'msk',
    label: 'Musculoskeletal',
    exceptions: [
      'Unsteady gait',
      'Non-ambulatory',
      'Contracture',
      'Spasticity',
      'Flaccid',
      'Fracture',
      'Uses assistive device',
    ],
  },
  {
    id: 'equipment',
    label: 'Equipment',
    exceptions: ['Equipment malfunction', 'Supplies low'],
  },
  {
    id: 'iv',
    label: 'IV / Vascular access',
    exceptions: ['IV site concern', 'Standard precautions breach'],
  },
];

export const HEAD_TO_TOE_SYSTEM_IDS = HEAD_TO_TOE_SYSTEMS.map((s) => s.id);
