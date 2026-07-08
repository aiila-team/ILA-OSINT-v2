// src/hooks/useInvestigations.ts
import { useQuery } from '@tanstack/react-query';

export type InvestigationStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'CLOSED';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Investigation {
  id: string;
  title: string;
  description: string;           // ← ADD THIS (used in drawer Overview tab)
  status: InvestigationStatus;
  priority: Priority;
  assignedTo: string;
  linkedEntities: number;
  linkedAlerts: number;
  linkedCases: number;
  classification: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestigationFilters {
  status?: InvestigationStatus;
  priority?: Priority;
  assignedTo?: string;
}

const MOCK_INVESTIGATIONS: Investigation[] = [
  {
    id: 'INV-4421',
    title: 'Suspicious Network Activity — Sector 7',
    description: 'High-frequency anomalous traffic detected from unknown IP cluster in Sector 7. Indicators suggest coordinated C2 activity with lateral movement.',  // ← ADD
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    assignedTo: 'analyst_01',
    linkedEntities: 4,
    linkedAlerts: 12,
    linkedCases: 2,
    classification: 'CONFIDENTIAL',
    createdAt: '2026-06-10T08:30:00Z',
    updatedAt: '2026-06-11T09:15:00Z',
  },
  {
    id: 'INV-4398',
    title: 'Social Media Disinformation Cluster',
    description: 'Coordinated disinformation campaign detected across 14 social platforms. Pattern analysis indicates state-sponsored operation.',  // ← ADD
    status: 'OPEN',
    priority: 'HIGH',
    assignedTo: 'analyst_02',
    linkedEntities: 9,
    linkedAlerts: 5,
    linkedCases: 1,
    classification: 'UNCLASSIFIED',
    createdAt: '2026-06-09T14:00:00Z',
    updatedAt: '2026-06-10T11:00:00Z',
  },
  {
    id: 'INV-4350',
    title: 'Border Movement Pattern Analysis',
    description: 'Analysis of cross-border movement patterns flagged by SIGINT. Three individuals of interest with suspected logistics ties.',  // ← ADD
    status: 'PENDING_REVIEW',
    priority: 'MEDIUM',
    assignedTo: 'analyst_01',
    linkedEntities: 3,
    linkedAlerts: 2,
    linkedCases: 0,
    classification: 'SECRET',
    createdAt: '2026-06-07T10:00:00Z',
    updatedAt: '2026-06-09T16:45:00Z',
  },
  {
    id: 'INV-4312',
    title: 'Dark Web Credential Dump — Gov Domains',
    description: 'Large credential dump discovered on dark web forum. Over 40k accounts linked to government domains.',
    status: 'IN_PROGRESS',
    priority: 'CRITICAL',
    assignedTo: 'analyst_02',
    linkedEntities: 6,
    linkedAlerts: 18,
    linkedCases: 3,
    classification: 'SECRET',
    createdAt: '2026-06-06T08:00:00Z',
    updatedAt: '2026-06-11T06:00:00Z',
  },
  {
    id: 'INV-4289',
    title: 'Financial Fraud Network — Mumbai',
    description: 'Suspected shell company network facilitating cross-border financial fraud. Mumbai-based entities under review.',
    status: 'OPEN',
    priority: 'HIGH',
    assignedTo: 'analyst_03',
    linkedEntities: 5,
    linkedAlerts: 7,
    linkedCases: 2,
    classification: 'CONFIDENTIAL',
    createdAt: '2026-06-05T10:00:00Z',
    updatedAt: '2026-06-11T06:00:00Z',
  },
  {
    id: 'INV-4201',
    title: 'Encrypted Comms — Unknown Cell',
    description: 'Routine monitoring of encrypted communications flagged by automated system. Awaiting further analysis.',
    status: 'CLOSED',
    priority: 'LOW',
    assignedTo: 'analyst_01',
    linkedEntities: 2,
    linkedAlerts: 1,
    linkedCases: 0,
    classification: 'UNCLASSIFIED',
    createdAt: '2026-06-01T09:00:00Z',
    updatedAt: '2026-06-08T14:00:00Z',
  },
];

export const useInvestigations = (filters?: InvestigationFilters) =>
  useQuery({
    queryKey: ['investigations', filters],
    queryFn: () => MOCK_INVESTIGATIONS,
  });

  