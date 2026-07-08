// src/components/analyst/GraphCanvas/GraphEdge.tsx
// ILA OSINT — Graph Edge (SVG straight line + corrected arrow + label)
//
// FIXES:
// 1. Endpoint computation uses actual per-type radius (was missing VEHICLE/FINANCIAL)
// 2. Arrow clearance increased to 10px — was 8px, causing arrow to hide behind node
// 3. Edge stroke colour changed to #2a4a6a (dark teal) for normal state — much cleaner
// 4. Opacity values rebalanced: normal=0.6, dimmed=0.08, highlighted=1
// 5. Marker IDs now match the three markers defined in GraphCanvas defs
// 6. Edge label always shown (not just on highlighted) — shown at slight offset above midpoint
// 7. Hit area kept at 14px wide for easy hover

import React from 'react';
import type { GraphEdge as GraphEdgeType, GraphNode } from '../../../hooks/useGraph';

interface SimNode extends GraphNode {
  x: number;
  y: number;
}

type GraphEdgeWithSimNodes = Omit<GraphEdgeType, 'source' | 'target'> & {
  source: GraphNode | string;
  target: GraphNode | string;
  highlighted?: boolean;
  dimmed?: boolean;
};

interface GraphEdgeProps {
  edge: GraphEdgeWithSimNodes;
  sourceNode: SimNode;
  targetNode: SimNode;
  onMouseEnter: (e: React.MouseEvent, label: string) => void;
  onMouseLeave: () => void;
}

function getNodeRadius(type: string): number {
  switch (type) {
    case 'PERSON':       return 18;
    case 'ORGANIZATION': return 22;
    case 'LOCATION':     return 16;
    case 'DIGITAL':      return 14;
    case 'VEHICLE':      return 14;
    case 'FINANCIAL':    return 18;
    case 'EVENT':        return 12;
    default:             return 16;
  }
}

function computeEndpoints(
  sx: number, sy: number,
  tx: number, ty: number,
  sr: number, tr: number
): { x1: number; y1: number; x2: number; y2: number } {
  const dx  = tx - sx;
  const dy  = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux  = dx / len;
  const uy  = dy / len;
  return {
    x1: sx + ux * (sr + 3),
    y1: sy + uy * (sr + 3),
    x2: tx - ux * (tr + 10),
    y2: ty - uy * (tr + 10),
  };
}

const GraphEdgeComponent: React.FC<GraphEdgeProps> = ({
  edge,
  sourceNode,
  targetNode,
  onMouseEnter,
  onMouseLeave,
}) => {
  const sx = sourceNode.x ?? 0;
  const sy = sourceNode.y ?? 0;
  const tx = targetNode.x ?? 0;
  const ty = targetNode.y ?? 0;

  const sr = getNodeRadius(sourceNode.type);
  const tr = getNodeRadius(targetNode.type);

  const { x1, y1, x2, y2 } = computeEndpoints(sx, sy, tx, ty, sr, tr);

  const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  if (length < 2) return null;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  const opacity     = edge.dimmed       ? 0.08  : edge.highlighted ? 1    : 0.6;
  const strokeColor = edge.highlighted  ? '#00c3ef'
                    : edge.dimmed       ? '#1a3a5a'
                    : '#2a4a6a';
  const strokeWidth = edge.highlighted  ? 1.8   : 1.2;
  const markerUrl   = edge.highlighted  ? 'url(#arrow-highlighted)'
                    : 'url(#arrow)';

  const dx   = x2 - x1;
  const dy   = y2 - y1;
  const len  = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx   = -dy / len;
  const ny   =  dx / len;
  const labelOffsetPx = 8;

  return (
    <g
      style={{ opacity, transition: 'opacity 0.18s ease' }}
      onMouseEnter={(e) => onMouseEnter(e, edge.label)}
      onMouseLeave={onMouseLeave}
    >
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        markerEnd={markerUrl}
        style={{ transition: 'stroke 0.18s ease, stroke-width 0.18s ease' }}
      />
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="transparent"
        strokeWidth={14}
        style={{ cursor: 'crosshair' }}
        pointerEvents="stroke"
      />
      <text
        x={midX + nx * labelOffsetPx}
        y={midY + ny * labelOffsetPx}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={edge.highlighted ? '#00c3ef' : 'rgba(0,163,199,0.35)'}
        fontSize={edge.highlighted ? 8 : 7}
        fontFamily="'IBM Plex Mono', monospace"
        letterSpacing="0.06em"
        opacity={edge.dimmed ? 0 : edge.highlighted ? 1 : 0.6}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          transition: 'opacity 0.18s ease, fill 0.18s ease',
        }}
      >
        {edge.label}
      </text>
    </g>
  );
};

export default React.memo(GraphEdgeComponent);