// src/presentation/pages/analyst/InvestigationsPage.tsx
// ILA OSINT — Intelligence Investigation Management
// ─────────────────────────────────────────────────────
// Two-pane layout (70% list / 30% detail)
// Dark intelligence theme · Carbon Design System · Framer Motion
import DateRangePicker from '../../../components/analyst/DateRangePicker/DateRangePicker';
import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  Button,
  DataTable,
  DataTableSkeleton,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableSelectAll,
  TableSelectRow,
  TableBatchActions,
  TableBatchAction,
  TableToolbar,
  Tag,
  Dropdown,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  TextInput,
  TextArea,
  ToastNotification,
} from '@carbon/react';

import {
  Search,
  Add,
  Close,
  View,
  Edit,
  OverflowMenuVertical,
  ChevronLeft,
  ChevronRight,
  Flag,
  CircleDash,
  User,
  Calendar,
  Building,
  Laptop,
} from '@carbon/icons-react';

import {
  drawerSlideIn,
  drawerSlideInTransition,
} from '../../../styles/motion';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import ThreatTag        from '../../../components/analyst/ThreatTag/ThreatTag';
import RiskGauge        from '../../../components/analyst/RiskGauge/RiskGauge';
import NotesEditor      from '../../../components/analyst/NotesEditor/NotesEditor';
import EvidenceCollection from '../../../components/analyst/EvidenceCollection/EvidenceCollection';
import type { EvidenceItem } from '../../../components/analyst/EvidenceCollection/EvidenceCollection';
import GraphCanvas      from '../../../components/analyst/GraphCanvas/GraphCanvas';
import { useGraph }     from '../../../hooks/useGraph';

import { useInvestigations } from '../../../hooks/useInvestigations';
import type {
  Investigation,
  InvestigationStatus,
  Priority,
} from '../../../hooks/useInvestigations';

import styles from './InvestigationsPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const RISK_SCORES: Record<Priority, number> = {
  CRITICAL: 92,
  HIGH:     74,
  MEDIUM:   45,
  LOW:      18,
};

type StatusTagColor = 'blue' | 'cyan' | 'purple' | 'gray';

const STATUS_TAG: Record<InvestigationStatus, { type: StatusTagColor; label: string }> = {
  OPEN:           { type: 'blue',   label: 'OPEN'        },
  IN_PROGRESS:    { type: 'cyan',   label: 'IN PROGRESS' },
  PENDING_REVIEW: { type: 'purple', label: 'PENDING'     },
  CLOSED:         { type: 'gray',   label: 'CLOSED'      },
};

const STATUS_TABS: Array<{ label: string; value: InvestigationStatus | 'ALL' }> = [
  { label: 'ALL',            value: 'ALL'            },
  { label: 'OPEN',           value: 'OPEN'           },
  { label: 'IN PROGRESS',    value: 'IN_PROGRESS'    },
  { label: 'PENDING REVIEW', value: 'PENDING_REVIEW' },
  { label: 'CLOSED',         value: 'CLOSED'         },
];

const TABLE_HEADERS = [
  { key: 'id',       header: 'INV ID'   },
  { key: 'title',    header: 'TITLE'    },
  { key: 'priority', header: 'PRIORITY' },
  { key: 'status',   header: 'STATUS'   },
  { key: 'assigned', header: 'ASSIGNED' },
  { key: 'created',  header: 'CREATED'  },
  { key: 'updated',  header: 'UPDATED'  },
  { key: 'actions',  header: 'ACTIONS'  },
];

// ─────────────────────────────────────────────────────────────────
// Mock detail data keyed by investigation ID
// ─────────────────────────────────────────────────────────────────

const MOCK_TIMELINE: Record<string, Array<{ text: string; time: string }>> = {
  'INV-4421': [
    { text: 'First C2 beacon detected',          time: 'Jun 08 · 02:14Z' },
    { text: 'Alert escalated to CRITICAL',        time: 'Jun 09 · 06:30Z' },
    { text: 'Analyst assigned — analyst_01',      time: 'Jun 10 · 09:00Z' },
  ],
  'INV-4398': [
    { text: 'Initial cluster identified',         time: 'Jun 09 · 14:00Z' },
    { text: 'Cross-reference with INV-4289',      time: 'Jun 09 · 18:22Z' },
    { text: 'analyst_02 assigned',                time: 'Jun 10 · 08:00Z' },
  ],
  'INV-4350': [
    { text: 'Pattern analysis initiated',         time: 'Jun 07 · 10:00Z' },
    { text: 'Entities linked to case',            time: 'Jun 08 · 15:30Z' },
    { text: 'Pending review — awaiting sign-off', time: 'Jun 09 · 16:45Z' },
  ],
  'INV-4312': [
    { text: 'Credential dump discovered',         time: 'Jun 06 · 08:00Z' },
    { text: 'Dark web source attributed',         time: 'Jun 07 · 11:00Z' },
    { text: 'analyst_02 assigned',                time: 'Jun 07 · 14:00Z' },
  ],
  'INV-4289': [
    { text: 'Shell company cluster flagged',      time: 'Jun 05 · 10:00Z' },
    { text: 'Financial records cross-referenced', time: 'Jun 06 · 09:00Z' },
    { text: 'analyst_03 assigned',                time: 'Jun 06 · 13:00Z' },
  ],
};

const MOCK_ACTIVITY: Record<string, Array<{ text: string; time: string }>> = {
  'INV-4421': [
    { text: 'analyst_01 updated status',  time: '2h ago' },
    { text: 'Report draft generated',     time: '5h ago' },
    { text: 'New alert linked',           time: '1d ago' },
  ],
  'INV-4398': [
    { text: 'analyst_02 added note',      time: '3h ago' },
    { text: 'Entity cluster expanded',    time: '8h ago' },
  ],
  'INV-4350': [
    { text: 'Pending review flagged',     time: '1d ago' },
    { text: 'New entity linked',          time: '2d ago' },
  ],
  'INV-4312': [
    { text: 'analyst_02 added IOC',       time: '3h ago' },
    { text: 'Alert priority escalated',   time: '6h ago' },
  ],
  'INV-4289': [
    { text: 'analyst_03 added entity',    time: '6h ago' },
    { text: 'Cross-border lead confirmed',time: '1d ago' },
  ],
};

const MOCK_ENTITIES: Record<string, Array<{ icon: 'ip' | 'person' | 'org'; label: string }>> = {
  'INV-4421': [
    { icon: 'ip',     label: '192.168.44.201' },
    { icon: 'person', label: 'Arjun Mehta'    },
    { icon: 'org',    label: 'ShadowNet Pvt'  },
  ],
  'INV-4398': [
    { icon: 'person', label: 'Vikram Rao'     },
    { icon: 'org',    label: 'Nexus Cluster'  },
  ],
  'INV-4350': [
    { icon: 'ip',     label: '10.32.77.14'    },
    { icon: 'person', label: 'John Kamau'     },
  ],
  'INV-4312': [
    { icon: 'ip',     label: '185.220.101.9'  },
    { icon: 'org',    label: 'DarkForum.onion'},
  ],
  'INV-4289': [
    { icon: 'person', label: 'Ravi Krishnan'  },
    { icon: 'org',    label: 'Apex Holdings'  },
    { icon: 'ip',     label: '103.21.58.212'  },
  ],
};

const MOCK_NOTES: Record<string, string> = {
  'INV-4421': '"Pattern matches known Lazarus Group TTPs. Cross-reference with INV-4289 for entity overlap and timeline correlation."',
  'INV-4398': '"Coordinated inauthentic behaviour suspected. Recommend escalation to threat intelligence team for attribution."',
  'INV-4350': '"Routine border analysis. Awaiting secondary review from Senior Analyst before closure."',
  'INV-4312': '"High-volume credential exposure. Immediate password-reset advisory recommended for affected domains."',
  'INV-4289': '"Shell company network spans 3 jurisdictions. Liaison with financial intelligence unit initiated."',
};

const MOCK_DESCRIPTIONS: Record<string, string> = {
  'INV-4421': 'High-frequency anomalous traffic detected from unknown IP cluster in Sector 7. Indicators suggest coordinated C2 activity with lateral movement.',
  'INV-4398': 'Coordinated disinformation campaign detected across 14 social platforms. Pattern analysis indicates state-sponsored operation.',
  'INV-4350': 'Analysis of cross-border movement patterns flagged by SIGINT. Three individuals of interest with suspected logistics ties.',
  'INV-4312': 'Large credential dump discovered on dark web forum. Over 40k accounts linked to government domains.',
  'INV-4289': 'Suspected shell company network facilitating cross-border financial fraud. Mumbai-based entities under review.',
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getRelativeTime(dateString: string): string {
  const diff  = Date.now() - new Date(dateString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
  });
}

function getInitials(analyst: string): string {
  const parts = analyst.split('_');
  if (parts.length === 2) return `A${parts[1]}`;
  return analyst.slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────
// Small presentational components
// ─────────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  const cls: Record<Priority, string> = {
    CRITICAL: styles.priCrit,
    HIGH:     styles.priHigh,
    MEDIUM:   styles.priMed,
    LOW:      styles.priLow,
  };
  return (
    <span className={`${styles.priBadge} ${cls[priority]}`}>
      <span className={styles.priDot} />
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: InvestigationStatus }) {
  const cls: Record<InvestigationStatus, string> = {
    OPEN:           styles.stOpen,
    IN_PROGRESS:    styles.stProg,
    PENDING_REVIEW: styles.stPend,
    CLOSED:         styles.stClosed,
  };
  const labels: Record<InvestigationStatus, string> = {
    OPEN: 'OPEN', IN_PROGRESS: 'IN PROGRESS', PENDING_REVIEW: 'PENDING', CLOSED: 'CLOSED',
  };
  return (
    <span className={`${styles.statusBadge} ${cls[status]}`}>
      {labels[status]}
    </span>
  );
}

function EntityIcon({ type }: { type: 'ip' | 'person' | 'org' }) {
  if (type === 'ip')     return <Laptop size={10} />;
  if (type === 'person') return <User size={10} />;
  return <Building size={10} />;
}

// ─────────────────────────────────────────────────────────────────
// Graph section integrated into the detail drawer
// ─────────────────────────────────────────────────────────────────
function GraphSection({ investigation }: { investigation: Investigation | null }) {
  const graph = useGraph();

  useEffect(() => {
    // rebuild graph for selected investigation
    graph.clearGraph();
    if (!investigation) return;

    const entities = MOCK_ENTITIES[investigation.id] ?? [];

    // add nodes
    entities.forEach((e, idx) => {
      const nodeId = `${investigation.id}-ENT-${idx}`;
      const type = e.icon === 'person' ? 'PERSON' : e.icon === 'org' ? 'ORGANIZATION' : 'DIGITAL';
      const node = {
        id: nodeId,
        label: e.label,
        type: type as any,
        riskScore: Math.max(10, RISK_SCORES[investigation.priority] - idx * 6),
        source: 'OSINT',
        connectionCount: Math.max(0, entities.length - 1),
        lastSeen: new Date().toISOString(),
        description: '',
      };
      graph.addNode(node);
    });

    // add simple star edges from first entity to others
    if (entities.length > 1) {
      const firstId = `${investigation.id}-ENT-0`;
      for (let i = 1; i < entities.length; i++) {
        const edge = {
          id: `${investigation.id}-E-${i}`,
          source: firstId,
          target: `${investigation.id}-ENT-${i}`,
          label: 'RELATED',
          weight: 1,
        };
        graph.addEdge(edge);
      }
    }
  }, [investigation?.id]);

  return (
    <div style={{ height: 420 }}>
      <GraphCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        selectedNodeId={graph.selectedNodeId}
        hoveredNodeId={graph.hoveredNodeId}
        onSelectNode={graph.selectNode}
        onHoverNode={graph.setHoveredNodeId}
        onExpandNode={graph.expandNode}
        onRemoveNode={graph.removeNode}
        onHideNode={graph.hideNode}
        onPinNode={graph.pinNode}
        onHighlightConnections={graph.highlightConnections}
        onClearHighlight={graph.clearHighlight}
        onLoadSample={graph.loadSampleGraph}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Create Investigation form type + default
// ─────────────────────────────────────────────────────────────────

interface CreateForm {
  title:          string;
  description:    string;
  priority:       string;
  classification: string;
  assignedTo:     string;
}

const DEFAULT_FORM: CreateForm = {
  title:          '',
  description:    '',
  priority:       'HIGH',
  classification: 'UNCLASSIFIED',
  assignedTo:     'analyst_01',
};

// ─────────────────────────────────────────────────────────────────
// Detail Drawer
// ─────────────────────────────────────────────────────────────────

interface DetailDrawerProps {
  investigation: Investigation | null;
  onClose:       () => void;
  notesMap:      Record<string, string>;
  onNoteChange:  (id: string, note: string | null) => void;
  evidenceMap:   Record<string, import('../../../components/analyst/EvidenceCollection/EvidenceCollection').EvidenceItem[]>;
  onEvidenceAddFiles: (id: string, files: File[]) => void;
  onEvidenceAddLink:  (id: string, url: string) => void;
  onEvidenceRemove:   (id: string, evidId: string) => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({ investigation, onClose, notesMap, onNoteChange, evidenceMap, onEvidenceAddFiles, onEvidenceAddLink, onEvidenceRemove }) => {
  const [activeTab, setActiveTab] = useState(0);

  // Reset to Overview tab whenever a different investigation is selected
  useEffect(() => { setActiveTab(0); }, [investigation?.id]);

  // ── Empty state ──
  if (!investigation) {
    return (
      <motion.div
        key="empty"
        className={styles.drawerPane}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className={styles.emptyDrawer}>
          <div className={styles.emptyIcon}>◎</div>
          <p className={styles.emptyText}>
            SELECT AN INVESTIGATION<br />TO VIEW DETAILS
          </p>
        </div>
      </motion.div>
    );
  }

  const timeline    = MOCK_TIMELINE[investigation.id]    ?? [];
  const activity    = MOCK_ACTIVITY[investigation.id]    ?? [];
  const entities    = MOCK_ENTITIES[investigation.id]    ?? [];
  // notes will be supplied via props in the drawer
  // const notes       = MOCK_NOTES[investigation.id]       ?? '';
  const description = MOCK_DESCRIPTIONS[investigation.id] ?? 'No description available.';

  return (
    <motion.div
      key={investigation.id}
      className={styles.drawerPane}
      variants={drawerSlideIn}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={drawerSlideInTransition}
    >
      {/* ── Header ── */}
      <div className={styles.drawerHeader}>
        <div className={styles.drawerHeaderLeft}>
          <span className={styles.drawerInvId}>{investigation.id}</span>
          <span className={styles.drawerTitle}>
            {investigation.title.length > 44
              ? investigation.title.slice(0, 44) + '…'
              : investigation.title}
          </span>
          <div className={styles.drawerMetaRow}>
            <ThreatTag level={investigation.priority} dot />
            <Tag
              type={STATUS_TAG[investigation.status].type}
              className={styles.statusTag}
            >
              {STATUS_TAG[investigation.status].label}
            </Tag>
            <span className={styles.classificationBadge}>
              {investigation.classification}
            </span>
          </div>
        </div>
        <button
          className={styles.drawerCloseBtn}
          onClick={onClose}
          aria-label="Close detail panel"
        >
          <Close size={14} />
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className={styles.drawerTabBar}>
            {['OVERVIEW', 'INTELLIGENCE', 'ACTIVITY', 'GRAPH'].map((tab, i) => (
          <button
            key={tab}
            className={`${styles.drawerTab} ${activeTab === i ? styles.drawerTabActive : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.drawerBody}>
        <AnimatePresence mode="wait">

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 0 && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
            >
              {/* Risk gauge + stat boxes */}
              <div className={styles.riskRow}>
                <RiskGauge score={RISK_SCORES[investigation.priority]} size={60} showLabel />
                <div className={styles.statBoxRow}>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#fa4d56' }}>
                      {investigation.linkedAlerts}
                    </div>
                    <div className={styles.statLbl}>Alerts</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#00a3c7' }}>
                      {investigation.linkedEntities}
                    </div>
                    <div className={styles.statLbl}>Entities</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#a56eff' }}>
                      {investigation.linkedCases}
                    </div>
                    <div className={styles.statLbl}>Cases</div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Description</span>
                <p className={styles.descText}>{description}</p>
              </div>

              {/* Assigned analyst */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Assigned To</span>
                <div className={styles.assignedRow}>
                  <span className={styles.avatarLg}>
                    {getInitials(investigation.assignedTo)}
                  </span>
                  <div>
                    <div className={styles.analystName}>{investigation.assignedTo}</div>
                    <div className={styles.analystRole}>Intelligence Analyst</div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Timeline</span>
                {timeline.length > 0 ? (
                  timeline.map((item, i) => (
                    <div key={i} className={styles.tlItem}>
                      <div className={styles.tlDot} />
                      <div>
                        <div className={styles.tlText}>{item.text}</div>
                        <div className={styles.tlTime}>{item.time}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={styles.descText}>No timeline events recorded.</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── INTELLIGENCE TAB ── */}
          {activeTab === 1 && (
            <motion.div
              key="intelligence"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
            >
              {/* Linked counts */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Linked Intelligence</span>
                <div className={styles.linkedGrid}>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#fa4d56' }}>
                      {investigation.linkedAlerts}
                    </div>
                    <div className={styles.statLbl}>Alerts</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#00a3c7' }}>
                      {investigation.linkedEntities}
                    </div>
                    <div className={styles.statLbl}>Entities</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statVal} style={{ color: '#a56eff' }}>
                      {investigation.linkedCases}
                    </div>
                    <div className={styles.statLbl}>Cases</div>
                  </div>
                </div>
              </div>

              {/* Linked entities */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Linked Entities</span>
                <div className={styles.entityTags}>
                  {entities.length > 0 ? (
                    entities.map((e, i) => (
                      <span key={i} className={styles.entityTag}>
                        <EntityIcon type={e.icon} />
                        {e.label}
                      </span>
                    ))
                  ) : (
                    <p className={styles.descText}>No entities linked.</p>
                  )}
                </div>
              </div>

              {/* Analyst notes (editable) */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Analyst Notes</span>
                <div className={styles.noteBox}>
                  <NotesEditor
                    investigationId={investigation.id}
                    initialNote={notesMap[investigation.id] ?? ''}
                    onChange={(n) => onNoteChange(investigation.id, n)}
                  />
                </div>
              </div>

              {/* Evidence collection */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Evidence</span>
                <div className={styles.noteBox}>
                  <EvidenceCollection
                    investigationId={investigation.id}
                    items={evidenceMap[investigation.id] ?? []}
                    onAddFiles={(files) => onEvidenceAddFiles(investigation.id, files)}
                    onAddLink={(url) => onEvidenceAddLink(investigation.id, url)}
                    onRemove={(eid) => onEvidenceRemove(investigation.id, eid)}
                  />
                </div>
              </div>

              {/* Key dates */}
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Key Dates</span>
                <div className={styles.tlItem}>
                  <div className={styles.tlDot} />
                  <div>
                    <div className={styles.tlText}>Created</div>
                    <div className={styles.tlTime}>{formatShortDate(investigation.createdAt)}</div>
                  </div>
                </div>
                <div className={styles.tlItem}>
                  <div className={styles.tlDot} />
                  <div>
                    <div className={styles.tlText}>Last Updated</div>
                    <div className={styles.tlTime}>{formatShortDate(investigation.updatedAt)}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === 2 && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
            >
              <div className={styles.ds}>
                <span className={styles.dsLabel}>Activity Log</span>
                {activity.length > 0 ? (
                  activity.map((item, i) => (
                    <div key={i} className={styles.tlItem}>
                      <div className={styles.tlDot} />
                      <div>
                        <div className={styles.tlText}>{item.text}</div>
                        <div className={styles.tlTime}>{item.time}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={styles.descText}>No activity recorded.</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── GRAPH TAB ── */}
          {activeTab === 3 && (
            <motion.div
              key="graph"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.16 }}
            >
              <div className={styles.ds} style={{ padding: 0 }}>
                <GraphSection investigation={investigation} />
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── Footer actions ── */}
      <div className={styles.drawerFooter}>
        <button
          className={styles.dfBtnPrimary}
          onClick={() => console.log('[ILA] Open full view:', investigation.id)}
        >
          OPEN FULL VIEW
        </button>
        <button
          className={styles.dfBtnEscalate}
          onClick={() => console.log('[ILA] Escalate:', investigation.id)}
        >
          ESCALATE
        </button>
        <button
          className={styles.dfBtnDanger}
          onClick={() => console.log('[ILA] Close investigation:', investigation.id)}
        >
          CLOSE INV
        </button>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────

export default function InvestigationsPage() {

  // ── State ──────────────────────────────────────────────────────
  const [selectedInvestigation, setSelectedInvestigation] =
    useState<Investigation | null>(null);
  const [activeTab,      setActiveTab]      = useState<InvestigationStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [assignedFilter, setAssignedFilter] = useState('ALL');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [page,           setPage]           = useState(1);
  const [pageSize,       setPageSize]       = useState(25);
  const [createOpen,     setCreateOpen]     = useState(false);
  const [toastVisible,   setToastVisible]   = useState(false);
  const [form,           setForm]           = useState<CreateForm>(DEFAULT_FORM);

  // Notes map stored locally for immediate editor persistence
  const [notesMap, setNotesMap] = useState<Record<string, string>>(() => ({ ...MOCK_NOTES }));

  const handleNoteChange = useCallback((id: string, note: string | null) => {
    setNotesMap((prev) => {
      const next = { ...prev };
      if (note === null || note === '') delete next[id];
      else next[id] = note;
      return next;
    });
  }, []);

  // Evidence map stored locally per investigation
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceItem[]>>(() => ({}));

  const handleAddFiles = useCallback((invId: string, files: File[]) => {
    setEvidenceMap((prev) => {
      const list = prev[invId] ? [...prev[invId]] : [];
      files.forEach((f) => {
        const id = `EVID-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        const isImage = f.type.startsWith('image/');
        const previewUrl = isImage ? URL.createObjectURL(f) : undefined;
        list.push({ id, type: 'file', name: f.name, file: f, previewUrl, addedAt: new Date().toISOString() });
      });
      return { ...prev, [invId]: list };
    });
  }, []);

  const handleAddLink = useCallback((invId: string, url: string) => {
    setEvidenceMap((prev) => {
      const list = prev[invId] ? [...prev[invId]] : [];
      const id = `EVID-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      list.push({ id, type: 'link', name: url, url, addedAt: new Date().toISOString() });
      return { ...prev, [invId]: list };
    });
  }, []);

  const handleRemoveEvidence = useCallback((invId: string, evidId: string) => {
    setEvidenceMap((prev) => {
      const list = (prev[invId] ?? []).filter((it) => it.id !== evidId);
      return { ...prev, [invId]: list };
    });
  }, []);

  const searchRef = useRef<HTMLInputElement>(null);
  const { data: investigations, isLoading } = useInvestigations();

  // ── Keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    // Shortcut event from sidebar / command bar
    const handleShortcut = () => setCreateOpen(true);
    window.addEventListener('ila:shortcut:new', handleShortcut);
    return () => window.removeEventListener('ila:shortcut:new', handleShortcut);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // "/" focuses the search box
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      // Escape closes detail panel
      if (e.key === 'Escape') {
        setSelectedInvestigation(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = investigations ?? [];
    if (activeTab !== 'ALL')
      result = result.filter(i => i.status === activeTab);
    if (priorityFilter !== 'ALL')
      result = result.filter(i => i.priority === priorityFilter);
    if (assignedFilter !== 'ALL')
      result = result.filter(i => i.assignedTo === assignedFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        i.id.toLowerCase().includes(q)          ||
        i.title.toLowerCase().includes(q)       ||
        i.assignedTo.toLowerCase().includes(q)  ||
        i.status.toLowerCase().includes(q)      ||
        i.priority.toLowerCase().includes(q),
      );
    }
    return result;
  }, [investigations, activeTab, priorityFilter, assignedFilter, searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, priorityFilter, assignedFilter, searchQuery, pageSize]);

  // ── Pagination slice ───────────────────────────────────────────
  const pageStart = (page - 1) * pageSize;
  const pageRows  = filtered.slice(pageStart, pageStart + pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // Carbon DataTable rows
  const rows = pageRows.map(inv => ({
    id:       inv.id,
    title:    inv.title,
    priority: inv.priority,
    status:   inv.status,
    assigned: inv.assignedTo,
    created:  inv.createdAt,
    updated:  inv.updatedAt,
    actions:  inv.id,
  }));

  const activeCount = (investigations ?? []).filter(i => i.status !== 'CLOSED').length;

  // ── Handlers ───────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    console.log('[ILA] New investigation:', form);
    setCreateOpen(false);
    setForm(DEFAULT_FORM);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  }, [form]);

  const clearFilters = useCallback(() => {
    setActiveTab('ALL');
    setPriorityFilter('ALL');
    setAssignedFilter('ALL');
    setSearchQuery('');
  }, []);

  const hasFilters =
    priorityFilter !== 'ALL' ||
    assignedFilter !== 'ALL' ||
    activeTab !== 'ALL'      ||
    searchQuery.trim() !== '';

  // ── Loading state ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <AnalystPageShell title="INVESTIGATIONS">
        <DataTableSkeleton columnCount={8} rowCount={10} showHeader showToolbar />
      </AnalystPageShell>
    );
  }

  // ── Page numbers to display (compact smart pagination) ─────────
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    p => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <AnalystPageShell
      title="INVESTIGATIONS"
      actions={
        <>
          <span className={styles.countBadge}>{activeCount} ACTIVE</span>
          <span className={styles.lastUpdated}>
            Updated {getRelativeTime(new Date().toISOString())}
          </span>
          <Button
            kind="primary"
            size="sm"
            renderIcon={Add}
            onClick={() => setCreateOpen(true)}
            className={styles.newBtn}
          >
            NEW INVESTIGATION
          </Button>
        </>
      }
    >
      {/* Subtitle */}
      <p className={styles.pageSubtitle}>
        Track, manage and analyze active intelligence investigations
      </p>

      <div className={styles.pageLayout}>

        {/* ════════════════════════════════════════════════
            LEFT PANE — Investigation list
            ════════════════════════════════════════════════ */}
        <div className={styles.listPane}>

          {/* ── Filter bar ── */}
          <div className={styles.filterBar}>
            {/* Search */}
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input
                ref={searchRef}
                className={styles.searchInput}
                placeholder="Search by ID or title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search investigations  ( / to focus )"
              />
              {searchQuery && (
                <button
                  className={styles.searchClear}
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <Close size={12} />
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div className={styles.filterChips}>
              {/* Priority */}
              <div className={styles.filterChip}>
                <Flag size={10} />
                <select
                  className={styles.filterSelect}
                  value={priorityFilter}
                  onChange={e => setPriorityFilter(e.target.value)}
                  aria-label="Filter by priority"
                >
                  <option value="ALL">Priority</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* Status */}
              <div className={styles.filterChip}>
                <CircleDash size={10} />
                <select
                  className={styles.filterSelect}
                  value={activeTab}
                  onChange={e => setActiveTab(e.target.value as InvestigationStatus | 'ALL')}
                  aria-label="Filter by status"
                >
                  <option value="ALL">Status</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="PENDING_REVIEW">Pending Review</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              {/* Assigned analyst */}
              <div className={styles.filterChip}>
                <User size={10} />
                <select
                  className={styles.filterSelect}
                  value={assignedFilter}
                  onChange={e => setAssignedFilter(e.target.value)}
                  aria-label="Filter by analyst"
                >
                  <option value="ALL">Analyst</option>
                  <option value="analyst_01">analyst_01</option>
                  <option value="analyst_02">analyst_02</option>
                  <option value="analyst_03">analyst_03</option>
                </select>
              </div>

              {/* Date range (UI only — wire to real date filter as needed) */}
              <div className={styles.filterChip}>
                <Calendar size={10} />
                <DateRangePicker
  onRangeChange={(start, end, preset) => {
    console.log('[ILA] Date range selected:', start, end, preset);
  }}
/>
              </div>
            </div>

            {/* Clear filters */}
            <div className={styles.filterRight}>
              {hasFilters && (
                <button className={styles.clearBtn} onClick={clearFilters}>
                  CLEAR FILTERS
                </button>
              )}
            </div>
          </div>

          {/* ── Status tabs ── */}
          <div className={styles.statusTabs} role="tablist" aria-label="Investigation status tabs">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={activeTab === tab.value}
                className={`${styles.statusTab} ${activeTab === tab.value ? styles.statusTabActive : ''}`}
                onClick={() => setActiveTab(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Carbon Data Table ── */}
          <DataTable rows={rows} headers={TABLE_HEADERS} isSortable useZebraStyles={false}>
            {({
              rows:              dtRows,
              headers,
              getTableProps,
              getHeaderProps,
              getRowProps,
              getSelectionProps,
              getBatchActionProps,
              selectedRows,
             
            }: any) => (
              <>
                <TableToolbar className={styles.tableToolbar}>
  <TableBatchActions {...getBatchActionProps()}>
    <TableBatchAction onClick={() => console.log('[ILA] Batch assign:', selectedRows)}>
      ASSIGN
    </TableBatchAction>
    <TableBatchAction onClick={() => console.log('[ILA] Batch escalate:', selectedRows)}>
      ESCALATE
    </TableBatchAction>
    <TableBatchAction onClick={() => console.log('[ILA] Batch close:', selectedRows)}>
      CLOSE
    </TableBatchAction>
    <TableBatchAction onClick={() => console.log('[ILA] Batch export:', selectedRows)}>
      EXPORT
    </TableBatchAction>
  </TableBatchActions>
</TableToolbar>
                <div className={styles.tableWrap}>
                  <Table {...getTableProps()} className={styles.table}>
                    <TableHead>
                      <TableRow>
                        <TableSelectAll {...getSelectionProps()} />
                        {headers.map((header: { key: string; header: string }) => (
                          <TableHeader
                            key={header.key}
                            {...getHeaderProps({ header })}
                            className={styles.th}
                          >
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {dtRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className={styles.emptyCell}>
                            NO INVESTIGATIONS MATCH CURRENT FILTERS
                          </TableCell>
                        </TableRow>
                      ) : (
                        dtRows.map((row: {
                          id: string;
                          cells: Array<{ id: string; value: string; info: { header: string } }>;
                        }) => {
                          const inv        = pageRows.find(i => i.id === row.id)!;
                          const isSelected = selectedInvestigation?.id === row.id;

                          return (
                            <motion.tr
                              key={row.id}
                              {...(getRowProps({ row }) as object)}
                              className={`${styles.tableRow} ${isSelected ? styles.selectedRow : ''}`}
                              onClick={() =>
                                setSelectedInvestigation(isSelected ? null : inv)
                              }
                              whileHover={{ backgroundColor: 'rgba(0,163,199,0.04)' }}
                              transition={{ duration: 0.12 }}
                            >
                              <TableSelectRow
                                {...getSelectionProps({ row })}
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              />

                              {row.cells.map(cell => {
                                return (
                                  <TableCell key={cell.id} className={styles.td}>

                                    {cell.info.header === 'id' && (
  <span className={styles.invId}>{cell.value}</span>
)}

{cell.info.header === 'title' && (
  <span className={styles.titleCell} title={cell.value}>
    {cell.value.length > 42
      ? cell.value.slice(0, 42) + '…'
      : cell.value}
  </span>
)}

{cell.info.header === 'priority' && (
  <PriorityBadge priority={cell.value as Priority} />
)}

{cell.info.header === 'status' && inv && (
  <StatusBadge status={inv.status} />
)}

{cell.info.header === 'assigned' && (
  <div className={styles.analystCell}>
    <span className={styles.avatarSm}>
      {getInitials(cell.value)}
    </span>
    <span className={styles.analystText}>{cell.value}</span>
  </div>
)}

{cell.info.header === 'created' && (
  <span className={styles.dateCell}>
    {formatShortDate(cell.value)}
  </span>
)}

{cell.info.header === 'updated' && (
  <span className={styles.dateCell}>
    {getRelativeTime(cell.value)}
  </span>
)}

{cell.info.header === 'actions' && (
                                      <div
                                        className={styles.actionsCell}
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <button
                                          className={styles.actBtn}
                                          title="View investigation"
                                          onClick={() => setSelectedInvestigation(inv)}
                                        >
                                          <View size={12} />
                                        </button>
                                        <button
                                          className={styles.actBtn}
                                          title="Edit investigation"
                                          onClick={() =>
                                            console.log('[ILA] Edit:', cell.value)
                                          }
                                        >
                                          <Edit size={12} />
                                        </button>
                                        <button
                                          className={styles.actBtn}
                                          title="More options"
                                          onClick={() =>
                                            console.log('[ILA] More:', cell.value)
                                          }
                                        >
                                          <OverflowMenuVertical size={12} />
                                        </button>
                                      </div>
                                    )}

                                  </TableCell>
                                );
                              })}
                            </motion.tr>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </DataTable>

          {/* ── Pagination ── */}
          <div className={styles.paginationBar}>
            <span className={styles.pageInfo}>
              {filtered.length === 0
                ? 'No results'
                : `Showing ${pageStart + 1}–${Math.min(
                    pageStart + pageSize,
                    filtered.length,
                  )} of ${filtered.length} investigations`}
            </span>

            <div className={styles.pageControls}>
              <button
                className={styles.pgBtn}
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={12} />
              </button>

              {pageNumbers.map((p, i, arr) => (
                <React.Fragment key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && (
                    <span className={styles.pgEllipsis}>…</span>
                  )}
                  <button
                    className={`${styles.pgBtn} ${p === page ? styles.pgBtnActive : ''}`}
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}

              <button
                className={styles.pgBtn}
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={12} />
              </button>

              <select
                className={styles.perPage}
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            RIGHT PANE — Detail drawer
            ════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          <DetailDrawer
            key={selectedInvestigation?.id ?? 'empty'}
            investigation={selectedInvestigation}
            onClose={() => setSelectedInvestigation(null)}
            notesMap={notesMap}
            onNoteChange={handleNoteChange}
            evidenceMap={evidenceMap}
            onEvidenceAddFiles={handleAddFiles}
            onEvidenceAddLink={handleAddLink}
            onEvidenceRemove={handleRemoveEvidence}
          />
        </AnimatePresence>
      </div>

      {/* ══════════════════════════════════════════════════
          Create Investigation Modal
          ══════════════════════════════════════════════════ */}
      <ComposedModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="sm"
        className={styles.createModal}
      >
        <ModalHeader
          title="NEW INVESTIGATION"
          className={styles.modalHeader}
        />
        <ModalBody hasForm>
          <div className={styles.modalField}>
            <TextInput
              id="inv-title"
              labelText="TITLE *"
              placeholder="Investigation title..."
              value={form.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setForm(f => ({ ...f, title: e.target.value }))
              }
              className={styles.modalInput}
            />
          </div>

          <div className={styles.modalField}>
            <TextArea
              id="inv-desc"
              labelText="DESCRIPTION"
              placeholder="Brief description of the investigation..."
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setForm(f => ({ ...f, description: e.target.value }))
              }
              rows={3}
              className={styles.modalInput}
            />
          </div>

          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <Dropdown
                id="inv-priority"
                titleText="PRIORITY"
                label="Select priority"
                items={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']}
                itemToString={(item: string | null) => item ?? ''}
                selectedItem={form.priority}
                onChange={({ selectedItem }: { selectedItem: string | null }) =>
                  setForm(f => ({ ...f, priority: selectedItem ?? 'HIGH' }))
                }
                size="sm"
              />
            </div>
            <div className={styles.modalField}>
              <Dropdown
                id="inv-classification"
                titleText="CLASSIFICATION"
                label="Select classification"
                items={['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET']}
                itemToString={(item: string | null) => item ?? ''}
                selectedItem={form.classification}
                onChange={({ selectedItem }: { selectedItem: string | null }) =>
                  setForm(f => ({ ...f, classification: selectedItem ?? 'UNCLASSIFIED' }))
                }
                size="sm"
              />
            </div>
          </div>

          <div className={styles.modalField}>
            <Dropdown
              id="inv-assigned"
              titleText="ASSIGN TO"
              label="Select analyst"
              items={['analyst_01', 'analyst_02', 'analyst_03']}
              itemToString={(item: string | null) => item ?? ''}
              selectedItem={form.assignedTo}
              onChange={({ selectedItem }: { selectedItem: string | null }) =>
                setForm(f => ({ ...f, assignedTo: selectedItem ?? 'analyst_01' }))
              }
              size="sm"
            />
          </div>
        </ModalBody>

        <ModalFooter
          primaryButtonText="CREATE INVESTIGATION"
          secondaryButtonText="CANCEL"
          onRequestClose={() => setCreateOpen(false)}
          onRequestSubmit={handleCreate}
          primaryButtonDisabled={!form.title.trim()}
        >
          {/* ModalFooter renders its own buttons — children are extra content */}
          <div />
        </ModalFooter>
      </ComposedModal>

      {/* ══════════════════════════════════════════════════
          Success Toast
          ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            className={styles.toastContainer}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22 }}
          >
            <ToastNotification
              kind="success"
              title="Investigation Created"
              subtitle="The new investigation has been queued for analysis."
              timeout={3500}
              onClose={() => setToastVisible(false)}
              className={styles.toast}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AnalystPageShell>
  );
}