// src/data/mock/mockAircraft.ts
// ILA OSINT — Mock ADS-B Aircraft Data
// 12 aircraft in Indian airspace / surrounding region (lat 8–35, lng 68–97)

export type AircraftType = 'COMMERCIAL' | 'MILITARY' | 'PRIVATE' | 'CARGO';

export interface Aircraft {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number;    // feet
  speed: number;       // knots
  heading: number;     // degrees 0–360
  origin: string;      // IATA
  destination: string; // IATA
  type: AircraftType;
  registration: string;
  trail: Array<[number, number]>; // [lng, lat] pairs, oldest first
}

function buildTrail(
  lat: number,
  lng: number,
  heading: number,
  speed: number,
  steps = 8
): Array<[number, number]> {
  const trail: Array<[number, number]> = [];
  const rad = (heading * Math.PI) / 180;
  const factor = speed * 0.000015;
  for (let i = steps; i >= 1; i--) {
    trail.push([
      lng - Math.sin(rad) * factor * i,
      lat - Math.cos(rad) * factor * i,
    ]);
  }
  trail.push([lng, lat]);
  return trail;
}

export const MOCK_AIRCRAFT: Aircraft[] = [
  {
    id: 'AI302',
    callsign: 'AIC302',
    lat: 19.09,
    lng: 72.85,
    altitude: 35000,
    speed: 480,
    heading: 315,
    origin: 'BOM',
    destination: 'DEL',
    type: 'COMMERCIAL',
    registration: 'VT-ANA',
    trail: buildTrail(19.09, 72.85, 315, 480),
  },
  {
    id: 'IX784',
    callsign: 'IAX784',
    lat: 12.97,
    lng: 77.58,
    altitude: 32000,
    speed: 460,
    heading: 45,
    origin: 'BLR',
    destination: 'HYD',
    type: 'COMMERCIAL',
    registration: 'VT-IXH',
    trail: buildTrail(12.97, 77.58, 45, 460),
  },
  {
    id: 'MIL001',
    callsign: 'IAF001',
    lat: 28.61,
    lng: 77.21,
    altitude: 28000,
    speed: 520,
    heading: 270,
    origin: 'VIDP',
    destination: 'VOPB',
    type: 'MILITARY',
    registration: 'K3421',
    trail: buildTrail(28.61, 77.21, 270, 520),
  },
  {
    id: 'EK522',
    callsign: 'UAE522',
    lat: 23.14,
    lng: 68.32,
    altitude: 38000,
    speed: 510,
    heading: 295,
    origin: 'BOM',
    destination: 'DXB',
    type: 'COMMERCIAL',
    registration: 'A6-ENS',
    trail: buildTrail(23.14, 68.32, 295, 510),
  },
  {
    id: 'SG412',
    callsign: 'SEJ412',
    lat: 17.45,
    lng: 78.46,
    altitude: 27000,
    speed: 420,
    heading: 180,
    origin: 'DEL',
    destination: 'HYD',
    type: 'COMMERCIAL',
    registration: 'VT-SGA',
    trail: buildTrail(17.45, 78.46, 180, 420),
  },
  {
    id: 'PVT007',
    callsign: 'VTK007',
    lat: 22.57,
    lng: 88.36,
    altitude: 18000,
    speed: 280,
    heading: 90,
    origin: 'CCU',
    destination: 'GAU',
    type: 'PRIVATE',
    registration: 'VT-KXP',
    trail: buildTrail(22.57, 88.36, 90, 280),
  },
  {
    id: 'MIL002',
    callsign: 'PAK302',
    lat: 30.18,
    lng: 71.47,
    altitude: 30000,
    speed: 550,
    heading: 195,
    origin: 'OPLH',
    destination: 'OPIS',
    type: 'MILITARY',
    registration: 'PAF-302',
    trail: buildTrail(30.18, 71.47, 195, 550),
  },
  {
    id: 'QR572',
    callsign: 'QTR572',
    lat: 25.31,
    lng: 74.62,
    altitude: 40000,
    speed: 530,
    heading: 60,
    origin: 'DOH',
    destination: 'DEL',
    type: 'COMMERCIAL',
    registration: 'A7-BAD',
    trail: buildTrail(25.31, 74.62, 60, 530),
  },
  {
    id: 'CGO101',
    callsign: 'BCG101',
    lat: 13.19,
    lng: 80.27,
    altitude: 24000,
    speed: 390,
    heading: 135,
    origin: 'MAA',
    destination: 'CMB',
    type: 'CARGO',
    registration: 'VT-CAR',
    trail: buildTrail(13.19, 80.27, 135, 390),
  },
  {
    id: 'AI945',
    callsign: 'AIC945',
    lat: 26.89,
    lng: 80.94,
    altitude: 33000,
    speed: 475,
    heading: 30,
    origin: 'BOM',
    destination: 'LKO',
    type: 'COMMERCIAL',
    registration: 'VT-ANB',
    trail: buildTrail(26.89, 80.94, 30, 475),
  },
  {
    id: 'SU234',
    callsign: 'AFL234',
    lat: 9.92,
    lng: 76.26,
    altitude: 36000,
    speed: 500,
    heading: 340,
    origin: 'COK',
    destination: 'SVO',
    type: 'COMMERCIAL',
    registration: 'VP-BQS',
    trail: buildTrail(9.92, 76.26, 340, 500),
  },
  {
    id: 'MIL003',
    callsign: 'NAVY03',
    lat: 15.48,
    lng: 73.83,
    altitude: 12000,
    speed: 320,
    heading: 220,
    origin: 'VAGO',
    destination: 'VOMM',
    type: 'MILITARY',
    registration: 'IN-543',
    trail: buildTrail(15.48, 73.83, 220, 320),
  },
];

export function simulateAircraftMovement(aircraft: Aircraft[]): Aircraft[] {
  return aircraft.map((a) => {
    const rad = (a.heading * Math.PI) / 180;
    const factor = a.speed * 0.000012;
    const newLat = a.lat + Math.cos(rad) * factor;
    const newLng = a.lng + Math.sin(rad) * factor;
    const newTrail: Array<[number, number]> = [
      ...a.trail.slice(-9),
      [newLng, newLat],
    ];
    return { ...a, lat: newLat, lng: newLng, trail: newTrail };
  });
}