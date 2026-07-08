// src/presentation/pages/analyst/ReportsPage.tsx
// ILA OSINT — Reports Module (Day 8)
// Template selection → Config + Live Preview → Export → History table

import React, { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  Button,
  TextInput,
  Select,
  SelectItem,
  MultiSelect,
  ComboBox,
  DatePicker,
  DatePickerInput,
  InlineLoading,
  Tag,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Pagination,
  Accordion,
  AccordionItem,
  ToastNotification,
} from '@carbon/react';

import {
  Document,
  User,
  Folder,
  Warning,
  ChartNetwork,
  Edit,
  Download,
  View,
  TrashCan,
  Add,
  ArrowLeft,
  Checkmark,
  ChevronDown,
  ChevronUp,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import {
  pageFadeIn,
  pageFadeInTransition,
  tabFade,
  tabFadeTransition,
  
} from '../../../styles/motion';

import {
  useReports,
  MOCK_ENTITY_OPTIONS,
  MOCK_CASE_OPTIONS,
  type ReportTemplate,
  type ReportClassification,
  type ReportDistribution,
  type ReportConfig,
  type GeneratedReport,
} from '../../../hooks/useReports';

import styles from './ReportsPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Template catalogue
// ─────────────────────────────────────────────────────────────────

interface TemplateMeta {
  id:          ReportTemplate;
  name:        string;
  description: string;
  pages:       string;
  icon:        React.ReactNode;
}

const TEMPLATES: TemplateMeta[] = [
  { id: 'INTELLIGENCE_SUMMARY', name: 'Intelligence Summary',  description: 'Multi-source intelligence overview across entities and cases', pages: '4–8 pages',  icon: <Document size={28} /> },
  { id: 'ENTITY_PROFILE',       name: 'Entity Profile',        description: 'Deep-dive profile for a single entity with risk assessment',   pages: '3–5 pages',  icon: <User size={28} /> },
  { id: 'CASE_REPORT',          name: 'Case Report',           description: 'Full case lifecycle documentation with evidence and notes',     pages: '6–12 pages', icon: <Folder size={28} /> },
  { id: 'THREAT_ASSESSMENT',    name: 'Threat Assessment',     description: 'Structured threat rating with indicators and recommendations',  pages: '5–9 pages',  icon: <Warning size={28} /> },
  { id: 'NETWORK_ANALYSIS',     name: 'Network Analysis',      description: 'Graph-based relationship mapping and cluster identification',   pages: '4–7 pages',  icon: <ChartNetwork size={28} /> },
  { id: 'CUSTOM',               name: 'Custom Report',         description: 'Drag-and-drop section builder for tailored analyst reports',    pages: 'Variable',   icon: <Edit size={28} /> },
];

// ─────────────────────────────────────────────────────────────────
// Default config
// ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ReportConfig = {
  template:       'INTELLIGENCE_SUMMARY',
  title:          '',
  classification: 'UNCLASSIFIED',
  coverageFrom:   '',
  coverageTo:     '',
  entityIds:      [],
  caseIds:        [],
  preparedBy:     'ANL-007',
  distribution:   'INTERNAL',
  sections:       ['Executive Summary', 'Entity List', 'Alert Summary', 'Timeline', 'Analyst Notes'],
};

const ALL_SECTIONS = [
  'Executive Summary', 'Entity List', 'Alert Summary',
  'Graph Snapshot', 'Timeline', 'Analyst Notes', 'Appendix',
];

// ─────────────────────────────────────────────────────────────────
// Classification colour helper
// ─────────────────────────────────────────────────────────────────

function classTag(c: ReportClassification): { type: 'green' | 'red' | 'purple' | 'magenta'; label: string } {
  switch (c) {
    case 'UNCLASSIFIED': return { type: 'green',   label: 'UNCLASSIFIED' };
    case 'RESTRICTED':   return { type: 'red',     label: 'RESTRICTED' };
    case 'CONFIDENTIAL': return { type: 'magenta', label: 'CONFIDENTIAL' };
    case 'SECRET':       return { type: 'red',     label: 'SECRET' };
  }
}

// ─────────────────────────────────────────────────────────────────
// Table header definitions
// ─────────────────────────────────────────────────────────────────

const TABLE_HEADERS = [
  { key: 'id',             header: 'REPORT ID' },
  { key: 'title',          header: 'TITLE' },
  { key: 'type',           header: 'TYPE' },
  { key: 'classification', header: 'CLASSIFICATION' },
  { key: 'generatedAt',    header: 'GENERATED' },
  { key: 'by',             header: 'BY' },
  { key: 'format',         header: 'FORMAT' },
  { key: 'actions',        header: 'ACTIONS' },
];

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

type Step = 'select' | 'configure';

const ReportsPage: React.FC = () => {
  const { reports, isLoadingReports, generateReport, isGenerating, lastGenerated, resetGenerate } = useReports();

  const [step,            setStep]            = useState<Step>('select');
  const [selectedTpl,    setSelectedTpl]      = useState<TemplateMeta | null>(null);
  const [config,          setConfig]           = useState<ReportConfig>({ ...DEFAULT_CONFIG });
  const [showToast,       setShowToast]        = useState(false);
  const [page,            setPage]             = useState(1);
  const [pageSize,        setPageSize]         = useState(10);
  const [historyOpen,     setHistoryOpen]      = useState(true);
  const [newSection,      setNewSection]       = useState('');

  // ── Patch config ──────────────────────────────────────────────
  const patch = useCallback(<K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Select template ───────────────────────────────────────────
  const selectTemplate = useCallback((tpl: TemplateMeta) => {
    setSelectedTpl(tpl);
    setConfig({ ...DEFAULT_CONFIG, template: tpl.id, title: `${tpl.name} — ${new Date().toISOString().slice(0, 10)}` });
    setStep('configure');
  }, []);

  // ── Generate ──────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!config.title.trim()) return;
    try {
      await generateReport(config);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5_000);
    } catch { /* handled by mutation */ }
  }, [config, generateReport]);

  // ── Paginated history ─────────────────────────────────────────
  const pagedReports = useMemo((): GeneratedReport[] => {
    const start = (page - 1) * pageSize;
    return reports.slice(start, start + pageSize);
  }, [reports, page, pageSize]);

  // ── Table rows ────────────────────────────────────────────────
  const tableRows = useMemo(() =>
    pagedReports.map((r) => ({ ...r, id: r.id })),
  [pagedReports]);

  // ── Live preview sections ──────────────────────────────────────
  const previewSections = config.sections ?? ALL_SECTIONS;

  // ─────────────────────────────────────────────────────────────
  // Actions slot (header right)
  // ─────────────────────────────────────────────────────────────
  const headerActions = (
    <div className={styles.headerActions}>
      {step === 'configure' && (
        <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={() => setStep('select')}>
          Back to Templates
        </Button>
      )}
      <span className={styles.statChip}>{reports.length} reports</span>
      <div className={styles.liveDot} />
      <span className={styles.liveLabel}>LIVE</span>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <AnalystPageShell title="Reports" actions={headerActions}>
      <div className={styles.layout}>

        {/* ── Toast ── */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              className={styles.toastWrap}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
            >
              <ToastNotification
                kind="success"
                title="Report generated"
                subtitle={`${lastGenerated?.id ?? ''} · Download ready`}
                timeout={0}
                onClose={() => { setShowToast(false); resetGenerate(); }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════ */}
        {/* STEP 1 — TEMPLATE SELECTION                         */}
        {/* ════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div
              key="select"
              className={styles.selectStep}
              variants={pageFadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageFadeInTransition}
            >
              <p className={styles.selectHint}>
                Select a report template to begin. Templates pre-configure sections and formatting.
              </p>
              <div className={styles.templateGrid}>
                {TEMPLATES.map((tpl, i) => (
                  <motion.div
                    key={tpl.id}
                    className={styles.templateTile}
                    onClick={() => selectTemplate(tpl)}
                    initial={{ opacity: 0, scale: 0.97, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: i * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={styles.tileIcon}>{tpl.icon}</div>
                    <div className={styles.tileName}>{tpl.name.toUpperCase()}</div>
                    <div className={styles.tileDesc}>{tpl.description}</div>
                    <div className={styles.tileFooter}>
                      <Tag type="outline" size="sm">{tpl.pages}</Tag>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════ */}
          {/* STEP 2 — CONFIG + LIVE PREVIEW                    */}
          {/* ══════════════════════════════════════════════════ */}
          {step === 'configure' && (
            <motion.div
              key="configure"
              className={styles.configureStep}
              variants={pageFadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageFadeInTransition}
            >
              {/* ── LEFT: Config panel ── */}
              <div className={styles.configPanel}>
                <div className={styles.configHeader}>
                  <div className={styles.configHeaderIcon}>{selectedTpl?.icon}</div>
                  <div>
                    <div className={styles.configHeaderName}>{selectedTpl?.name.toUpperCase()}</div>
                    <div className={styles.configHeaderDesc}>{selectedTpl?.description}</div>
                  </div>
                </div>

                <div className={styles.configForm}>

                  {/* ── STANDARD FORM (non-custom) ── */}
                  {config.template !== 'CUSTOM' && (
                    <>
                      <TextInput
                        id="rpt-title"
                        labelText="Report Title"
                        placeholder="Enter report title…"
                        value={config.title}
                        onChange={(e) => patch('title', e.target.value)}
                      />

                      <Select
                        id="rpt-classification"
                        labelText="Classification"
                        value={config.classification}
                        onChange={(e) => patch('classification', e.target.value as ReportClassification)}
                      >
                        <SelectItem value="UNCLASSIFIED" text="UNCLASSIFIED" />
                        <SelectItem value="RESTRICTED"   text="RESTRICTED" />
                        <SelectItem value="CONFIDENTIAL" text="CONFIDENTIAL" />
                        <SelectItem value="SECRET"       text="SECRET" />
                      </Select>

                      <DatePicker
                        datePickerType="range"
                        dateFormat="Y-m-d"
                        onChange={(dates) => {
                          if (dates[0]) patch('coverageFrom', dates[0].toISOString().slice(0, 10));
                          if (dates[1]) patch('coverageTo',   dates[1].toISOString().slice(0, 10));
                        }}
                      >
                        <DatePickerInput id="rpt-date-from" placeholder="YYYY-MM-DD" labelText="Coverage From" />
                        <DatePickerInput id="rpt-date-to"   placeholder="YYYY-MM-DD" labelText="Coverage To" />
                      </DatePicker>

                      <MultiSelect
                        id="rpt-entities"
                        titleText="Include Entities"
                        label="Select entities…"
                        items={MOCK_ENTITY_OPTIONS}
                        itemToString={(item) => item?.text ?? ''}
                        onChange={({ selectedItems }) =>
                          patch('entityIds', (selectedItems ?? []).map((i) => i.id))
                        }
                      />

                      <MultiSelect
                        id="rpt-cases"
                        titleText="Include Cases"
                        label="Select cases…"
                        items={MOCK_CASE_OPTIONS}
                        itemToString={(item) => item?.text ?? ''}
                        onChange={({ selectedItems }) =>
                          patch('caseIds', (selectedItems ?? []).map((i) => i.id))
                        }
                      />

                      <ComboBox
                        id="rpt-prepared-by"
                        titleText="Prepared By"
                        placeholder="Analyst name…"
                        items={['ANL-007', 'ANL-003', 'ANL-011']}
                        selectedItem={config.preparedBy}
                        onChange={({ selectedItem }) => patch('preparedBy', selectedItem ?? 'ANL-007')}
                        itemToString={(item) => item ?? ''}
                      />

                      <Select
                        id="rpt-distribution"
                        labelText="Distribution"
                        value={config.distribution}
                        onChange={(e) => patch('distribution', e.target.value as ReportDistribution)}
                      >
                        <SelectItem value="INTERNAL"     text="INTERNAL" />
                        <SelectItem value="RESTRICTED"   text="RESTRICTED" />
                        <SelectItem value="NEED_TO_KNOW" text="NEED TO KNOW" />
                      </Select>
                    </>
                  )}

                  {/* ── CUSTOM TEMPLATE: Section builder ── */}
                  {config.template === 'CUSTOM' && (
                    <div className={styles.sectionBuilder}>
                      <div className={styles.sectionBuilderHdr}>
                        Section Builder — drag to reorder
                      </div>
                      <Accordion>
                        {(config.sections ?? []).map((sec, idx) => (
                          <AccordionItem key={`${sec}-${idx}`} title={sec}>
                            <p className={styles.sectionHint}>
                              Configure layout and content options for the "{sec}" section.
                            </p>
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              onClick={() => patch('sections', (config.sections ?? []).filter((_, i) => i !== idx))}
                            >
                              Remove section
                            </Button>
                          </AccordionItem>
                        ))}
                      </Accordion>
                      <div className={styles.addSectionRow}>
                        <TextInput
                          id="new-section"
                          labelText=""
                          placeholder="New section name…"
                          value={newSection}
                          onChange={(e) => setNewSection(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newSection.trim()) {
                              patch('sections', [...(config.sections ?? []), newSection.trim()]);
                              setNewSection('');
                            }
                          }}
                        />
                        <Button
                          kind="tertiary"
                          size="sm"
                          renderIcon={Add}
                          onClick={() => {
                            if (newSection.trim()) {
                              patch('sections', [...(config.sections ?? []), newSection.trim()]);
                              setNewSection('');
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Export actions ── */}
                <div className={styles.exportBar}>
                  <Button
                    kind="primary"
                    size="md"
                    onClick={handleGenerate}
                    disabled={isGenerating || !config.title.trim()}
                    className={styles.generateBtn}
                  >
                    {isGenerating
                      ? <InlineLoading description="Generating…" />
                      : <><Checkmark size={16} /> GENERATE REPORT</>
                    }
                  </Button>
                  <div className={styles.exportSecondary}>
                    <Button kind="ghost" size="sm" renderIcon={Download}>EXPORT PDF</Button>
                    <Button kind="ghost" size="sm" renderIcon={Download}>EXPORT DOCX</Button>
                    <Button kind="ghost" size="sm" renderIcon={Download}>EXPORT JSON</Button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Live preview ── */}
              <div className={styles.previewPanel}>
                <div className={styles.previewLabel}>LIVE PREVIEW</div>
                <div className={styles.previewDoc}>
                  {/* Classification banner */}
                  <div className={`${styles.classificationBanner} ${
                    config.classification === 'UNCLASSIFIED'
                      ? styles.bannerGreen
                      : styles.bannerRed
                  }`}>
                    {config.classification}
                  </div>

                  {/* Report header */}
                  <div className={styles.docHeader}>
                    <div className={styles.docOrg}>ILA OSINT — INTELLIGENCE & LINK ANALYSIS</div>
                    <div className={styles.docTitle}>{config.title || 'Report Title'}</div>
                    <div className={styles.docMeta}>
                      <span>Prepared by: {config.preparedBy}</span>
                      <span>·</span>
                      <span>{new Date().toISOString().slice(0, 10)}</span>
                      <span>·</span>
                      <span>Distribution: {config.distribution.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {/* Body sections */}
                  <div className={styles.docBody}>
                    {previewSections.map((sec) => (
                      <div key={sec} className={styles.docSection}>
                        <div className={styles.docSectionTitle}>{sec.toUpperCase()}</div>
                        {sec === 'Executive Summary' && (
                          <p className={styles.docSectionBody}>
                            This intelligence report covers the period {config.coverageFrom || 'TBD'} to {config.coverageTo || 'TBD'}.
                            Analysis draws on OSINT, SIGINT, and HUMINT sources across {config.entityIds.length} entities
                            linked to {config.caseIds.length} active cases.
                          </p>
                        )}
                        {sec === 'Entity List' && (
                          <div className={styles.docEntityList}>
                            {config.entityIds.length > 0
                              ? MOCK_ENTITY_OPTIONS
                                  .filter((e) => config.entityIds.includes(e.id))
                                  .map((e) => (
                                    <div key={e.id} className={styles.docEntityRow}>
                                      <span className={styles.docEntityId}>{e.id}</span>
                                      <span>{e.text}</span>
                                    </div>
                                  ))
                              : <span className={styles.docPlaceholder}>No entities selected.</span>
                            }
                          </div>
                        )}
                        {sec === 'Alert Summary' && (
                          <p className={styles.docSectionBody}>
                            No active alert overrides. See linked case alerts for full breakdown.
                          </p>
                        )}
                        {sec === 'Timeline' && (
                          <div className={styles.docTimelinePlaceholder}>
                            Timeline visualization will render in exported document.
                          </div>
                        )}
                        {sec === 'Analyst Notes' && (
                          <p className={styles.docSectionBody}>
                            [Analyst annotations and observations will appear here.]
                          </p>
                        )}
                        {!['Executive Summary','Entity List','Alert Summary','Timeline','Analyst Notes'].includes(sec) && (
                          <p className={styles.docSectionBody}>
                            Section content will be auto-populated on generation.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className={styles.docFooter}>
                    <span>ILA OSINT · CASE MANAGEMENT SYSTEM</span>
                    <span>{config.classification}</span>
                    <span>PAGE 1 OF —</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════ */}
        {/* REPORT HISTORY TABLE                                */}
        {/* ════════════════════════════════════════════════════ */}
        <div className={styles.historySection}>
          <button
            className={styles.historyToggle}
            onClick={() => setHistoryOpen((p) => !p)}
            type="button"
          >
            <span className={styles.historyToggleLabel}>
              REPORT HISTORY
              <span className={styles.historyCount}>{reports.length}</span>
            </span>
            {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          <AnimatePresence>
            {historyOpen && (
              <motion.div
                key="history-table"
                variants={tabFade}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabFadeTransition}
              >
                <TableContainer className={styles.tableContainer}>
                  <Table size="sm" className={styles.reportTable}>
                    <TableHead>
                      <TableRow>
                        {TABLE_HEADERS.map((h) => (
                          <TableHeader key={h.key} className={styles.th}>{h.header}</TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {isLoadingReports ? (
                        <TableRow>
                          <TableCell colSpan={8} className={styles.loadingCell}>
                            <InlineLoading description="Loading reports…" />
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableRows.map((row) => {
                          const ct = classTag(row.classification as ReportConfig['classification']);
                          return (
                            <TableRow key={row.id} className={styles.tableRow}>
                              <TableCell className={styles.tdId}>{row.id}</TableCell>
                              <TableCell className={styles.tdTitle}>{row.title}</TableCell>
                              <TableCell>
                                <span className={styles.typeLabel}>
                                  {row.type.replace(/_/g, ' ')}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Tag type={ct.type} size="sm">{ct.label}</Tag>
                              </TableCell>
                              <TableCell className={styles.tdMono}>{row.generatedAt}</TableCell>
                              <TableCell className={styles.tdMono}>{row.by}</TableCell>
                              <TableCell>
                                <Tag type="blue" size="sm">{row.format}</Tag>
                              </TableCell>
                              <TableCell>
                                <div className={styles.rowActions}>
                                  <Button kind="ghost" size="sm" renderIcon={Download} hasIconOnly iconDescription="Download" />
                                  <Button kind="ghost" size="sm" renderIcon={View}     hasIconOnly iconDescription="View" />
                                  <Button kind="danger--ghost" size="sm" renderIcon={TrashCan} hasIconOnly iconDescription="Delete" />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Pagination
                  totalItems={reports.length}
                  pageSize={pageSize}
                  pageSizes={[10, 25, 50]}
                  page={page}
                  onChange={({ page: p, pageSize: ps }) => { setPage(p); setPageSize(ps); }}
                  className={styles.pagination}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </AnalystPageShell>
  );
};

export default ReportsPage;