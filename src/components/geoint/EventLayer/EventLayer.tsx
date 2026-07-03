// src/components/geoint/EventLayer/EventLayer.tsx
// ILA OSINT — Intelligence Event Layer
// Renders geo-tagged intel events with severity-coded pulsing markers.

import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import useLiveMock from '../../../hooks/useLiveMock';
import type { GeoEvent, EventSeverity } from '../../../data/mock/mockGeoEvents';

// ── Severity config ───────────────────────────────────────────────

const SEV_COLOR: Record<EventSeverity, string> = {
  CRITICAL: '#fa4d56',
  HIGH:     '#ff8389',
  MEDIUM:   '#f1c21b',
  LOW:      '#4589ff',
};

const SEV_GLOW: Record<EventSeverity, string> = {
  CRITICAL: 'rgba(250,77,86,0.5)',
  HIGH:     'rgba(255,131,137,0.4)',
  MEDIUM:   'rgba(241,194,27,0.35)',
  LOW:      'rgba(69,137,255,0.3)',
};

function createEventIcon(severity: EventSeverity): L.DivIcon {
  const color = SEV_COLOR[severity];
  const glow  = SEV_GLOW[severity];
  const pulse = severity === 'CRITICAL' || severity === 'HIGH';

  const pulseRing = pulse ? `
    <div style="
      position:absolute;top:50%;left:50%;
      transform:translate(-50%,-50%);
      width:22px;height:22px;border-radius:50%;
      border:2px solid ${color};
      animation:eventPulse 1.8s ease-out infinite;
      opacity:0.7;
    "></div>
    <style>
      @keyframes eventPulse{
        0%{transform:translate(-50%,-50%) scale(1);opacity:0.7}
        100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}
      }
    </style>` : '';

  const html = `
    <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
      ${pulseRing}
      <div style="
        width:12px;height:12px;border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.7);
        box-shadow:0 0 8px ${glow},0 0 2px ${color};
        position:relative;z-index:2;
      "></div>
    </div>`;

  return L.divIcon({
    html,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function getRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_LABEL: Record<GeoEvent['type'], string> = {
  THREAT_ALERT:       'THREAT',
  CYBER_INCIDENT:     'CYBER',
  MARITIME_INCIDENT:  'MARITIME',
  BORDER_EVENT:       'BORDER',
  GEOPOLITICAL_EVENT: 'GEOPOLITICAL',
  SIGNAL_ANOMALY:     'SIGNAL',
};

// ── Component ────────────────────────────────────────────────────

const EventLayer: React.FC = () => {
  const { layers, setSelectedFeature } = useGeoIntel();
  const { events: MOCK_GEO_EVENTS } = useLiveMock();

  // Determine which events to show based on active layers
  const visibleEvents = MOCK_GEO_EVENTS.filter((e) => {
    if (layers.threatAlerts && (e.type === 'THREAT_ALERT' || e.type === 'SIGNAL_ANOMALY')) return true;
    if (layers.newsEvents   && (e.type === 'GEOPOLITICAL_EVENT' || e.type === 'BORDER_EVENT')) return true;
    if (layers.socialMentions && e.type === 'CYBER_INCIDENT') return true;
    if (layers.investigations && e.type === 'MARITIME_INCIDENT') return true;
    return false;
  });

  if (!layers.threatAlerts && !layers.newsEvents && !layers.socialMentions && !layers.investigations) {
    return null;
  }

  return (
    <>
      {visibleEvents.map((ev) => (
        <Marker
          key={ev.id}
          position={[ev.lat, ev.lng]}
          icon={createEventIcon(ev.severity)}
          eventHandlers={{
            click: (e: L.LeafletMouseEvent) => {
              L.DomEvent.stopPropagation(e);
              setSelectedFeature({ featureType: 'event', data: ev });
            },
          }}
        >
          <Popup className="geoint-popup" offset={[0, -8]} maxWidth={260}>
            <div style={{
              fontFamily: 'var(--font-mono, IBM Plex Mono, monospace)',
              fontSize: '11px',
              color: 'var(--text-primary, #e0f0ff)',
              minWidth: '220px',
            }}>
              {/* Severity / type header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '7px',
                paddingBottom: '7px',
                borderBottom: '1px solid var(--panel-border)',
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: SEV_COLOR[ev.severity],
                  boxShadow: `0 0 6px ${SEV_GLOW[ev.severity]}`,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: '9px',
                  color: SEV_COLOR[ev.severity],
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                }}>
                  {ev.severity}
                </span>
                <span style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  marginLeft: '2px',
                }}>
                  {TYPE_LABEL[ev.type]}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                }}>
                  {getRelTime(ev.timestamp)}
                </span>
              </div>

              {/* Title */}
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '5px',
                lineHeight: 1.4,
              }}>
                {ev.title}
              </div>

              {/* Location */}
              <div style={{
                fontSize: '10px',
                color: 'var(--accent, #00a3c7)',
                marginBottom: '6px',
              }}>
                📍 {ev.location}
              </div>

              {/* Description */}
              <div style={{
                fontSize: '10px',
                color: 'var(--text-secondary, rgba(160,200,230,0.7))',
                lineHeight: 1.5,
                marginBottom: '6px',
              }}>
                {ev.description.slice(0, 120)}
                {ev.description.length > 120 ? '…' : ''}
              </div>

              {/* Source */}
              <div style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                borderTop: '1px solid var(--panel-border)',
                paddingTop: '5px',
              }}>
                SRC: {ev.source}
                {ev.caseId && (
                  <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>
                    {ev.caseId}
                  </span>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default EventLayer;