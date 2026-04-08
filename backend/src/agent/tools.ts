import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import {
  saveVitals,
  saveIntervention,
  saveMedication,
  upsertNarrative,
} from '../db/queries';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'log_vitals',
    description: 'Save vital signs recorded during the visit',
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
      },
      required: ['visit_id'],
    },
  },
  {
    name: 'log_intervention',
    description: 'Log a procedure or intervention performed during the visit',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:    { type: 'string' },
        name:        { type: 'string', description: 'Name of the procedure' },
        description: { type: 'string' },
        outcome:     { type: 'string' },
      },
      required: ['visit_id', 'name'],
    },
  },
  {
    name: 'log_medication',
    description: 'Log a medication given or reviewed during the visit',
    input_schema: {
      type: 'object' as const,
      properties: {
        visit_id:        { type: 'string' },
        name:            { type: 'string' },
        dose:            { type: 'string' },
        route:           { type: 'string' },
        given:           { type: 'boolean' },
        reason_withheld: { type: 'string' },
      },
      required: ['visit_id', 'name', 'given'],
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
      case 'update_narrative': {
        const row = await upsertNarrative(
          visitId,
          input.content as string,
          input.patient_tolerated_ok as boolean | undefined,
          input.patient_tolerated_notes as string | undefined,
        );
        return { success: true, id: row.id };
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
