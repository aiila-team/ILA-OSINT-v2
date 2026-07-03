// src/hooks/useGeoIntel.ts
// ILA OSINT — GeoIntel Zustand Store
// Master state for the GeoIntel page: layers, selected feature, map config, alerts

import { create } from 'zustand';
import type { GeoEvent } from '../data/mock/mockGeoEvents';
import type { Aircraft } from '../data/mock/mockAircraft';
import type { Vessel } from '../data/mock/mockVessels';

// ── Layer keys ────────────────────────────────────────────────────

export type LayerKey =
  | 'adsb'
  | 'flightPaths'
  | 'airports'
  | 'aisVessels'
  | 'shippingRoutes'
  | 'ports'
  | 'newsEvents'
  | 'socialMentions'
  | 'threatAlerts'
  | 'watchlistLocations'
  | 'investigations'
  | 'cases';

export type BaseMapStyle = 'dark' | 'satellite' | 'terrain' | 'topo';

// ── Selected feature union ─────────────────────────────────────────

export type SelectedFeatureType = 'aircraft' | 'vessel' | 'event' | null;

export interface SelectedFeature {
  featureType: 'aircraft' | 'vessel' | 'event';
  data: Aircraft | Vessel | GeoEvent;
}

// ── Store interface ───────────────────────────────────────────────

export interface GeoIntelState {
  // Layer visibility
  layers: Record<LayerKey, boolean>;

  // Map config
  baseStyle: BaseMapStyle;
  mapCenter: [number, number]; // [lng, lat]
  mapZoom: number;

  // Selected feature (for DetailsPanel)
  selectedFeature: SelectedFeature | null;

  // Panel state
  timelineOpen: boolean;
  detailsPanelOpen: boolean;
  layerPanelOpen: boolean;
  alertsPanelOpen: boolean;

  // Live mode
  isLive: boolean;
  lastRefresh: string;

  // Actions
  toggleLayer: (key: LayerKey) => void;
  setLayerVisibility: (key: LayerKey, visible: boolean) => void;
  setBaseStyle: (style: BaseMapStyle) => void;
  setMapCenter: (center: [number, number], zoom?: number) => void;
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  clearSelectedFeature: () => void;
  toggleTimeline: () => void;
  toggleDetailsPanel: () => void;
  toggleLayerPanel: () => void;
  toggleAlertsPanel: () => void;
  setAlertsPanelOpen: (v: boolean) => void;
  setIsLive: (live: boolean) => void;
  triggerRefresh: () => void;
}

// ── Default layer state ───────────────────────────────────────────

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  adsb:                 true,
  flightPaths:          true,
  airports:             false,
  aisVessels:           true,
  shippingRoutes:       false,
  ports:                false,
  newsEvents:           true,
  socialMentions:       false,
  threatAlerts:         true,
  watchlistLocations:   false,
  investigations:       false,
  cases:                false,
};

// ── Store ─────────────────────────────────────────────────────────

export const useGeoIntel = create<GeoIntelState>((set) => ({
  layers: DEFAULT_LAYERS,

  baseStyle:  'dark',
  mapCenter:  [78.9629, 20.5937], // India centre
  mapZoom:    4.8,

  selectedFeature:  null,
  timelineOpen:     true,
  detailsPanelOpen: false,
  layerPanelOpen:   true,
  alertsPanelOpen:  false,
  isLive:           true,
  lastRefresh:      new Date().toISOString(),

  // ── Actions ────────────────────────────────────────────────────

  toggleLayer: (key) =>
    set((s) => ({
      layers: { ...s.layers, [key]: !s.layers[key] },
    })),

  setLayerVisibility: (key, visible) =>
    set((s) => ({
      layers: { ...s.layers, [key]: visible },
    })),

  setBaseStyle: (style) => set({ baseStyle: style }),

  setMapCenter: (center, zoom) =>
    set((s) => ({
      mapCenter: center,
      mapZoom:   zoom ?? s.mapZoom,
    })),

  setSelectedFeature: (feature) =>
    set({ selectedFeature: feature, detailsPanelOpen: feature !== null }),

  clearSelectedFeature: () =>
    set({ selectedFeature: null, detailsPanelOpen: false }),

  toggleTimeline:     () => set((s) => ({ timelineOpen:     !s.timelineOpen })),
  toggleDetailsPanel: () => set((s) => ({ detailsPanelOpen: !s.detailsPanelOpen })),
  toggleLayerPanel:   () => set((s) => ({ layerPanelOpen:   !s.layerPanelOpen })),
  toggleAlertsPanel:  () => set((s) => ({ alertsPanelOpen:  !s.alertsPanelOpen })),
  setAlertsPanelOpen: (v: boolean) => set({ alertsPanelOpen: v }),
  setIsLive:          (live) => set({ isLive: live }),
  triggerRefresh:     () => set({ lastRefresh: new Date().toISOString() }),
}));