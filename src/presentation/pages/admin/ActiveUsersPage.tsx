import { useState, useMemo, useEffect, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MetricsCard } from '../../../components/MetricsCard';
import { UserCard } from '../../../components/UserCard';
import { ActivityFeed } from '../../../components/ActivityFeed';
import type { User, UserStatus, UserRole } from '../../../data/mockUsers';
import styles from './ActiveUsersPage.module.scss';

// ── Edit Modal ────────────────────────────────────────────────────
interface EditModalProps {
  user: User | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<User>) => void;
}
function EditModal({ user, onClose, onSave }: EditModalProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'analyst');
  const [org, setOrg]   = useState(user?.org ?? '');

  useEffect(() => {
    if (user) { setName(user.name); setRole(user.role); setOrg(user.org); }
  }, [user]);

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className={styles.modalOverlay}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        className={styles.modalContent}
      >
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalHeaderSubtitle}>USER MANAGEMENT</div>
            <div className={styles.modalHeaderTitle}>
              EDIT USER — {user.id}
            </div>
          </div>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <div className={styles.modalBody}>
          <label className={styles.modalLabel}>FULL NAME</label>
          <input className={styles.modalInput} value={name} onChange={e => setName(e.target.value)} />
          <label className={styles.modalLabel}>ROLE</label>
          <select className={styles.modalInput} style={{ cursor: 'pointer' }} value={role} onChange={e => setRole(e.target.value as UserRole)}>
            <option value="admin">ADMIN</option>
            <option value="analyst">ANALYST</option>
            <option value="viewer">VIEWER</option>
          </select>
          <label className={styles.modalLabel}>ORGANIZATION ID</label>
          <input className={styles.modalInput} style={{ marginBottom: 0 }} value={org} onChange={e => setOrg(e.target.value)} />
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={styles.btnCancel}>CANCEL</button>
          <button onClick={() => { onSave(user.id, { name, role, org }); onClose(); }} className={styles.btnSave}>SAVE CHANGES</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Revoke Modal ──────────────────────────────────────────────────
function RevokeModal({ user, onClose, onConfirm }: { user: User | null; onClose: () => void; onConfirm: (id: string) => void }) {
  if (!user) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className={styles.modalOverlay}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        className={styles.revokeModalContent}
      >
        <div className={styles.revokeModalHeader}>
          <div className={styles.revokeModalHeaderTitle}>CONFIRM ACCESS REVOCATION</div>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.warningBox}>
            <div className={styles.warningTitle}>⚠ WARNING</div>
            <p className={styles.warningText}>
              This will immediately terminate all active sessions for <strong className={styles.warningStrong}>{user.name}</strong> and permanently revoke platform access. This action cannot be undone.
            </p>
          </div>
          <div className={styles.targetBox}>
            <div className={styles.targetTitle}>TARGET USER</div>
            <div className={styles.targetInfoRow}>
              <div><div className={styles.targetInfoLabel}>ID</div><div className={styles.targetInfoValueId}>{user.id}</div></div>
              <div><div className={styles.targetInfoLabel}>NAME</div><div className={styles.targetInfoValueName}>{user.name}</div></div>
              <div><div className={styles.targetInfoLabel}>ORG</div><div className={styles.targetInfoValueOrg}>{user.org}</div></div>
            </div>
          </div>
        </div>

        <div className={styles.revokeModalFooter}>
          <button onClick={onClose} className={styles.btnCancel}>CANCEL</button>
          <button onClick={() => { onConfirm(user.id); onClose(); }} className={styles.btnRevoke}>REVOKE ACCESS</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Empty State ───────────────────────────────────────────────────
function EmptyState({ search }: { search: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className={styles.emptyStateContainer}
    >
      <div className={styles.emptyIcon}>◌</div>
      {search ? (
        <>
          <div className={styles.emptyTitle}>NO RESULTS FOUND</div>
          <div className={styles.emptySearchTerm}>"{search}"</div>
        </>
      ) : (
        <>
          <div className={styles.emptyTitle}>NO USERS FOUND</div>
          <div className={styles.emptyDescription}>
            No users have been added to the platform yet. Users will appear here once they are created.
          </div>
        </>
      )}
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
// TODO: Replace `users` prop with real data from your API/query hook.
// Example: const { data: users = [], isLoading } = useAdminQuery();
// Then pass `users` into this component or fetch directly inside.

interface ActiveUsersPageProps {
  users?: User[];        // wire your real API data here
  isLoading?: boolean;   // pass loading state from your query hook
}

export function ActiveUsersPage({ users = [], isLoading = false }: ActiveUsersPageProps) {
  const [localUsers, setLocalUsers]       = useState<User[]>(users);
  const [search, setSearch]               = useState('');
  const [roleFilter, setRoleFilter]       = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter]   = useState<UserStatus | 'all'>('all');
  const [editUser, setEditUser]           = useState<User | null>(null);
  const [revokeUser, setRevokeUser]       = useState<User | null>(null);

  // Sync when real data arrives from the API
  useEffect(() => { setLocalUsers(users); }, [users]);

  const handleSave = (id: string, updates: Partial<User>) => {
    setLocalUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    // TODO: call your update mutation here, e.g. updateUser({ id, ...updates })
  };

  const handleRevoke = (id: string) => {
    setLocalUsers(prev => prev.filter(u => u.id !== id));
    // TODO: call your revoke mutation here, e.g. revokeUserAccess(id)
  };

  // Metrics
  const total   = localUsers.length;
  const online  = localUsers.filter(u => u.status === 'ONLINE').length;
  const idle    = localUsers.filter(u => u.status === 'IDLE').length;
  const offline = localUsers.filter(u => u.status === 'OFFLINE').length;

  // Filtered users
  const filtered = useMemo(() => {
    let result = localUsers;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(u =>
        u.id.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        u.org.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== 'all')   result = result.filter(u => u.role === roleFilter);
    if (statusFilter !== 'all') result = result.filter(u => u.status === statusFilter);
    return result;
  }, [localUsers, search, roleFilter, statusFilter]);

  // ── Loading skeleton ─────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.loadingSkeleton}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className={styles.skeletonBlock} style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* Scan-line overlay */}
      <div className={styles.scanLineOverlay} />

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.headerSubtitle}>
            User Management
          </div>
          <h1 className={styles.headerTitle}>
            Active User Intelligence
          </h1>
          <div className={styles.headerDescription}>
            Real-time analyst monitoring system
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.onlineStat}>
            <div className={styles.onlineDot} />
            <span className={styles.onlineText}>
              {online} ONLINE
            </span>
          </div>
          <span className={styles.statDivider}>/</span>
          <span className={styles.totalText}>
            {total} TOTAL
          </span>
        </div>
      </div>

      {/* Metrics cards */}
      <div className={styles.metricsRow}>
        <MetricsCard label="Total Analysts" value={total}   total={total} color="var(--cds-interactive-01)" glowColor="#00a3c7" icon="◈" index={0} trend="stable" />
        <MetricsCard label="Active / Online" value={online} total={total} color="var(--cds-support-success)" glowColor="#24a148" icon="◉" index={1} trend="up"     />
        <MetricsCard label="Idle / Standby"  value={idle}   total={total} color="var(--cds-support-warning)" glowColor="#f1c21b" icon="◎" index={2} trend="stable" />
        <MetricsCard label="Offline"         value={offline} total={total} color="var(--cds-text-helper)"    glowColor="#3a4a5c" icon="○" index={3} trend="down"   />
      </div>

      {/* Main content area */}
      <div className={styles.mainContent}>

        {/* Left: user grid */}
        <div className={styles.userGridContainer}>

          {/* Search + filter toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.searchWrapper}>
              <span className={styles.searchIcon}>⌕</span>
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="SEARCH USERS..."
                className={styles.searchInput}
              />
            </div>

            <div className={styles.selectWrapper}>
              <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value as UserRole | 'all')}>
                <option value="all">ALL ROLES</option>
                <option value="admin">ADMIN</option>
                <option value="analyst">ANALYST</option>
                <option value="viewer">VIEWER</option>
              </select>
            </div>

            <div className={styles.selectWrapper}>
              <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value as UserStatus | 'all')}>
                <option value="all">ALL STATUS</option>
                <option value="ONLINE">ONLINE</option>
                <option value="IDLE">IDLE</option>
                <option value="OFFLINE">OFFLINE</option>
              </select>
            </div>

            <span className={styles.showingCount}>
              {filtered.length} / {total} SHOWN
            </span>
          </div>

          {/* Grid */}
          <div className={styles.gridArea}>
            {filtered.length === 0 ? (
              <EmptyState search={search} />
            ) : (
              <motion.div
                className={styles.userGrid}
                layout
              >
                <AnimatePresence>
                  {filtered.map((user, i) => (
                    <UserCard
                      key={user.id}
                      user={user}
                      index={i}
                      onEdit={u => setEditUser(u)}
                      onRevoke={u => setRevokeUser(u)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        {/* Right: Activity feed — only shown when real users exist */}
        {total > 0 && (
          <div className={styles.activityFeedWrapper}>
            <ActivityFeed />
          </div>
        )}
      </div>
      {/* Modals */}
      <AnimatePresence>
        {editUser && <EditModal user={editUser} onClose={() => setEditUser(null)} onSave={handleSave} />}
      </AnimatePresence>
      <AnimatePresence>
        {revokeUser && <RevokeModal user={revokeUser} onClose={() => setRevokeUser(null)} onConfirm={handleRevoke} />}
      </AnimatePresence>
    </div>
  );
}