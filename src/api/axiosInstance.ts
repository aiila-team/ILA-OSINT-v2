import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client': 'ILA-OSINT/3.1',
  },
});

// Request interceptor — attach session token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const session = sessionStorage.getItem('ila_session');
  if (session) {
    const parsed = JSON.parse(session);
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${parsed.sessionId}`;
    (config.headers as Record<string, string>)['X-Org-ID'] = parsed.orgId;
  }
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('ila_session');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;