// src/components/admin/StatCard/StatCard.tsx
import React from 'react';
import { ArrowUp, ArrowDown, ArrowRight } from '@carbon/icons-react';
import type { TrendDirection } from '../../../types/dashboard';
import styles from './StatCard.module.scss';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { direction: TrendDirection; value: number; unit?: string };
  sub?: string;
  /** visually flags the card as needing attention, e.g. high risk alerts */
  variant?: 'default' | 'danger';
  loading?: boolean;
}

const TrendIcon: React.FC<{ direction: TrendDirection }> = ({ direction }) => {
  if (direction === 'up') return <ArrowUp size={12} />;
  if (direction === 'down') return <ArrowDown size={12} />;
  return <ArrowRight size={12} />;
};

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  sub,
  variant = 'default',
  loading = false,
}) => {
  if (loading) {
    return (
      <div className={styles.card} aria-busy="true">
        <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
        <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
        <div className={`${styles.skeleton} ${styles.skeletonSub}`} />
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${variant === 'danger' ? styles.danger : ''}`}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {icon && <span className={styles.icon}>{icon}</span>}
      </div>

      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        {trend && (
          <span
            className={`${styles.trend} ${
              trend.direction === 'up'
                ? styles.trendUp
                : trend.direction === 'down'
                ? styles.trendDown
                : styles.trendFlat
            }`}
          >
            <TrendIcon direction={trend.direction} />
            {trend.value}
            {trend.unit ?? ''}
          </span>
        )}
      </div>

      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  );
};

export default StatCard;
