# Nurse Agent POC — Claude Code Instructions

## What we're building

A web app where a nurse selects a patient and has a conversation with an AI agent
that helps her log the visit. The agent asks about vital signs, interventions,
medications and builds the narrative as the conversation progresses.

**No KanTime integration yet.** Use hardcoded data everywhere. Focus on making
the agent conversation feel natural and useful.

---

## Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express + WebSockets (ws package)
- **Database**: PostgreSQL with the schema in `database/init/01_schema.sql`
- **Agent**: Anthropic SDK (claude-sonnet-4-5), streaming responses

Run everything with `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`.

---

## Project structure to create

```
frontend/src/
  components/
    PatientList.tsx      # left panel — list of patients
    ChatWindow.tsx       # center panel — conversation with agent
    VisitSummary.tsx     # right panel — live summary of what's been logged
  hooks/
    useChat.ts           # WebSocket connection + message state
  types.ts
  App.tsx

backend/src/
  agent/
    systemPrompt.ts      # THE MOST IMPORTANT FILE — nurse agent persona
    tools.ts             # tool definitions + handlers
    agentLoop.ts         # Anthropic API call + tool execution
  db/
    queries.ts           # all postgres queries
    seed.ts              # hardcoded patients + visits
  routes/
    patients.ts
    visits.ts
  ws/
    handler.ts           # WebSocket message router
  index.ts
```

---

## Hardcoded patients (use these exactly)

```typescript
// backend/src/db/seed.ts
export const PATIENTS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    kantime_patient_id: '102442-PDN',
    full_name: 'Carlos Mendoza',
    date_of_birth: '2025-11-01',
    age_months: 5,
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
    id: '10000000-0000-0000-0000-000000000002',
    kantime_patient_id: '087331-HH',
    full_name: 'Dorothy Hargrove',
    date_of_birth: '1942-03-15',
    age_months: null,
    age_years: 84,
    allergies: ['Penicillin', 'Sulfa drugs'],
    primary_diagnosis: 'CHF – Congestive Heart Failure (I50.9)',
    cpr_code: 'DNR',
    last_weight_lbs: 156.0,
    last_height_inches: 62.0,
    last_vitals_date: '2026-04-06',
    emergency_contact_name: 'James Hargrove',
    emergency_contact_phone: '(863) 771-2290',
    emergency_contact_relation: 'Son',
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    kantime_patient_id: '094720-PDN',
    full_name: 'Liam O\'Brien',
    date_of_birth: '2021-08-20',
    age_months: null,
    age_years: 4,
    allergies: ['Latex', 'Amoxicillin'],
    primary_diagnosis: 'Cerebral Palsy, spastic quadriplegia (G80.0)',
    cpr_code: 'Full Code',
    last_weight_lbs: 32.5,
    last_height_inches: 38.0,
    last_vitals_date: '2026-04-05',
    emergency_contact_name: 'Siobhan O\'Brien',
    emergency_contact_phone: '(407) 882-4413',
    emergency_contact_relation: 'Mother',
  },
];

export const VISITS = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    patient_id: '10000000-0000-0000-0000-000000000001',
    nurse_id: '00000000-0000-0000-0000-000000000001',
    visit_date: new Date().toISOString().split('T')[0],
    planned_start_time: '08:00',
    planned_end_time: '09:00',
    service_type: 'RN Hourly',
    payer: 'IHCS',
    status: 'in_progress',
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    patient_id: '10000000-0000-0000-0000-000000000002',
    nurse_id: '00000000-0000-0000-0000-000000000001',
    visit_date: new Date().toISOString().split('T')[0],
    planned_start_time: '10:00',
    planned_end_time: '11:00',
    service_type: 'RN Hourly',
    payer: 'Medicare',
    status: 'in_progress',
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    patient_id: '10000000-0000-0000-0000-000000000003',
    nurse_id: '00000000-0000-0000-0000-000000000001',
    visit_date: new Date().toISOString().split('T')[0],
    planned_start_time: '13:00',
    planned_end_time: '14:00',
    service_type: 'RN Hourly',
    payer: 'Medicaid',
    status: 'scheduled',
  },
];
```

---

## Agent system prompt (copy this verbatim into systemPrompt.ts)

See `backend/src/agent/systemPrompt.ts` — this is the most important file.
The full prompt is specified there. Key behaviours:
- Greet the nurse by name and confirm which patient she's visiting
- Ask for information ONE section at a time, never dump all questions at once
- Acknowledge what the nurse says before asking the next question
- Detect when the nurse says something clinically significant and flag it
- Build the narrative progressively as data comes in
- Know when enough information has been collected and offer to finalize

---

## Agent tools

The agent has four tools. Implement all four:

### `log_vitals`
Saves a vital signs reading to the database.
```typescript
{
  name: 'log_vitals',
  description: 'Save vital signs recorded during the visit',
  input_schema: {
    type: 'object',
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
}
```

### `log_intervention`
Saves one intervention/procedure performed during the visit.
```typescript
{
  name: 'log_intervention',
  description: 'Log a procedure or intervention performed during the visit',
  input_schema: {
    type: 'object',
    properties: {
      visit_id:    { type: 'string' },
      name:        { type: 'string', description: 'Name of the procedure' },
      description: { type: 'string' },
      outcome:     { type: 'string' },
    },
    required: ['visit_id', 'name'],
  },
}
```

### `log_medication`
Saves one medication administration or review.
```typescript
{
  name: 'log_medication',
  description: 'Log a medication given or reviewed during the visit',
  input_schema: {
    type: 'object',
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
}
```

### `update_narrative`
Overwrites the narrative for this visit. Called after each major section is complete.
```typescript
{
  name: 'update_narrative',
  description: 'Update the visit narrative with the information collected so far',
  input_schema: {
    type: 'object',
    properties: {
      visit_id:               { type: 'string' },
      content:                { type: 'string', description: 'Full narrative text' },
      patient_tolerated_ok:   { type: 'boolean' },
      patient_tolerated_notes:{ type: 'string' },
    },
    required: ['visit_id', 'content'],
  },
}
```

---

## WebSocket message protocol

```typescript
// Client → Server
{ type: 'start_visit', visitId: string, patientId: string }
{ type: 'message',     visitId: string, content: string }

// Server → Client
{ type: 'token',       content: string }          // streaming chunk
{ type: 'tool_call',   tool: string, input: any }  // agent used a tool
{ type: 'tool_result', tool: string, success: boolean }
{ type: 'done' }                                   // stream complete
{ type: 'error',       message: string }
```

---

## Frontend layout

Three-panel layout, full viewport height:

```
┌──────────────┬─────────────────────────┬──────────────────┐
│ Patient list │     Chat window         │  Visit summary   │
│  (280px)     │     (flex-1)            │   (320px)        │
│              │                         │                  │
│ • Carlos M.  │ Agent: Good morning,    │ Vitals           │
│   08:00 RN   │ Travis! You're visiting │ BP: 118/76       │
│              │ Carlos today...         │ HR: 92           │
│ • Dorothy H. │                         │ Temp: 98.6°F     │
│   10:00 RN   │ Nurse: [text input]     │                  │
│              │                         │ Interventions    │
│ • Liam O.    │                         │ • Trach suction  │
│   13:00 RN   │                         │                  │
└──────────────┴─────────────────────────┴──────────────────┘
```

**Patient list card**: show patient name, visit time, service type, and a colored
status dot (yellow = scheduled, green = in_progress, gray = completed).
Clicking a patient opens the visit and sends `start_visit` over WebSocket.

**Chat window**: Standard chat UI. Agent messages stream in token by token.
Show a subtle indicator when the agent is calling a tool (e.g. "Logging vitals…").
The input is a textarea that submits on Enter (Shift+Enter for newline).

**Visit summary**: Updates in real time as the agent calls tools. Show four
collapsible sections: Vitals, Interventions, Medications, Narrative. Each section
shows a green checkmark when the agent has logged data for it.

---

## Important UX details

1. When a patient is selected, the chat starts automatically — the agent sends
   the opening message without the nurse typing anything.

2. Tool calls should be invisible to the nurse. She should never see
   "I will now call log_vitals(...)". The agent calls the tool silently and
   then acknowledges naturally: "Got it — I've logged those vitals."

3. The visit summary panel updates immediately when a tool result comes back,
   not after the agent finishes speaking.

4. Show a thin progress bar at the top of the chat indicating roughly how
   complete the visit documentation is (based on which sections have data).

5. The nurse's messages should appear instantly on the right side (don't wait
   for the server to echo them back).
