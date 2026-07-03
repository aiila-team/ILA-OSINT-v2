// src/hooks/useAlertInboxData.ts
// Hook for alert inbox data management

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  getAlerts,
  updateAlert as apiUpdateAlert,
  assignAlert as apiAssignAlert,
  escalateAlert as apiEscalateAlert,
  type InboxAlert,
  type SmartView,
  type Priority,
} from '../services/alertInboxService';

export type { InboxAlert, AlertInboxStatus, SmartView, Priority } from '../services/alertInboxService';

interface AlertInboxDataResponse {
  alerts: InboxAlert[];
  counts: Record<Priority, number>;
  smartViewCounts: Record<SmartView, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateAlert: (id: string, updates: Partial<InboxAlert>) => Promise<InboxAlert>;
  assignAlert: (id: string, analyst: { initials: string; name?: string }) => Promise<InboxAlert>;
  escalateAlert: (id: string) => Promise<InboxAlert>;
}

export function useAlertInboxData(): AlertInboxDataResponse {
  const [alerts, setAlerts] = useState<InboxAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAlerts();
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateAlert = useCallback(async (id: string, updates: Partial<InboxAlert>) => {
    try {
      const updated = await apiUpdateAlert(id, updates);
      setAlerts(prev => prev.map(alert => alert.id === id ? updated : alert));
      return updated;
    } catch (err) {
      throw err;
    }
  }, []);

  const assignAlert = useCallback(async (id: string, analyst: { initials: string; name?: string }) => {
    try {
      const updated = await apiAssignAlert(id, analyst);
      setAlerts(prev => prev.map(alert => alert.id === id ? updated : alert));
      return updated;
    } catch (err) {
      throw err;
    }
  }, []);

  const escalateAlert = useCallback(async (id: string) => {
    try {
      const updated = await apiEscalateAlert(id);
      setAlerts(prev => prev.map(alert => alert.id === id ? updated : alert));
      return updated;
    } catch (err) {
      throw err;
    }
  }, []);

  const counts = useMemo(() => ({
    CRITICAL: alerts.filter(a => a.severity === 'CRITICAL').length,
    HIGH:     alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM:   alerts.filter(a => a.severity === 'MEDIUM').length,
    LOW:      alerts.filter(a => a.severity === 'LOW').length,
  }), [alerts]);

  const smartViewCounts = useMemo(() => ({
    MY_QUEUE:   alerts.filter(a => a.assignedTo === 'RK').length,
    UNASSIGNED: alerts.filter(a => a.assignedTo === null).length,
    ESCALATED:  alerts.filter(a => a.status === 'ESCALATED').length,
    ALL:        alerts.length,
  }), [alerts]);

  return {
    alerts,
    counts,
    smartViewCounts,
    loading,
    error,
    refresh,
    updateAlert,
    assignAlert,
    escalateAlert,
  };
}
