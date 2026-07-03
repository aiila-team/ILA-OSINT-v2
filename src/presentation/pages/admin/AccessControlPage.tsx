// src/presentation/pages/admin/AccessControlPage.tsx
// ILA OSINT — Access Control Page
// IP Allowlist · MFA Policy · Session Policy
// Carbon Design System + Framer Motion + SCSS Modules

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Tag,
  Toggle,
  Select,
  SelectItem,
  NumberInput,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  TextArea,
  InlineNotification,
} from '@carbon/react';
import {
  Add,
  TrashCan,
  Security,
  Time,
  Locked,
  Warning,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import styles from './AccessControlPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface IPEntry {
  id:          string;
  ipRange:     string;
  description: string;
  addedBy:     string;
  status:      'active' | 'inactive';
  notes:       string;
}

interface MFAPolicy {
  requireAll:    boolean;
  requireAdmin:  boolean;
  method:        'TOTP' | 'SMS' | 'HARDWARE_KEY';
}

interface SessionPolicy {
  timeoutMinutes:   number;
  maxConcurrent:    number;
  forceReauthPriv:  boolean;
}

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

const INITIAL_IP_LIST: IPEntry[] = [
  { id: 'ip-1', ipRange: '10.0.1.0/24',    description: 'Internal HQ Network',       addedBy: 'admin',    status: 'active',   notes: 'Primary operational network' },
  { id: 'ip-2', ipRange: '10.0.2.0/24',    description: 'Analyst Wing — Bangalore',  addedBy: 'admin',    status: 'active',   notes: 'Regional office block'       },
  { id: 'ip-3', ipRange: '192.168.50.0/24',description: 'VPN Exit Node — Delhi',     addedBy: 'j.reyes',  status: 'active',   notes: 'Secure VPN subnet'           },
  { id: 'ip-4', ipRange: '172.16.100.0/24',description: 'NSCS Liaison Network',      addedBy: 'admin',    status: 'inactive', notes: 'Temporarily suspended'       },
  { id: 'ip-5', ipRange: '10.10.5.0/24',   description: 'Field Operations Unit',     addedBy: 'm.kapoor', status: 'active',   notes: 'Mobile field units'          },
];

const TABLE_HEADERS = [
  { key: 'ipRange',     header: 'IP RANGE'     },
  { key: 'description', header: 'DESCRIPTION'  },
  { key: 'addedBy',     header: 'ADDED BY'     },
  { key: 'status',      header: 'STATUS'       },
  { key: 'actions',     header: 'ACTIONS'      },
];

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon:     React.ReactNode;
  title:    string;
  subtitle?: string;
  children: React.ReactNode;
  delay?:   number;
}

const SectionCard: React.FC<SectionCardProps> = ({ icon, title, subtitle, children, delay = 0 }) => (
  <motion.div
    className={styles.sectionCard}
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0  }}
    transition={{ duration: 0.22, ease: 'easeOut', delay }}
  >
    <div className={styles.sectionCardHeader}>
      <span className={styles.sectionCardIcon}>{icon}</span>
      <div>
        <h2 className={styles.sectionCardTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionCardSub}>{subtitle}</p>}
      </div>
    </div>
    {children}
  </motion.div>
);

interface ToggleRowProps {
  id:       string;
  label:    string;
  desc:     string;
  checked:  boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ id, label, desc, checked, onChange }) => (
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

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────

const AccessControlPage: React.FC = () => {
  // ── IP Allowlist state ────────────────────────────────────────
  const [ipList,         setIpList]         = useState<IPEntry[]>(INITIAL_IP_LIST);
  const [addModalOpen,   setAddModalOpen]   = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<IPEntry | null>(null);
  const [newIpRange,     setNewIpRange]     = useState('');
  const [newDesc,        setNewDesc]        = useState('');
  const [newNotes,       setNewNotes]       = useState('');
  const [ipRangeError,   setIpRangeError]   = useState('');
  const [showDeletedMsg, setShowDeletedMsg] = useState(false);

  // ── MFA state ─────────────────────────────────────────────────
  const [mfa, setMfa] = useState<MFAPolicy>({
    requireAll:   true,
    requireAdmin: true,
    method:       'TOTP',
  });

  // ── Session state ─────────────────────────────────────────────
  const [session, setSession] = useState<SessionPolicy>({
    timeoutMinutes:  30,
    maxConcurrent:   2,
    forceReauthPriv: true,
  });

  // ── Handlers: IP ─────────────────────────────────────────────
  const validateIpRange = (val: string): string => {
    if (!val.trim()) return 'IP range is required';
    const cidr = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!cidr.test(val.trim())) return 'Invalid format — use CIDR notation, e.g. 10.0.1.0/24';
    return '';
  };

  const handleAddIP = useCallback(() => {
    const err = validateIpRange(newIpRange);
    if (err) { setIpRangeError(err); return; }
    const entry: IPEntry = {
      id:          `ip-${Date.now()}`,
      ipRange:     newIpRange.trim(),
      description: newDesc.trim() || '—',
      addedBy:     'admin',
      status:      'active',
      notes:       newNotes.trim(),
    };
    setIpList((prev) => [entry, ...prev]);
    setAddModalOpen(false);
    setNewIpRange(''); setNewDesc(''); setNewNotes(''); setIpRangeError('');
  }, [newIpRange, newDesc, newNotes]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    setIpList((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    setDeleteTarget(null);
    setShowDeletedMsg(true);
    setTimeout(() => setShowDeletedMsg(false), 3500);
  }, [deleteTarget]);

  // ── Table rows ────────────────────────────────────────────────
  const tableRows = ipList.map((e) => ({ ...e }));

  const headerActions = (
    <span className={styles.headerBadge}>{ipList.length} RANGES CONFIGURED</span>
  );

  return (
    <AnalystPageShell title="ACCESS CONTROL" actions={headerActions}>
      <div className={styles.pageBody}>

        {/* ── Deleted notification ── */}
        <AnimatePresence>
          {showDeletedMsg && (
            <motion.div
              className={styles.notifWrap}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <InlineNotification
                kind="success"
                title="IP RANGE REMOVED — "
                subtitle="Entry has been deleted from the allowlist."
                onClose={() => setShowDeletedMsg(false)}
                lowContrast
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════
            SECTION 1 — IP Allowlist
        ════════════════════════════════════════════════════ */}
        <SectionCard
          icon={<Locked size={16} />}
          title="IP ALLOWLIST"
          subtitle="Only connections from these IP ranges are permitted to access the platform."
          delay={0}
        >
          {/* Warning notice */}
          <div className={styles.warningBanner}>
            <Warning size={14} className={styles.warningIcon} />
            <span>Removing all entries will open access from any IP address. Apply changes carefully.</span>
          </div>

          {/* Add button row */}
          <div className={styles.tableActionsRow}>
            <span className={styles.tableCount}>{ipList.length} entries</span>
            <Button
              size="sm"
              kind="primary"
              renderIcon={Add}
              onClick={() => setAddModalOpen(true)}
              className={styles.addBtn}
            >
              ADD IP RANGE
            </Button>
          </div>

          {/* DataTable */}
          <div className={styles.tableWrap}>
            <DataTable rows={tableRows} headers={TABLE_HEADERS}>
              {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                <TableContainer className={styles.tableContainer}>
                  <Table {...getTableProps()} size="sm" className={styles.table}>
                    <TableHead>
                      <TableRow>
                        {headers.map((h) => (
                          <TableHeader {...getHeaderProps({ header: h })} key={h.key} className={styles.th}>
                            {h.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const entry = ipList.find((e) => e.id === row.id)!;
                        return (
                          <TableRow
                            {...getRowProps({ row })}
                            key={row.id}
                            className={styles.tr}
                          >
                            <TableCell className={`${styles.td} ${styles.monoTd}`}>{entry.ipRange}</TableCell>
                            <TableCell className={styles.td}>{entry.description}</TableCell>
                            <TableCell className={`${styles.td} ${styles.monoTd}`}>{entry.addedBy}</TableCell>
                            <TableCell className={styles.td}>
                              <Tag
                                type={entry.status === 'active' ? 'green' : 'gray'}
                                size="sm"
                                className={styles.statusTag}
                              >
                                {entry.status.toUpperCase()}
                              </Tag>
                            </TableCell>
                            <TableCell className={styles.td}>
                              <Button
                                size="sm"
                                kind="danger--ghost"
                                renderIcon={TrashCan}
                                hasIconOnly
                                iconDescription="Delete entry"
                                onClick={() => setDeleteTarget(entry)}
                                className={styles.deleteBtn}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════════════════
            SECTION 2 — MFA Policy
        ════════════════════════════════════════════════════ */}
        <SectionCard
          icon={<Security size={16} />}
          title="MULTI-FACTOR AUTHENTICATION POLICY"
          subtitle="Configure MFA requirements across analyst and admin roles."
          delay={0.06}
        >
          <div className={styles.policyGrid}>
            <div className={styles.toggleGroup}>
              <ToggleRow
                id="mfa-all"
                label="Require MFA for all users"
                desc="All platform accounts must complete MFA on every session"
                checked={mfa.requireAll}
                onChange={(v) => setMfa((p) => ({ ...p, requireAll: v }))}
              />
              <ToggleRow
                id="mfa-admin"
                label="Require MFA for admin roles only"
                desc="Restrict MFA enforcement to ADMIN and SUPER_ADMIN accounts"
                checked={mfa.requireAdmin}
                onChange={(v) => setMfa((p) => ({ ...p, requireAdmin: v }))}
              />
            </div>

            <div className={styles.mfaMethod}>
              <label className={styles.fieldLabel}>MFA METHOD</label>
              <Select
                id="mfa-method"
                labelText=""
                value={mfa.method}
                onChange={(e) => setMfa((p) => ({ ...p, method: e.target.value as MFAPolicy['method'] }))}
                className={styles.select}
              >
                <SelectItem value="TOTP"         text="TOTP — Authenticator App"    />
                <SelectItem value="SMS"          text="SMS — One-Time Password"      />
                <SelectItem value="HARDWARE_KEY" text="Hardware Security Key (FIDO2)" />
              </Select>
              <p className={styles.fieldHint}>
                {mfa.method === 'TOTP'         && 'Google Authenticator, Authy, or compatible TOTP app required.'}
                {mfa.method === 'SMS'          && 'OTP sent to registered government-issued mobile number.'}
                {mfa.method === 'HARDWARE_KEY' && 'FIDO2-compliant hardware key (YubiKey, etc.) required.'}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* ════════════════════════════════════════════════════
            SECTION 3 — Session Policy
        ════════════════════════════════════════════════════ */}
        <SectionCard
          icon={<Time size={16} />}
          title="SESSION POLICY"
          subtitle="Control session lifetime, concurrency, and re-authentication triggers."
          delay={0.12}
        >
          <div className={styles.sessionGrid}>
            <div className={styles.numberGroup}>
              <label className={styles.fieldLabel}>SESSION TIMEOUT (MINUTES)</label>
              <NumberInput
                id="session-timeout"
                min={5}
                max={480}
                value={session.timeoutMinutes}
                onChange={(_e: unknown, { value }: { value: number | string }) =>
                  setSession((p) => ({ ...p, timeoutMinutes: Number(value) }))
                }
                label=""
                className={styles.numberInput}
              />
              <p className={styles.fieldHint}>Idle sessions are automatically terminated after this interval.</p>
            </div>

            <div className={styles.numberGroup}>
              <label className={styles.fieldLabel}>MAX CONCURRENT SESSIONS</label>
              <NumberInput
                id="max-sessions"
                min={1}
                max={10}
                value={session.maxConcurrent}
                onChange={(_e: unknown, { value }: { value: number | string }) =>
                  setSession((p) => ({ ...p, maxConcurrent: Number(value) }))
                }
                label=""
                className={styles.numberInput}
              />
              <p className={styles.fieldHint}>New logins exceeding this limit will terminate the oldest session.</p>
            </div>
          </div>

          <div className={styles.divider} />

          <ToggleRow
            id="reauth-priv"
            label="Force re-authentication on privilege escalation"
            desc="Users must re-authenticate when accessing classified or restricted case material"
            checked={session.forceReauthPriv}
            onChange={(v) => setSession((p) => ({ ...p, forceReauthPriv: v }))}
          />
        </SectionCard>

      </div>

      {/* ── Add IP Modal ── */}
      <ComposedModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setIpRangeError(''); }}
        className={styles.modal}
      >
        <ModalHeader title="ADD IP RANGE" className={styles.modalHeader} />
        <ModalBody className={styles.modalBody}>
          <TextInput
            id="new-ip-range"
            labelText="IP RANGE (CIDR NOTATION)"
            placeholder="e.g. 10.0.1.0/24"
            value={newIpRange}
            onChange={(e) => { setNewIpRange(e.target.value); setIpRangeError(''); }}
            invalid={!!ipRangeError}
            invalidText={ipRangeError}
            className={styles.modalField}
            autoFocus
          />
          <TextInput
            id="new-ip-desc"
            labelText="DESCRIPTION"
            placeholder="e.g. Analyst Wing — Bangalore"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className={styles.modalField}
          />
          <TextArea
            id="new-ip-notes"
            labelText="NOTES (OPTIONAL)"
            placeholder="Additional context or justification…"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={3}
            className={styles.modalField}
          />
        </ModalBody>
        <ModalFooter className={styles.modalFooter}>
          <Button kind="secondary" onClick={() => setAddModalOpen(false)} className={styles.modalBtn}>CANCEL</Button>
          <Button kind="primary"   onClick={handleAddIP}                  className={styles.modalBtn}>ADD ENTRY</Button>
        </ModalFooter>
      </ComposedModal>

      {/* ── Delete Confirm Modal ── */}
      <ComposedModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        className={styles.modal}
        danger
      >
        <ModalHeader title="CONFIRM DELETION" className={styles.modalHeader} />
        <ModalBody className={styles.modalBody}>
          <p className={styles.confirmText}>
            Remove <strong className={styles.confirmHighlight}>{deleteTarget?.ipRange}</strong> from the IP allowlist?
          </p>
          <p className={styles.confirmSub}>
            {deleteTarget?.description} — added by {deleteTarget?.addedBy}
          </p>
          <InlineNotification
            kind="warning"
            title="Warning — "
            subtitle="Removing this entry may immediately affect active connections from this range."
            lowContrast
            className={styles.confirmNotif}
          />
        </ModalBody>
        <ModalFooter className={styles.modalFooter}>
          <Button kind="secondary" onClick={() => setDeleteTarget(null)} className={styles.modalBtn}>CANCEL</Button>
          <Button kind="danger"    onClick={handleDeleteConfirm}         className={styles.modalBtn}>DELETE ENTRY</Button>
        </ModalFooter>
      </ComposedModal>

    </AnalystPageShell>
  );
};

export default AccessControlPage;