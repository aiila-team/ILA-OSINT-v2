// src/components/geoint/LayerControlPanel/LayerControlPanel.tsx
// ILA OSINT — Geo Layer Control Panel
// Left accordion panel for toggling map layers grouped by category.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Accordion, AccordionItem, Toggle } from '@carbon/react';
import {
  Location,
  Radio,
  Document,
  ChevronLeft,
  ChevronRight,
} from '@carbon/icons-react';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import type { LayerKey } from '../../../hooks/useGeoIntel';
import styles from './LayerControlPanel.module.scss';

// ── Layer group definition ────────────────────────────────────────

interface LayerItem {
  key: LayerKey;
  label: string;
  color: string;
}

interface LayerGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  layers: LayerItem[];
}

const LAYER_GROUPS: LayerGroup[] = [
  {
    id:    'air',
    label: 'AIR LAYER',
    icon:  <Location size={14} />,
    layers: [
      { key: 'adsb',        label: 'ADS-B Aircraft', color: '#00c3ef' },
      { key: 'flightPaths', label: 'Flight Paths',   color: 'rgba(0,195,239,0.5)' },
      { key: 'airports',    label: 'Airports',        color: '#4589ff' },
    ],
  },
  {
    id:    'maritime',
    label: 'MARITIME LAYER',
    icon:  <Location size={14} />,
    layers: [
      { key: 'aisVessels',    label: 'AIS Vessels',      color: '#24a148' },
      { key: 'shippingRoutes',label: 'Shipping Routes',  color: 'rgba(36,161,72,0.5)' },
      { key: 'ports',         label: 'Ports',            color: '#4589ff' },
    ],
  },
  {
    id:    'osint',
    label: 'OSINT LAYER',
    icon:  <Radio size={14} />,
    layers: [
      { key: 'newsEvents',     label: 'News Events',     color: '#f1c21b' },
      { key: 'socialMentions', label: 'Social Mentions', color: '#fa4d56' },
      { key: 'threatAlerts',   label: 'Threat Alerts',   color: '#fa4d56' },
    ],
  },
  {
    id:    'intelligence',
    label: 'INTELLIGENCE LAYER',
    icon:  <Document size={14} />,
    layers: [
      { key: 'watchlistLocations', label: 'Watchlisted Locs', color: '#8a3ffc' },
      { key: 'investigations',     label: 'Investigations',   color: '#00a3c7' },
      { key: 'cases',              label: 'Cases',            color: '#ff8389' },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────

const LayerControlPanel: React.FC = () => {
  const { layers, toggleLayer, layerPanelOpen, toggleLayerPanel } = useGeoIntel();

  const activeCount = Object.values(layers).filter(Boolean).length;

  return (
    <AnimatePresence initial={false}>
      <motion.div
        className={styles.panel}
        animate={{ width: layerPanelOpen ? 'var(--layer-panel-width, 220px)' : '36px' }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* ── Collapse toggle ───────────────────────── */}
        <button
          className={styles.collapseBtn}
          onClick={toggleLayerPanel}
          title={layerPanelOpen ? 'Collapse panel' : 'Expand layers panel'}
        >
          {layerPanelOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {layerPanelOpen && (
          <motion.div
            className={styles.content}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* ── Header ───────────────────────────────── */}
            <div className={styles.header}>
              <span className={styles.headerLabel}>GEO LAYERS</span>
              <span className={styles.headerCount}>{activeCount} active</span>
            </div>

            {/* ── Accordion groups ─────────────────────── */}
            <div className={styles.accordionWrap}>
              <Accordion className={styles.accordion} size="sm">
                {LAYER_GROUPS.map((group) => (
                  <AccordionItem
                    key={group.id}
                    title={
                      <div className={styles.groupTitle}>
                        <span className={styles.groupIcon}>{group.icon}</span>
                        <span>{group.label}</span>
                        <span className={styles.groupCount}>
                          {group.layers.filter((l) => layers[l.key]).length}/{group.layers.length}
                        </span>
                      </div>
                    }
                    className={styles.accordionItem}
                    open
                  >
                    <div className={styles.layerList}>
                      {group.layers.map((item) => (
                        <div key={item.key} className={styles.layerRow}>
                          <span
                            className={styles.layerDot}
                            style={{
                              background: layers[item.key] ? item.color : 'rgba(100,150,190,0.2)',
                              boxShadow: layers[item.key] ? `0 0 6px ${item.color}` : 'none',
                            }}
                          />
                          <span className={`${styles.layerLabel} ${!layers[item.key] ? styles.layerLabelOff : ''}`}>
                            {item.label}
                          </span>
                          <Toggle
                            id={`layer-toggle-${item.key}`}
                            size="sm"
                            toggled={layers[item.key]}
                            onToggle={() => toggleLayer(item.key)}
                            className={styles.toggle}
                            hideLabel
                            labelText={item.label}
                          />
                        </div>
                      ))}
                    </div>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            {/* ── Legend ───────────────────────────────── */}
            <div className={styles.legend}>
              <div className={styles.legendTitle}>SEVERITY LEGEND</div>
              {[
                ['CRITICAL', '#fa4d56'],
                ['HIGH',     '#ff8389'],
                ['MEDIUM',   '#f1c21b'],
                ['LOW',      '#4589ff'],
              ].map(([label, color]) => (
                <div key={label} className={styles.legendRow}>
                  <span className={styles.legendDot} style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                  <span className={styles.legendLabel}>{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default LayerControlPanel;