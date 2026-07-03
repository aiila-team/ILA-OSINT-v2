// src/components/PlatformInfo.tsx
import React, { useEffect, useState, useRef } from 'react';
import styles from './PlatformInfo.module.scss';

// ─── PlatformInfo ─────────────────────────────────────────────────────────────

const PlatformInfo: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const sessionRef = useRef(
    Math.random().toString(36).slice(2, 10).toUpperCase()
  );

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const utc = time.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <header className={styles.wrapper} aria-label="ILA Platform header">

      {/* Top rule with classification */}
      <div className={styles.topRule} aria-hidden="true">
        <span className={styles.ruleLine} />
        <span className={styles.classification}>RESTRICTED ACCESS</span>
        <span className={styles.ruleLine} />
      </div>

      {/* Logo + wordmark */}
      <div className={styles.logoRow}>
        {/* Crosshair logo mark */}
        <div className={styles.logoMark} aria-hidden="true">
          <svg
            width="52"
            height="52"
            viewBox="0 0 52 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer square */}
            <rect x="1.5" y="1.5" width="49" height="49" stroke="currentColor" strokeWidth="1.5" />
            {/* Inner circle */}
            <circle cx="26" cy="26" r="10" stroke="currentColor" strokeWidth="1.5" />
            {/* Crosshair lines */}
            <line x1="26" y1="1.5" x2="26" y2="16" stroke="currentColor" strokeWidth="1.5" />
            <line x1="26" y1="36" x2="26" y2="50.5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="1.5" y1="26" x2="16" y2="26" stroke="currentColor" strokeWidth="1.5" />
            <line x1="36" y1="26" x2="50.5" y2="26" stroke="currentColor" strokeWidth="1.5" />
            {/* Center dot */}
            <circle cx="26" cy="26" r="2.5" fill="currentColor" />
            {/* Corner ticks */}
            <line x1="1.5" y1="8" x2="8" y2="8" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="1.5" x2="8" y2="8" stroke="currentColor" strokeWidth="1" />
            <line x1="50.5" y1="8" x2="44" y2="8" stroke="currentColor" strokeWidth="1" />
            <line x1="44" y1="1.5" x2="44" y2="8" stroke="currentColor" strokeWidth="1" />
            <line x1="1.5" y1="44" x2="8" y2="44" stroke="currentColor" strokeWidth="1" />
            <line x1="8" y1="50.5" x2="8" y2="44" stroke="currentColor" strokeWidth="1" />
            <line x1="50.5" y1="44" x2="44" y2="44" stroke="currentColor" strokeWidth="1" />
            <line x1="44" y1="50.5" x2="44" y2="44" stroke="currentColor" strokeWidth="1" />
          </svg>
        </div>

        {/* Text block */}
        <div className={styles.textBlock}>
          <div className={styles.platformName}>ILA OSINT</div>
          <div className={styles.tagline}>Reality to Action Intelligence</div>
        </div>

        {/* Version badge */}
        <div className={styles.versionBadge} aria-label="Platform version 4.2.1">
          v4.2.1
        </div>
      </div>

      {/* Meta bar */}
      <div className={styles.metaBar} aria-label="Session metadata">
        <span className={styles.metaChip}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.metaLabel}>LIVE</span>
        </span>
        <span className={styles.metaDivider} aria-hidden="true">│</span>
        <span className={styles.metaChip}>
          <span className={styles.metaLabel}>SESSION</span>
          <span className={styles.metaVal}>{sessionRef.current}</span>
        </span>
        <span className={styles.metaDivider} aria-hidden="true">│</span>
        <span className={styles.metaChip}>
          <span className={styles.metaLabel}>UTC</span>
          <span className={styles.metaVal} aria-live="polite" aria-atomic="true">
            {utc}
          </span>
        </span>
      </div>
    </header>
  );
};

export default PlatformInfo;