// src/components/geoint/MapToolbar/MapToolbar.tsx
// ILA OSINT — Map Toolbar
// Top toolbar: search, UTC clock, live indicator, refresh, map style selector.

import React, { useState, useEffect } from 'react';
import { Search } from '@carbon/react';
import {
  Time,
  Renew,
  Satellite,
  Mountain,
  Map,
  Activity,
  NotificationNew,
} from '@carbon/icons-react';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import type { BaseMapStyle } from '../../../hooks/useGeoIntel';
import styles from './MapToolbar.module.scss';

// ── Map style options ─────────────────────────────────────────────

interface StyleOption {
  key: BaseMapStyle;
  label: string;
  icon: React.ReactNode;
}

const STYLE_OPTIONS: StyleOption[] = [
  { key: 'dark',      label: 'DARK',      icon: <Activity size={13} /> },
  { key: 'satellite', label: 'SAT',       icon: <Satellite size={13} /> },
  { key: 'terrain',   label: 'TERRAIN',   icon: <Mountain size={13} /> },
  { key: 'topo',      label: 'TOPO',      icon: <Map size={13} /> },
];

// ── UTC Clock ─────────────────────────────────────────────────────

function useUTCClock(): string {
  const [utc, setUtc] = useState(() =>
    new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z'
  );
  useEffect(() => {
    const id = setInterval(() => {
      setUtc(new Date().toISOString().replace('T', ' ').substring(0, 19) + 'Z');
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return utc;
}

// ── Component ────────────────────────────────────────────────────

const MapToolbar: React.FC = () => {
  const { baseStyle, setBaseStyle, isLive, setIsLive, triggerRefresh, alertsPanelOpen, toggleAlertsPanel } =
    useGeoIntel();
  const [spinning, setSpinning] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const utc = useUTCClock();

  const handleRefresh = () => {
    setSpinning(true);
    triggerRefresh();
    setTimeout(() => setSpinning(false), 800);
  };

  return (
    <div className={styles.toolbar}>
      {/* ── Search ───────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <Search
          id="geo-search"
          size="sm"
          labelText="Search location or entity"
          placeholder="Search location, entity, flight ID…"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className={styles.search}
        />
      </div>

      <div className={styles.separator} />

      {/* ── Map style selector ───────────────────────── */}
      <div className={styles.styleGroup}>
        {STYLE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`${styles.stylePill} ${baseStyle === opt.key ? styles.stylePillActive : ''}`}
            onClick={() => setBaseStyle(opt.key)}
            title={`Switch to ${opt.label} map`}
          >
            <span className={styles.stylePillIcon}>{opt.icon}</span>
            <span className={styles.stylePillLabel}>{opt.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.separator} />

      {/* ── Live toggle ──────────────────────────────── */}
      <button
        className={`${styles.liveBtn} ${isLive ? styles.liveBtnActive : ''}`}
        onClick={() => setIsLive(!isLive)}
        title={isLive ? 'Pause live feed' : 'Resume live feed'}
      >
        <span className={`${styles.liveDot} ${isLive ? styles.liveDotActive : ''}`} />
        <span className={styles.liveBtnLabel}>{isLive ? 'LIVE' : 'PAUSED'}</span>
      </button>

      {/* ── Refresh ──────────────────────────────────── */}
      <button
        className={styles.iconBtn}
        onClick={handleRefresh}
        title="Refresh intelligence feeds"
      >
        <span className={`${styles.refreshIcon} ${spinning ? styles.refreshSpin : ''}`}>
          <Renew size={14} />
        </span>
      </button>

      <div className={styles.separator} />

      {/* ── Alerts toggle ────────────────────────────── */}
      <button
        className={`${styles.iconBtn} ${alertsPanelOpen ? styles.alertsBtnActive : ''}`}
        onClick={toggleAlertsPanel}
        title={alertsPanelOpen ? 'Close alerts' : 'Open alerts'}
      >
        <NotificationNew size={14} />
      </button>

      <div className={styles.separator} />

      {/* ── UTC Clock ────────────────────────────────── */}
      <div className={styles.utcWrap}>
        <Time size={12} className={styles.utcIcon} />
        <span className={styles.utcLabel}>UTC</span>
        <span className={styles.utcValue}>{utc.split(' ')[1]}</span>
      </div>
    </div>
  );
};

export default MapToolbar; 