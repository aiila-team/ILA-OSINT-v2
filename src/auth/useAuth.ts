import { useState, useCallback } from 'react';

export type Role = 'admin' | 'analyst';

interface AuthUser {
  username: string;
  role: Role;
  orgId: string;
  sessionId: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string, orgId: string) => boolean;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
}

export type Permission =
  | 'view_investigations'
  | 'view_alerts'
  | 'view_entity_search'
  | 'view_graph'
  | 'view_timeline'
  | 'view_cases'
  | 'view_reports'
  | 'manage_users'
  | 'view_monitoring'
  | 'view_security'
  | 'view_audit_logs';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'view_investigations', 'view_alerts', 'view_entity_search',
    'view_graph', 'view_timeline', 'view_cases', 'view_reports',
    'manage_users', 'view_monitoring', 'view_security', 'view_audit_logs',
  ],
  analyst: [
    'view_investigations', 'view_alerts', 'view_entity_search',
    'view_graph', 'view_timeline', 'view_cases', 'view_reports',
  ],
};

const SESSION_KEY = 'ila_session';

export function useAuth(): AuthState {
  const stored = sessionStorage.getItem(SESSION_KEY);
  const [user, setUser] = useState<AuthUser | null>(
    stored ? JSON.parse(stored) : null
  );

  const login = useCallback((username: string, password: string, orgId: string): boolean => {
    const validUser = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
    const validPass = import.meta.env.VITE_ADMIN_PASSWORD || 'ILA@2024';
    const validOrg  = import.meta.env.VITE_ADMIN_ORG      || 'ORG-00001';

    if (username === validUser && password === validPass && orgId === validOrg) {
      const authUser: AuthUser = {
        username,
        role: 'admin',
        orgId,
        sessionId: Math.random().toString(36).substring(2, 9).toUpperCase(),
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
      setUser(authUser);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    window.location.href = '/';
  }, []);

  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role].includes(permission);
  }, [user]);

  return { user, isAuthenticated: !!user, login, logout, hasPermission };
}