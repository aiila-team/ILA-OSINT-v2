// src/styles/motion.ts
// ILA OSINT — Framer Motion animation presets
// Subtle, professional transitions suited to an intelligence dashboard.

import type { Variants } from 'framer-motion';

// ── Page-level fade in ──────────────────────────────────────────────

export const pageFadeIn: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 6 },
};

export const pageFadeInTransition = {
  duration: 0.22,
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

// ── Drawer slide in from right ──────────────────────────────────────

export const drawerSlideIn: Variants = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0  },
  exit:    { opacity: 0, x: 18 },
};

export const drawerSlideInTransition = {
  duration: 0.2,
};

// ── Tab content cross-fade ──────────────────────────────────────────

export const tabFade: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 6 },
};

export const tabFadeTransition = {
  duration: 0.16,
};

// ── Toast notification ──────────────────────────────────────────────

export const toastSlideUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: 16 },
};

export const toastTransition = {
  duration: 0.22,
};

// ── Row hover (inline usage) ────────────────────────────────────────
// Usage: <motion.tr whileHover={rowHover} transition={rowHoverTransition}>
export const rowHoverTransition = {
  duration: 0.12,
};