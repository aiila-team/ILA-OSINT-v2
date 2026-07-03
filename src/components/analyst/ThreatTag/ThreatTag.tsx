// src/components/analyst/ThreatTag/ThreatTag.tsx
// ILA OSINT — Threat Level Tag Component
// Renders a coloured priority pill matching the mockup design.

import React from 'react';
import type { Priority } from '../../../hooks/useInvestigations';
import styles from './ThreatTag.module.scss';

interface ThreatTagProps {
  level: Priority;
  /** Show a filled dot before the label */
  dot?: boolean;
  size?: 'sm' | 'md';
}

const LABEL_MAP: Record<Priority, string> = {
  CRITICAL: 'CRITICAL',
  HIGH:     'HIGH',
  MEDIUM:   'MEDIUM',
  LOW:      'LOW',
};

const CLASS_MAP: Record<Priority, string> = {
  CRITICAL: styles.critical,
  HIGH:     styles.high,
  MEDIUM:   styles.medium,
  LOW:      styles.low,
};

const ThreatTag: React.FC<ThreatTagProps> = ({ level, dot = false, size = 'sm' }) => (
  <span
    className={`${styles.tag} ${CLASS_MAP[level]} ${size === 'md' ? styles.md : ''}`}
    aria-label={`Priority: ${LABEL_MAP[level]}`}
  >
    {dot && <span className={styles.dot} aria-hidden="true" />}
    {LABEL_MAP[level]}
  </span>
);

export default ThreatTag;