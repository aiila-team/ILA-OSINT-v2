import React, { useEffect, useState } from 'react';
import HamburgerMenu from '../../components/Auth/HamburgerMenu';
import LoginCard from '../../components/Auth/LoginCard';
import styles from './LoginPage.module.scss';

interface LoginPageProps {
  isLoginOpen: boolean;
  onOpenLogin: () => void;
  onCloseLogin: () => void;
  onLoginSuccess?: (username: string, orgId: string) => void;
}

const MARQUEE_TEXT =
  'ILA OSINT  ·  Reality → Intelligence → Action  ·  ' +
  'Transforming fragmented information into actionable intelligence  ·  ' +
  'Intelligence & Link Analysis  ·  Cyber Investigation  ·  ' +
  'Pattern Recognition  ·  Network Mapping  ·  Threat Attribution  ·  ';

const STATS = [
  { value: '99.97%', label: 'UPTIME SLA' },
  { value: '<80ms',  label: 'QUERY LATENCY' },
  { value: '256-BIT', label: 'ENCRYPTION' },
  { value: 'NATO',   label: 'CLASSIFICATION' },
];

const LoginPage: React.FC<LoginPageProps> = ({
  isLoginOpen, onOpenLogin, onCloseLogin, onLoginSuccess,
}) => {
  const [glitchActive, setGlitchActive] = useState(false);

  useEffect(() => {
    const fire = () => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 220);
    };
    const interval = setInterval(fire, 6000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, []);

  const utcNow = new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

  return (
    <div className={styles.page}>
      <div className={styles.gridOverlay} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.statusDot} />
          <span className={styles.statusText}>SYSTEM OPERATIONAL</span>
          <span className={styles.separator}>|</span>
          <span className={styles.utcTime}>{utcNow}</span>
        </div>
        <div className={styles.topBarCenter}>
          <span className={styles.brandMono}>ILA</span>
        </div>
        <div className={styles.topBarRight}>
          <HamburgerMenu isOpen={isLoginOpen} onToggle={onOpenLogin} />
        </div>
      </header>

      <main className={styles.hero}>
        <div className={styles.classStamp} aria-hidden="true">
          UNCLASSIFIED // FOR OFFICIAL USE ONLY
        </div>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>INTELLIGENCE PLATFORM</div>
          <h1 className={`${styles.heroTitle} ${glitchActive ? styles.glitch : ''}`}
              data-text="ILA OSINT">
            ILA OSINT
          </h1>
          <div className={styles.heroDivider}>
            <span className={styles.dividerLine} />
            <span className={styles.dividerIcon}>◆</span>
            <span className={styles.dividerLine} />
          </div>
          <p className={styles.heroTagline}>Reality&nbsp;→&nbsp;Intelligence&nbsp;→&nbsp;Action</p>
          <p className={styles.heroDesc}>
            Transforming fragmented information into actionable intelligence.
          </p>
          <div className={styles.heroStats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.statItem}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
              </div>
            ))}
          </div>
          <button className={styles.accessBtn} onClick={onOpenLogin}>
            <span>REQUEST ACCESS</span>
            <span className={styles.accessArrow}>→</span>
          </button>
        </div>
      </main>

      <div className={styles.ticker} aria-hidden="true">
        <div className={styles.tickerTrack}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={styles.tickerText}>{MARQUEE_TEXT}</span>
          ))}
        </div>
      </div>

      <footer className={styles.bottomBar}>
        <span className={styles.footerLeft}>ILA INTELLIGENCE PLATFORM v3.1.0</span>
        <span className={styles.footerRight}>
          AUTHORIZED PERSONNEL ONLY &nbsp;·&nbsp; MONITORED ENVIRONMENT
        </span>
      </footer>

      <LoginCard
        isOpen={isLoginOpen}
        onClose={onCloseLogin}
        onSuccess={onLoginSuccess}
      />
    </div>
  );
};

export default LoginPage;