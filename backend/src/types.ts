export interface Patient {
  id: string;
  kantime_patient_id: string;
  full_name: string;
  date_of_birth: string;
  age_months: number | null;
  age_years: number | null;
  allergies: string[];
  primary_diagnosis: string;
  cpr_code: string;
  last_weight_lbs: number;
  last_height_inches: number;
  last_vitals_date: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
}

export interface Visit {
  id: string;
  patient_id: string;
  nurse_id: string;
  visit_date: string;
  planned_start_time: string;
  planned_end_time: string;
  service_type: string;
  payer: string;
  status: 'scheduled' | 'in_progress' | 'completed';
}

export interface VitalSigns {
  id: string;
  visit_id: string;
  bp_systolic?: number;
  bp_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature_f?: number;
  o2_saturation?: number;
  weight_lbs?: number;
  pain_score?: number;
  notes?: string;
  recorded_at: string;
}

export interface Intervention {
  id: string;
  visit_id: string;
  name: string;
  description?: string;
  outcome?: string;
  recorded_at: string;
}

export interface Medication {
  id: string;
  visit_id: string;
  name: string;
  dose?: string;
  route?: string;
  given: boolean;
  reason_withheld?: string;
  recorded_at: string;
}

export interface Narrative {
  id: string;
  visit_id: string;
  content: string;
  patient_tolerated_ok?: boolean;
  patient_tolerated_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  visit_id: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_result: Record<string, unknown> | null;
  created_at: string;
}
