import api from '../api/axiosInstance';

export type EntityType =
  | 'PERSON'
  | 'ORG'
  | 'LOCATION'
  | 'DIGITAL'
  | 'VEHICLE'
  | 'FINANCIAL';

export type EntitySource =
  | 'OSINT'
  | 'HUMINT'
  | 'SIGINT'
  | 'SOCMINT'
  | 'DARKWEB'
  | 'FINANCIAL';

export interface EntityFilters {
  types?: EntityType[];
  riskMin?: number;
  riskMax?: number;
  lastSeenFrom?: string;
  lastSeenTo?: string;
  sources?: EntitySource[];
  tags?: string[];
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  riskScore: number;
  lastSeen: string;
  source: EntitySource;
  tags: string[];
  connectionCount: number;
  fraudStatus?: 'clean' | 'suspected' | 'confirmed';
  blacklistStatus?: 'clean' | 'monitored' | 'blacklisted';
  aliases?: string[];
  identifiers?: Record<string, string>;
  location?: string;
  description?: string;
}

export interface SearchEntitiesResult {
  entities: Entity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EntityConnection {
  id: string;
  name: string;
  type: EntityType;
  source: EntitySource;
  riskScore: number;
  lastSeen: string;
}

export interface EntityTimelineItem {
  id: string;
  ts: string;
  event: string;
  source: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
}

export interface EntityRisk {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  blacklistStatus: 'clean' | 'monitored' | 'blacklisted';
  fraudScore?: number;
  summary?: string;
}

export interface EntitySourceRecord {
  source: string;
  label: string;
  type: 'social' | 'breach' | 'public_records' | 'dark_web' | 'financial' | 'other';
  confidence?: number;
  lastSeen?: string;
}

const DEFAULT_RETRY_COUNT = 2;

async function retryRequest<T>(request: () => Promise<T>, retries = DEFAULT_RETRY_COUNT): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    return retryRequest(request, retries - 1);
  }
}

function buildSearchParams(query: string, filters?: EntityFilters, page = 1, pageSize = 12) {
  const params: Record<string, string | number> = {
    q: query?.trim() ?? '',
    page,
    pageSize,
  };

  if (filters) {
    if (filters.types?.length) params.types = JSON.stringify(filters.types);
    if (filters.sources?.length) params.sources = JSON.stringify(filters.sources);
    if (filters.tags?.length) params.tags = JSON.stringify(filters.tags);
    if (filters.riskMin !== undefined) params.riskMin = filters.riskMin;
    if (filters.riskMax !== undefined) params.riskMax = filters.riskMax;
    if (filters.lastSeenFrom) params.lastSeenFrom = filters.lastSeenFrom;
    if (filters.lastSeenTo) params.lastSeenTo = filters.lastSeenTo;
  }

  return params;
}

export async function searchEntities(
  query: string,
  filters: EntityFilters = {},
  page = 1,
  pageSize = 12,
): Promise<SearchEntitiesResult> {
  const params = buildSearchParams(query, filters, page, pageSize);
  return retryRequest(async () => {
    const response = await api.get<SearchEntitiesResult>('/entities', { params });
    return response.data;
  });
}

export async function getEntityConnections(id: string): Promise<EntityConnection[]> {
  return retryRequest(async () => {
    const response = await api.get<EntityConnection[]>(`/entities/${encodeURIComponent(id)}/connections`);
    return response.data;
  });
}

export async function getEntityTimeline(id: string): Promise<EntityTimelineItem[]> {
  return retryRequest(async () => {
    const response = await api.get<EntityTimelineItem[]>(`/entities/${encodeURIComponent(id)}/timeline`);
    return response.data;
  });
}

export async function getEntityRisk(id: string): Promise<EntityRisk> {
  return retryRequest(async () => {
    const response = await api.get<EntityRisk>(`/entities/${encodeURIComponent(id)}/risk`);
    return response.data;
  });
}

export async function getEntitySources(id: string): Promise<EntitySourceRecord[]> {
  return retryRequest(async () => {
    const response = await api.get<EntitySourceRecord[]>(`/entities/${encodeURIComponent(id)}/sources`);
    return response.data;
  });
}
