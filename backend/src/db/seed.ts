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

  console.log('[seed] Database seeded successfully');
}
