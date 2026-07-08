// src/components/geoint/VesselLayer/VesselLayer.tsx
// ILA OSINT — AIS Vessel Layer
// Renders maritime vessel markers with course direction, trails, and hover popups.

import React, { useState, useEffect, useRef } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import {
  MOCK_VESSELS,
  simulateVesselMovement,
} from '../../../data/mock/mockVessels';
import type { Vessel } from '../../../data/mock/mockVessels';

// ── Vessel SVG icon factory ───────────────────────────────────────

function createVesselIcon(course: number, type: Vessel['type']): L.DivIcon {
  const color =
    type === 'MILITARY'  ? '#fa4d56' :
    type === 'TANKER'    ? '#f1c21b' :
    type === 'PASSENGER' ? '#8a3ffc' :
    type === 'FISHING'   ? '#4589ff' :
    '#24a148';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <g transform="rotate(${course}, 12, 12)">
        <!-- Hull -->
        <path d="M12 3 L17 18 L12 16 L7 18 Z" fill="${color}" opacity="0.9"/>
        <!-- Superstructure -->
        <rect x="10" y="10" width="4" height="4" rx="1" fill="${color}" opacity="0.7"/>
        <!-- Bow dot -->
        <circle cx="12" cy="4" r="1.2" fill="#fff" opacity="0.8"/>
      </g>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

const TRAIL_COLOR: Record<Vessel['type'], string> = {
  CARGO:     'rgba(36, 161, 72, 0.5)',
  TANKER:    'rgba(241, 194, 27, 0.5)',
  MILITARY:  'rgba(250, 77, 86, 0.5)',
  FISHING:   'rgba(69, 137, 255, 0.5)',
  PASSENGER: 'rgba(138, 63, 252, 0.5)',
};

function formatETA(etaStr: string): string {
  try {
    const d = new Date(etaStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
      ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) + 'Z';
  } catch {
    return etaStr;
  }
}

// ── Component ────────────────────────────────────────────────────

const VesselLayer: React.FC = () => {
  const { layers } = useGeoIntel();
  const [vessels, setVessels] = useState<Vessel[]>(MOCK_VESSELS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!layers.aisVessels) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setVessels((prev) => simulateVesselMovement(prev));
    }, 4000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [layers.aisVessels]);

  if (!layers.aisVessels) return null;

  return (
    <>
      {vessels.map((v) => (
        <React.Fragment key={v.id}>
          {/* ── Vessel trail ─────────────────────────────── */}
          {layers.shippingRoutes && v.trail.length > 1 && (
            <Polyline
              positions={v.trail.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color:  TRAIL_COLOR[v.type],
                weight: 1.5,
                opacity: 1,
              }}
            />
          )}

          {/* ── Vessel marker ────────────────────────────── */}
          <Marker
            position={[v.lat, v.lng]}
            icon={createVesselIcon(v.course, v.type)}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
              },
            }}
          >
            <Popup className="geoint-popup" offset={[0, -10]}>
              <div style={{
                fontFamily: 'var(--font-mono, IBM Plex Mono, monospace)',
                fontSize: '11px',
                color: 'var(--text-primary, #e0f0ff)',
                minWidth: '210px',
              }}>
                {/* Header */}
                <div style={{
                  marginBottom: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--panel-border)',
                }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: TRAIL_COLOR[v.type].replace('0.5', '1'),
                    marginBottom: '3px',
                    letterSpacing: '0.06em',
                  }}>
                    {v.name}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      border: `1px solid ${TRAIL_COLOR[v.type]}`,
                      color: TRAIL_COLOR[v.type].replace('0.5', '1'),
                      borderRadius: '2px',
                    }}>
                      {v.type}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      {v.flagCode} {v.flag}
                    </span>
                  </div>
                </div>

                {/* Data rows */}
                {[
                  ['MMSI',  v.mmsi],
                  ['IMO',   v.imo],
                  ['DEST',  v.destination],
                  ['ETA',   formatETA(v.eta)],
                  ['SPD',   `${v.speed} kts`],
                  ['COG',   `${v.course}°`],
                  ['SIZE',  `${v.length}m × ${v.beam}m`],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '3px',
                    gap: '8px',
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{
                      color: 'var(--text-primary)',
                      fontSize: '10px',
                      textAlign: 'right',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </Popup>
          </Marker>
        </React.Fragment>
      ))}
    </>
  );
};

export default VesselLayer;