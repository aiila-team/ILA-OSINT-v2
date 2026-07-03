// src/components/MfaForm.tsx
import React, { useState, useRef, useEffect, useId } from 'react';
import styles from './MfaForm.module.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  onVerify: (code: string) => void;
  onBack?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_LENGTH = 6;

// ─── MfaForm ──────────────────────────────────────────────────────────────────

const MfaForm: React.FC<Props> = ({ onVerify, onBack }) => {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const errorId = useId();

  const code = digits.join('');
  const isComplete = code.length === OTP_LENGTH && digits.every(Boolean);

  // Auto-focus first digit on mount
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const handleChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (error) setError('');
    // Advance focus
    if (digit && idx < OTP_LENGTH - 1) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        // Clear current
        setDigits((prev) => { const n = [...prev]; n[idx] = ''; return n; });
      } else if (idx > 0) {
        // Move back and clear previous
        refs.current[idx - 1]?.focus();
        setDigits((prev) => { const n = [...prev]; n[idx - 1] = ''; return n; });
      }
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((c, i) => { next[i] = c; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    refs.current[focusIdx]?.focus();
    if (error) setError('');
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete) {
      setError('Please enter all 6 digits.');
      triggerShake();
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Simulate verification — replace with real API call
      await new Promise((r) => setTimeout(r, 1000));
      onVerify(code);
    } catch {
      setError('Verification failed. Please try again.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Multi-factor authentication"
    >
      <div className={styles.formHeader}>
        <div className={styles.mfaIcon} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="1" y="1" width="30" height="30" stroke="currentColor" strokeWidth="1.5" rx="0" />
            <path d="M16 8v8l5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
          </svg>
        </div>
        <h2 className={styles.formTitle}>Two-Factor Verification</h2>
        <p className={styles.formSub}>
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={styles.errorBanner}
        >
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      {/* OTP Grid */}
      <div
        className={`${styles.otpRow} ${shake ? styles.shake : ''}`}
        role="group"
        aria-label="One-time password digits"
        aria-describedby={error ? errorId : undefined}
        onPaste={handlePaste}
      >
        {digits.map((d, i) => (
          <React.Fragment key={i}>
            {i === 3 && (
              <span className={styles.separator} aria-hidden="true">–</span>
            )}
            <div className={`${styles.digitWrap} ${d ? styles.filled : ''} ${!d && i === digits.findIndex(x => !x) ? styles.active : ''}`}>
              <input
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="\d"
                maxLength={1}
                className={styles.digitInput}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
              />
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Progress bar */}
      <div className={styles.progress} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${(digits.filter(Boolean).length / OTP_LENGTH) * 100}%` }}
        />
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={loading || !isComplete}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Verifying…
          </>
        ) : (
          'Confirm Identity  →'
        )}
      </button>

      {onBack && (
        <button
          type="button"
          className={styles.backBtn}
          onClick={onBack}
          aria-label="Return to credential login"
        >
          ← Back to login
        </button>
      )}
    </form>
  );
};

export default MfaForm;