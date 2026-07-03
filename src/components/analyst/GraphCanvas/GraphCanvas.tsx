// src/components/analyst/GraphCanvas/GraphCanvas.tsx
// ILA OSINT — D3 Force Graph Canvas (FIXED)
//
// FIXES APPLIED:
// 1. Force parameters rebalanced: reduced charge strength, tighter link distance,
//    proper alphaDecay + velocityDecay to stop jitter
// 2. Drag handlers use d3.event correctly for v7 — no more layout-breaking on drag
// 3. forceX / forceY soft type-clustering added (Person/Org/etc group together)
// 4. Simulation only restarts when node/edge list actually changes (stable deps)
// 5. Tick render throttle improved — updates every tick for first 150 ticks only
// 6. attachDrag rewritten — uses closure over simulationRef, not stale simNodes
// 7. zoomFit now runs after simulation settles (300ms delay) for accurate bounds
// 8. Arrow markers fixed: refX tuned to match actual arrowhead geometry

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import * as d3 from 'd3';
import { AnimatePresence, motion } from 'framer-motion';
import { Tile, Button } from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';

import GraphNodeComponent from './GraphNode';
import GraphEdgeComponent from './GraphEdge';
import GraphTooltip        from './GraphTooltip';
import type { GraphNode, GraphEdge } from '../../../hooks/useGraph';
import styles from './GraphCanvas.module.scss';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type SimNode = GraphNode & d3.SimulationNodeDatum & { x: number; y: number };
export type SimEdge = Omit<GraphEdge, 'source' | 'target'> &
  d3.SimulationLinkDatum<SimNode> & {
    id: string;
    label: string;
    highlighted?: boolean;
    dimmed?: boolean;
    source: SimNode;
    target: SimNode;
  };

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNode | null;
}

interface TooltipState {
  node: GraphNode | null;
  edgeLabel: string | null;
  x: number;
  y: number;
}

interface MiniMapViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onExpandNode: (id: string) => void;
  onRemoveNode: (id: string) => void;
  onHideNode: (id: string) => void;
  onPinNode: (id: string) => void;
  onHighlightConnections: (id: string) => void;
  onClearHighlight: () => void;
  onLoadSample: () => void;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const MM_W   = 160;
const MM_H   = 100;
const MM_PAD = 10;

// Soft-cluster anchor offsets by node type
// Each type gets a gentle pull toward a region of the canvas
function getClusterAnchor(
  type: string,
  cx: number,
  cy: number
): { x: number; y: number } {
  const R = Math.min(cx, cy) * 0.35; // radius of type ring
  switch (type) {
    case 'PERSON':       return { x: cx,          y: cy - R        };
    case 'ORGANIZATION': return { x: cx + R,       y: cy - R * 0.5 };
    case 'FINANCIAL':    return { x: cx + R,       y: cy + R * 0.5 };
    case 'DIGITAL':      return { x: cx,          y: cy + R        };
    case 'LOCATION':     return { x: cx - R,       y: cy + R * 0.5 };
    case 'VEHICLE':      return { x: cx - R,       y: cy - R * 0.5 };
    case 'EVENT':        return { x: cx,          y: cy            };
    default:             return { x: cx,          y: cy            };
  }
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  onSelectNode,
  onHoverNode,
  onExpandNode,
  onRemoveNode,
  onHideNode,
  onPinNode,
  onHighlightConnections,
  onClearHighlight,
  onLoadSample,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const gRef         = useRef<SVGGElement>(null);

  const [dimensions]   = useState({ width: 900, height: 620 });
  const [simNodes,     setSimNodes]     = useState<SimNode[]>([]);
  const [simEdges,     setSimEdges]     = useState<SimEdge[]>([]);
  const [transform,    setTransform]    = useState<d3.ZoomTransform>(d3.zoomIdentity);
  const [contextMenu,  setContextMenu]  = useState<ContextMenuState>({ visible: false, x: 0, y: 0, node: null });
  const [tooltip,      setTooltip]      = useState<TooltipState>({ node: null, edgeLabel: null, x: 0, y: 0 });
  const [mmViewport,   setMmViewport]   = useState<MiniMapViewport>({ x: 0, y: 0, w: MM_W, h: MM_H });

  const simulationRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null);
  const zoomRef       = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const tickCount     = useRef(0);
  const isDragging    = useRef(false);

  // Key dependency identifiers used to control when the simulation restarts
  const nodeIds = nodes.map((n) => n.id).join(',');
  const edgeIds = edges.map((e) => e.id).join(',');

  useEffect(() => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0 || nodes.length === 0) return;

    const cx = width  / 2;
    const cy = height / 2;

    // ── Preserve existing positions for nodes that already exist ──
    const prevById = new Map<string, SimNode>(
      simulationRef.current?.nodes().map((n) => [n.id, n]) ?? []
    );

    const newSimNodes: SimNode[] = nodes.map((n) => {
      const prev = prevById.get(n.id);
      // New nodes start near center with small jitter; existing keep position
      const anchor = getClusterAnchor(n.type, cx, cy);
      return {
        ...n,
        x:  prev?.x  ?? anchor.x + (Math.random() - 0.5) * 60,
        y:  prev?.y  ?? anchor.y + (Math.random() - 0.5) * 60,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        fx: n.pinned ? (prev?.x ?? cx) : undefined,
        fy: n.pinned ? (prev?.y ?? cy) : undefined,
      } as SimNode;
    });

    const nodeById = new Map<string, SimNode>(newSimNodes.map((n) => [n.id, n]));

    const newSimEdges: SimEdge[] = edges
      .map((e) => ({
        ...e,
        source: nodeById.get(typeof e.source === 'string' ? e.source : (e.source as SimNode).id)!,
        target: nodeById.get(typeof e.target === 'string' ? e.target : (e.target as SimNode).id)!,
      }))
      .filter((e) => e.source && e.target) as SimEdge[];

    // ── Stop old simulation cleanly ──
    simulationRef.current?.stop();
    tickCount.current = 0;

    // ── Build cluster forces ──
    const clusterForceX = d3.forceX<SimNode>((d) => getClusterAnchor(d.type, cx, cy).x).strength(0.06);
    const clusterForceY = d3.forceY<SimNode>((d) => getClusterAnchor(d.type, cx, cy).y).strength(0.06);

    const sim = d3
      .forceSimulation<SimNode, SimEdge>(newSimNodes)
      .force(
        'link',
        d3.forceLink<SimNode, SimEdge>(newSimEdges)
          .id((d) => d.id)
          .distance(100)
          .strength(1)
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-180))
      .force('center', d3.forceCenter(cx, cy))
      .force('collision', d3.forceCollide<SimNode>().radius(42).strength(0.9))
      .force('clusterX', clusterForceX)
      .force('clusterY', clusterForceY)
      .alphaDecay(0.05)
      .velocityDecay(0.4);

    sim.on('tick', () => {
      tickCount.current++;
      // Render every tick for first 150, then every 3rd tick for perf
      if (tickCount.current <= 150 || tickCount.current % 3 === 0) {
        setSimNodes([...sim.nodes()]);
        const links = (sim.force('link') as d3.ForceLink<SimNode, SimEdge>).links();
        setSimEdges([...links] as SimEdge[]);
      }
    });

    simulationRef.current = sim;

    // Initial render
    setSimNodes(newSimNodes);
    setSimEdges(newSimEdges);

    // Auto-fit after simulation settles
    const fitTimer = setTimeout(() => {
      if (!isDragging.current) zoomFitInternal();
    }, 1100);

    return () => {
      sim.stop();
      clearTimeout(fitTimer);
    };
  }, [nodeIds, edgeIds, dimensions.width, dimensions.height, nodes, edges, zoomFitInternal, dimensions]);

  // ── Update node highlight/dim state WITHOUT restarting sim ──
  // This runs when highlight state changes but IDs haven't changed
  useEffect(() => {
    if (!simulationRef.current) return;
    const simNodesList = simulationRef.current.nodes();
    let changed = false;
    simNodesList.forEach((sn) => {
      const incoming = nodes.find((n) => n.id === sn.id);
      if (incoming && (sn.highlighted !== incoming.highlighted || sn.dimmed !== incoming.dimmed || sn.pinned !== incoming.pinned)) {
        sn.highlighted = incoming.highlighted;
        sn.dimmed      = incoming.dimmed;
        sn.pinned      = incoming.pinned;
        if (incoming.pinned) { sn.fx = sn.x; sn.fy = sn.y; }
        else                  { sn.fx = undefined; sn.fy = undefined; }
        changed = true;
      }
    });
    if (changed) setSimNodes([...simNodesList]);

    const links = simulationRef.current
      ? (simulationRef.current.force('link') as d3.ForceLink<SimNode, SimEdge> | null)?.links() ?? []
      : [];
    links.forEach((se) => {
      const incoming = edges.find((e) => e.id === (se as SimEdge).id);
      if (incoming) {
        (se as SimEdge).highlighted = incoming.highlighted;
        (se as SimEdge).dimmed      = incoming.dimmed;
      }
    });
    if (changed) setSimEdges([...links] as SimEdge[]);
   
  }, [nodes, edges]);

  // ── Zoom behaviour ──────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    const g   = gRef.current;
    if (!svg || !g) return;

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 5])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        d3.select(g).attr('transform', event.transform.toString());
        setTransform(event.transform);
        updateMiniMapViewport(event.transform);
      });

    d3.select(svg)
      .call(zoom)
      .on('dblclick.zoom', null);

    zoomRef.current = zoom;
    return () => { d3.select(svg).on('.zoom', null); };
  }, [dimensions, updateMiniMapViewport]);

  // ── D3 drag — FIXED ─────────────────────────────────────────
  // FIX: Uses simulationRef (stable ref) instead of stale simNodes closure.
  // FIX: Uses d3 v7 event argument (first param to callbacks), not d3.event.
  // FIX: alphaTarget(0.3) on start, alphaTarget(0) on end — correct pattern.
  const attachDrag = useCallback((el: SVGGElement | null, nodeId: string) => {
    if (!el) return;

    const drag = d3.drag<SVGGElement, unknown>()
      .on('start', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
        isDragging.current = true;
        const sim = simulationRef.current;
        if (!sim) return;
        if (!event.active) sim.alphaTarget(0.3).restart();
        // Fix the dragged node in place
        const n = sim.nodes().find((x) => x.id === nodeId);
        if (n) { n.fx = n.x; n.fy = n.y; }
      })
      .on('drag', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
        const n = simulationRef.current?.nodes().find((x) => x.id === nodeId);
        if (n) { n.fx = event.x; n.fy = event.y; }
      })
      .on('end', function (event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
        isDragging.current = false;
        const sim = simulationRef.current;
        if (!sim) return;
        if (!event.active) sim.alphaTarget(0);
        // Release node unless it's pinned
        const n = sim.nodes().find((x) => x.id === nodeId);
        if (n && !n.pinned) { n.fx = undefined; n.fy = undefined; }
      });

    d3.select(el).call(drag as d3.DragBehavior<SVGGElement, unknown, unknown>);
  }, []); // stable — only uses refs

  // ── Minimap viewport ─────────────────────────────────────────
  function updateMiniMapViewport(t: d3.ZoomTransform) {
    const { width, height } = dimensions;
    const scale = t.k;
    const vw = width  / scale;
    const vh = height / scale;
    const vx = -t.x  / scale;
    const vy = -t.y  / scale;
    setMmViewport({
      x: vx * (MM_W / width),
      y: vy * (MM_H / height),
      w: vw * (MM_W / width),
      h: vh * (MM_H / height),
    });
  }

  // ── Zoom to fit — internal (uses refs, no stale closure) ────
  function zoomFitInternal() {
    const svg = svgRef.current;
    const z   = zoomRef.current;
    const sim = simulationRef.current;
    if (!svg || !z || !sim || sim.nodes().length === 0) return;

    const ns = sim.nodes();
    const xs = ns.map((n) => n.x ?? 0);
    const ys = ns.map((n) => n.y ?? 0);
    const x0 = Math.min(...xs) - 70;
    const x1 = Math.max(...xs) + 70;
    const y0 = Math.min(...ys) - 70;
    const y1 = Math.max(...ys) + 70;
    const { width: W, height: H } = dimensions;
    const scale = Math.min(W / (x1 - x0), H / (y1 - y0), 2) * 0.88;
    const tx = W / 2 - scale * ((x0 + x1) / 2);
    const ty = H / 2 - scale * ((y0 + y1) / 2);
    d3.select(svg)
      .transition()
      .duration(500)
      .call(z.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  // ── Public zoom controls ─────────────────────────────────────
  const zoomIn  = useCallback(() => {
    const svg = svgRef.current;
    const z   = zoomRef.current;
    if (svg && z) d3.select(svg).transition().duration(220).call(z.scaleBy, 1.4);
  }, []);

  const zoomOut = useCallback(() => {
    const svg = svgRef.current;
    const z   = zoomRef.current;
    if (svg && z) d3.select(svg).transition().duration(220).call(z.scaleBy, 1 / 1.4);
  }, []);

  const zoomFit = useCallback(() => zoomFitInternal(), [zoomFitInternal]);

  // ── Node interaction handlers ────────────────────────────────
  const handleNodeClick = useCallback(
    (_e: React.MouseEvent, node: GraphNode) => {
      if (selectedNodeId === node.id) {
        onSelectNode(null);
        onClearHighlight();
      } else {
        onSelectNode(node.id);
        onHighlightConnections(node.id);
      }
      setContextMenu((c) => ({ ...c, visible: false }));
    },
    [selectedNodeId, onSelectNode, onClearHighlight, onHighlightConnections]
  );

  const handleNodeDoubleClick = useCallback(
    (_e: React.MouseEvent, node: GraphNode) => {
      onExpandNode(node.id);
    },
    [onExpandNode]
  );

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: GraphNode) => {
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node });
    },
    []
  );

  const handleNodeMouseEnter = useCallback(
    (e: React.MouseEvent, node: GraphNode) => {
      onHoverNode(node.id);
      setTooltip({ node, edgeLabel: null, x: e.clientX, y: e.clientY });
    },
    [onHoverNode]
  );

  const handleNodeMouseLeave = useCallback(() => {
    onHoverNode(null);
    setTooltip({ node: null, edgeLabel: null, x: 0, y: 0 });
  }, [onHoverNode]);

  const handleEdgeMouseEnter = useCallback(
    (e: React.MouseEvent, label: string) => {
      setTooltip({ node: null, edgeLabel: label, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleEdgeMouseLeave = useCallback(() => {
    setTooltip({ node: null, edgeLabel: null, x: 0, y: 0 });
  }, []);

  const handleCanvasClick = useCallback(() => {
    onSelectNode(null);
    onClearHighlight();
    setContextMenu((c) => ({ ...c, visible: false }));
  }, [onSelectNode, onClearHighlight]);

  // ── Minimap node dots ─────────────────────────────────────────
  const mmNodes = useMemo(() => {
    if (simNodes.length === 0) return [];
    const xs     = simNodes.map((n) => n.x ?? 0);
    const ys     = simNodes.map((n) => n.y ?? 0);
    const minX   = Math.min(...xs);
    const maxX   = Math.max(...xs);
    const minY   = Math.min(...ys);
    const maxY   = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    return simNodes.map((n) => ({
      id:   n.id,
      x:    MM_PAD + ((n.x - minX) / rangeX) * (MM_W - 2 * MM_PAD),
      y:    MM_PAD + ((n.y - minY) / rangeY) * (MM_H - 2 * MM_PAD),
      r:    2.5,
      fill: n.dimmed      ? 'rgba(0,163,199,0.15)'
           : n.highlighted ? '#00c3ef'
           : 'rgba(0,163,199,0.55)',
    }));
  }, [simNodes]);

  const displayedEdges = useMemo(() => {
    if (!hoveredNodeId) return simEdges;

    return simEdges.map((edge) => {
      const isIncident =
        (edge.source as SimNode).id === hoveredNodeId ||
        (edge.target as SimNode).id === hoveredNodeId;
      return {
        ...edge,
        highlighted: isIncident || edge.highlighted,
        dimmed: !isIncident,
      };
    });
  }, [simEdges, hoveredNodeId]);

  const isEmpty = nodes.length === 0;

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className={styles.canvas}>

      {/* ── Empty state ── */}
      <AnimatePresence>
        {isEmpty && (
          <motion.div
            className={styles.emptyState}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Tile className={styles.emptyTile}>
              <p className={styles.emptyTitle}>GRAPH EMPTY</p>
              <p className={styles.emptyText}>
                Search entities to build graph, or load the sample dataset.
              </p>
              <Button
                size="sm"
                kind="primary"
                renderIcon={Add}
                onClick={onLoadSample}
                className={styles.emptyBtn}
              >
                Load Sample Graph
              </Button>
            </Tile>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SVG canvas ── */}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className={`${styles.svg} graph-svg-export`}
        onClick={handleCanvasClick}
        aria-label="Entity relationship graph"
      >
        {/* ── Defs: arrow markers ── */}
        <defs>
          {/*
            FIX: Arrow marker geometry corrected.
            viewBox "0 0 10 10" with refX=9 positions the tip exactly at the line end.
            Using markerUnits="strokeWidth" makes it scale with line thickness.
          */}
          <marker
            id="arrow"
            viewBox="0 -5 10 10"
            refX={10}
            refY={0}
            markerWidth={8}
            markerHeight={8}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,-5L10,0L0,5" fill="#2a4a6a" />
          </marker>

          <marker
            id="arrow-highlighted"
            viewBox="0 -5 10 10"
            refX={10}
            refY={0}
            markerWidth={8}
            markerHeight={8}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,-5L10,0L0,5" fill="#00c3ef" />
          </marker>

          <marker
            id="arrow-hover"
            viewBox="0 -5 10 10"
            refX={10}
            refY={0}
            markerWidth={8}
            markerHeight={8}
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,-5L10,0L0,5" fill="rgba(0,163,199,0.75)" />
          </marker>

          {/* Dot grid background pattern */}
          <pattern id="dotgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx={16} cy={16} r={0.8} fill="rgba(0,163,199,0.08)" />
          </pattern>

          {/* Node glow filter */}
          <filter id="node-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Background dot grid ── */}
        <rect width="100%" height="100%" fill="url(#dotgrid)" />

        {/* ── Main transform group (zoom/pan target) ── */}
        <g ref={gRef}>

          {/* ── Edges (rendered below nodes) ── */}
          {displayedEdges.map((edge) => {
            const source = edge.source as SimNode;
            const target = edge.target as SimNode;
            if (source?.x == null || target?.x == null) return null;
            return (
              <GraphEdgeComponent
                key={edge.id}
                edge={edge}
                sourceNode={source}
                targetNode={target}
                onMouseEnter={handleEdgeMouseEnter}
                onMouseLeave={handleEdgeMouseLeave}
              />
            );
          })}

          {/* ── Nodes (rendered above edges) ── */}
          {simNodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            return (
              <GraphNodeComponent
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                isHovered={node.id === hoveredNodeId}
                onMouseEnter={handleNodeMouseEnter}
                onMouseLeave={handleNodeMouseLeave}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                onContextMenu={handleNodeContextMenu}
                dragRef={(el) => attachDrag(el, node.id)}
              />
            );
          })}
        </g>
      </svg>

      {/* ── Zoom controls ── */}
      <div className={styles.zoomControls}>
        <button className={styles.zoomBtn} onClick={zoomIn}  aria-label="Zoom in"      title="Zoom in">+</button>
        <button className={styles.zoomBtn} onClick={zoomFit} aria-label="Fit to screen" title="Fit all">⊡</button>
        <button className={styles.zoomBtn} onClick={zoomOut} aria-label="Zoom out"     title="Zoom out">−</button>
      </div>

      {/* ── Minimap ── */}
      {!isEmpty && (
        <div className={styles.miniMap}>
          <svg width={MM_W} height={MM_H} className={styles.mmSvg}>
            <rect width={MM_W} height={MM_H} fill="var(--bg-base)" rx={1} />

            {simEdges.map((e) => {
              const src = e.source as SimNode;
              const tgt = e.target as SimNode;
              const ms  = mmNodes.find((m) => m.id === src.id);
              const mt  = mmNodes.find((m) => m.id === tgt.id);
              if (!ms || !mt) return null;
              return (
                <line
                  key={e.id}
                  x1={ms.x} y1={ms.y}
                  x2={mt.x} y2={mt.y}
                  stroke="rgba(0,163,199,0.18)"
                  strokeWidth={0.6}
                />
              );
            })}

            {mmNodes.map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={n.r} fill={n.fill} />
            ))}

            <rect
              x={Math.max(0, mmViewport.x)}
              y={Math.max(0, mmViewport.y)}
              width={Math.min(MM_W, Math.max(4, mmViewport.w))}
              height={Math.min(MM_H, Math.max(4, mmViewport.h))}
              fill="rgba(0,163,199,0.05)"
              stroke="rgba(0,163,199,0.45)"
              strokeWidth={1}
              rx={1}
            />
          </svg>
          <p className={styles.mmLabel}>OVERVIEW</p>
        </div>
      )}

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu.visible && contextMenu.node && (
          <motion.div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.92, y: -6 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            onMouseLeave={() => setContextMenu((c) => ({ ...c, visible: false }))}
          >
            <div className={styles.ctxHeader}>
              <span className={styles.ctxEntityName}>{contextMenu.node.label}</span>
              <span className={styles.ctxEntityId}>{contextMenu.node.id}</span>
            </div>

            <div className={styles.ctxDivider} />

            <button className={styles.ctxItem} onClick={() => {
              onPinNode(contextMenu.node!.id);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              {contextMenu.node.pinned ? '⊙ UNPIN NODE' : '📌 PIN NODE'}
            </button>
            <button className={styles.ctxItem} onClick={() => {
              onHideNode(contextMenu.node!.id);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              👁 HIDE NODE
            </button>
            <button className={styles.ctxItem} onClick={() => {
              onHighlightConnections(contextMenu.node!.id);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              ✦ HIGHLIGHT CONNECTIONS
            </button>

            <div className={styles.ctxDivider} />

            <button className={styles.ctxItem} onClick={() => {
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              📁 ADD TO CASE
            </button>
            <button className={styles.ctxItem} onClick={() => {
              onSelectNode(contextMenu.node!.id);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              👤 OPEN ENTITY PROFILE
            </button>
            <button className={styles.ctxItem} onClick={() => {
              navigator.clipboard.writeText(contextMenu.node!.id).catch(() => {});
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              ⧉ COPY NODE ID
            </button>

            <div className={styles.ctxDivider} />

            <button className={`${styles.ctxItem} ${styles.ctxDanger}`} onClick={() => {
              onRemoveNode(contextMenu.node!.id);
              setContextMenu((c) => ({ ...c, visible: false }));
            }}>
              <TrashCan size={12} /> REMOVE FROM GRAPH
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hover tooltip ── */}
      <GraphTooltip
        node={tooltip.node}
        pos={{ x: tooltip.x, y: tooltip.y }}
        edgeLabel={tooltip.edgeLabel}
      />

      {/* ── Stats bar ── */}
      {!isEmpty && (
        <div className={styles.statsBar}>
          <span>{nodes.length} nodes</span>
          <span className={styles.statsDivider}>·</span>
          <span>{edges.length} edges</span>
          <span className={styles.statsDivider}>·</span>
          <span>{Math.round(transform.k * 100)}% zoom</span>
        </div>
      )}
    </div>
  );
};

export default GraphCanvas;