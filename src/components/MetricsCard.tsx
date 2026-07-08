import { motion } from 'framer-motion';

interface MetricsCardProps {
  label: string;
  value: number;
  total?: number;
  color: string;
  glowColor: string;
  icon: string;
  index: number;
  trend?: 'up' | 'down' | 'stable';
}

export function MetricsCard({ label, value, total, color, glowColor, icon, index, trend }: MetricsCardProps) {
  const percentage = total ? Math.round((value / total) * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${glowColor}33`,
        boxShadow: `0 0 18px ${glowColor}10, inset 0 0 30px rgba(0,0,0,0.2)`,
        borderRadius: 0,
        padding: '20px 24px',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minWidth: 0,
        cursor: 'default',
      }}
      whileHover={{
        boxShadow: `0 0 32px ${glowColor}30, inset 0 0 30px rgba(0,0,0,0.2)`,
        borderColor: `${glowColor}66`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 32,
          height: 2,
          background: color,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 2,
          height: 32,
          background: color,
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            {label}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.08 + 0.2 }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 38,
              fontWeight: 700,
              color,
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {value.toString().padStart(2, '0')}
          </motion.div>
          {percentage !== null && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 6,
                letterSpacing: '0.06em',
              }}
            >
              {percentage}% OF TOTAL
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 20, opacity: 0.6 }}>{icon}</span>
          {trend && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: trend === 'up' ? '#24a148' : trend === 'down' ? '#fa4d56' : 'var(--text-muted)',
                background: trend === 'up' ? 'rgba(36,161,72,0.1)' : trend === 'down' ? 'rgba(250,77,86,0.1)' : 'transparent',
                border: `1px solid ${trend === 'up' ? 'rgba(36,161,72,0.3)' : trend === 'down' ? 'rgba(250,77,86,0.3)' : 'var(--border)'}`,
                padding: '2px 6px',
              }}
            >
              {trend === 'up' ? '▲ +2' : trend === 'down' ? '▼ -1' : '● STABLE'}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, height: 2, background: 'var(--bg-elevated)', borderRadius: 1, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage ?? 100}%` }}
          transition={{ duration: 0.8, delay: index * 0.08 + 0.3, ease: 'easeOut' }}
          style={{ height: '100%', background: color, opacity: 0.7 }}
        />
      </div>
    </motion.div>
  );
}
