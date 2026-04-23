import { pool } from './pool';

const NURSE = {
  id: '00000000-0000-0000-0000-000000000001',
  full_name: 'Sarah Nguyen',
  credentials: 'RN, BSN',
};

const PATIENTS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    kantime_patient_id: '102442-PDN',
    full_name: 'Carlos Mendoza',
    date_of_birth: '2025-11-01',
    age_months: 5,
    age_years: null,
    allergies: ['No Known Allergies'],
    primary_diagnosis: 'Pediatric Long Term Care – PDN',
    cpr_code: 'Full Code',
    last_weight_lbs: 14.2,
    last_height_inches: 23.5,
    last_vitals_date: '2026-04-01',
    emergency_contact_name: 'Maria Mendoza',
    emergency_contact_phone: '(863) 495-5148',
    emergency_contact_relation: 'Mother',
  },
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
    id: '20000000-0000-0000-0000-000000000001',
    patient_id: '10000000-0000-0000-0000-000000000001',
    nurse_id: NURSE.id,
    visit_date: todayString(),
    planned_start_time: '08:00',
    planned_end_time: '09:00',
    service_type: 'RN Hourly',
    payer: 'IHCS',
    status: 'in_progress',
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    patient_id: '10000000-0000-0000-0000-000000000003',
    nurse_id: NURSE.id,
    visit_date: todayString(),
    planned_start_time: '13:00',
    planned_end_time: '14:00',
    service_type: 'RN Hourly',
    payer: 'Medicaid',
    status: 'scheduled',
  },
];

export async function seed(): Promise<void> {
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
      ON CONFLICT (id) DO UPDATE SET visit_date = EXCLUDED.visit_date`,
      [
        v.id, v.patient_id, v.nurse_id, v.visit_date,
        v.planned_start_time, v.planned_end_time,
        v.service_type, v.payer, v.status,
      ],
    );
  }

  // Scheduled tasks per patient (care plan)
  // Ordered by time within each patient so sort_order aligns with scheduled_time.
  const SCHEDULED_TASKS = [
    // ── Carlos Mendoza (5mo infant, PDN with trach + G-tube) ──
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'vitals',       label: 'Vital signs check',       sublabel: 'Weight, temp, HR, RR, O2 sat',   scheduled_time: '08:00' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Ranitidine 15mg',          sublabel: 'Oral · Twice daily',              scheduled_time: '08:10' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Budesonide 0.25mg',        sublabel: 'Nebulizer · Twice daily',         scheduled_time: '08:15' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'Tracheostomy suctioning',  sublabel: 'PRN · Check airway patency',      scheduled_time: '08:20' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'Trach site care',          sublabel: 'Clean and assess stoma site',     scheduled_time: '08:25' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Polyethylene Glycol 0.8g', sublabel: 'Oral · Once daily',               scheduled_time: '08:30' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Vitamin D 400 IU',         sublabel: 'Oral · Once daily',               scheduled_time: '08:35' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Albuterol 1.25mg',         sublabel: 'Nebulizer · Every 6h',            scheduled_time: '08:40' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication',   label: 'Ferrous Sulfate 6.25mg',   sublabel: 'Oral · Once daily',               scheduled_time: '08:45' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'G-tube feeding',           sublabel: 'Formula per dietitian orders',    scheduled_time: '08:50' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'vitals',       label: 'End-of-shift vitals',      sublabel: 'Repeat core vitals before sign-out', scheduled_time: '08:55' },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'narrative',    label: 'Visit narrative',          sublabel: 'Document findings and plan',      scheduled_time: '08:58' },

    // ── Liam O'Brien (4yo, spastic quadriplegic cerebral palsy) ──
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'vitals',       label: 'Vital signs check',        sublabel: 'Temp, HR, RR, O2 sat, pain scale', scheduled_time: '13:00' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Baclofen 5mg',             sublabel: 'Oral · Three times daily',          scheduled_time: '13:10' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Diazepam 2mg',             sublabel: 'Oral · Twice daily',                scheduled_time: '13:15' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Levetiracetam 250mg',      sublabel: 'Oral · Twice daily',                scheduled_time: '13:20' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Gabapentin 100mg',         sublabel: 'Oral · Three times daily',          scheduled_time: '13:25' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Range of motion exercises', sublabel: 'Upper and lower extremities',       scheduled_time: '13:30' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Positioning and skin check', sublabel: 'Reposition · Assess pressure areas', scheduled_time: '13:35' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Polyethylene Glycol 8.5g',  sublabel: 'Oral · Once daily',                 scheduled_time: '13:40' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Glycopyrrolate 1mg',        sublabel: 'Oral · Three times daily',          scheduled_time: '13:45' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication',   label: 'Melatonin 3mg',             sublabel: 'Oral · At bedtime',                 scheduled_time: '13:50' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'vitals',       label: 'End-of-shift vitals',       sublabel: 'Repeat core vitals before sign-out', scheduled_time: '13:55' },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'narrative',    label: 'Visit narrative',           sublabel: 'Document findings and plan',        scheduled_time: '13:58' },
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
      `INSERT INTO scheduled_tasks (patient_id, type, label, sublabel, scheduled_time, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.patient_id, t.type, t.label, t.sublabel, t.scheduled_time, i + 1],
    );
  }

  // ── PRN orders (as-needed meds on standing order) ────────────────────
  const PRN_ORDERS = [
    // Carlos Mendoza (5mo, PDN, trach + G-tube)
    {
      patient_id: '10000000-0000-0000-0000-000000000001',
      medication: 'Acetaminophen',
      dose: '40mg (1.25mL)',
      route: 'Oral / G-tube',
      indication: 'Fever ≥ 101°F or discomfort',
      max_frequency_hours: 4,
      notes: 'Max 5 doses in 24h. Call MD if fever persists > 24h.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000001',
      medication: 'Albuterol',
      dose: '1.25mg',
      route: 'Nebulizer',
      indication: 'Respiratory distress / wheezing',
      max_frequency_hours: 4,
      notes: 'May repeat once after 20 min if no relief. Notify MD after 2 rescue doses.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000001',
      medication: 'Simethicone',
      dose: '20mg (0.3mL)',
      route: 'Oral / G-tube',
      indication: 'Gas / abdominal discomfort',
      max_frequency_hours: 6,
      notes: 'Shake well before administration.',
    },
    {
      patient_id: '10000000-0000-0000-0000-000000000001',
      medication: 'Saline nasal drops',
      dose: '1–2 drops per nostril',
      route: 'Intranasal',
      indication: 'Nasal congestion',
      max_frequency_hours: 4,
      notes: 'Follow with bulb suction if secretions thick.',
    },

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

  console.log('[seed] Database seeded successfully');
}
