// src/components/admin/SettingsDrawer/SettingsDrawer.tsx
// ILA OSINT — Settings Drawer
// Right-side panel with left nav (8 sections) + dynamic content area + sticky save footer.

import React, { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Button,
  Toggle,
  Select,
  SelectItem,
  NumberInput,
  TextInput,
  Tag,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';
import {
  Close,
  UserAvatar,
  Locked,
  DocumentSecurity,
  Activity,
  Export,
  Notification,
  ColorPalette,
  Connect,
  Renew,
  Save,
} from '@carbon/icons-react';
import { fadeIn, drawerSlideIn, drawerSlideInTransition } from '../../../../styles/motion';
import styles from './SettingsDrawer.module.scss';

// ── Section keys ──────────────────────────────────────────────────

type SectionKey =
  | 'profile'
  | 'security'
  | 'policies'
  | 'monitoring'
  | 'export'
  | 'notifications'
  | 'preferences'
  | 'integrations';

interface NavItem {
  key:   SectionKey;
  label: string;
  icon:  React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'profile',       label: 'Profile & Session',      icon: <UserAvatar size={16} /> },
  { key: 'security',      label: 'Security Controls',      icon: <Locked size={16} /> },
  { key: 'policies',      label: 'Policies & Compliance',  icon: <DocumentSecurity size={16} /> },
  { key: 'monitoring',    label: 'Monitoring',             icon: <Activity size={16} /> },
  { key: 'export',        label: 'Data & Export',          icon: <Export size={16} /> },
  { key: 'notifications', label: 'Notifications',          icon: <Notification size={16} /> },
  { key: 'preferences',   label: 'Preferences',            icon: <ColorPalette size={16} /> },
  { key: 'integrations',  label: 'Integrations',           icon: <Connect size={16} /> },
];

// ── Settings state shape ──────────────────────────────────────────

interface SettingsState {
  // Profile & Session
  mfaEnabled: boolean;

  // Security Controls
  mfaRequireAll:   boolean;
  mfaRequireAdmin: boolean;
  mfaMethod:       string;
  sessionTimeout:  number;
  maxSessions:     number;
  forceReauth:     boolean;

  // Policies & Compliance
  retentionDays: number;

  // Monitoring
  alertThreshold: number;
  loggingLevel:   string;
  auditLogging:   boolean;

  // Data & Export
  exportPdf:       boolean;
  exportCsv:       boolean;
  exportJson:      boolean;
  exportWatermark: boolean;

  // Notifications
  emailAlerts:    boolean;
  inAppAlerts:    boolean;
  criticalOnly:   boolean;

  // Preferences
  theme:   string;
  density: string;
}

const DEFAULT_SETTINGS: SettingsState = {
  mfaEnabled: true,

  mfaRequireAll:   false,
  mfaRequireAdmin: true,
  mfaMethod:       'TOTP',
  sessionTimeout:  30,
  maxSessions:     3,
  forceReauth:     true,

  retentionDays: 90,

  alertThreshold: 75,
  loggingLevel:   'medium',
  auditLogging:   true,

  exportPdf:       true,
  exportCsv:       true,
  exportJson:      false,
  exportWatermark: true,

  emailAlerts:  true,
  inAppAlerts:  true,
  criticalOnly: false,

  theme:   'dark',
  density: 'comfortable',
};

// ── Mock data ─────────────────────────────────────────────────────

interface AccessRule {
  id:     string;
  range:  string;
  status: 'ACTIVE' | 'BLOCKED';
}

const ACCESS_RULES: AccessRule[] = [
  { id: '1', range: '10.20.0.0/16',     status: 'ACTIVE'  },
  { id: '2', range: '192.168.4.0/24',   status: 'ACTIVE'  },
  { id: '3', range: '203.0.113.40/32',  status: 'BLOCKED' },
];

interface SessionItem {
  id:       string;
  device:   string;
  location: string;
  lastSeen: string;
  current:  boolean;
}

const ACTIVE_SESSIONS: SessionItem[] = [
  { id: '1', device: 'Chrome · Windows', location: 'Hyderabad, IN', lastSeen: 'Active now',   current: true  },
  { id: '2', device: 'Firefox · Linux',  location: 'Mumbai, IN',    lastSeen: '2h ago',       current: false },
  { id: '3', device: 'Mobile App · iOS', location: 'Hyderabad, IN', lastSeen: '1d ago',       current: false },
];

// ── Helpers ───────────────────────────────────────────────────────

function settingsEqual(a: SettingsState, b: SettingsState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Section: Field row wrapper ────────────────────────────────────

const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className={styles.fieldGroup}>
    <div className={styles.fieldGroupTitle}>{title}</div>
    <div className={styles.fieldGroupBody}>{children}</div>
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  desc?: string;
  id: string;
  toggled: boolean;
  onToggle: () => void;
}> = ({ label, desc, id, toggled, onToggle }) => (
  <div className={styles.toggleRow}>
    <div className={styles.toggleRowText}>
      <span className={styles.toggleRowLabel}>{label}</span>
      {desc && <span className={styles.toggleRowDesc}>{desc}</span>}
    </div>
    <Toggle
      id={id}
      size="sm"
      toggled={toggled}
      onToggle={onToggle}
      hideLabel
      labelText={label}
      className={styles.toggle}
    />
  </div>
);

// ── Props ─────────────────────────────────────────────────────────

interface SettingsDrawerProps {
  isOpen:  boolean;
  onClose: () => void;
  username?: string;
  email?:    string;
  role?:     string;
  onLogout?: () => void;
}

// ── Component ────────────────────────────────────────────────────

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  username = 'admin',
  email = 'admin@ila-osint.local',
  role = 'SUPER ADMIN',
  onLogout,
}) => {
  const [activeSection, setActiveSection] = useState<SectionKey>('security');
  const [settings, setSettings]   = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saved, setSaved]         = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saving, setSaving]       = useState(false);

  const isDirty = useMemo(() => !settingsEqual(settings, saved), [settings, saved]);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleToggle = useCallback((key: keyof SettingsState) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    setTimeout(() => {
      setSaved(settings);
      setSaving(false);
    }, 600);
  }, [settings]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ── Render section content ──────────────────────────────────────

  const renderSection = () => {
    switch (activeSection) {
      // ── 1. Profile & Session ──────────────────────────────────
      case 'profile':
        return (
          <>
            <FieldGroup title="ACCOUNT">
              <div className={styles.profileCard}>
                <div className={styles.profileAvatar}>{username.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className={styles.profileName}>{username}</div>
                  <div className={styles.profileEmail}>{email}</div>
                  <Tag type="cyan" size="sm" className={styles.profileRoleTag}>{role}</Tag>
                </div>
              </div>
              <Button kind="secondary" size="sm" className={styles.inlineBtn}>
                Change Password
              </Button>
            </FieldGroup>

            <FieldGroup title="MULTI-FACTOR AUTHENTICATION">
              <ToggleRow
                id="profile-mfa"
                label="MFA Enabled"
                desc="Require a second factor when signing in"
                toggled={settings.mfaEnabled}
                onToggle={() => handleToggle('mfaEnabled')}
              />
            </FieldGroup>

            <FieldGroup title="ACTIVE SESSIONS">
              <div className={styles.sessionList}>
                {ACTIVE_SESSIONS.map((s) => (
                  <div key={s.id} className={styles.sessionRow}>
                    <div className={styles.sessionInfo}>
                      <div className={styles.sessionDevice}>
                        {s.device}
                        {s.current && <Tag type="green" size="sm" className={styles.currentTag}>THIS DEVICE</Tag>}
                      </div>
                      <div className={styles.sessionMeta}>{s.location} · {s.lastSeen}</div>
                    </div>
                    {!s.current && (
                      <button className={styles.sessionRevoke}>Revoke</button>
                    )}
                  </div>
                ))}
              </div>
            </FieldGroup>
          </>
        );

      // ── 2. Security Controls ──────────────────────────────────
      case 'security':
        return (
          <>
            <FieldGroup title="ACCESS CONTROL">
              <DataTable
                rows={ACCESS_RULES.map((r) => ({ id: r.id, range: r.range, status: r.status }))}
                headers={[
                  { key: 'range',  header: 'IP RANGE' },
                  { key: 'status', header: 'STATUS' },
                ]}
                render={({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
                  <Table {...getTableProps()} size="sm" className={styles.miniTable}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHeader {...getHeaderProps({ header })} key={header.key}>
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const rule = ACCESS_RULES.find((r) => r.id === row.id)!;
                        return (
                          <TableRow {...getRowProps({ row })} key={row.id}>
                            <TableCell className={styles.miniTableCellMono}>{rule.range}</TableCell>
                            <TableCell>
                              <Tag
                                type={rule.status === 'ACTIVE' ? 'green' : 'red'}
                                size="sm"
                              >
                                {rule.status}
                              </Tag>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              />
              <Button kind="secondary" size="sm" className={styles.inlineBtn}>
                Manage Access Control
              </Button>
            </FieldGroup>

            <FieldGroup title="MFA POLICIES">
              <ToggleRow
                id="sec-mfa-all"
                label="Require MFA for all users"
                toggled={settings.mfaRequireAll}
                onToggle={() => handleToggle('mfaRequireAll')}
              />
              <ToggleRow
                id="sec-mfa-admin"
                label="Require MFA for admins only"
                toggled={settings.mfaRequireAdmin}
                onToggle={() => handleToggle('mfaRequireAdmin')}
              />
              <Select
                id="sec-mfa-method"
                size="sm"
                labelText="MFA Method"
                value={settings.mfaMethod}
                onChange={(e) => update('mfaMethod', e.target.value)}
                className={styles.field}
              >
                <SelectItem value="TOTP" text="Authenticator App (TOTP)" />
                <SelectItem value="SMS" text="SMS One-Time Code" />
                <SelectItem value="HARDWARE" text="Hardware Security Key" />
              </Select>
            </FieldGroup>

            <FieldGroup title="SESSION POLICIES">
              <NumberInput
                id="sec-session-timeout"
                size="sm"
                label="Session timeout (minutes)"
                value={settings.sessionTimeout}
                min={5}
                max={240}
                step={5}
                onChange={(_e, { value }) => update('sessionTimeout', Number(value))}
                className={styles.field}
              />
              <NumberInput
                id="sec-max-sessions"
                size="sm"
                label="Max concurrent sessions"
                value={settings.maxSessions}
                min={1}
                max={10}
                step={1}
                onChange={(_e, { value }) => update('maxSessions', Number(value))}
                className={styles.field}
              />
              <ToggleRow
                id="sec-force-reauth"
                label="Force re-authentication"
                desc="For sensitive actions (e.g. export, delete)"
                toggled={settings.forceReauth}
                onToggle={() => handleToggle('forceReauth')}
              />
            </FieldGroup>
          </>
        );

      // ── 3. Policies & Compliance ───────────────────────────────
      case 'policies':
        return (
          <>
            <FieldGroup title="DATA RETENTION">
              <NumberInput
                id="pol-retention"
                size="sm"
                label="Retention period (days)"
                value={settings.retentionDays}
                min={30}
                max={3650}
                step={30}
                onChange={(_e, { value }) => update('retentionDays', Number(value))}
                className={styles.field}
              />
            </FieldGroup>

            <FieldGroup title="CLASSIFICATION LABELS">
              <div className={styles.classRow}>
                <Tag type="green" size="sm">UNCLASSIFIED</Tag>
                <Tag type="blue" size="sm">RESTRICTED</Tag>
                <Tag type="magenta" size="sm">CONFIDENTIAL</Tag>
                <Tag type="red" size="sm">SECRET // NOFORN</Tag>
              </div>
            </FieldGroup>

            <Button kind="secondary" size="sm" className={styles.inlineBtn}>
              Manage Policies
            </Button>
          </>
        );

      // ── 4. Monitoring ──────────────────────────────────────────
      case 'monitoring':
        return (
          <>
            <FieldGroup title="ALERTING">
              <NumberInput
                id="mon-alert-threshold"
                size="sm"
                label="Alert threshold (%)"
                value={settings.alertThreshold}
                min={0}
                max={100}
                step={5}
                onChange={(_e, { value }) => update('alertThreshold', Number(value))}
                className={styles.field}
              />
            </FieldGroup>

            <FieldGroup title="LOGGING">
              <Select
                id="mon-logging-level"
                size="sm"
                labelText="Logging level"
                value={settings.loggingLevel}
                onChange={(e) => update('loggingLevel', e.target.value)}
                className={styles.field}
              >
                <SelectItem value="low" text="Low" />
                <SelectItem value="medium" text="Medium" />
                <SelectItem value="verbose" text="Verbose" />
              </Select>
              <ToggleRow
                id="mon-audit-logging"
                label="Audit logging"
                desc="Record all administrative actions"
                toggled={settings.auditLogging}
                onToggle={() => handleToggle('auditLogging')}
              />
            </FieldGroup>
          </>
        );

      // ── 5. Data & Export ────────────────────────────────────────
      case 'export':
        return (
          <FieldGroup title="EXPORT FORMATS">
            <ToggleRow
              id="exp-pdf"
              label="PDF export"
              toggled={settings.exportPdf}
              onToggle={() => handleToggle('exportPdf')}
            />
            <ToggleRow
              id="exp-csv"
              label="CSV export"
              toggled={settings.exportCsv}
              onToggle={() => handleToggle('exportCsv')}
            />
            <ToggleRow
              id="exp-json"
              label="JSON export"
              toggled={settings.exportJson}
              onToggle={() => handleToggle('exportJson')}
            />
            <ToggleRow
              id="exp-watermark"
              label="Apply watermark"
              desc="Stamp classification + analyst ID on exports"
              toggled={settings.exportWatermark}
              onToggle={() => handleToggle('exportWatermark')}
            />
          </FieldGroup>
        );

      // ── 6. Notifications ────────────────────────────────────────
      case 'notifications':
        return (
          <FieldGroup title="ALERT CHANNELS">
            <ToggleRow
              id="notif-email"
              label="Email alerts"
              toggled={settings.emailAlerts}
              onToggle={() => handleToggle('emailAlerts')}
            />
            <ToggleRow
              id="notif-inapp"
              label="In-app alerts"
              toggled={settings.inAppAlerts}
              onToggle={() => handleToggle('inAppAlerts')}
            />
            <ToggleRow
              id="notif-critical"
              label="Critical alerts only"
              desc="Suppress low/medium severity notifications"
              toggled={settings.criticalOnly}
              onToggle={() => handleToggle('criticalOnly')}
            />
          </FieldGroup>
        );

      // ── 7. Preferences ──────────────────────────────────────────
      case 'preferences':
        return (
          <FieldGroup title="INTERFACE">
            <Select
              id="pref-theme"
              size="sm"
              labelText="Theme"
              value={settings.theme}
              onChange={(e) => update('theme', e.target.value)}
              className={styles.field}
            >
              <SelectItem value="dark" text="Dark (default)" />
              <SelectItem value="light" text="Light" />
            </Select>
            <Select
              id="pref-density"
              size="sm"
              labelText="Density"
              value={settings.density}
              onChange={(e) => update('density', e.target.value)}
              className={styles.field}
            >
              <SelectItem value="compact" text="Compact" />
              <SelectItem value="comfortable" text="Comfortable" />
            </Select>
          </FieldGroup>
        );

      // ── 8. Integrations ─────────────────────────────────────────
      case 'integrations':
        return (
          <>
            <FieldGroup title="API ACCESS">
              <TextInput
                id="int-api-key"
                size="sm"
                labelText="API Key"
                value="ila_sk_live_••••••••••••8f2a"
                readOnly
                className={styles.field}
              />
            </FieldGroup>
            <FieldGroup title="WEBHOOKS">
              <TextInput
                id="int-webhook"
                size="sm"
                labelText="Webhook endpoint"
                placeholder="https://your-service.example.com/hooks/ila"
                className={styles.field}
              />
            </FieldGroup>
          </>
        );

      default:
        return null;
    }
  };

  const activeNavItem = NAV_ITEMS.find((n) => n.key === activeSection)!;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18 }}
            onClick={handleClose}
          />

          {/* Drawer */}
          <motion.aside
            className={styles.drawer}
            variants={drawerSlideIn}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={drawerSlideInTransition}
            role="dialog"
            aria-label="Settings"
          >
            {/* Header */}
            <div className={styles.drawerHeader}>
              <span className={styles.drawerTitle}>SETTINGS</span>
              <button className={styles.closeBtn} onClick={handleClose} aria-label="Close settings">
                <Close size={16} />
              </button>
            </div>

            {/* Body: nav + content */}
            <div className={styles.drawerBody}>
              {/* Left nav */}
              <nav className={styles.nav} aria-label="Settings sections">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.navItem} ${activeSection === item.key ? styles.navItemActive : ''}`}
                    onClick={() => setActiveSection(item.key)}
                    aria-current={activeSection === item.key}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </button>
                ))}
              </nav>

              {/* Right content */}
              <div className={styles.content}>
                <div className={styles.contentHeader}>
                  <span className={styles.contentIcon}>{activeNavItem.icon}</span>
                  <span className={styles.contentTitle}>{activeNavItem.label}</span>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    variants={fadeIn}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.16 }}
                    className={styles.contentBody}
                  >
                    {renderSection()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Sticky footer */}
            <div className={styles.drawerFooter}>
              <AnimatePresence>
                {isDirty && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Tag type="warm-gray" className={styles.unsavedTag}>
                      UNSAVED CHANGES
                    </Tag>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                kind="primary"
                size="sm"
                renderIcon={saving ? Renew : Save}
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={styles.saveBtn}
              >
                {saving ? 'SAVING…' : 'SAVE CHANGES'}
              </Button>

              <Button
                kind="danger--tertiary"
                size="sm"
                onClick={() => {
                  // perform logout if handler provided, then close drawer
                  if (onLogout) onLogout();
                  onClose();
                }}
                className={styles.logoutAction}
              >
                Log out
              </Button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsDrawer;