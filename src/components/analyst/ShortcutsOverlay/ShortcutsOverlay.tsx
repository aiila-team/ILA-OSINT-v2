// src/components/analyst/ShortcutsOverlay/ShortcutsOverlay.tsx
// Keyboard shortcuts reference panel.
// Opens on ? keypress, closes on Escape or X button.
// Reads/writes shortcutsOpen from Zustand useUIStore.

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../../States/useUIStore';
import { fadeIn } from '../../../styles/motion';
import styles from './ShortcutsOverlay.module.scss';

// ── Shortcut data ─────────────────────────────────────────────────
const NAVIGATION_SHORTCUTS = [
  { keys: ['G', 'I'], action: 'Investigations' },
  { keys: ['G', 'A'], action: 'Alert Inbox' },
  { keys: ['G', 'E'], action: 'Entity Search' },
  { keys: ['G', 'G'], action: 'Graph Analysis' },
  { keys: ['G', 'T'], action: 'Timeline' },
  { keys: ['G', 'C'], action: 'Case Management' },
  { keys: ['G', 'R'], action: 'Reports' },
];

const ACTION_SHORTCUTS = [
  { keys: ['/'],     action: 'Focus search' },
  { keys: ['F'],     action: 'Toggle filters' },
  { keys: ['N'],     action: 'New item (context)' },
  { keys: ['?'],     action: 'Show shortcuts' },
  { keys: ['Esc'],   action: 'Close drawer / modal' },
  { keys: ['⌘', 'K'], action: 'Global search' },
  { keys: ['⌘', 'A'], action: 'Select all rows' },
];

// ── Key badge component ───────────────────────────────────────────
const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
  <span className={styles.key}>{label}</span>
);

// ── Shortcut row ──────────────────────────────────────────────────
const ShortcutRow: React.FC<{ keys: string[]; action: string }> = ({ keys, action }) => (
  <div className={styles.row}>
    <div className={styles.keys}>
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          <KeyBadge label={k} />
          {i < keys.length - 1 && (
            <span className={styles.plus}>+</span>
          )}
        </React.Fragment>
      ))}
    </div>
    <span className={styles.action}>{action}</span>
  </div>
);

// ── Main overlay ──────────────────────────────────────────────────
const ShortcutsOverlay: React.FC = () => {
  const shortcutsOpen  = useUIStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShortcutsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setShortcutsOpen]);

  return (
    <AnimatePresence>
      {shortcutsOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShortcutsOpen(false)}
          />

          {/* Panel */}
          <motion.div
            className={styles.panel}
            initial={fadeIn.initial}
            animate={fadeIn.animate}
            exit={fadeIn.exit}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.badge}>SHORTCUTS</span>
                <h2 className={styles.title}>Keyboard Reference</h2>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShortcutsOpen(false)}
                aria-label="Close shortcuts overlay"
              >
                ✕
              </button>
            </div>

            {/* Two column body */}
            <div className={styles.body}>
              {/* Navigation column */}
              <div className={styles.column}>
                <div className={styles.columnTitle}>NAVIGATION</div>
                {NAVIGATION_SHORTCUTS.map((s) => (
                  <ShortcutRow key={s.action} keys={s.keys} action={s.action} />
                ))}
              </div>

              {/* Divider */}
              <div className={styles.divider} />

              {/* Actions column */}
              <div className={styles.column}>
                <div className={styles.columnTitle}>ACTIONS</div>
                {ACTION_SHORTCUTS.map((s) => (
                  <ShortcutRow key={s.action} keys={s.keys} action={s.action} />
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              Press <KeyBadge label="?" /> anywhere to toggle this panel
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ShortcutsOverlay;