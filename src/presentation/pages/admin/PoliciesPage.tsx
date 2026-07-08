// src/presentation/pages/admin/PoliciesPage.tsx
// ILA OSINT — Policies Page
// Data Retention · Classification Labels · Export Controls
// Carbon Design System + Framer Motion + SCSS Modules

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Tag,
  Toggle,
  NumberInput,
  Select,
  SelectItem,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Accordion,
  AccordionItem,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  InlineNotification,
} from '@carbon/react';
import {
  Add,
  TrashCan,
  Save,
  DocumentExport,
  Tag as TagIcon,
  Archive,
  Warning,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import styles from './PoliciesPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  logRetentionDays:    number;
  reportArchivePeriod: number;
}

interface ClassificationLabel {
  id:              string;
  name:            string;
  color:           string;
  allowExport:     boolean;
}

interface ExportControls {
  allowPdf:         boolean;
  allowCsv:         boolean;
  allowRawJson:     boolean;
  watermarkExports: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

const INITIAL_LABELS: ClassificationLabel[] = [
  { id: 'lbl-1', name: 'UNCLASSIFIED',       color: 'green',  allowExport: true  },
  { id: 'lbl-2', name: 'RESTRICTED',         color: 'yellow', allowExport: false },
  { id: 'lbl-3', name: 'SECRET',             color: 'red',    allowExport: false },
  { id: 'lbl-4', name: 'TOP SECRET',         color: 'red',    allowExport: false },
  { id: 'lbl-5', name: 'SECRET // NOFORN',   color: 'purple', allowExport: false },
  { id: 'lbl-6', name: 'UNCLASSIFIED // FOUO', color: 'cyan', allowExport: true  },
];

const LABEL_TABLE_HEADERS = [
  { key: 'name',        header: 'LABEL NAME'       },
  { key: 'color',       header: 'COLOUR'           },
  { key: 'allowExport', header: 'EXPORT PERMITTED' },
  { key: 'actions',     header: 'ACTIONS'          },
];

const COLOR_OPTIONS = [
  { value: 'green',  label: 'Green  — Unclassified'  },
  { value: 'cyan',   label: 'Cyan   — FOUO'          },
  { value: 'yellow', label: 'Yellow — Restricted'    },
  { value: 'red',    label: 'Red    — Secret'        },
  { value: 'purple', label: 'Purple — Top Secret'    },
  { value: 'gray',   label: 'Gray   — Administrative'},
];

const COLOR_TAG_TYPE: Record<string, 'green' | 'cyan' | 'warm-gray' | 'red' | 'purple' | 'gray'> = {
  green:    'green',
  cyan:     'cyan',
  yellow:   'warm-gray',
  red:      'red',
  purple:   'purple',
  gray:     'gray',
};

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

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

const PoliciesPage: React.FC = () => {
  // ── State ─────────────────────────────────────────────────────
  const [retention, setRetention] = useState<RetentionPolicy>({
    logRetentionDays:    365,
    reportArchivePeriod: 90,
  });

  const [labels,       setLabels]       = useState<ClassificationLabel[]>(INITIAL_LABELS);
  const [exportCtrl,   setExportCtrl]   = useState<ExportControls>({
    allowPdf:         true,
    allowCsv:         true,
    allowRawJson:     false,
    watermarkExports: true,
  });

  // ── Modal state ───────────────────────────────────────────────
  const [addLabelOpen,    setAddLabelOpen]    = useState(false);
  const [deleteLabelTgt,  setDeleteLabelTgt]  = useState<ClassificationLabel | null>(null);
  const [newLabelName,    setNewLabelName]    = useState('');
  const [newLabelColor,   setNewLabelColor]   = useState('green');
  const [newLabelExport,  setNewLabelExport]  = useState(false);
  const [labelNameError,  setLabelNameError]  = useState('');

  // ── Save state ────────────────────────────────────────────────
  const [unsaved,      setUnsaved]      = useState(false);
  const [saveSuccess,  setSaveSuccess]  = useState(false);
  const [saving,       setSaving]       = useState(false);

  // Whenever anything changes, mark unsaved
  const markDirty = useCallback(() => setUnsaved(true), []);

  // ── Save handler ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setUnsaved(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  }, []);

  // ── Add label ─────────────────────────────────────────────────
  const handleAddLabel = useCallback(() => {
    if (!newLabelName.trim()) { setLabelNameError('Label name is required'); return; }
    const newLabel: ClassificationLabel = {
      id:          `lbl-${Date.now()}`,
      name:        newLabelName.trim().toUpperCase(),
      color:       newLabelColor,
      allowExport: newLabelExport,
    };
    setLabels((prev) => [...prev, newLabel]);
    setAddLabelOpen(false);
    setNewLabelName(''); setNewLabelColor('green'); setNewLabelExport(false); setLabelNameError('');
    markDirty();
  }, [newLabelName, newLabelColor, newLabelExport, markDirty]);

  // ── Delete label ──────────────────────────────────────────────
  const handleDeleteLabel = useCallback(() => {
    if (!deleteLabelTgt) return;
    setLabels((prev) => prev.filter((l) => l.id !== deleteLabelTgt.id));
    setDeleteLabelTgt(null);
    markDirty();
  }, [deleteLabelTgt, markDirty]);

  const headerActions = (
    <div className={styles.headerActions}>
      <AnimatePresence>
        {unsaved && (
          <motion.span
            className={styles.unsavedBadge}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1   }}
            exit={{    opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.16 }}
          >
            <Warning size={12} /> UNSAVED CHANGES
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <AnalystPageShell title="POLICIES" actions={headerActions}>
      <div className={styles.pageBody}>

        {/* ── Save success toast ── */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              className={styles.toastWrap}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0   }}
              exit={{    opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <InlineNotification
                kind="success"
                title="POLICIES SAVED — "
                subtitle="All policy changes have been applied successfully."
                onClose={() => setSaveSuccess(false)}
                lowContrast
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Page description ── */}
        <motion.p
          className={styles.pageDesc}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          Define platform-wide data governance, classification schema, and export restrictions.
          Changes are audit-logged and applied immediately on save.
        </motion.p>

        {/* ════════════════════════════════════════════════════
            Accordion
        ════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0  }}
          transition={{ duration: 0.22, ease: 'easeOut', delay: 0.06 }}
        >
          <Accordion className={styles.accordion}>

            {/* ── SECTION 1: Data Retention ── */}
            <AccordionItem
              title={
                <div className={styles.accordionTitle}>
                  <Archive size={15} className={styles.accordionIcon} />
                  DATA RETENTION
                </div>
              }
              className={styles.accordionItem}
              open
            >
              <div className={styles.accordionBody}>
                <p className={styles.sectionDesc}>
                  Configure how long the platform retains logs and archived reports before automatic purge.
                </p>

                <div className={styles.retentionGrid}>
                  <div className={styles.retentionField}>
                    <label className={styles.fieldLabel}>LOG RETENTION PERIOD (DAYS)</label>
                    <NumberInput
                      id="log-retention"
                      min={30}
                      max={3650}
                      value={retention.logRetentionDays}
                      onChange={(_e: unknown, { value }: { value: number | string }) => {
                        setRetention((p) => ({ ...p, logRetentionDays: Number(value) }));
                        markDirty();
                      }}
                      label=""
                      className={styles.numberInput}
                    />
                    <p className={styles.fieldHint}>System logs, access records, and audit trail entries.</p>
                  </div>

                  <div className={styles.retentionField}>
                    <label className={styles.fieldLabel}>REPORT ARCHIVE PERIOD (DAYS)</label>
                    <NumberInput
                      id="report-archive"
                      min={30}
                      max={1825}
                      value={retention.reportArchivePeriod}
                      onChange={(_e: unknown, { value }: { value: number | string }) => {
                        setRetention((p) => ({ ...p, reportArchivePeriod: Number(value) }));
                        markDirty();
                      }}
                      label=""
                      className={styles.numberInput}
                    />
                    <p className={styles.fieldHint}>Exported intelligence reports stored in the archive system.</p>
                  </div>
                </div>

                <div className={styles.retentionInfo}>
                  <Warning size={13} className={styles.infoIcon} />
                  <span>
                    Data older than the configured period will be automatically purged.
                    Ensure compliance with applicable information retention standards before reducing periods.
                  </span>
                </div>
              </div>
            </AccordionItem>

            {/* ── SECTION 2: Classification Labels ── */}
            <AccordionItem
              title={
                <div className={styles.accordionTitle}>
                  <TagIcon size={15} className={styles.accordionIcon} />
                  CLASSIFICATION LABELS
                </div>
              }
              className={styles.accordionItem}
            >
              <div className={styles.accordionBody}>
                <p className={styles.sectionDesc}>
                  Define classification labels applied to cases, reports, and entities across the platform.
                </p>

                <div className={styles.labelActionsRow}>
                  <span className={styles.tableCount}>{labels.length} labels defined</span>
                  <Button
                    size="sm"
                    kind="primary"
                    renderIcon={Add}
                    onClick={() => setAddLabelOpen(true)}
                    className={styles.addBtn}
                  >
                    ADD LABEL
                  </Button>
                </div>

                <div className={styles.tableWrap}>
                  <DataTable rows={labels} headers={LABEL_TABLE_HEADERS}>
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
                              const lbl = labels.find((l) => l.id === row.id)!;
                              return (
                                <TableRow {...getRowProps({ row })} key={row.id} className={styles.tr}>
                                  <TableCell className={`${styles.td} ${styles.monoTd}`}>{lbl.name}</TableCell>
                                  <TableCell className={styles.td}>
                                    <Tag
                                      type={COLOR_TAG_TYPE[lbl.color] ?? 'gray'}
                                      size="sm"
                                      className={styles.colorTag}
                                    >
                                      {lbl.color.toUpperCase()}
                                    </Tag>
                                  </TableCell>
                                  <TableCell className={styles.td}>
                                    <Tag
                                      type={lbl.allowExport ? 'green' : 'red'}
                                      size="sm"
                                      className={styles.exportTag}
                                    >
                                      {lbl.allowExport ? 'PERMITTED' : 'RESTRICTED'}
                                    </Tag>
                                  </TableCell>
                                  <TableCell className={styles.td}>
                                    <Button
                                      size="sm"
                                      kind="danger--ghost"
                                      renderIcon={TrashCan}
                                      hasIconOnly
                                      iconDescription="Delete label"
                                      onClick={() => setDeleteLabelTgt(lbl)}
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
              </div>
            </AccordionItem>

            {/* ── SECTION 3: Export Controls ── */}
            <AccordionItem
              title={
                <div className={styles.accordionTitle}>
                  <DocumentExport size={15} className={styles.accordionIcon} />
                  EXPORT CONTROLS
                </div>
              }
              className={styles.accordionItem}
            >
              <div className={styles.accordionBody}>
                <p className={styles.sectionDesc}>
                  Restrict or permit data export formats across the platform. Applies to all analyst roles.
                </p>

                <div className={styles.exportGrid}>
                  <ToggleRow
                    id="allow-pdf"
                    label="Allow PDF Export"
                    desc="Analysts may export reports and case summaries as PDF documents"
                    checked={exportCtrl.allowPdf}
                    onChange={(v) => { setExportCtrl((p) => ({ ...p, allowPdf: v })); markDirty(); }}
                  />
                  <ToggleRow
                    id="allow-csv"
                    label="Allow CSV Export"
                    desc="Tabular data (alerts, entities, timelines) can be exported as CSV"
                    checked={exportCtrl.allowCsv}
                    onChange={(v) => { setExportCtrl((p) => ({ ...p, allowCsv: v })); markDirty(); }}
                  />
                  <ToggleRow
                    id="allow-json"
                    label="Allow Raw JSON Export"
                    desc="Full graph and entity data can be exported in machine-readable JSON format"
                    checked={exportCtrl.allowRawJson}
                    onChange={(v) => { setExportCtrl((p) => ({ ...p, allowRawJson: v })); markDirty(); }}
                  />
                  <ToggleRow
                    id="watermark"
                    label="Watermark All Exports"
                    desc="Auto-stamp classification level and analyst ID on all exported documents"
                    checked={exportCtrl.watermarkExports}
                    onChange={(v) => { setExportCtrl((p) => ({ ...p, watermarkExports: v })); markDirty(); }}
                  />
                </div>

                {exportCtrl.allowRawJson && (
                  <motion.div
                    className={styles.jsonWarning}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{    opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Warning size={13} />
                    <span>
                      Raw JSON export includes full entity metadata and graph links.
                      Restrict to ELEVATED access level or above.
                    </span>
                  </motion.div>
                )}
              </div>
            </AccordionItem>

          </Accordion>
        </motion.div>

      </div>

      {/* ════════════════════════════════════════════════════
          Sticky Save Footer
      ════════════════════════════════════════════════════ */}
      <div className={styles.stickyFooter}>
        <div className={styles.footerLeft}>
          <AnimatePresence>
            {unsaved && (
              <motion.span
                className={styles.unsavedIndicator}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{    opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Warning size={13} />
                Unsaved changes — click Save to apply
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className={styles.footerRight}>
          <Button
            kind="primary"
            renderIcon={Save}
            onClick={handleSave}
            disabled={saving || !unsaved}
            className={styles.saveBtn}
          >
            {saving ? 'SAVING…' : 'SAVE POLICY'}
          </Button>
        </div>
      </div>

      {/* ── Add Label Modal ── */}
      <ComposedModal
        open={addLabelOpen}
        onClose={() => { setAddLabelOpen(false); setLabelNameError(''); }}
        className={styles.modal}
      >
        <ModalHeader title="ADD CLASSIFICATION LABEL" className={styles.modalHeader} />
        <ModalBody className={styles.modalBody}>
          <TextInput
            id="new-label-name"
            labelText="LABEL NAME"
            placeholder="e.g. CONFIDENTIAL"
            value={newLabelName}
            onChange={(e) => { setNewLabelName(e.target.value.toUpperCase()); setLabelNameError(''); }}
            invalid={!!labelNameError}
            invalidText={labelNameError}
            className={styles.modalField}
            autoFocus
          />
          <div className={styles.modalFieldWrap}>
            <label className={styles.fieldLabel}>COLOUR INDICATOR</label>
            <Select
              id="new-label-color"
              labelText=""
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className={styles.modalSelect}
            >
              {COLOR_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value} text={c.label} />
              ))}
            </Select>
          </div>
          <div className={styles.modalToggleWrap}>
            <ToggleRow
              id="new-label-export"
              label="Allow Export"
              desc="Documents with this label may be exported outside the platform"
              checked={newLabelExport}
              onChange={setNewLabelExport}
            />
          </div>
        </ModalBody>
        <ModalFooter className={styles.modalFooter}>
          <Button kind="secondary" onClick={() => setAddLabelOpen(false)} className={styles.modalBtn}>CANCEL</Button>
          <Button kind="primary"   onClick={handleAddLabel}               className={styles.modalBtn}>ADD LABEL</Button>
        </ModalFooter>
      </ComposedModal>

      {/* ── Delete Label Confirm ── */}
      <ComposedModal
        open={!!deleteLabelTgt}
        onClose={() => setDeleteLabelTgt(null)}
        className={styles.modal}
        danger
      >
        <ModalHeader title="CONFIRM LABEL DELETION" className={styles.modalHeader} />
        <ModalBody className={styles.modalBody}>
          <p className={styles.confirmText}>
            Delete classification label{' '}
            <strong className={styles.confirmHighlight}>{deleteLabelTgt?.name}</strong>?
          </p>
          <p className={styles.confirmSub}>
            All cases, reports, and entities currently tagged with this label will lose their classification.
          </p>
        </ModalBody>
        <ModalFooter className={styles.modalFooter}>
          <Button kind="secondary" onClick={() => setDeleteLabelTgt(null)} className={styles.modalBtn}>CANCEL</Button>
          <Button kind="danger"    onClick={handleDeleteLabel}              className={styles.modalBtn}>DELETE</Button>
        </ModalFooter>
      </ComposedModal>

    </AnalystPageShell>
  );
};

export default PoliciesPage;