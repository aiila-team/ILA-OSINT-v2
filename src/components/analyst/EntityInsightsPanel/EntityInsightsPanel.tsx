import React from 'react';
import { Tag } from '@carbon/react';
import { WarningAlt, WarningFilled, ChartLine, ChartNetwork } from '@carbon/icons-react';
import styles from './EntityInsightsPanel.module.scss';

export type IntelligenceInsightSeverity = 'critical' | 'warning' | 'info';

export interface IntelligenceInsight {
  id: string;
  title: string;
  description: string;
  severity: IntelligenceInsightSeverity;
  category: 'fraud' | 'risk' | 'network' | 'activity';
}

interface EntityInsightsPanelProps {
  insights: IntelligenceInsight[];
  loading?: boolean;
}

const ICON_MAP = {
  fraud: <WarningAlt size={16} />, 
  risk: <WarningFilled size={16} />,
  network: <ChartNetwork size={16} />,
  activity: <ChartLine size={16} />,
};

const SEVERITY_TAG: Record<IntelligenceInsightSeverity, { label: string; type: 'red' | 'magenta' | 'blue' }> = {
  critical: { label: 'CRITICAL', type: 'red' },
  warning: { label: 'ELEVATED', type: 'magenta' },
  info: { label: 'INFO', type: 'blue' },
};

const EntityInsightsPanel: React.FC<EntityInsightsPanelProps> = ({ insights, loading = false }) => {
  return (
    <section className={styles.panel} aria-label="Intelligence insights">
      <div className={styles.header}>
        <div>
          <p className={styles.title}>INTELLIGENCE INSIGHTS</p>
          <p className={styles.subtitle}>Actionable signals derived from entity activity and linking analysis.</p>
        </div>
        <Tag type="blue" size="sm" className={styles.summaryTag}>
          {insights.length} insights
        </Tag>
      </div>

      <div className={styles.cards}>
        {loading
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={styles.card}>
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonText} />
                <div className={styles.skeletonTextShort} />
              </div>
            ))
          : insights.map((insight) => {
              const severity = SEVERITY_TAG[insight.severity];
              return (
                <article key={insight.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.icon}>{ICON_MAP[insight.category]}</span>
                    <Tag type={severity.type} size="sm" className={styles.severityTag}>
                      {severity.label}
                    </Tag>
                  </div>
                  <h3 className={styles.cardTitle}>{insight.title}</h3>
                  <p className={styles.cardDescription}>{insight.description}</p>
                </article>
              );
            })}
      </div>
    </section>
  );
};

export default EntityInsightsPanel;
