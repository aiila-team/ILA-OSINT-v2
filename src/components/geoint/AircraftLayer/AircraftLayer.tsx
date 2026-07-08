// src/components/geoint/AircraftLayer/AircraftLayer.tsx
// ILA OSINT — ADS-B Aircraft Layer
// Renders aircraft markers with heading arrows, trails, and hover tooltips.

import React, { useState, useEffect, useRef } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import {
  MOCK_AIRCRAFT,
  simulateAircraftMovement,
} from '../../../data/mock/mockAircraft';
import type { Aircraft } from '../../../data/mock/mockAircraft';

// ── Aircraft SVG icon factory ─────────────────────────────────────

function createAircraftIcon(heading: number, type: Aircraft['type']): L.DivIcon {
  const color =
    type === 'MILITARY' ? '#fa4d56' :
    type === 'PRIVATE'  ? '#f1c21b' :
    type === 'CARGO'    ? '#8a3ffc' :
    '#00c3ef';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <g transform="rotate(${heading}, 14, 14)">
        <!-- Body -->
        <ellipse cx="14" cy="14" rx="3" ry="7" fill="${color}" opacity="0.95"/>
        <!-- Wings -->
        <ellipse cx="14" cy="14" rx="10" ry="2.5" fill="${color}" opacity="0.85"/>
        <!-- Tail -->
        <ellipse cx="14" cy="19" rx="4.5" ry="1.5" fill="${color}" opacity="0.8"/>
        <!-- Nose dot -->
        <circle cx="14" cy="7.5" r="1.5" fill="#fff" opacity="0.9"/>
      </g>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ── Trail colour per type ─────────────────────────────────────────

const TRAIL_COLOR: Record<Aircraft['type'], string> = {
  COMMERCIAL: 'rgba(0, 195, 239, 0.55)',
  MILITARY:   'rgba(250, 77, 86, 0.55)',
  PRIVATE:    'rgba(241, 194, 27, 0.55)',
  CARGO:      'rgba(138, 63, 252, 0.55)',
};

// ── Component ────────────────────────────────────────────────────

const AircraftLayer: React.FC = () => {
  const { layers } = useGeoIntel();
  const [aircraft, setAircraft] = useState<Aircraft[]>(MOCK_AIRCRAFT);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live position simulation
  useEffect(() => {
    if (!layers.adsb) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setAircraft((prev) => simulateAircraftMovement(prev));
    }, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [layers.adsb]);

  if (!layers.adsb) return null;

  return (
    <>
      {aircraft.map((a) => (
        <React.Fragment key={a.id}>
          {/* ── Flight trail ─────────────────────────────── */}
          {layers.flightPaths && a.trail.length > 1 && (
            <Polyline
              positions={a.trail.map(([lng, lat]) => [lat, lng])}
              pathOptions={{
                color:   TRAIL_COLOR[a.type],
                weight:  1.5,
                opacity: 1,
                dashArray: undefined,
              }}
            />
          )}

          {/* ── Aircraft marker ──────────────────────────── */}
          <Marker
            position={[a.lat, a.lng]}
            icon={createAircraftIcon(a.heading, a.type)}
            eventHandlers={{
              click: (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
              },
            }}
          >
            <Popup
              className="geoint-popup"
              offset={[0, -10]}
            >
              <div style={{
                fontFamily: 'var(--font-mono, IBM Plex Mono, monospace)',
                fontSize: '11px',
                color: 'var(--text-primary, #e0f0ff)',
                minWidth: '200px',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--panel-border)',
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: TRAIL_COLOR[a.type].replace('0.55', '1'),
                    letterSpacing: '0.1em',
                  }}>
                    {a.callsign}
                  </span>
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 6px',
                    border: `1px solid ${TRAIL_COLOR[a.type]}`,
                    color: TRAIL_COLOR[a.type].replace('0.55', '1'),
                    letterSpacing: '0.06em',
                    borderRadius: '2px',
                  }}>
                    {a.type}
                  </span>
                </div>

                {/* Route */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '6px',
                  fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--accent, #00a3c7)', fontWeight: 700 }}>{a.origin}</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span style={{ color: 'var(--accent, #00a3c7)', fontWeight: 700 }}>{a.destination}</span>
                </div>

                {/* Data rows */}
                {[
                  ['ALT',  `${a.altitude.toLocaleString()} ft`],
                  ['SPD',  `${a.speed} kts`],
                  ['HDG',  `${a.heading}°`],
                  ['REG',  a.registration],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '3px',
                  }}>
                    <span style={{ color: 'var(--text-muted, rgba(100,150,190,0.45))', fontSize: '10px' }}>
                      {label}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontSize: '10px' }}>
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

export default AircraftLayer;