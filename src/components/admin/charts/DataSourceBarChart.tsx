// src/components/admin/charts/DataSourceBarChart.tsx
import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import type { DataSourceActivityPoint } from '../../../types/dashboard';
import styles from './charts.module.scss';

export interface DataSourceBarChartProps {
  data: DataSourceActivityPoint[];
  loading?: boolean;
}

const BAR_COLORS = ['#1fb6da', '#5ec9e0', '#4589ff', '#a56eff', '#24a148', '#f1c21b'];

const DataSourceBarChart: React.FC<DataSourceBarChartProps> = ({ data, loading = false }) => {
  if (loading) {
    return <div className={`${styles.skeleton} ${styles.chartSkeleton}`} />;
  }

  if (data.length === 0) {
    return <div className={styles.chartEmpty}>No data source activity recorded.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,163,199,0.12)" vertical={false} />
        <XAxis
          dataKey="source"
          tick={{ fill: '#34495a', fontSize: 8.5, fontFamily: 'IBM Plex Mono, monospace' }}
          axisLine={{ stroke: 'rgba(0,163,199,0.12)' }}
          tickLine={false}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={42}
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
          cursor={{ fill: 'rgba(0,163,199,0.06)' }}
        />
        <Bar dataKey="events" radius={[2, 2, 0, 0]}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default DataSourceBarChart;
