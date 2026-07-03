import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { User, UserStatus } from '../data/mockUsers';

interface UserCardProps {
  user: User;
  index: number;
  onEdit: (user: User) => void;
  onRevoke: (user: User) => void;
}

const STATUS_CONFIG: Record<UserStatus, { color: string; bg: string; border: string; label: string }> = {
  ONLINE:  { color: '#24a148', bg: 'rgba(36,161,72,0.12)',   border: 'rgba(36,161,72,0.35)',   label: 'ONLINE'  },
  IDLE:    { color: '#f1c21b', bg: 'rgba(241,194,27,0.12)',  border: 'rgba(241,194,27,0.35)',  label: 'IDLE'    },
  OFFLINE: { color: '#3a4a5c', bg: 'rgba(58,74,92,0.12)',    border: 'rgba(58,74,92,0.35)',    label: 'OFFLINE' },
};

const ROLE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  admin:   { color: '#00a3c7', bg: 'rgba(0,163,199,0.1)',   border: 'rgba(0,163,199,0.3)'   },
  analyst: { color: '#4589ff', bg: 'rgba(69,137,255,0.1)',  border: 'rgba(69,137,255,0.3)'  },
  viewer:  { color: '#6b8aad', bg: 'rgba(107,138,173,0.08)', border: 'rgba(107,138,173,0.2)' },
};

const AVATAR_COLORS: Record<string, string> = {
  admin:   'linear-gradient(135deg, #005f73, #00a3c7)',
  analyst: 'linear-gradient(135deg, #1a3a6e, #4589ff)',
  viewer:  'linear-gradient(135deg, #2a3f55, #6b8aad)',
};

export function UserCard({ user, index, onEdit, onRevoke }: UserCardProps) {
  const [hovered, setHovered] = useState(false);
  const status = STATUS_CONFIG[user.status];
  const role = ROLE_CONFIG[user.role];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: 'easeOut' }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ scale: 1.02 }}
      style={{
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'rgba(0,163,199,0.35)' : 'var(--border)'}`,
        boxShadow: hovered
          ? '0 8px 32px rgba(0,0,0,0.4), 0 0 16px rgba(0,163,199,0.08)'
          : '0 2px 8px rgba(0,0,0,0.2)',
        padding: '16px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Status-colored top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: status.color,
        opacity: user.status === 'OFFLINE' ? 0.3 : 0.8,
      }} />

      {/* Background grid */}
      {hovered && (
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(0,163,199,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,163,199,0.5) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
          pointerEvents: 'none',
        }} />
      )}

      {/* Top row: Avatar + ID + Status */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: AVATAR_COLORS[user.role],
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          border: `2px solid ${status.color}44`,
          position: 'relative',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '0.05em',
          }}>
            {user.initials}
          </span>
          {/* Status dot on avatar */}
          <div
            style={{
              position: 'absolute', bottom: 1, right: 1,
              width: 10, height: 10, borderRadius: '50%',
              background: status.color,
              border: '2px solid var(--bg-card)',
            }}
            className={user.status === 'ONLINE' ? 'pulse-online' : user.status === 'IDLE' ? 'pulse-idle' : ''}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* User ID */}
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.14em',
            marginBottom: 2,
          }}>
            {user.id}
          </div>
          {/* Name */}
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: user.status === 'OFFLINE' ? 'var(--text-muted)' : 'var(--text-primary)',
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user.name}
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: status.bg,
          border: `1px solid ${status.border}`,
          padding: '3px 7px',
          flexShrink: 0,
        }}>
          <div
            style={{ width: 5, height: 5, borderRadius: '50%', background: status.color }}
            className={user.status === 'ONLINE' ? 'pulse-online' : user.status === 'IDLE' ? 'pulse-idle' : ''}
          />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            color: status.color,
            letterSpacing: '0.12em',
          }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {/* Role */}
        <div style={{
          background: role.bg,
          border: `1px solid ${role.border}`,
          padding: '2px 8px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            color: role.color,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            {user.role}
          </span>
        </div>

        {/* Org */}
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid var(--border)',
          padding: '2px 8px',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
          }}>
            {user.org}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8, marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            marginBottom: 2,
          }}>LAST ACTIVE</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
          }}>
            {user.lastActive}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            marginBottom: 2,
          }}>LOCATION</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            letterSpacing: '0.04em',
          }}>
            {user.location}
          </div>
        </div>
      </div>

      {/* Active cases */}
      {user.activeCases > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 8px',
          background: 'rgba(69,137,255,0.07)',
          border: '1px solid rgba(69,137,255,0.2)',
          marginBottom: 12,
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: '#4589ff',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: '#4589ff',
            letterSpacing: '0.08em',
          }}>
            {user.activeCases} ACTIVE CASE{user.activeCases > 1 ? 'S' : ''}
          </span>
        </div>
      )}

      {/* Action buttons â€” slide in on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', gap: 8 }}
          >
            <button
              onClick={() => onEdit(user)}
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                padding: '6px 0',
                background: 'var(--accent-faint)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,163,199,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent-faint)')}
            >
              EDIT
            </button>
            <button
              onClick={() => onRevoke(user)}
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                padding: '6px 0',
                background: 'rgba(250,77,86,0.08)',
                border: '1px solid rgba(250,77,86,0.35)',
                color: '#fa4d56',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(250,77,86,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(250,77,86,0.08)')}
            >
              REVOKE
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder height when actions not shown */}
      {!hovered && <div style={{ height: 0 }} />}
    </motion.div>
  );
}

