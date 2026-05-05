import { pool } from './pool';
import type {
  Patient, Visit, VitalSigns, Intervention,
  Medication, Narrative, ConversationMessage,
  SuctionEvent, SuctionRoute,
} from '../types';

// ─── Patients ────────────────────────────────────────────────

export async function getPatients(): Promise<Patient[]> {
  const { rows } = await pool.query(
    `SELECT id, kantime_patient_id, full_name, date_of_birth,
            age_months, age_years, allergies, primary_diagnosis,
            cpr_code, last_weight_lbs, last_height_inches,
            last_vitals_date, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation
     FROM patients ORDER BY full_name`,
  );
  return rows;
}

// ─── Visits ──────────────────────────────────────────────────

export async function getVisitsByNurseId(nurseId: string): Promise<(Visit & { patient_name: string })[]> {
  const { rows } = await pool.query(
    `SELECT v.id, v.patient_id, v.nurse_id, v.visit_date,
            v.planned_start_time::text, v.planned_end_time::text,
            v.service_type, v.payer, v.status,
            p.full_name AS patient_name
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.nurse_id = $1 AND v.visit_date = CURRENT_DATE
     ORDER BY v.planned_start_time`,
    [nurseId],
  );
  return rows;
}

export async function getVisitWithPatient(visitId: string): Promise<{ visit: Visit; patient: Patient } | null> {
  const { rows } = await pool.query(
    `SELECT
       v.id AS v_id, v.patient_id, v.nurse_id, v.visit_date,
       v.planned_start_time::text, v.planned_end_time::text,
       v.service_type, v.payer, v.status,
       p.id AS p_id, p.kantime_patient_id, p.full_name, p.date_of_birth,
       p.age_months, p.age_years, p.allergies, p.primary_diagnosis,
       p.cpr_code, p.last_weight_lbs, p.last_height_inches,
       p.last_vitals_date, p.emergency_contact_name,
       p.emergency_contact_phone, p.emergency_contact_relation
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = $1`,
    [visitId],
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  const visit: Visit = {
    id: r.v_id,
    patient_id: r.patient_id,
    nurse_id: r.nurse_id,
    visit_date: r.visit_date,
    planned_start_time: r.planned_start_time,
    planned_end_time: r.planned_end_time,
    service_type: r.service_type,
    payer: r.payer,
    status: r.status,
  };
  const patient: Patient = {
    id: r.p_id,
    kantime_patient_id: r.kantime_patient_id,
    full_name: r.full_name,
    date_of_birth: r.date_of_birth,
    age_months: r.age_months,
    age_years: r.age_years,
    allergies: r.allergies,
    primary_diagnosis: r.primary_diagnosis,
    cpr_code: r.cpr_code,
    last_weight_lbs: parseFloat(r.last_weight_lbs),
    last_height_inches: parseFloat(r.last_height_inches),
    last_vitals_date: r.last_vitals_date,
    emergency_contact_name: r.emergency_contact_name,
    emergency_contact_phone: r.emergency_contact_phone,
    emergency_contact_relation: r.emergency_contact_relation,
  };
  return { visit, patient };
}

// ─── Conversation ────────────────────────────────────────────

export async function getConversationHistory(visitId: string): Promise<ConversationMessage[]> {
  const { rows } = await pool.query(
    `SELECT id, visit_id, role, content, tool_name, tool_input, tool_result, created_at
     FROM conversation_messages
     WHERE visit_id = $1
     ORDER BY created_at ASC`,
    [visitId],
  );
  return rows;
}

export async function saveMessage(
  visitId: string,
  role: string,
  content: string | null,
  toolName?: string,
  toolInput?: Record<string, unknown>,
  toolResult?: Record<string, unknown>,
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO conversation_messages (visit_id, role, content, tool_name, tool_input, tool_result)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [visitId, role, content, toolName ?? null, toolInput ? JSON.stringify(toolInput) : null, toolResult ? JSON.stringify(toolResult) : null],
  );
  return rows[0].id;
}

// ─── Vitals ──────────────────────────────────────────────────

export async function saveVitals(
  visitId: string,
  data: Record<string, unknown>,
): Promise<VitalSigns> {
  // occurred_at is the time the nurse observed the vitals — captured
  // explicitly, not auto-stamped, since end-of-shift documentation lags
  // the actual reading. Falls back to recorded_at via DEFAULT now() at
  // read time if the nurse can't recall.
  const occurred = parseTimeInput(data.occurred_at);

  const { rows } = await pool.query(
    `INSERT INTO vital_signs (
       visit_id, bp_systolic, bp_diastolic, heart_rate,
       respiratory_rate, temperature_f, o2_saturation,
       weight_lbs, pain_score, notes, occurred_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      visitId,
      data.bp_systolic ?? null,
      data.bp_diastolic ?? null,
      data.heart_rate ?? null,
      data.respiratory_rate ?? null,
      data.temperature_f ?? null,
      data.o2_saturation ?? null,
      data.weight_lbs ?? null,
      data.pain_score ?? null,
      data.notes ?? null,
      occurred,
    ],
  );
  return rows[0];
}

export async function getVitals(visitId: string): Promise<VitalSigns | null> {
  const { rows } = await pool.query(
    `SELECT * FROM vital_signs WHERE visit_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [visitId],
  );
  return rows[0] ?? null;
}

export async function getAllVitals(visitId: string): Promise<VitalSigns[]> {
  const { rows } = await pool.query(
    `SELECT * FROM vital_signs WHERE visit_id = $1 ORDER BY recorded_at ASC`,
    [visitId],
  );
  return rows;
}

// ─── Interventions ───────────────────────────────────────────

export async function saveIntervention(
  visitId: string,
  data: Record<string, unknown>,
): Promise<Intervention> {
  const occurred = parseTimeInput(data.occurred_at);

  const { rows } = await pool.query(
    `INSERT INTO interventions (visit_id, name, description, outcome, occurred_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [visitId, data.name, data.description ?? null, data.outcome ?? null, occurred],
  );
  return rows[0];
}

export async function getInterventions(visitId: string): Promise<Intervention[]> {
  const { rows } = await pool.query(
    `SELECT * FROM interventions WHERE visit_id = $1 ORDER BY recorded_at`,
    [visitId],
  );
  return rows;
}

// ─── Medications ─────────────────────────────────────────────

export async function saveMedication(
  visitId: string,
  data: Record<string, unknown>,
): Promise<Medication> {
  // administered_at is the time the nurse says the dose was given.
  // It must be supplied explicitly — do NOT fall back to now(), because
  // nurses often document an hour or two after the actual administration.
  const adminTime = parseTimeInput(data.administered_at);

  const { rows } = await pool.query(
    `INSERT INTO medications (
       visit_id, name, dose, route, given, reason_withheld, administered_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      visitId,
      data.name,
      data.dose ?? null,
      data.route ?? null,
      data.given,
      data.reason_withheld ?? null,
      adminTime,
    ],
  );
  return rows[0];
}

/**
 * Accepts an ISO-8601 timestamp ("2026-04-30T09:23:00Z"), an HH:MM string
 * ("09:23"), or null/undefined. Returns a Date or null.
 *
 * HH:MM is interpreted as today, local server time. Used for any
 * nurse-reported clinical time (med admin, vitals reading, intervention
 * performed) where we must NOT fall back to now() because charting lags
 * the actual event.
 */
function parseTimeInput(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();

  // HH:MM or HH:MM:SS — anchor to today
  const hhmm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    const sec = hhmm[3] ? Number(hhmm[3]) : 0;
    if (h > 23 || m > 59 || sec > 59) return null;
    const d = new Date();
    d.setHours(h, m, sec, 0);
    return d;
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function getMedications(visitId: string): Promise<Medication[]> {
  const { rows } = await pool.query(
    `SELECT * FROM medications WHERE visit_id = $1 ORDER BY recorded_at`,
    [visitId],
  );
  return rows;
}

// ─── Suction Events ──────────────────────────────────────────

const VALID_SUCTION_ROUTES: readonly SuctionRoute[] = ['nasal', 'oral', 'trach'];

export async function saveSuctionEvent(
  visitId: string,
  data: Record<string, unknown>,
): Promise<SuctionEvent> {
  const route = String(data.route ?? '').toLowerCase().trim() as SuctionRoute;
  if (!VALID_SUCTION_ROUTES.includes(route)) {
    throw new Error(
      `Invalid suction route "${data.route}". Must be one of: ${VALID_SUCTION_ROUTES.join(', ')}`,
    );
  }

  // Same explicit-time contract as medications/vitals/interventions —
  // never auto-stamp. Suctioning is high-frequency and nurses often
  // batch-document, so the event time matters more here than most.
  const occurred = parseTimeInput(data.occurred_at);
  if (!occurred) {
    throw new Error('occurred_at is required for suction events');
  }

  // Coerce count; reject non-positive integers via the DB CHECK constraint.
  const rawCount = data.count;
  const count = typeof rawCount === 'number' ? Math.floor(rawCount) : 1;

  const { rows } = await pool.query(
    `INSERT INTO suction_events (
       visit_id, occurred_at, route, amount, color, consistency, count, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      visitId,
      occurred,
      route,
      data.amount ?? null,
      data.color ?? null,
      data.consistency ?? null,
      count,
      data.notes ?? null,
    ],
  );
  return rows[0];
}

export async function getSuctionEvents(visitId: string): Promise<SuctionEvent[]> {
  const { rows } = await pool.query(
    `SELECT * FROM suction_events WHERE visit_id = $1 ORDER BY occurred_at`,
    [visitId],
  );
  return rows;
}

// ─── Narrative ───────────────────────────────────────────────

export async function upsertNarrative(
  visitId: string,
  content: string,
  patientToleratedOk?: boolean,
  patientToleratedNotes?: string,
): Promise<Narrative> {
  const { rows } = await pool.query(
    `INSERT INTO narratives (visit_id, content, patient_tolerated_ok, patient_tolerated_notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (visit_id) DO UPDATE SET
       content = EXCLUDED.content,
       patient_tolerated_ok = EXCLUDED.patient_tolerated_ok,
       patient_tolerated_notes = EXCLUDED.patient_tolerated_notes,
       updated_at = now()
     RETURNING *`,
    [visitId, content, patientToleratedOk ?? null, patientToleratedNotes ?? null],
  );
  return rows[0];
}

export async function getNarrative(visitId: string): Promise<Narrative | null> {
  const { rows } = await pool.query(
    `SELECT * FROM narratives WHERE visit_id = $1`,
    [visitId],
  );
  return rows[0] ?? null;
}

// ─── Scheduled Tasks ─────────────────────────────────────────

export interface ScheduledTaskRow {
  id: string;
  patient_id: string;
  type: string;
  label: string;
  sublabel: string | null;
  scheduled_time: string;
  sort_order: number;
  // Medication-only fields. Null for vitals/intervention/narrative rows.
  dose: string | null;
  concentration: string | null;
  route: string | null;
  indication: string | null;
  instructions: string | null;
}

export async function getScheduledTasks(patientId: string): Promise<ScheduledTaskRow[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, type, label, sublabel, scheduled_time::text,
            sort_order, dose, concentration, route, indication, instructions
     FROM scheduled_tasks
     WHERE patient_id = $1
     ORDER BY sort_order`,
    [patientId],
  );
  return rows;
}

export interface PrnOrderRow {
  id: string;
  patient_id: string;
  medication: string;
  dose: string;
  route: string;
  indication: string;
  max_frequency_hours: number | null;
  notes: string | null;
  active: boolean;
}

export async function getPrnOrders(patientId: string): Promise<PrnOrderRow[]> {
  const { rows } = await pool.query(
    `SELECT id, patient_id, medication, dose, route, indication,
            max_frequency_hours, notes, active
       FROM patient_prn_orders
      WHERE patient_id = $1 AND active = true
      ORDER BY medication`,
    [patientId],
  );
  return rows;
}
