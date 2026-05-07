import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  saveVitals,
  saveIntervention,
  saveMedication,
  saveSuctionEvent,
  upsertNarrative,
  searchPatientHistory,
} from '../db/queries';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'log_vitals',
    description:
      'Save vital signs recorded during the visit. ' +
      'occurred_at MUST be the time the nurse took the reading — not the ' +
      'current time. Ask if the nurse has not stated when she took them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:         { type: 'string' },
        bp_systolic:      { type: 'number' },
        bp_diastolic:     { type: 'number' },
        heart_rate:       { type: 'number' },
        respiratory_rate: { type: 'number' },
        temperature_f:    { type: 'number' },
        o2_saturation:    { type: 'number' },
        weight_lbs:       { type: 'number' },
        pain_score:       { type: 'number', description: '0–10 scale' },
        notes:            { type: 'string' },
        occurred_at: {
          type: 'string',
          description:
            'Time the vitals were taken, as reported by the nurse. ' +
            'Accepts ISO-8601 or HH:MM (24-hour). Required when the nurse ' +
            'has stated a time; ask once if she has not.',
        },
      },
      required: ['visit_id'],
    },
  },
  {
    name: 'log_intervention',
    description:
      'Log a procedure or intervention performed during the visit. ' +
      'occurred_at MUST be the time the nurse performed the procedure — ' +
      'not the current time. Ask if she has not stated when.',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:    { type: 'string' },
        name:        { type: 'string', description: 'Name of the procedure' },
        description: { type: 'string' },
        outcome:     { type: 'string' },
        occurred_at: {
          type: 'string',
          description:
            'Time the procedure was performed, as reported by the nurse. ' +
            'Accepts ISO-8601 or HH:MM (24-hour). Required when the nurse ' +
            'has stated a time; ask once if she has not.',
        },
      },
      required: ['visit_id', 'name'],
    },
  },
  {
    name: 'log_medication',
    description:
      'Log a medication given or reviewed during the visit. ' +
      'When given=true, administered_at MUST be the actual administration time ' +
      'reported by the nurse — never the current time. Ask the nurse what time ' +
      'they gave the dose if they have not stated it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:        { type: 'string' },
        name:            { type: 'string' },
        dose:            { type: 'string' },
        route:           { type: 'string' },
        given:           { type: 'boolean' },
        reason_withheld: { type: 'string' },
        administered_at: {
          type: 'string',
          description:
            'Actual time the dose was administered, as reported by the nurse. ' +
            'Accepts ISO-8601 ("2026-04-30T09:23:00Z") or 24-hour HH:MM ("09:23"). ' +
            'Required when given=true unless the nurse explicitly cannot recall — ' +
            'in that case ask once before proceeding.',
        },
      },
      required: ['visit_id', 'name', 'given'],
    },
  },
  {
    name: 'log_suction',
    description:
      'Log a suctioning event during the visit. Suctioning happens 1–20+ ' +
      'times per shift on patients with trachs or heavy secretions, so ' +
      'the nurse may batch-document multiple similar passes as one entry ' +
      'using the count field (e.g. "suctioned 5 times this hour, all ' +
      'clear thin trach" → count: 5). Always capture the actual event ' +
      'time the nurse reports, not the current time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id: { type: 'string' },
        occurred_at: {
          type: 'string',
          description:
            'Time the suctioning was performed (or the start of a ' +
            'consolidated window). ISO-8601 or HH:MM (24-hour). Required.',
        },
        route: {
          type: 'string',
          enum: ['nasal', 'oral', 'trach'],
          description: 'Where the suction was performed.',
        },
        amount: {
          type: 'string',
          description:
            'Amount suctioned. Conventional buckets are "small", ' +
            '"moderate", "copious", or a measured volume like "5 mL".',
        },
        color: {
          type: 'string',
          description:
            'Color of secretions: "clear", "white", "yellow", "green", ' +
            '"blood-tinged", or free text.',
        },
        consistency: {
          type: 'string',
          description: 'Consistency: "thin", "thick", or "tenacious".',
        },
        count: {
          type: 'number',
          description:
            'How many suction passes this entry represents. Defaults to ' +
            '1. Use a higher number when the nurse describes a batch ' +
            '("I suctioned five times").',
        },
        notes: {
          type: 'string',
          description: 'Free-text observations.',
        },
      },
      required: ['visit_id', 'occurred_at', 'route'],
    },
  },
  {
    name: 'search_patient_history',
    description:
      "Search this patient's past completed visits when the nurse asks " +
      "about prior shifts (when something last happened, how often a med " +
      "was given, what was noted last visit, etc.). Returns deterministic " +
      "rows pulled from the chart — quote the dates and excerpts " +
      "verbatim in your reply, never paraphrase clinical detail and " +
      "never invent doses or events. " +
      "Pass at least one filter (query OR medication_name) to keep results " +
      "focused on what was asked. Without filters this returns the most " +
      "recent shifts, which is rarely what the nurse wants.",
    input_schema: {
      type: 'object' as const,
      properties: {
        patient_id: {
          type: 'string',
          description:
            'The patient whose history to search. Provided in the patient ' +
            'block at the top of the conversation context.',
        },
        query: {
          type: 'string',
          description:
            'Free-text keyword matched against past narratives ' +
            '(case-insensitive substring). Use the clinical term the ' +
            'nurse used: "seizure", "fever", "desat", "wheez", ' +
            '"breakthrough", etc. Omit if the nurse asked about a ' +
            'medication specifically.',
        },
        medication_name: {
          type: 'string',
          description:
            'Filter to visits where this medication was given (substring, ' +
            'case-insensitive). Use when the nurse asks about a specific ' +
            'drug — e.g. "How many PRN albuterols?" → "Albuterol".',
        },
        days_back: {
          type: 'number',
          description:
            'How far back to look. Default 14, max 90. Widen only when ' +
            'the nurse asks about a longer window ("this month", "last ' +
            'few weeks").',
        },
        limit: {
          type: 'number',
          description: 'Max visits to return. Default 5, max 20.',
        },
      },
      required: ['patient_id'],
    },
  },
  {
    name: 'update_narrative',
    description: 'Update the visit narrative with the information collected so far',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:                { type: 'string' },
        content:                 { type: 'string', description: 'Full narrative text' },
        patient_tolerated_ok:    { type: 'boolean' },
        patient_tolerated_notes: { type: 'string' },
      },
      required: ['visit_id', 'content'],
    },
  },
];

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: { visitId?: string } = {},
): Promise<{ success: boolean; id?: string; error?: string; data?: unknown }> {
  try {
    const visitId = input.visit_id as string;

    switch (toolName) {
      case 'log_vitals': {
        const row = await saveVitals(visitId, input);
        return { success: true, id: row.id };
      }
      case 'log_intervention': {
        const row = await saveIntervention(visitId, input);
        return { success: true, id: row.id };
      }
      case 'log_medication': {
        const row = await saveMedication(visitId, input);
        return { success: true, id: row.id };
      }
      case 'log_suction': {
        const row = await saveSuctionEvent(visitId, input);
        return { success: true, id: row.id };
      }
      case 'update_narrative': {
        const row = await upsertNarrative(
          visitId,
          input.content as string,
          input.patient_tolerated_ok as boolean | undefined,
          input.patient_tolerated_notes as string | undefined,
        );
        return { success: true, id: row.id };
      }
      case 'search_patient_history': {
        const patientId = input.patient_id as string;
        if (!patientId) return { success: false, error: 'patient_id is required' };
        const visits = await searchPatientHistory(patientId, {
          query:          input.query           as string | undefined,
          medicationName: input.medication_name as string | undefined,
          daysBack:       input.days_back       as number | undefined,
          limit:          input.limit           as number | undefined,
          excludeVisitId: context.visitId,
        });
        return {
          success: true,
          data: {
            patient_id: patientId,
            filters: {
              query:           input.query           ?? null,
              medication_name: input.medication_name ?? null,
              days_back:       input.days_back       ?? 14,
            },
            visits_count: visits.length,
            visits,
          },
        };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tool] ${toolName} failed:`, msg);
    return { success: false, error: msg };
  }
}
