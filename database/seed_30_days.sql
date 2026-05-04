-- ============================================================
-- 30-Day Visit Seed Script
-- Generates 30 days of FUTURE scheduled visits (starting tomorrow),
-- alternating between Carlos Mendoza and Liam O'Brien — ONE patient
-- per day, matching Family First's hourly continuous-care model
-- (see Renee Sadler 2026-04-23 feedback: roster showing two visits
-- per day is unrealistic for FF).
--
-- Even-offset days (tomorrow, +2, +4 …) → Liam   (started yesterday for Carlos)
-- Odd-offset  days (+1, +3, +5 …)        → Carlos
--
-- Run AFTER the app has started (so nurse/patients exist):
--   docker exec -i <postgres_container> psql -U nurse_app -d nurse_logging < database/seed_30_days.sql
-- ============================================================

DO $$
DECLARE
  v_nurse_id  UUID := '00000000-0000-0000-0000-000000000001';
  carlos_id   UUID := '10000000-0000-0000-0000-000000000001';
  liam_id     UUID := '10000000-0000-0000-0000-000000000003';
  tomorrow    DATE := CURRENT_DATE + 1;
  d           DATE;
  day_offset  INT;
  inserted    INT := 0;
BEGIN

  FOR day_offset IN 0..29 LOOP
    d := tomorrow + day_offset;

    IF (day_offset % 2) = 0 THEN
      -- Liam O'Brien — 13:00–14:00, RN Hourly, Medicaid
      INSERT INTO visits (patient_id, nurse_id, visit_date,
                          planned_start_time, planned_end_time,
                          service_type, payer, status)
      SELECT liam_id, v_nurse_id, d,
             '13:00'::TIME, '14:00'::TIME,
             'RN Hourly', 'Medicaid', 'scheduled'
      WHERE NOT EXISTS (
        SELECT 1 FROM visits v
        WHERE v.nurse_id = v_nurse_id AND v.visit_date = d
      );
      IF FOUND THEN inserted := inserted + 1; END IF;
    ELSE
      -- Carlos Mendoza — 08:00–09:00, RN Hourly, IHCS
      INSERT INTO visits (patient_id, nurse_id, visit_date,
                          planned_start_time, planned_end_time,
                          service_type, payer, status)
      SELECT carlos_id, v_nurse_id, d,
             '08:00'::TIME, '09:00'::TIME,
             'RN Hourly', 'IHCS', 'scheduled'
      WHERE NOT EXISTS (
        SELECT 1 FROM visits v
        WHERE v.nurse_id = v_nurse_id AND v.visit_date = d
      );
      IF FOUND THEN inserted := inserted + 1; END IF;
    END IF;

  END LOOP;

  RAISE NOTICE 'Done: % visits inserted across % days (alternating)', inserted, 30;
END $$;

-- Verify
SELECT visit_date, p.full_name, v.planned_start_time::text, v.status
FROM visits v
JOIN patients p ON p.id = v.patient_id
WHERE v.visit_date > CURRENT_DATE
ORDER BY v.visit_date, v.planned_start_time;
