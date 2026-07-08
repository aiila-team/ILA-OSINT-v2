import type {
  DashboardStats,
  AlertRecord,
  AIInsight,
  AlertsOverTimePoint,
  DataSourceActivityPoint,
  ActivityEvent,
} from '../types/dashboard';

export async function getDashboardStats(): Promise<DashboardStats> {
  return {
    totalCases: 142,
    totalCasesTrend: { direction: 'up', value: 8 },
    activeInvestigations: 23,
    activeInvestigationsTrend: { direction: 'down', value: 1 },
    highRiskAlerts: 9,
    highRiskAlertsTrend: { direction: 'up', value: 2 },
    dataSourcesConnected: 18,
    dataSourcesTotal: 21,
  };
}

export async function getAlerts(): Promise<AlertRecord[]> {
  return [
    {
      id: 'ALT-9901',
      type: 'Suspicious login',
      riskLevel: 'high',
      status: 'open',
      timestamp: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
    },
    {
      id: 'ALT-9902',
      type: 'Data exfiltration',
      riskLevel: 'critical',
      status: 'investigating',
      timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    },
    {
      id: 'ALT-9903',
      type: 'Unauthorized access',
      riskLevel: 'medium',
      status: 'resolved',
      timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
  ];
}

export async function getInsights(): Promise<AIInsight[]> {
  return [
    {
      id: 'INS-001',
      icon: 'anomaly',
      title: 'Anomalous data flow',
      description: 'A rare pattern of access was detected from an untrusted network.',
      confidence: 84,
    },
    {
      id: 'INS-002',
      icon: 'risk',
      title: 'High-risk alert cluster',
      description: 'Multiple high-risk alerts originated from the same user account.',
      confidence: 92,
    },
    {
      id: 'INS-003',
      icon: 'network',
      title: 'New entity relationship',
      description: 'The platform found a previously unknown association between assets.',
      confidence: 78,
    },
  ];
}

export async function getAlertsOverTime(): Promise<AlertsOverTimePoint[]> {
  return [
    { time: '00:00', alerts: 4 },
    { time: '04:00', alerts: 7 },
    { time: '08:00', alerts: 12 },
    { time: '12:00', alerts: 9 },
    { time: '16:00', alerts: 10 },
    { time: '20:00', alerts: 6 },
  ];
}

export async function getDataSourceActivity(): Promise<DataSourceActivityPoint[]> {
  return [
    { source: 'Network IDS', events: 144 },
    { source: 'Authentication', events: 121 },
    { source: 'Cloud Audit', events: 89 },
    { source: 'Endpoint', events: 74 },
  ];
}

export async function getActivityTimeline(): Promise<ActivityEvent[]> {
  return [
    {
      id: 'ACT-001',
      type: 'wallet_created',
      title: 'New analyst workspace created',
      description: 'A new workspace was provisioned for the SOC analyst team.',
      timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      severity: 'low',
    },
    {
      id: 'ACT-002',
      type: 'suspicious_transaction',
      title: 'Suspicious transaction detected',
      description: 'Abnormal data transfer was flagged by the correlation engine.',
      timestamp: new Date(Date.now() - 1000 * 60 * 54).toISOString(),
      severity: 'high',
    },
    {
      id: 'ACT-003',
      type: 'case_flagged',
      title: 'Case flagged for review',
      description: 'A new case requires analyst review and escalation.',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      severity: 'medium',
    },
  ];
}
