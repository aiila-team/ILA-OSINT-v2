// src/components/geoint/CycloneLayer/CycloneLayer.tsx
import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useLiveMock from '../../../hooks/useLiveMock';
import { useGeoIntel } from '../../../hooks/useGeoIntel';

function cycloneIcon(cat: number): L.DivIcon {
  const color = cat >= 4 ? '#fa4d56' : cat === 3 ? '#ff8389' : '#f1c21b';
  const html = `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 8px ${color};"></div>`;
  return L.divIcon({ html, className: '', iconSize: [18, 18], iconAnchor: [9, 9] });
}

const CycloneLayer: React.FC = () => {
  const { cyclones } = useLiveMock();
  const { setSelectedFeature } = useGeoIntel();

  return (
    <>
      {cyclones.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={cycloneIcon(c.category)}
          eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setSelectedFeature({ featureType: 'event', data: { id: c.id, type: 'THREAT_ALERT', severity: 'HIGH', title: c.name, description: `Cyclone ${c.name} (cat ${c.category})`, source: 'MET', lat: c.lat, lng: c.lng, timestamp: c.timestamp, location: `${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`, relatedEntities: [], tags: [] } as any }); } }}
        >
          <Popup>
            <div style={{ fontSize: 13 }}>
              <strong>{c.name}</strong>
              <div>Category: {c.category}</div>
              <div>Speed: {c.speedKts} kts</div>
              <div>Direction: {c.direction}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{new Date(c.timestamp).toUTCString()}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default CycloneLayer;
