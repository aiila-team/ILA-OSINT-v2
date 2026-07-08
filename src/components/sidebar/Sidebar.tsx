import React from 'react';
import {
  Search, Warning, ChartNetwork, Time, Portfolio,
  Report, UserMultiple, UserAdmin, Security, Activity,
  CloudAuditing, Settings, Logout, Dashboard,
  ChevronDown, UserRole, Location,
} from '@carbon/icons-react';
import { useUIStore } from '../../States/useUIStore';
import styles from './Sidebar.module.scss';

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { id: string; label: string; icon: React.ReactNode; path?: string }[];
}

const ANALYST_SECTIONS: NavSection[] = [
  { id: 'geointel',      label: 'GeoIntel',       path: '/analyst/geointel', icon: <Location size={16} /> },
  { id: 'investigations', label: 'Investigations', path: '/analyst/investigations', icon: <Search size={16} /> },
  { id: 'alerts',         label: 'Alert Inbox',    path: '/analyst/alerts', icon: <Warning size={16} /> },
  { id: 'entity-search',  label: 'Entity Search',  path: '/analyst/entity-search', icon: <Search size={16} /> },
  { id: 'graph-analysis', label: 'Graph Analysis', path: '/analyst/graph-analysis', icon: <ChartNetwork size={16} /> },
  { id: 'timeline',       label: 'Timeline',       path: '/analyst/timeline', icon: <Time size={16} /> },
  { id: 'cases',          label: 'Case Mgmt',      path: '/analyst/cases', icon: <Portfolio size={16} /> },
  { id: 'reports',        label: 'Reports',        path: '/analyst/reports', icon: <Report size={16} /> },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    id: 'user-management',
    label: 'User Management',
    icon: <UserMultiple size={16} />,
    children: [
      { id: 'create-user',   label: 'Create User',         icon: <UserAdmin size={14} />, path: '/admin/create-user' },
      { id: 'active-users',  label: 'Active Users',        icon: <UserMultiple size={14} />, path: '/admin/active-users' },
      { id: 'roles',         label: 'Roles & Permissions', icon: <UserRole size={14} />, path: '/admin/roles' },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    icon: <Activity size={16} />,
    children: [
      { id: 'system-health', label: 'System Health', icon: <Activity size={14} />, path: '/admin/system-health' },
      { id: 'audit-logs',    label: 'Audit Logs',    icon: <CloudAuditing size={14} />, path: '/admin/audit-logs' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: <Security size={16} />,
    children: [
      { id: 'access-control', label: 'Access Control', icon: <Security size={14} />, path: '/admin/access-control' },
      { id: 'policies',       label: 'Policies',       icon: <Settings size={14} />, path: '/admin/policies' },
    ],
  },
];

interface SidebarProps {
  username: string;
  role: string;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ username, role, onLogout }) => {
  const { sidebarOpen, expandedSections, activeItem, toggleSection, setActiveItem } =
    useUIStore();

  const isExpanded = (id: string) => expandedSections.includes(id);

  return (
    <aside className={`${styles.sidebar} ${!sidebarOpen ? styles.collapsed : ''}`}>

      {/* Brand Logo */}
<div className={styles.brand}>
  <img
    src="/Group_1BR.png"
    alt="ILA OSINT Logo"
    className={styles.brandLogo}
  />
</div>

      {/* Nav */}
      <nav className={styles.nav}>

        {/* Overview */}
        <div
          className={`${styles.navItem} ${activeItem === 'overview' ? styles.navItemActive : ''}`}
          onClick={() => {
            setActiveItem('overview');
            window.history.pushState(null, '', '/admin/overview');
          }}
        >
          <span className={styles.navIcon}><Dashboard size={16} /></span>
          <span className={styles.navLabel}>Overview</span>
        </div>

        {/* Analyst Label */}
        {sidebarOpen && (
          <div style={{
            padding: '14px 18px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.18em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase'
          }}>
            Analyst
          </div>
        )}
        <div className={styles.divider} />

        {/* Analyst Items */}
        {ANALYST_SECTIONS.map((item) => (
          <div
            key={item.id}
            className={`${styles.navItem} ${activeItem === item.id ? styles.navItemActive : ''}`}
            onClick={() => {
              setActiveItem(item.id);
              if (item.path) {
                window.history.pushState(null, '', item.path);
              }
            }}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </div>
        ))}

        {/* Admin Label */}
        {sidebarOpen && (
          <div style={{
            padding: '14px 18px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '9px',
            letterSpacing: '0.18em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase'
          }}>
            Administration
          </div>
        )}
        <div className={styles.divider} />

        {/* Admin Accordion */}
        {ADMIN_SECTIONS.map((section) => (
          <div key={section.id} className={styles.section}>
            <div
              className={`${styles.sectionHeader} ${isExpanded(section.id) ? styles.sectionActive : ''}`}
              onClick={() => toggleSection(section.id)}
            >
              <div className={styles.sectionLeft}>
                <span className={styles.sectionIcon}>{section.icon}</span>
                <span className={styles.sectionLabel}>{section.label}</span>
              </div>
              <span className={`${styles.chevron} ${isExpanded(section.id) ? styles.chevronOpen : ''}`}>
                <ChevronDown size={12} />
              </span>
            </div>

            <div className={`${styles.subItems} ${isExpanded(section.id) ? styles.subItemsOpen : ''}`}>
              {section.children?.map((child) => (
                <div
                  key={child.id}
                  className={`${styles.subItem} ${activeItem === child.id ? styles.subItemActive : ''}`}
                  onClick={() => {
                    setActiveItem(child.id);
                    if (child.path) {
                      window.history.pushState(null, '', child.path);
                    }
                  }}
                >
                  <span className={styles.subIcon}>{child.icon}</span>
                  <span className={styles.subLabel}>{child.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Panel */}
      <div className={styles.userPanel}>
        <div className={styles.userAvatar}>
          {username.charAt(0).toUpperCase()}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{username}</div>
          <div className={styles.userMeta}>{role}</div>
        </div>
        <button className={styles.logoutBtn} onClick={onLogout} title="Logout">
          <Logout size={16} />
        </button>
      </div>

    </aside>
  );
};

export default Sidebar;