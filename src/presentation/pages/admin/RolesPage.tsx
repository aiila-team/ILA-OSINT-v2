// src/presentation/pages/admin/RolesPage.tsx
// ILA OSINT — Role & Permission Control Matrix
// RBAC matrix viewer with per-role permission toggles, dirty tracking, Framer Motion tab transitions.

import React, { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Tag, Toggle } from '@carbon/react';
import {
  Locked,
  Save,
  Reset,
  Search,
  FingerprintRecognition,
  ChartNetwork,
  Report,
  UserMultiple,
  Security,
  DocumentSecurity,
  Settings,
} from '@carbon/icons-react';
import styles from './RolesPage.module.scss';

// ── Animation variants ────────────────────────────────────────────
// Matches the fadeSlideUp pattern expected in src/styles/motion.ts
const fadeSlideUp = {
  initial:  { opacity: 0, y: 14 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -8 },
};
const fadeSlideUpTransition = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const };

// ── Types ─────────────────────────────────────────────────────────

type PermAction = 'read' | 'write' | 'delete' | 'export';

interface Permission {
  read:   boolean;
  write:  boolean;
  delete: boolean;
  export: boolean;
  /** which actions are system-enforced (not editable) */
  locked: PermAction[];
}

type ModuleKey =
  | 'investigations'
  | 'entitySearch'
  | 'graphAnalysis'
  | 'reports'
  | 'userManagement'
  | 'security'
  | 'auditLogs'
  | 'systemConfig';

type RoleKey = 'analyst' | 'admin' | 'viewer';

type RolePermissions = Record<ModuleKey, Permission>;
type AllRolePermissions = Record<RoleKey, RolePermissions>;

// ── Module metadata ───────────────────────────────────────────────

interface ModuleMeta {
  key:     ModuleKey;
  label:   string;
  sub:     string;
  icon:    React.ReactNode;
  section: 'intel' | 'admin';
}

const MODULE_META: ModuleMeta[] = [
  { key: 'investigations', label: 'Investigations',  sub: 'Case creation & tracking',             icon: <Search size={14} />,                section: 'intel' },
  { key: 'entitySearch',   label: 'Entity Search',   sub: 'Person, org, network lookup',          icon: <FingerprintRecognition size={14} />, section: 'intel' },
  { key: 'graphAnalysis',  label: 'Graph Analysis',  sub: 'Link & network visualization',         icon: <ChartNetwork size={14} />,          section: 'intel' },
  { key: 'reports',        label: 'Reports',         sub: 'Generate & export intelligence reports',icon: <Report size={14} />,                section: 'intel' },
  { key: 'userManagement', label: 'User Management', sub: 'Account provisioning & control',       icon: <UserMultiple size={14} />,          section: 'admin' },
  { key: 'security',       label: 'Security',        sub: 'MFA, session, IP policy',              icon: <Security size={14} />,              section: 'admin' },
  { key: 'auditLogs',      label: 'Audit Logs',      sub: 'System activity trail',                icon: <DocumentSecurity size={14} />,       section: 'admin' },
  { key: 'systemConfig',   label: 'System Config',   sub: 'Platform-wide configuration',         icon: <Settings size={14} />,              section: 'admin' },
];

// ── Default permission states per role ────────────────────────────

const DEFAULT_PERMISSIONS: AllRolePermissions = {
  analyst: {
    investigations: { read: true,  write: true,  delete: false, export: true,  locked: ['delete'] },
    entitySearch:   { read: true,  write: true,  delete: false, export: true,  locked: [] },
    graphAnalysis:  { read: true,  write: false, delete: false, export: true,  locked: [] },
    reports:        { read: true,  write: true,  delete: false, export: true,  locked: [] },
    userManagement: { read: false, write: false, delete: false, export: false, locked: ['write', 'delete', 'export'] },
    security:       { read: false, write: false, delete: false, export: false, locked: ['write', 'delete'] },
    auditLogs:      { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete'] },
    systemConfig:   { read: false, write: false, delete: false, export: false, locked: ['read', 'write', 'delete', 'export'] },
  },
  admin: {
    investigations: { read: true,  write: true,  delete: true,  export: true,  locked: [] },
    entitySearch:   { read: true,  write: true,  delete: true,  export: true,  locked: [] },
    graphAnalysis:  { read: true,  write: true,  delete: true,  export: true,  locked: [] },
    reports:        { read: true,  write: true,  delete: true,  export: true,  locked: [] },
    userManagement: { read: true,  write: true,  delete: true,  export: true,  locked: ['delete'] },
    security:       { read: true,  write: true,  delete: false, export: true,  locked: [] },
    auditLogs:      { read: true,  write: false, delete: false, export: true,  locked: ['write', 'delete'] },
    systemConfig:   { read: true,  write: true,  delete: false, export: false, locked: ['delete'] },
  },
  viewer: {
    investigations: { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete', 'export'] },
    entitySearch:   { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete'] },
    graphAnalysis:  { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete', 'export'] },
    reports:        { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete'] },
    userManagement: { read: false, write: false, delete: false, export: false, locked: ['read', 'write', 'delete', 'export'] },
    security:       { read: false, write: false, delete: false, export: false, locked: ['read', 'write', 'delete', 'export'] },
    auditLogs:      { read: true,  write: false, delete: false, export: false, locked: ['write', 'delete', 'export'] },
    systemConfig:   { read: false, write: false, delete: false, export: false, locked: ['read', 'write', 'delete', 'export'] },
  },
};

// Deep-clone helper
function clonePermissions(p: AllRolePermissions): AllRolePermissions {
  return JSON.parse(JSON.stringify(p));
}

// Compare helper for dirty detection
function permissionsEqual(a: AllRolePermissions, b: AllRolePermissions): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Tab config ────────────────────────────────────────────────────

const ROLE_TABS: { key: RoleKey; label: string; pillLabel: string }[] = [
  { key: 'analyst', label: 'ANALYST', pillLabel: 'ANALYST ROLE' },
  { key: 'admin',   label: 'ADMIN',   pillLabel: 'ADMIN ROLE'   },
  { key: 'viewer',  label: 'VIEWER',  pillLabel: 'VIEWER ROLE'  },
];

const PERM_ACTIONS: PermAction[] = ['read', 'write', 'delete', 'export'];

// ── Permission Cell ───────────────────────────────────────────────

interface PermCellProps {
  action:   PermAction;
  value:    boolean;
  isLocked: boolean;
  moduleKey: ModuleKey;
  role:     RoleKey;
  onToggle: (role: RoleKey, module: ModuleKey, action: PermAction) => void;
}

const PermCell: React.FC<PermCellProps> = ({
  action, value, isLocked, moduleKey, role, onToggle,
}) => (
  <td className={styles.cell}>
    <div className={`${styles.cellInner} ${isLocked ? styles.cellLocked : ''}`}>
      {isLocked ? (
        <>
          <Toggle
            id={`toggle-${role}-${moduleKey}-${action}`}
            size="sm"
            toggled={value}
            disabled
            className={styles.toggle}
            hideLabel
            labelText={`${action} permission for ${moduleKey}`}
          />
          <span className={styles.lockIcon} aria-label="System enforced">
            <Locked size={12} />
          </span>
        </>
      ) : (
        <Toggle
          id={`toggle-${role}-${moduleKey}-${action}`}
          size="sm"
          toggled={value}
          onToggle={() => onToggle(role, moduleKey, action)}
          className={styles.toggle}
          hideLabel
          labelText={`${action} permission for ${moduleKey}`}
        />
      )}
    </div>
  </td>
);

// ── Matrix Panel (per-role tab content) ──────────────────────────

interface MatrixPanelProps {
  role:        RoleKey;
  permissions: AllRolePermissions;
  isDirty:     boolean;
  onToggle:    (role: RoleKey, module: ModuleKey, action: PermAction) => void;
  onSave:      (role: RoleKey) => void;
  onReset:     (role: RoleKey) => void;
}

const MatrixPanel: React.FC<MatrixPanelProps> = ({
  role, permissions, isDirty, onToggle, onSave, onReset,
}) => {
  const roleTab  = ROLE_TABS.find((t) => t.key === role)!;
  const rolePerms = permissions[role];

  const intelModules = MODULE_META.filter((m) => m.section === 'intel');
  const adminModules = MODULE_META.filter((m) => m.section === 'admin');

  const renderRows = (modules: ModuleMeta[]) =>
    modules.map((mod) => {
      const perm = rolePerms[mod.key];
      return (
        <tr key={mod.key} className={styles.row}>
          {/* Module cell */}
          <td className={styles.moduleCell}>
            <div className={styles.moduleWrap}>
              <span className={styles.moduleIcon} aria-hidden="true">
                {mod.icon}
              </span>
              <div>
                <div className={styles.moduleName}>{mod.label}</div>
                <div className={styles.moduleSub}>{mod.sub}</div>
              </div>
            </div>
          </td>

          {/* Permission cells */}
          {PERM_ACTIONS.map((action) => (
            <PermCell
              key={action}
              action={action}
              value={perm[action]}
              isLocked={perm.locked.includes(action)}
              moduleKey={mod.key}
              role={role}
              onToggle={onToggle}
            />
          ))}
        </tr>
      );
    });

  return (
    <div className={styles.matrixPanel}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.rolePill}>
            <span className={styles.rolePillDot} aria-hidden="true" />
            <span className={styles.rolePillText}>{roleTab.pillLabel}</span>
          </div>

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
        </div>

        <div className={styles.toolbarRight}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Reset}
            iconDescription="Reset to defaults"
            onClick={() => onReset(role)}
            className={styles.resetBtn}
          >
            RESET DEFAULTS
          </Button>
          <Button
            kind="secondary"
            size="sm"
            renderIcon={Save}
            iconDescription="Save changes"
            onClick={() => onSave(role)}
            className={styles.saveBtn}
            disabled={!isDirty}
          >
            SAVE CHANGES
          </Button>
        </div>
      </div>

      {/* Matrix table */}
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={`${roleTab.pillLabel} permission matrix`}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.thModule} scope="col">MODULE / FEATURE</th>
              {PERM_ACTIONS.map((a) => (
                <th key={a} className={styles.thPerm} scope="col">
                  {a.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Section: Intelligence Operations */}
            <tr className={styles.sectionDivider}>
              <td colSpan={5}>INTELLIGENCE OPERATIONS</td>
            </tr>
            {renderRows(intelModules)}

            {/* Section: Administration & Compliance */}
            <tr className={styles.sectionDivider}>
              <td colSpan={5}>ADMINISTRATION & COMPLIANCE</td>
            </tr>
            {renderRows(adminModules)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────

const RolesPage: React.FC = () => {
  const [activeRole, setActiveRole]   = useState<RoleKey>('analyst');
  const [permissions, setPermissions] = useState<AllRolePermissions>(
    clonePermissions(DEFAULT_PERMISSIONS)
  );
  const [savedState, setSavedState]   = useState<AllRolePermissions>(
    clonePermissions(DEFAULT_PERMISSIONS)
  );

  // ── Dirty detection per role ────────────────────────────────────
  const isDirty = useMemo(
    () => !permissionsEqual(permissions, savedState),
    [permissions, savedState]
  );

  // ── Toggle handler ──────────────────────────────────────────────
  const handleToggle = useCallback(
    (role: RoleKey, module: ModuleKey, action: PermAction) => {
      setPermissions((prev) => {
        const next = clonePermissions(prev);
        next[role][module][action] = !next[role][module][action];
        return next;
      });
    },
    []
  );

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = useCallback((_role: RoleKey) => {
    setSavedState(clonePermissions(permissions));
    // TODO: wire to API / audit log endpoint
  }, [permissions]);

  // ── Reset ───────────────────────────────────────────────────────
  const handleReset = useCallback((role: RoleKey) => {
    setPermissions((prev) => {
      const next = clonePermissions(prev);
      next[role] = clonePermissions(DEFAULT_PERMISSIONS)[role];
      return next;
    });
  }, []);

  return (
    <div className={styles.container}>
      {/* ── Page header ─────────────────────────────────────── */}
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          ADMINISTRATION <span>›</span> USER MANAGEMENT <span>›</span> ROLES &amp; PERMISSIONS
        </p>
        <h1 className={styles.pageTitle}>ROLE &amp; PERMISSION CONTROL MATRIX</h1>
        <p className={styles.pageSubtitle}>
          Define operational capabilities for each role. Changes are audit logged and enforced system-wide.
        </p>
      </header>

      {/* ── Custom tab bar ───────────────────────────────────── */}
      <div className={styles.tabBar} role="tablist" aria-label="Role tabs">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeRole === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            id={`tab-${tab.key}`}
            className={`${styles.tab} ${activeRole === tab.key ? styles.tabActive : ''}`}
            onClick={() => setActiveRole(tab.key)}
          >
            {tab.label}
            {/* Per-tab dirty indicator dot */}
            {isDirty && activeRole === tab.key && (
              <span className={styles.tabDirtyDot} aria-label="Unsaved changes" />
            )}
          </button>
        ))}
      </div>

      {/* ── Animated tab content ─────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeRole}
          role="tabpanel"
          id={`tabpanel-${activeRole}`}
          aria-labelledby={`tab-${activeRole}`}
          variants={fadeSlideUp}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={fadeSlideUpTransition}
          className={styles.tabPanel}
        >
          <MatrixPanel
            role={activeRole}
            permissions={permissions}
            isDirty={isDirty}
            onToggle={handleToggle}
            onSave={handleSave}
            onReset={handleReset}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default RolesPage;