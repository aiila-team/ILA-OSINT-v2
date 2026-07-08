// src/hooks/useLiveMock.ts
// Provides live-updating mock datasets for GeoIntel (events, cyclones, risk zones)

import { useEffect, useState, useRef } from 'react';
import { MOCK_GEO_EVENTS, type GeoEvent } from '../data/mock/mockGeoEvents';
import MOCK_CYCLONES, { type Cyclone } from '../data/mock/mockCyclones';
import MOCK_RISK_ZONES, { type RiskZonePoint } from '../data/mock/mockRiskZones';

function randomizeEvents(events: GeoEvent[]): GeoEvent[] {
  // shallow clone and slightly modify timestamps / severities to simulate change
  return events.map((e) => {
    const shift = Math.floor(Math.random() * 10) - 5; // minutes
    const newTs = new Date(new Date(e.timestamp).getTime() + shift * 60_000).toISOString();
    const sevOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const sevIdx = Math.max(0, Math.min(3, sevOrder.indexOf(e.severity) + (Math.random() > 0.85 ? 1 : (Math.random() < 0.1 ? -1 : 0))));
    return { ...e, timestamp: newTs, severity: sevOrder[sevIdx] as GeoEvent['severity'] };
  });
}

export function useLiveMock(refreshMs = 10000) {
  const [events, setEvents] = useState<GeoEvent[]>(MOCK_GEO_EVENTS);
  const [cyclones, setCyclones] = useState<Cyclone[]>(MOCK_CYCLONES);
  const [riskZones, setRiskZones] = useState<RiskZonePoint[]>(MOCK_RISK_ZONES);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // initial small jitter
    setEvents((e) => randomizeEvents(e));

    timerRef.current = window.setInterval(() => {
      setEvents((e) => randomizeEvents(e));
      // slightly move cyclones to simulate motion
      setCyclones((c) => c.map((cx) => ({ ...cx, lat: cx.lat + (Math.random() - 0.5) * 0.08, lng: cx.lng + (Math.random() - 0.5) * 0.08, timestamp: new Date().toISOString() })));
      // vary risk zone intensities
      setRiskZones((rz) => rz.map((p) => ({ ...p, intensity: Math.max(10, Math.min(100, p.intensity + Math.floor((Math.random() - 0.5) * 12))) })));
    }, refreshMs);

    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [refreshMs]);

  return { events, cyclones, riskZones };
}

export default useLiveMock;
