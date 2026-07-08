// src/hooks/useEntitySearch.ts
// ILA OSINT — Entity Search Hook
// Service-backed entity search hook with debounced query, filters, and pagination.

import { useState, useEffect, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { create } from 'zustand';
import { searchEntities } from '../services/entitySearchService';
import type {
  Entity,
  EntityType,
  EntitySource,
  EntityFilters as ServiceEntityFilters,
} from '../services/entitySearchService';

export type { Entity, EntityType, EntitySource };

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface EntityFilters {
  types?: EntityType[];
  riskMin?: number;
  riskMax?: number;
  lastSeenFrom?: Date | null;
  lastSeenTo?: Date | null;
  sources?: EntitySource[];
  tags?: string[];
}

export interface EntitySearchParams {
  query: string;
  filters?: EntityFilters;
  page?: number;
  pageSize?: number;
}

export interface EntitySearchResult {
  entities: Entity[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

// ─────────────────────────────────────────────────────────────────
// Zustand store — recent searches + selected entity + view mode
// ─────────────────────────────────────────────────────────────────

interface EntitySearchStore {
  recentSearches: string[];
  selectedEntity: Entity | null;
  viewMode: 'grid' | 'table';
  addRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  setSelectedEntity: (entity: Entity | null) => void;
  setViewMode: (mode: 'grid' | 'table') => void;
}

export const useEntitySearchStore = create<EntitySearchStore>((set) => ({
  recentSearches: ['Nikolai Volkov', '185.220.101.0/24', 'Phantom Holdings LLC'],
  selectedEntity: null,
  viewMode: 'grid',

  addRecentSearch: (query: string) =>
    set((s) => ({
      recentSearches: [
        query,
        ...s.recentSearches.filter((r) => r !== query),
      ].slice(0, 8),
    })),

  clearRecentSearches: () => set({ recentSearches: [] }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));

// ─────────────────────────────────────────────────────────────────
// Mock Dataset
// ─────────────────────────────────────────────────────────────────

const MOCK_ENTITIES: Entity[] = [
  {
    id: 'ENT-7741',
    name: 'Nikolai Volkov',
    type: 'PERSON',
    riskScore: 91,
    lastSeen: '2026-06-12T14:23:00Z',
    source: 'OSINT',
    tags: ['sanctioned', 'alias:Ghostwriter', 'ru'],
    connectionCount: 47,
    aliases: ['Ghostwriter', 'N. Volkov', 'Kolya_V'],
    identifiers: { passport: 'RU-774421', telegram: '@nv_ghost' },
    location: 'Moscow, Russia',
    description: 'Suspected operator in coordinated influence operations. Linked to GRU Unit 29155.',
  },
  {
    id: 'ENT-3312',
    name: 'Phantom Holdings LLC',
    type: 'ORG',
    riskScore: 84,
    lastSeen: '2026-06-11T08:00:00Z',
    source: 'FINANCIAL',
    tags: ['shell-company', 'sanctions-adjacent', 'bvi'],
    connectionCount: 23,
    aliases: ['Phantom Holdings', 'PH LLC'],
    identifiers: { ein: 'XX-9901234', registered: 'British Virgin Islands' },
    location: 'Road Town, BVI',
    description: 'Shell company with complex beneficial ownership structure. Used in layering transactions.',
  },
  {
    id: 'ENT-8821',
    name: '185.220.101.47',
    type: 'DIGITAL',
    riskScore: 76,
    lastSeen: '2026-06-13T02:11:00Z',
    source: 'SIGINT',
    tags: ['tor-exit', 'c2', 'active'],
    connectionCount: 112,
    aliases: [],
    identifiers: { asn: 'AS4444', country: 'DE', isp: 'Frantech Solutions' },
    description: 'Tor exit node used in command-and-control communications. High-confidence attribution to threat actor cluster.',
  },
  {
    id: 'ENT-5502',
    name: 'deepweb-forum.onion',
    type: 'DIGITAL',
    riskScore: 68,
    lastSeen: '2026-06-10T18:45:00Z',
    source: 'DARKWEB',
    tags: ['darkweb', 'marketplace', 'active'],
    connectionCount: 89,
    identifiers: { type: '.onion domain', hosting: 'Tor Hidden Service' },
    description: 'Active dark web forum facilitating sale of personal data and credential dumps.',
  },
  {
    id: 'ENT-2201',
    name: 'Chen Wei-Lin',
    type: 'PERSON',
    riskScore: 55,
    lastSeen: '2026-06-08T09:30:00Z',
    source: 'SOCMINT',
    tags: ['person-of-interest', 'monitored', 'cn'],
    connectionCount: 19,
    aliases: ['Wei-Lin Chen', 'CWL'],
    identifiers: { weibo: '@cwl_official', linkedin: 'chen-weilin-8881' },
    location: 'Shanghai, China',
    description: 'Tech executive with suspected ties to PLA procurement networks.',
  },
  {
    id: 'ENT-9934',
    name: 'Port of Karachi — Berth 7',
    type: 'LOCATION',
    riskScore: 62,
    lastSeen: '2026-06-09T12:00:00Z',
    source: 'HUMINT',
    tags: ['maritime', 'smuggling-route', 'pk'],
    connectionCount: 31,
    identifiers: { coordinates: '24.8465° N, 66.9934° E', locode: 'PKQCT' },
    location: 'Karachi, Pakistan',
    description: 'Known transit point for dual-use goods. Multiple interception events in last 18 months.',
  },
  {
    id: 'ENT-1188',
    name: 'KP-7741 (Land Cruiser)',
    type: 'VEHICLE',
    riskScore: 42,
    lastSeen: '2026-06-07T17:00:00Z',
    source: 'OSINT',
    tags: ['tracked', 'surveillance', 'pk'],
    connectionCount: 8,
    identifiers: { plate: 'KP-7741', make: 'Toyota Land Cruiser', colour: 'White' },
    location: 'Peshawar, Pakistan',
    description: 'Vehicle linked to multiple border crossing events. Associated with known courier network.',
  },
  {
    id: 'ENT-4455',
    name: 'Nexus Capital Partners',
    type: 'FINANCIAL',
    riskScore: 79,
    lastSeen: '2026-06-11T15:00:00Z',
    source: 'FINANCIAL',
    tags: ['fund', 'sanctions-watch', 'cy'],
    connectionCount: 56,
    aliases: ['NCP', 'Nexus Capital'],
    identifiers: { swift: 'NCPKCY22', registered: 'Limassol, Cyprus' },
    location: 'Limassol, Cyprus',
    description: 'Investment vehicle flagged for exposure to sanctioned persons via indirect beneficial ownership.',
  },
  {
    id: 'ENT-6677',
    name: 'Ibrahim Al-Rashid',
    type: 'PERSON',
    riskScore: 88,
    lastSeen: '2026-06-12T06:00:00Z',
    source: 'HUMINT',
    tags: ['armed-group', 'logistics', 'sa'],
    connectionCount: 34,
    aliases: ['Abu Rashid', 'Al-Rashid'],
    identifiers: { idNumber: 'SA-2288441' },
    location: 'Riyadh, Saudi Arabia',
    description: 'Logistics coordinator for non-state armed group. Suspected facilitation of weapons procurement.',
  },
  {
    id: 'ENT-3390',
    name: 'shadow-ops.xyz',
    type: 'DIGITAL',
    riskScore: 71,
    lastSeen: '2026-06-12T22:30:00Z',
    source: 'OSINT',
    tags: ['phishing-infrastructure', 'active', 'newly-registered'],
    connectionCount: 14,
    identifiers: { registrar: 'Namecheap', registered: '2026-05-01', ip: '103.21.244.12' },
    description: 'Newly registered domain identified in targeted spearphishing campaign against defence contractors.',
  },
  {
    id: 'ENT-7720',
    name: 'Zara Petrenko',
    type: 'PERSON',
    riskScore: 34,
    lastSeen: '2026-06-01T10:00:00Z',
    source: 'SOCMINT',
    tags: ['associate', 'low-risk', 'ua'],
    connectionCount: 6,
    aliases: ['Z. Petrenko'],
    identifiers: { twitter: '@zpetrenko_ua' },
    location: 'Kyiv, Ukraine',
    description: 'Known associate of higher-risk individuals. No direct threat indicators at this time.',
  },
  {
    id: 'ENT-8800',
    name: 'Global Freight Transit Co.',
    type: 'ORG',
    riskScore: 58,
    lastSeen: '2026-06-05T14:00:00Z',
    source: 'FINANCIAL',
    tags: ['logistics', 'dual-use', 'ae'],
    connectionCount: 28,
    aliases: ['GFT Co.', 'Global Freight'],
    identifiers: { registered: 'Dubai, UAE', trn: 'AE-882201' },
    location: 'Dubai, UAE',
    description: 'Freight company used as front for dual-use goods transshipment to sanctioned jurisdictions.',
  },
];

// ─────────────────────────────────────────────────────────────────
// Filter helpers
// ─────────────────────────────────────────────────────────────────

function normalizeFilters(filters?: EntityFilters): ServiceEntityFilters {
  return {
    types: filters?.types,
    riskMin: filters?.riskMin,
    riskMax: filters?.riskMax,
    lastSeenFrom: filters?.lastSeenFrom?.toISOString(),
    lastSeenTo: filters?.lastSeenTo?.toISOString(),
    sources: filters?.sources,
    tags: filters?.tags,
  };
}

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 12;

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Search timed out. Check your connection and try again.';
    }

    if (!error.response) {
      return 'Network error. Verify your connection and retry.';
    }

    return (
      (error.response.data as { message?: string })?.message ||
      `Search API failure: ${error.response.status} ${error.response.statusText}`
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Search failed. Please try again.';
}

export function useEntitySearch(params: EntitySearchParams): EntitySearchResult {
  const [results, setResults] = useState<Entity[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? PAGE_SIZE;

  const search = useCallback(async (p: EntitySearchParams) => {
    abortRef.current = false;
    setIsLoading(true);
    setError(null);

    try {
      const data = await searchEntities(
        p.query,
        normalizeFilters(p.filters),
        p.page,
        p.pageSize,
      );

      if (abortRef.current) return;

      setResults(data.entities);
      setTotal(data.total);
    } catch (error) {
      if (!abortRef.current) {
        setError(getErrorMessage(error));
      }
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const retry = useCallback(() => {
    search(params);
  }, [params, search]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      search(params);
    }, DEBOUNCE_MS);

    return () => {
      abortRef.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.query, params.page, params.pageSize, JSON.stringify(params.filters)]);

  return { entities: results, total, page, pageSize, isLoading, error, retry };
}

export { MOCK_ENTITIES };