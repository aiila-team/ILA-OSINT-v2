import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ACTIVITY_EVENTS } from '../data/mockUsers';

interface FeedEntry {
  id: number;
  user: string;
  action: string;
  time: string;
  timestamp: Date;
}

let seedId = ACTIVITY_EVENTS.length;

export function ActivityFeed() {
  const [entries, setEntries] = useState<FeedEntry[]>(() =>
    ACTIVITY_EVENTS.map((e, i) => ({
      id: i,
      user: e.user,
      action: e.action,
      time: e.time,
      timestamp: new Date(),
    }))
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPaused) return;
      const base = ACTIVITY_EVENTS[Math.floor(Math.random() * ACTIVITY_EVENTS.length)];
      const now = new Date();
      const newEntry: FeedEntry = {
        id: ++seedId,
        user: base.user,
        action: base.action,
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        timestamp: now,
      };
      setEntries((prev) => [newEntry, ...prev.slice(0, 39)]);
    }, 3500);
    return () => clearInterval(interval);
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [entries, isPaused]);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#24a148',
              flexShrink: 0,
            }}
            className="blink-live"
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
            }}
          >
            Live Activity
          </span>
        </div>
        <button
          onClick={() => setIsPaused((p) => !p)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: isPaused ? 'var(--accent)' : 'var(--text-muted)',
            background: isPaused ? 'var(--accent-faint)' : 'transparent',
            border: '1px solid',
            borderColor: isPaused ? 'var(--accent)' : 'var(--border)',
            padding: '2px 8px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {isPaused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 0',
        }}
      >
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: 16, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(0,163,199,0.07)',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {entry.user}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.08em',
                  }}
                >
                  {entry.time}
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                {entry.action}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
          }}
        >
          {entries.length} EVENTS LOGGED
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: '#24a148',
            letterSpacing: '0.1em',
          }}
        >
          STREAM ACTIVE
        </span>
      </div>
    </div>
  );
}
