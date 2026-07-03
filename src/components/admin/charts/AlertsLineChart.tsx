// src/components/admin/charts/AlertsLineChart.tsx
import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { AlertsOverTimePoint } from '../../../types/dashboard';
import styles from './charts.module.scss';

export interface AlertsLineChartProps {
  data: AlertsOverTimePoint[];
  loading?: boolean;
}

const AlertsLineChart: React.FC<AlertsLineChartProps> = ({ data, loading = false }) => {
  if (loading) {
    return <div className={`${styles.skeleton} ${styles.chartSkeleton}`} />;
  }

  if (data.length === 0) {
    return <div className={styles.chartEmpty}>No alert data for this period.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="alertsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1fb6da" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#1fb6da" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,163,199,0.12)" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: '#34495a', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}
          axisLine={{ stroke: 'rgba(0,163,199,0.12)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#34495a', fontSize: 9, fontFamily: 'IBM Plex Mono, monospace' }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: '#0d1a28',
            border: '1px solid #182838',
            borderRadius: 4,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
          }}
          labelStyle={{ color: '#7e98a8' }}
          itemStyle={{ color: '#1fb6da' }}
        />
        <Area
          type="monotone"
          dataKey="alerts"
          stroke="#1fb6da"
          strokeWidth={2}
          fill="url(#alertsFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default AlertsLineChart;
