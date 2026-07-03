// src/hooks/useReports.ts
// ILA OSINT — Reports Module hook
// Provides TanStack Query queries + generate mutation with mock API.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type ReportTemplate =
  | 'INTELLIGENCE_SUMMARY'
  | 'ENTITY_PROFILE'
  | 'CASE_REPORT'
  | 'THREAT_ASSESSMENT'
  | 'NETWORK_ANALYSIS'
  | 'CUSTOM';

export type ReportClassification =
  | 'UNCLASSIFIED'
  | 'RESTRICTED'
  | 'CONFIDENTIAL'
  | 'SECRET';

export type ReportDistribution =
  | 'INTERNAL'
  | 'RESTRICTED'
  | 'NEED_TO_KNOW';

export type ReportFormat = 'PDF' | 'DOCX' | 'JSON';

export type ReportStatus = 'GENERATING' | 'READY' | 'FAILED';

export interface ReportConfig {
  template:        ReportTemplate;
  title:           string;
  classification:  ReportClassification;
  coverageFrom:    string;
  coverageTo:      string;
  entityIds:       string[];
  caseIds:         string[];
  preparedBy:      string;
  distribution:    ReportDistribution;
  sections?:       string[];
}

export interface GeneratedReport {
  id:              string;
  title:           string;
  type:            ReportTemplate;
  classification:  ReportClassification;
  generatedAt:     string;
  by:              string;
  format:          ReportFormat;
  status:          ReportStatus;
  downloadUrl:     string;
}

// ─────────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────────

const MOCK_HISTORY: GeneratedReport[] = [
  { id: 'RPT-0091', title: 'Op Ironveil — Weekly Summary',      type: 'INTELLIGENCE_SUMMARY', classification: 'SECRET',        generatedAt: '2026-06-13 08:14 UTC', by: 'ANL-007', format: 'PDF',  status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0090', title: 'APT-SHADOW-12 Threat Assessment',   type: 'THREAT_ASSESSMENT',    classification: 'CONFIDENTIAL',  generatedAt: '2026-06-12 22:05 UTC', by: 'ANL-003', format: 'PDF',  status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0089', title: 'D.Volkov Entity Profile',           type: 'ENTITY_PROFILE',       classification: 'RESTRICTED',    generatedAt: '2026-06-12 14:30 UTC', by: 'ANL-007', format: 'DOCX', status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0088', title: 'Maritime Incident Case Report',     type: 'CASE_REPORT',          classification: 'CONFIDENTIAL',  generatedAt: '2026-06-11 09:00 UTC', by: 'ANL-011', format: 'PDF',  status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0087', title: 'Kraskov Holdings Network Analysis', type: 'NETWORK_ANALYSIS',     classification: 'SECRET',        generatedAt: '2026-06-10 17:45 UTC', by: 'ANL-003', format: 'JSON', status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0086', title: 'Social Disinformation Assessment',  type: 'THREAT_ASSESSMENT',    classification: 'UNCLASSIFIED',  generatedAt: '2026-06-09 11:22 UTC', by: 'ANL-007', format: 'PDF',  status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0085', title: 'Op Darkwater — Custom Report',      type: 'CUSTOM',               classification: 'RESTRICTED',    generatedAt: '2026-06-08 16:00 UTC', by: 'ANL-011', format: 'DOCX', status: 'READY', downloadUrl: '#' },
  { id: 'RPT-0084', title: 'Border Movement Intel Summary',     type: 'INTELLIGENCE_SUMMARY', classification: 'CONFIDENTIAL',  generatedAt: '2026-06-07 08:30 UTC', by: 'ANL-003', format: 'PDF',  status: 'READY', downloadUrl: '#' },
];

export const MOCK_ENTITY_OPTIONS = [
  { id: 'ENT-004921', text: 'D.Volkov' },
  { id: 'ENT-003847', text: 'Kraskov Holdings' },
  { id: 'ENT-009011', text: 'Port of Chennai' },
  { id: 'ENT-001203', text: 'APT-SHADOW-12' },
  { id: 'ENT-009012', text: 'MV Seagull IV' },
  { id: 'ENT-007612', text: 'BTC-Wallet-7612' },
];

export const MOCK_CASE_OPTIONS = [
  { id: 'CASE-2291', text: 'Op IRONVEIL' },
  { id: 'CASE-1874', text: 'Maritime Breach' },
  { id: 'CASE-1622', text: 'Darkwater Network' },
  { id: 'CASE-1441', text: 'Credential Exfil' },
];

// ─────────────────────────────────────────────────────────────────
// Mock API
// ─────────────────────────────────────────────────────────────────

async function fetchReports(): Promise<GeneratedReport[]> {
  await new Promise((r) => setTimeout(r, 600));
  return [...MOCK_HISTORY];
}

async function generateReport(config: ReportConfig): Promise<GeneratedReport> {
  await new Promise((r) => setTimeout(r, 2_000));
  const report: GeneratedReport = {
    id:             `RPT-${String(Date.now()).slice(-4)}`,
    title:          config.title || 'Untitled Report',
    type:           config.template,
    classification: config.classification,
    generatedAt:    new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
    by:             config.preparedBy || 'ANL-007',
    format:         'PDF',
    status:         'READY',
    downloadUrl:    '#',
  };
  return report;
}

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

export function useReports() {
  const qc = useQueryClient();

  const reportsQuery = useQuery({
    queryKey: ['reports'],
    queryFn:  fetchReports,
    staleTime: 30_000,
  });

  const generateMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: (newReport) => {
      qc.setQueryData<GeneratedReport[]>(['reports'], (old = []) => [newReport, ...old]);
    },
  });

  return {
    reports:        reportsQuery.data ?? [],
    isLoadingReports: reportsQuery.isLoading,
    generateReport: generateMutation.mutateAsync,
    isGenerating:   generateMutation.isPending,
    generateError:  generateMutation.error,
    lastGenerated:  generateMutation.data ?? null,
    resetGenerate:  generateMutation.reset,
  };
}