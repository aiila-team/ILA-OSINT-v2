// src/components/admin/AlertsTable/AlertsTable.tsx
import React from 'react';
import { WarningAlt } from '@carbon/icons-react';
import type { AlertRecord, RiskLevel, AlertStatus } from '../../../types/dashboard';
import EmptyState from '../EmptyState/EmptyState';
import styles from './AlertsTable.module.scss';

export interface AlertsTableProps {
  alerts: AlertRecord[];
  loading?: boolean;
}

const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

const STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'OPEN',
  investigating: 'INVESTIGATING',
  resolved: 'RESOLVED',
  dismissed: 'DISMISSED',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) +
    'Z'
  );
}

const SkeletonRow: React.FC = () => (
  <tr>
    {Array.from({ length: 5 }).map((_, i) => (
      <td key={i}>
        <div className={styles.skeletonCell} />
      </td>
    ))}
  </tr>
);

const AlertsTable: React.FC<AlertsTableProps> = ({ alerts, loading = false }) => {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Alert ID</th>
            <th>Type</th>
            <th>Risk Level</th>
            <th>Status</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

          {!loading &&
            alerts.map((alert) => (
              <tr key={alert.id}>
                <td className={styles.idCell}>{alert.id}</td>
                <td>{alert.type}</td>
                <td>
                  <span className={`${styles.riskBadge} ${styles[`risk_${alert.riskLevel}`]}`}>
                    {RISK_LABEL[alert.riskLevel]}
                  </span>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${alert.status}`]}`}>
                    {STATUS_LABEL[alert.status]}
                  </span>
                </td>
                <td className={styles.timeCell}>{formatTimestamp(alert.timestamp)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {!loading && alerts.length === 0 && (
        <EmptyState
          icon={<WarningAlt size={28} />}
          title="No alerts found"
          description="Recent alerts will appear here as they are detected."
        />
      )}
    </div>
  );
};

export default AlertsTable;
