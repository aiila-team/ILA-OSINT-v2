// src/presentation/pages/analyst/AlertInboxPage.tsx
// ILA OSINT — Alert Inbox
// ─────────────────────────────────────────────────────
// Three-panel layout: Filter Sidebar / Alert Table / Investigation Panel
// Dark intelligence theme · Carbon Design System · Framer Motion
// Matches existing InvestigationsPage conventions.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  Tag,
  OverflowMenu,
  OverflowMenuItem,
  Accordion,
  AccordionItem,
} from '@carbon/react';

import {
  Close,
  ChevronLeft,
  ChevronRight,
} from '@carbon/icons-react';

import {
  drawerSlideIn,
  drawerSlideInTransition,
  tabFade,
  tabFadeTransition,
} from '../../../styles/motion';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import ThreatTag        from '../../../components/analyst/ThreatTag/ThreatTag';
import RiskGauge        from '../../../components/analyst/RiskGauge/RiskGauge';

import { useAlertInboxData } from '../../../hooks/useAlertInboxData';
import type {
  InboxAlert,
  AlertInboxStatus,
  SmartView,
} from '../../../hooks/useAlertInboxData';
import type { Priority } from '../../../hooks/useInvestigations';

import styles from './AlertInboxPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const SMART_VIEWS: Array<{ key: SmartView; label: string }> = [
  { key: 'MY_QUEUE',   label: 'MY QUEUE' },
  { key: 'UNASSIGNED', label: 'UNASSIGNED' },
  { key: 'ESCALATED',  label: 'ESCALATED' },
  { key: 'ALL',        label: 'ALL ALERTS' },
];

type StatusTagColor = 'blue' | 'cyan' | 'purple' | 'red' | 'gray';

const STATUS_TAG: Record<AlertInboxStatus, { type: StatusTagColor; label: string }> = {
  NEW:        { type: 'blue',   label: 'NEW' },
  ASSIGNED:   { type: 'cyan',   label: 'ASSIGNED' },
  IN_REVIEW:  { type: 'purple', label: 'IN REVIEW' },
  ESCALATED:  { type: 'red',    label: 'ESCALATED' },
  DISMISSED:  { type: 'gray',   label: 'DISMISSED' },
};

const SEVERITY_ORDER: Record<Priority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function getRelativeTime(dateString: string): string {
  const diff  = Date.now() - new Date(dateString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

// ─────────────────────────────────────────────────────────────────
// Live status indicator
// ─────────────────────────────────────────────────────────────────

const LiveStatusIndicator: React.FC = () => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.liveStatus}>
      <span className={styles.liveDot} aria-hidden="true" />
      <span className={styles.liveLabel}>LIVE</span>
      <span className={styles.liveTimestamp}>{formatUtc(now)}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Alert stats bar
// ─────────────────────────────────────────────────────────────────

const AlertStatsBar: React.FC<{ counts: Record<Priority, number> }> = ({ counts }) => (
  <div className={styles.statsBar}>
    <span className={`${styles.statChip} ${styles.statCritical}`}>{counts.CRITICAL} CRITICAL</span>
    <span className={`${styles.statChip} ${styles.statHigh}`}>{counts.HIGH} HIGH</span>
    <span className={`${styles.statChip} ${styles.statMedium}`}>{counts.MEDIUM} MEDIUM</span>
    <span className={`${styles.statChip} ${styles.statLow}`}>{counts.LOW} LOW</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Smart view tabs
// ─────────────────────────────────────────────────────────────────

const SmartViewsTabs: React.FC<{
  active: SmartView;
  onChange: (v: SmartView) => void;
  counts: Record<SmartView, number>;
}> = ({ active, onChange, counts }) => (
  <div className={styles.smartTabs}>
    {SMART_VIEWS.map(view => (
      <button
        key={view.key}
        className={`${styles.smartTab} ${active === view.key ? styles.smartTabActive : ''}`}
        onClick={() => onChange(view.key)}
      >
        {view.label}
        <span
          className={`${styles.smartBadge} ${view.key === 'UNASSIGNED' ? styles.smartBadgeAlert : ''}`}
        >
          {counts[view.key]}
        </span>
      </button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────
// Filter sidebar
// ─────────────────────────────────────────────────────────────────

interface FilterState {
  severity: Set<Priority>;
  source: Set<string>;
  status: Set<AlertInboxStatus>;
  minRisk: number;
}

const FilterSidebar: React.FC<{
  collapsed: boolean;
  onToggle: () => void;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  sources: string[];
}> = ({ collapsed, onToggle, filters, onChange, sources }) => {
  function toggleSeverity(value: Priority) {
    const next = new Set(filters.severity);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange({ ...filters, severity: next });
  }
  function toggleSource(value: string) {
    const next = new Set(filters.source);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange({ ...filters, source: next });
  }
  function toggleStatus(value: AlertInboxStatus) {
    const next = new Set(filters.status);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange({ ...filters, status: next });
  }

  if (collapsed) {
    return (
      <div className={styles.sidebarCollapsed}>
        <button
          className={styles.sidebarToggle}
          onClick={onToggle}
          aria-label="Expand filters"
          title="Toggle filters (F)"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <motion.aside
      className={styles.sidebar}
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 200 }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>FILTERS</span>
        <button
          className={styles.sidebarToggle}
          onClick={onToggle}
          aria-label="Collapse filters"
          title="Toggle filters (F)"
        >
          <ChevronLeft size={14} />
        </button>
      </div>

      <Accordion className={styles.accordion} size="sm">
        <AccordionItem title="Severity" open className={styles.accordionItem}>
          <div className={styles.filterChips}>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Priority[]).map(sev => (
              <button
                key={sev}
                className={`${styles.chipToggle} ${filters.severity.has(sev) ? styles.chipActive : ''}`}
                onClick={() => toggleSeverity(sev)}
              >
                <ThreatTag level={sev} size="sm" />
              </button>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Source" className={styles.accordionItem}>
          <div className={styles.filterChips}>
            {sources.map(src => (
              <button
                key={src}
                className={`${styles.chipToggle} ${filters.source.has(src) ? styles.chipActive : ''}`}
                onClick={() => toggleSource(src)}
              >
                {src}
              </button>
            ))}
          </div>
        </AccordionItem>

        <AccordionItem title="Date range" className={styles.accordionItem}>
          <p className={styles.filterHint}>Last 24 hours</p>
        </AccordionItem>

        <AccordionItem title="Risk score" className={styles.accordionItem}>
          <div className={styles.riskSliderWrap}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={filters.minRisk}
              onChange={e => onChange({ ...filters, minRisk: Number(e.target.value) })}
              className={styles.riskSlider}
            />
            <div className={styles.riskSliderLabel}>Min risk: {filters.minRisk}</div>
          </div>
        </AccordionItem>

        <AccordionItem title="Assigned to" className={styles.accordionItem}>
          <p className={styles.filterHint}>All analysts</p>
        </AccordionItem>

        <AccordionItem title="Status" className={styles.accordionItem}>
          <div className={styles.filterChips}>
            {(['NEW', 'ASSIGNED', 'IN_REVIEW', 'ESCALATED', 'DISMISSED'] as AlertInboxStatus[]).map(st => (
              <button
                key={st}
                className={`${styles.chipToggle} ${filters.status.has(st) ? styles.chipActive : ''}`}
                onClick={() => toggleStatus(st)}
              >
                {STATUS_TAG[st].label}
              </button>
            ))}
          </div>
        </AccordionItem>
      </Accordion>

      <div className={styles.shortcutHint}>
        <kbd>F</kbd> Toggle filters
      </div>
    </motion.aside>
  );
};

// ─────────────────────────────────────────────────────────────────
// Investigation panel
// ─────────────────────────────────────────────────────────────────

const InvestigationPanel: React.FC<{
  alert: InboxAlert | null;
  onClose: () => void;
  onMarkRead: (id: string) => Promise<void>;
  onMarkUnread: (id: string) => Promise<void>;
  onToggleFlag: (id: string) => Promise<void>;
  onAssignAnalyst: (id: string) => Promise<void>;
  onAddToCase: (id: string) => Promise<void>;
  onEscalate: (id: string) => Promise<void>;
}> = ({ alert, onClose, onMarkRead, onMarkUnread, onToggleFlag, onAssignAnalyst, onAddToCase, onEscalate }) => {
  if (!alert) {
    return (
      <motion.div
        key="empty"
        className={styles.investigationPane}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className={styles.emptyPanel}>
          <div className={styles.emptyIcon}>◎</div>
          <p className={styles.emptyText}>SELECT AN ALERT<br />TO BEGIN INVESTIGATION</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={alert.id}
      className={styles.investigationPane}
      variants={drawerSlideIn}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={drawerSlideInTransition}
    >
      {/* Header */}
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelAlertId}>{alert.id}</span>
          <span className={styles.panelTitle}>{alert.title}</span>
          <div className={styles.panelMetaRow}>
            <ThreatTag level={alert.severity} dot />
            <Tag type={STATUS_TAG[alert.status].type} className={styles.statusTagSmall}>
              {STATUS_TAG[alert.status].label}
            </Tag>
          </div>
        </div>
        <button className={styles.panelCloseBtn} onClick={onClose} aria-label="Close panel">
          <Close size={14} />
        </button>
      </div>

      {/* Body */}
      <div className={styles.panelBody}>
        <AnimatePresence mode="wait">
          <motion.div
            key={alert.id}
            variants={tabFade}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={tabFadeTransition}
          >
            {/* Risk gauge */}
            <div className={styles.riskRow}>
              <RiskGauge score={alert.riskScore} size={60} showLabel />
              <div className={styles.statBoxRow}>
                <div className={styles.statBox}>
                  <div className={styles.statVal}>{alert.source}</div>
                  <div className={styles.statLbl}>Source</div>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statVal}>{getRelativeTime(alert.receivedAt)}</div>
                  <div className={styles.statLbl}>Received</div>
                </div>
              </div>
            </div>

            {/* Alert summary / description */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Alert summary</span>
              <p className={styles.descText}>{alert.description}</p>
            </div>

            {/* Timeline */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Timeline</span>
              {alert.timeline.map((item: { text: string; time: string }, i: number) => (
                <div key={i} className={styles.tlItem}>
                  <span className={styles.tlDot} />
                  <div>
                    <div className={styles.tlText}>{item.text}</div>
                    <div className={styles.tlTime}>{item.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Source metadata */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Source metadata</span>
              <p className={styles.descText}>
                Sensor: {alert.sourceMeta.sensor}<br />
                Confidence: {alert.sourceMeta.confidence}<br />
                Reliability: {alert.sourceReliability ?? 'Unknown'}<br />
                Language: {alert.language ?? 'Unknown'}<br />
                Geo location: {alert.geoLocation ?? 'Not available'}
              </p>
            </div>

            {/* Keywords */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Keywords</span>
              <div className={styles.entityTags}>
                {alert.keywords.map((keyword: string) => (
                  <span key={keyword} className={styles.entityTag}>{keyword}</span>
                ))}
              </div>
            </div>

            {/* Related entities */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Related entities</span>
              <div className={styles.entityTags}>
                {alert.relatedEntities.map((ent: string) => (
                  <span key={ent} className={styles.entityTag}>{ent}</span>
                ))}
              </div>
            </div>

            {/* Analyst notes */}
            <div className={styles.ds}>
              <span className={styles.dsLabel}>Analyst notes</span>
              <textarea
                className={styles.noteInput}
                placeholder="Add a note..."
                defaultValue={alert.notes}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div className={styles.panelFooter}>
        <button
          className={styles.fBtnGhost}
          disabled={!alert}
          onClick={() => alert && (alert.isRead ? onMarkUnread(alert.id) : onMarkRead(alert.id))}
        >
          {alert.isRead ? 'Mark unread' : 'Mark read'}
        </button>
        <button
          className={styles.fBtnGhost}
          disabled={!alert}
          onClick={() => alert && onToggleFlag(alert.id)}
        >
          {alert.isFlagged ? 'Unflag' : 'Flag'}
        </button>
        <button
          className={styles.fBtnPrimary}
          disabled={!alert}
          onClick={() => alert && onAssignAnalyst(alert.id)}
        >
          Assign
        </button>
        <button
          className={styles.fBtnInvestigate}
          disabled={!alert}
          onClick={() => alert && onAddToCase(alert.id)}
        >
          Add to case
        </button>
        <button
          className={styles.fBtnEscalate}
          disabled={!alert}
          onClick={() => alert && onEscalate(alert.id)}
        >
          Escalate
        </button>
        <button className={styles.fBtnDanger}>Dismiss</button>
        <button className={styles.fBtnGhost}>Generate report entry</button>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────

const AlertInboxPage: React.FC = () => {
  const {
    alerts,
    counts,
    smartViewCounts,
    loading,
    error,
    refresh,
    updateAlert: updateAlertApi,
    assignAlert: assignAlertApi,
    escalateAlert: escalateAlertApi,
  } = useAlertInboxData();

  const [smartView, setSmartView] = useState<SmartView>('ALL');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<InboxAlert | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    severity: new Set(),
    source: new Set(),
    status: new Set(),
    minRisk: 0,
  });

  const sources = useMemo(
    () => Array.from(new Set(alerts.map((a: InboxAlert) => a.source))),
    [alerts],
  );

  const onMarkRead = useCallback(async (id: string) => {
    const updated = await updateAlertApi(id, { isRead: true });
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [updateAlertApi]);

  const onMarkUnread = useCallback(async (id: string) => {
    const updated = await updateAlertApi(id, { isRead: false });
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [updateAlertApi]);

  const onToggleFlag = useCallback(async (id: string) => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    const updated = await updateAlertApi(id, { isFlagged: !alert.isFlagged });
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [alerts, updateAlertApi]);

  const onAddToCase = useCallback(async (id: string) => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    const caseId = window.prompt('Enter a case ID for this alert', alert.caseId ?? 'CASE-');
    if (!caseId) return;
    const updated = await updateAlertApi(id, { caseId });
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [alerts, updateAlertApi]);

  const onAssignAnalyst = useCallback(async (id: string) => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;
    const initials = window.prompt('Enter analyst initials', alert.assignedTo ?? '');
    if (!initials) return;
    const name = window.prompt('Enter analyst full name', alert.assignedName ?? '');
    const updated = await assignAlertApi(id, { initials, name: name ?? undefined });
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [alerts, assignAlertApi]);

  const onEscalate = useCallback(async (id: string) => {
    const updated = await escalateAlertApi(id);
    setSelectedAlert(prev => (prev?.id === id ? updated : prev));
  }, [escalateAlertApi]);

  // Keyboard shortcut: F toggles filter sidebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSidebarCollapsed(c => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    let result = alerts;

    switch (smartView) {
      case 'MY_QUEUE':
        result = result.filter((a: InboxAlert) => a.assignedTo === 'RK');
        break;
      case 'UNASSIGNED':
        result = result.filter((a: InboxAlert) => a.assignedTo === null);
        break;
      case 'ESCALATED':
        result = result.filter((a: InboxAlert) => a.status === 'ESCALATED');
        break;
      default:
        break;
    }

    if (filters.severity.size > 0) {
      result = result.filter((a: InboxAlert) => filters.severity.has(a.severity));
    }
    if (filters.source.size > 0) {
      result = result.filter((a: InboxAlert) => filters.source.has(a.source));
    }
    if (filters.status.size > 0) {
      result = result.filter(a => filters.status.has(a.status));
    }
    if (filters.minRisk > 0) {
      result = result.filter(a => a.riskScore >= filters.minRisk);
    }

    return [...result].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [alerts, smartView, filters]);

  return (
    <AnalystPageShell
      title="ALERT INBOX"
      actions={<LiveStatusIndicator />}
    >
      <p className={styles.pageSubtitle}>Real-time intelligence feed</p>

      <AlertStatsBar counts={counts} />

      <SmartViewsTabs
        active={smartView}
        onChange={setSmartView}
        counts={smartViewCounts}
      />

      <div className={styles.pageLayout}>
        <FilterSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          filters={filters}
          onChange={setFilters}
          sources={sources}
        />

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>RISK</th>
                <th className={styles.th}>SEVERITY</th>
                <th className={styles.th}>ALERT ID</th>
                <th className={styles.th}>TITLE</th>
                <th className={styles.th}>SOURCE</th>
                <th className={styles.th}>ENTITY</th>
                <th className={styles.th}>RECEIVED</th>
                <th className={styles.th}>STATUS</th>
                <th className={styles.th}>ASSIGNED</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={10}>
                    <div className={styles.loadingState}>
                      <div className={styles.loadingSpinner} aria-hidden="true" />
                      <div>Loading alerts…</div>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={10}>
                    <div className={styles.errorState}>
                      <p>{error}</p>
                      <button className={styles.retryButton} type="button" onClick={refresh}>
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className={styles.emptyCell} colSpan={10}>NO ALERTS MATCH CURRENT FILTERS</td>
                </tr>
              ) : (
                filtered.map(alert => {
                  const isCritical = alert.severity === 'CRITICAL';
                  const isSelected = selectedAlert?.id === alert.id;
                  return (
                    <motion.tr
                      key={alert.id}
                      className={`${styles.tableRow} ${isCritical ? styles.criticalRow : ''} ${isSelected ? styles.selectedRow : ''}`}
                      onClick={() => setSelectedAlert(alert)}
                      animate={isCritical ? { opacity: [1, 0.7, 1] } : undefined}
                      transition={isCritical ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
                    >
                      <td className={styles.td}>
                        <RiskGauge score={alert.riskScore} size={40} showLabel />
                      </td>
                      <td className={styles.td}>
                        <ThreatTag level={alert.severity} />
                      </td>
                      <td className={`${styles.td} ${styles.alertId}`}>{alert.id}</td>
                      <td className={`${styles.td} ${styles.titleCell}`}>{alert.title}</td>
                      <td className={styles.td}>
                        <span className={styles.sourceBadge}>{alert.source}</span>
                      </td>
                      <td className={`${styles.td} ${styles.entityCell}`}>{alert.entity}</td>
                      <td className={styles.td}>{getRelativeTime(alert.receivedAt)}</td>
                      <td className={styles.td}>
                        <Tag type={STATUS_TAG[alert.status].type} className={styles.statusTagSmall}>
                          {STATUS_TAG[alert.status].label}
                        </Tag>
                      </td>
                      <td className={styles.td}>
                        {alert.assignedTo ? (
                          <span className={styles.avatar} title={alert.assignedName}>{alert.assignedTo}</span>
                        ) : (
                          <span className={styles.unassigned}>—</span>
                        )}
                      </td>
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <OverflowMenu size="sm" flipped aria-label="Alert actions">
                          <OverflowMenuItem
                            itemText={alert.isRead ? 'Mark unread' : 'Mark read'}
                            onClick={() => alert.isRead ? onMarkUnread(alert.id) : onMarkRead(alert.id)}
                          />
                          <OverflowMenuItem
                            itemText={alert.isFlagged ? 'Unflag' : 'Flag'}
                            onClick={() => onToggleFlag(alert.id)}
                          />
                          <OverflowMenuItem itemText="Assign analyst" onClick={() => onAssignAnalyst(alert.id)} />
                          <OverflowMenuItem itemText="Add to case" onClick={() => onAddToCase(alert.id)} />
                          <OverflowMenuItem itemText="Escalate" onClick={() => onEscalate(alert.id)} />
                        </OverflowMenu>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <AnimatePresence mode="wait">
          <InvestigationPanel
            key={selectedAlert?.id ?? 'empty'}
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
            onToggleFlag={onToggleFlag}
            onAssignAnalyst={onAssignAnalyst}
            onAddToCase={onAddToCase}
            onEscalate={onEscalate}
          />
        </AnimatePresence>
      </div>
    </AnalystPageShell>
  );
};

export default AlertInboxPage;

