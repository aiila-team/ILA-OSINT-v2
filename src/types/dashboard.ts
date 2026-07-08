// ── ILA OSINT — Admin Dashboard domain types ────────────────────────
// src/types/dashboard.ts

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type TrendDirection = 'up' | 'down' | 'flat';
export type LoadState = 'idle' | 'loading' | 'success' | 'error';

// ── KPI cards ─────────────────────────────────────────────────────
export interface DashboardStats {
  totalCases: number;
  totalCasesTrend: { direction: TrendDirection; value: number };
  activeInvestigations: number;
  activeInvestigationsTrend: { direction: TrendDirection; value: number };
  highRiskAlerts: number;
  highRiskAlertsTrend: { direction: TrendDirection; value: number };
  dataSourcesConnected: number;
  dataSourcesTotal: number;
}

// ── Charts ────────────────────────────────────────────────────────
export interface AlertsOverTimePoint {
  /** e.g. "00:00", "02:00" ... */
  time: string;
  alerts: number;
}

export interface DataSourceActivityPoint {
  source: string;
  events: number;
}

// ── AI Insights panel ─────────────────────────────────────────────
export type InsightIconName = 'pattern' | 'anomaly' | 'risk' | 'network';

export interface AIInsight {
  id: string;
  icon: InsightIconName;
  title: string;
  description: string;
  confidence: number; // 0–100
}

// ── Recent alerts table ───────────────────────────────────────────
export interface AlertRecord {
  id: string;
  type: string;
  riskLevel: RiskLevel;
  status: AlertStatus;
  timestamp: string; // ISO 8601
}

// ── Activity timeline ──────────────────────────────────────────────
export type ActivityEventType =
  | 'wallet_created'
  | 'suspicious_transaction'
  | 'case_flagged'
  | 'report_generated'
  | 'user_action';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  description: string;
  timestamp: string; // ISO 8601
  severity?: RiskLevel;
}
