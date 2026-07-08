// src/hooks/useTimeline.ts
// ILA OSINT — Timeline Analysis Hook
// Manages events, filters, selection, and memoized derived state.

import { useState, useMemo, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type EventType =
  | 'COMMUNICATION'
  | 'MOVEMENT'
  | 'TRANSACTION'
  | 'ACCESS'
  | 'ALERT'
  | 'CASE_EVENT'
  | 'EXTERNAL';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  entityId: string;
  entityName: string;
  entityType: 'PERSON' | 'ORG' | 'LOCATION' | 'THREAT_ACTOR' | 'VESSEL' | 'FINANCIAL';
  type: EventType;
  timestamp: string;
  source: string;
  caseId?: string;
  caseName?: string;
  amount?: string;
  evidence?: string[];
  confidence?: number;
  linkedEventIds?: string[];
}

export interface TimelineEntity {
  id: string;
  name: string;
  type: TimelineEvent['entityType'];
  color: string;
}

export interface TimelineFilters {
  dateFrom: Date;
  dateTo: Date;
  entityIds: string[];
  eventTypes: EventType[];
  caseIds: string[];
  sources: string[];
  riskLevels: RiskLevel[];
}

// ─────────────────────────────────────────────────────────────────
// Risk level helpers

export const ALL_RISK_LEVELS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function deriveRiskLevel(confidence?: number): RiskLevel {
  if (confidence === undefined || confidence === null) return 'LOW';
  if (confidence > 90) return 'CRITICAL';
  if (confidence > 75) return 'HIGH';
  if (confidence > 60) return 'MEDIUM';
  return 'LOW';
}

// ─────────────────────────────────────────────────────────────────
// Event-type colour mapping
// ─────────────────────────────────────────────────────────────────

export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  COMMUNICATION: 'var(--accent)',
  MOVEMENT:      'var(--status-ok)',
  TRANSACTION:   'var(--status-warn)',
  ACCESS:        'var(--status-info)',
  ALERT:         'var(--status-danger)',
  CASE_EVENT:    'rgba(160,200,230,0.7)',
  EXTERNAL:      'var(--text-muted)',
};

export const EVENT_TYPE_COLOR_HEX: Record<EventType, string> = {
  COMMUNICATION: '#00a3c7',
  MOVEMENT:      '#24a148',
  TRANSACTION:   '#f1c21b',
  ACCESS:        '#4589ff',
  ALERT:         '#fa4d56',
  CASE_EVENT:    'rgba(160,200,230,0.7)',
  EXTERNAL:      'rgba(100,150,190,0.45)',
};

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  COMMUNICATION: 'Communication',
  MOVEMENT:      'Movement',
  TRANSACTION:   'Transaction',
  ACCESS:        'Access',
  ALERT:         'Alert',
  CASE_EVENT:    'Case Event',
  EXTERNAL:      'External',
};

// ─────────────────────────────────────────────────────────────────
// Entities
// ─────────────────────────────────────────────────────────────────

export const MOCK_ENTITIES: TimelineEntity[] = [
  { id: 'ENT-004921', name: 'D.Volkov',        type: 'PERSON',       color: '#38BDF8' },
  { id: 'ENT-003847', name: 'Kraskov Hldg',    type: 'ORG',          color: '#A78BFA' },
  { id: 'ENT-009011', name: 'Port of Chennai',  type: 'LOCATION',     color: '#34D399' },
  { id: 'ENT-001203', name: 'APT-SHADOW-12',   type: 'THREAT_ACTOR', color: '#EF4444' },
  { id: 'ENT-009012', name: 'MV Seagull IV',   type: 'VESSEL',       color: '#22D3EE' },
  { id: 'ENT-007612', name: 'BTC-Wallet',      type: 'FINANCIAL',    color: '#FBB424' },
];

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

const now = new Date();
const d = (daysAgo: number, hours = 0, minutes = 0) =>
  new Date(now.getTime() - daysAgo * 86_400_000 + hours * 3_600_000 + minutes * 60_000).toISOString();

export const MOCK_EVENTS: TimelineEvent[] = [
  // D.Volkov
  { id:'EVT-001', title:'Signal Msg (RU proxy)', description:'Encrypted Signal message detected via RU proxy node. Recipient unknown.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'COMMUNICATION', timestamp:d(7,3,14), source:'SIGINT · Intercept #4401', evidence:['PCAP-4401.bin'], confidence:87 },
  { id:'EVT-002', title:'Telegram enc. message', description:'Encrypted Telegram message sent. TLS fingerprint matches prior APT-29 comms.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'COMMUNICATION', timestamp:d(6,8,30), source:'SIGINT · Intercept #4408', evidence:['LOG-4408.txt'], confidence:79 },
  { id:'EVT-003', title:'! ALERT — Anomaly detected', description:'Unusual login pattern outside established hours. MFA bypass attempted.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'ALERT', timestamp:d(5,14,22), source:'SIEM · Rule #CTR-018', evidence:['AUTH-LOG-0622.txt','ALERT-CTR018.json'], confidence:96 },
  { id:'EVT-004', title:'VPN switch (TOR exit)', description:'Subject switched from commercial VPN to TOR exit node. Exit: 185.220.101.43.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'COMMUNICATION', timestamp:d(4,11,5), source:'NETFLOW · NFX-2291', confidence:91 },
  { id:'EVT-005', title:'Secure Call (encrypted)', description:'Encrypted voice call to Unknown-A (RU). Duration 18 min. Correlates with C2 beacon EVT-016.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'COMMUNICATION', timestamp:d(2,2,14), source:'SIGINT · Intercept #4421', evidence:['PCAP-4421.bin','LOG-0214.txt'], confidence:91, linkedEventIds:['EVT-016'] },
  { id:'EVT-006', title:'Email enc. (PGP)', description:'PGP-encrypted email sent to kraskov-hldg.ru domain. Attachment detected.', entityId:'ENT-004921', entityName:'D.Volkov', entityType:'PERSON', type:'COMMUNICATION', timestamp:d(1,16,40), source:'SIGINT · Mail-Intercept #0102', confidence:84 },
  // Kraskov Holdings
  { id:'EVT-007', title:'Wire transfer $120K', description:'Outbound wire transfer USD 120,000 to offshore account ACCT-7731 (Cyprus).', entityId:'ENT-003847', entityName:'Kraskov Hldg', entityType:'ORG', type:'TRANSACTION', timestamp:d(7,9,0), source:'FinTrac · TXN-0048', evidence:['SWIFT-0048.pdf'], confidence:94, linkedEventIds:['EVT-023'] },
  { id:'EVT-008', title:'Shell co. recv. $120K', description:'Shell company SHELL-LTD (BVI) received $120K from Kraskov Holdings.', entityId:'ENT-003847', entityName:'Kraskov Hldg', entityType:'ORG', type:'TRANSACTION', timestamp:d(5,12,30), source:'FinTrac · TXN-0051', confidence:89 },
  { id:'EVT-009', title:'Crypto conversion', description:'USD 120K converted to BTC via unregulated exchange. Wallet: 1A2B3C...', entityId:'ENT-003847', entityName:'Kraskov Hldg', entityType:'ORG', type:'TRANSACTION', timestamp:d(4,6,15), source:'ChainAnalysis · TX-9921', evidence:['CHAIN-9921.json'], confidence:88 },
  { id:'EVT-010', title:'Wire transfer $340K ↑', description:'Large outbound wire USD 340,000 flagged by compliance. Routed via 3 intermediaries.', entityId:'ENT-003847', entityName:'Kraskov Hldg', entityType:'ORG', type:'TRANSACTION', timestamp:d(2,10,0), source:'FinTrac · TXN-0067', confidence:97 },
  // Port of Chennai
  { id:'EVT-011', title:'RU → FI border crossing', description:'Subject D.Volkov detected at RU/FI border checkpoint. Passport: RF-7739021.', entityId:'ENT-009011', entityName:'Port of Chennai', entityType:'LOCATION', type:'MOVEMENT', timestamp:d(6,6,44), source:'Border Intel · BCP-0211', confidence:99 },
  { id:'EVT-012', title:'Helsinki arrival', description:'Subject checked into Grand Hotel Helsinki. Paid cash. Departure unknown.', entityId:'ENT-009011', entityName:'Port of Chennai', entityType:'LOCATION', type:'MOVEMENT', timestamp:d(5,9,0), source:'HUMINT · Source-Bravo', confidence:72 },
  { id:'EVT-013', title:'FI → India (flight)', description:'AY-131 Helsinki → Delhi, connecting to Chennai. Seat 12A booked under alias.', entityId:'ENT-009011', entityName:'Port of Chennai', entityType:'LOCATION', type:'MOVEMENT', timestamp:d(3,22,0), source:'PNR · Record-7721', evidence:['PNR-7721.pdf'], confidence:85 },
  { id:'EVT-014', title:'Chennai port arrival ✓', description:'Subject confirmed at Port of Chennai. Photographed meeting unknown contact near Berth 7.', entityId:'ENT-009011', entityName:'Port of Chennai', entityType:'LOCATION', type:'MOVEMENT', timestamp:d(1,7,30), source:'GEOINT · IMG-0441', evidence:['IMG-0441-A.jpg','IMG-0441-B.jpg'], confidence:94 },
  // APT-SHADOW-12
  { id:'EVT-015', title:'Funding received', description:'APT infrastructure received crypto funding $28K via mixer. Source: Kraskov Holdings chain.', entityId:'ENT-001203', entityName:'APT-SHADOW-12', entityType:'THREAT_ACTOR', type:'TRANSACTION', timestamp:d(6,14,0), source:'ChainAnalysis · TX-9888', confidence:76 },
  { id:'EVT-016', title:'C2 infra deployment', description:'New C2 server deployed on bulletproof hosting (AS-9009). Domain: c2-exfil.net registered.', entityId:'ENT-001203', entityName:'APT-SHADOW-12', entityType:'THREAT_ACTOR', type:'ALERT', timestamp:d(5,17,0), source:'OSINT · PassiveDNS', evidence:['DNS-RECORD-9021.txt'], confidence:88, linkedEventIds:['EVT-005'] },
  { id:'EVT-017', title:'Spearphish campaign sent', description:'14 spearphishing emails sent to MoD personnel. Payload: LODESTAR backdoor dropper.', entityId:'ENT-001203', entityName:'APT-SHADOW-12', entityType:'THREAT_ACTOR', type:'ALERT', timestamp:d(2,19,45), source:'Threat Intel · TI-2291', evidence:['EMAIL-SAMPLE-01.eml','YARA-LODESTAR.txt'], confidence:92 },
  { id:'EVT-018', title:'Exfil detected (2.4GB)', description:'2.4 GB data exfiltrated to TOR hidden service. Packet capture confirms HTTPS tunnel.', entityId:'ENT-001203', entityName:'APT-SHADOW-12', entityType:'THREAT_ACTOR', type:'ALERT', timestamp:d(1,22,11), source:'SIEM · Rule #CTR-044', evidence:['PCAP-EXF-2291.bin'], confidence:97 },
  // MV Seagull IV
  { id:'EVT-019', title:'Docked Mumbai port', description:'Vessel MV Seagull IV docked at JNPT Mumbai. Manifest lists 12 containers.', entityId:'ENT-009012', entityName:'MV Seagull IV', entityType:'VESSEL', type:'MOVEMENT', timestamp:d(6,10,0), source:'MarineTraffic · MT-7712', confidence:99 },
  { id:'EVT-020', title:'Departed Mumbai', description:'Vessel departed JNPT. Declared destination: Colombo. AIS active.', entityId:'ENT-009012', entityName:'MV Seagull IV', entityType:'VESSEL', type:'MOVEMENT', timestamp:d(4,8,0), source:'MarineTraffic · MT-7731', confidence:98 },
  { id:'EVT-021', title:'Entered Bay of Bengal', description:'Vessel rerouted toward Bay of Bengal. Deviated from declared route.', entityId:'ENT-009012', entityName:'MV Seagull IV', entityType:'VESSEL', type:'MOVEMENT', timestamp:d(2,16,0), source:'GEOINT · SAR-0091', confidence:87 },
  { id:'EVT-022', title:'! AIS signal disabled', description:"AIS transponder switched off at 09°22'N 80°15'E. Last known position: SL EEZ boundary.", entityId:'ENT-009012', entityName:'MV Seagull IV', entityType:'VESSEL', type:'ALERT', timestamp:d(1,4,30), source:'NAVSAR · NS-2291', evidence:['AIS-LOG-2291.csv'], confidence:100 },
  // BTC Wallet
  { id:'EVT-023', title:'Received $120K (BTC)', description:'BTC wallet received 1.87 BTC (~$120K USD) from mixer output TX-9921.', entityId:'ENT-007612', entityName:'BTC-Wallet', entityType:'FINANCIAL', type:'TRANSACTION', timestamp:d(5,13,0), source:'ChainAnalysis · TX-9922', confidence:92, linkedEventIds:['EVT-009'] },
  { id:'EVT-024', title:'BTC recv. (APT fund)', description:'Additional 0.43 BTC received from known APT-SHADOW wallet cluster.', entityId:'ENT-007612', entityName:'BTC-Wallet', entityType:'FINANCIAL', type:'TRANSACTION', timestamp:d(4,20,0), source:'ChainAnalysis · TX-9944', confidence:81 },
  { id:'EVT-025', title:'$88K mixing detected ←', description:'1.37 BTC ($88K) passed through Wasabi Wallet coinjoin. 6 rounds. Output to 4 addresses.', entityId:'ENT-007612', entityName:'BTC-Wallet', entityType:'FINANCIAL', type:'TRANSACTION', timestamp:d(2,12,0), source:'ChainAnalysis · TX-9981', evidence:['CHAIN-9981-COINJOIN.json'], confidence:78 },
  { id:'EVT-026', title:'Fiat withdrawal (Dubai)', description:'Cash withdrawal equivalent $62K via Dubai OTC desk. Recipient: unknown male.', entityId:'ENT-007612', entityName:'BTC-Wallet', entityType:'FINANCIAL', type:'TRANSACTION', timestamp:d(1,11,15), source:'FinTrac · OTC-0082', confidence:74 },
];

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

const ALL_EVENT_TYPES: EventType[] = [
  'COMMUNICATION','MOVEMENT','TRANSACTION','ACCESS','ALERT','CASE_EVENT','EXTERNAL',
];

const defaultFilters = (): TimelineFilters => ({
  dateFrom:   new Date(Date.now() - 7 * 86_400_000),
  dateTo:     new Date(),
  entityIds:  [],
  eventTypes: [...ALL_EVENT_TYPES],
  caseIds:    [],
  sources:    [],
  riskLevels: [...ALL_RISK_LEVELS],
});

export function useTimeline() {
  const [events, setEvents]              = useState<TimelineEvent[]>(MOCK_EVENTS);
  const [filters, setFilters]            = useState<TimelineFilters>(defaultFilters);
  const [selectedEventId, setSelectedId] = useState<string | null>(null);
  const [isAddModalOpen, setAddModal]    = useState(false);

  const filteredEvents = useMemo<TimelineEvent[]>(() => {
    const { dateFrom, dateTo, entityIds, eventTypes, caseIds, sources, riskLevels } = filters;
    const from = dateFrom.getTime();
    const to   = dateTo.getTime();
    return events.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      if (ts < from || ts > to) return false;
      if (entityIds.length > 0 && !entityIds.includes(e.entityId)) return false;
      if (caseIds.length > 0 && (!e.caseId || !caseIds.includes(e.caseId))) return false;
      if (sources.length > 0 && !sources.includes(e.source)) return false;
      if (!eventTypes.includes(e.type)) return false;
      const level = e.caseId ? deriveRiskLevel(e.confidence) : deriveRiskLevel(e.confidence);
      if (!riskLevels.includes(level)) return false;
      return true;
    });
  }, [events, filters]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const addEvent = useCallback((partial: Omit<TimelineEvent, 'id'>) => {
    const newEvent: TimelineEvent = { ...partial, id: `EVT-${String(Date.now()).slice(-5)}` };
    setEvents((prev) => [...prev, newEvent]);
    setSelectedId(newEvent.id);
  }, []);

  const updateFilters = useCallback((patch: Partial<TimelineFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleEventType = useCallback((type: EventType) => {
    setFilters((prev) => {
        const s = new Set(prev.eventTypes);
        if (s.has(type)) s.delete(type);
        else s.add(type);
        return { ...prev, eventTypes: [...s] };
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(defaultFilters()), []);

  return {
    events, filteredEvents, filters, selectedEvent, selectedEventId, isAddModalOpen,
    entities: MOCK_ENTITIES, allEventTypes: ALL_EVENT_TYPES,
    setSelectedId, addEvent, updateFilters, toggleEventType, resetFilters,
    openAddModal:  () => setAddModal(true),
    closeAddModal: () => setAddModal(false),
  };
}