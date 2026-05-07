import { pool } from './pool';

const NURSE = {
  id: '00000000-0000-0000-0000-000000000001',
  full_name: 'Sarah Nguyen',
  credentials: 'RN, BSN',
};

// Per nurse panel feedback: showing two patients on the roster is
// confusing — FF assigns one patient per shift. The demo keeps Liam
// only; Carlos's deterministic UUID is wiped at the start of seed()
// so any prior runs are cleaned up.
const PATIENTS = [
  {
    id: '10000000-0000-0000-0000-000000000003',
    kantime_patient_id: '094720-PDN',
    full_name: "Liam O'Brien",
    date_of_birth: '2021-08-20',
    age_months: null,
    age_years: 4,
    allergies: ['Latex', 'Amoxicillin'],
    primary_diagnosis: 'Cerebral Palsy, spastic quadriplegia (G80.0)',
    cpr_code: 'Full Code',
    last_weight_lbs: 32.5,
    last_height_inches: 38.0,
    last_vitals_date: '2026-04-05',
    emergency_contact_name: "Siobhan O'Brien",
    emergency_contact_phone: '(407) 882-4413',
    emergency_contact_relation: 'Mother',
  },
];

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

const VISITS = [
  {
    id: '20000000-0000-0000-0000-000000000003',
    patient_id: '10000000-0000-0000-0000-000000000003',
    nurse_id: NURSE.id,
    visit_date: todayString(),
    planned_start_time: '13:00',
    planned_end_time: '14:00',
    service_type: 'RN Hourly',
    payer: 'Medicaid',
    status: 'in_progress',
  },
];

// One-shot cleanup: previous seeds inserted Carlos as a second patient.
// We delete his data here so existing dbs converge to the new single-
// patient demo without requiring a manual wipe.
const CARLOS_LEGACY_ID = '10000000-0000-0000-0000-000000000001';
async function removeLegacyCarlos(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id FROM visits WHERE patient_id = $1`,
    [CARLOS_LEGACY_ID],
  );
  const visitIds = rows.map((r: { id: string }) => r.id);
  if (visitIds.length > 0) {
    for (const tbl of [
      'narratives', 'medications', 'interventions',
      'vital_signs', 'suction_events', 'conversation_messages',
    ]) {
      await pool.query(`DELETE FROM ${tbl} WHERE visit_id = ANY($1::uuid[])`, [visitIds]);
    }
    await pool.query(`DELETE FROM visits WHERE id = ANY($1::uuid[])`, [visitIds]);
  }
  await pool.query(`DELETE FROM scheduled_tasks    WHERE patient_id = $1`, [CARLOS_LEGACY_ID]);
  await pool.query(`DELETE FROM patient_prn_orders WHERE patient_id = $1`, [CARLOS_LEGACY_ID]);
  await pool.query(`DELETE FROM patients           WHERE id         = $1`, [CARLOS_LEGACY_ID]);
}

export async function seed(): Promise<void> {
  // Sweep legacy data before reseeding — see comment on removeLegacyCarlos.
  await removeLegacyCarlos();

  // Nurse
  await pool.query(
    `INSERT INTO nurses (id, full_name, credentials)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [NURSE.id, NURSE.full_name, NURSE.credentials],
  );

  // Patients
  for (const p of PATIENTS) {
    await pool.query(
      `INSERT INTO patients (
        id, kantime_patient_id, full_name, date_of_birth, age_months, age_years,
        allergies, primary_diagnosis, cpr_code, last_weight_lbs, last_height_inches,
        last_vitals_date, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.kantime_patient_id, p.full_name, p.date_of_birth,
        p.age_months, p.age_years, p.allergies, p.primary_diagnosis,
        p.cpr_code, p.last_weight_lbs, p.last_height_inches,
        p.last_vitals_date, p.emergency_contact_name,
        p.emergency_contact_phone, p.emergency_contact_relation,
      ],
    );
  }

  // Visits
  for (const v of VISITS) {
    await pool.query(
      `INSERT INTO visits (
        id, patient_id, nurse_id, visit_date, planned_start_time,
        planned_end_time, service_type, payer, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        visit_date = EXCLUDED.visit_date,
        status = EXCLUDED.status,
        planned_start_time = EXCLUDED.planned_start_time,
        planned_end_time = EXCLUDED.planned_end_time`,
      [
        v.id, v.patient_id, v.nurse_id, v.visit_date,
        v.planned_start_time, v.planned_end_time,
        v.service_type, v.payer, v.status,
      ],
    );
  }

  // Scheduled tasks per patient (care plan)
  // Ordered by time within each patient so sort_order aligns with scheduled_time.
  //
  // Medications carry six fields visible on the card without a click
  // (label = drug name; dose; concentration; route; indication; sublabel = frequency)
  // plus an optional `instructions` string for the expanded detail panel.
  // Instructions must reflect physician-entered orders only — never model-sourced.
  const SCHEDULED_TASKS: Array<{
    patient_id: string;
    type: 'vitals' | 'medication' | 'intervention' | 'narrative';
    label: string;
    sublabel: string;
    scheduled_time: string;
    dose?: string;
    concentration?: string;
    route?: string;
    indication?: string;
    instructions?: string;
  }> = [
    // ── Liam O'Brien (4yo, spastic quadriplegic cerebral palsy) ──
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'vitals',       label: 'Vital signs check',        sublabel: 'Temp, HR, RR, O2 sat, pain scale',     scheduled_time: '13:00' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Baclofen',             sublabel: 'Three times daily',     scheduled_time: '13:10',
      dose: '5 mg', concentration: '5 mg / 5 mL', route: 'Oral',
      indication: 'Spasticity management',
      instructions: 'Do not stop abruptly — risk of withdrawal seizures. Notify MD if any dose is missed.' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Diazepam',             sublabel: 'Twice daily',           scheduled_time: '13:15',
      dose: '2 mg', concentration: '5 mg / 5 mL', route: 'Oral',
      indication: 'Muscle spasticity / seizure adjunct',
      instructions: 'Monitor sedation level. Hold and notify MD if respiratory rate < 12.' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Levetiracetam',        sublabel: 'Twice daily',           scheduled_time: '13:20',
      dose: '250 mg', concentration: '100 mg / mL', route: 'Oral',
      indication: 'Seizure prophylaxis',
      instructions: 'Give at consistent times approximately 12 hours apart.' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Gabapentin',           sublabel: 'Three times daily',     scheduled_time: '13:25',
      dose: '100 mg', concentration: '250 mg / 5 mL', route: 'Oral',
      indication: 'Neuropathic pain' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Range of motion exercises',  sublabel: 'Upper and lower extremities',         scheduled_time: '13:30' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Positioning and skin check', sublabel: 'Reposition · Assess pressure areas',  scheduled_time: '13:35' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Polyethylene Glycol 3350', sublabel: 'Once daily',        scheduled_time: '13:40',
      dose: '8.5 g', concentration: '17 g per scoop', route: 'Oral',
      indication: 'Constipation prophylaxis',
      instructions: 'Mix in 4–8 oz of liquid; ensure full dose is consumed.' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Glycopyrrolate',       sublabel: 'Three times daily',     scheduled_time: '13:45',
      dose: '1 mg', concentration: '1 mg / 5 mL', route: 'Oral',
      indication: 'Hypersalivation control',
      instructions: 'Give 30 minutes before meals. Monitor for dry mouth, constipation, urinary retention.' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',
      label: 'Melatonin',            sublabel: 'At bedtime',            scheduled_time: '13:50',
      dose: '3 mg', concentration: '3 mg per chewable', route: 'Oral',
      indication: 'Sleep onset support' },

    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'vitals',       label: 'End-of-shift vitals',       sublabel: 'Repeat core vitals before sign-out',   scheduled_time: '13:55' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'narrative',    label: 'Visit narrative',           sublabel: 'Document findings and plan',           scheduled_time: '13:58' },
  ];

  // Reset scheduled tasks for these patients so the seed list is authoritative.
  // Safe: no FK points back to scheduled_tasks.
  const seedPatientIds = Array.from(new Set(SCHEDULED_TASKS.map((t) => t.patient_id)));
  await pool.query(
    `DELETE FROM scheduled_tasks WHERE patient_id = ANY($1::uuid[])`,
    [seedPatientIds],
  );

  for (let i = 0; i < SCHEDULED_TASKS.length; i++) {
    const t = SCHEDULED_TASKS[i];
    await pool.query(
      `INSERT INTO scheduled_tasks (
         patient_id, type, label, sublabel, scheduled_time, sort_order,
         dose, concentration, route, indication, instructions
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        t.patient_id, t.type, t.label, t.sublabel, t.scheduled_time, i + 1,
        t.dose ?? null, t.concentration ?? null, t.route ?? null,
        t.indication ?? null, t.instructions ?? null,
      ],
    );
  }

  // ── PRN orders (as-needed meds on standing order) ────────────────────
  const PRN_ORDERS = [
    // Liam O'Brien (4yo, spastic quadriplegic CP)
    {
      patient_id: '10000000-0000-0000-0000-000000000003',
      medication: 'Acetaminophen',
      dose: '240mg (7.5mL)',
      route: 'Oral',
      indication: 'Fever ≥ 101°F or pain 4+/10',
      max_frequency_hours: 4,
      notes: 'Max 5 doses in 24h.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000003',
      medication: 'Ibuprofen',
      dose: '100mg (5mL)',
      route: 'Oral',
      indication: 'Pain 5+/10 unrelieved by Acetaminophen',
      max_frequency_hours: 6,
      notes: 'Give with food. Do not combine with ASA.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000003',
      medication: 'Diazepam',
      dose: '2mg',
      route: 'Oral',
      indication: 'Breakthrough spasticity / seizure',
      max_frequency_hours: 8,
      notes: 'Notify MD after any rescue use. Monitor sedation.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000003',
      medication: 'Ondansetron',
      dose: '2mg (ODT)',
      route: 'Oral (dissolvable)',
      indication: 'Nausea / vomiting',
      max_frequency_hours: 8,
      notes: 'Hold feeds 30 min after dose.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000003',
      medication: 'Glycerin suppository',
      dose: '1 pediatric supp',
      route: 'Rectal',
      indication: 'Constipation > 48h',
      max_frequency_hours: 24,
      notes: 'Only if daily PEG has not produced a bowel movement.',
    },
  ];

  const prnPatientIds = Array.from(new Set(PRN_ORDERS.map((o) => o.patient_id)));
  await pool.query(
    `DELETE FROM patient_prn_orders WHERE patient_id = ANY($1::uuid[])`,
    [prnPatientIds],
  );

  for (const o of PRN_ORDERS) {
    await pool.query(
      `INSERT INTO patient_prn_orders
         (patient_id, medication, dose, route, indication, max_frequency_hours, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [o.patient_id, o.medication, o.dose, o.route, o.indication, o.max_frequency_hours, o.notes],
    );
  }

  // ── Past 30 days of completed visits ──────────────────────────────
  // Backfills realistic visit history (vitals, meds, interventions,
  // narrative) for Liam so the Past Visits search and the in-visit
  // recap card have something to land on. Wipe-and-reseed each run so
  // template tweaks (perturbations, narratives) propagate.
  await seedPastVisits();

  console.log('[seed] Database seeded successfully');
}

const LIAM_ID   = '10000000-0000-0000-0000-000000000003';
const PAST_DAYS = 30;

function pastVisitId(dayOffset: number): string {
  // Deterministic UUID per day so re-runs upsert cleanly.
  return `21000000-0000-0000-0000-${dayOffset.toString(16).padStart(12, '0')}`;
}

function dateMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function shiftTime(start: string, addMinutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + addMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Indexes 0, 1, 2 are the flag-triggering narratives — Liam now has a
// visit every past day, so his three most-recent past shifts (d=1, 2, 3)
// land on these slots and the recap card always has signal at visit start.
const LIAM_NARRATIVES = [
  // 0 — seizure (paired with Diazepam PRN)
  "Increased spasticity today, particularly in lower extremities. Diazepam PRN given with good effect within 30 minutes. Mother reports a seizure-like episode last night — duration unclear, under 1 minute. Will follow up with neurology.",
  // 1 — pain (paired with Acetaminophen PRN)
  "Pain rating 4/10 at start of shift; Acetaminophen PRN given. Improved to 1/10 by end. Range of motion completed without resistance. Bowel movement noted after morning PEG dose. Family declined additional teaching today.",
  // 2 — two seizures (paired with Diazepam PRN ×2 and HR perturbation)
  "Concerning shift: two brief seizure episodes observed (approx 30 sec each). Diazepam PRN given after second event. MD notified. Recovered fully between events. Family present and aware. Will continue close monitoring.",
  // 3 — stable filler
  "Liam stable throughout shift. Range of motion exercises tolerated well; mild grimace with right hip flexion noted. All scheduled meds given. Baclofen on time. No seizure activity observed. Skin intact, no breakdown.",
  // 4 — routine filler
  "Routine shift. Levetiracetam given on schedule. Glycopyrrolate given 30 minutes before lunch — drooling well controlled. Repositioned every 2 hours; no skin issues. Mood pleasant; smiled during music therapy.",
  // 5 — tired filler
  "Liam was tired today — slept through most of the visit. Vitals stable. All meds given via mother's preferred technique. No spasticity events. Skin assessment unremarkable. Ondansetron PRN held — no nausea reported.",
  // 6 — skin filler
  "Stable. Range of motion done with both upper and lower extremities. Skin red over right heel — repositioned and applied barrier cream. Will reassess next shift. Melatonin held — given at home per mother. No pain or distress.",
];

interface MedTemplate { name: string; dose: string; route: string; addMin: number; }

const LIAM_MEDS: MedTemplate[] = [
  { name: 'Baclofen',                 dose: '5 mg',   route: 'Oral', addMin: 10 },
  { name: 'Diazepam',                 dose: '2 mg',   route: 'Oral', addMin: 15 },
  { name: 'Levetiracetam',            dose: '250 mg', route: 'Oral', addMin: 20 },
  { name: 'Gabapentin',               dose: '100 mg', route: 'Oral', addMin: 25 },
  { name: 'Polyethylene Glycol 3350', dose: '8.5 g',  route: 'Oral', addMin: 40 },
  { name: 'Glycopyrrolate',           dose: '1 mg',   route: 'Oral', addMin: 45 },
];

interface InterventionTemplate { name: string; description: string; outcome: string; }

const LIAM_INTERVENTIONS: InterventionTemplate[] = [
  { name: 'Range of motion exercises', description: 'Upper and lower extremities', outcome: 'Tolerated well; mild grimace right hip' },
  { name: 'Positioning and skin check', description: 'Repositioned every 2 hours', outcome: 'Skin intact; no pressure areas' },
];

interface PastVitals {
  bp_systolic: number | null; bp_diastolic: number | null;
  heart_rate: number; respiratory_rate: number;
  temperature_f: number; o2_saturation: number;
  weight_lbs: number | null; pain_score: number | null;
}

function liamVitals(dayOffset: number): PastVitals {
  const v = (dayOffset * 11) % 5;
  const base: PastVitals = {
    bp_systolic: 100 + v,
    bp_diastolic: 64 + (v % 4),
    heart_rate: 92 + v,
    respiratory_rate: 20 + (v % 4),
    temperature_f: 98.2 + v / 10,
    o2_saturation: 97 + (v % 3),
    weight_lbs: null,
    pain_score: v % 5,
  };
  // Index 2 = the two-seizures narrative — bump HR above the 120 threshold.
  if ((dayOffset - 1) % 7 === 2) {
    return { ...base, heart_rate: 134 };
  }
  return base;
}

interface PrnAdmin { name: string; dose: string; route: string; addMin: number; }

// PRN admins paired with narratives that already mention them — keeps the
// past-visits view internally consistent and gives the recap card a real
// "PRN given" row to render. narrativeIdx is (dayOffset - 1) % 7.
function prnAdminsFor(narrativeIdx: number): PrnAdmin[] {
  if (narrativeIdx === 0) {
    // "Mother reports a seizure-like episode last night" + Diazepam PRN
    return [{ name: 'Diazepam', dose: '2 mg', route: 'Oral', addMin: 33 }];
  }
  if (narrativeIdx === 1) {
    // "Pain rating 4/10 ... Acetaminophen PRN given"
    return [{ name: 'Acetaminophen', dose: '240 mg (7.5 mL)', route: 'Oral', addMin: 31 }];
  }
  if (narrativeIdx === 2) {
    // "Two brief seizure episodes ... Diazepam PRN given after second event"
    return [
      { name: 'Diazepam', dose: '2 mg', route: 'Oral', addMin: 28 },
      { name: 'Diazepam', dose: '2 mg', route: 'Oral', addMin: 38 },
    ];
  }
  return [];
}

async function seedPastVisits(): Promise<void> {
  // Deterministic IDs let us own these visit rows: wipe child data each run
  // so updates to seed templates (vital perturbations, PRN admins, narrative
  // text) take effect on existing dbs without manual cleanup.
  const pastIds = Array.from({ length: PAST_DAYS }, (_, i) => pastVisitId(i + 1));
  await pool.query(`DELETE FROM narratives    WHERE visit_id = ANY($1::uuid[])`, [pastIds]);
  await pool.query(`DELETE FROM medications   WHERE visit_id = ANY($1::uuid[])`, [pastIds]);
  await pool.query(`DELETE FROM interventions WHERE visit_id = ANY($1::uuid[])`, [pastIds]);
  await pool.query(`DELETE FROM vital_signs   WHERE visit_id = ANY($1::uuid[])`, [pastIds]);

  for (let dayOffset = 1; dayOffset <= PAST_DAYS; dayOffset++) {
    const vId = pastVisitId(dayOffset);
    const visitDate = dateMinus(dayOffset);
    const start = '13:00';
    const end   = '14:00';
    const narrativeIdx = (dayOffset - 1) % 7;

    await pool.query(
      `INSERT INTO visits (
         id, patient_id, nurse_id, visit_date, planned_start_time,
         planned_end_time, service_type, payer, status,
         actual_start_time, actual_end_time
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        vId, LIAM_ID, NURSE.id, visitDate, start, end,
        'RN Hourly', 'Medicaid', 'completed',
        `${visitDate}T${start}:02`, `${visitDate}T${end}:14`,
      ],
    );

    // Vitals
    const v = liamVitals(dayOffset);
    await pool.query(
      `INSERT INTO vital_signs (
         visit_id, bp_systolic, bp_diastolic, heart_rate,
         respiratory_rate, temperature_f, o2_saturation,
         weight_lbs, pain_score, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        vId, v.bp_systolic, v.bp_diastolic, v.heart_rate,
        v.respiratory_rate, v.temperature_f, v.o2_saturation,
        v.weight_lbs, v.pain_score,
        `${visitDate}T${shiftTime(start, 5)}:00`,
      ],
    );

    // Scheduled medications — withhold one every 5 days so the recap card
    // can show a "Med held" pill within the 14-day brief window.
    const meds = LIAM_MEDS;
    const skipIdx = dayOffset % 5 === 0 ? (dayOffset * 3) % meds.length : -1;
    for (let i = 0; i < meds.length; i++) {
      const m = meds[i];
      const given = i !== skipIdx;
      const adminAt = given ? `${visitDate}T${shiftTime(start, m.addMin)}:00` : null;
      await pool.query(
        `INSERT INTO medications (
           visit_id, name, dose, route, given, reason_withheld, administered_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          vId, m.name, m.dose, m.route, given,
          given ? null : 'Held per parent request — patient asleep',
          adminAt,
        ],
      );
    }

    // PRN admins paired with narrative content (so the timeline tells one story)
    for (const p of prnAdminsFor(narrativeIdx)) {
      await pool.query(
        `INSERT INTO medications (
           visit_id, name, dose, route, given, reason_withheld, administered_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [vId, p.name, p.dose, p.route, true, null, `${visitDate}T${shiftTime(start, p.addMin)}:00`],
      );
    }

    // Interventions (1-2 per visit)
    const ints = LIAM_INTERVENTIONS;
    const intCount = Math.min((dayOffset % 3) + 1, ints.length);
    for (let i = 0; i < intCount; i++) {
      const it = ints[i];
      await pool.query(
        `INSERT INTO interventions (
           visit_id, name, description, outcome, occurred_at
         ) VALUES ($1,$2,$3,$4,$5)`,
        [vId, it.name, it.description, it.outcome, `${visitDate}T${shiftTime(start, 30 + i * 10)}:00`],
      );
    }

    // Narrative
    const narrative = LIAM_NARRATIVES[narrativeIdx];
    await pool.query(
      `INSERT INTO narratives (
         visit_id, content, patient_tolerated_ok, patient_tolerated_notes
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (visit_id) DO NOTHING`,
      [vId, narrative, true, null],
    );
  }
}
