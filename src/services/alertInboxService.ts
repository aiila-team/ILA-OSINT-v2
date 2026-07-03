// src/services/alertInboxService.ts
// ILA OSINT — Alert Inbox service layer
// Provides a mock API-ready data interface for alert inbox operations.

export type AlertInboxStatus = 'NEW' | 'ASSIGNED' | 'IN_REVIEW' | 'ESCALATED' | 'DISMISSED';
export type SmartView = 'MY_QUEUE' | 'UNASSIGNED' | 'ESCALATED' | 'ALL';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface InboxAlert {
  id: string;
  title: string;
  severity: Priority;
  riskScore: number;
  status: AlertInboxStatus;
  source: string;
  entity: string;
  receivedAt: string;
  assignedTo: string | null;
  assignedName?: string;
  description: string;
  timeline: Array<{ text: string; time: string }>;
  sourceMeta: {
    sensor: string;
    confidence: number;
  };
  relatedEntities: string[];
  keywords: string[];
  geoLocation?: string;
  language?: string;
  sourceReliability?: 'High' | 'Medium' | 'Low' | number;
  isRead?: boolean;
  isFlagged?: boolean;
  caseId?: string;
  notes: string;
}

const defaultFailureChance = 0.12;

function simulateNetworkResponse<T>(result: T, delayMs = 250, failChance = defaultFailureChance, errorMessage = 'Network request failed.') {
  return new Promise<T>((resolve, reject) => {
    window.setTimeout(() => {
      if (Math.random() < failChance) {
        reject(new Error(errorMessage));
      } else {
        resolve(result);
      }
    }, delayMs);
  });
}

const MOCK_ALERTS: InboxAlert[] = [
  {
    id: 'ALT-2847',
    title: 'Anomalous C2 beacon detected',
    severity: 'CRITICAL',
    riskScore: 92,
    status: 'NEW',
    source: 'Network Sensor 7',
    entity: '192.168.44.201',
    receivedAt: new Date(Date.now() - 15 * 60_000).toISOString(),
    assignedTo: null,
    description: 'High-frequency DNS queries to known malicious domain cluster.',
    timeline: [
      { text: 'Initial detection', time: 'Just now' },
      { text: 'Traffic pattern analysis initiated', time: '2m ago' },
    ],
    sourceMeta: { sensor: 'DNS_MONITOR_01', confidence: 0.98 },
    relatedEntities: ['malware.com', 'evil.net', 'c2-server.ru'],
    keywords: ['DNS', 'C2 beacon', 'malware'],
    geoLocation: 'Chennai, India',
    language: 'English',
    sourceReliability: 'High',
    isRead: false,
    isFlagged: true,
    caseId: 'CASE-0091',
    notes: '',
  },
  {
    id: 'ALT-2846',
    title: 'Brute force attempt detected',
    severity: 'HIGH',
    riskScore: 74,
    status: 'ASSIGNED',
    source: 'Auth Logs',
    entity: 'svc_account_01',
    receivedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    assignedTo: 'RK',
    assignedName: 'Raj Kumar',
    description: '247 failed login attempts in 3 minutes from 18 unique IPs.',
    timeline: [
      { text: 'Attack detected', time: '45m ago' },
      { text: 'Account locked', time: '44m ago' },
    ],
    sourceMeta: { sensor: 'AUTH_MONITOR_02', confidence: 0.99 },
    relatedEntities: ['10.20.30.40', '10.20.30.41'],
    keywords: ['brute force', 'failed logins', 'auth anomaly'],
    geoLocation: 'Remote data center',
    language: 'English',
    sourceReliability: 0.99,
    isRead: true,
    isFlagged: false,
    caseId: 'CASE-0077',
    notes: 'Coordinated distributed attack. Recommend rate-limiting.',
  },
  {
    id: 'ALT-2845',
    title: 'Data exfiltration suspected',
    severity: 'CRITICAL',
    riskScore: 88,
    status: 'ESCALATED',
    source: 'DLP System',
    entity: 'emp_789@company.com',
    receivedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    assignedTo: 'RK',
    assignedName: 'Raj Kumar',
    description: '3.2 GB of unencrypted data uploaded to personal cloud storage.',
    timeline: [
      { text: 'Upload detected', time: '2h ago' },
      { text: 'User contacted', time: '1.5h ago' },
      { text: 'Escalated to InfoSec', time: '1h ago' },
    ],
    sourceMeta: { sensor: 'DLP_MONITOR_01', confidence: 0.97 },
    relatedEntities: ['dropbox.com', 'emp_789'],
    keywords: ['data exfiltration', 'unencrypted upload', 'cloud storage'],
    geoLocation: 'Mumbai, India',
    language: 'English',
    sourceReliability: 'Medium',
    isRead: false,
    isFlagged: true,
    caseId: 'CASE-0089',
    notes: 'Employee claims accidental upload. Verify against data classification.',
  },
];

let alertStorage: InboxAlert[] = MOCK_ALERTS.map(alert => ({
  ...alert,
  timeline: [...alert.timeline],
  relatedEntities: [...alert.relatedEntities],
  keywords: [...alert.keywords],
}));

function cloneAlert(alert: InboxAlert): InboxAlert {
  return {
    ...alert,
    timeline: [...alert.timeline],
    relatedEntities: [...alert.relatedEntities],
    keywords: [...alert.keywords],
  };
}

export async function getAlerts(): Promise<InboxAlert[]> {
  return simulateNetworkResponse(
    alertStorage.map(cloneAlert),
    300,
    defaultFailureChance,
    'Failed to load alerts. Please try again.',
  );
}

export async function updateAlert(id: string, updates: Partial<InboxAlert>): Promise<InboxAlert> {
  const index = alertStorage.findIndex(alert => alert.id === id);
  if (index < 0) {
    return Promise.reject(new Error(`Alert not found: ${id}`));
  }
  alertStorage[index] = { ...alertStorage[index], ...updates };
  return simulateNetworkResponse(
    cloneAlert(alertStorage[index]),
    220,
    defaultFailureChance,
    `Failed to update alert ${id}. Please try again.`,
  );
}

export async function assignAlert(
  id: string,
  analyst: { initials: string; name?: string },
): Promise<InboxAlert> {
  return updateAlert(id, {
    assignedTo: analyst.initials,
    assignedName: analyst.name,
    status: 'ASSIGNED',
  });
}

export async function escalateAlert(id: string): Promise<InboxAlert> {
  return updateAlert(id, { status: 'ESCALATED' });
}
