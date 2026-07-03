// src/components/analyst/EntityDrawer/EntityDrawer.tsx
// ILA OSINT — Entity Detail Drawer
// Supports two modes:
//   default → slides in from right as a fixed overlay (EntitySearchPage)
//   inline  → fills its container (GraphAnalysisPage detail panel)

import React, { useState } from 'react';
import {
  Tag,
  Button,
  StructuredListWrapper,
  StructuredListHead,
  StructuredListRow,
  StructuredListCell,
  StructuredListBody,
} from '@carbon/react';
import {
  User,
  Building,
  Location,
  Laptop,
  Car,
  Finance,
  Close,
  Share,
  Diagram,
  FolderAdd,
  Flag,
  Link,
  Time,
  Folders,
  NotebookReference,
} from '@carbon/icons-react';
import { motion, AnimatePresence } from 'framer-motion';

import RiskGauge from '../RiskGauge/RiskGauge';
import type { Entity, EntityType } from '../../../hooks/useEntitySearch';
import LinkedEntitySection, {
  type LinkedEntityGroup,
} from './LinkedEntitySection';
import styles from './EntityDrawer.module.scss';

// ─────────────────────────────────────────────────────────────────
// Motion variants (defined locally — no external import needed)
// ─────────────────────────────────────────────────────────────────

const drawerSlideIn = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0,      opacity: 1 },
  exit:    { x: '100%', opacity: 0 },
};

const drawerSlideInTransition = {
  duration: 0.22,
  ease: [0.25, 0.46, 0.45, 0.94] as number[],
};

const tabFade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 4 },
};

const tabFadeTransition = { duration: 0.14, ease: 'easeOut' };

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type DrawerTab = 'profile' | 'connections' | 'timeline' | 'cases' | 'notes';

interface TabConfig {
  key: DrawerTab;
  label: string;
  Icon: React.FC<{ size: number }>;
}

const TABS: TabConfig[] = [
  { key: 'profile',     label: 'Profile',     Icon: User              },
  { key: 'connections', label: 'Connections', Icon: Link              },
  { key: 'timeline',    label: 'Timeline',    Icon: Time              },
  { key: 'cases',       label: 'Cases',       Icon: Folders           },
  { key: 'notes',       label: 'Notes',       Icon: NotebookReference },
];

const TYPE_ICON: Record<EntityType, React.FC<{ size: number; className?: string }>> = {
  PERSON:    User,
  ORG:       Building,
  LOCATION:  Location,
  DIGITAL:   Laptop,
  VEHICLE:   Car,
  FINANCIAL: Finance,
};

function formatLastSeen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  ts: string;
  event: string;
  source: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

function generateTimeline(): TimelineEvent[] {
  return [
    { id: '1', ts: '2026-06-13T02:11:00Z', event: 'Observed in SIGINT intercept',     source: 'SIGINT',    severity: 'high'     },
    { id: '2', ts: '2026-06-12T14:23:00Z', event: 'New alias identified: Shadow_7',   source: 'OSINT',     severity: 'medium'   },
    { id: '3', ts: '2026-06-11T09:00:00Z', event: 'Associated with new C2 domain',    source: 'DIGITAL',   severity: 'critical' },
    { id: '4', ts: '2026-06-10T17:45:00Z', event: 'Financial transaction flagged',    source: 'FINANCIAL', severity: 'high'     },
    { id: '5', ts: '2026-06-09T11:30:00Z', event: 'Location confirmed via HUMINT',    source: 'HUMINT',    severity: 'info'     },
    { id: '6', ts: '2026-06-08T08:15:00Z', event: 'Entity added to watchlist',        source: 'ANALYST',   severity: 'info'     },
    { id: '7', ts: '2026-06-07T19:00:00Z', event: 'Cross-referenced with INV-4421',   source: 'CASE',      severity: 'medium'   },
    { id: '8', ts: '2026-06-06T13:10:00Z', event: 'Initial entity creation',          source: 'SYSTEM',    severity: 'info'     },
  ];
}

const MOCK_CASES = ['CASE-2241', 'CASE-1882', 'CASE-0917'];

const MOCK_NOTES = [
  {
    id: '1',
    author: 'analyst_01',
    ts: '2026-06-12T10:00:00Z',
    text: 'Confirmed connection to Phantom Holdings via wire transfer records. Cross-ref with INV-4421.',
  },
  {
    id: '2',
    author: 'analyst_03',
    ts: '2026-06-11T14:30:00Z',
    text: 'Alias "Ghostwriter" confirmed through social media OSINT. See attached screenshots.',
  },
  {
    id: '3',
    author: 'analyst_01',
    ts: '2026-06-10T09:15:00Z',
    text: 'Risk score elevated to 91 following SIGINT intercept correlation.',
  },
];

function getLinkedEntityGroups(entity: Entity): LinkedEntityGroup[] {
  return [
    {
      category: 'phones',
      items: [
        {
          id: `${entity.id}-phone-1`,
          label: 'Primary contact',
          value: '+44 20 7946 0911',
          subtitle: 'Mobile number linked to verified accounts',
          verified: true,
        },
        {
          id: `${entity.id}-phone-2`,
          label: 'Secondary contact',
          value: '+1 202 555 0147',
          subtitle: 'Monitored call history attached',
        },
      ],
    },
    {
      category: 'emails',
      items: [
        {
          id: `${entity.id}-email-1`,
          label: 'Primary email',
          value: 'n.volkov@phantomhq[.]ru',
          subtitle: 'Linked to previous travel visa filings',
          verified: true,
        },
        {
          id: `${entity.id}-email-2`,
          label: 'Alternate email',
          value: 'ghostwriter.ops@mailproxy[.]net',
          subtitle: 'Appears in dark web chatter',
        },
      ],
    },
    {
      category: 'domains',
      items: [
        {
          id: `${entity.id}-domain-1`,
          label: 'Command control',
          value: 'shadow-ops.xyz',
          subtitle: 'Used in phishing infrastructure',
          verified: true,
        },
        {
          id: `${entity.id}-domain-2`,
          label: 'Secondary site',
          value: 'deepweb-forum.onion',
          subtitle: 'Dark web forum domain',
        },
      ],
    },
    {
      category: 'social accounts',
      items: [
        {
          id: `${entity.id}-social-1`,
          label: 'Telegram handle',
          value: '@nv_ghost',
          subtitle: 'Matched to multiple intelligence reports',
          verified: true,
        },
        {
          id: `${entity.id}-social-2`,
          label: 'Weibo profile',
          value: '@cwl_official',
          subtitle: 'Used for persona building and recruitment',
        },
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// Tab sub-components
// ─────────────────────────────────────────────────────────────────

const ProfileTab: React.FC<{ entity: Entity }> = ({ entity }) => (
  <div className={styles.tabContent}>
    {entity.description && (
      <p className={styles.description}>{entity.description}</p>
    )}

    <StructuredListWrapper aria-label="Entity attributes" className={styles.structuredList}>
      <StructuredListHead>
        <StructuredListRow head>
          <StructuredListCell head>ATTRIBUTE</StructuredListCell>
          <StructuredListCell head>VALUE</StructuredListCell>
        </StructuredListRow>
      </StructuredListHead>
      <StructuredListBody>
        <StructuredListRow>
          <StructuredListCell>Type</StructuredListCell>
          <StructuredListCell>{entity.type}</StructuredListCell>
        </StructuredListRow>
        {entity.location && (
          <StructuredListRow>
            <StructuredListCell>Location</StructuredListCell>
            <StructuredListCell>{entity.location}</StructuredListCell>
          </StructuredListRow>
        )}
        <StructuredListRow>
          <StructuredListCell>Source</StructuredListCell>
          <StructuredListCell>{entity.source}</StructuredListCell>
        </StructuredListRow>
        <StructuredListRow>
          <StructuredListCell>Last Seen</StructuredListCell>
          <StructuredListCell>{formatLastSeen(entity.lastSeen)}</StructuredListCell>
        </StructuredListRow>
        <StructuredListRow>
          <StructuredListCell>Connections</StructuredListCell>
          <StructuredListCell>{entity.connectionCount}</StructuredListCell>
        </StructuredListRow>
        {entity.aliases && entity.aliases.length > 0 && (
          <StructuredListRow>
            <StructuredListCell>Aliases</StructuredListCell>
            <StructuredListCell>{entity.aliases.join(', ')}</StructuredListCell>
          </StructuredListRow>
        )}
        {entity.identifiers &&
          Object.entries(entity.identifiers).map(([k, v]) => (
            <StructuredListRow key={k}>
              <StructuredListCell>{k.toUpperCase()}</StructuredListCell>
              <StructuredListCell className={styles.monoCell}>{v}</StructuredListCell>
            </StructuredListRow>
          ))}
      </StructuredListBody>
    </StructuredListWrapper>

    {entity.tags.length > 0 && (
      <div className={styles.section}>
        <p className={styles.sectionLabel}>TAGS</p>
        <div className={styles.tagCloud}>
          {entity.tags.map((t) => (
            <Tag key={t} type="outline" size="sm" className={styles.drawerTag}>
              {t}
            </Tag>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ConnectionsTab: React.FC<{ entity: Entity }> = ({ entity }) => {
  const groups = getLinkedEntityGroups(entity);

  return (
    <div className={styles.tabContent}>
      <LinkedEntitySection
        groups={groups}
        onSelect={(item) => console.log('Select linked entity', item)}
      />
    </div>
  );
};

const TimelineTab: React.FC<{ entity: Entity }> = ({ entity: _entity }) => {
  const events = generateTimeline();

  const severityClass: Record<TimelineEvent['severity'], string> = {
    critical: styles.sevCritical,
    high:     styles.sevHigh,
    medium:   styles.sevMedium,
    info:     styles.sevInfo,
  };

  return (
    <div className={styles.tabContent}>
      <p className={styles.sectionLabel}>LAST {events.length} EVENTS</p>
      <div className={styles.timeline}>
        {events.map((ev, i) => (
          <div key={ev.id} className={styles.timelineItem}>
            <div className={styles.tlLeft}>
              <div className={`${styles.tlDot} ${severityClass[ev.severity]}`} />
              {i < events.length - 1 && <div className={styles.tlLine} />}
            </div>
            <div className={styles.tlContent}>
              <p className={styles.tlEvent}>{ev.event}</p>
              <div className={styles.tlMeta}>
                <Tag type="outline" size="sm" className={styles.tlSource}>{ev.source}</Tag>
                <span className={styles.tlTs}>
                  {new Date(ev.ts).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CasesTab: React.FC<{ entity: Entity }> = () => (
  <div className={styles.tabContent}>
    <p className={styles.sectionLabel}>LINKED CASES</p>
    <div className={styles.caseList}>
      {MOCK_CASES.map((c) => (
        <div key={c} className={styles.caseItem}>
          <Tag type="blue" size="sm" className={styles.caseTag}>{c}</Tag>
          <span className={styles.caseStatus}>OPEN</span>
        </div>
      ))}
    </div>
  </div>
);

const NotesTab: React.FC<{ entity: Entity }> = () => (
  <div className={styles.tabContent}>
    <p className={styles.sectionLabel}>ANALYST NOTES</p>
    <div className={styles.noteThread}>
      {MOCK_NOTES.map((note) => (
        <div key={note.id} className={styles.noteItem}>
          <div className={styles.noteHeader}>
            <span className={styles.noteAuthor}>{note.author}</span>
            <span className={styles.noteTs}>
              {new Date(note.ts).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
          <p className={styles.noteText}>{note.text}</p>
        </div>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// DrawerContent — shared inner JSX for both overlay and inline modes
// ─────────────────────────────────────────────────────────────────

interface DrawerContentProps {
  entity: Entity;
  Icon: React.FC<{ size: number; className?: string }>;
  activeTab: DrawerTab;
  setActiveTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onOpenFull?: (entity: Entity) => void;
  onAddToGraph?: (entity: Entity) => void;
  onAddToCase?: (entity: Entity) => void;
  onFlag?: (entity: Entity) => void;
}

const DrawerContent: React.FC<DrawerContentProps> = ({
  entity,
  Icon,
  activeTab,
  setActiveTab,
  onClose,
  onOpenFull,
  onAddToGraph,
  onAddToCase,
  onFlag,
}) => (
  <>
    {/* ── Header ── */}
    <div className={styles.drawerHeader}>
      <div className={styles.headerLeft}>
        <div className={styles.drawerTypeIcon}>
          <Icon size={20} />
        </div>
        <div className={styles.headerTitles}>
          <p className={styles.drawerEntityName}>{entity.name}</p>
          <p className={styles.drawerEntityId}>{entity.id}</p>
        </div>
      </div>
      <div className={styles.headerActions}>
        <RiskGauge score={entity.riskScore} size={52} showLabel />
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close drawer"
        >
          <Close size={16} />
        </button>
      </div>
    </div>

    {/* ── Tabs ── */}
    <div className={styles.tabBar} role="tablist">
      {TABS.map(({ key, label, Icon: TabIcon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeTab === key}
          className={`${styles.tabBtn} ${activeTab === key ? styles.tabActive : ''}`}
          onClick={() => setActiveTab(key)}
        >
          <TabIcon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>

    {/* ── Tab content ── */}
    <div className={styles.tabPanel} role="tabpanel">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabFade}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={tabFadeTransition as any}
        >
          {activeTab === 'profile'     && <ProfileTab     entity={entity} />}
          {activeTab === 'connections' && <ConnectionsTab entity={entity} />}
          {activeTab === 'timeline'    && <TimelineTab    entity={entity} />}
          {activeTab === 'cases'       && <CasesTab       entity={entity} />}
          {activeTab === 'notes'       && <NotesTab       entity={entity} />}
        </motion.div>
      </AnimatePresence>
    </div>

    {/* ── Footer actions ── */}
    <div className={styles.drawerFooter}>
      <Button
        size="sm"
        kind="primary"
        renderIcon={Share}
        onClick={() => onOpenFull?.(entity)}
      >
        OPEN FULL
      </Button>
      <Button
        size="sm"
        kind="ghost"
        renderIcon={Diagram}
        onClick={() => onAddToGraph?.(entity)}
      >
        ADD TO GRAPH
      </Button>
      <Button
        size="sm"
        kind="ghost"
        renderIcon={FolderAdd}
        onClick={() => onAddToCase?.(entity)}
      >
        ADD TO CASE
      </Button>
      <Button
        size="sm"
        kind="danger--ghost"
        renderIcon={Flag}
        onClick={() => onFlag?.(entity)}
      >
        FLAG
      </Button>
    </div>
  </>
);

// ─────────────────────────────────────────────────────────────────
// Main EntityDrawer component
// ─────────────────────────────────────────────────────────────────

interface EntityDrawerProps {
  entity: Entity | null;
  onClose: () => void;
  onOpenFull?: (entity: Entity) => void;
  onAddToGraph?: (entity: Entity) => void;
  onAddToCase?: (entity: Entity) => void;
  onFlag?: (entity: Entity) => void;
  /** When true, renders as a fill-container panel — no overlay or backdrop */
  inline?: boolean;
}

const EntityDrawer: React.FC<EntityDrawerProps> = ({
  entity,
  onClose,
  onOpenFull,
  onAddToGraph,
  onAddToCase,
  onFlag,
  inline = false,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('profile');

  const Icon = entity ? (TYPE_ICON[entity.type] ?? User) : User;

  // ── Inline mode — used by GraphAnalysisPage ──────────────────
  if (inline) {
    if (!entity) return null;
    return (
      <div className={styles.drawerInline}>
        <DrawerContent
          entity={entity}
          Icon={Icon}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={onClose}
          onOpenFull={onOpenFull}
          onAddToGraph={onAddToGraph}
          onAddToCase={onAddToCase}
          onFlag={onFlag}
        />
      </div>
    );
  }

  // ── Overlay mode — used by EntitySearchPage ──────────────────
  return (
    <AnimatePresence>
      {entity && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />

          {/* Drawer panel */}
          <motion.aside
            className={styles.drawer}
            variants={drawerSlideIn}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={drawerSlideInTransition as any}
            role="complementary"
            aria-label={`Entity detail: ${entity.name}`}
          >
            <DrawerContent
              entity={entity}
              Icon={Icon}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onClose={onClose}
              onOpenFull={onOpenFull}
              onAddToGraph={onAddToGraph}
              onAddToCase={onAddToCase}
              onFlag={onFlag}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default EntityDrawer;