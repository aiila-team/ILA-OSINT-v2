import React, { Suspense, useEffect } from 'react';
import { DataTableSkeleton } from '@carbon/react';
import { useUIStore } from '../../../States/useUIStore';
import AnalyticsPanel from '../../../visualization/AnalyticsPanel';
import styles from './DashboardPage.module.scss';

// ── Analyst pages — lazy loaded ───────────────────────────────────
const InvestigationsPage = React.lazy(() => import('../analyst/InvestigationsPage'));
const AlertInboxPage     = React.lazy(() => import('../analyst/AlertInboxPage'));
const EntitySearchPage   = React.lazy(() => import('../analyst/EntitySearchPage'));
const GeoIntelPage       = React.lazy(() => import('../analyst/GeoIntelPage'));
const GraphAnalysisPage  = React.lazy(() => import('../analyst/GraphAnalysisPage'));
const TimelinePage       = React.lazy(() => import('../analyst/TimelinePage'));
const CaseManagementPage = React.lazy(() => import('../analyst/CaseManagementPage'));
const ReportsPage        = React.lazy(() => import('../analyst/ReportsPage'));

// ── Suspense fallback ─────────────────────────────────────────────
const PageSkeleton: React.FC = () => (
  <div style={{ padding: '2rem' }}>
    <DataTableSkeleton
      columnCount={5}
      rowCount={8}
      showHeader
      showToolbar
    />
  </div>
);

// ── Generic placeholder panel ─────────────────────────────────────
const ComingSoon: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className={styles.comingSoon}>
    <div className={styles.csInner}>
      <div className={styles.csLabel}>MODULE</div>
      <h2 className={styles.csTitle}>{title}</h2>
      <p className={styles.csDesc}>{desc}</p>
      <div className={styles.csStatus}>
        <span className={styles.csDot} />
        READY FOR INTEGRATION
      </div>
    </div>
  </div>
);

// ── User Management — Create User ─────────────────────────────────
const CreateUser: React.FC = () => (
  <div className={styles.formPanel}>
    <div className={styles.formHeader}>
      <span className={styles.formTitle}>CREATE USER</span>
      <span className={styles.formSub}>Add a new analyst or administrator to the platform</span>
    </div>
    <div className={styles.formGrid}>
      {[
        { label: 'USERNAME / BADGE ID', placeholder: 'analyst.id' },
        { label: 'FULL NAME',           placeholder: 'First Last' },
        { label: 'EMAIL ADDRESS',       placeholder: 'user@org.gov' },
        { label: 'ORGANIZATION ID',     placeholder: 'ORG-XXXXX' },
        { label: 'DEPARTMENT',          placeholder: 'Intelligence / SOC / Admin' },
        { label: 'TEMPORARY PASSWORD',  placeholder: '••••••••••' },
      ].map((f) => (
        <div key={f.label} className={styles.formField}>
          <label className={styles.fieldLabel}>{f.label}</label>
          <input className={styles.fieldInput} placeholder={f.placeholder} type={f.label.includes('PASSWORD') ? 'password' : 'text'} />
        </div>
      ))}
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>ROLE</label>
        <select className={styles.fieldInput}>
          <option>analyst</option>
          <option>admin</option>
          <option>viewer</option>
        </select>
      </div>
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>ACCESS LEVEL</label>
        <select className={styles.fieldInput}>
          <option>Standard</option>
          <option>Elevated</option>
          <option>Restricted</option>
        </select>
      </div>
    </div>
    <button className={styles.submitBtn}>CREATE USER →</button>
  </div>
);

// ── User Management — Active Users ────────────────────────────────
const MOCK_USERS = [
  { id: 'USR-001', name: 'Admin',       role: 'admin',   status: 'ONLINE',  last: 'Just now',  org: 'ORG-00001' },
  { id: 'USR-002', name: 'J. Reyes',    role: 'analyst', status: 'ONLINE',  last: '2 min ago', org: 'ORG-00001' },
  { id: 'USR-003', name: 'M. Chen',     role: 'analyst', status: 'OFFLINE', last: '1 hr ago',  org: 'ORG-00002' },
  { id: 'USR-004', name: 'K. Patel',    role: 'viewer',  status: 'OFFLINE', last: '3 hrs ago', org: 'ORG-00001' },
  { id: 'USR-005', name: 'T. Williams', role: 'analyst', status: 'ONLINE',  last: '5 min ago', org: 'ORG-00003' },
];

const ActiveUsers: React.FC = () => (
  <div className={styles.tablePanel}>
    <div className={styles.tableHeader}>
      <span className={styles.tableTitle}>ACTIVE USERS</span>
      <span className={styles.tableCount}>{MOCK_USERS.length} USERS</span>
    </div>
    <table className={styles.table}>
      <thead>
        <tr>
          {['USER ID', 'NAME', 'ROLE', 'ORG', 'STATUS', 'LAST ACTIVE', 'ACTIONS'].map((h) => (
            <th key={h} className={styles.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {MOCK_USERS.map((u) => (
          <tr key={u.id} className={styles.tr}>
            <td className={`${styles.td} ${styles.mono}`}>{u.id}</td>
            <td className={styles.td}>{u.name}</td>
            <td className={styles.td}>
              <span className={`${styles.roleBadge} ${u.role === 'admin' ? styles.roleAdmin : u.role === 'analyst' ? styles.roleAnalyst : styles.roleViewer}`}>
                {u.role}
              </span>
            </td>
            <td className={`${styles.td} ${styles.mono}`}>{u.org}</td>
            <td className={styles.td}>
              <span className={styles.statusPill} style={{ color: u.status === 'ONLINE' ? '#24a148' : '#6b7a8d' }}>
                <span className={styles.statusDotSmall} style={{ background: u.status === 'ONLINE' ? '#24a148' : '#3a4a5c' }} />
                {u.status}
              </span>
            </td>
            <td className={`${styles.td} ${styles.muted}`}>{u.last}</td>
            <td className={styles.td}>
              <div className={styles.actions}>
                <button className={styles.actionBtn}>EDIT</button>
                <button className={styles.actionBtnDanger}>REVOKE</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── System Health ─────────────────────────────────────────────────
const HEALTH_SERVICES = [
  { name: 'API Gateway',     status: 'OPERATIONAL', latency: '28ms',  uptime: '99.99%' },
  { name: 'Graph Engine',    status: 'OPERATIONAL', latency: '64ms',  uptime: '99.97%' },
  { name: 'Auth Service',    status: 'OPERATIONAL', latency: '12ms',  uptime: '100%'   },
  { name: 'Ingest Pipeline', status: 'DEGRADED',    latency: '340ms', uptime: '97.2%'  },
  { name: 'Search Index',    status: 'OPERATIONAL', latency: '55ms',  uptime: '99.9%'  },
  { name: 'Audit Logger',    status: 'OPERATIONAL', latency: '8ms',   uptime: '100%'   },
];

const SystemHealth: React.FC = () => (
  <div className={styles.tablePanel}>
    <div className={styles.tableHeader}>
      <span className={styles.tableTitle}>SYSTEM HEALTH</span>
      <span className={styles.tableCount} style={{ color: '#24a148' }}>5/6 NOMINAL</span>
    </div>
    <table className={styles.table}>
      <thead>
        <tr>
          {['SERVICE', 'STATUS', 'LATENCY', 'UPTIME (30D)'].map((h) => (
            <th key={h} className={styles.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {HEALTH_SERVICES.map((s) => (
          <tr key={s.name} className={styles.tr}>
            <td className={styles.td}>{s.name}</td>
            <td className={styles.td}>
              <span style={{ color: s.status === 'OPERATIONAL' ? '#24a148' : '#f1c21b', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}>
                {s.status}
              </span>
            </td>
            <td className={`${styles.td} ${styles.mono}`}>{s.latency}</td>
            <td className={`${styles.td} ${styles.mono}`} style={{ color: parseFloat(s.uptime) > 99 ? '#24a148' : '#f1c21b' }}>
              {s.uptime}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Audit Logs ────────────────────────────────────────────────────
const AUDIT_LOGS = [
  { id: 'EVT-9921', user: 'admin',      action: 'USER_LOGIN',      resource: 'Auth',          time: '06:57Z', ip: '10.0.1.4' },
  { id: 'EVT-9920', user: 'j.reyes',    action: 'CASE_CREATED',    resource: 'Case MGR',      time: '06:51Z', ip: '10.0.1.7' },
  { id: 'EVT-9919', user: 'admin',      action: 'USER_CREATED',    resource: 'User MGR',      time: '06:44Z', ip: '10.0.1.4' },
  { id: 'EVT-9918', user: 'm.chen',     action: 'REPORT_EXPORTED', resource: 'Reports',       time: '05:33Z', ip: '10.0.2.3' },
  { id: 'EVT-9917', user: 'k.patel',    action: 'ENTITY_SEARCH',   resource: 'Search Engine', time: '04:12Z', ip: '10.0.1.9' },
  { id: 'EVT-9916', user: 't.williams', action: 'POLICY_MODIFIED', resource: 'Security',      time: '03:58Z', ip: '10.0.3.1' },
];

const AuditLogs: React.FC = () => (
  <div className={styles.tablePanel}>
    <div className={styles.tableHeader}>
      <span className={styles.tableTitle}>AUDIT LOGS</span>
      <span className={styles.tableCount}>3,421 EVENTS (24H)</span>
    </div>
    <table className={styles.table}>
      <thead>
        <tr>
          {['EVENT ID', 'USER', 'ACTION', 'RESOURCE', 'IP ADDRESS', 'TIME'].map((h) => (
            <th key={h} className={styles.th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {AUDIT_LOGS.map((l) => (
          <tr key={l.id} className={styles.tr}>
            <td className={`${styles.td} ${styles.mono}`} style={{ color: 'var(--accent)' }}>{l.id}</td>
            <td className={`${styles.td} ${styles.mono}`}>{l.user}</td>
            <td className={styles.td}>
              <span className={styles.actionTag}>{l.action}</span>
            </td>
            <td className={styles.td}>{l.resource}</td>
            <td className={`${styles.td} ${styles.mono} ${styles.muted}`}>{l.ip}</td>
            <td className={`${styles.td} ${styles.mono} ${styles.muted}`}>{l.time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Page Router ───────────────────────────────────────────────────
const DashboardPage: React.FC = () => {
  const { activeItem, setActiveItem } = useUIStore();

  useEffect(() => {
    const mapPathToItem: Record<string, string> = {
      '/analyst/geointel': 'geointel',
      '/analyst/investigations': 'investigations',
      '/analyst/alerts': 'alerts',
      '/analyst/entity-search': 'entity-search',
      '/analyst/graph-analysis': 'graph-analysis',
      '/analyst/timeline': 'timeline',
      '/analyst/cases': 'cases',
      '/analyst/reports': 'reports',
      '/admin/system-health': 'system-health',
      '/admin/audit-logs': 'audit-logs',
    };

    const routeItem = mapPathToItem[window.location.pathname];
    if (routeItem && routeItem !== activeItem) {
      setActiveItem(routeItem);
    }

    const handlePopState = () => {
      const poppedItem = mapPathToItem[window.location.pathname];
      if (poppedItem) {
        setActiveItem(poppedItem);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeItem, setActiveItem]);

  const renderPage = () => {
    switch (activeItem) {
      // ── Admin pages (existing — untouched) ──────────────
      case 'overview':       return <AnalyticsPanel />;
      case 'create-user':    return <CreateUser />;
      case 'active-users':   return <ActiveUsers />;
      case 'system-health':  return <SystemHealth />;
      case 'audit-logs':     return <AuditLogs />;
      case 'access-control': return <ComingSoon title="Access Control"   desc="Manage IP allowlists, MFA policies, and session controls." />;
      case 'policies':       return <ComingSoon title="Security Policies" desc="Configure data retention, classification, and export policies." />;
      case 'roles':          return <ComingSoon title="Roles & Permissions" desc="Define role-based access control policies for platform users." />;

      // ── Analyst pages (new — lazy loaded) ───────────────
      case 'investigations': return <InvestigationsPage />;
      case 'alerts':         return <AlertInboxPage />;
      case 'entity-search':   return <EntitySearchPage />;
      case 'geointel':        return <GeoIntelPage />;
      case 'graph-analysis':  return <GraphAnalysisPage />;
      case 'timeline':        return <TimelinePage />;
      case 'cases':          return <CaseManagementPage />;
      case 'reports':        return <ReportsPage />;

      default:               return <AnalyticsPanel />;
    }
  };

  return (
    <div className={styles.page}>
      <Suspense fallback={<PageSkeleton />}>
        {renderPage()}
      </Suspense>
    </div>
  );
};

export default DashboardPage;