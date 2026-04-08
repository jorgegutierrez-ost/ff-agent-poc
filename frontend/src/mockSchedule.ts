import type { ScheduleItem } from './types';

// Carlos Mendoza — 5-month infant, PDN
const CARLOS_SCHEDULE: ScheduleItem[] = [
  {
    id: 'cs-1',
    type: 'vitals',
    status: 'overdue',
    scheduledTime: '08:00',
    label: 'Vital signs check',
    sublabel: 'Weight, temp, HR, RR, O2 sat',
    lateMinutes: 15,
    quickActions: [
      { label: 'Record vitals', value: 'record_vitals', variant: 'primary' },
      { label: 'Skipped', value: 'skip_vitals', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-2',
    type: 'medication',
    status: 'pending',
    scheduledTime: '08:15',
    label: 'Ranitidine 15mg',
    sublabel: 'Oral · Twice daily',
    quickActions: [
      { label: 'Yes, given', value: 'med_given', variant: 'primary' },
      { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
      { label: 'Modified', value: 'med_modified', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-3',
    type: 'intervention',
    status: 'pending',
    scheduledTime: '08:30',
    label: 'Tracheostomy suctioning',
    sublabel: 'PRN · Check airway patency',
    quickActions: [
      { label: 'Done', value: 'intervention_done', variant: 'primary' },
      { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-4',
    type: 'intervention',
    status: 'pending',
    scheduledTime: '08:30',
    label: 'Trach site care',
    sublabel: 'Clean and assess stoma site',
    quickActions: [
      { label: 'Done', value: 'intervention_done', variant: 'primary' },
      { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-5',
    type: 'medication',
    status: 'pending',
    scheduledTime: '08:45',
    label: 'Albuterol 1.25mg',
    sublabel: 'Nebulizer · Every 6h',
    quickActions: [
      { label: 'Yes, given', value: 'med_given', variant: 'primary' },
      { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
      { label: 'Modified', value: 'med_modified', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-6',
    type: 'intervention',
    status: 'pending',
    scheduledTime: '08:50',
    label: 'G-tube feeding',
    sublabel: 'Formula per dietitian orders',
    quickActions: [
      { label: 'Done', value: 'intervention_done', variant: 'primary' },
      { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
    ],
  },
  {
    id: 'cs-7',
    type: 'narrative',
    status: 'pending',
    scheduledTime: '08:55',
    label: 'Visit narrative',
    sublabel: 'Document findings and plan',
    quickActions: [
      { label: 'Write narrative', value: 'write_narrative', variant: 'primary' },
    ],
  },
];

// Liam O'Brien — 4yo, cerebral palsy
const LIAM_SCHEDULE: ScheduleItem[] = [
  {
    id: 'lo-1',
    type: 'vitals',
    status: 'pending',
    scheduledTime: '13:00',
    label: 'Vital signs check',
    sublabel: 'Temp, HR, RR, O2 sat, pain scale',
    quickActions: [
      { label: 'Record vitals', value: 'record_vitals', variant: 'primary' },
      { label: 'Skipped', value: 'skip_vitals', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-2',
    type: 'medication',
    status: 'pending',
    scheduledTime: '13:15',
    label: 'Baclofen 5mg',
    sublabel: 'Oral · Three times daily',
    quickActions: [
      { label: 'Yes, given', value: 'med_given', variant: 'primary' },
      { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
      { label: 'Modified', value: 'med_modified', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-3',
    type: 'medication',
    status: 'pending',
    scheduledTime: '13:15',
    label: 'Diazepam 2mg',
    sublabel: 'Oral · Twice daily',
    quickActions: [
      { label: 'Yes, given', value: 'med_given', variant: 'primary' },
      { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
      { label: 'Modified', value: 'med_modified', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-4',
    type: 'intervention',
    status: 'pending',
    scheduledTime: '13:30',
    label: 'Range of motion exercises',
    sublabel: 'Upper and lower extremities',
    quickActions: [
      { label: 'Done', value: 'intervention_done', variant: 'primary' },
      { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-5',
    type: 'intervention',
    status: 'pending',
    scheduledTime: '13:30',
    label: 'Positioning and skin check',
    sublabel: 'Reposition · Assess pressure areas',
    quickActions: [
      { label: 'Done', value: 'intervention_done', variant: 'primary' },
      { label: 'Not needed', value: 'intervention_skip', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-6',
    type: 'medication',
    status: 'pending',
    scheduledTime: '13:45',
    label: 'Glycopyrrolate 1mg',
    sublabel: 'Oral · Three times daily',
    quickActions: [
      { label: 'Yes, given', value: 'med_given', variant: 'primary' },
      { label: 'Skipped', value: 'med_skipped', variant: 'secondary' },
      { label: 'Modified', value: 'med_modified', variant: 'secondary' },
    ],
  },
  {
    id: 'lo-7',
    type: 'narrative',
    status: 'pending',
    scheduledTime: '13:55',
    label: 'Visit narrative',
    sublabel: 'Document findings and plan',
    quickActions: [
      { label: 'Write narrative', value: 'write_narrative', variant: 'primary' },
    ],
  },
];

export const MOCK_SCHEDULES: Record<string, ScheduleItem[]> = {
  '10000000-0000-0000-0000-000000000001': CARLOS_SCHEDULE,
  '10000000-0000-0000-0000-000000000003': LIAM_SCHEDULE,
};
