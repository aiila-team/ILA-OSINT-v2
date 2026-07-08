// src/data/mock/mockRiskZones.ts
// Mock risk zone polygons / heat points used for heatmap demo

export interface RiskZonePoint {
  lat: number;
  lng: number;
  intensity: number; // 0-100
}

export const MOCK_RISK_ZONES: RiskZonePoint[] = [
  { lat: 33.7, lng: 73.0, intensity: 92 },
  { lat: 34.1, lng: 74.9, intensity: 78 },
  { lat: 28.6, lng: 77.2, intensity: 88 },
  { lat: 24.9, lng: 67.0, intensity: 65 },
  { lat: 22.6, lng: 88.3, intensity: 45 },
  { lat: 16.4, lng: 64.9, intensity: 70 },
  { lat: 10.2, lng: 61.9, intensity: 55 },
  { lat: 19.0, lng: 72.9, intensity: 60 },
];

export default MOCK_RISK_ZONES;
