// src/data/mock/mockVessels.ts
// ILA OSINT — Mock AIS Vessel Data
// 8 vessels in Indian Ocean / Arabian Sea / Bay of Bengal

export type VesselType = 'CARGO' | 'TANKER' | 'MILITARY' | 'FISHING' | 'PASSENGER';

export interface Vessel {
  id: string;
  name: string;
  mmsi: string;
  imo: string;
  flag: string;
  flagCode: string;
  type: VesselType;
  lat: number;
  lng: number;
  course: number;    // degrees
  speed: number;     // knots
  destination: string;
  eta: string;
  length: number;    // metres
  beam: number;      // metres
  draught: number;   // metres
  trail: Array<[number, number]>;
}

function buildVesselTrail(
  lat: number,
  lng: number,
  course: number,
  speed: number,
  steps = 6
): Array<[number, number]> {
  const trail: Array<[number, number]> = [];
  const rad = (course * Math.PI) / 180;
  const factor = speed * 0.000025;
  for (let i = steps; i >= 1; i--) {
    trail.push([
      lng - Math.sin(rad) * factor * i,
      lat - Math.cos(rad) * factor * i,
    ]);
  }
  trail.push([lng, lat]);
  return trail;
}

export const MOCK_VESSELS: Vessel[] = [
  {
    id: 'V001',
    name: 'MSC AURORA',
    mmsi: '566234187',
    imo: '9745123',
    flag: 'Panama',
    flagCode: 'PA',
    type: 'CARGO',
    lat: 18.92,
    lng: 72.33,
    course: 215,
    speed: 14.2,
    destination: 'DUBAI',
    eta: '2026-06-20T08:00:00Z',
    length: 299,
    beam: 48,
    draught: 13.2,
    trail: buildVesselTrail(18.92, 72.33, 215, 14.2),
  },
  {
    id: 'V002',
    name: 'CRUDE CARRIER VII',
    mmsi: '477892341',
    imo: '9612445',
    flag: 'Hong Kong',
    flagCode: 'HK',
    type: 'TANKER',
    lat: 12.44,
    lng: 65.87,
    course: 280,
    speed: 11.8,
    destination: 'MUMBAI',
    eta: '2026-06-18T22:00:00Z',
    length: 333,
    beam: 60,
    draught: 21.1,
    trail: buildVesselTrail(12.44, 65.87, 280, 11.8),
  },
  {
    id: 'V003',
    name: 'INS VIKRANT',
    mmsi: '419001003',
    imo: 'N/A',
    flag: 'India',
    flagCode: 'IN',
    type: 'MILITARY',
    lat: 15.82,
    lng: 72.68,
    course: 170,
    speed: 18.0,
    destination: 'COK',
    eta: '2026-06-17T06:00:00Z',
    length: 262,
    beam: 62,
    draught: 8.4,
    trail: buildVesselTrail(15.82, 72.68, 170, 18.0),
  },
  {
    id: 'V004',
    name: 'EVER BRIGHT',
    mmsi: '357124896',
    imo: '9834561',
    flag: 'Liberia',
    flagCode: 'LR',
    type: 'CARGO',
    lat: 8.54,
    lng: 77.92,
    course: 90,
    speed: 12.5,
    destination: 'COLOMBO',
    eta: '2026-06-17T14:00:00Z',
    length: 280,
    beam: 45,
    draught: 11.8,
    trail: buildVesselTrail(8.54, 77.92, 90, 12.5),
  },
  {
    id: 'V005',
    name: 'AL SALAM',
    mmsi: '470231456',
    imo: '9521234',
    flag: 'UAE',
    flagCode: 'AE',
    type: 'TANKER',
    lat: 22.71,
    lng: 60.14,
    course: 70,
    speed: 13.1,
    destination: 'KARACHI',
    eta: '2026-06-19T10:00:00Z',
    length: 244,
    beam: 42,
    draught: 14.6,
    trail: buildVesselTrail(22.71, 60.14, 70, 13.1),
  },
  {
    id: 'V006',
    name: 'HARBOR KING',
    mmsi: '566871234',
    imo: '9678345',
    flag: 'Singapore',
    flagCode: 'SG',
    type: 'CARGO',
    lat: 20.26,
    lng: 86.78,
    course: 340,
    speed: 10.4,
    destination: 'KOLKATA',
    eta: '2026-06-18T04:00:00Z',
    length: 189,
    beam: 32,
    draught: 8.9,
    trail: buildVesselTrail(20.26, 86.78, 340, 10.4),
  },
  {
    id: 'V007',
    name: 'NEPTUNE STAR',
    mmsi: '212432567',
    imo: '9412678',
    flag: 'Greece',
    flagCode: 'GR',
    type: 'PASSENGER',
    lat: 7.12,
    lng: 79.85,
    course: 10,
    speed: 16.8,
    destination: 'CHENNAI',
    eta: '2026-06-17T20:00:00Z',
    length: 294,
    beam: 32,
    draught: 7.6,
    trail: buildVesselTrail(7.12, 79.85, 10, 16.8),
  },
  {
    id: 'V008',
    name: 'FISHING VESSEL 0841',
    mmsi: '419882341',
    imo: 'N/A',
    flag: 'India',
    flagCode: 'IN',
    type: 'FISHING',
    lat: 10.93,
    lng: 72.21,
    course: 270,
    speed: 6.2,
    destination: 'MUMBAI',
    eta: '2026-06-16T18:00:00Z',
    length: 28,
    beam: 7,
    draught: 2.1,
    trail: buildVesselTrail(10.93, 72.21, 270, 6.2),
  },
];

export function simulateVesselMovement(vessels: Vessel[]): Vessel[] {
  return vessels.map((v) => {
    const rad = (v.course * Math.PI) / 180;
    const factor = v.speed * 0.000008;
    const newLat = v.lat + Math.cos(rad) * factor;
    const newLng = v.lng + Math.sin(rad) * factor;
    const newTrail: Array<[number, number]> = [
      ...v.trail.slice(-5),
      [newLng, newLat],
    ];
    return { ...v, lat: newLat, lng: newLng, trail: newTrail };
  });
}