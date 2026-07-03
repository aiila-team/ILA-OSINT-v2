// src/hooks/useCases.ts
// ILA OSINT — Case Management Hook
// Full state management: CRUD, notes, tasks, status transitions.

import { useState, useCallback, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type CasePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type CaseStatus   = 'DRAFT' | 'ACTIVE' | 'PENDING_REVIEW' | 'CLOSED' | 'ARCHIVED';
export type EntityType   = 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'VESSEL' | 'FINANCIAL';
export type RiskLevel    = 'HIGH_RISK' | 'MEDIUM' | 'LOW';

export interface CaseNote {
  id:        string;
  author:    string;
  initials:  string;
  avatarKey: 'a' | 'b' | 'c' | 'd';
  text:      string;
  timestamp: string;
}

export interface CaseTask {
  id:        string;
  text:      string;
  done:      boolean;
  assignee:  string;
  dueDate:   string;
}

export interface CaseEntity {
  id:       string;
  name:     string;
  type:     EntityType;
  riskLevel: RiskLevel;
}

export interface CaseAlert {
  id:       string;
  title:    string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  time:     string;
}

export interface HistoryEntry {
  id:      string;
  action:  string;
  analyst: string;
  time:    string;
  color:   string;
}

export interface Case {
  id:             string;
  title:          string;
  priority:       CasePriority;
  status:         CaseStatus;
  entities:       number;
  tasks:          { done: number; total: number };
  assigned:       string;
  assignedInit:   string;
  avatarKey:      'a' | 'b' | 'c' | 'd';
  updated:        string;
  classification: string;
  created:        string;
  updatedFull:    string;
  brief:          string;
  entityList:     CaseEntity[];
  alerts:         CaseAlert[];
  notes:          CaseNote[];
  taskList:       CaseTask[];
  history:        HistoryEntry[];
}

export type StatusTab = 'ALL' | CaseStatus;

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

const MOCK_CASES: Case[] = [
  {
    id: 'CASE-0091',
    title: 'Armed Group — Aksai Chin Border Region',
    priority: 'CRITICAL',
    status: 'ACTIVE',
    entities: 14,
    tasks: { done: 3, total: 9 },
    assigned: 'M. Kapoor',
    assignedInit: 'MK',
    avatarKey: 'a',
    updated: '4m ago',
    classification: 'SECRET // NOFORN',
    created: '16 Jun 2026, 04:12Z',
    updatedFull: '16 Jun 2026, 09:18Z',
    brief: 'SIGINT intercepts indicate 40–60 armed individuals staging at grid 35.47N 76.91E. Communications encrypted on non-standard military frequencies. HUMINT corroboration in progress. Three sub-entities identified with cross-border logistics capability. Immediate escalation to NCTC recommended pending verification.',
    entityList: [
      { id: 'SUBJ-771', name: 'SUBJ-771 — Unidentified Male, 35–45', type: 'PERSON', riskLevel: 'HIGH_RISK' },
      { id: 'SUBJ-772', name: 'SUBJ-772 — Unidentified Male, 30–40', type: 'PERSON', riskLevel: 'HIGH_RISK' },
      { id: 'ORG-UNKNOWN-12', name: 'ORG-UNKNOWN-12 — Unknown Network', type: 'ORGANIZATION', riskLevel: 'MEDIUM' },
      { id: 'LOC-35N', name: 'LOC — Grid 35.47N 76.91E', type: 'LOCATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-001', title: 'Armed Group Detected — Forward Observation Post', severity: 'CRITICAL', time: '65m ago' },
      { id: 'ALT-002', title: 'Encrypted Frequency Activity — Non-Std Band', severity: 'HIGH', time: '2h ago' },
      { id: 'ALT-003', title: 'Satellite Imagery — Vehicle Staging Confirmed', severity: 'MEDIUM', time: '4h ago' },
    ],
    notes: [
      { id: 'N-001', author: 'M. Kapoor', initials: 'MK', avatarKey: 'a', text: 'Confirmed staging activity via SATINT. Vehicle count revised upward to 28. Cross-referencing with SUBJ-332 movement data from CASE-0081 — possible logistics linkage.', timestamp: '09:14Z' },
      { id: 'N-002', author: 'S. Rawat', initials: 'SR', avatarKey: 'b', text: 'SIGINT intercept flagged at 04:10Z. Frequency signature matches ORG-MILITANT-7 profile from archive. Escalated to Tier-2 for decryption.', timestamp: '06:42Z' },
    ],
    taskList: [
      { id: 'T-001', text: 'Submit initial SIGINT report to supervisor', done: true,  assignee: 'MK', dueDate: '15 Jun' },
      { id: 'T-002', text: 'Cross-reference ORG-UNKNOWN-12 with open cases', done: true, assignee: 'SR', dueDate: '16 Jun' },
      { id: 'T-003', text: 'Request HUMINT corroboration from field unit', done: true, assignee: 'MK', dueDate: '16 Jun' },
      { id: 'T-004', text: 'Obtain SATINT re-tasking for grid 35.47N 76.91E', done: false, assignee: 'MK', dueDate: '17 Jun' },
      { id: 'T-005', text: 'Identify vehicle registration for 4 observed trucks', done: false, assignee: 'SR', dueDate: '18 Jun' },
      { id: 'T-006', text: 'Brief NCTC liaison on escalation triggers', done: false, assignee: 'AJ', dueDate: '19 Jun' },
    ],
    history: [
      { id: 'H-001', action: 'Escalated → CRITICAL', analyst: 'M. Kapoor', time: '16 Jun 2026 · 09:18Z', color: '#ff6b6b' },
      { id: 'H-002', action: 'Status → ACTIVE',      analyst: 'S. Rawat',  time: '16 Jun 2026 · 06:42Z', color: '#4de88a' },
      { id: 'H-003', action: 'Assigned to M. Kapoor', analyst: 'System',   time: '16 Jun 2026 · 04:15Z', color: '#c8a430' },
      { id: 'H-004', action: 'Case created → DRAFT', analyst: 'S. Rawat',  time: '16 Jun 2026 · 04:12Z', color: '#4a8fa8' },
    ],
  },
  {
    id: 'CASE-0089',
    title: 'Encrypted Burst TX — Karachi APT',
    priority: 'CRITICAL',
    status: 'PENDING_REVIEW',
    entities: 9,
    tasks: { done: 6, total: 9 },
    assigned: 'S. Rawat',
    assignedInit: 'SR',
    avatarKey: 'b',
    updated: '19m ago',
    classification: 'TOP SECRET // SCI',
    created: '14 Jun 2026, 22:05Z',
    updatedFull: '16 Jun 2026, 08:44Z',
    brief: 'Burst transmission pattern consistent with APT-group coordination detected from Karachi region. Signals analysis shows encrypted channels matching known adversary TTPs. Pending decryption and attribution.',
    entityList: [
      { id: 'APT-KHI-01', name: 'APT-KHI-01 — Threat Actor Group', type: 'ORGANIZATION', riskLevel: 'HIGH_RISK' },
      { id: 'IP-10.22.45', name: 'IP-10.22.45.0/24 — C2 Infrastructure', type: 'FINANCIAL', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-010', title: 'Burst TX Detected — Non-Commercial Band', severity: 'CRITICAL', time: '19m ago' },
      { id: 'ALT-011', title: 'C2 Beacon Activity — Confirmed IP Block', severity: 'HIGH', time: '3h ago' },
    ],
    notes: [
      { id: 'N-010', author: 'S. Rawat', initials: 'SR', avatarKey: 'b', text: 'Signal profile matches GRP-77 archival data. Requesting NSA SIGINT cross-reference.', timestamp: '08:30Z' },
    ],
    taskList: [
      { id: 'T-010', text: 'Isolate burst TX frequency band', done: true,  assignee: 'SR', dueDate: '15 Jun' },
      { id: 'T-011', text: 'Request decryption from Tier-3', done: true,   assignee: 'AJ', dueDate: '15 Jun' },
      { id: 'T-012', text: 'Cross-ref with NSA SIGINT DB', done: true,     assignee: 'SR', dueDate: '16 Jun' },
      { id: 'T-013', text: 'Prepare attribution assessment report', done: false, assignee: 'SR', dueDate: '18 Jun' },
    ],
    history: [
      { id: 'H-010', action: 'Submitted for Review', analyst: 'S. Rawat', time: '16 Jun 2026 · 08:44Z', color: '#c8a430' },
      { id: 'H-011', action: 'Status → ACTIVE',      analyst: 'M. Kapoor', time: '14 Jun 2026 · 22:10Z', color: '#4de88a' },
    ],
  },
  {
    id: 'CASE-0088',
    title: 'Military Vessel EEZ Intrusion',
    priority: 'HIGH',
    status: 'ACTIVE',
    entities: 6,
    tasks: { done: 4, total: 8 },
    assigned: 'P. Nair',
    assignedInit: 'PN',
    avatarKey: 'c',
    updated: '1h ago',
    classification: 'SECRET',
    created: '15 Jun 2026, 14:30Z',
    updatedFull: '16 Jun 2026, 08:12Z',
    brief: 'Unidentified military-class vessel detected operating within India EEZ boundary at 12°N 78°E. AIS transponder disabled. Monitoring via SATINT and coastal radar assets. Possible ISR mission in progress.',
    entityList: [
      { id: 'VES-UNKN-03', name: 'VES-UNKN-03 — Unidentified Military Vessel', type: 'VESSEL', riskLevel: 'HIGH_RISK' },
      { id: 'LOC-EEZ-12N', name: 'LOC — 12°N 78°E EEZ Boundary', type: 'LOCATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-020', title: 'AIS Signal Loss — Unidentified Military Vessel', severity: 'HIGH', time: '1h ago' },
    ],
    notes: [
      { id: 'N-020', author: 'P. Nair', initials: 'PN', avatarKey: 'c', text: 'Radar signature matches Type-071 class. Request diplomatic channel query to PLA Navy via MEA.', timestamp: '07:50Z' },
    ],
    taskList: [
      { id: 'T-020', text: 'Task coastal radar to track vessel', done: true, assignee: 'PN', dueDate: '15 Jun' },
      { id: 'T-021', text: 'Request SATINT re-tasking', done: true, assignee: 'MK', dueDate: '16 Jun' },
      { id: 'T-022', text: 'Escalate to Navy Intelligence', done: false, assignee: 'PN', dueDate: '17 Jun' },
    ],
    history: [
      { id: 'H-020', action: 'Priority raised → HIGH', analyst: 'P. Nair', time: '16 Jun 2026 · 08:12Z', color: '#ffa340' },
      { id: 'H-021', action: 'Case created → DRAFT', analyst: 'P. Nair', time: '15 Jun 2026 · 14:30Z', color: '#4a8fa8' },
    ],
  },
  {
    id: 'CASE-0081',
    title: 'IED Precursor Smuggling — Rawalpindi',
    priority: 'CRITICAL',
    status: 'ACTIVE',
    entities: 11,
    tasks: { done: 7, total: 9 },
    assigned: 'M. Kapoor',
    assignedInit: 'MK',
    avatarKey: 'a',
    updated: '2h ago',
    classification: 'TOP SECRET',
    created: '12 Jun 2026, 09:00Z',
    updatedFull: '16 Jun 2026, 07:40Z',
    brief: 'Intelligence indicates chemical precursors consistent with IED manufacturing transiting Rawalpindi transit hub. HUMINT source COBALT-3 confirms activity. Network of 11 identified nodes. Immediate interdiction options under assessment.',
    entityList: [
      { id: 'SUBJ-332', name: 'SUBJ-332 — Known Facilitator', type: 'PERSON', riskLevel: 'HIGH_RISK' },
      { id: 'ORG-IED-01', name: 'ORG-IED-01 — Smuggling Network', type: 'ORGANIZATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-030', title: 'Chemical Precursor Shipment — Border Crossing', severity: 'CRITICAL', time: '2h ago' },
    ],
    notes: [
      { id: 'N-030', author: 'M. Kapoor', initials: 'MK', avatarKey: 'a', text: 'HUMINT source COBALT-3 confirmed delivery scheduled for 18 Jun. Recommend interdiction at Attari crossing.', timestamp: '05:30Z' },
    ],
    taskList: [
      { id: 'T-030', text: 'Brief NSCS on interdiction options', done: true, assignee: 'MK', dueDate: '14 Jun' },
      { id: 'T-031', text: 'Coordinate with BSF intelligence', done: true, assignee: 'AJ', dueDate: '15 Jun' },
      { id: 'T-032', text: 'Request interdiction authority', done: false, assignee: 'MK', dueDate: '17 Jun' },
    ],
    history: [
      { id: 'H-030', action: 'Evidence added — Chemical manifest', analyst: 'M. Kapoor', time: '16 Jun 2026 · 07:40Z', color: '#4de88a' },
      { id: 'H-031', action: 'Status → ACTIVE', analyst: 'S. Rawat', time: '12 Jun 2026 · 09:05Z', color: '#4de88a' },
    ],
  },
  {
    id: 'CASE-0079',
    title: 'Chemical Storage — Karachi Industrial',
    priority: 'HIGH',
    status: 'PENDING_REVIEW',
    entities: 5,
    tasks: { done: 8, total: 9 },
    assigned: 'A. Joshi',
    assignedInit: 'AJ',
    avatarKey: 'd',
    updated: '5h ago',
    classification: 'SECRET // NOFORN',
    created: '10 Jun 2026, 11:20Z',
    updatedFull: '16 Jun 2026, 04:15Z',
    brief: 'Suspected dual-use chemical storage detected at Karachi Industrial Zone, Sector 7. Quantity and composition under analysis. Source: SATINT thermal signature anomaly. Industrial cover assessed as partial.',
    entityList: [
      { id: 'LOC-KHI-IND', name: 'LOC — Karachi Industrial Zone Sector 7', type: 'LOCATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-040', title: 'Thermal Anomaly — Industrial Storage Facility', severity: 'HIGH', time: '5h ago' },
    ],
    notes: [
      { id: 'N-040', author: 'A. Joshi', initials: 'AJ', avatarKey: 'd', text: 'SATINT thermal analysis indicates exothermic storage above normal industrial thresholds. Recommend chemical weapons treaty compliance review.', timestamp: '04:00Z' },
    ],
    taskList: [
      { id: 'T-040', text: 'Complete chemical analysis report', done: true, assignee: 'AJ', dueDate: '14 Jun' },
      { id: 'T-041', text: 'Submit to CWC compliance review', done: false, assignee: 'AJ', dueDate: '18 Jun' },
    ],
    history: [
      { id: 'H-040', action: 'Submitted for Review', analyst: 'A. Joshi', time: '16 Jun 2026 · 04:15Z', color: '#c8a430' },
    ],
  },
  {
    id: 'CASE-0077',
    title: 'Cross-Border Incursion — LoC J&K',
    priority: 'HIGH',
    status: 'ACTIVE',
    entities: 7,
    tasks: { done: 4, total: 9 },
    assigned: 'S. Rawat',
    assignedInit: 'SR',
    avatarKey: 'b',
    updated: '7h ago',
    classification: 'SECRET',
    created: '09 Jun 2026, 08:45Z',
    updatedFull: '16 Jun 2026, 02:30Z',
    brief: 'Repeated incursion pattern detected at LoC sector 14, J&K. 7 separate incidents in 72-hour window. Pattern analysis suggests coordinated probing of defensive positions. Infantry unit on high alert.',
    entityList: [
      { id: 'LOC-LOC-14', name: 'LOC — LoC Sector 14 J&K', type: 'LOCATION', riskLevel: 'HIGH_RISK' },
      { id: 'SUBJ-LOC-01', name: 'SUBJ-LOC-01 — Unknown Combatant Group', type: 'PERSON', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-050', title: 'LoC Incursion Detected — Sector 14', severity: 'HIGH', time: '7h ago' },
    ],
    notes: [
      { id: 'N-050', author: 'S. Rawat', initials: 'SR', avatarKey: 'b', text: 'Pattern consistent with pre-infiltration probing. 72-hour assessment window closing. Recommend escalation to Army HQ.', timestamp: '02:15Z' },
    ],
    taskList: [
      { id: 'T-050', text: 'Compile incursion incident log', done: true, assignee: 'SR', dueDate: '11 Jun' },
      { id: 'T-051', text: 'Brief Army HQ J&K Command', done: false, assignee: 'SR', dueDate: '17 Jun' },
    ],
    history: [
      { id: 'H-050', action: 'Status → ACTIVE', analyst: 'S. Rawat', time: '09 Jun 2026 · 08:50Z', color: '#4de88a' },
    ],
  },
  {
    id: 'CASE-0063',
    title: 'Narcotics STS Transfer — Gulf of Oman',
    priority: 'MEDIUM',
    status: 'CLOSED',
    entities: 4,
    tasks: { done: 9, total: 9 },
    assigned: 'P. Nair',
    assignedInit: 'PN',
    avatarKey: 'c',
    updated: '2d ago',
    classification: 'SECRET',
    created: '01 Jun 2026, 15:00Z',
    updatedFull: '14 Jun 2026, 12:00Z',
    brief: 'Ship-to-ship narcotics transfer successfully interdicted by Coast Guard. Approximately 400kg of controlled substances seized. Three persons detained. Case closed pending judicial proceedings.',
    entityList: [
      { id: 'VES-SEAGULL', name: 'MV Seagull IV — Narcotics Vessel', type: 'VESSEL', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [],
    notes: [
      { id: 'N-060', author: 'P. Nair', initials: 'PN', avatarKey: 'c', text: 'Interdiction confirmed successful. Evidence chain intact. Case forwarded to prosecution.', timestamp: '12:00Z' },
    ],
    taskList: [
      { id: 'T-060', text: 'All tasks completed', done: true, assignee: 'PN', dueDate: '14 Jun' },
    ],
    history: [
      { id: 'H-060', action: 'Case CLOSED — Interdiction successful', analyst: 'P. Nair', time: '14 Jun 2026 · 12:00Z', color: '#9a70ff' },
    ],
  },
  {
    id: 'CASE-0058',
    title: 'Diplomatic Route Deviation — Islamabad',
    priority: 'LOW',
    status: 'DRAFT',
    entities: 2,
    tasks: { done: 1, total: 9 },
    assigned: 'A. Joshi',
    assignedInit: 'AJ',
    avatarKey: 'd',
    updated: '3d ago',
    classification: 'UNCLASSIFIED // FOUO',
    created: '13 Jun 2026, 10:00Z',
    updatedFull: '13 Jun 2026, 10:45Z',
    brief: 'Diplomatic convoy deviated from declared route by approximately 2.3km in Islamabad. Possible surveillance-detection route (SDR) or navigational error. Low threat assessment. Monitoring only.',
    entityList: [
      { id: 'ENT-DIPL-01', name: 'Diplomatic Convoy — Route Alpha', type: 'VEHICLE' as unknown as EntityType, riskLevel: 'LOW' },
    ],
    alerts: [],
    notes: [],
    taskList: [
      { id: 'T-070', text: 'Initial assessment document', done: true, assignee: 'AJ', dueDate: '13 Jun' },
      { id: 'T-071', text: 'Request embassy clarification', done: false, assignee: 'AJ', dueDate: '20 Jun' },
    ],
    history: [
      { id: 'H-070', action: 'Case created → DRAFT', analyst: 'A. Joshi', time: '13 Jun 2026 · 10:00Z', color: '#4a8fa8' },
    ],
  },
  {
    id: 'CASE-0051',
    title: 'Cyber Intrusion — Defence Network Node',
    priority: 'CRITICAL',
    status: 'ACTIVE',
    entities: 8,
    tasks: { done: 5, total: 10 },
    assigned: 'S. Rawat',
    assignedInit: 'SR',
    avatarKey: 'b',
    updated: '30m ago',
    classification: 'TOP SECRET // SCI',
    created: '08 Jun 2026, 03:15Z',
    updatedFull: '16 Jun 2026, 09:00Z',
    brief: 'Advanced persistent threat detected within defence intranet node at DRDO facility. Lateral movement observed across 4 subnets. Data exfiltration attempted. Incident response in progress.',
    entityList: [
      { id: 'DRDO-NET-01', name: 'DRDO Network Node — Bangalore', type: 'LOCATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [
      { id: 'ALT-080', title: 'APT Lateral Movement — Defence Intranet', severity: 'CRITICAL', time: '30m ago' },
    ],
    notes: [
      { id: 'N-080', author: 'S. Rawat', initials: 'SR', avatarKey: 'b', text: 'Containment measures deployed. 4 compromised hosts isolated. Forensic image acquisition in progress.', timestamp: '08:45Z' },
    ],
    taskList: [
      { id: 'T-080', text: 'Isolate compromised network segment', done: true, assignee: 'SR', dueDate: '08 Jun' },
      { id: 'T-081', text: 'Forensic image acquisition', done: false, assignee: 'SR', dueDate: '17 Jun' },
    ],
    history: [
      { id: 'H-080', action: 'Priority → CRITICAL', analyst: 'S. Rawat', time: '16 Jun 2026 · 09:00Z', color: '#ff6b6b' },
    ],
  },
  {
    id: 'CASE-0044',
    title: 'Sanctions Evasion — Shipping Network',
    priority: 'HIGH',
    status: 'ARCHIVED',
    entities: 12,
    tasks: { done: 9, total: 9 },
    assigned: 'M. Kapoor',
    assignedInit: 'MK',
    avatarKey: 'a',
    updated: '12d ago',
    classification: 'SECRET',
    created: '01 May 2026, 09:00Z',
    updatedFull: '04 Jun 2026, 16:00Z',
    brief: 'Complex sanctions evasion network using shell companies and flag-of-convenience vessels. Dossier compiled and submitted to financial intelligence unit. Case archived pending international coordination.',
    entityList: [
      { id: 'SHELL-CO-07', name: 'Phantom Holdings LLC — BVI', type: 'ORGANIZATION', riskLevel: 'HIGH_RISK' },
    ],
    alerts: [],
    notes: [],
    taskList: [
      { id: 'T-090', text: 'All tasks completed', done: true, assignee: 'MK', dueDate: '04 Jun' },
    ],
    history: [
      { id: 'H-090', action: 'Case ARCHIVED', analyst: 'M. Kapoor', time: '04 Jun 2026 · 16:00Z', color: '#9a70ff' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: CaseStatus[] = ['DRAFT', 'ACTIVE', 'PENDING_REVIEW', 'CLOSED', 'ARCHIVED'];

export function useCases() {
  const [cases,          setCases]          = useState<Case[]>(MOCK_CASES);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>('CASE-0091');
  const [statusTab,      setStatusTab]      = useState<StatusTab>('ALL');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [priorityFilter, setPriorityFilter] = useState<CasePriority | 'ALL'>('ALL');
  const [page,           setPage]           = useState(1);

  const PAGE_SIZE = 8;

  // ── Derived: selected case ──────────────────────────────────
  const selectedCase = useMemo(
    () => cases.find((c) => c.id === selectedCaseId) ?? null,
    [cases, selectedCaseId]
  );

  // ── Derived: filtered + paginated cases ─────────────────────
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (statusTab !== 'ALL' && c.status !== statusTab) return false;
      if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!c.title.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [cases, statusTab, searchQuery, priorityFilter]);

  const totalPages   = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE));
  const pagedCases   = filteredCases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Select a case ────────────────────────────────────────────
  const selectCase = useCallback((id: string) => {
    setSelectedCaseId(id);
  }, []);

  // ── Update status ────────────────────────────────────────────
  const updateStatus = useCallback((id: string, status: CaseStatus) => {
    setCases((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              status,
              updatedFull: new Date().toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
              }) + 'Z',
              history: [
                {
                  id: `H-${Date.now()}`,
                  action: `Status → ${status.replace('_', ' ')}`,
                  analyst: 'ANL-007',
                  time: new Date().toISOString(),
                  color: '#4de88a',
                },
                ...c.history,
              ],
            }
          : c
      )
    );
  }, []);

  // ── Add note ─────────────────────────────────────────────────
  const addNote = useCallback((caseId: string, text: string) => {
    if (!text.trim()) return;
    const newNote: CaseNote = {
      id:        `N-${Date.now()}`,
      author:    'M. Kapoor',
      initials:  'MK',
      avatarKey: 'a',
      text:      text.trim(),
      timestamp: new Date().toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      }) + 'Z',
    };
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId ? { ...c, notes: [newNote, ...c.notes] } : c
      )
    );
  }, []);

  // ── Toggle task ──────────────────────────────────────────────
  const toggleTask = useCallback((caseId: string, taskId: string) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const taskList = c.taskList.map((t) =>
          t.id === taskId ? { ...t, done: !t.done } : t
        );
        const done = taskList.filter((t) => t.done).length;
        return { ...c, taskList, tasks: { done, total: c.tasks.total } };
      })
    );
  }, []);

  // ── Add task ─────────────────────────────────────────────────
  const addTask = useCallback((caseId: string, text: string) => {
    if (!text.trim()) return;
    const newTask: CaseTask = {
      id:       `T-${Date.now()}`,
      text:     text.trim(),
      done:     false,
      assignee: 'MK',
      dueDate:  'TBD',
    };
    setCases((prev) =>
      prev.map((c) =>
        c.id === caseId
          ? {
              ...c,
              taskList: [...c.taskList, newTask],
              tasks: { done: c.tasks.done, total: c.tasks.total + 1 },
            }
          : c
      )
    );
  }, []);

  // ── Add new case ─────────────────────────────────────────────
  const addCase = useCallback((title: string, priority: CasePriority) => {
    const id = `CASE-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const newCase: Case = {
      id,
      title,
      priority,
      status: 'DRAFT',
      entities: 0,
      tasks: { done: 0, total: 0 },
      assigned: 'M. Kapoor',
      assignedInit: 'MK',
      avatarKey: 'a',
      updated: 'just now',
      classification: 'UNCLASSIFIED',
      created: new Date().toLocaleString('en-GB') + 'Z',
      updatedFull: new Date().toLocaleString('en-GB') + 'Z',
      brief: '',
      entityList: [],
      alerts: [],
      notes: [],
      taskList: [],
      history: [
        { id: `H-${Date.now()}`, action: 'Case created → DRAFT', analyst: 'ANL-007', time: new Date().toISOString(), color: '#4a8fa8' },
      ],
    };
    setCases((prev) => [newCase, ...prev]);
    setSelectedCaseId(id);
  }, []);

  return {
    cases: pagedCases,
    allCases: filteredCases,
    selectedCase,
    selectedCaseId,
    statusTab,
    searchQuery,
    priorityFilter,
    page,
    totalPages,
    totalCount: filteredCases.length,

    // Actions
    selectCase,
    setStatusTab,
    setSearchQuery,
    setPriorityFilter,
    setPage,
    updateStatus,
    addNote,
    toggleTask,
    addTask,
    addCase,

    // Helpers
    STATUS_ORDER,
  };
}