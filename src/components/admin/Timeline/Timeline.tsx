// src/components/admin/Timeline/Timeline.tsx
import React from 'react';
import { Wallet, WarningAltFilled, FlagFilled, Document, UserAvatar } from '@carbon/icons-react';
import type { ActivityEvent, ActivityEventType } from '../../../types/dashboard';
import EmptyState from '../EmptyState/EmptyState';
import styles from './Timeline.module.scss';

export interface TimelineProps {
  events: ActivityEvent[];
  loading?: boolean;
}

const ICON_MAP: Record<ActivityEventType, React.ReactNode> = {
  wallet_created: <Wallet size={14} />,
  suspicious_transaction: <WarningAltFilled size={14} />,
  case_flagged: <FlagFilled size={14} />,
  report_generated: <Document size={14} />,
  user_action: <UserAvatar size={14} />,
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const SkeletonItem: React.FC = () => (
  <div className={styles.item}>
    <div className={`${styles.skeleton} ${styles.skelDot}`} />
    <div className={styles.body}>
      <div className={`${styles.skeleton} ${styles.skelTitle}`} />
      <div className={`${styles.skeleton} ${styles.skelDesc}`} />
    </div>
  </div>
);

const Timeline: React.FC<TimelineProps> = ({ events, loading = false }) => {
  return (
    <div className={styles.wrap}>
      {loading && (
        <>
          <SkeletonItem />
          <SkeletonItem />
          <SkeletonItem />
        </>
      )}

      {!loading &&
        events.map((event, idx) => (
          <div key={event.id} className={styles.item}>
            <div className={styles.markerCol}>
              <div
                className={`${styles.dot} ${
                  event.severity ? styles[`sev_${event.severity}`] : styles.sevDefault
                }`}
              >
                {ICON_MAP[event.type]}
              </div>
              {idx < events.length - 1 && <div className={styles.line} />}
            </div>
            <div className={styles.body}>
              <div className={styles.titleRow}>
                <span className={styles.title}>{event.title}</span>
                <span className={styles.time}>{relativeTime(event.timestamp)}</span>
              </div>
              <p className={styles.desc}>{event.description}</p>
            </div>
          </div>
        ))}

      {!loading && events.length === 0 && (
        <EmptyState
          title="No activity yet"
          description="Platform activity will appear here as events occur."
        />
      )}
    </div>
  );
};

export default Timeline;
