// src/presentation/pages/analyst/EntitySearchPage.tsx
// ILA OSINT — Entity Search Page
// Full implementation: search bar, type switcher, filter sidebar,
// grid/table view, entity drawer. Carbon + Framer Motion.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Tag,
  ContentSwitcher,
  Switch,
  Button,
  Accordion,
  AccordionItem,
  Checkbox,
  Slider,
  MultiSelect,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  OverflowMenu,
  OverflowMenuItem,
  SkeletonText,
  InlineLoading,
} from '@carbon/react';

import {
  Filter,
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  Close,
} from '@carbon/icons-react';

import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import RiskGauge        from '../../../components/analyst/RiskGauge/RiskGauge';
import EntityCard       from '../../../components/analyst/Entitycard/EntityCard';
import EntityDrawer     from '../../../components/analyst/EntityDrawer/EntityDrawer';
import ErrorState       from '../../../components/analyst/ErrorState/ErrorState';
import EntityInsightsPanel, {
  type IntelligenceInsight,
} from '../../../components/analyst/EntityInsightsPanel/EntityInsightsPanel';

import {
  useEntitySearch,
  useEntitySearchStore,
  type Entity,
  type EntityType,
  type EntitySource,
  type EntityFilters,
} from '../../../hooks/useEntitySearch';

import styles from './EntitySearchPage.module.scss';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const ENTITY_TYPES: Array<{ value: EntityType; label: string }> = [
  { value: 'PERSON',    label: 'PERSON' },
  { value: 'ORG',       label: 'ORG' },
  { value: 'LOCATION',  label: 'LOCATION' },
  { value: 'DIGITAL',   label: 'DIGITAL' },
  { value: 'VEHICLE',   label: 'VEHICLE' },
  { value: 'FINANCIAL', label: 'FINANCIAL' },
];

const SOURCE_OPTIONS: Array<{ id: EntitySource; label: string }> = [
  { id: 'OSINT',      label: 'OSINT' },
  { id: 'HUMINT',     label: 'HUMINT' },
  { id: 'SIGINT',     label: 'SIGINT' },
  { id: 'SOCMINT',    label: 'SOCMINT' },
  { id: 'DARKWEB',    label: 'DARKWEB' },
  { id: 'FINANCIAL',  label: 'FINANCIAL' },
];

const TAG_OPTIONS = [
  { id: 'sanctioned',    label: 'sanctioned' },
  { id: 'shell-company', label: 'shell-company' },
  { id: 'tor-exit',      label: 'tor-exit' },
  { id: 'c2',            label: 'c2' },
  { id: 'active',        label: 'active' },
  { id: 'maritime',      label: 'maritime' },
  { id: 'monitored',     label: 'monitored' },
  { id: 'darkweb',       label: 'darkweb' },
];

const ENTITY_INSIGHTS_MOCK: IntelligenceInsight[] = [
  {
    id: 'insight-1',
    title: 'Linked to multiple fraud reports',
    description: 'This entity appears in 3 separate fraud case files and was flagged for suspicious payments.',
    severity: 'critical',
    category: 'fraud',
  },
  {
    id: 'insight-2',
    title: 'High risk activity detected',
    description: 'Recent anomaly scores indicate unusually high asset movement and covert transactions.',
    severity: 'warning',
    category: 'risk',
  },
  {
    id: 'insight-3',
    title: 'Network expansion observed',
    description: 'New communications and social handles have been linked to this entity in the past 48 hours.',
    severity: 'info',
    category: 'network',
  },
];

const TABLE_HEADERS = [
  { key: 'type',        header: 'TYPE' },
  { key: 'name',        header: 'NAME' },
  { key: 'id',          header: 'ID' },
  { key: 'risk',        header: 'RISK' },
  { key: 'lastSeen',    header: 'LAST SEEN' },
  { key: 'connections', header: 'CONNECTIONS' },
  { key: 'source',      header: 'SOURCE' },
  { key: 'actions',     header: 'ACTIONS' },
];

type EntityTableRow = {
  id: string;
  type: EntityType;
  name: string;
  risk: number;
  lastSeen: string;
  connections: number;
  source: EntitySource;
  _entity: Entity;
};

const GRID_THRESHOLD = 50;

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────
// Stagger animation variants
// ─────────────────────────────────────────────────────────────────

const gridContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const cardVariant = {
  hidden: { opacity: 0, scale: 0.94, y: 10 },
  show:   { opacity: 1, scale: 1,    y: 0,
    transition: { duration: 0.22 } },
  exit:   { opacity: 0, scale: 0.94, y: 10, transition: { duration: 0.15 } },
};

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

const EntitySearchPage: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────
  const [inputValue,    setInputValue]    = useState('');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [showHints,     setShowHints]     = useState(false);
  const [filterOpen,    setFilterOpen]    = useState(false);
  const [viewMode,      setViewModeLocal] = useState<'grid' | 'table'>('grid');
  const [activeType,    setActiveType]    = useState<EntityType | 'ALL'>('ALL');
  const [page,          setPage]          = useState(1);
  const [filters,       setFilters]       = useState<EntityFilters>({});

  const searchRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    recentSearches,
    addRecentSearch,
    selectedEntity,
    setSelectedEntity,
  } = useEntitySearchStore();

  // ── Derived filters (merge type switcher into filters) ─────────
  const resolvedFilters: EntityFilters = {
    ...filters,
    types: activeType === 'ALL' ? filters.types : [activeType],
  };

  // ── Search hook ────────────────────────────────────────────────
  const { entities, total, isLoading, error, retry } = useEntitySearch({
    query: searchQuery,
    filters: resolvedFilters,
    page,
    pageSize: 12,
  });

  // ── Debounced input ────────────────────────────────────────────
  const handleInput = useCallback((value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
      if (value.trim()) addRecentSearch(value.trim());
    }, 300);
  }, [addRecentSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Keyboard shortcut "/" to focus search ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        const input = searchRef.current?.querySelector('input');
        input?.focus();
      }
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement?.tagName === 'INPUT') return;
        setFilterOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setSelectedEntity(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSelectedEntity]);

  // ── Auto-switch to table when > GRID_THRESHOLD results ────────
  const effectiveViewMode = total > GRID_THRESHOLD ? 'table' : viewMode;

  // ── Risk score slider ──────────────────────────────────────────
  const [riskRange, setRiskRange] = useState<[number, number]>([0, 100]);

  const handleRiskChange = ({ value }: { value: number }) => {
    setRiskRange([value, 100]);
    setFilters((f) => ({ ...f, riskMin: value }));
  };

  // ── Table rows ─────────────────────────────────────────────────
  const tableRows = entities.map((e) => ({
    id: e.id,
    type: e.type,
    name: e.name,
    risk: e.riskScore,
    lastSeen: formatLastSeen(e.lastSeen),
    connections: e.connectionCount,
    source: e.source,
    _entity: e,
  }));

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <AnalystPageShell
      title="ENTITY SEARCH"
      actions={
        <div className={styles.headerActions}>
          {isLoading && <InlineLoading description="Searching…" status="active" className={styles.loader} />}
          <span className={styles.resultCount}>
            {total} {total === 1 ? 'entity' : 'entities'}
          </span>
        </div>
      }
    >
      <div className={styles.pageBody}>

        {/* ── Search bar ── */}
        <div className={styles.searchRow}>
          <div ref={searchRef} className={styles.searchWrap}>
            <Search
              size="lg"
              placeholder="SEARCH ENTITIES — person, org, IP, domain, location, vehicle..."
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInput(e.target.value || '')}
              onFocus={() => setShowHints(true)}
              onBlur={() => setTimeout(() => setShowHints(false), 150)}
              labelText="Search entities"
              className={styles.searchInput}
              autoFocus
            />

            {/* Operator hints tooltip */}
            <AnimatePresence>
              {showHints && (
                <motion.div
                  className={styles.hintsTooltip}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14 }}
                >
                  <span className={styles.hintLabel}>SEARCH OPERATORS</span>
                  <div className={styles.hintGrid}>
                    <code>type:person</code><span>Filter by entity type</span>
                    <code>risk:&gt;80</code><span>Risk score threshold</span>
                    <code>source:osint</code><span>Filter by data source</span>
                    <code>"exact phrase"</code><span>Exact match</span>
                  </div>
                  <span className={styles.hintFooter}>Press / to focus · F to toggle filters</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Filter toggle */}
          <Button
            size="lg"
            kind={filterOpen ? 'primary' : 'ghost'}
            renderIcon={Filter}
            iconDescription="Toggle filters (F)"
            hasIconOnly
            onClick={() => setFilterOpen((v) => !v)}
            className={styles.filterToggleBtn}
            aria-label="Toggle filter sidebar"
            aria-expanded={filterOpen}
          />

          {/* View toggle */}
          <div className={styles.viewToggle}>
            <Button
              size="sm"
              kind={viewMode === 'grid' ? 'primary' : 'ghost'}
              renderIcon={Grid}
              iconDescription="Grid view"
              hasIconOnly
              onClick={() => setViewModeLocal('grid')}
              aria-label="Grid view"
              disabled={total > GRID_THRESHOLD}
            />
            <Button
              size="sm"
              kind={viewMode === 'table' ? 'primary' : 'ghost'}
              renderIcon={List}
              iconDescription="Table view"
              hasIconOnly
              onClick={() => setViewModeLocal('table')}
              aria-label="Table view"
            />
          </div>
        </div>

        {/* ── Recent searches ── */}
        {recentSearches.length > 0 && !inputValue && (
          <div className={styles.recentRow}>
            <span className={styles.recentLabel}>RECENT:</span>
            {recentSearches.map((r) => (
              <Tag
                key={r}
                type="outline"
                size="sm"
                className={styles.recentTag}
                onClick={() => { setInputValue(r); handleInput(r); }}
              >
                {r}
              </Tag>
            ))}
          </div>
        )}

        <div className={styles.insightsRow}>
          <EntityInsightsPanel insights={ENTITY_INSIGHTS_MOCK} />
        </div>

        {/* ── Type switcher ── */}
        <div className={styles.typeSwitcher}>
          <ContentSwitcher
            onChange={(params) => {
              const nextType = typeof params.name === 'string' ? params.name : 'ALL';
              setActiveType(nextType as EntityType | 'ALL');
              setPage(1);
            }}
            size="sm"
            className={styles.contentSwitcher}
          >
            <Switch name="ALL"       text="ALL" />
            <Switch name="PERSON"    text="PERSON" />
            <Switch name="ORG"       text="ORG" />
            <Switch name="LOCATION"  text="LOCATION" />
            <Switch name="DIGITAL"   text="DIGITAL" />
            <Switch name="VEHICLE"   text="VEHICLE" />
            <Switch name="FINANCIAL" text="FINANCIAL" />
          </ContentSwitcher>
        </div>

        {/* ── Main layout: sidebar + results ── */}
        <div className={styles.mainLayout}>

          {/* ── Filter sidebar ── */}
          <AnimatePresence>
            {filterOpen && (
              <motion.aside
                className={styles.filterSidebar}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                aria-label="Entity filters"
              >
                <div className={styles.filterInner}>
                  <div className={styles.filterHeader}>
                    <span className={styles.filterTitle}>FILTERS</span>
                    <button
                      className={styles.filterClose}
                      onClick={() => setFilterOpen(false)}
                      aria-label="Close filters"
                    >
                      <Close size={14} />
                    </button>
                  </div>

                  <Accordion className={styles.accordion}>
                    {/* Entity type */}
                    <AccordionItem title="ENTITY TYPE" className={styles.accordionItem}>
                      <div className={styles.checkGroup}>
                        {ENTITY_TYPES.map(({ value, label }) => (
                          <Checkbox
                            key={value}
                            id={`type-${value}`}
                            labelText={label}
                            checked={filters.types?.includes(value) ?? false}
                            onChange={(_, { checked }) => {
                              setFilters((f) => {
                                const prev = f.types ?? [];
                                return {
                                  ...f,
                                  types: checked
                                    ? [...prev, value]
                                    : prev.filter((t) => t !== value),
                                };
                              });
                              setPage(1);
                            }}
                            className={styles.checkbox}
                          />
                        ))}
                      </div>
                    </AccordionItem>

                    {/* Risk score */}
                    <AccordionItem title="RISK SCORE" className={styles.accordionItem}>
                      <div className={styles.sliderWrap}>
                        <Slider
                          id="risk-slider"
                          labelText={`Min: ${riskRange[0]}`}
                          min={0}
                          max={100}
                          value={riskRange[0]}
                          onChange={handleRiskChange}
                          className={styles.slider}
                        />
                      </div>
                    </AccordionItem>

                    {/* Data source */}
                    <AccordionItem title="DATA SOURCE" className={styles.accordionItem}>
                      <MultiSelect
                        id="source-select"
                        label="Select sources…"
                        items={SOURCE_OPTIONS}
                        itemToString={(item) => item?.label ?? ''}
                        onChange={({ selectedItems }) => {
                          setFilters((f) => ({
                            ...f,
                              sources: selectedItems?.map((s) => s.id) ?? [],
                          }));
                          setPage(1);
                        }}
                        className={styles.multiSelect}
                      />
                    </AccordionItem>

                    {/* Tags */}
                    <AccordionItem title="TAGS" className={styles.accordionItem}>
                      <MultiSelect
                        id="tags-select"
                        label="Select tags…"
                        items={TAG_OPTIONS}
                        itemToString={(item) => item?.label ?? ''}
                        onChange={({ selectedItems }) => {
                          setFilters((f) => ({
                            ...f,
                            tags: selectedItems?.map((t) => t.id) ?? [],
                          }));
                          setPage(1);
                        }}
                        className={styles.multiSelect}
                      />
                    </AccordionItem>
                  </Accordion>

                  {/* Clear filters */}
                  <button
                    className={styles.clearFilters}
                    onClick={() => { setFilters({}); setRiskRange([0, 100]); setPage(1); }}
                  >
                    Clear all filters
                  </button>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ── Results area ── */}
          <div className={styles.resultsArea}>

            {/* Loading skeleton */}
            {isLoading && (
              <div className={styles.skeletonGrid}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={styles.skeletonCard}>
                    <SkeletonText paragraph lineCount={4} />
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {!isLoading && error && (
              <ErrorState
                title="Entity search failed"
                message={error}
                onRetry={retry}
              />
            )}

            {/* Empty state */}
            {!isLoading && !error && entities.length === 0 && (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>NO ENTITIES FOUND</p>
                <p className={styles.emptyText}>
                  {searchQuery
                    ? `No results for "${searchQuery}". Try broader terms or adjust filters.`
                    : 'Search for entities using the bar above.'}
                </p>
              </div>
            )}

            {/* Grid view */}
            {!isLoading && entities.length > 0 && effectiveViewMode === 'grid' && (
              <motion.div
                className={styles.entityGrid}
                variants={gridContainer}
                initial="hidden"
                animate="show"
              >
                <AnimatePresence>
                  {entities.map((entity) => (
                    <motion.div key={entity.id} variants={cardVariant} layout>
                      <EntityCard
                        entity={entity}
                        onSelect={setSelectedEntity}
                        onAddToGraph={(e) => console.info('Add to graph:', e.id)}
                        onAddToCase={(e) => console.info('Add to case:', e.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Table view */}
            {!isLoading && entities.length > 0 && effectiveViewMode === 'table' && (
              <div className={styles.tableWrap}>
                <DataTable<EntityTableRow, any[]> rows={tableRows} headers={TABLE_HEADERS} isSortable>
                  {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                    <TableContainer className={styles.tableContainer}>
                      <Table {...getTableProps()} className={styles.table} size="sm">
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader
                                {...getHeaderProps({ header })}
                                key={header.key}
                                className={styles.th}
                              >
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row) => {
                            const entity = (row as any)._entity as Entity;
                            return (
                              <TableRow
                                {...getRowProps({ row })}
                                key={row.id}
                                className={`${styles.tr} ${entity.riskScore >= 80 ? styles.criticalRow : ''}`}
                                onClick={() => setSelectedEntity(entity)}
                              >
                                <TableCell className={styles.td}>
                                  <Tag type="outline" size="sm" className={styles.typeTagTable}>
                                    {row.type}
                                  </Tag>
                                </TableCell>
                                <TableCell className={`${styles.td} ${styles.nameTd}`}>
                                  {row.name}
                                </TableCell>
                                <TableCell className={`${styles.td} ${styles.idTd}`}>
                                  {row.id}
                                </TableCell>
                                <TableCell className={styles.td}>
                                  <RiskGauge score={row.risk} size={36} showLabel />
                                </TableCell>
                                <TableCell className={`${styles.td} ${styles.monoTd}`}>
                                  {row.lastSeen}
                                </TableCell>
                                <TableCell className={`${styles.td} ${styles.monoTd}`}>
                                  {row.connections}
                                </TableCell>
                                <TableCell className={`${styles.td} ${styles.monoTd}`}>
                                  {row.source}
                                </TableCell>
                                <TableCell className={styles.td}>
                                  <OverflowMenu size="sm" iconDescription="Entity actions" flipped>
                                    <OverflowMenuItem
                                      itemText="View Profile"
                                      onClick={() => setSelectedEntity(entity)}
                                    />
                                    <OverflowMenuItem itemText="Add to Graph" />
                                    <OverflowMenuItem itemText="Add to Case" />
                                    <OverflowMenuItem
                                      itemText="Copy ID"
                                      onClick={() => navigator.clipboard.writeText(entity.id)}
                                    />
                                  </OverflowMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && total > 12 && (
              <div className={styles.pagination}>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={ChevronLeft}
                  iconDescription="Previous"
                  hasIconOnly
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                />
                <span className={styles.pageInfo}>
                  {page} / {Math.ceil(total / 12)}
                  <span className={styles.pageTotal}>&nbsp;({total} total)</span>
                </span>
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={ChevronRight}
                  iconDescription="Next"
                  hasIconOnly
                  disabled={page >= Math.ceil(total / 12)}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Entity Drawer ── */}
      <EntityDrawer
        entity={selectedEntity}
        onClose={() => setSelectedEntity(null)}
        onOpenFull={(e) => console.info('Open full profile:', e.id)}
        onAddToGraph={(e) => console.info('Add to graph:', e.id)}
        onAddToCase={(e) => console.info('Add to case:', e.id)}
        onFlag={(e) => console.info('Flag entity:', e.id)}
      />
    </AnalystPageShell>
  );
};

export default EntitySearchPage;