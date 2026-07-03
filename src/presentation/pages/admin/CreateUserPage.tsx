// src/presentation/pages/admin/CreateUserPage.tsx
// ILA OSINT — Create / Onboard New Operator
// Admin form: identity, security config, role & access level assignment.
// Carbon Design System + Framer Motion + strict TypeScript.

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Form,
  TextInput,
  PasswordInput,
  Select,
  SelectItem,
  Toggle,
  Button,
  InlineNotification,
  Breadcrumb,
  BreadcrumbItem,
} from '@carbon/react';
import {
  UserFollow,
  Security,
  UserRole,
  CheckmarkFilled,
  WarningFilled,
  Save,
  TrashCan,
  UserAdmin,
  View,
  Screen,
} from '@carbon/icons-react';

import styles from './CreateUserPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type Role        = 'ADMIN' | 'ANALYST' | 'VIEWER';
type AccessLevel = 'STANDARD' | 'ELEVATED' | 'RESTRICTED';

interface FormFields {
  username:    string;
  orgId:       string;
  fullName:    string;
  email:       string;
  department:  string;
  password:    string;
  confirmPass: string;
}

interface FormErrors {
  username?:    string;
  orgId?:       string;
  fullName?:    string;
  email?:       string;
  department?:  string;
  password?:    string;
  confirmPass?: string;
}

interface SecurityToggles {
  forceReset:     boolean;
  mfa:            boolean;
  ipBinding:      boolean;
  accountExpiry:  boolean;
}

// ─────────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────────

const fadeSlideUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: 14 },
};

const cardVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0  },
};

const toastVariants = {
  initial: { opacity: 0, y: -16, scale: 0.96 },
  animate: { opacity: 1, y: 0,   scale: 1    },
  exit:    { opacity: 0, y: -16, scale: 0.96 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

// ─────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(gov\.in|nic\.in|mil\.in|gov|mil)$/;

function validateForm(fields: FormFields): FormErrors {
  const errors: FormErrors = {};

  if (!fields.username.trim())
    errors.username = 'BADGE ID IS REQUIRED';
  else if (!/^[A-Z0-9._-]{3,32}$/.test(fields.username.toUpperCase()))
    errors.username = 'ALPHANUMERIC, DOT, HYPHEN ONLY — 3–32 CHARS';

  if (!fields.orgId.trim())
    errors.orgId = 'ORGANIZATION ID IS REQUIRED';

  if (!fields.fullName.trim())
    errors.fullName = 'FULL NAME IS REQUIRED';
  else if (fields.fullName.trim().length < 3)
    errors.fullName = 'MINIMUM 3 CHARACTERS';

  if (!fields.email.trim())
    errors.email = 'OFFICIAL EMAIL IS REQUIRED';
  else if (!EMAIL_REGEX.test(fields.email.trim()))
    errors.email = 'INVALID FORMAT — VERIFIED .GOV.IN DOMAIN REQUIRED';

  if (!fields.department)
    errors.department = 'DEPARTMENT IS REQUIRED';

  if (!fields.password)
    errors.password = 'TEMPORARY PASSWORD IS REQUIRED';
  else if (fields.password.length < 8)
    errors.password = 'MINIMUM 8 CHARACTERS';
  else if (!/[A-Z]/.test(fields.password))
    errors.password = 'MUST CONTAIN UPPERCASE LETTER';
  else if (!/[0-9]/.test(fields.password))
    errors.password = 'MUST CONTAIN NUMERIC DIGIT';
  else if (!/[@$!%*#?&^]/.test(fields.password))
    errors.password = 'MUST CONTAIN SPECIAL CHARACTER (@$!%*#?&^)';

  if (!fields.confirmPass)
    errors.confirmPass = 'PLEASE CONFIRM PASSWORD';
  else if (fields.password !== fields.confirmPass)
    errors.confirmPass = 'PASSWORDS DO NOT MATCH';

  return errors;
}

// ─────────────────────────────────────────────────────────────────
// Role card config
// ─────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Array<{
  key:   Role;
  label: string;
  desc:  string;
  Icon:  React.FC<{ size: number }>;
}> = [
  { key: 'ADMIN',   label: 'ADMIN',   desc: 'Full platform control',  Icon: UserAdmin   },
  { key: 'ANALYST', label: 'ANALYST', desc: 'Investigate & report',   Icon: View        },
  { key: 'VIEWER',  label: 'VIEWER',  desc: 'Read-only access',       Icon: Screen      },
];

const DEPARTMENTS = [
  'Intelligence Bureau — Cyber Wing',
  'Intelligence Bureau — Counter-Terror',
  'Research & Analysis Wing',
  'National Security Council Secretariat',
  'Narcotics Control Bureau',
  'Directorate of Revenue Intelligence',
  'Central Industrial Security Force — Intel',
  'Defence Intelligence Agency',
  'Military Intelligence — Technical',
  'National Technical Research Organisation',
];

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

// Card section wrapper with icon header
interface SectionCardProps {
  icon:    React.ReactNode;
  title:   string;
  full?:   boolean;
  delay?:  number;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon, title, full = false, delay = 0, children,
}) => (
  <motion.div
    className={`${styles.card} ${full ? styles.cardFull : ''}`}
    variants={cardVariants}
    initial="initial"
    animate="animate"
    transition={{ duration: 0.24, ease: 'easeOut', delay }}
  >
    <div className={styles.cardHeader}>
      <span className={styles.cardIcon}>{icon}</span>
      <span className={styles.cardTitle}>{title}</span>
    </div>
    {children}
  </motion.div>
);

// Field wrapper with stagger
const AnimatedField: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div variants={fadeSlideUp} transition={{ duration: 0.18, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

// Toggle row
interface SecurityToggleRowProps {
  label:    string;
  desc:     string;
  checked:  boolean;
  id:       string;
  onChange: (checked: boolean) => void;
}

const SecurityToggleRow: React.FC<SecurityToggleRowProps> = ({
  label, desc, checked, id, onChange,
}) => (
  <div className={styles.toggleRow}>
    <div className={styles.toggleInfo}>
      <span className={styles.toggleLabel}>{label}</span>
      <span className={styles.toggleDesc}>{desc}</span>
    </div>
    <Toggle
      id={id}
      size="sm"
      toggled={checked}
      onToggle={onChange}
      labelText=""
      labelA=""
      labelB=""
      className={styles.toggle}
    />
  </div>
);

// Toast notification
interface ToastProps {
  message:  string;
  sub:      string;
  onClose:  () => void;
}

const Toast: React.FC<ToastProps> = ({ message, sub, onClose }) => (
  <motion.div
    className={styles.toast}
    variants={toastVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    transition={{ duration: 0.22, ease: 'easeOut' }}
  >
    <CheckmarkFilled size={18} className={styles.toastIcon} />
    <div className={styles.toastBody}>
      <p className={styles.toastTitle}>{message}</p>
      <p className={styles.toastSub}>{sub}</p>
    </div>
    <button className={styles.toastClose} onClick={onClose} aria-label="Close notification">
      ×
    </button>
  </motion.div>
);

// ─────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────

const CreateUserPage: React.FC = () => {
  // ── Form state ────────────────────────────────────────────────
  const [fields, setFields] = useState<FormFields>({
    username:    '',
    orgId:       '',
    fullName:    '',
    email:       '',
    department:  '',
    password:    '',
    confirmPass: '',
  });

  const [errors,      setErrors]      = useState<FormErrors>({});
  const [touched,     setTouched]     = useState<Partial<Record<keyof FormFields, boolean>>>({});
  const [role,        setRole]        = useState<Role>('ANALYST');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('STANDARD');
  const [security,    setSecurity]    = useState<SecurityToggles>({
    forceReset:    true,
    mfa:           true,
    ipBinding:     false,
    accountExpiry: true,
  });

  // ── UI state ──────────────────────────────────────────────────
  const [submitting,  setSubmitting]  = useState(false);
  const [showToast,   setShowToast]   = useState(false);
  const [toastMsg,    setToastMsg]    = useState('');
  const [toastSub,    setToastSub]    = useState('');
  const [formError,   setFormError]   = useState<string | null>(null);

  // ── Field helpers ─────────────────────────────────────────────
  const setField = useCallback(<K extends keyof FormFields>(
    key: K, value: FormFields[K]
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  const touchField = useCallback((key: keyof FormFields) => {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }, []);

  // ── Live validation (only on touched fields) ──────────────────
  useEffect(() => {
    const newErrors = validateForm(fields);
    // Only show errors for touched fields
    const filteredErrors: FormErrors = {};
    (Object.keys(newErrors) as (keyof FormErrors)[]).forEach((k) => {
      if (touched[k]) (filteredErrors as Record<string, string>)[k] = newErrors[k] as string;
    });
    setErrors(filteredErrors);
  }, [fields, touched]);

  // ── Toggle security setting ───────────────────────────────────
  const toggleSecurity = useCallback((key: keyof SecurityToggles) => (checked: boolean) => {
    setSecurity((prev) => ({ ...prev, [key]: checked }));
  }, []);

  // ── Discard / reset form ──────────────────────────────────────
  const handleDiscard = useCallback(() => {
    setFields({ username: '', orgId: '', fullName: '', email: '', department: '', password: '', confirmPass: '' });
    setErrors({});
    setTouched({});
    setRole('ANALYST');
    setAccessLevel('STANDARD');
    setSecurity({ forceReset: true, mfa: true, ipBinding: false, accountExpiry: true });
    setFormError(null);
  }, []);

  // ── Save draft ────────────────────────────────────────────────
  const handleSaveDraft = useCallback(() => {
    setToastMsg('DRAFT SAVED');
    setToastSub(`${fields.username || 'New operator'} — draft stored locally`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  }, [fields.username]);

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // Touch all fields to show all errors
    const allTouched: Partial<Record<keyof FormFields, boolean>> = {};
    (Object.keys(fields) as (keyof FormFields)[]).forEach((k) => { allTouched[k] = true; });
    setTouched(allTouched);

    const allErrors = validateForm(fields);
    setErrors(allErrors);

    if (Object.keys(allErrors).length > 0) {
      setFormError('VALIDATION ERRORS — Please correct the highlighted fields before proceeding.');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    // Simulate API call
    await new Promise((r) => setTimeout(r, 1100));

    setSubmitting(false);
    setToastMsg('USER CREATED SUCCESSFULLY');
    setToastSub(`${fields.email} — ${role} access provisioned`);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);

    // Reset form after success
    handleDiscard();
  }, [fields, role, handleDiscard]);

  // ── Keyboard shortcut: Ctrl+Enter to submit ───────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSubmit]);

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Toast ── */}
      <div className={styles.toastAnchor}>
        <AnimatePresence>
          {showToast && (
            <Toast
              message={toastMsg}
              sub={toastSub}
              onClose={() => setShowToast(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Page header ── */}
      <motion.div
        className={styles.pageHeader}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <Breadcrumb noTrailingSlash className={styles.breadcrumb}>
          <BreadcrumbItem>ADMINISTRATION</BreadcrumbItem>
          <BreadcrumbItem>USER MANAGEMENT</BreadcrumbItem>
          <BreadcrumbItem isCurrentPage>CREATE USER</BreadcrumbItem>
        </Breadcrumb>

        <h1 className={styles.pageTitle}>ONBOARD NEW OPERATOR</h1>
        <p className={styles.pageSubtitle}>
          Provision a credentialed account. Assign role, clearance level, and security policy.
          All actions are audit-logged.
        </p>
      </motion.div>

      {/* ── Inline error notification ── */}
      <AnimatePresence>
        {formError && (
          <motion.div
            variants={fadeSlideUp}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18 }}
            className={styles.inlineNotif}
          >
            <InlineNotification
              kind="error"
              title="SUBMISSION BLOCKED — "
              subtitle={formError}
              onClose={() => setFormError(null)}
              lowContrast
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Carbon Form (no HTML <form>) ── */}
      <Form aria-label="Create user form" className={styles.form}>

        <motion.div
          className={styles.formGrid}
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >

          {/* ════════════════════════════════════════════════════
              LEFT CARD — User Identity
          ════════════════════════════════════════════════════ */}
          <SectionCard
            icon={<UserFollow size={16} />}
            title="USER IDENTITY"
            delay={0}
          >
            <motion.div variants={staggerContainer} initial="initial" animate="animate">

              {/* Username + Org ID row */}
              <div className={styles.fieldRow}>
                <AnimatedField>
                  <TextInput
                    id="username"
                    labelText="USERNAME / BADGE ID"
                    placeholder="e.g. ARJUN.MEHTA"
                    value={fields.username}
                    onChange={(e) => setField('username', e.target.value.toUpperCase())}
                    onBlur={() => touchField('username')}
                    invalid={!!errors.username}
                    invalidText={errors.username}
                    className={styles.field}
                    autoComplete="off"
                    autoFocus
                  />
                  {/* Valid checkmark */}
                  {!errors.username && touched.username && fields.username && (
                    <span className={styles.validIcon}>
                      <CheckmarkFilled size={14} />
                    </span>
                  )}
                </AnimatedField>

                <AnimatedField>
                  <TextInput
                    id="orgId"
                    labelText="ORGANIZATION ID"
                    placeholder="e.g. IB-DEL-019"
                    value={fields.orgId}
                    onChange={(e) => setField('orgId', e.target.value.toUpperCase())}
                    onBlur={() => touchField('orgId')}
                    invalid={!!errors.orgId}
                    invalidText={errors.orgId}
                    className={styles.field}
                    autoComplete="off"
                  />
                </AnimatedField>
              </div>

              {/* Full Name */}
              <AnimatedField>
                <TextInput
                  id="fullName"
                  labelText="FULL NAME"
                  placeholder="e.g. Arjun Mehta"
                  value={fields.fullName}
                  onChange={(e) => setField('fullName', e.target.value)}
                  onBlur={() => touchField('fullName')}
                  invalid={!!errors.fullName}
                  invalidText={errors.fullName}
                  className={styles.field}
                  autoComplete="off"
                />
              </AnimatedField>

              {/* Official Email */}
              <AnimatedField>
                <div className={styles.fieldWrap}>
                  <TextInput
                    id="email"
                    labelText="OFFICIAL EMAIL"
                    placeholder="e.g. arjun.mehta@ib.gov.in"
                    type="email"
                    value={fields.email}
                    onChange={(e) => setField('email', e.target.value.toLowerCase())}
                    onBlur={() => touchField('email')}
                    invalid={!!errors.email}
                    invalidText={errors.email}
                    className={styles.field}
                    autoComplete="off"
                  />
                  {errors.email && (
                    <span className={styles.errorIcon}>
                      <WarningFilled size={14} />
                    </span>
                  )}
                  {!errors.email && touched.email && fields.email && (
                    <span className={styles.validIcon}>
                      <CheckmarkFilled size={14} />
                    </span>
                  )}
                </div>
              </AnimatedField>

              {/* Department */}
              <AnimatedField>
                <Select
                  id="department"
                  labelText="DEPARTMENT / UNIT"
                  value={fields.department}
                  onChange={(e) => setField('department', e.target.value)}
                  onBlur={() => touchField('department')}
                  invalid={!!errors.department}
                  invalidText={errors.department}
                  className={styles.field}
                >
                  <SelectItem value="" text="— SELECT DEPARTMENT —" />
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d} text={d} />
                  ))}
                </Select>
              </AnimatedField>

            </motion.div>
          </SectionCard>

          {/* ════════════════════════════════════════════════════
              RIGHT CARD — Security Configuration
          ════════════════════════════════════════════════════ */}
          <SectionCard
            icon={<Security size={16} />}
            title="SECURITY CONFIGURATION"
            delay={0.07}
          >
            <motion.div variants={staggerContainer} initial="initial" animate="animate">

              {/* Temporary password */}
              <AnimatedField>
                <div className={styles.fieldWrap}>
                  <PasswordInput
                    id="password"
                    labelText="TEMPORARY PASSWORD"
                    placeholder="Min 8 chars — uppercase + digit + special"
                    value={fields.password}
                    onChange={(e) => setField('password', e.target.value)}
                    onBlur={() => touchField('password')}
                    invalid={!!errors.password}
                    invalidText={errors.password}
                    className={styles.field}
                    autoComplete="new-password"
                    hidePasswordLabel="Hide password"
                    showPasswordLabel="Show password"
                  />
                </div>
              </AnimatedField>

              {/* Confirm password */}
              <AnimatedField>
                <div className={styles.fieldWrap}>
                  <PasswordInput
                    id="confirmPass"
                    labelText="CONFIRM PASSWORD"
                    placeholder="Re-enter password"
                    value={fields.confirmPass}
                    onChange={(e) => setField('confirmPass', e.target.value)}
                    onBlur={() => touchField('confirmPass')}
                    invalid={!!errors.confirmPass}
                    invalidText={errors.confirmPass}
                    className={styles.field}
                    autoComplete="new-password"
                    hidePasswordLabel="Hide password"
                    showPasswordLabel="Show password"
                  />
                  {!errors.confirmPass && touched.confirmPass && fields.confirmPass && fields.password === fields.confirmPass && (
                    <span className={styles.validIcon}>
                      <CheckmarkFilled size={14} />
                    </span>
                  )}
                </div>
              </AnimatedField>

              <div className={styles.divider} />

              {/* Security toggles */}
              <AnimatedField>
                <SecurityToggleRow
                  id="toggle-reset"
                  label="Force Password Reset on First Login"
                  desc="Mandatory before system access"
                  checked={security.forceReset}
                  onChange={toggleSecurity('forceReset')}
                />
              </AnimatedField>

              <AnimatedField>
                <SecurityToggleRow
                  id="toggle-mfa"
                  label="Enable Multi-Factor Authentication"
                  desc="TOTP or hardware key required per session"
                  checked={security.mfa}
                  onChange={toggleSecurity('mfa')}
                />
              </AnimatedField>

              <AnimatedField>
                <SecurityToggleRow
                  id="toggle-ip"
                  label="Session IP Binding"
                  desc="Lock session to originating network"
                  checked={security.ipBinding}
                  onChange={toggleSecurity('ipBinding')}
                />
              </AnimatedField>

              <AnimatedField>
                <SecurityToggleRow
                  id="toggle-expiry"
                  label="Account Expiry Enforcement"
                  desc="Auto-disable after 90 days inactivity"
                  checked={security.accountExpiry}
                  onChange={toggleSecurity('accountExpiry')}
                />
              </AnimatedField>

            </motion.div>
          </SectionCard>

          {/* ════════════════════════════════════════════════════
              FULL WIDTH CARD — Role & Access Level
          ════════════════════════════════════════════════════ */}
          <SectionCard
            icon={<UserRole size={16} />}
            title="ROLE & ACCESS LEVEL ASSIGNMENT"
            full
            delay={0.14}
          >
            <motion.div variants={staggerContainer} initial="initial" animate="animate">

              {/* Role picker */}
              <AnimatedField>
                <p className={styles.subLabel}>OPERATIONAL ROLE</p>
                <div className={styles.roleGrid}>
                  {ROLE_CONFIG.map(({ key, label, desc, Icon }) => (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.roleCard} ${role === key ? styles.roleCardActive : ''}`}
                      onClick={() => setRole(key)}
                      aria-pressed={role === key}
                    >
                      <span className={styles.roleIcon}>
                        <Icon size={22} />
                      </span>
                      <span className={styles.roleName}>{label}</span>
                      <span className={styles.roleDesc}>{desc}</span>
                    </button>
                  ))}
                </div>
              </AnimatedField>

              {/* Access level picker */}
              <AnimatedField>
                <p className={styles.subLabel}>CLEARANCE / ACCESS LEVEL</p>
                <div className={styles.accessRow}>
                  {(['STANDARD', 'ELEVATED', 'RESTRICTED'] as AccessLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`${styles.accessBtn} ${accessLevel === level ? styles[`access${level.charAt(0) + level.slice(1).toLowerCase()}` as keyof typeof styles] : ''}`}
                      onClick={() => setAccessLevel(level)}
                      aria-pressed={accessLevel === level}
                    >
                      {level}
                    </button>
                  ))}
                </div>

                {/* Access level description */}
                <div className={styles.accessDesc}>
                  {accessLevel === 'STANDARD'  && <span>Standard analyst access. Read and create reports. Cannot modify system settings.</span>}
                  {accessLevel === 'ELEVATED'  && <span className={styles.accessDescWarn}>Elevated clearance. Access to classified case material and inter-agency data. Requires supervisor authorization.</span>}
                  {accessLevel === 'RESTRICTED' && <span className={styles.accessDescDanger}>Restricted read-only access. Cannot initiate investigations or export data. Monitoring account.</span>}
                </div>
              </AnimatedField>

            </motion.div>
          </SectionCard>

        </motion.div>

        {/* ════════════════════════════════════════════════════
            Action Bar
        ════════════════════════════════════════════════════ */}
        <motion.div
          className={styles.actionBar}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.28, ease: 'easeOut' }}
        >
          <div className={styles.actionLeft}>
            <span className={styles.auditNote}>
              All user creation events are logged to the immutable audit trail.
            </span>
          </div>

          <div className={styles.actionRight}>
            <Button
              kind="ghost"
              renderIcon={TrashCan}
              onClick={handleDiscard}
              className={styles.actionBtn}
            >
              DISCARD
            </Button>
            <Button
              kind="secondary"
              renderIcon={Save}
              onClick={handleSaveDraft}
              className={styles.actionBtn}
            >
              SAVE DRAFT
            </Button>
            <Button
              kind="primary"
              renderIcon={UserFollow}
              onClick={handleSubmit}
              disabled={submitting}
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            >
              {submitting ? 'PROVISIONING…' : 'CREATE USER →'}
            </Button>
          </div>
        </motion.div>

      </Form>
    </div>
  );
};

export default CreateUserPage;