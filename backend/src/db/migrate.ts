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
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id    UUID NOT NULL REFERENCES visits(id),
  name        TEXT NOT NULL,
  description TEXT,
  outcome     TEXT,
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

CREATE INDEX IF NOT EXISTS idx_conversation_messages_visit
  ON conversation_messages(visit_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vital_signs_visit ON vital_signs(visit_id);
CREATE INDEX IF NOT EXISTS idx_interventions_visit ON interventions(visit_id);
CREATE INDEX IF NOT EXISTS idx_medications_visit ON medications(visit_id);
CREATE INDEX IF NOT EXISTS idx_visits_nurse_date ON visits(nurse_id, visit_date);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  console.log('[migrate] Schema applied successfully');
}
