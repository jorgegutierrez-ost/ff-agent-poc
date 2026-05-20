import { pool } from './pool';

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS patients (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kantime_patient_id        TEXT UNIQUE NOT NULL,
  full_name                 TEXT NOT NULL,
  date_of_birth             DATE NOT NULL,
  age_months                INTEGER,
  age_years                 INTEGER,
  allergies                 TEXT[] NOT NULL DEFAULT '{}',
  primary_diagnosis         TEXT,
  cpr_code                  TEXT,
  last_weight_lbs           NUMERIC(6,2),
  last_height_inches        NUMERIC(5,2),
  last_vitals_date          DATE,
  emergency_contact_name    TEXT,
  emergency_contact_phone   TEXT,
  emergency_contact_relation TEXT,
  photo_url                 TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nurses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name   TEXT NOT NULL,
  credentials TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visits (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  nurse_id            UUID NOT NULL REFERENCES nurses(id),
  visit_date          DATE NOT NULL,
  planned_start_time  TIME NOT NULL,
  planned_end_time    TIME NOT NULL,
  actual_start_time   TIMESTAMPTZ,
  actual_end_time     TIMESTAMPTZ,
  service_type        TEXT NOT NULL,
  payer               TEXT,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','in_progress','completed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vital_signs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id          UUID NOT NULL REFERENCES visits(id),
  bp_systolic       INTEGER,
  bp_diastolic      INTEGER,
  heart_rate        INTEGER,
  respiratory_rate  INTEGER,
  temperature_f     NUMERIC(5,2),
  o2_saturation     INTEGER,
  weight_lbs        NUMERIC(6,2),
  pain_score        INTEGER CHECK (pain_score >= 0 AND pain_score <= 10),
  notes             TEXT,
  occurred_at       TIMESTAMPTZ,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id    UUID NOT NULL REFERENCES visits(id),
  name        TEXT NOT NULL,
  description TEXT,
  outcome     TEXT,
  occurred_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id        UUID NOT NULL REFERENCES visits(id),
  name            TEXT NOT NULL,
  dose            TEXT,
  route           TEXT,
  given           BOOLEAN NOT NULL,
  reason_withheld TEXT,
  administered_at TIMESTAMPTZ,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS narratives (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id                UUID NOT NULL REFERENCES visits(id) UNIQUE,
  content                 TEXT NOT NULL,
  patient_tolerated_ok    BOOLEAN,
  patient_tolerated_notes TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  type            TEXT NOT NULL CHECK (type IN ('medication','intervention','vitals','narrative','head_to_toe')),
  label           TEXT NOT NULL,
  sublabel        TEXT,
  scheduled_time  TIME NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  dose            TEXT,
  concentration   TEXT,
  route           TEXT,
  indication      TEXT,
  instructions    TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_patient ON scheduled_tasks(patient_id, sort_order);

CREATE TABLE IF NOT EXISTS patient_prn_orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  medication            TEXT NOT NULL,
  dose                  TEXT NOT NULL,
  route                 TEXT NOT NULL,
  indication            TEXT NOT NULL,
  max_frequency_hours   NUMERIC(5,2),
  notes                 TEXT,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_prn_orders_patient
  ON patient_prn_orders(patient_id)
  WHERE active = true;

-- Suction events live in their own table because suctioning is high-frequency
-- (Renee: 1–20+ per shift), so we want structured per-event rows that can be
-- queried, summarized, and consolidated. The 'count' column lets the nurse
-- log a hour's worth of similar events as one row.
CREATE TABLE IF NOT EXISTS suction_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id      UUID NOT NULL REFERENCES visits(id),
  occurred_at   TIMESTAMPTZ NOT NULL,
  route         TEXT NOT NULL CHECK (route IN ('nasal','oral','trach')),
  amount        TEXT,
  color         TEXT,
  consistency   TEXT,
  count         INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  notes         TEXT,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id    UUID NOT NULL REFERENCES visits(id),
  role        TEXT NOT NULL CHECK (role IN ('user','assistant','tool_use','tool_result')),
  content     TEXT,
  tool_name   TEXT,
  tool_input  JSONB,
  tool_result JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Change orders submitted by a field nurse on behalf of the physician.
-- The KanTime real-world workflow is: nurse gets verbal/pharmacy-label/
-- written-note → enters in KanTime → fax for signature. The change is
-- documentable immediately; signature happens out of band.
-- A row never lives without a documented source of authority (enforced
-- by the CHECK below + the API validators), so a field nurse cannot
-- bypass physician oversight even by editing the DB directly via the
-- POST endpoint.
CREATE TABLE IF NOT EXISTS change_orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id              UUID NOT NULL REFERENCES visits(id),
  patient_id            UUID NOT NULL REFERENCES patients(id),
  -- The scheduled_tasks row this change targets, when the order applies
  -- to an existing scheduled med. Null for "add new medication" rows.
  scheduled_task_id     UUID REFERENCES scheduled_tasks(id) ON DELETE SET NULL,
  medication_name       TEXT NOT NULL,
  change_type           TEXT NOT NULL CHECK (change_type IN ('add','modify_dose','modify_route','modify_frequency','discontinue')),
  -- Snapshot of the pre-change values, captured at submit time so the
  -- audit trail survives later edits to scheduled_tasks.
  old_dose              TEXT,
  old_route             TEXT,
  old_frequency         TEXT,
  new_dose              TEXT,
  new_route             TEXT,
  new_frequency         TEXT,
  new_concentration     TEXT,
  new_indication        TEXT,
  new_instructions      TEXT,
  reason                TEXT,
  source_type           TEXT NOT NULL CHECK (source_type IN ('verbal','pharmacy_label','written_note')),
  -- Source-of-authority details. Free-form to accommodate the three
  -- variants without forcing a join table; the form gathers structured
  -- input and stores the human-readable summary here.
  source_physician      TEXT,
  source_obtained_at    TIMESTAMPTZ,
  source_description    TEXT,
  initiated_by_nurse_id UUID REFERENCES nurses(id),
  notes                 TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_signature'
                          CHECK (status IN ('pending_signature','signed','discontinued','cancelled')),
  fax_sent_at           TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_orders_visit ON change_orders(visit_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_orders_patient_status ON change_orders(patient_id, status);

-- Seizure events logged during a visit. Distinct from interventions
-- because Renee wants the structured KanTime fields (type, LOC,
-- duration) so the chart slices cleanly per event. Multiple events per
-- shift are expected.
CREATE TABLE IF NOT EXISTS seizure_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id          UUID NOT NULL REFERENCES visits(id),
  occurred_at       TIMESTAMPTZ NOT NULL,
  duration_seconds  INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  seizure_type      TEXT,
  loc               TEXT CHECK (loc IS NULL OR loc IN ('alert','oriented','lethargic')),
  intervention      TEXT,
  notes             TEXT,
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seizure_events_visit ON seizure_events(visit_id, occurred_at);

-- Head-to-toe assessment recorded once per visit (regulatory: every
-- shift must include a complete body-systems check before sign-off).
-- Findings are stored as JSONB so we can capture either the simpler
-- "WDL (within defined limits)" style or the FL per-system checklist
-- without a schema migration each time the form evolves. UNIQUE on
-- visit_id enforces "one assessment per visit" (re-saves UPSERT).
CREATE TABLE IF NOT EXISTS head_to_toe_assessments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id      UUID NOT NULL REFERENCES visits(id),
  mode          TEXT NOT NULL CHECK (mode IN ('wdl','checklist')),
  systems       JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_notes TEXT,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

-- Patient identification check performed at the start of each visit.
-- Per regulatory requirement: the nurse must confirm 2+ identifiers
-- before any other documentation. One row per check; we store the
-- selected identifiers (as TEXT[]) plus who confirmed them, with a
-- timestamp for the audit trail.
CREATE TABLE IF NOT EXISTS patient_identification_checks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id        UUID NOT NULL REFERENCES visits(id),
  identifiers     TEXT[] NOT NULL,
  confirmed_with  TEXT,
  notes           TEXT,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);

-- Order changes signed by the physician since the nurse's last visit.
-- Aria surfaces these in the opening message so the nurse acknowledges
-- changes before starting the shift, per the KanTime change-order
-- workflow (verbal order → KanTime entry → fax for signature → sync).
CREATE TABLE IF NOT EXISTS pending_order_changes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id      UUID NOT NULL REFERENCES patients(id),
  change_type     TEXT NOT NULL CHECK (change_type IN ('added','modified','discontinued')),
  medication      TEXT NOT NULL,
  details         TEXT NOT NULL,
  reason          TEXT,
  signed_by       TEXT,
  signed_at       TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_order_changes_patient
  ON pending_order_changes(patient_id, signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_visit
  ON conversation_messages(visit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vital_signs_visit ON vital_signs(visit_id);
CREATE INDEX IF NOT EXISTS idx_interventions_visit ON interventions(visit_id);
CREATE INDEX IF NOT EXISTS idx_medications_visit ON medications(visit_id);
CREATE INDEX IF NOT EXISTS idx_visits_nurse_date ON visits(nurse_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_suction_events_visit ON suction_events(visit_id, occurred_at);

-- Idempotent column additions for live envs where the table already exists.
-- Safe to re-run; ADD COLUMN IF NOT EXISTS is a no-op when the column is present.
ALTER TABLE medications     ADD COLUMN IF NOT EXISTS administered_at TIMESTAMPTZ;
ALTER TABLE vital_signs     ADD COLUMN IF NOT EXISTS occurred_at     TIMESTAMPTZ;
ALTER TABLE interventions   ADD COLUMN IF NOT EXISTS occurred_at     TIMESTAMPTZ;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS dose            TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS concentration   TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS route           TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS indication      TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS instructions    TEXT;
ALTER TABLE patients        ADD COLUMN IF NOT EXISTS photo_url       TEXT;

-- Widen scheduled_tasks.type CHECK so existing dbs accept head_to_toe.
-- ALTER … CHECK uses CONSTRAINT names we don't have a handle on, so we
-- drop the implicit one Postgres named after the table+col and re-add.
DO $$
BEGIN
  ALTER TABLE scheduled_tasks DROP CONSTRAINT IF EXISTS scheduled_tasks_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE scheduled_tasks
  ADD CONSTRAINT scheduled_tasks_type_check
  CHECK (type IN ('medication','intervention','vitals','narrative','head_to_toe'));
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  console.log('[migrate] Schema applied successfully');
}
