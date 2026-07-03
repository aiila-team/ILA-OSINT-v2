import React, { useState } from 'react';
import { Menu, Notification, Settings } from '@carbon/icons-react';
import Sidebar from '../../components/sidebar/Sidebar';
import { useUIStore } from '../../States/useUIStore';
import styles from './DashboardLayout.module.scss';
import { useShortcuts } from '../../hooks/useShortcuts';
import ShortcutsOverlay from '../../components/analyst/ShortcutsOverlay/ShortcutsOverlay';
import SettingsDrawer from '../pages/admin/SettingsDrawer/SettingsDrawer';

interface DashboardLayoutProps {
  children: React.ReactNode;
  username: string;
  role: string;
  onLogout: () => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children, username, role, onLogout,
}) => {
  const { sidebarOpen, toggleSidebar, activeItem, unreadAlertCount } = useUIStore();
    const [settingsOpen, setSettingsOpen] = useState(false); 
  const utcNow = new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z';

  const pageTitle = activeItem
    .split('-')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  useShortcuts();
  return (
    <div className={styles.shell}>
      <Sidebar username={username} role={role} onLogout={onLogout} />

      <div className={`${styles.main} ${!sidebarOpen ? styles.mainExpanded : ''}`}>
        {/* Top bar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.menuBtn} onClick={toggleSidebar} aria-label="Toggle sidebar">
              <Menu size={18} />
            </button>
            <div className={styles.breadcrumb}>
              <span className={styles.breadcrumbRoot}>ILA OSINT</span>
              <span className={styles.breadcrumbSep}>/</span>
              <span className={styles.breadcrumbCurrent}>{pageTitle}</span>
            </div>
          </div>

          <div className={styles.topbarRight}>
            <span className={styles.utcBadge}>{utcNow}</span>
            <div className={styles.statusDot} title="System Operational" />
            <button className={styles.iconBtn} aria-label="Notifications">
              <Notification size={16} />
              {unreadAlertCount > 0 && (
                <span className={styles.notifBadge}>
                  {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
                </span>
              )}
              
            </button>
               <button
              className={styles.iconBtn}
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className={styles.content}>
          {children}
        </main>
      </div>
      <ShortcutsOverlay />
      <SettingsDrawer
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        username={username}
        role={role}
        onLogout={onLogout}
      />
    </div>
  );
};

export default DashboardLayout;