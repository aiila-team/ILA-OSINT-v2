// src/hooks/useGraph.ts
// ILA OSINT — Graph Analysis State Hook
// Manages nodes, edges, selection, highlighting, filtering, expansion.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchGraph,
  expandGraph,
  type GraphApiNode,
  type GraphApiEdge,
} from '../services/graphService';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type NodeType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DIGITAL'
  | 'VEHICLE'
  | 'FINANCIAL'
  | 'EVENT'
  | 'PHONE'
  | 'EMAIL'
  | 'IP'
  | 'SOCIAL';

export type GraphLoadState = 'idle' | 'loading' | 'success' | 'error';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  riskScore: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  pinned?: boolean;
  hidden?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  source?: string;
  location?: string;
  aliases?: string[];
  connectionCount?: number;
  lastSeen?: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  relation?: string;
  weight?: number;
  highlighted?: boolean;
  dimmed?: boolean;
}

export type LayoutMode = 'FORCE' | 'HIERARCHICAL' | 'CIRCULAR';

export interface GraphFilters {
  types: NodeType[];
  relationTypes: string[];
  riskMin: number;
  search?: string;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  highlightedIds: Set<string>;
  filters: GraphFilters;
  layoutMode: LayoutMode;
  showClusters: boolean;
  loadState: GraphLoadState;
  error: string | null;
}

function normalizeNodeType(value: string): NodeType {
  switch (value) {
    case 'PERSON':
    case 'ORGANIZATION':
    case 'LOCATION':
    case 'DIGITAL':
    case 'VEHICLE':
    case 'FINANCIAL':
    case 'EVENT':
    case 'PHONE':
    case 'EMAIL':
    case 'IP':
    case 'SOCIAL':
      return value;
    default:
      return 'DIGITAL';
  }
}

function nodeMatchesSearch(node: GraphNode, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  const matchesText = (value?: string) =>
    typeof value === 'string' && value.toLowerCase().includes(query);

  if (matchesText(node.label)) return true;
  if (matchesText(node.source)) return true;
  if (matchesText(node.location)) return true;
  if (matchesText(node.description)) return true;
  if (node.aliases?.some((alias) => matchesText(alias))) return true;

  if (node.properties) {
    for (const value of Object.values(node.properties)) {
      if (typeof value === 'string' && value.toLowerCase().includes(query)) {
        return true;
      }
    }
  }

  return false;
}

function mapApiNode(node: GraphApiNode): GraphNode {
  return {
    id: node.id,
    label: node.label,
    type: normalizeNodeType(node.type),
    riskScore: Number(node.riskScore ?? 0),
    source: node.source,
    location: node.location,
    aliases: node.aliases,
    connectionCount: node.connectionCount,
    lastSeen: node.lastSeen,
    description: node.description,
    properties: node.properties,
  };
}

function mapApiEdge(edge: GraphApiEdge): GraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? edge.relation,
    relation: edge.relation,
    weight: edge.weight,
  };
}

const DEFAULT_PAGE_SIZE = 60;

const SAMPLE_GRAPH_NODES: GraphNode[] = [
  {
    id: 'ENT-1101',
    label: 'Arjun Mehta',
    type: 'PERSON',
    riskScore: 87,
    source: 'HUMINT',
    location: 'Mumbai, India',
    aliases: ['A. Mehta', 'Shadow_AM'],
    connectionCount: 12,
    lastSeen: '2026-06-12T14:00:00Z',
    description: 'High-risk individual linked to organised financial fraud network.',
  },
  {
    id: 'ENT-1089',
    label: 'ShadowNet Pvt Ltd',
    type: 'ORGANIZATION',
    riskScore: 72,
    source: 'FINANCIAL',
    location: 'Bengaluru, India',
    connectionCount: 8,
    lastSeen: '2026-06-11T09:00:00Z',
    description: 'Shell company used for layering transactions.',
  },
  {
    id: 'ENT-1044',
    label: '192.168.44.201',
    type: 'DIGITAL',
    riskScore: 91,
    connectionCount: 34,
    lastSeen: '2026-06-13T01:45:00Z',
    description: 'C2 IP address used in coordinated intrusion campaign.',
  },
  {
    id: 'ENT-1020',
    label: 'Mumbai Port Zone',
    type: 'LOCATION',
    riskScore: 45,
    source: 'HUMINT',
    location: 'Mumbai, India',
    connectionCount: 5,
    lastSeen: '2026-06-09T12:00:00Z',
    description: 'Known transit point for contraband and dual-use goods.',
  },
  {
    id: 'ENT-1155',
    label: 'Nexus Holdings',
    type: 'FINANCIAL',
    riskScore: 78,
    source: 'FINANCIAL',
    location: 'Limassol, Cyprus',
    connectionCount: 19,
    lastSeen: '2026-06-10T17:00:00Z',
    description: 'Investment vehicle flagged for indirect exposure to sanctioned persons.',
  },
];

const SAMPLE_GRAPH_EDGES: GraphEdge[] = [
  { id: 'E-01', source: 'ENT-1101', target: 'ENT-1089', label: 'WORKS_FOR', relation: 'WORKS_FOR', weight: 3 },
  { id: 'E-02', source: 'ENT-1089', target: 'ENT-1044', label: 'USES_IP', relation: 'USES_IP', weight: 2 },
  { id: 'E-03', source: 'ENT-1101', target: 'ENT-1020', label: 'LOCATED_AT', relation: 'LOCATED_AT', weight: 1 },
  { id: 'E-04', source: 'ENT-1089', target: 'ENT-1155', label: 'TRANSACTS_WITH', relation: 'TRANSACTS_WITH', weight: 3 },
  { id: 'E-05', source: 'ENT-1101', target: 'ENT-1155', label: 'INVESTS_IN', relation: 'INVESTS_IN', weight: 2 },
];

export function useGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('FORCE');
  const [showClusters, setShowClusters] = useState(false);
  const [filters, setFilters] = useState<GraphFilters>({ types: [], relationTypes: [], riskMin: 0, search: '' });
  const [loadState, setLoadState] = useState<GraphLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const { visibleNodes, visibleEdges } = useMemo(() => {
    const hiddenIds = new Set(nodes.filter((n) => n.hidden).map((n) => n.id));
    const typeFilter = filters.types.length > 0;
    const relationFilter = filters.relationTypes.length > 0;

    const searchTerm = filters.search?.trim().toLowerCase();

    let filteredNodes = nodes.filter((n) => {
      if (n.hidden) return false;
      if (typeFilter && !filters.types.includes(n.type)) return false;
      if (n.riskScore < filters.riskMin) return false;
      if (searchTerm && !nodeMatchesSearch(n, searchTerm)) return false;
      return true;
    });

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    let visibleEdges = edges.filter(
      (e) =>
        visibleNodeIds.has(e.source) &&
        visibleNodeIds.has(e.target) &&
        !hiddenIds.has(e.source) &&
        !hiddenIds.has(e.target)
    );

    if (relationFilter) {
      const relationSet = new Set(filters.relationTypes.map((r) => r.toUpperCase()));
      visibleEdges = visibleEdges.filter((e) => relationSet.has((e.relation ?? e.label ?? '').toUpperCase()));
      const edgeNodeIds = new Set<string>();
      visibleEdges.forEach((e) => {
        edgeNodeIds.add(e.source);
        edgeNodeIds.add(e.target);
      });
      filteredNodes = filteredNodes.filter((n) => edgeNodeIds.has(n.id));
    }

    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    visibleEdges = visibleEdges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

    return { visibleNodes: filteredNodes, visibleEdges };
  }, [nodes, edges, filters]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const highlightConnections = useCallback(
    (id: string) => {
      const connected = new Set<string>([id]);
      edges.forEach((e) => {
        if (e.source === id) connected.add(e.target);
        if (e.target === id) connected.add(e.source);
      });

      setHighlightedIds(connected);
      setNodes((prev) =>
        prev.map((n) => ({
          ...n,
          highlighted: connected.has(n.id),
          dimmed: !connected.has(n.id),
        }))
      );

      setEdges((prev) =>
        prev.map((e) => ({
          ...e,
          highlighted: e.source === id || e.target === id,
          dimmed: e.source !== id && e.target !== id,
        }))
      );
    },
    [edges]
  );

  const clearHighlight = useCallback(() => {
    setHighlightedIds(new Set());
    setNodes((prev) => prev.map((n) => ({ ...n, highlighted: false, dimmed: false })));
    setEdges((prev) => prev.map((e) => ({ ...e, highlighted: false, dimmed: false })));
  }, []);

  const loadGraph = useCallback(
    async (search?: string, overrideFilters?: GraphFilters) => {
      setLoadState('loading');
      setError(null);

      const effectiveFilters = overrideFilters ?? filters;
      const query = search?.trim() || effectiveFilters.search?.trim() || undefined;

      try {
        const response = await fetchGraph({
          search: query,
          types: effectiveFilters.types.length ? effectiveFilters.types : undefined,
          relationTypes: effectiveFilters.relationTypes.length ? effectiveFilters.relationTypes : undefined,
          riskMin: effectiveFilters.riskMin,
          pageSize,
        });

        setNodes(response.nodes.map(mapApiNode));
        setEdges(response.edges.map(mapApiEdge));
        setCursor(response.pageInfo?.cursor);
        setSelectedNodeId(null);
        clearHighlight();
        setLoadState('success');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load graph data');
        setLoadState('error');
      }
    },
    [filters.riskMin, filters.types, filters.relationTypes, pageSize, clearHighlight]
  );

  const refreshGraph = useCallback(() => loadGraph(), [loadGraph]);

  const updateFilters = useCallback(
    (patch: Partial<GraphFilters>) => {
      const nextFilters = { ...filters, ...patch };
      setFilters(nextFilters);
      return loadGraph(patch.search ?? undefined, nextFilters);
    },
    [filters, loadGraph]
  );

  const searchGraph = useCallback((query: string) => {
    return updateFilters({ search: query });
  }, [updateFilters]);

  const retryGraph = useCallback(() => loadGraph(), [loadGraph]);

  useEffect(() => {
    const searchTerm = filters.search?.trim();
    if (!searchTerm) {
      clearHighlight();
      return;
    }

    setNodes((prev) => {
      const highlightedIds = new Set<string>();
      const updated = prev.map((node) => {
        const match = nodeMatchesSearch(node, searchTerm);
        if (match) highlightedIds.add(node.id);
        return {
          ...node,
          highlighted: match,
          dimmed: !match,
        };
      });
      setHighlightedIds(highlightedIds);
      return updated;
    });
  }, [filters.search, clearHighlight]);

  const expandNode = useCallback(
    async (id: string) => {
      setLoadState('loading');
      setError(null);

      try {
        const response = await expandGraph({
          nodeIds: [id],
          types: filters.types.length ? filters.types : undefined,
          relationTypes: filters.relationTypes.length ? filters.relationTypes : undefined,
          riskMin: filters.riskMin,
          pageSize,
        });

        const newNodes = response.nodes.map(mapApiNode);
        const newEdges = response.edges.map(mapApiEdge);

        setNodes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          return [...prev, ...newNodes.filter((item) => !existingIds.has(item.id))];
        });

        setEdges((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          return [...prev, ...newEdges.filter((item) => !existingIds.has(item.id))];
        });

        setLoadState('success');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to expand node');
        setLoadState('error');
      }
    },
    [filters.riskMin, filters.types, pageSize]
  );

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const hideNode = useCallback((id: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, hidden: true } : n)));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, []);

  const pinNode = useCallback((id: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, pinned: !n.pinned, fx: n.pinned ? null : n.x, fy: n.pinned ? null : n.y }
          : n
      )
    );
  }, []);

  const addNode = useCallback((node: GraphNode) => {
    setNodes((prev) => (prev.some((n) => n.id === node.id) ? prev : [...prev, node]));
  }, []);

  const addEdge = useCallback((edge: GraphEdge) => {
    setEdges((prev) => (prev.some((e) => e.id === edge.id) ? prev : [...prev, edge]));
  }, []);

  const clearGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setCursor(undefined);
    clearHighlight();
  }, [clearHighlight]);

  const loadSampleGraph = useCallback(() => {
    setNodes(SAMPLE_GRAPH_NODES);
    setEdges(SAMPLE_GRAPH_EDGES);
    setSelectedNodeId(null);
    setCursor(undefined);
    clearHighlight();
    setLoadState('success');
  }, [clearHighlight]);

  const updateNodePosition = useCallback((id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  }, []);

  useEffect(() => {
    refreshGraph();
  }, [refreshGraph]);

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    allNodes: nodes,
    selectedNode,
    selectedNodeId,
    hoveredNodeId,
    highlightedIds,
    layoutMode,
    showClusters,
    filters,
    loadState,
    error,
    cursor,
    selectNode,
    setHoveredNodeId,
    highlightConnections,
    clearHighlight,
    expandNode,
    removeNode,
    hideNode,
    pinNode,
    addNode,
    addEdge,
    clearGraph,
    loadSampleGraph,
    retryGraph,
    loadGraph,
    searchGraph,
    updateFilters,
    updateNodePosition,
    setLayoutMode,
    setShowClusters,
    setFilters,
  };
}
