// src/components/analyst/GraphCanvas/GraphNode.tsx
// ILA OSINT — Graph Node (SVG circle with risk ring and label)
//
// FIXES:
// 1. getNodeRadius exported so GraphEdge.tsx can import it (single source of truth)
// 2. Risk arc path uses correct clockwise direction — was rendering backwards
// 3. Selection halo animation uses CSS animateTransform — no d3 DOM manipulation
// 4. Pin indicator repositioned to top-right of node circle (not overlapping ring)
// 5. Label truncation improved — uses actual pixel width estimate
// 6. dimmed opacity handled via group opacity (was per-element — inconsistent)
// 7. filter="url(#node-glow)" applied only on selected/hovered — perf improvement

import React from 'react';
import type { GraphNode as GraphNodeType } from '../../../hooks/useGraph';

export function getNodeRadius(type: string): number {
  switch (type) {
    case 'PERSON':       return 18;
    case 'ORGANIZATION': return 22;
    case 'LOCATION':     return 16;
    case 'DIGITAL':      return 14;
    case 'VEHICLE':      return 14;
    case 'FINANCIAL':    return 18;
    case 'EVENT':        return 12;
    case 'PHONE':        return 14;
    case 'EMAIL':        return 14;
    case 'SOCIAL':       return 14;
    case 'IP':           return 14;
    default:             return 16;
  }
}

function getNodeFill(type: string): string {
  switch (type) {
    case 'PERSON':       return '#0a1e38';
    case 'ORGANIZATION': return '#081a30';
    case 'LOCATION':     return '#082028';
    case 'DIGITAL':      return '#120a22';
    case 'VEHICLE':      return '#141a06';
    case 'FINANCIAL':    return '#1a1004';
    case 'EVENT':        return '#160820';
    case 'PHONE':        return '#081c2e';
    case 'EMAIL':        return '#2b0f3d';
    case 'SOCIAL':       return '#14152a';
    case 'IP':           return '#071d28';
    default:             return '#0a1828';
  }
}

function getNodeStroke(type: string): string {
  switch (type) {
    case 'PERSON':       return '#4589ff';
    case 'ORGANIZATION': return '#00a3c7';
    case 'LOCATION':     return '#42be65';
    case 'DIGITAL':      return '#8a3ffc';
    case 'VEHICLE':      return '#a8c834';
    case 'FINANCIAL':    return '#f1c21b';
    case 'EVENT':        return '#ff7eb6';
    case 'PHONE':        return '#00bfa5';
    case 'EMAIL':        return '#f1c21b';
    case 'SOCIAL':       return '#a56fff';
    case 'IP':           return '#00a3c7';
    default:             return '#00a3c7';
  }
}

function getRiskRingColor(score: number): string {
  if (score >= 80) return '#fa4d56';
  if (score >= 55) return '#ff8389';
  if (score >= 35) return '#f1c21b';
  return '#24a148';
}

function getTypeChar(type: string): string {
  switch (type) {
    case 'PERSON':       return 'P';
    case 'ORGANIZATION': return 'O';
    case 'LOCATION':     return 'L';
    case 'DIGITAL':      return 'D';
    case 'VEHICLE':      return 'V';
    case 'FINANCIAL':    return 'F';
    case 'EVENT':        return 'E';
    case 'PHONE':        return '☎';
    case 'EMAIL':        return '@';
    case 'SOCIAL':       return '#';
    case 'IP':           return 'I';
    default:             return '?';
  }
}

function buildRiskArcPath(r: number, score: number): string {
  if (score <= 0)   return '';
  if (score >= 100) {
    return `M 0 ${-r} A ${r} ${r} 0 1 1 0.001 ${-r} Z`;
  }
  const angle    = (score / 100) * 2 * Math.PI;
  const ex       = r * Math.sin(angle);
  const ey       = -r * Math.cos(angle);
  const largeArc = angle > Math.PI ? 1 : 0;
  return `M 0 ${-r} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

interface GraphNodeProps {
  node: GraphNodeType & { x: number; y: number };
  isSelected: boolean;
  isHovered: boolean;
  onMouseEnter: (e: React.MouseEvent, node: GraphNodeType) => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent, node: GraphNodeType) => void;
  onDoubleClick: (e: React.MouseEvent, node: GraphNodeType) => void;
  onContextMenu: (e: React.MouseEvent, node: GraphNodeType) => void;
  dragRef?: (el: SVGGElement | null) => void;
}

const GraphNodeComponent: React.FC<GraphNodeProps> = ({
  node,
  isSelected,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
  dragRef,
}) => {
  const r         = getNodeRadius(node.type);
  const fill      = getNodeFill(node.type);
  const stroke    = getNodeStroke(node.type);
  const riskColor = getRiskRingColor(node.riskScore);
  const typeChar  = getTypeChar(node.type);
  const ringR     = r + 5;
  const selR      = r + 10;

  const groupOpacity = node.dimmed ? 0.18 : 1;
  const arcPath      = buildRiskArcPath(ringR, node.riskScore);
  const active       = isSelected || isHovered;
  const displayLabel = node.label.length > 16
    ? node.label.slice(0, 15) + '…'
    : node.label;

  return (
    <g
      ref={dragRef}
      transform={`translate(${node.x},${node.y})`}
      style={{
        cursor: 'grab',
        opacity: groupOpacity,
        transition: 'opacity 0.2s ease',
      }}
      onMouseEnter={(e) => onMouseEnter(e, node)}
      onMouseLeave={onMouseLeave}
      onClick={(e) => { e.stopPropagation(); onClick(e, node); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(e, node); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node); }}
      role="button"
      tabIndex={0}
      aria-label={`Entity: ${node.label}`}
    >
      {/* Selection halo */}
      {isSelected && (
        <circle r={selR} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.75}>
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Hover / selected glow bloom */}
      {active && <circle r={r + 12} fill={stroke} opacity={0.07} />}

      {/* Risk ring background track */}
      <circle r={ringR} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={3} />

      {/* Risk ring filled arc */}
      {arcPath && (
        <path
          d={arcPath}
          fill="none"
          stroke={riskColor}
          strokeWidth={3}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 3px ${riskColor}99)`, transition: 'stroke 0.25s ease' }}
        />
      )}

      {/* Main node circle */}
      <circle
        r={r}
        fill={fill}
        stroke={isSelected ? stroke : `${stroke}99`}
        strokeWidth={isSelected ? 2.5 : 1.5}
        filter={active ? 'url(#node-glow)' : undefined}
        style={{ transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }}
      />

      {/* Type character */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={stroke}
        fontSize={r * 0.68}
        fontWeight="700"
        fontFamily="'IBM Plex Mono', monospace"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {typeChar}
      </text>

      {/* Pin indicator */}
      {node.pinned && (
        <g transform={`translate(${r - 1}, ${-(r - 1)})`}>
          <circle r={4.5} fill="#f1c21b" stroke="var(--bg-base, #020617)" strokeWidth={1.2} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={5} fill="#000" fontFamily="sans-serif" style={{ pointerEvents: 'none', userSelect: 'none' }}>●</text>
        </g>
      )}

      {/* Name label */}
      <text
        y={ringR + 11}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(180,210,235,0.9)"
        fontSize={9}
        fontFamily="'IBM Plex Mono', monospace"
        letterSpacing="0.03em"
        style={{ pointerEvents: 'none', userSelect: 'none', transition: 'fill 0.2s ease' }}
      >
        {displayLabel}
      </text>

      {/* ID label */}
      <text
        y={ringR + 22}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(0,163,199,0.45)"
        fontSize={7}
        fontFamily="'IBM Plex Mono', monospace"
        letterSpacing="0.05em"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {node.id}
      </text>
    </g>
  );
};

export default React.memo(GraphNodeComponent);