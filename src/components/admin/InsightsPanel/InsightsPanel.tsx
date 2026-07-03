// src/components/admin/InsightsPanel/InsightsPanel.tsx
import React from 'react';
import { ChartNetwork, ChartLine, WarningAlt, Connect, Idea } from '@carbon/icons-react';
import type { AIInsight, InsightIconName } from '../../../types/dashboard';
import EmptyState from '../EmptyState/EmptyState';
import styles from './InsightsPanel.module.scss';

export interface InsightsPanelProps {
  insights: AIInsight[];
  loading?: boolean;
}

const ICON_MAP: Record<InsightIconName, React.ReactNode> = {
  pattern: <ChartNetwork size={16} />,
  anomaly: <ChartLine size={16} />,
  risk: <WarningAlt size={16} />,
  network: <Connect size={16} />,
};

function confidenceTier(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 85) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

const SkeletonCard: React.FC = () => (
  <div className={styles.card}>
    <div className={`${styles.skeleton} ${styles.skelTag}`} />
    <div className={`${styles.skeleton} ${styles.skelTitle}`} />
    <div className={`${styles.skeleton} ${styles.skelDesc}`} />
    <div className={`${styles.skeleton} ${styles.skelDescShort}`} />
  </div>
);

const InsightsPanel: React.FC<InsightsPanelProps> = ({ insights, loading = false }) => {
  return (
    <div className={styles.panel}>
      {loading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {!loading &&
        insights.map((insight) => {
          const tier = confidenceTier(insight.confidence);
          return (
            <div key={insight.id} className={styles.card}>
              <div className={styles.top}>
                <span className={styles.iconTag}>
                  {ICON_MAP[insight.icon] ?? <Idea size={16} />}
                </span>
                <span className={`${styles.confBadge} ${styles[`conf_${tier}`]}`}>
                  {insight.confidence}% CONF
                </span>
              </div>
              <div className={styles.title}>{insight.title}</div>
              <p className={styles.desc}>{insight.description}</p>
            </div>
          );
        })}

      {!loading && insights.length === 0 && (
        <EmptyState
          icon={<Idea size={28} />}
          title="No insights yet"
          description="AI-generated insights will appear here as patterns are detected."
        />
      )}
    </div>
  );
};

export default InsightsPanel;
