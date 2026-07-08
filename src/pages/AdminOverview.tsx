// src/pages/AdminOverview.tsx
//
// Admin Overview Dashboard for ILA OSINT.
// Assumes it is rendered inside the existing <DashboardLayout> which
// already provides the sidebar — this page renders the topbar +
// content area only.

import React from 'react';
import {
  Notification,
  Settings,
  Folder,
  Search,
  WarningAltFilled,
  Connect,
} from '@carbon/icons-react';
import { useDashboardData } from '../hooks/useDashboardData';
import StatCard from '../components/admin/StatCard/StatCard';
import AlertsTable from '../components/admin/AlertsTable/AlertsTable';
import InsightsPanel from '../components/admin/InsightsPanel/InsightsPanel';
// touch: refresh module resolution
import Timeline from '../components/admin/Timeline';
import AlertsLineChart from '../components/admin/charts/AlertsLineChart';
import DataSourceBarChart from '../components/admin/charts/DataSourceBarChart';
import styles from './AdminOverview.module.scss';

// ── Small local Panel wrapper (header + body shell used throughout) ──
const Panel: React.FC<{
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, right, children, className }) => (
  <div className={`${styles.panel} ${className ?? ''}`}>
    <div className={styles.panelHeader}>
      <div className={styles.panelTitle}>
        {icon}
        <span>{title}</span>
      </div>
      {right}
    </div>
    <div className={styles.panelBody}>{children}</div>
  </div>
);

const AdminOverview: React.FC = () => {
  const {
    stats,
    alerts,
    insights,
    alertsOverTime,
    dataSourceActivity,
    activity,
    loadState,
    error,
    refetch,
  } = useDashboardData();

  const isLoading = loadState === 'loading' || loadState === 'idle';

  return (
    <div className={styles.page}>
      {/* ── Top navbar ─────────────────────────────────────────── */}
      <div className={styles.topbar}>
        <div className={styles.breadcrumb}>
          ILA OSINT <span className={styles.sep}>/</span>{' '}
          <b className={styles.crumbActive}>Admin Overview</b>
        </div>
        <div className={styles.topbarRight}>
          <button className={styles.iconBtn} aria-label="Notifications" type="button">
            <Notification size={18} />
          </button>
          <button className={styles.iconBtn} aria-label="Settings" type="button">
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error && (
          <div className={styles.errorBanner}>
            Failed to load dashboard data: {error}{' '}
            <button onClick={refetch} className={styles.retryBtn} type="button">
              Retry
            </button>
          </div>
        )}

        {/* ── KPI Cards ────────────────────────────────────────── */}
        <div className={styles.kpiRow}>
          <StatCard
            label="Total Cases"
            value={stats?.totalCases ?? '—'}
            icon={<Folder size={16} />}
            trend={stats ? { direction: stats.totalCasesTrend.direction, value: stats.totalCasesTrend.value } : undefined}
            sub="across all active investigations"
            loading={isLoading}
          />
          <StatCard
            label="Active Investigations"
            value={stats?.activeInvestigations ?? '—'}
            icon={<Search size={16} />}
            trend={
              stats
                ? { direction: stats.activeInvestigationsTrend.direction, value: stats.activeInvestigationsTrend.value }
                : undefined
            }
            sub="currently being worked"
            loading={isLoading}
          />
          <StatCard
            label="High Risk Alerts"
            value={stats?.highRiskAlerts ?? '—'}
            icon={<WarningAltFilled size={16} />}
            trend={
              stats
                ? { direction: stats.highRiskAlertsTrend.direction, value: stats.highRiskAlertsTrend.value }
                : undefined
            }
            sub="requires analyst review"
            variant="danger"
            loading={isLoading}
          />
          <StatCard
            label="Data Sources Connected"
            value={stats ? `${stats.dataSourcesConnected}/${stats.dataSourcesTotal}` : '—'}
            icon={<Connect size={16} />}
            sub="feeds actively ingesting"
            loading={isLoading}
          />
        </div>

        {/* ── Charts ───────────────────────────────────────────── */}
        <div className={styles.grid2}>
          <Panel title="ALERTS OVER TIME" right={<span className={styles.panelSub}>Last 24h</span>}>
            <AlertsLineChart data={alertsOverTime} loading={isLoading} />
          </Panel>
          <Panel title="DATA SOURCE ACTIVITY" right={<span className={styles.panelSub}>Events / source</span>}>
            <DataSourceBarChart data={dataSourceActivity} loading={isLoading} />
          </Panel>
        </div>

        {/* ── AI Insights + Recent Alerts ─────────────────────── */}
        <div className={styles.grid2}>
          <Panel title="AI INSIGHTS">
            <InsightsPanel insights={insights} loading={isLoading} />
          </Panel>
          <Panel title="RECENT ALERTS">
            <AlertsTable alerts={alerts} loading={isLoading} />
          </Panel>
        </div>

        {/* ── Activity Timeline ───────────────────────────────── */}
        <Panel title="ACTIVITY TIMELINE" className={styles.fullWidth}>
          <Timeline events={activity} loading={isLoading} />
        </Panel>
      </div>
    </div>
  );
};

export default AdminOverview;
