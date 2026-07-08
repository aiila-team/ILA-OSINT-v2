// src/presentation/pages/admin/SystemHealthPage.tsx
// ILA OSINT — System Health Dashboard
// Real-time service monitoring: stat cards, service matrix, incident timeline.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Accordion, AccordionItem } from '@carbon/react';
import {
  ServerProxy,
  CheckmarkFilled,
  WarningAlt,
  Renew,
  Activity,
  DataBase,
  Search,
  Security,
  Api,
  IbmWatsonNaturalLanguageUnderstanding,
  Network_3,
  CircleDash,
} from '@carbon/icons-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import styles from './SystemHealthPage.module.scss';

// ── Types ─────────────────────────────────────────────────────────

type ServiceStatus = 'OPERATIONAL' | 'DEGRADED' | 'DOWN';

interface SparkPoint {
  v: number;
}

interface Service {
  id:          string;
  name:        string;
  description: string;
  icon:        React.ReactNode;
  status:      ServiceStatus;
  latency:     number | null; // ms, null = unreachable
  uptime:      number;        // percentage
  trend:       SparkPoint[];
}

type IncidentSeverity = 'CRITICAL' | 'DEGRADED' | 'RESOLVED' | 'INFO';

interface Incident {
  id:          string;
  time:        string;
  service:     string;
  description: string;
  severity:    IncidentSeverity;
}

// ── Mock data ─────────────────────────────────────────────────────

function makeTrend(vals: number[]): SparkPoint[] {
  return vals.map((v) => ({ v }));
}

const BASE_SERVICES: Service[] = [
  {
    id:          'auth',
    name:        'Auth Service',
    description: 'JWT / session management',
    icon:        <Security size={13} />,
    status:      'DOWN',
    latency:     null,
    uptime:      97.21,
    trend:       makeTrend([82, 88, 74, 48, 22, 4, 4]),
  },
  {
    id:          'api-gw',
    name:        'API Gateway',
    description: 'Request routing & rate limit',
    icon:        <Api size={13} />,
    status:      'OPERATIONAL',
    latency:     84,
    uptime:      99.97,
    trend:       makeTrend([68, 72, 69, 74, 68, 71, 69]),
  },
  {
    id:          'search',
    name:        'Search Engine',
    description: 'Elasticsearch / OSINT indexer',
    icon:        <Search size={13} />,
    status:      'DEGRADED',
    latency:     487,
    uptime:      98.44,
    trend:       makeTrend([60, 72, 90, 96, 100, 94, 98]),
  },
  {
    id:          'graph',
    name:        'Graph Engine',
    description: 'Neo4j / link analysis',
    icon:        <Network_3 size={13} />,
    status:      'OPERATIONAL',
    latency:     112,
    uptime:      99.91,
    trend:       makeTrend([65, 72, 60, 68, 64, 70, 62]),
  },
  {
    id:          'ml',
    name:        'ML Inference',
    description: 'NLP / entity classification',
    icon:        <IbmWatsonNaturalLanguageUnderstanding size={13} />,
    status:      'OPERATIONAL',
    latency:     231,
    uptime:      99.72,
    trend:       makeTrend([70, 78, 74, 82, 75, 70, 66]),
  },
  {
    id:          'db',
    name:        'Database (PostgreSQL)',
    description: 'Primary data store',
    icon:        <DataBase size={13} />,
    status:      'OPERATIONAL',
    latency:     43,
    uptime:      99.99,
    trend:       makeTrend([52, 56, 52, 56, 52, 60, 56]),
  },
  {
    id:          'ingest',
    name:        'Data Ingest Pipeline',
    description: 'Feed processors / queue workers',
    icon:        <Activity size={13} />,
    status:      'OPERATIONAL',
    latency:     167,
    uptime:      99.61,
    trend:       makeTrend([72, 80, 76, 84, 78, 76, 80]),
  },
  {
    id:          'cache',
    name:        'Cache Layer (Redis)',
    description: 'Session & query cache',
    icon:        <ServerProxy size={13} />,
    status:      'OPERATIONAL',
    latency:     7,
    uptime:      99.98,
    trend:       makeTrend([30, 34, 28, 32, 30, 36, 32]),
  },
  {
    id:          'geoint',
    name:        'GeoIntel Service',
    description: 'Tile server / ADS-B / AIS feeds',
    icon:        <CircleDash size={13} />,
    status:      'OPERATIONAL',
    latency:     143,
    uptime:      99.54,
    trend:       makeTrend([74, 78, 82, 76, 80, 78, 82]),
  },
];

const INCIDENTS: Incident[] = [
  {
    id:          'INC-001',
    time:        '02:14 AM',
    service:     'Auth Service',
    description: 'Service outage detected — JWT validation failures, 100% error rate on login endpoints.',
    severity:    'CRITICAL',
  },
  {
    id:          'INC-002',
    time:        '04:32 AM',
    service:     'Search Engine',
    description: 'Latency spike detected — p99 latency exceeded 450ms threshold, indexing queue backing up.',
    severity:    'DEGRADED',
  },
  {
    id:          'INC-003',
    time:        '08:55 AM',
    service:     'ML Inference',
    description: 'Elevated response times on entity classification — auto-scaled workers deployed and stabilised.',
    severity:    'RESOLVED',
  },
];

// ── Helpers ───────────────────────────────────────────────────────

function getLatencyClass(latency: number | null): string {
  if (latency === null) return styles.latSlow;
  if (latency < 100)   return styles.latFast;
  if (latency < 300)   return styles.latMed;
  return styles.latSlow;
}

function getUptimeClass(uptime: number): string {
  if (uptime >= 99.5) return styles.uptimeHigh;
  if (uptime >= 98)   return styles.uptimeMed;
  return styles.uptimeLow;
}

function getSparkColor(status: ServiceStatus): string {
  if (status === 'DOWN')     return '#e05050';
  if (status === 'DEGRADED') return '#d4a017';
  return '#00c97a';
}

function formatTimestamp(): string {
  return new Date().toLocaleTimeString('en-IN', {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ' IST';
}

// Slightly jitter trend data on refresh (simulates live data)
function jitterTrend(trend: SparkPoint[]): SparkPoint[] {
  return trend.map(({ v }) => ({
    v: Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 10)),
  }));
}

function refreshServices(prev: Service[]): Service[] {
  return prev.map((s) => ({
    ...s,
    latency: s.latency !== null
      ? Math.max(1, s.latency + Math.round((Math.random() - 0.5) * 20))
      : null,
    trend: jitterTrend(s.trend),
  }));
}

// ── useInterval hook ──────────────────────────────────────────────

function useInterval(callback: () => void, delay: number) {
  const saved = useRef<() => void>(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ── Animation variants ────────────────────────────────────────────

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } },
};

const fadeSlideUp = {
  initial:  { opacity: 0, y: 16 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -8 },
};

const fadeSlideUpTransition = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const };

const cardVariant = {
  initial:  { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};
const pulseVariant = {
  animate: {
    opacity: [1, 0.55, 1],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

// ── Stat Card ─────────────────────────────────────────────────────

interface StatCardProps {
  label:     string;
  value:     number | string;
  icon:      React.ReactNode;
  accent:    'cyan' | 'green' | 'yellow';
  sub:       string;
  subIcon:   React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, accent, sub, subIcon }) => (
  <motion.div
    className={`${styles.statCard} ${styles[`statCard_${accent}`]}`}
    variants={cardVariant}
  >
    <span className={styles.scanLine} aria-hidden="true" />
    <div className={styles.statTop}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statIcon} ${styles[`statIcon_${accent}`]}`} aria-hidden="true">
        {icon}
      </span>
    </div>
    <div className={`${styles.statNum} ${styles[`statNum_${accent}`]}`} aria-live="polite">
      {String(value).padStart(2, '0')}
    </div>
    <div className={styles.statBottom}>
      <span className={`${styles.statSubIcon} ${styles[`statNum_${accent}`]}`} aria-hidden="true">
        {subIcon}
      </span>
      <span className={`${styles.statSub} ${styles[`statSub_${accent}`]}`}>{sub}</span>
    </div>
  </motion.div>
);

// ── Sparkline ─────────────────────────────────────────────────────

const Sparkline: React.FC<{ data: SparkPoint[]; status: ServiceStatus }> = ({ data, status }) => (
  <div style={{ width: 88, height: 26 }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={getSparkColor(status)}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// ── Status Tag ────────────────────────────────────────────────────

const StatusTag: React.FC<{ status: ServiceStatus }> = ({ status }) => {
  const cls =
    status === 'OPERATIONAL' ? styles.statusOp :
    status === 'DEGRADED'    ? styles.statusDeg :
    styles.statusDown;

  return (
    <span className={`${styles.statusTag} ${cls}`} role="status">
      <span className={styles.statusDot} aria-hidden="true" />
      {status}
    </span>
  );
};

// ── Incident severity classes ─────────────────────────────────────

function incSevClass(s: IncidentSeverity) {
  if (s === 'CRITICAL') return styles.incBadgeCrit;
  if (s === 'DEGRADED') return styles.incBadgeWarn;
  if (s === 'RESOLVED') return styles.incBadgeRes;
  return styles.incBadgeInfo;
}

function incDotClass(s: IncidentSeverity) {
  if (s === 'CRITICAL') return styles.incDotCrit;
  if (s === 'DEGRADED') return styles.incDotWarn;
  if (s === 'RESOLVED') return styles.incDotRes;
  return styles.incDotInfo;
}

// ── Main Page ─────────────────────────────────────────────────────

const SystemHealthPage: React.FC = () => {
  const [services,    setServices]    = useState<Service[]>(BASE_SERVICES);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState(formatTimestamp());
  const [countdown,   setCountdown]   = useState(15);

  // Derived counts
  const totalSvcs       = services.length;
  const operationalSvcs = services.filter((s) => s.status === 'OPERATIONAL').length;
  const degradedSvcs    = services.filter((s) => s.status !== 'OPERATIONAL').length;

  const doRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setServices((prev) => refreshServices(prev));
      setLastUpdated(formatTimestamp());
      setRefreshing(false);
      setCountdown(15);
    }, 600);
  }, []);

  // Auto-refresh every 15 s
  useInterval(doRefresh, 15_000);

  // Countdown ticker
  useInterval(() => {
    setCountdown((c) => (c <= 1 ? 15 : c - 1));
  }, 1_000);

  return (
    <motion.div
      className={styles.page}
      variants={fadeSlideUp}
      initial="initial"
      animate="animate"
      transition={fadeSlideUpTransition}
    >
      {/* ── Page header ────────────────────────────────────── */}
      <header className={styles.header}>
        <p className={styles.breadcrumb}>
          ADMINISTRATION <span>›</span> MONITORING <span>›</span> SYSTEM HEALTH
        </p>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>SYSTEM HEALTH DASHBOARD</h1>
            <p className={styles.pageSubtitle}>
              Real-time service status, latency monitoring, and incident tracking across all platform components.
            </p>
          </div>

          {/* Topbar right: live indicator + refresh */}
          <div className={styles.headerRight}>
            <AnimatePresence>
              {refreshing && (
                <motion.span
                  className={styles.refreshingLabel}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className={styles.spinnerDot} aria-hidden="true" />
                  REFRESHING…
                </motion.span>
              )}
            </AnimatePresence>

            <div className={styles.liveBadge}>
              <span className={styles.liveDot} aria-hidden="true" />
              <span className={styles.liveTxt}>AUTO REFRESH · {countdown}s</span>
            </div>

            <button
              className={styles.refreshBtn}
              onClick={doRefresh}
              disabled={refreshing}
              aria-label="Refresh now"
            >
              <Renew size={14} />
              REFRESH NOW
            </button>
          </div>
        </div>
      </header>

      {/* ── Stat cards ─────────────────────────────────────── */}
      <motion.div
        className={styles.statRow}
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <StatCard
          label="TOTAL SERVICES"
          value={totalSvcs}
          icon={<ServerProxy size={18} />}
          accent="cyan"
          sub="ALL SERVICES MONITORED"
          subIcon={<Renew size={12} />}
        />
        <StatCard
          label="OPERATIONAL"
          value={operationalSvcs}
          icon={<CheckmarkFilled size={18} />}
          accent="green"
          sub="↑ 99.6% AVG UPTIME"
          subIcon={<CheckmarkFilled size={12} />}
        />
        <StatCard
          label="DEGRADED / DOWN"
          value={degradedSvcs}
          icon={<WarningAlt size={18} />}
          accent="yellow"
          sub="INCIDENT ACTIVE · 02:14 AM"
          subIcon={<WarningAlt size={12} />}
        />
      </motion.div>

      {/* ── Service status table ────────────────────────────── */}
      <motion.section
        className={styles.tablePanel}
        variants={fadeSlideUp}
        initial="initial"
        animate="animate"
        transition={{ ...fadeSlideUpTransition, delay: 0.12 }}
      >
        <div className={styles.tableHeader}>
          <div className={styles.tableTitle}>
            <ServerProxy size={15} />
            SERVICE STATUS MATRIX
          </div>
          <span className={styles.lastUpdated}>
            LAST UPDATED · {lastUpdated}
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Service status matrix">
            <thead>
              <tr className={styles.thead}>
                <th className={styles.thService}>SERVICE</th>
                <th className={styles.th}>STATUS</th>
                <th className={styles.th}>LATENCY</th>
                <th className={styles.th}>UPTIME (30D)</th>
                <th className={styles.th}>TREND (15 MIN)</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => {
                const isDegraded = svc.status !== 'OPERATIONAL';

                const RowWrapper = isDegraded ? motion.tr : 'tr' as unknown as typeof motion.tr;
                const rowProps = isDegraded
                  ? { variants: pulseVariant, animate: 'animate', className: `${styles.row} ${styles.rowDegraded}` }
                  : { className: styles.row };

                return (
                  // @ts-ignore — motion.tr / tr union
                  <RowWrapper key={svc.id} {...rowProps}>
                    {/* Service name */}
                    <td className={styles.tdService}>
                      <div className={styles.svcWrap}>
                        <span className={styles.svcIcon} aria-hidden="true">{svc.icon}</span>
                        <div>
                          <div className={styles.svcName}>{svc.name}</div>
                          <div className={styles.svcDesc}>{svc.description}</div>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className={styles.td}>
                      <StatusTag status={svc.status} />
                    </td>

                    {/* Latency */}
                    <td className={styles.td}>
                      <span className={`${styles.latency} ${getLatencyClass(svc.latency)}`}>
                        {svc.latency !== null ? `${svc.latency}ms` : '—'}
                      </span>
                    </td>

                    {/* Uptime */}
                    <td className={styles.td}>
                      <div className={styles.uptimeWrap}>
                        <div className={styles.uptimePct}>{svc.uptime.toFixed(2)}%</div>
                        <div className={styles.uptimeBarBg}>
                          <div
                            className={`${styles.uptimeBar} ${getUptimeClass(svc.uptime)}`}
                            style={{ width: `${svc.uptime}%` }}
                            role="progressbar"
                            aria-valuenow={svc.uptime}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${svc.name} uptime ${svc.uptime}%`}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Trend sparkline */}
                    <td className={styles.td}>
                      <Sparkline data={svc.trend} status={svc.status} />
                    </td>
                  </RowWrapper>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── Incident timeline ───────────────────────────────── */}
      <motion.section
        className={styles.incidentPanel}
        variants={fadeSlideUp}
        initial="initial"
        animate="animate"
        transition={{ ...fadeSlideUpTransition, delay: 0.22 }}
      >
        <Accordion className={styles.accordion}>
          <AccordionItem
            title={
              <div className={styles.incAccordionTitle}>
                <div className={styles.incTitleLeft}>
                  <WarningAlt size={15} className={styles.incTitleIcon} />
                  <span className={styles.incTitleText}>INCIDENT TIMELINE — LAST 24 HOURS</span>
                </div>
                <span className={styles.incCount}>{INCIDENTS.length} INCIDENTS</span>
              </div>
            }
            className={styles.accordionItem}
            open
          >
            <div className={styles.incList}>
              {INCIDENTS.map((inc) => (
                <div key={inc.id} className={styles.incRow}>
                  <span className={`${styles.incDot} ${incDotClass(inc.severity)}`} aria-hidden="true" />
                  <span className={styles.incTime}>{inc.time}</span>
                  <span className={styles.incService}>{inc.service}</span>
                  <span className={styles.incDesc}>{inc.description}</span>
                  <span className={`${styles.incBadge} ${incSevClass(inc.severity)}`}>
                    {inc.severity}
                  </span>
                </div>
              ))}
            </div>
          </AccordionItem>
        </Accordion>
      </motion.section>
    </motion.div>
  );
};

export default SystemHealthPage;