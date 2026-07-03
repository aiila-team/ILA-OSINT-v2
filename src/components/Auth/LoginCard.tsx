import React, { useState, useEffect, useRef } from 'react';
import { Button, TextInput, PasswordInput } from '@carbon/react';
import { Security, Close, ArrowRight } from '@carbon/icons-react';
import styles from './LoginCard.module.scss';

interface LoginCardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (username: string, orgId: string) => void;
}

const SESSION_ID = Math.random().toString(36).substring(2, 9).toUpperCase();

const LoginCard: React.FC<LoginCardProps> = ({ isOpen, onClose, onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [orgId, setOrgId] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle mount animation
  useEffect(() => {
    if (isOpen) {
      // small delay so CSS transition fires
      const t = setTimeout(() => setMounted(true), 10);
      return () => clearTimeout(t);
    } else {
      setMounted(false);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };
  const handleAuthenticate = () => {
  if (!username || !password || !orgId) {
    setAuthError('All fields are required.');
    return;
  }

  setIsAuthenticating(true);
  setAuthError('');

  setTimeout(() => {
    // Hardcoded check — change these to whatever you want
    if (username === 'admin' && password === 'ILA@2024' && orgId === 'ORG-00001') {
      setAuthError('');
      alert('✅ Access Granted. Welcome, Admin.');
      onSuccess?.(username, orgId);
    } else {
      setAuthError('Access denied. Invalid credentials.');
    }
    setIsAuthenticating(false);
  }, 1000);
};
  if (!isOpen) return null;

  const utcNow = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z';

  return (
    <div
      className={`${styles.backdrop} ${mounted ? styles.backdropVisible : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Analyst Authentication"
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${mounted ? styles.cardVisible : ''}`}
      >
        {/* Header strip */}
        <div className={styles.headerStrip}>
          <div className={styles.logoBlock}>
            <div className={styles.logoIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect x="1" y="1" width="26" height="26" rx="2" stroke="#00a3c7" strokeWidth="1.5" />
                <circle cx="14" cy="14" r="4" stroke="#00a3c7" strokeWidth="1.5" />
                <line x1="14" y1="4" x2="14" y2="9" stroke="#00a3c7" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="14" y1="19" x2="14" y2="24" stroke="#00a3c7" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="4" y1="14" x2="9" y2="14" stroke="#00a3c7" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="19" y1="14" x2="24" y2="14" stroke="#00a3c7" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className={styles.logoText}>
              <span className={styles.platformName}>ILA OSINT</span>
              <span className={styles.platformSub}>Intelligence &amp; Link Analysis</span>
            </div>
          </div>

          <div className={styles.headerMeta}>
            <span className={styles.restricted}>RESTRICTED</span>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
              <Close size={16} />
            </button>
          </div>
        </div>

        {/* Session bar */}
        <div className={styles.sessionBar}>
          <span><span className={styles.dimLabel}>SESSION</span> {SESSION_ID}</span>
          <span><span className={styles.dimLabel}>UTC</span> {utcNow}</span>
          <span><span className={styles.dimLabel}>STEP</span> 1 / 2</span>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <h2 className={styles.title}>Admin Authentication</h2>
          <p className={styles.subtitle}>Enter your credentials to access the platform.</p>

          <div className={styles.fields}>
            <div className={styles.fieldWrap}>
              <TextInput
                id="ila-username"
                labelText="USERNAME / BADGE ID"
                placeholder="Admin.id or badge number"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={styles.carbonInput}
              />
            </div>

            <div className={styles.fieldWrap}>
              <PasswordInput
                id="ila-password"
                labelText="PASSWORD"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.carbonInput}
              />
            </div>

            <div className={styles.fieldWrap}>
              <TextInput
                id="ila-org"
                labelText="ORGANIZATION ID"
                placeholder="ORG-XXXXX"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className={styles.carbonInput}
              />
            </div>
          </div>
          {authError && (
  <div style={{
    background: 'rgba(250, 77, 86, 0.08)',
    border: '1px solid rgba(250, 77, 86, 0.4)',
    color: '#fa4d56',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '11px',
    padding: '10px 14px',
    marginBottom: '16px',
    letterSpacing: '0.04em'
  }}>
    ⚠ {authError}
  </div>
)}
          <Button
            className={styles.authButton}
            renderIcon={ArrowRight}
            onClick={handleAuthenticate}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? 'Authenticating...' : 'Authenticate'}
          </Button>
        </div>

        {/* Security notice */}
        <div className={styles.securityNotice}>
          <Security size={14} className={styles.securityIcon} />
          <div className={styles.securityText}>
            <strong>Authorized use only.</strong>
            {' '}This system is monitored continuously. Unauthorized access attempts
            are logged and reported in accordance with applicable law.
            By proceeding, you consent to these terms.
          </div>
        </div>

        {/* Scan line animation */}
        <div className={styles.scanLine} aria-hidden="true" />

        {/* Corner accents */}
        <span className={`${styles.corner} ${styles.cornerTL}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerTR}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBL}`} aria-hidden="true" />
        <span className={`${styles.corner} ${styles.cornerBR}`} aria-hidden="true" />
      </div>
    </div>
  );
};

export default LoginCard;