import React from 'react';
import styles from './TimelineAnalyticsBar.module.scss';

interface TimelineAnalyticsBarProps {
  stats: Array<{ title: string; value: string }>;
}

const TimelineAnalyticsBar: React.FC<TimelineAnalyticsBarProps> = ({ stats }) => (
  <div className={styles.analyticsBar}>
    {stats.map((card) => (
      <div key={card.title} className={styles.analyticsCard}>
        <span className={styles.cardLabel}>{card.title}</span>
        <span className={styles.cardValue}>{card.value}</span>
      </div>
    ))}
  </div>
);

export default TimelineAnalyticsBar;
