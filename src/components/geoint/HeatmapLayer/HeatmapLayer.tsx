// src/components/geoint/HeatmapLayer/HeatmapLayer.tsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import useLiveMock from '../../../hooks/useLiveMock';

type HeatLayerInstance = {
  addTo: (map: L.Map) => HeatLayerInstance;
  remove: () => void;
};

type HeatLayerFactory = (latlngs: Array<[number, number, number]>, options?: Record<string, unknown>) => HeatLayerInstance;

type LeafletWithHeat = typeof L & {
  heatLayer?: HeatLayerFactory;
  HeatLayer?: new (
    latlngs: Array<[number, number, number]>,
    options?: Record<string, unknown>
  ) => HeatLayerInstance;
};

const HeatmapLayer: React.FC = () => {
  const map = useMap();
  const { riskZones } = useLiveMock();

  useEffect(() => {
    const leafletWithHeat = L as LeafletWithHeat;
    const points = riskZones.map((p) => [p.lat, p.lng, p.intensity / 100] as [number, number, number]);

    if (typeof leafletWithHeat.heatLayer === 'function') {
      const heat = leafletWithHeat.heatLayer(points, {
        radius: 25,
        blur: 20,
        maxZoom: 10,
      });

      heat.addTo(map);
      return () => heat.remove();
    }

    if (typeof leafletWithHeat.HeatLayer === 'function') {
      const HeatLayerCtor = leafletWithHeat.HeatLayer;
      const heat = new HeatLayerCtor(points, {
        radius: 25,
        blur: 20,
        maxZoom: 10,
      });

      heat.addTo(map);
      return () => heat.remove();
    }

    console.error('Leaflet heat plugin failed to initialize.');
    return undefined;
  }, [map, riskZones]);

  return null;
};

export default HeatmapLayer;
