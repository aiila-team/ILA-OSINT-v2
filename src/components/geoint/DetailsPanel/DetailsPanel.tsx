// src/components/geoint/DetailsPanel/DetailsPanel.tsx
// ILA OSINT — Feature Details Panel
// Right panel: shows selected aircraft / vessel / event details with actions.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Tag } from '@carbon/react';
import {
  Close,
  DocumentAdd,
  Launch,
  Add,
  WarningAlt,
  Location,
} from '@carbon/icons-react';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import type { Aircraft } from '../../../data/mock/mockAircraft';
import type { Vessel } from '../../../data/mock/mockVessels';
import type { GeoEvent, EventSeverity } from '../../../data/mock/mockGeoEvents';
import { drawerSlideIn, drawerSlideInTransition } from '../../../styles/motion';
import styles from './DetailsPanel.module.scss';

// ── Helpers ───────────────────────────────────────────────────────

const SEV_COLOR: Record<EventSeverity, string> = {
  CRITICAL: '#fa4d56',
  HIGH:     '#ff8389',
  MEDIUM:   '#f1c21b',
  LOW:      '#4589ff',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>{value}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

// ── Aircraft detail ───────────────────────────────────────────────

function AircraftDetail({ a }: { a: Aircraft }) {
  const typeColor =
    a.type === 'MILITARY' ? '#fa4d56' :
    a.type === 'PRIVATE'  ? '#f1c21b' :
    a.type === 'CARGO'    ? '#8a3ffc' : '#00c3ef';

  return (
    <>
      <div className={styles.featureHeader}>
        <Location size={16} style={{ color: typeColor }} />
        <div className={styles.featureTitle}>{a.callsign}</div>
        <span className={styles.featureBadge} style={{ borderColor: typeColor, color: typeColor }}>
          {a.type}
        </span>
      </div>

      <div className={styles.routeDisplay}>
        <span className={styles.routeCode}>{a.origin}</span>
        <span className={styles.routeArrow}>——→</span>
        <span className={styles.routeCode}>{a.destination}</span>
      </div>

      <SectionTitle>FLIGHT DATA</SectionTitle>
      <Row label="Callsign"   value={a.callsign} />
      <Row label="Reg."       value={a.registration} />
      <Row label="Altitude"   value={`${a.altitude.toLocaleString()} ft`} />
      <Row label="Speed"      value={`${a.speed} kts`} />
      <Row label="Heading"    value={`${a.heading}°`} />
      <Row label="Origin"     value={a.origin} />
      <Row label="Dest."      value={a.destination} />

      <SectionTitle>POSITION</SectionTitle>
      <Row label="Latitude"   value={`${a.lat.toFixed(4)}°N`} />
      <Row label="Longitude"  value={`${a.lng.toFixed(4)}°E`} />
    </>
  );
}

// ── Vessel detail ─────────────────────────────────────────────────

function VesselDetail({ v }: { v: Vessel }) {
  const typeColor =
    v.type === 'MILITARY'  ? '#fa4d56' :
    v.type === 'TANKER'    ? '#f1c21b' :
    v.type === 'PASSENGER' ? '#8a3ffc' :
    v.type === 'FISHING'   ? '#4589ff' : '#24a148';

  return (
    <>
      <div className={styles.featureHeader}>
        <Location size={16} style={{ color: typeColor }} />
        <div className={styles.featureTitle}>{v.name}</div>
        <span className={styles.featureBadge} style={{ borderColor: typeColor, color: typeColor }}>
          {v.type}
        </span>
      </div>

      <SectionTitle>VESSEL IDENTITY</SectionTitle>
      <Row label="MMSI"  value={v.mmsi} />
      <Row label="IMO"   value={v.imo} />
      <Row label="Flag"  value={`${v.flagCode} ${v.flag}`} />

      <SectionTitle>NAVIGATION</SectionTitle>
      <Row label="Speed"   value={`${v.speed} kts`} />
      <Row label="Course"  value={`${v.course}°`} />
      <Row label="Dest."   value={v.destination} />

      <SectionTitle>DIMENSIONS</SectionTitle>
      <Row label="Length"  value={`${v.length}m`} />
      <Row label="Beam"    value={`${v.beam}m`} />
      <Row label="Draught" value={`${v.draught}m`} />

      <SectionTitle>POSITION</SectionTitle>
      <Row label="Latitude"  value={`${v.lat.toFixed(4)}°N`} />
      <Row label="Longitude" value={`${v.lng.toFixed(4)}°E`} />
    </>
  );
}

// ── Event detail ──────────────────────────────────────────────────

function EventDetail({ ev }: { ev: GeoEvent }) {
  const sevColor = SEV_COLOR[ev.severity];

  const getRelTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <>
      <div className={styles.featureHeader}>
        <Location size={16} style={{ color: sevColor }} />
        <div className={styles.featureTitle} style={{ fontSize: '11px' }}>{ev.title}</div>
      </div>

      <div className={styles.severityBar}>
        <span
          className={styles.severityDot}
          style={{ background: sevColor, boxShadow: `0 0 6px ${sevColor}` }}
        />
        <span className={styles.severityLabel} style={{ color: sevColor }}>
          {ev.severity}
        </span>
        <span className={styles.severityType}>{ev.type.replace('_', ' ')}</span>
        <span className={styles.severityTime}>{getRelTime(ev.timestamp)}</span>
      </div>

      <div className={styles.description}>{ev.description}</div>

      <SectionTitle>INTELLIGENCE</SectionTitle>
      <Row label="Location" value={ev.location} />
      <Row label="Source"   value={ev.source} />
      {ev.caseId && <Row label="Case" value={ev.caseId} />}

      {ev.relatedEntities.length > 0 && (
        <>
          <SectionTitle>RELATED ENTITIES</SectionTitle>
          <div className={styles.tagWrap}>
            {ev.relatedEntities.map((ent) => (
              <Tag key={ent} type="cyan" size="sm" className={styles.entityTag}>
                {ent}
              </Tag>
            ))}
          </div>
        </>
      )}

      {ev.tags.length > 0 && (
        <>
          <SectionTitle>TAGS</SectionTitle>
          <div className={styles.tagWrap}>
            {ev.tags.map((tag) => (
              <Tag key={tag} type="gray" size="sm" className={styles.entityTag}>
                {tag}
              </Tag>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────

const DetailsPanel: React.FC = () => {
  const { selectedFeature, clearSelectedFeature, detailsPanelOpen } = useGeoIntel();

  return (
    <AnimatePresence>
      {detailsPanelOpen && selectedFeature && (
        <motion.aside
          className={styles.panel}
          variants={drawerSlideIn}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={drawerSlideInTransition}
        >
          {/* ── Header ──────────────────────────────── */}
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>INTEL DETAILS</span>
            <button className={styles.closeBtn} onClick={clearSelectedFeature}>
              <Close size={14} />
            </button>
          </div>

          {/* ── Content ─────────────────────────────── */}
          <div className={styles.panelBody}>
            {selectedFeature.featureType === 'aircraft' && (
              <AircraftDetail a={selectedFeature.data as Aircraft} />
            )}
            {selectedFeature.featureType === 'vessel' && (
              <VesselDetail v={selectedFeature.data as Vessel} />
            )}
            {selectedFeature.featureType === 'event' && (
              <EventDetail ev={selectedFeature.data as GeoEvent} />
            )}
          </div>

          {/* ── Actions ─────────────────────────────── */}
          <div className={styles.panelActions}>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Launch}
              iconDescription="Open Investigation"
              className={styles.actionBtn}
            >
              Open Investigation
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Add}
              iconDescription="Add Note"
              className={styles.actionBtn}
            >
              Add Note
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={WarningAlt}
              iconDescription="Create Alert"
              className={styles.actionBtn}
            >
              Create Alert
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={DocumentAdd}
              iconDescription="Add to Report"
              className={styles.actionBtn}
            >
              Add to Report
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default DetailsPanel;