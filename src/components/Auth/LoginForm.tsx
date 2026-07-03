// src/components/LoginForm.tsx
import React, { useState, useId } from 'react';
import styles from './LoginForm.module.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoginData {
  username: string;
  password: string;
  organization: string;
}

interface Props {
  onLogin: (data: LoginData) => void;
}

interface FieldError {
  username?: string;
  password?: string;
  organization?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(data: LoginData): FieldError {
  const errors: FieldError = {};

  if (!data.username.trim()) {
    errors.username = 'Username is required.';
  } else if (data.username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters.';
  }

  if (!data.password) {
    errors.password = 'Password is required.';
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  if (!data.organization.trim()) {
    errors.organization = 'Organization name is required.';
  }

  return errors;
}

// ─── Field Component ──────────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  error?: string;
  autoComplete?: string;
  onChange: (val: string) => void;
}

const Field: React.FC<FieldProps> = ({
  id, label, type = 'text', value, error, autoComplete, onChange,
}) => (
  <div className={`${styles.fieldGroup} ${error ? styles.hasError : ''}`}>
    <label htmlFor={id} className={styles.label}>
      {label}
    </label>
    <div className={styles.inputWrapper}>
      <span className={styles.cursor} aria-hidden="true">▸</span>
      <input
        id={id}
        type={type}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        spellCheck={false}
        autoCapitalize="off"
      />
    </div>
    {error && (
      <span id={`${id}-error`} className={styles.errorMsg} role="alert">
        <span aria-hidden="true">⚠ </span>{error}
      </span>
    )}
  </div>
);

// ─── LoginForm ────────────────────────────────────────────────────────────────

const LoginForm: React.FC<Props> = ({ onLogin }) => {
  const [form, setForm] = useState<LoginData>({
    username: '',
    password: '',
    organization: '',
  });
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const uid = useId();
  const ids = {
    username: `${uid}-username`,
    password: `${uid}-password`,
    organization: `${uid}-organization`,
  };

  const set = (field: keyof LoginData) => (val: string) => {
    setForm((p) => ({ ...p, [field]: val }));
    // Clear field error on change
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitError('');
    setLoading(true);
    try {
      // Simulate network latency — replace with real API call
      await new Promise((r) => setTimeout(r, 1000));
      onLogin(form);
    } catch {
      setSubmitError('Authentication service unavailable. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Analyst credential login"
    >
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>Analyst Authentication</h2>
        <p className={styles.formSub}>Enter your credentials to proceed.</p>
      </div>

      {submitError && (
        <div className={styles.submitError} role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠</span> {submitError}
        </div>
      )}

      <Field
        id={ids.username}
        label="Username / Badge ID"
        value={form.username}
        error={errors.username}
        autoComplete="username"
        onChange={set('username')}
      />

      <Field
        id={ids.password}
        label="Password"
        type="password"
        value={form.password}
        error={errors.password}
        autoComplete="current-password"
        onChange={set('password')}
      />

      <Field
        id={ids.organization}
        label="Organization Name"
        value={form.organization}
        error={errors.organization}
        autoComplete="organization"
        onChange={set('organization')}
      />

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Verifying credentials…
          </>
        ) : (
          'Authenticate  →'
        )}
      </button>
    </form>
  );
};

export default LoginForm;