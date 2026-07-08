// src/presentation/pages/analyst/GraphAnalysisPage.tsx
// ILA OSINT — Graph Analysis Page
// Entity relationship graph with D3 force layout, toolbar, filter bar, detail panel.

import React, { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Button,
  ContentSwitcher,
  Switch,
  Search,
  Tag,
  Toggle,
  InlineLoading,
} from '@carbon/react';
import {
  Filter,
  Export,
  TrashCan,
  Close,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import GraphCanvas       from '../../../components/analyst/GraphCanvas/GraphCanvas';
import EntityDrawer      from '../../../components/analyst/EntityDrawer/EntityDrawer';

import { useGraph, type NodeType, type LayoutMode } from '../../../hooks/useGraph';
import type { Entity } from '../../../hooks/useEntitySearch';
import styles from './GraphAnalysisPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Filter bar entity types
// ─────────────────────────────────────────────────────────────────

const FILTER_TYPES: Array<{ value: NodeType; label: string }> = [
  { value: 'PERSON',       label: 'PERSON'   },
  { value: 'ORGANIZATION', label: 'ORG'      },
  { value: 'LOCATION',     label: 'LOCATION' },
  { value: 'DIGITAL',      label: 'DIGITAL'  },
  { value: 'VEHICLE',      label: 'VEHICLE'  },
  { value: 'FINANCIAL',    label: 'FINANCIAL' },
  { value: 'EVENT',        label: 'EVENT'    },
  { value: 'PHONE',        label: 'PHONE'    },
  { value: 'EMAIL',        label: 'EMAIL'    },
  { value: 'SOCIAL',       label: 'SOCIAL'   },
  { value: 'IP',           label: 'IP'       },
];

const FILTER_RELATIONS = [
  'WORKS_FOR',
  'TRANSACTS_WITH',
  'LOCATED_AT',
  'USES_IP',
  'OWNED_BY',
  'ASSOCIATED_WITH',
  'CONNECTED_TO',
  'INVESTS_IN',
];

// Map GraphNode to Entity shape for EntityDrawer
function graphNodeToEntity(node: ReturnType<typeof useGraph>['selectedNode']): Entity | null {
  if (!node) return null;
  return {
    id:              node.id,
    name:            node.label,
    type:            (node.type === 'ORGANIZATION' ? 'ORG' : node.type) as Entity['type'],
    riskScore:       node.riskScore,
    lastSeen:        node.lastSeen ?? new Date().toISOString(),
    source:          (node.source ?? 'OSINT') as Entity['source'],
    tags:            [],
    connectionCount: node.connectionCount ?? 0,
    aliases:         node.aliases,
    location:        node.location,
    description:     node.description,
  };
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const GraphAnalysisPage: React.FC = () => {
  const graph = useGraph();

  const [searchValue,   setSearchValue]   = useState('');
  const [filterBarOpen, setFilterBarOpen] = useState(true);
  const [isExporting,   setIsExporting]   = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  // ── Type filter toggle ────────────────────────────────────────
  const toggleTypeFilter = useCallback(
    (type: NodeType) => {
      const next = new Set(graph.filters.types);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      graph.updateFilters({ types: [...next] });
    },
    [graph]
  );

  // ── Layout switcher ───────────────────────────────────────────
  const toggleRelationFilter = useCallback(
    (relation: string) => {
      const next = new Set(graph.filters.relationTypes);
      if (next.has(relation)) next.delete(relation);
      else next.add(relation);
      graph.updateFilters({ relationTypes: [...next] });
    },
    [graph]
  );

  const handleLayoutChange = useCallback(
    (params: { name?: string | number }) => {
      if (params.name === undefined) return;
      graph.setLayoutMode(params.name as LayoutMode);
    },
    [graph]
  );

  // ── Export SVG ────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 600));
    const svg = document.querySelector('.graph-svg-export');
    if (svg) {
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `ILA_Graph_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsExporting(false);
  }, []);

  // ── Header right actions ──────────────────────────────────────
  const headerActions = (
    <div className={styles.headerStats}>
      <span className={styles.statChip}>
        {graph.nodes.length} nodes
      </span>
      <span className={styles.statChip}>
        {graph.edges.length} edges
      </span>
      <span className={styles.statChip}>
        {graph.loadState === 'loading' ? 'LOADING…' : graph.loadState === 'error' ? 'ERROR' : 'READY'}
      </span>
      {graph.error && (
        <span className={`${styles.statChip} ${styles.errorChip}`}>
          {graph.error}
        </span>
      )}
      {graph.selectedNode && (
        <span className={`${styles.statChip} ${styles.statSelected}`}>
          {graph.selectedNode.label}
        </span>
      )}
    </div>
  );

  const drawerEntity = graphNodeToEntity(graph.selectedNode);

  return (
    <AnalystPageShell title="GRAPH ANALYSIS" actions={headerActions}>
      <div className={styles.pageLayout}>

        {/* ════════════════════════════════════════════════════════
            TOOLBAR
        ════════════════════════════════════════════════════════ */}
        <div className={styles.toolbar}>

          {/* Left: layout switcher */}
          <div className={styles.toolbarLeft}>
            <ContentSwitcher
              onChange={handleLayoutChange}
              size="sm"
              className={styles.layoutSwitcher}
            >
              <Switch name="FORCE"       text="FORCE" />
              <Switch name="HIERARCHICAL" text="HIERARCHICAL" />
              <Switch name="CIRCULAR"    text="CIRCULAR" />
            </ContentSwitcher>
          </div>

          {/* Centre: entity search */}
          <div ref={searchRef} className={styles.toolbarCenter}>
            <Search
              size="sm"
              placeholder="Search entities to add to graph…"
              value={searchValue}
              onChange={(e) => {
                const value = e.target.value;
                setSearchValue(value);
                graph.searchGraph(value);
              }}
              labelText="Search entities"
              className={styles.toolbarSearch}
            />
          </div>

          {/* Right: controls */}
          <div className={styles.toolbarRight}>
            <Button
              size="sm"
              kind={filterBarOpen ? 'primary' : 'ghost'}
              renderIcon={Filter}
              iconDescription="Toggle filter bar"
              hasIconOnly
              onClick={() => setFilterBarOpen((v) => !v)}
              aria-label="Toggle filter bar"
              className={styles.toolBtn}
            />

            <div className={styles.clusterToggle}>
              <Toggle
                id="cluster-toggle"
                size="sm"
                labelText=""
                labelA="CLUSTER OFF"
                labelB="CLUSTER ON"
                toggled={graph.showClusters}
                onToggle={(v) => graph.setShowClusters(v)}
              />
            </div>

            <Button
              size="sm"
              kind="ghost"
              renderIcon={isExporting ? undefined : Export}
              iconDescription="Export graph as SVG"
              hasIconOnly={!isExporting}
              onClick={handleExport}
              aria-label="Export"
              className={styles.toolBtn}
              disabled={isExporting}
            >
              {isExporting && <InlineLoading description="" status="active" />}
            </Button>

            <Button
              size="sm"
              kind="danger--ghost"
              renderIcon={TrashCan}
              iconDescription="Clear graph"
              hasIconOnly
              onClick={graph.clearGraph}
              aria-label="Clear graph"
              className={styles.toolBtn}
              disabled={graph.nodes.length === 0}
            />
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            FILTER BAR
        ════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {filterBarOpen && (
            <motion.div
              className={styles.filterBar}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className={styles.filterBarInner}>
                <span className={styles.filterLabel}>SHOW:</span>

                {FILTER_TYPES.map(({ value, label }) => {
                  const active = graph.filters.types.includes(value);
                  return (
                    <Tag
                      key={value}
                      type={active ? 'cyan' : 'outline'}
                      size="sm"
                      className={`${styles.filterTag} ${active ? styles.filterTagActive : ''}`}
                      onClick={() => toggleTypeFilter(value)}
                    >
                      {label}
                    </Tag>
                  );
                })}

                {graph.filters.types.length > 0 && (
                  <button
                    className={styles.clearFilter}
                    onClick={() => {
                      graph.updateFilters({ types: [] });
                    }}
                  >
                    <Close size={12} /> CLEAR
                  </button>
                )}

                <div className={styles.filterSpacer} />

                {/* Relation filter */}
                <span className={styles.filterLabel}>RELATIONS:</span>
                {FILTER_RELATIONS.map((relation) => {
                  const active = graph.filters.relationTypes.includes(relation);
                  return (
                    <Tag
                      key={relation}
                      type={active ? 'cyan' : 'outline'}
                      size="sm"
                      className={`${styles.filterTag} ${active ? styles.filterTagActive : ''}`}
                      onClick={() => toggleRelationFilter(relation)}
                    >
                      {relation}
                    </Tag>
                  );
                })}

                {graph.filters.relationTypes.length > 0 && (
                  <button
                    className={styles.clearFilter}
                    onClick={() => graph.updateFilters({ relationTypes: [] })}
                  >
                    <Close size={12} /> CLEAR RELATIONS
                  </button>
                )}

                <div className={styles.filterSpacer} />

                {/* Risk filter */}
                <span className={styles.filterLabel}>MIN RISK:</span>
                {[0, 35, 55, 80].map((v) => (
                  <Tag
                    key={v}
                    type={graph.filters.riskMin === v ? 'cyan' : 'outline'}
                    size="sm"
                    className={styles.filterTag}
                    onClick={() => graph.updateFilters({ riskMin: v })}
                  >
                    {v === 0 ? 'ALL' : `${v}+`}
                  </Tag>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════════
            MAIN AREA (canvas + detail panel)
        ════════════════════════════════════════════════════════ */}
        <div className={styles.mainArea}>

          {/* Graph canvas */}
          <div className={`${styles.canvasArea} ${graph.selectedNode ? styles.canvasWithPanel : ''}`}>
            <GraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              selectedNodeId={graph.selectedNodeId}
              hoveredNodeId={graph.hoveredNodeId}
              onSelectNode={graph.selectNode}
              onHoverNode={graph.setHoveredNodeId}
              onExpandNode={graph.expandNode}
              onRemoveNode={graph.removeNode}
              onHideNode={graph.hideNode}
              onPinNode={graph.pinNode}
              onHighlightConnections={graph.highlightConnections}
              onClearHighlight={graph.clearHighlight}
              onLoadSample={graph.loadSampleGraph}
            />
          </div>

          {/* Detail panel — inline on large screens */}
          <AnimatePresence>
            {graph.selectedNode && (
              <motion.aside
                className={styles.detailPanel}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className={styles.detailInner}>
                  <EntityDrawer
                    entity={drawerEntity}
                    onClose={() => {
                      graph.selectNode(null);
                      graph.clearHighlight();
                    }}
                    onOpenFull={(e) => console.info('Open full profile:', e.id)}
                    onAddToGraph={(e) => console.info('Already in graph:', e.id)}
                    onAddToCase={(e) => console.info('Add to case:', e.id)}
                    onFlag={(e) => console.info('Flag entity:', e.id)}
                    inline
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* ════════════════════════════════════════════════════════
            LEGEND
        ════════════════════════════════════════════════════════ */}
        <div className={styles.legend}>
          <span className={styles.legendLabel}>NODE TYPES:</span>
          {[
            { type: 'PERSON',       color: '#4589ff' },
            { type: 'ORG',         color: '#00a3c7' },
            { type: 'LOCATION',    color: '#42be65' },
            { type: 'DIGITAL',     color: '#8a3ffc' },
            { type: 'FINANCIAL',   color: '#f1c21b' },
            { type: 'VEHICLE',     color: '#a8c834' },
            { type: 'EVENT',       color: '#ff7eb6' },
          ].map(({ type, color }) => (
            <span key={type} className={styles.legendItem}>
              <svg width={10} height={10} viewBox="0 0 10 10">
                <circle cx={5} cy={5} r={4} fill={color} opacity={0.85} />
              </svg>
              {type}
            </span>
          ))}

          <div className={styles.legendDivider} />

          <span className={styles.legendLabel}>RISK:</span>
          {[
            { label: 'CRITICAL', color: '#fa4d56' },
            { label: 'HIGH',     color: '#ff8389' },
            { label: 'MEDIUM',   color: '#f1c21b' },
            { label: 'LOW',      color: '#24a148' },
          ].map(({ label, color }) => (
            <span key={label} className={styles.legendItem}>
              <span className={styles.legendRing} style={{ borderColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </AnalystPageShell>
  );
};

export default GraphAnalysisPage;