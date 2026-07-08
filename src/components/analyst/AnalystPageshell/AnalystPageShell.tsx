// src/components/analyst/AnalystPageShell/AnalystPageShell.tsx
// ILA OSINT — Analyst Page Shell
// Wraps every analyst-facing page with a consistent dark header bar,
// page title, and an "actions" slot for right-side controls.

import React from 'react';
import { motion } from 'framer-motion';
import { pageFadeIn, pageFadeInTransition } from '../../../styles/motion';
import styles from './AnalystPageShell.module.scss';

interface AnalystPageShellProps {
  /** Page heading — shown in monospace caps */
  title:    string;
  /** Right-side header controls (buttons, badges, etc.) */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const AnalystPageShell: React.FC<AnalystPageShellProps> = ({
  title,
  actions,
  children,
}) => (
  <motion.div
    className={styles.shell}
    variants={pageFadeIn}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={pageFadeInTransition}
  >
    {/* ── Page header ── */}
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {actions && (
        <div className={styles.actions} role="toolbar" aria-label="Page actions">
          {actions}
        </div>
      )}
    </header>

    {/* ── Page body ── */}
    <div className={styles.body}>
      {children}
    </div>
  </motion.div>
);

export default AnalystPageShell;