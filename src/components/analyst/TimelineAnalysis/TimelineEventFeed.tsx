import React from 'react';
import { motion } from 'framer-motion';
import { EVENT_TYPE_COLOR_HEX, EVENT_TYPE_LABEL, type TimelineEvent } from '../../../hooks/useTimeline';
import styles from './TimelineEventFeed.module.scss';

interface TimelineEventFeedProps {
  events: TimelineEvent[];
}

const TimelineEventFeed: React.FC<TimelineEventFeedProps> = ({ events }) => {
  return (
    <div className={styles.feedWrap}>
      {events.length === 0 ? (
        <div className={styles.emptyState}>
          No timeline events match the current filters.
        </div>
      ) : (
        events.map((event) => {
          const color = EVENT_TYPE_COLOR_HEX[event.type] || '#64748B';
          const risk = event.confidence ? (event.confidence > 90 ? 'CRITICAL' : event.confidence > 75 ? 'HIGH' : event.confidence > 60 ? 'MEDIUM' : 'LOW') : 'LOW';

          return (
            <motion.article
              key={event.id}
              className={styles.eventRow}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className={styles.eventTime}>
                <span>{new Date(event.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })}</span>
                <span>{new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} UTC</span>
              </div>
              <div className={styles.eventMarker} style={{ borderColor: color }} />
              <div className={styles.eventCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.eventType} style={{ color }}>{EVENT_TYPE_LABEL[event.type]}</span>
                  <span className={styles.riskBadge} data-risk={risk}>{risk}</span>
                </div>
                <h3 className={styles.eventTitle}>{event.title}</h3>
                <p className={styles.eventDescription}>{event.description}</p>
                <div className={styles.cardMeta}>
                  <span>{event.entityName}</span>
                  <span>{event.source}</span>
                  <span>{event.confidence ? `${event.confidence}% confidence` : 'N/A'}</span>
                </div>
                <div className={styles.cardActions}>
                  <button type="button">View Entity</button>
                  <button type="button">Open Investigation</button>
                  <button type="button">Add Note</button>
                </div>
              </div>
            </motion.article>
          );
        })
      )}
    </div>
  );
};

export default TimelineEventFeed;
