import React from 'react';
import styles from './AnalyticsPanel.module.scss';

interface StatCard {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  color?: string;
}

const STATS: StatCard[] = [
  { label: 'Active Investigations', value: '47',  delta: '+3 today',   deltaUp: true,  color: '#00a3c7' },
  { label: 'Open Alerts',           value: '12',  delta: '-5 resolved', deltaUp: false, color: '#f1c21b' },
  { label: 'Entities Tracked',      value: '1,284', delta: '+18',       deltaUp: true,  color: '#24a148' },
  { label: 'Active Users',          value: '8',   delta: '2 online',    deltaUp: true,  color: '#4589ff' },
  { label: 'System Health',         value: '99.9%', delta: 'Nominal',   deltaUp: true,  color: '#24a148' },
  { label: 'Audit Events (24h)',    value: '3,421', delta: '+241',       deltaUp: true,  color: '#a56eff' },
];

const RECENT_ALERTS = [
  { id: 'ALT-8821', severity: 'HIGH',   desc: 'Unusual login from foreign IP',      time: '06:14Z' },
  { id: 'ALT-8820', severity: 'MEDIUM', desc: 'Entity graph anomaly detected',       time: '05:58Z' },
  { id: 'ALT-8819', severity: 'LOW',    desc: 'Report export completed',             time: '05:33Z' },
  { id: 'ALT-8818', severity: 'HIGH',   desc: 'Policy violation — bulk data access', time: '04:11Z' },
  { id: 'ALT-8817', severity: 'MEDIUM', desc: 'New device registered for analyst',   time: '03:47Z' },
];

const SEVERITY_COLOR: Record<string, string> = {
  HIGH:   '#fa4d56',
  MEDIUM: '#f1c21b',
  LOW:    '#24a148',
};

const AnalyticsPanel: React.FC = () => {
  return (
    <div className={styles.panel}>
      {/* Stat cards */}
      <div className={styles.statsGrid}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statLabel}>{s.label}</div>
            <div className={styles.statValue} style={{ color: s.color }}>{s.value}</div>
            {s.delta && (
              <div className={styles.statDelta} style={{ color: s.deltaUp ? '#24a148' : '#f1c21b' }}>
                {s.delta}
              </div>
            )}
            <div className={styles.statBar}>
              <div className={styles.statBarFill} style={{ background: s.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Two-column lower section */}
      <div className={styles.lowerGrid}>
        {/* Alert feed */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>RECENT ALERTS</span>
            <span className={styles.cardBadge} style={{ background: 'rgba(250,77,86,0.12)', color: '#fa4d56', border: '1px solid rgba(250,77,86,0.3)' }}>
              {RECENT_ALERTS.filter(a => a.severity === 'HIGH').length} HIGH
            </span>
          </div>
          <div className={styles.alertList}>
            {RECENT_ALERTS.map((a) => (
              <div key={a.id} className={styles.alertRow}>
                <span className={styles.alertSeverity} style={{ color: SEVERITY_COLOR[a.severity] }}>
                  {a.severity}
                </span>
                <span className={styles.alertId}>{a.id}</span>
                <span className={styles.alertDesc}>{a.desc}</span>
                <span className={styles.alertTime}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Graph placeholder */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>ACTIVITY HEATMAP (24H)</span>
          </div>
          <div className={styles.graphPlaceholder}>
            {Array.from({ length: 24 }).map((_, i) => {
              const h = Math.floor(Math.random() * 80) + 10;
              return (
                <div key={i} className={styles.bar} style={{ height: `${h}%` }} />
              );
            })}
          </div>
          <div className={styles.graphLabels}>
            {['00', '04', '08', '12', '16', '20', '24'].map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;