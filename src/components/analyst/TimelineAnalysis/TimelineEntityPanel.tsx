import React from 'react';
import { motion } from 'framer-motion';
import styles from './TimelineEntityPanel.module.scss';

const entities = [
  { name: 'D.Volkov', type: 'Person', risk: 'High', relationships: 12, cases: 3, alerts: 6 },
  { name: 'Kraskov Hldg', type: 'Organization', risk: 'Critical', relationships: 8, cases: 2, alerts: 4 },
  { name: 'APT-SHADOW-12', type: 'Threat Actor', risk: 'Critical', relationships: 15, cases: 5, alerts: 9 },
];

const TimelineEntityPanel: React.FC = () => (
  <motion.aside
    className={styles.panel}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    <div className={styles.panelHeader}>
      <span>Entity Correlation</span>
    </div>
    <div className={styles.panelSummary}>
      <div>
        <span className={styles.summaryLabel}>Relationship Count</span>
        <span className={styles.summaryValue}>35</span>
      </div>
      <div>
        <span className={styles.summaryLabel}>Risk Trend</span>
        <span className={styles.summaryValue}>Rising</span>
      </div>
    </div>
    <div className={styles.panelSection}>
      <span className={styles.sectionLabel}>Related Entities</span>
      {entities.map((entity) => (
        <div key={entity.name} className={styles.entityRow}>
          <div>
            <span className={styles.entityName}>{entity.name}</span>
            <span className={styles.entityType}>{entity.type}</span>
          </div>
          <span className={styles.entityRisk}>{entity.risk}</span>
        </div>
      ))}
    </div>
    <div className={styles.panelSection}>
      <span className={styles.sectionLabel}>Connected Cases</span>
      <div className={styles.caseRow}>OP-IRONVEIL</div>
      <div className={styles.caseRow}>OP-SEAHAWK</div>
    </div>
    <div className={styles.panelSection}>
      <span className={styles.sectionLabel}>Connected Alerts</span>
      <div className={styles.caseRow}>ALRT-2291</div>
      <div className={styles.caseRow}>ALRT-2210</div>
    </div>
  </motion.aside>
);

export default TimelineEntityPanel;
