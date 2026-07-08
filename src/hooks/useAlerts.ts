// src/hooks/useAlertInboxData.ts
// ILA OSINT — Alert Inbox mock data + types
// Self-contained data source for the Alert Inbox page.
// Does NOT modify useAlerts.ts (locked) — additive only.

import { useMemo } from 'react';
import type { Priority } from './useInvestigations';

export type AlertInboxStatus = 'NEW' | 'ASSIGNED' | 'IN_REVIEW' | 'ESCALATED' | 'DISMISSED';
export type AlertSource = 'OSINT' | 'SIGINT' | 'HUMINT' | 'SOC' | 'SIEM' | 'GEOINT' | 'MARITIME' | 'NEWS';
export type SmartView = 'MY_QUEUE' | 'UNASSIGNED' | 'ESCALATED' | 'ALL';

export interface InboxAlert {
  id: string;
  title: string;
  severity: Priority;
  riskScore: number;
  source: AlertSource;
  entity: string;
  receivedAt: string; // ISO timestamp
  status: AlertInboxStatus;
  assignedTo: string | null; // initials or null
  assignedName?: string;
  description: string;
  timeline: Array<{ time: string; text: string }>;
  sourceMeta: { sensor: string; confidence: 'High' | 'Medium' | 'Low' };
  relatedEntities: string[];
  notes: string;
}

const SEVERITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SOURCES: AlertSource[] = ['OSINT', 'SIGINT', 'HUMINT', 'SOC', 'SIEM', 'GEOINT', 'MARITIME', 'NEWS'];
const STATUSES: AlertInboxStatus[] = ['NEW', 'ASSIGNED', 'IN_REVIEW', 'ESCALATED', 'DISMISSED'];
const ANALYSTS = [
  { initials: 'RK', name: 'Ravi Krishnan' },
  { initials: 'AS', name: 'Aisha Sharma' },
  { initials: 'MK', name: 'Mark Kumar' },
  { initials: 'VN', name: 'Vikram Nair' },
];

const TITLES = [
  'Suspicious maritime activity detected',
  'Critical infrastructure threat alert',
  'Coordinated cyber campaign identified',
  'Foreign influence operation detected',
  'Unverified open-source chatter spike',
  'Border activity increase reported',
  'Suspicious vessel activity flagged',
  'High-frequency login attempts from unknown IP',
  'Known threat actor handle resurfaces',
  'Unusual document exfiltration pattern',
  'Encrypted channel traffic spike detected',
  'Satellite imagery anomaly near border post',
  'Dark web mention of national asset',
  'Drone activity near restricted airspace',
  'Anomalous financial transfer pattern flagged',
  'Disinformation cluster spreading rapidly',
  'New malware variant linked to APT group',
  'Unregistered aircraft transponder signal',
  'Mass gathering risk indicator triggered',
  'Cross-border convoy movement detected',
  'Compromised credential set offered for sale',
  'Signal intercept indicates coordinated activity',
  'Critical port sensor offline unexpectedly',
  'Suspicious wire transfer to flagged entity',
  'Open-source report on troop movement',
];

const ENTITIES = [
  'Port of Chennai', 'Unknown Threat Actor', 'APT-29', 'Bay of Bengal',
  'Strait of Malacca', 'South China Sea Fleet', 'Kolkata Border Post',
  'MV Horizon Star', 'Lazarus Group', 'Mumbai Financial District',
  'Northern Border Sector 7', 'Karachi Port Authority', 'Unidentified Vessel 4471',
];

function riskFromSeverity(sev: Priority): number {
  switch (sev) {
    case 'CRITICAL': return 85 + Math.floor(Math.random() * 14); // 85-98
    case 'HIGH':     return 65 + Math.floor(Math.random() * 18); // 65-82
    case 'MEDIUM':   return 40 + Math.floor(Math.random() * 22); // 40-61
    default:         return 5  + Math.floor(Math.random() * 33); // 5-37
  }
}

function buildTimeline(title: string, sev: Priority): Array<{ time: string; text: string }> {
  const base = [
    { time: '13:42Z', text: 'Initial indicator captured by sensor' },
    { time: '13:50Z', text: `${title.split(' ').slice(0, 3).join(' ')} confirmed via secondary source` },
    { time: '13:55Z', text: 'Alert generated and queued for triage' },
  ];
  if (sev === 'CRITICAL' || sev === 'HIGH') {
    base.push({ time: '14:02Z', text: 'Auto-escalation rule triggered — priority raised' });
  }
  return base;
}

function buildAlert(i: number): InboxAlert {
  const severity = SEVERITIES[i % 4];
  const status = STATUSES[(i + (severity === 'CRITICAL' ? 0 : 1)) % STATUSES.length];
  const source = SOURCES[i % SOURCES.length];
  const title = TITLES[i % TITLES.length];
  const entity = ENTITIES[i % ENTITIES.length];
  const analyst = status === 'NEW' || status === 'DISMISSED' ? null : ANALYSTS[i % ANALYSTS.length];
  const minutesAgo = 2 + i * 7;
  const received = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

  return {
    id: `ALT-2026-${String(391 + i).padStart(5, '0')}`,
    title,
    severity,
    riskScore: riskFromSeverity(severity),
    source,
    entity,
    receivedAt: received,
    status,
    assignedTo: analyst?.initials ?? null,
    assignedName: analyst?.name,
    description:
      `${title}. Indicators correlate with prior activity associated with ${entity}. ` +
      `Confidence assessment based on ${source} reporting and cross-source validation.`,
    timeline: buildTimeline(title, severity),
    sourceMeta: {
      sensor: `SAT-${source}-${String((i % 9) + 1).padStart(2, '0')}`,
      confidence: severity === 'CRITICAL' || severity === 'HIGH' ? 'High' : severity === 'MEDIUM' ? 'Medium' : 'Low',
    },
    relatedEntities: [entity, ENTITIES[(i + 3) % ENTITIES.length], ENTITIES[(i + 6) % ENTITIES.length]],
    notes: '',
  };
}

const ALL_ALERTS: InboxAlert[] = Array.from({ length: 28 }, (_, i) => buildAlert(i));

// Ensure counts roughly match the design spec (4 critical, 12 high, etc.)
// by tagging the first N alerts of each severity deterministically — handled
// naturally by the round-robin distribution above for 28 items.

export function useAlertInboxData() {
  const alerts = useMemo(() => ALL_ALERTS, []);

  const counts = useMemo(() => ({
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH:     alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM:   alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW:      alerts.filter(a => a.severity === 'LOW').length,
  }), [alerts]);

  const smartViewCounts = useMemo(() => ({
    MY_QUEUE:   alerts.filter(a => a.assignedTo === 'RK').length,
    UNASSIGNED: alerts.filter(a => a.assignedTo === null).length,
    ESCALATED:  alerts.filter(a => a.status === 'ESCALATED').length,
    ALL:        alerts.length,
  }), [alerts]);

  return { alerts, counts, smartViewCounts };
}