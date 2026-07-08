// src/components/SecurityNotice.tsx
import React from 'react';
import styles from './SecurityNotice.module.scss';

// ─── SecurityNotice ───────────────────────────────────────────────────────────

const SecurityNotice: React.FC = () => (
  <footer className={styles.wrapper} aria-label="Security and legal notice">

    {/* Warning icon row */}
    <div className={styles.iconRow} aria-hidden="true">
      <span className={styles.warnIcon}>⚠</span>
      <span className={styles.ruleLine} />
      <span className={styles.warnIcon}>⚠</span>
    </div>

    {/* Primary warning line */}
    <p className={styles.primaryText} role="note">
      <strong>AUTHORIZED PERSONNEL ONLY.</strong>{' '}
      All activities are monitored and recorded.
    </p>

    {/* Secondary legal copy */}
    <p className={styles.secondaryText}>
      Unauthorized access or use of this system is prohibited and may result
      in civil and criminal penalties. By proceeding you acknowledge and
      consent to monitoring in accordance with applicable law.
    </p>

    {/* Bottom rule */}
    <div className={styles.bottomRule} aria-hidden="true" />
  </footer>
);

export default SecurityNotice;