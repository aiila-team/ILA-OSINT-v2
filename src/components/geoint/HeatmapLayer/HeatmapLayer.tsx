// src/components/geoint/HeatmapLayer/HeatmapLayer.tsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet.heat/dist/leaflet-heat.js';
import useLiveMock from '../../../hooks/useLiveMock';

const HeatmapLayer: React.FC = () => {
  const map = useMap();
  const { riskZones } = useLiveMock();

  useEffect(() => {
  console.log("Leaflet:", L);
  console.log("heatLayer:", (L as any).heatLayer);

  const points = riskZones.map((p) => [p.lat, p.lng, p.intensity / 100]);

  if (!(L as any).heatLayer) {
    console.error("Heat plugin not loaded!");
    return;
  }

  const heat = (L as any).heatLayer(points, {
    radius: 25,
    blur: 20,
    maxZoom: 10,
  });

  heat.addTo(map as any);

  return () => heat.remove();
}, [map, riskZones]);
  return null;
};

export default HeatmapLayer;
