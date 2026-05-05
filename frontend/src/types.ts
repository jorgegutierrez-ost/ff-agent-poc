export interface Patient {
  id: string;
  kantime_patient_id: string;
  full_name: string;
  date_of_birth: string;
  age_months: number | null;
  age_years?: number | null;
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

export interface ChatMessage {
  id: string;
  role: 'agent' | 'nurse';
  content: string;
  timestamp: Date;
}

export interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
}

export interface VitalsData {
  bp_systolic?: number;
  bp_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  temperature_f?: number;
  o2_saturation?: number;
  weight_lbs?: number;
  pain_score?: number;
  notes?: string;
}

export interface InterventionData {
  name: string;
  description?: string;
  outcome?: string;
}

export interface MedicationData {
  name: string;
  dose?: string;
  route?: string;
  given: boolean;
  reason_withheld?: string;
}

export interface NarrativeData {
  content: string;
  patient_tolerated_ok?: boolean;
  patient_tolerated_notes?: string;
}

export type SuctionRoute = 'nasal' | 'oral' | 'trach';

export interface SuctionEvent {
  id: string;
  visit_id: string;
  occurred_at: string;
  route: SuctionRoute;
  amount: string | null;
  color: string | null;
  consistency: string | null;
  count: number;
  notes: string | null;
  recorded_at: string;
}

export interface VisitSummaryData {
  vitals: VitalsData | null;
  interventions: InterventionData[];
  medications: MedicationData[];
  narrative: NarrativeData | null;
}

// Schedule items for the visit timeline
export type ScheduleItemType = 'medication' | 'intervention' | 'vitals' | 'narrative';
export type ScheduleItemStatus = 'overdue' | 'pending' | 'completed' | 'skipped';

export interface ScheduleItem {
  id: string;
  type: ScheduleItemType;
  status: ScheduleItemStatus;
  scheduledTime: string; // HH:MM
  label: string;         // drug name only — e.g. "Ranitidine"
  sublabel: string;      // frequency — e.g. "Twice daily"
  lateMinutes?: number;  // if overdue, how many minutes late
  quickActions: QuickAction[];
  completedAt?: string;  // HH:MM when completed
  completedAction?: string; // "given" | "skipped" | "modified" | "recorded" | "done"
  // Medication-only structured fields. Surface the same six safety fields
  // the in-visit confirmation card needs to display without a tap.
  dose?: string | null;
  concentration?: string | null;
  route?: string | null;
  indication?: string | null;
  instructions?: string | null;
  // True when this item was synthesized from a PRN order (not a real
  // scheduled task). Tells the confirmation header to render "PRN order"
  // instead of "Scheduled HH:MM" since PRNs have no scheduled time.
  isPrn?: boolean;
  // Optional max-frequency hint for PRN orders ("max q4h") — surfaced in
  // the confirmation header alongside the indication.
  maxFrequencyHours?: number | null;
}

export interface QuickAction {
  label: string;
  value: string; // sent to chat/agent as context
  variant: 'primary' | 'secondary';
}

// WebSocket message types
export type ClientMessage =
  | { type: 'start_visit'; visitId: string; patientId: string }
  | { type: 'message'; visitId: string; content: string };

export type ServerMessage =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; success: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string };
