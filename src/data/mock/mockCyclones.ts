// src/data/mock/mockCyclones.ts
// Mock cyclone tracks for GeoIntel demo

export interface Cyclone {
  id: string;
  name: string;
  category: number; // 1-5
  lat: number;
  lng: number;
  timestamp: string;
  speedKts: number;
  direction: string;
}

const NOW = new Date('2026-06-16T09:14:00Z');
function minsAgo(m: number) { return new Date(NOW.getTime() - m * 60_000).toISOString(); }

export const MOCK_CYCLONES: Cyclone[] = [
  { id: 'CY001', name: 'Cyclone Vayu', category: 3, lat: 16.8, lng: 72.4, timestamp: minsAgo(45), speedKts: 78, direction: 'NW' },
  { id: 'CY002', name: 'Cyclone Nisha', category: 2, lat: 14.2, lng: 88.1, timestamp: minsAgo(120), speedKts: 54, direction: 'W' },
  { id: 'CY003', name: 'Tropical Disturbance A1', category: 1, lat: 10.5, lng: 66.3, timestamp: minsAgo(300), speedKts: 34, direction: 'N' },
];

export default MOCK_CYCLONES;
