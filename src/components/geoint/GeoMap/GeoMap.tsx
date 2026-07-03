// src/components/geoint/GeoMap/GeoMap.tsx
// ILA OSINT — Intelligence Map Canvas
// React-Leaflet wrapper with dark tile layer, map controls, and layer child slots.

import React, { useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
import { useGeoIntel } from '../../../hooks/useGeoIntel';
import type { BaseMapStyle } from '../../../hooks/useGeoIntel';
import styles from './GeoMap.module.scss';

// ── Tile layer configs ────────────────────────────────────────────

const TILE_LAYERS: Record<BaseMapStyle, { url: string; attribution: string }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org/">OSM</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
  },
  topo: {
    url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://stamen.com/">Stamen Design</a> &copy; <a href="https://openstreetmap.org/">OSM</a>',
  },
};

// ── Inner component: syncs Zustand state → Leaflet ────────────────

function MapSync({ onMapReady }: { onMapReady?: (map: LeafletMap) => void }) {
  const map = useMap();
  const { baseStyle, setMapCenter, setSelectedFeature } = useGeoIntel();
  const tile = TILE_LAYERS[baseStyle];

  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      setMapCenter([c.lng, c.lat], map.getZoom());
    },
    click: () => {
      // Deselect on bare map click — EventLayer will stopPropagation on markers
      setSelectedFeature(null);
    },
  });

  useEffect(() => {
    if (onMapReady) onMapReady(map);
  }, [map, onMapReady]);

  // Swap tile URL when base style changes
  return (
    <TileLayer
      key={baseStyle}
      url={tile.url}
      attribution={tile.attribution}
      maxZoom={18}
    />
  );
}

// ── Fly-to helper: responds to mapCenter changes in store ─────────

function FlyToCenter() {
  const map = useMap();
  const { mapCenter, mapZoom } = useGeoIntel();
  const prevCenter = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!prevCenter.current) { prevCenter.current = mapCenter; return; }
    if (
      Math.abs(prevCenter.current[0] - mapCenter[0]) > 0.001 ||
      Math.abs(prevCenter.current[1] - mapCenter[1]) > 0.001
    ) {
      const latlng: LatLngExpression = [mapCenter[1], mapCenter[0]];
      map.flyTo(latlng, mapZoom, { duration: 1.2 });
      prevCenter.current = mapCenter;
    }
  }, [map, mapCenter, mapZoom]);

  return null;
}

// ── Props ─────────────────────────────────────────────────────────

interface GeoMapProps {
  onMapReady?: (map: LeafletMap) => void;
  children?: React.ReactNode;
}

// ── Component ────────────────────────────────────────────────────

const GeoMap: React.FC<GeoMapProps> = ({ onMapReady, children }) => {
  const { mapCenter, mapZoom } = useGeoIntel();

  const initialCenter: LatLngExpression = [mapCenter[1], mapCenter[0]];

  return (
    <div className={styles.mapContainer}>
      <MapContainer
        center={initialCenter}
        zoom={mapZoom}
        zoomControl={false}
        className={styles.leafletMap}
        minZoom={2}
        maxZoom={18}
        worldCopyJump
      >
        <MapSync onMapReady={onMapReady} />
        <FlyToCenter />
        <ZoomControl position="topright" />
        {children}
      </MapContainer>
    </div>
  );
};

export default GeoMap;