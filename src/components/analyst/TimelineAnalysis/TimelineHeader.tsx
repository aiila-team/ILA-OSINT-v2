import React, { useEffect, useState } from 'react';
import styles from './TimelineHeader.module.scss';

interface TimelineHeaderProps {
  eventCount: number;
  alertCount: number;
  entityCount: number;
}

const TimelineHeader: React.FC<TimelineHeaderProps> = ({ eventCount, alertCount, entityCount }) => {
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUtcTime(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.headerRow}>
      <div className={styles.headerMeta}>
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} />
          LIVE
        </div>
        <div className={styles.clock}>UTC {utcTime}</div>
      </div>
      <div className={styles.metrics}>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Events</span>
          <span className={styles.metricValue}>{eventCount}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Alerts</span>
          <span className={styles.metricValue}>{alertCount}</span>
        </div>
        <div className={styles.metricItem}>
          <span className={styles.metricLabel}>Entities</span>
          <span className={styles.metricValue}>{entityCount}</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineHeader;
