// src/data/mock/mockGeoEvents.ts
// ILA OSINT — Mock Intelligence Events
// 20 geo-tagged events: threat alerts, cyber, maritime, border, geopolitical

export type EventSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type EventType =
  | 'THREAT_ALERT'
  | 'CYBER_INCIDENT'
  | 'MARITIME_INCIDENT'
  | 'BORDER_EVENT'
  | 'GEOPOLITICAL_EVENT'
  | 'SIGNAL_ANOMALY';

export interface GeoEvent {
  id: string;
  type: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  source: string;
  lat: number;
  lng: number;
  timestamp: string;
  location: string;
  relatedEntities: string[];
  tags: string[];
  caseId?: string;
}

const NOW = new Date('2026-06-16T09:14:00Z');
function minsAgo(m: number) {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

export const MOCK_GEO_EVENTS: GeoEvent[] = [
  {
    id: 'EVT001',
    type: 'THREAT_ALERT',
    severity: 'CRITICAL',
    title: 'Suspected IED Precursor Movement',
    description:
      'Multi-source intelligence indicates movement of suspected explosive precursor materials via road network. Three vehicles flagged by HUMINT.',
    source: 'HUMINT / SIGINT',
    lat: 33.72,
    lng: 73.04,
    timestamp: minsAgo(12),
    location: 'Rawalpindi, Pakistan',
    relatedEntities: ['OP-IRONVEIL', 'SUBJ-441', 'SUBJ-218'],
    tags: ['IED', 'PRECURSOR', 'PRIORITY'],
    caseId: 'CASE-0081',
  },
  {
    id: 'EVT002',
    type: 'BORDER_EVENT',
    severity: 'HIGH',
    title: 'Unauthorized Cross-Border Incursion',
    description:
      'Radar track indicates three unidentified ground vehicles crossing the Line of Control at grid reference 34.12N 74.88E. No prior notification.',
    source: 'GEOINT / RADAR',
    lat: 34.12,
    lng: 74.88,
    timestamp: minsAgo(28),
    location: 'Line of Control, J&K',
    relatedEntities: ['SUBJ-776'],
    tags: ['BORDER', 'LOC', 'GROUND'],
    caseId: 'CASE-0077',
  },
  {
    id: 'EVT003',
    type: 'MARITIME_INCIDENT',
    severity: 'HIGH',
    title: 'Vessel Dark Period — AIS Blackout',
    description:
      'Cargo vessel MMSI 566234187 disabled AIS transponder for 4h 22m in a restricted maritime zone. Vessel resumed transponder signal at 06:41Z.',
    source: 'AIS / SATINT',
    lat: 16.44,
    lng: 64.91,
    timestamp: minsAgo(94),
    location: 'Arabian Sea — Restricted Zone Alpha',
    relatedEntities: ['MSC AURORA', 'PORT-DXB'],
    tags: ['DARK_VESSEL', 'AIS_OFF', 'MARITIME'],
  },
  {
    id: 'EVT004',
    type: 'CYBER_INCIDENT',
    severity: 'CRITICAL',
    title: 'Critical Infrastructure Intrusion Attempt',
    description:
      'SOC detected coordinated intrusion attempt against power grid SCADA systems. Source IPs trace to known APT-29 infrastructure. 14 failed authentication events.',
    source: 'SIGINT / SOC',
    lat: 28.63,
    lng: 77.22,
    timestamp: minsAgo(7),
    location: 'New Delhi, India',
    relatedEntities: ['APT-29', 'GRID-NDL'],
    tags: ['CYBER', 'APT', 'CRITICAL_INFRA'],
    caseId: 'CASE-0089',
  },
  {
    id: 'EVT005',
    type: 'SIGNAL_ANOMALY',
    severity: 'HIGH',
    title: 'GPS Spoofing — Airspace Zone Delta',
    description:
      'Three commercial aircraft reported GPS position discrepancies of 8–14km over the Balochistan region. Pattern consistent with ground-based spoofing equipment.',
    source: 'ADSB CORRELATION',
    lat: 28.81,
    lng: 65.78,
    timestamp: minsAgo(41),
    location: 'Balochistan, Pakistan',
    relatedEntities: ['AIC302', 'UAE522'],
    tags: ['GPS_SPOOF', 'AVIATION', 'SIGINT'],
  },
  {
    id: 'EVT006',
    type: 'GEOPOLITICAL_EVENT',
    severity: 'MEDIUM',
    title: 'Protest Activity — Embassy District',
    description:
      'Large-scale protest observed near diplomatic enclave. Estimated 3,000 participants. Social media monitoring shows organised coordination via encrypted channels.',
    source: 'OSINT / HUMINT',
    lat: 12.96,
    lng: 77.59,
    timestamp: minsAgo(155),
    location: 'Bengaluru, Karnataka',
    relatedEntities: ['ORG-NETFREE', 'SOC-MON-14'],
    tags: ['PROTEST', 'SOCIAL', 'OSINT'],
  },
  {
    id: 'EVT007',
    type: 'MARITIME_INCIDENT',
    severity: 'MEDIUM',
    title: 'Suspected Narcotics Transfer at Sea',
    description:
      'SATINT imagery shows ship-to-ship transfer between two unregistered dhows at coordinates 10.22N 61.88E. Duration approximately 35 minutes.',
    source: 'SATINT',
    lat: 10.22,
    lng: 61.88,
    timestamp: minsAgo(210),
    location: 'Gulf of Oman',
    relatedEntities: ['VESSEL-DHOW-A', 'VESSEL-DHOW-B'],
    tags: ['NARCOTICS', 'STS', 'MARITIME'],
    caseId: 'CASE-0063',
  },
  {
    id: 'EVT008',
    type: 'THREAT_ALERT',
    severity: 'HIGH',
    title: 'Weapons Depot Activity — Forward Position',
    description:
      'Increased vehicle activity at known weapons storage site. Satellite imagery shows 11 heavy vehicles loaded and departing between 02:00–04:30Z.',
    source: 'SATINT / GEOINT',
    lat: 31.47,
    lng: 74.31,
    timestamp: minsAgo(330),
    location: 'Lahore District, Pakistan',
    relatedEntities: ['SUBJ-332', 'ORG-MILITANT-7'],
    tags: ['WEAPONS', 'LOGISTICS', 'HUMINT'],
    caseId: 'CASE-0081',
  },
  {
    id: 'EVT009',
    type: 'CYBER_INCIDENT',
    severity: 'MEDIUM',
    title: 'Port Authority Network Compromise',
    description:
      'Anomalous data exfiltration detected from port authority logistics network. 2.3GB transferred to external IP. Vessel manifest data potentially exposed.',
    source: 'SIGINT',
    lat: 22.58,
    lng: 88.33,
    timestamp: minsAgo(480),
    location: 'Kolkata Port, West Bengal',
    relatedEntities: ['PORT-CCU', 'ORG-APT-41'],
    tags: ['DATA_EXFIL', 'PORT', 'CYBER'],
  },
  {
    id: 'EVT010',
    type: 'BORDER_EVENT',
    severity: 'CRITICAL',
    title: 'Armed Group Detected — Forward Observation',
    description:
      'SIGINT intercepts indicate 40–60 armed individuals staging at grid 35.47N 76.91E. Communications encrypted on non-standard military frequencies.',
    source: 'SIGINT / HUMINT',
    lat: 35.47,
    lng: 76.91,
    timestamp: minsAgo(65),
    location: 'Aksai Chin Border Region',
    relatedEntities: ['SUBJ-771', 'SUBJ-772', 'ORG-UNKNOWN-12'],
    tags: ['ARMED_GROUP', 'BORDER', 'SIGINT'],
    caseId: 'CASE-0091',
  },
  {
    id: 'EVT011',
    type: 'GEOPOLITICAL_EVENT',
    severity: 'LOW',
    title: 'Diplomatic Vehicle Convoy — Unusual Route',
    description:
      'Four diplomatic vehicles from unconfirmed nation departed established route near Islamabad. No prior notification. Surveillance continued for 2 hours.',
    source: 'HUMINT',
    lat: 33.69,
    lng: 73.07,
    timestamp: minsAgo(580),
    location: 'Islamabad, Pakistan',
    relatedEntities: ['ENTITY-DIP-7'],
    tags: ['DIPLOMATIC', 'SURVEILLANCE'],
  },
  {
    id: 'EVT012',
    type: 'SIGNAL_ANOMALY',
    severity: 'MEDIUM',
    title: 'Radar Jamming — Sector 7 Aviation',
    description:
      'Secondary radar returns distorted over 180km² zone. ATC reports intermittent loss of contact with three aircraft for 8-minute window.',
    source: 'RADAR / SIGINT',
    lat: 25.94,
    lng: 73.02,
    timestamp: minsAgo(145),
    location: 'Jodhpur Sector, Rajasthan',
    relatedEntities: ['ATC-JDH', 'AIC945'],
    tags: ['JAMMING', 'AVIATION', 'RADAR'],
  },
  {
    id: 'EVT013',
    type: 'MARITIME_INCIDENT',
    severity: 'HIGH',
    title: 'Military Vessel — Unannounced Passage',
    description:
      'Foreign military vessel transited Indian EEZ without prior notification. Vessel identified as Type-054A frigate. No response to radio hails on Ch.16.',
    source: 'AIS / SATINT',
    lat: 13.62,
    lng: 80.81,
    timestamp: minsAgo(220),
    location: 'Bay of Bengal EEZ',
    relatedEntities: ['INS VIKRANT'],
    tags: ['MILITARY', 'EEZ', 'MARITIME'],
    caseId: 'CASE-0088',
  },
  {
    id: 'EVT014',
    type: 'THREAT_ALERT',
    severity: 'HIGH',
    title: 'Chemical Compound Storage — Industrial Facility',
    description:
      'OSINT analysis of satellite imagery reveals unusual chemical drum storage at industrial site. Pattern inconsistent with declared manufacturing activities.',
    source: 'GEOINT / OSINT',
    lat: 24.88,
    lng: 67.01,
    timestamp: minsAgo(410),
    location: 'Karachi Industrial Zone',
    relatedEntities: ['FACIL-KHI-44'],
    tags: ['CBRN', 'INDUSTRIAL', 'GEOINT'],
    caseId: 'CASE-0079',
  },
  {
    id: 'EVT015',
    type: 'CYBER_INCIDENT',
    severity: 'LOW',
    title: 'Phishing Campaign — Government Employees',
    description:
      'Coordinated spear-phishing campaign targeting 340 government email addresses. Campaign attributed to financially motivated threat actor.',
    source: 'OSINT / SIGINT',
    lat: 17.38,
    lng: 78.49,
    timestamp: minsAgo(720),
    location: 'Hyderabad, Telangana',
    relatedEntities: ['ORG-TA-ECON-3'],
    tags: ['PHISHING', 'GOVERNMENT', 'CYBER'],
  },
  {
    id: 'EVT016',
    type: 'GEOPOLITICAL_EVENT',
    severity: 'MEDIUM',
    title: 'Large Military Convoy Observed',
    description:
      'Open-source video corroborated by GEOINT shows 28-vehicle military convoy transiting northern highway. Unit identification in progress.',
    source: 'OSINT / GEOINT',
    lat: 29.38,
    lng: 71.68,
    timestamp: minsAgo(185),
    location: 'Rahim Yar Khan, Pakistan',
    relatedEntities: ['ORG-MIL-PAK'],
    tags: ['CONVOY', 'MILITARY', 'OSINT'],
  },
  {
    id: 'EVT017',
    type: 'SIGNAL_ANOMALY',
    severity: 'CRITICAL',
    title: 'Encrypted Burst Transmission — Known Actor',
    description:
      'SIGINT detected encrypted burst transmissions matching known terrorist cell signature. Triangulated to 3km² urban area. HUMINT assets alerted.',
    source: 'SIGINT',
    lat: 24.86,
    lng: 67.02,
    timestamp: minsAgo(19),
    location: 'Karachi, Pakistan',
    relatedEntities: ['SUBJ-441', 'ORG-MILITANT-7'],
    tags: ['SIGINT', 'BURST_TX', 'ENCRYPTED'],
    caseId: 'CASE-0089',
  },
  {
    id: 'EVT018',
    type: 'BORDER_EVENT',
    severity: 'LOW',
    title: 'Irregular Migrant Movement Detected',
    description:
      'Ground sensor and drone surveillance indicates group of approximately 22 individuals crossing maritime boundary. Believed economic migrants.',
    source: 'GEOINT / DRONE',
    lat: 23.61,
    lng: 68.11,
    timestamp: minsAgo(540),
    location: 'Rann of Kutch Border',
    relatedEntities: [],
    tags: ['MIGRATION', 'BORDER', 'MARITIME'],
  },
  {
    id: 'EVT019',
    type: 'MARITIME_INCIDENT',
    severity: 'MEDIUM',
    title: 'Vessel Speed Anomaly — Restricted Channel',
    description:
      'Tanker MMSI 477892341 operating at 3.2 knots (vs declared 13 knots) in restricted channel near Hormuz approach. Possible mechanical issue or loitering.',
    source: 'AIS',
    lat: 26.62,
    lng: 56.24,
    timestamp: minsAgo(310),
    location: 'Strait of Hormuz Approach',
    relatedEntities: ['CRUDE CARRIER VII'],
    tags: ['SPEED_ANOMALY', 'TANKER', 'HORMUZ'],
  },
  {
    id: 'EVT020',
    type: 'THREAT_ALERT',
    severity: 'MEDIUM',
    title: 'Drone Swarm Activity — Military Perimeter',
    description:
      'Multiple small UAVs detected operating in formation near restricted military installation perimeter. Jamming countermeasures activated.',
    source: 'RADAR / HUMINT',
    lat: 19.04,
    lng: 72.87,
    timestamp: minsAgo(88),
    location: 'Mumbai Military Zone',
    relatedEntities: ['FACIL-MUM-01'],
    tags: ['DRONE', 'UAV', 'PERIMETER'],
  },
];