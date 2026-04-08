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
      ON CONFLICT (id) DO NOTHING`,
      [
        v.id, v.patient_id, v.nurse_id, v.visit_date,
        v.planned_start_time, v.planned_end_time,
        v.service_type, v.payer, v.status,
      ],
    );
  }

  // Scheduled tasks per patient (care plan)
  const SCHEDULED_TASKS = [
    // ── Carlos Mendoza (5mo infant, PDN) ──
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'vitals', label: 'Vital signs check', sublabel: 'Weight, temp, HR, RR, O2 sat', scheduled_time: '08:00', sort_order: 1 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication', label: 'Ranitidine 15mg', sublabel: 'Oral · Twice daily', scheduled_time: '08:15', sort_order: 2 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'Tracheostomy suctioning', sublabel: 'PRN · Check airway patency', scheduled_time: '08:30', sort_order: 3 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'Trach site care', sublabel: 'Clean and assess stoma site', scheduled_time: '08:30', sort_order: 4 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'medication', label: 'Albuterol 1.25mg', sublabel: 'Nebulizer · Every 6h', scheduled_time: '08:45', sort_order: 5 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'intervention', label: 'G-tube feeding', sublabel: 'Formula per dietitian orders', scheduled_time: '08:50', sort_order: 6 },
    { patient_id: '10000000-0000-0000-0000-000000000001', type: 'narrative', label: 'Visit narrative', sublabel: 'Document findings and plan', scheduled_time: '08:55', sort_order: 7 },

    // ── Liam O'Brien (4yo, cerebral palsy) ──
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'vitals', label: 'Vital signs check', sublabel: 'Temp, HR, RR, O2 sat, pain scale', scheduled_time: '13:00', sort_order: 1 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication', label: 'Baclofen 5mg', sublabel: 'Oral · Three times daily', scheduled_time: '13:15', sort_order: 2 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication', label: 'Diazepam 2mg', sublabel: 'Oral · Twice daily', scheduled_time: '13:15', sort_order: 3 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Range of motion exercises', sublabel: 'Upper and lower extremities', scheduled_time: '13:30', sort_order: 4 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'intervention', label: 'Positioning and skin check', sublabel: 'Reposition · Assess pressure areas', scheduled_time: '13:30', sort_order: 5 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'medication', label: 'Glycopyrrolate 1mg', sublabel: 'Oral · Three times daily', scheduled_time: '13:45', sort_order: 6 },
    { patient_id: '10000000-0000-0000-0000-000000000003', type: 'narrative', label: 'Visit narrative', sublabel: 'Document findings and plan', scheduled_time: '13:55', sort_order: 7 },
  ];

  for (const t of SCHEDULED_TASKS) {
    await pool.query(
      `INSERT INTO scheduled_tasks (patient_id, type, label, sublabel, scheduled_time, sort_order)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE NOT EXISTS (
         SELECT 1 FROM scheduled_tasks WHERE patient_id = $1 AND label = $3 AND scheduled_time = $5
       )`,
      [t.patient_id, t.type, t.label, t.sublabel, t.scheduled_time, t.sort_order],
    );
  }

  console.log('[seed] Database seeded successfully');
}
