// src/presentation/pages/analyst/CaseManagementPage.tsx
// ILA OSINT — Case Management Page
// Two-pane layout: case list (left) + case detail drawer (right)

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Button,
  Search,
  Tag,
  ContentSwitcher,
  Switch,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableBatchActions,
  TableBatchAction,
  TableSelectAll,
  TableSelectRow,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
  ProgressIndicator,
  ProgressStep,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  TextArea,
  Select,
  SelectItem,
  InlineLoading,
} from '@carbon/react';
import {
  Add,
  Close,
  ChevronRight,
  User,
  Link,
  DocumentBlank,
  Checkmark,
  Flag,
  ArrowRight,
  CheckmarkFilled,
  Renew,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import NoteThread from '../../../components/analyst/NoteThread/NoteThread';
import {
  useCases,
  type Case,
  type CasePriority,
  type CaseStatus,
  type StatusTab,
} from '../../../hooks/useCases';
import styles from './CaseManagementPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<CasePriority, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: 'rgba(250,77,86,0.12)',  color: '#ff6b6b', border: 'rgba(250,77,86,0.3)'  },
  HIGH:     { bg: 'rgba(255,131,137,0.1)', color: '#ffa07a', border: 'rgba(255,131,137,0.3)' },
  MEDIUM:   { bg: 'rgba(241,194,27,0.1)',  color: '#c8a430', border: 'rgba(241,194,27,0.3)'  },
  LOW:      { bg: 'rgba(36,161,72,0.1)',   color: '#4adb8a', border: 'rgba(36,161,72,0.3)'   },
};

const STATUS_TAG: Record<CaseStatus, { type: 'outline' | 'green' | 'warm-gray' | 'purple' | 'cool-gray'; label: string }> = {
  DRAFT:          { type: 'outline',   label: 'DRAFT'          },
  ACTIVE:         { type: 'green',     label: 'ACTIVE'         },
  PENDING_REVIEW: { type: 'warm-gray', label: 'PENDING REVIEW' },
  CLOSED:         { type: 'purple',    label: 'CLOSED'         },
  ARCHIVED:       { type: 'cool-gray', label: 'ARCHIVED'       },
};

const ENTITY_TYPE_COLOR: Record<string, string> = {
  PERSON:       '#4589ff',
  ORGANIZATION: '#00a3c7',
  LOCATION:     '#42be65',
  VESSEL:       '#22d3ee',
  FINANCIAL:    '#f1c21b',
};

const ALERT_SEV_COLOR: Record<string, string> = {
  CRITICAL: '#ff6b6b',
  HIGH:     '#ffa07a',
  MEDIUM:   '#c8a430',
};

const TABLE_HEADERS = [
  { key: 'id',       header: 'CASE ID'    },
  { key: 'title',    header: 'TITLE'      },
  { key: 'priority', header: 'PRIORITY'   },
  { key: 'status',   header: 'STATUS'     },
  { key: 'entities', header: 'ENTITIES'   },
  { key: 'tasks',    header: 'TASKS'      },
  { key: 'assigned', header: 'ASSIGNED'   },
  { key: 'updated',  header: 'UPDATED'    },
];

const STATUS_TABS = [
  { key: 'ALL',           label: 'ALL'            },
  { key: 'DRAFT',         label: 'DRAFT'          },
  { key: 'ACTIVE',        label: 'ACTIVE'         },
  { key: 'PENDING_REVIEW',label: 'PENDING REVIEW' },
  { key: 'CLOSED',        label: 'CLOSED'         },
  { key: 'ARCHIVED',      label: 'ARCHIVED'       },
];

const AVATAR_CLASS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: styles.avatarA,
  b: styles.avatarB,
  c: styles.avatarC,
  d: styles.avatarD,
};

// ─────────────────────────────────────────────────────────────────
// Priority Badge
// ─────────────────────────────────────────────────────────────────

const PriorityBadge: React.FC<{ priority: CasePriority }> = ({ priority }) => {
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        borderRadius: 2,
        padding: '1px 7px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.07em',
        whiteSpace: 'nowrap',
      }}
    >
      {priority}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────
// Task Progress Bar
// ─────────────────────────────────────────────────────────────────

const TaskProgress: React.FC<{ done: number; total: number }> = ({ done, total }) => {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const color = pct === 100 ? '#4adb8a' : pct >= 60 ? '#c8a430' : '#4a8fa8';
  return (
    <div className={styles.taskProgress}>
      <div className={styles.taskBar}>
        <div className={styles.taskFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.taskLabel}>{done}/{total}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// New Case Modal
// ─────────────────────────────────────────────────────────────────

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (title: string, priority: CasePriority) => void;
}

const NewCaseModal: React.FC<NewCaseModalProps> = ({ open, onClose, onSubmit }) => {
  const [title,    setTitle]    = useState('');
  const [priority, setPriority] = useState<CasePriority>('HIGH');
  const [saving,   setSaving]   = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    onSubmit(title.trim(), priority);
    setSaving(false);
    setTitle('');
    setPriority('HIGH');
    onClose();
  };

  return (
    <ComposedModal open={open} onClose={onClose} className={styles.modal}>
      <ModalHeader title="NEW INTELLIGENCE CASE" className={styles.modalHeader} />
      <ModalBody className={styles.modalBody}>
        <TextInput
          id="case-title"
          labelText="CASE TITLE"
          placeholder="e.g. Operation Night Hawk — Infrastructure Recon"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={styles.modalField}
        />
        <Select
          id="case-priority"
          labelText="PRIORITY CLASSIFICATION"
          value={priority}
          onChange={(e) => setPriority(e.target.value as CasePriority)}
          className={styles.modalField}
        >
          <SelectItem value="CRITICAL" text="CRITICAL" />
          <SelectItem value="HIGH"     text="HIGH"     />
          <SelectItem value="MEDIUM"   text="MEDIUM"   />
          <SelectItem value="LOW"      text="LOW"      />
        </Select>
        <Select id="case-classification" labelText="CLASSIFICATION" className={styles.modalField}>
          <SelectItem value="UNCLASSIFIED"       text="UNCLASSIFIED" />
          <SelectItem value="SECRET"             text="SECRET" />
          <SelectItem value="SECRET_NOFORN"      text="SECRET // NOFORN" />
          <SelectItem value="TOP_SECRET"         text="TOP SECRET" />
          <SelectItem value="TOP_SECRET_SCI"     text="TOP SECRET // SCI" />
        </Select>
        <TextArea
          id="case-brief"
          labelText="INITIAL BRIEF (optional)"
          placeholder="Provide initial intelligence assessment…"
          rows={3}
          className={styles.modalField}
        />
      </ModalBody>
      <ModalFooter className={styles.modalFooter}>
        <Button kind="secondary" onClick={onClose} className={styles.modalBtn}>
          CANCEL
        </Button>
        <Button
          kind="primary"
          onClick={handleSubmit}
          disabled={!title.trim() || saving}
          className={styles.modalBtn}
        >
          {saving ? <InlineLoading description="Creating…" status="active" /> : 'CREATE CASE'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
};

// ─────────────────────────────────────────────────────────────────
// Case Detail Drawer
// ─────────────────────────────────────────────────────────────────

interface CaseDetailDrawerProps {
  caseData: Case;
  onClose: () => void;
  onUpdateStatus: (id: string, status: CaseStatus) => void;
  onAddNote: (id: string, text: string) => void;
  onToggleTask: (caseId: string, taskId: string) => void;
  onAddTask: (caseId: string, text: string) => void;
}

const CaseDetailDrawer: React.FC<CaseDetailDrawerProps> = ({
  caseData,
  onClose,
  onUpdateStatus,
  onAddNote,
  onToggleTask,
  onAddTask,
}) => {
  const [newTaskText, setNewTaskText] = useState('');
  const [justDone,    setJustDone]    = useState<string | null>(null);

  const handleToggleTask = (taskId: string) => {
    const task = caseData.taskList.find((t) => t.id === taskId);
    if (task && !task.done) {
      setJustDone(taskId);
      setTimeout(() => setJustDone(null), 900);
    }
    onToggleTask(caseData.id, taskId);
  };

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;
    onAddTask(caseData.id, newTaskText.trim());
    setNewTaskText('');
  };

  const statusInfo = STATUS_TAG[caseData.status];

  // Lifecycle steps
  const STATUS_STEPS: CaseStatus[] = ['DRAFT', 'ACTIVE', 'PENDING_REVIEW', 'CLOSED', 'ARCHIVED'];
  const currentStepIdx = STATUS_STEPS.indexOf(caseData.status);

  return (
    <motion.aside
      className={styles.drawer}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* ── Drawer Header ── */}
      <div className={styles.drawerHeader}>
        <div className={styles.drawerTop}>
          <div className={styles.drawerMeta}>
            <span className={styles.drawerCaseId}>{caseData.id}</span>
            <span className={styles.drawerClassification}>{caseData.classification}</span>
          </div>
          <button className={styles.drawerClose} onClick={onClose} aria-label="Close">
            <Close size={16} />
          </button>
        </div>

        <h2 className={styles.drawerTitle}>{caseData.title}</h2>

        <div className={styles.drawerTags}>
          <PriorityBadge priority={caseData.priority} />
          <Tag
            type={statusInfo.type as 'outline' | 'green' | 'warm-gray' | 'purple' | 'cool-gray'}
            size="sm"
            className={styles.statusTag}
          >
            {statusInfo.label}
          </Tag>

          <Button size="sm" kind="ghost" renderIcon={ArrowRight} className={styles.openFullBtn}>
            OPEN FULL
          </Button>
        </div>

        {/* Status transition buttons */}
        <div className={styles.statusActions}>
          {caseData.status === 'DRAFT' && (
            <Button size="sm" kind="primary" onClick={() => onUpdateStatus(caseData.id, 'ACTIVE')} className={styles.statusBtn}>
              ACTIVATE
            </Button>
          )}
          {caseData.status === 'ACTIVE' && (
            <Button size="sm" kind="tertiary" onClick={() => onUpdateStatus(caseData.id, 'PENDING_REVIEW')} className={styles.statusBtn}>
              SUBMIT FOR REVIEW
            </Button>
          )}
          {caseData.status === 'PENDING_REVIEW' && (
            <Button size="sm" kind="primary" onClick={() => onUpdateStatus(caseData.id, 'CLOSED')} className={styles.statusBtn}>
              CLOSE CASE
            </Button>
          )}
          {caseData.status === 'CLOSED' && (
            <Button size="sm" kind="ghost" onClick={() => onUpdateStatus(caseData.id, 'ARCHIVED')} className={styles.statusBtn}>
              ARCHIVE
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={styles.drawerTabs}>
        <Tabs>
          <TabList aria-label="Case detail tabs" contained className={styles.tabList}>
            <Tab className={styles.tab}>Overview</Tab>
            <Tab className={styles.tab}>Entities</Tab>
            <Tab className={styles.tab}>Alerts</Tab>
            <Tab className={styles.tab}>Notes</Tab>
            <Tab className={styles.tab}>Tasks</Tab>
            <Tab className={styles.tab}>History</Tab>
          </TabList>

          <TabPanels>

            {/* ── OVERVIEW ── */}
            <TabPanel className={styles.tabPanel}>
              {/* Lifecycle progress */}
              <div className={styles.section}>
                <p className={styles.sectionLabel}>CASE LIFECYCLE</p>
                <ProgressIndicator
                  currentIndex={currentStepIdx}
                  className={styles.lifecycle}
                  spaceEqually
                >
                  {STATUS_STEPS.map((s) => (
                    <ProgressStep key={s} label={s.replace('_', ' ')} className={styles.lifecycleStep} />
                  ))}
                </ProgressIndicator>
              </div>

              {/* Metadata grid */}
              <div className={styles.section}>
                <p className={styles.sectionLabel}>CASE METADATA</p>
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}><span className={styles.metaKey}>ASSIGNED</span><span className={styles.metaVal}>{caseData.assigned}</span></div>
                  <div className={styles.metaItem}><span className={styles.metaKey}>ENTITIES</span><span className={styles.metaVal}>{caseData.entities}</span></div>
                  <div className={styles.metaItem}><span className={styles.metaKey}>CREATED</span><span className={styles.metaVal}>{caseData.created}</span></div>
                  <div className={styles.metaItem}><span className={styles.metaKey}>UPDATED</span><span className={styles.metaVal}>{caseData.updatedFull}</span></div>
                  <div className={styles.metaItem}><span className={styles.metaKey}>PRIORITY</span><PriorityBadge priority={caseData.priority} /></div>
                  <div className={styles.metaItem}><span className={styles.metaKey}>TASKS</span><span className={styles.metaVal}>{caseData.tasks.done}/{caseData.tasks.total} done</span></div>
                </div>
              </div>

              {/* Brief */}
              <div className={styles.section}>
                <div className={styles.sectionLabelRow}>
                  <p className={styles.sectionLabel}>INTELLIGENCE BRIEF</p>
                  <button className={styles.editBriefBtn}><DocumentBlank size={12} /> EDIT</button>
                </div>
                <p className={styles.brief}>{caseData.brief || 'No brief recorded.'}</p>
              </div>
            </TabPanel>

            {/* ── ENTITIES ── */}
            <TabPanel className={styles.tabPanel}>
              <div className={styles.tabToolbar}>
                <p className={styles.sectionLabel}>{caseData.entityList.length} LINKED ENTITIES</p>
                <button className={styles.addBtn}><Add size={12} /> ADD ENTITY</button>
              </div>
              <StructuredListWrapper aria-label="Entities" className={styles.structList}>
                <StructuredListHead>
                  <StructuredListRow head>
                    <StructuredListCell head>ENTITY ID</StructuredListCell>
                    <StructuredListCell head>NAME / TYPE</StructuredListCell>
                    <StructuredListCell head>RISK</StructuredListCell>
                  </StructuredListRow>
                </StructuredListHead>
                <StructuredListBody>
                  {caseData.entityList.map((ent) => (
                    <StructuredListRow key={ent.id} className={styles.structRow}>
                      <StructuredListCell className={styles.monoCell}>{ent.id}</StructuredListCell>
                      <StructuredListCell>
                        <div className={styles.entityCell}>
                          <span className={styles.entityDot} style={{ background: ENTITY_TYPE_COLOR[ent.type] ?? '#64748b' }} />
                          <div>
                            <div className={styles.entityName}>{ent.name}</div>
                            <div className={styles.entityType}>{ent.type}</div>
                          </div>
                        </div>
                      </StructuredListCell>
                      <StructuredListCell>
                        <span className={styles.riskChip} style={{
                          color: ent.riskLevel === 'HIGH_RISK' ? '#ff6b6b' : ent.riskLevel === 'MEDIUM' ? '#c8a430' : '#4adb8a',
                          borderColor: ent.riskLevel === 'HIGH_RISK' ? 'rgba(250,77,86,0.3)' : ent.riskLevel === 'MEDIUM' ? 'rgba(241,194,27,0.3)' : 'rgba(36,161,72,0.3)',
                        }}>
                          {ent.riskLevel.replace('_', ' ')}
                        </span>
                      </StructuredListCell>
                    </StructuredListRow>
                  ))}
                  {caseData.entityList.length === 0 && (
                    <StructuredListRow>
                      <StructuredListCell className={styles.emptyCell}>No entities linked.</StructuredListCell>
                    </StructuredListRow>
                  )}
                </StructuredListBody>
              </StructuredListWrapper>
            </TabPanel>

            {/* ── ALERTS ── */}
            <TabPanel className={styles.tabPanel}>
              <div className={styles.tabToolbar}>
                <p className={styles.sectionLabel}>{caseData.alerts.length} LINKED ALERTS</p>
                <button className={styles.addBtn}><Link size={12} /> LINK ALERT</button>
              </div>
              {caseData.alerts.length === 0 ? (
                <div className={styles.emptyState}>
                  <CheckmarkFilled size={20} style={{ fill: '#24a148' }} />
                  <p>No alerts linked</p>
                </div>
              ) : (
                <div className={styles.alertList}>
                  {caseData.alerts.map((alt) => (
                    <div key={alt.id} className={styles.alertRow}>
                      <div
                        className={styles.alertSevBar}
                        style={{ background: ALERT_SEV_COLOR[alt.severity] ?? '#4a8fa8' }}
                      />
                      <div className={styles.alertInfo}>
                        <span className={styles.alertTitle}>{alt.title}</span>
                        <span className={styles.alertMeta}>{alt.id} · {alt.time}</span>
                      </div>
                      <span className={styles.alertSevChip} style={{ color: ALERT_SEV_COLOR[alt.severity] }}>
                        {alt.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabPanel>

            {/* ── NOTES ── */}
            <TabPanel className={styles.tabPanel}>
              <NoteThread
                notes={caseData.notes}
                onAddNote={(text) => onAddNote(caseData.id, text)}
              />
            </TabPanel>

            {/* ── TASKS ── */}
            <TabPanel className={styles.tabPanel}>
              <div className={styles.tabToolbar}>
                <p className={styles.sectionLabel}>
                  {caseData.tasks.done}/{caseData.tasks.total} TASKS COMPLETE
                </p>
              </div>

              <div className={styles.taskList}>
                <AnimatePresence>
                  {caseData.taskList.map((task) => (
                    <motion.div
                      key={task.id}
                      className={`${styles.taskRow} ${task.done ? styles.taskDone : ''} ${justDone === task.id ? styles.taskFlash : ''}`}
                      layout
                    >
                      <button
                        className={`${styles.taskCheck} ${task.done ? styles.taskChecked : ''}`}
                        onClick={() => handleToggleTask(task.id)}
                        aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {task.done && <Checkmark size={10} />}
                      </button>
                      <span className={styles.taskText}>{task.text}</span>
                      <span className={styles.taskAssignee}>{task.assignee}</span>
                      <span className={styles.taskDue}>{task.dueDate}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Add task input */}
              <div className={styles.addTaskRow}>
                <input
                  className={styles.addTaskInput}
                  placeholder="Add task…"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
                />
                <button
                  className={styles.addTaskBtn}
                  onClick={handleAddTask}
                  disabled={!newTaskText.trim()}
                >
                  <Add size={14} />
                </button>
              </div>
            </TabPanel>

            {/* ── HISTORY ── */}
            <TabPanel className={styles.tabPanel}>
              <p className={styles.sectionLabel} style={{ marginBottom: '12px' }}>AUDIT TRAIL</p>
              <div className={styles.historyList}>
                {caseData.history.map((h, i) => (
                  <div key={h.id} className={styles.historyRow}>
                    <div className={styles.historyLeft}>
                      <div className={styles.historyDot} style={{ background: h.color, boxShadow: `0 0 6px ${h.color}66` }} />
                      {i < caseData.history.length - 1 && <div className={styles.historyLine} />}
                    </div>
                    <div className={styles.historyContent}>
                      <span className={styles.historyAction}>{h.action}</span>
                      <span className={styles.historyMeta}>{h.analyst} · {h.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabPanel>

          </TabPanels>
        </Tabs>
      </div>

      {/* ── Drawer Footer ── */}
      <div className={styles.drawerFooter}>
        <Button size="sm" kind="primary"       renderIcon={DocumentBlank} className={styles.footBtn}>ADD TO CASE</Button>
        <Button size="sm" kind="ghost"         renderIcon={User}          className={styles.footBtn}>OPEN ENTITY</Button>
        <Button size="sm" kind="danger--ghost" renderIcon={Flag}          className={styles.footBtn}>FLAG</Button>
      </div>
    </motion.aside>
  );
};

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────

const CaseManagementPage: React.FC = () => {
  const {
    cases,
    selectedCase,
    selectedCaseId,
    searchQuery,
    page,
    totalPages,
    totalCount,

    selectCase,
    setStatusTab,
    setSearchQuery,
    setPage,
    updateStatus,
    addNote,
    toggleTask,
    addTask,
    addCase,
  } = useCases();

  const [modalOpen, setModalOpen] = useState(false);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'n' || e.key === 'N') setModalOpen(true);
      if (e.key === 'Escape') selectCase('');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectCase]);

  // ── Table rows ──────────────────────────────────────────────
  const tableRows = cases.map((c) => ({
    id:       c.id,
    title:    c.title,
    priority: c.priority,
    status:   c.status,
    entities: c.entities,
    tasks:    c.tasks,
    assigned: { name: c.assigned, initials: c.assignedInit, key: c.avatarKey },
    updated:  c.updated,
    _case:    c,
  }));

  const headerActions = (
    <div className={styles.headerRight}>
      <span className={styles.caseCount}>{totalCount} cases</span>
      <Button
        size="sm"
        kind="primary"
        renderIcon={Add}
        onClick={() => setModalOpen(true)}
        className={styles.newCaseBtn}
      >
        NEW CASE
      </Button>
    </div>
  );

  return (
    <AnalystPageShell title="CASE MANAGEMENT" actions={headerActions}>
      <div className={styles.pageLayout}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANE — Case List
        ══════════════════════════════════════════════════════ */}
        <div className={`${styles.leftPane} ${selectedCase ? styles.leftPaneNarrow : ''}`}>

          {/* Status switcher */}
          <div className={styles.statusSwitcher}>
            <ContentSwitcher
              onChange={({ name }) => { setStatusTab(name as StatusTab); setPage(1); }}
              size="sm"
              className={styles.switcher}
            >
              {STATUS_TABS.map((t) => (
                <Switch key={t.key} name={t.key} text={t.label} />
              ))}
            </ContentSwitcher>
          </div>

          {/* DataTable */}
          <div className={styles.tableWrap}>
            <DataTable rows={tableRows} headers={TABLE_HEADERS} isSortable>
              {(renderProps: any) => {
                const {
                  rows,
                  headers,
                  getTableProps,
                  getHeaderProps,
                  getRowProps,
                  getToolbarProps,
                  getBatchActionProps,
                  getSelectionProps,
                } = renderProps;

                return (
                  <TableContainer className={styles.tableContainer}>
                    <TableToolbar {...getToolbarProps()} className={styles.toolbar}>
                      <TableBatchActions {...getBatchActionProps()} className={styles.batchActions}>
                        <TableBatchAction renderIcon={User}         onClick={() => {}}>Assign</TableBatchAction>
                        <TableBatchAction renderIcon={Close}        onClick={() => {}}>Close</TableBatchAction>
                        <TableBatchAction renderIcon={Renew}        onClick={() => {}}>Archive</TableBatchAction>
                        <TableBatchAction renderIcon={DocumentBlank} onClick={() => {}}>Export</TableBatchAction>
                      </TableBatchActions>
                      <TableToolbarContent className={styles.toolbarContent}>
                        <Search
                          size="sm"
                          placeholder="Search case ID or title…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          labelText="Search cases"
                          className={styles.tableSearch}
                        />
                      </TableToolbarContent>
                    </TableToolbar>

                    <Table {...getTableProps()} size="sm" className={styles.table}>
                      <TableHead>
                        <TableRow>
                          <TableSelectAll {...getSelectionProps()} className={styles.selectAll} />
                          {headers.map((header: any) => (
                            <TableHeader
                              {...getHeaderProps({ header })}
                              key={header.key}
                              className={styles.th}
                            >
                              {header.header}
                            </TableHeader>
                          ))}
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {rows.map((row: any) => {
                          const c = cases.find((item) => item.id === row.id) as Case;
                          if (!c) return null;
                          const isSelected = c.id === selectedCaseId;
                          return (
                            <TableRow
                              {...getRowProps({ row })}
                              key={row.id}
                              className={`${styles.tr} ${isSelected ? styles.trSelected : ''}`}
                              onClick={() => selectCase(c.id)}
                            >
                              <TableSelectRow {...getSelectionProps({ row })} className={styles.selectRow} />

                              {/* CASE ID */}
                              <TableCell className={`${styles.td} ${styles.idCell}`}>
                                <span className={styles.caseIdText}>{c.id}</span>
                              </TableCell>

                              {/* TITLE */}
                              <TableCell className={`${styles.td} ${styles.titleCell}`}>
                                <span className={styles.caseTitle}>{c.title}</span>
                              </TableCell>

                              {/* PRIORITY */}
                              <TableCell className={styles.td}>
                                <PriorityBadge priority={c.priority} />
                              </TableCell>

                              {/* STATUS */}
                              <TableCell className={styles.td}>
                                <Tag type={STATUS_TAG[c.status].type} size="sm" className={styles.statusTagSmall}>
                                  {STATUS_TAG[c.status].label}
                                </Tag>
                              </TableCell>

                              {/* ENTITIES */}
                              <TableCell className={`${styles.td} ${styles.monoTd}`}>
                                {c.entities}
                              </TableCell>

                              {/* TASKS */}
                              <TableCell className={styles.td}>
                                <TaskProgress done={c.tasks.done} total={c.tasks.total} />
                              </TableCell>

                              {/* ASSIGNED */}
                              <TableCell className={styles.td}>
                                <div className={styles.assignedCell}>
                                  <div className={`${styles.avatarSm} ${AVATAR_CLASS[c.avatarKey]}`}>
                                    {c.assignedInit}
                                  </div>
                                  <span className={styles.assignedName}>{c.assigned}</span>
                                </div>
                              </TableCell>

                              {/* UPDATED */}
                              <TableCell className={`${styles.td} ${styles.monoTd}`}>
                                <div className={styles.updatedCell}>
                                  {c.updated}
                                  <ChevronRight size={14} className={styles.chevron} />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                );
              }}
            </DataTable>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                ‹ PREV
              </button>
              <span className={styles.pageInfo}>
                {page} / {totalPages} &nbsp;·&nbsp; {totalCount} cases
              </span>
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                NEXT ›
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANE — Case Detail Drawer
        ══════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {selectedCase && (
            <CaseDetailDrawer
              key={selectedCase.id}
              caseData={selectedCase}
              onClose={() => selectCase('')}
              onUpdateStatus={updateStatus}
              onAddNote={addNote}
              onToggleTask={toggleTask}
              onAddTask={addTask}
            />
          )}
        </AnimatePresence>

      </div>

      {/* ── New Case Modal ── */}
      <NewCaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={addCase}
      />
    </AnalystPageShell>
  );
};

export default CaseManagementPage;