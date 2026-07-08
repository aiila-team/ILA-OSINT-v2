// src/components/geoint/HeatmapLayer/HeatmapLayer.tsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet.heat';
import useLiveMock from '../../../hooks/useLiveMock';

const HeatmapLayer: React.FC = () => {
  const map = useMap();
  const { riskZones } = useLiveMock();

  useEffect(() => {
    const points = riskZones.map((p) => [p.lat, p.lng, p.intensity / 100]);
    const heat = (L as any).heatLayer(points, { radius: 25, blur: 20, maxZoom: 10 });
    heat.addTo(map as any);
    return () => { heat.remove(); };
  }, [map, riskZones]);

  return null;
};

export default HeatmapLayer;
