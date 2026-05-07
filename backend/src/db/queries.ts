import { pool } from './pool';
import type {
  Patient, Visit, VitalSigns, Intervention,
  Medication, Narrative, ConversationMessage,
  SuctionEvent, SuctionRoute,
} from '../types';

// ─── Patients ────────────────────────────────────────────────

export async function getPatientById(patientId: string): Promise<Patient | null> {
  const { rows } = await pool.query(
    `SELECT id, kantime_patient_id, full_name, date_of_birth,
            age_months, age_years, allergies, primary_diagnosis,
            cpr_code, last_weight_lbs, last_height_inches,
            last_vitals_date, emergency_contact_name,
            emergency_contact_phone, emergency_contact_relation
     FROM patients WHERE id = $1`,
    [patientId],
  );
  return rows[0] ?? null;
}

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

// ─── Recent-history brief (for visit-start recap) ────────────

export interface RecentBriefVisitRow {
  visit_id: string;
  visit_date: string;
  planned_start_time: string;
  vitals: Array<{
    bp_systolic: number | null;
    bp_diastolic: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature_f: number | null;
    o2_saturation: number | null;
    pain_score: number | null;
  }>;
  medications: Array<{
    name: string;
    given: boolean;
    reason_withheld: string | null;
  }>;
  narrative: string | null;
}

/**
 * Fetches the last `limit` completed visits for a patient within `daysBack`,
 * each with its vitals, medications, and narrative content. Used to compute
 * recap highlights at visit start. Excludes the in-progress visit if given.
 */
export async function getPatientRecentBrief(
  patientId: string,
  options: { daysBack?: number; limit?: number; excludeVisitId?: string } = {},
): Promise<RecentBriefVisitRow[]> {
  const daysBack = options.daysBack ?? 14;
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);

  const params: unknown[] = [patientId, daysBack];
  let exclude = '';
  if (options.excludeVisitId) {
    params.push(options.excludeVisitId);
    exclude = ` AND v.id <> $${params.length}`;
  }
  params.push(limit);

  const { rows: visits } = await pool.query(
    `SELECT v.id AS visit_id, v.visit_date,
            v.planned_start_time::text AS planned_start_time
     FROM visits v
     WHERE v.patient_id = $1
       AND v.status = 'completed'
       AND v.visit_date >= CURRENT_DATE - ($2::int)
       ${exclude}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  if (visits.length === 0) return [];

  const ids = visits.map((v: { visit_id: string }) => v.visit_id);

  // Pull child rows in three small queries; cheap given limit ≤ 10.
  const [{ rows: vitalsRows }, { rows: medRows }, { rows: narrRows }] = await Promise.all([
    pool.query(
      `SELECT visit_id, bp_systolic, bp_diastolic, heart_rate,
              respiratory_rate, temperature_f, o2_saturation, pain_score,
              occurred_at, recorded_at
       FROM vital_signs
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, COALESCE(occurred_at, recorded_at) ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, name, given, reason_withheld
       FROM medications
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, recorded_at ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, content
       FROM narratives
       WHERE visit_id = ANY($1::uuid[])`,
      [ids],
    ),
  ]);

  return visits.map((v: { visit_id: string; visit_date: unknown; planned_start_time: string }) => ({
    visit_id: v.visit_id,
    visit_date: v.visit_date instanceof Date
      ? v.visit_date.toISOString().split('T')[0]
      : String(v.visit_date).split('T')[0],
    planned_start_time: v.planned_start_time,
    vitals: vitalsRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        bp_systolic:      r.bp_systolic      as number | null,
        bp_diastolic:     r.bp_diastolic     as number | null,
        heart_rate:       r.heart_rate       as number | null,
        respiratory_rate: r.respiratory_rate as number | null,
        temperature_f:    r.temperature_f != null ? Number(r.temperature_f) : null,
        o2_saturation:    r.o2_saturation    as number | null,
        pain_score:       r.pain_score       as number | null,
      })),
    medications: medRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: { name: string; given: boolean; reason_withheld: string | null }) => ({
        name: r.name,
        given: r.given,
        reason_withheld: r.reason_withheld,
      })),
    narrative: narrRows.find((r: { visit_id: string }) => r.visit_id === v.visit_id)?.content ?? null,
  }));
}

// ─── Patient History Search (Aria Q&A tool) ──────────────────

export interface PatientHistoryQuery {
  query?: string;
  medicationName?: string;
  daysBack?: number;
  limit?: number;
  excludeVisitId?: string;
}

export interface PatientHistoryVisit {
  visit_id: string;
  visit_date: string;
  narrative: string | null;
  narrative_match_excerpt: string | null;
  vitals: Array<{
    bp_systolic: number | null;
    bp_diastolic: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature_f: number | null;
    o2_saturation: number | null;
    pain_score: number | null;
    occurred_at: string | null;
  }>;
  medications: Array<{
    name: string;
    dose: string | null;
    route: string | null;
    given: boolean;
    reason_withheld: string | null;
    administered_at: string | null;
  }>;
}

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, '\\$1');
}

function excerptAround(content: string, query: string, window = 120): string | null {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - Math.floor(window / 2));
  const end = Math.min(content.length, idx + query.length + Math.floor(window / 2));
  const slice = content.slice(start, end).replace(/\s+/g, ' ').trim();
  const prefix = start > 0 ? '…' : '';
  const suffix = end < content.length ? '…' : '';
  return `${prefix}${slice}${suffix}`;
}

/**
 * Searches a patient's past completed visits by free-text and/or medication
 * name, returning fully-joined visits with vitals, medications, and the
 * narrative content. Used by Aria's `search_patient_history` tool — keep
 * the response shape stable so the model has predictable structure.
 */
export async function searchPatientHistory(
  patientId: string,
  opts: PatientHistoryQuery = {},
): Promise<PatientHistoryVisit[]> {
  const daysBack = Math.min(Math.max(opts.daysBack ?? 14, 1), 90);
  const limit    = Math.min(Math.max(opts.limit    ?? 5,  1), 20);

  const params: unknown[] = [patientId, daysBack];
  const where: string[] = [
    `v.patient_id = $1`,
    `v.status = 'completed'`,
    `v.visit_date >= CURRENT_DATE - ($2::int)`,
  ];

  if (opts.excludeVisitId) {
    params.push(opts.excludeVisitId);
    where.push(`v.id <> $${params.length}`);
  }

  if (opts.query && opts.query.trim()) {
    params.push(`%${escapeLike(opts.query.trim())}%`);
    const idx = params.length;
    where.push(`n.content ILIKE $${idx}`);
  }

  if (opts.medicationName && opts.medicationName.trim()) {
    params.push(`%${escapeLike(opts.medicationName.trim())}%`);
    const idx = params.length;
    where.push(`EXISTS (SELECT 1 FROM medications m WHERE m.visit_id = v.id AND m.name ILIKE $${idx})`);
  }

  params.push(limit);

  const { rows: visitRows } = await pool.query(
    `SELECT v.id AS visit_id, v.visit_date, n.content AS narrative
     FROM visits v
     LEFT JOIN narratives n ON n.visit_id = v.id
     WHERE ${where.join(' AND ')}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  if (visitRows.length === 0) return [];
  const ids = visitRows.map((r: { visit_id: string }) => r.visit_id);

  // For medication-name searches, only return matching meds (not every med
  // on those days) — keeps the tool response focused on what the nurse
  // asked about. Other queries get the full med list.
  const medParams: unknown[] = [ids];
  let medFilter = '';
  if (opts.medicationName && opts.medicationName.trim()) {
    medParams.push(`%${escapeLike(opts.medicationName.trim())}%`);
    medFilter = ` AND name ILIKE $${medParams.length}`;
  }

  const [{ rows: vitalsRows }, { rows: medRows }] = await Promise.all([
    pool.query(
      `SELECT visit_id, bp_systolic, bp_diastolic, heart_rate,
              respiratory_rate, temperature_f, o2_saturation, pain_score,
              occurred_at
       FROM vital_signs
       WHERE visit_id = ANY($1::uuid[])
       ORDER BY visit_id, COALESCE(occurred_at, recorded_at) ASC`,
      [ids],
    ),
    pool.query(
      `SELECT visit_id, name, dose, route, given, reason_withheld, administered_at
       FROM medications
       WHERE visit_id = ANY($1::uuid[])${medFilter}
       ORDER BY visit_id, COALESCE(administered_at, recorded_at) ASC`,
      medParams,
    ),
  ]);

  return visitRows.map((v: { visit_id: string; visit_date: unknown; narrative: string | null }) => ({
    visit_id: v.visit_id,
    visit_date: v.visit_date instanceof Date
      ? v.visit_date.toISOString().split('T')[0]
      : String(v.visit_date).split('T')[0],
    narrative: v.narrative,
    narrative_match_excerpt: opts.query && v.narrative
      ? excerptAround(v.narrative, opts.query)
      : null,
    vitals: vitalsRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        bp_systolic:      r.bp_systolic      as number | null,
        bp_diastolic:     r.bp_diastolic     as number | null,
        heart_rate:       r.heart_rate       as number | null,
        respiratory_rate: r.respiratory_rate as number | null,
        temperature_f:    r.temperature_f != null ? Number(r.temperature_f) : null,
        o2_saturation:    r.o2_saturation    as number | null,
        pain_score:       r.pain_score       as number | null,
        occurred_at:      (r.occurred_at instanceof Date)
                            ? r.occurred_at.toISOString()
                            : (r.occurred_at as string | null),
      })),
    medications: medRows
      .filter((r: { visit_id: string }) => r.visit_id === v.visit_id)
      .map((r: Record<string, unknown>) => ({
        name:            r.name as string,
        dose:            r.dose as string | null,
        route:           r.route as string | null,
        given:           r.given as boolean,
        reason_withheld: r.reason_withheld as string | null,
        administered_at: (r.administered_at instanceof Date)
                            ? r.administered_at.toISOString()
                            : (r.administered_at as string | null),
      })),
  }));
}

// ─── Past Visits Search ──────────────────────────────────────

export interface PastVisitSearchOptions {
  patientId?: string;
  q?: string;
  limit?: number;
}

export interface PastVisitRow {
  id: string;
  visit_date: string;
  planned_start_time: string;
  planned_end_time: string;
  service_type: string;
  payer: string | null;
  patient_id: string;
  patient_name: string;
  narrative_excerpt: string | null;
}

export async function searchPastVisits(
  nurseId: string,
  opts: PastVisitSearchOptions = {},
): Promise<PastVisitRow[]> {
  const params: unknown[] = [nurseId];
  const where: string[] = [
    `v.nurse_id = $1`,
    `v.visit_date < CURRENT_DATE`,
    `v.status = 'completed'`,
  ];

  if (opts.patientId) {
    params.push(opts.patientId);
    where.push(`v.patient_id = $${params.length}`);
  }

  if (opts.q && opts.q.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const idx = params.length;
    // Match on narrative content OR patient name; one ILIKE pattern, two columns.
    where.push(`(n.content ILIKE $${idx} OR p.full_name ILIKE $${idx})`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  params.push(limit);

  const { rows } = await pool.query(
    `SELECT v.id, v.visit_date,
            v.planned_start_time::text, v.planned_end_time::text,
            v.service_type, v.payer,
            v.patient_id, p.full_name AS patient_name,
            n.content AS narrative_excerpt
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN narratives n ON n.visit_id = v.id
     WHERE ${where.join(' AND ')}
     ORDER BY v.visit_date DESC, v.planned_start_time DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows;
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
