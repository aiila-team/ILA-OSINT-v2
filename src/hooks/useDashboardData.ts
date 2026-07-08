// src/hooks/useDashboardData.ts
import { useEffect, useState, useCallback } from 'react';
import {
  getDashboardStats,
  getAlerts,
  getInsights,
  getAlertsOverTime,
  getDataSourceActivity,
  getActivityTimeline,
} from '../services/dashboardService';
import type {
  DashboardStats,
  AlertRecord,
  AIInsight,
  AlertsOverTimePoint,
  DataSourceActivityPoint,
  ActivityEvent,
  LoadState,
} from '../types/dashboard';

export interface DashboardData {
  stats: DashboardStats | null;
  alerts: AlertRecord[];
  insights: AIInsight[];
  alertsOverTime: AlertsOverTimePoint[];
  dataSourceActivity: DataSourceActivityPoint[];
  activity: ActivityEvent[];
  loadState: LoadState;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads all data needed by the Admin Overview dashboard.
 * Each section's mock service call could later be swapped for a real
 * API/GraphQL call without changing the page or component contracts.
 */
export function useDashboardData(): DashboardData {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [alertsOverTime, setAlertsOverTime] = useState<AlertsOverTimePoint[]>([]);
  const [dataSourceActivity, setDataSourceActivity] = useState<DataSourceActivityPoint[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(() => {
    let cancelled = false;
    setLoadState('loading');
    setError(null);

    Promise.all([
      getDashboardStats(),
      getAlerts(),
      getInsights(),
      getAlertsOverTime(),
      getDataSourceActivity(),
      getActivityTimeline(),
    ])
      .then(([s, a, i, aot, dsa, act]) => {
        if (cancelled) return;
        setStats(s);
        setAlerts(a);
        setInsights(i);
        setAlertsOverTime(aot);
        setDataSourceActivity(dsa);
        setActivity(act);
        setLoadState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = fetchAll();
    return cleanup;
  }, [fetchAll]);

  return {
    stats,
    alerts,
    insights,
    alertsOverTime,
    dataSourceActivity,
    activity,
    loadState,
    error,
    refetch: fetchAll,
  };
}
