import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import 'leaflet/dist/leaflet.css';
import AnalystPageShell from '../../../components/analyst/AnalystPageshell/AnalystPageShell';
import GeoMap            from '../../../components/geoint/GeoMap/GeoMap';
import MapToolbar        from '../../../components/geoint/MapToolbar/MapToolbar';
import LayerControlPanel from '../../../components/geoint/LayerControlPanel/LayerControlPanel';
import AircraftLayer     from '../../../components/geoint/AircraftLayer/AircraftLayer';
import VesselLayer       from '../../../components/geoint/VesselLayer/VesselLayer';
import EventLayer        from '../../../components/geoint/EventLayer/EventLayer';
import CycloneLayer      from '../../../components/geoint/CycloneLayer/CycloneLayer';
import HeatmapLayer      from '../../../components/geoint/HeatmapLayer/HeatmapLayer';
import AlertsSidebar     from '../../../components/geoint/AlertsSidebar/AlertsSidebar';
import DetailsPanel      from '../../../components/geoint/DetailsPanel/DetailsPanel';
import { useGeoIntel }   from '../../../hooks/useGeoIntel';
import { pageFadeIn }    from '../../../styles/motion';
import styles from './GeoIntelPage.module.scss';
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl       from 'leaflet/dist/images/marker-icon.png';
import shadowUrl     from 'leaflet/dist/images/marker-shadow.png';
function fixLeafletIcons() {
  delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
  L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
}
function PageHeaderActions() {
  const { isLive, lastRefresh } = useGeoIntel();
  const getRelRefresh = () => {
    const diff = Date.now() - new Date(lastRefresh).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return secs + 's ago';
    return Math.floor(secs / 60) + 'm ago';
  };
  return (
    <div className={styles.headerActions}>
      <span className={`${styles.liveBadge} ${isLive ? styles.liveBadgeActive : ''}`}>
        <span className={`${styles.liveDot} ${isLive ? styles.liveDotActive : ''}`} />
        {isLive ? 'LIVE' : 'PAUSED'}
      </span>
      <span className={styles.refreshLabel}>Refreshed {getRelRefresh()}</span>
      <span className={styles.casesBadge}>CASE-0091 ACTIVE</span>
    </div>
  );
}
// ── Main Page ─────────────────────────────────────────────────────
const GeoIntelPage: React.FC = () => {
  useEffect(() => { fixLeafletIcons(); }, []);
  return (
    <AnalystPageShell
      title="GeoIntel"
      actions={<PageHeaderActions />}
    >
      <motion.div
        className={styles.page}
        variants={pageFadeIn}
        initial="initial"
        animate="animate"
      >
        <div className={styles.mapShell}>
          {useGeoIntel().alertsPanelOpen && <AlertsSidebar />}
          <LayerControlPanel />
          <div className={styles.mapColumn}>
            <MapToolbar />
            <div className={styles.mapCanvas}>
              <GeoMap>
                <AircraftLayer />
                <VesselLayer />
                <EventLayer />
                <CycloneLayer />
                <HeatmapLayer />
              </GeoMap>
              <MapCoordOverlay />
            </div>
          </div>
          <DetailsPanel />
        </div>
      </motion.div>
    </AnalystPageShell>
  );
};
// ── Coordinate overlay ────────────────────────────────────────────
function MapCoordOverlay() {
  const { mapCenter, mapZoom } = useGeoIntel();
  const [lng, lat] = mapCenter;
  return (
    <div className={styles.coordOverlay}>
      <span className={styles.coordItem}>
        {lat >= 0 ? lat.toFixed(4) + '°N' : Math.abs(lat).toFixed(4) + '°S'}
      </span>
      <span className={styles.coordSep}>/</span>
      <span className={styles.coordItem}>
        {lng >= 0 ? lng.toFixed(4) + '°E' : Math.abs(lng).toFixed(4) + '°W'}
      </span>
      <span className={styles.coordSep}>|</span>
      <span className={styles.coordItem}>Z{mapZoom.toFixed(1)}</span>
    </div>
  );
}
export default GeoIntelPage;