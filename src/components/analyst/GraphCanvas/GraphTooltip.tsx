// src/components/analyst/GraphCanvas/GraphTooltip.tsx
// ILA OSINT — Graph Node Hover Tooltip

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag } from '@carbon/react';
import type { GraphNode } from '../../../hooks/useGraph';
import styles from './GraphTooltip.module.scss';

interface TooltipPos {
  x: number;
  y: number;
}

interface GraphTooltipProps {
  node: GraphNode | null;
  pos: TooltipPos;
  edgeLabel?: string | null;
}

function riskLabel(score: number): string {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

// Map numeric risk score to a Tag `type` accepted by Carbon's <Tag />
function riskTagType(
  score: number
):
  | 'red'
  | 'magenta'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'gray'
  | 'cool-gray'
  | 'warm-gray'
  | 'high-contrast'
  | 'outline' {
  if (score >= 80) return 'red';
  if (score >= 55) return 'magenta'; // use magenta for high
  if (score >= 35) return 'cyan'; // medium -> cyan
  return 'green';
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const GraphTooltip: React.FC<GraphTooltipProps> = ({ node, pos, edgeLabel }) => {
  const visible = !!node || !!edgeLabel;

  // Keep tooltip inside viewport
  const offsetX = pos.x > window.innerWidth - 240 ? -220 : 16;
  const offsetY = pos.y > window.innerHeight - 160 ? -120 : 12;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={styles.tooltip}
          style={{
            left: pos.x + offsetX,
            top:  pos.y + offsetY,
          }}
          initial={{ opacity: 0, scale: 0.93, y: 4 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{    opacity: 0, scale: 0.93, y: 4 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          {node && (
            <>
              <div className={styles.header}>
                <span className={styles.nodeType}>{node.type}</span>
                <Tag
                  type={riskTagType(node.riskScore)}
                  size="sm"
                  className={styles.riskTag}
                >
                  {riskLabel(node.riskScore)} {node.riskScore}
                </Tag>
              </div>

              <p className={styles.name}>{node.label}</p>
              <p className={styles.id}>{node.id}</p>

              {node.location && (
                <p className={styles.meta}>📍 {node.location}</p>
              )}
              {node.lastSeen && (
                <p className={styles.meta}>
                  🕐 {formatLastSeen(node.lastSeen)}
                </p>
              )}
              {node.connectionCount !== undefined && (
                <p className={styles.meta}>
                  🔗 {node.connectionCount} connections
                </p>
              )}
              {node.source && (
                <p className={styles.source}>{node.source}</p>
              )}
              <p className={styles.hint}>Click to select · Double-click to expand</p>
            </>
          )}

          {!node && edgeLabel && (
            <p className={styles.edgeLabel}>{edgeLabel}</p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GraphTooltip;