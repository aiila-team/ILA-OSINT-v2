// src/components/geoint/AlertsSidebar/AlertsSidebar.tsx
import React, { useMemo, useState } from 'react';
import styles from './AlertsSidebar.module.scss';
import useLiveMock from '../../../hooks/useLiveMock';
import { useGeoIntel } from '../../../hooks/useGeoIntel';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#fa4d56', HIGH: '#ff8389', MEDIUM: '#f1c21b', LOW: '#4589ff',
};

const AlertsSidebar: React.FC = () => {
  const { events } = useLiveMock();
  const { setSelectedFeature, setMapCenter } = useGeoIntel();
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>('ALL');
  const [sevFilter, setSevFilter] = useState<'ALL' | string>('ALL');

  const types = useMemo(() => Array.from(new Set(events.map((e) => e.type))), [events]);

  const visible = events.filter((e) => (typeFilter === 'ALL' ? true : e.type === typeFilter) && (sevFilter === 'ALL' ? true : e.severity === sevFilter));

  const onClickAlert = (ev: any) => {
    setSelectedFeature({ featureType: 'event', data: ev });
    setMapCenter([ev.lng, ev.lat], 8);
  };

  return (
    <aside className={styles.wrap}>
      <div className={styles.header}>
        <strong>Alerts</strong>
        <div className={styles.chip}>Live</div>
      </div>

      <div className={styles.filters}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="ALL">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
          <option value="ALL">All Sev</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>
      </div>

      <div className={styles.alertList}>
        {visible.map((a) => (
          <div key={a.id} className={styles.alertRow} onClick={() => onClickAlert(a)}>
            <div className={styles.sev} style={{ background: SEV_COLOR[a.severity] }} />
            <div className={styles.info}>
              <div className={styles.title}>{a.title}</div>
              <div className={styles.meta}>{a.location} · {new Date(a.timestamp).toLocaleTimeString()}</div>
            </div>
            <div className={styles.chip} style={{ color: SEV_COLOR[a.severity] }}>{a.severity}</div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default AlertsSidebar;
