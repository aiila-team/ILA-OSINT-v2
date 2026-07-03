import api from '../api/axiosInstance';

export type GraphApiNodeType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DIGITAL'
  | 'VEHICLE'
  | 'FINANCIAL'
  | 'EVENT'
  | 'PHONE'
  | 'EMAIL'
  | 'IP'
  | 'SOCIAL';

export interface GraphApiNode {
  id: string;
  label: string;
  type: GraphApiNodeType;
  riskScore: number;
  source?: string;
  location?: string;
  aliases?: string[];
  connectionCount?: number;
  lastSeen?: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface GraphApiEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  label?: string;
  weight?: number;
  directional?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GraphPageInfo {
  cursor?: string;
  hasNextPage?: boolean;
  pageSize?: number;
}

export interface GraphApiResponse {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
  pageInfo?: GraphPageInfo;
  summary?: {
    totalNodes?: number;
    totalEdges?: number;
  };
}

export interface GraphFetchOptions {
  seedNodeId?: string;
  search?: string;
  types?: GraphApiNodeType[];
  relationTypes?: string[];
  riskMin?: number;
  riskMax?: number;
  pageSize?: number;
  cursor?: string;
  depth?: number;
}

export interface GraphExpandRequest {
  nodeIds: string[];
  depth?: number;
  types?: GraphApiNodeType[];
  relationTypes?: string[];
  riskMin?: number;
  riskMax?: number;
  pageSize?: number;
}

function buildParams(options: GraphFetchOptions | GraphExpandRequest) {
  const params: Record<string, string> = {};

  if ('seedNodeId' in options && options.seedNodeId) {
    params.seedNodeId = options.seedNodeId;
  }
  if ('search' in options && options.search) {
    params.search = options.search;
  }
  if ('types' in options && options.types?.length) {
    params.types = options.types.join(',');
  }
  if ('relationTypes' in options && options.relationTypes?.length) {
    params.relationTypes = options.relationTypes.join(',');
  }
  if ('riskMin' in options && typeof options.riskMin === 'number') {
    params.riskMin = String(options.riskMin);
  }
  if ('riskMax' in options && typeof options.riskMax === 'number') {
    params.riskMax = String(options.riskMax);
  }
  if ('pageSize' in options && typeof options.pageSize === 'number') {
    params.pageSize = String(options.pageSize);
  }
  if ('cursor' in options && options.cursor) {
    params.cursor = options.cursor;
  }
  if ('depth' in options && typeof options.depth === 'number') {
    params.depth = String(options.depth);
  }

  return params;
}

export async function fetchGraph(options: GraphFetchOptions = {}): Promise<GraphApiResponse> {
  const params = buildParams(options);
  const response = await api.get<GraphApiResponse>('/graph', { params });
  return response.data;
}

export async function expandGraph(request: GraphExpandRequest): Promise<GraphApiResponse> {
  const params = buildParams(request);
  const response = await api.post<GraphApiResponse>('/graph/expand', request, { params });
  return response.data;
}
