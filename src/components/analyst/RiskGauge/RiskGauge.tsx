// src/components/analyst/RiskGauge/RiskGauge.tsx
// ILA OSINT — Risk Score Arc Gauge
// SVG-based semi-circle gauge rendered inline in the drawer overview.

import React, { useMemo } from 'react';
import styles from './RiskGauge.module.scss';

interface RiskGaugeProps {
  /** 0–100 risk score */
  score:      number;
  /** Diameter of the gauge in px (default 64) */
  size?:      number;
  /** Show score label inside the arc */
  showLabel?: boolean;
}

function scoreToColor(score: number): string {
  if (score >= 80) return '#fa4d56';
  if (score >= 55) return '#ff8389';
  if (score >= 35) return '#f1c21b';
  return '#24a148';
}

const RiskGauge: React.FC<RiskGaugeProps> = ({ score, size = 64, showLabel = false }) => {
  const clampedScore = Math.max(0, Math.min(100, score));

  const { pathBg, pathFill, cx, cy } = useMemo(() => {
    const cx = size / 2;
    const cy = size / 2 + size * 0.08; // nudge centre down so arc looks balanced
    const r  = size * 0.38;

    // Arc goes from 200° to 340° (140° sweep = semi-circle with padding)
    const startDeg = 200;
    const totalDeg = 140;

    const toRad = (d: number) => (d * Math.PI) / 180;

    const arcPath = (fromDeg: number, toDeg: number) => {
      const x1  = cx + r * Math.cos(toRad(fromDeg));
      const y1  = cy + r * Math.sin(toRad(fromDeg));
      const x2  = cx + r * Math.cos(toRad(toDeg));
      const y2  = cy + r * Math.sin(toRad(toDeg));
      const lg  = toDeg - fromDeg > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${r} ${r} 0 ${lg} 1 ${x2} ${y2}`;
    };

    const endDeg = startDeg + totalDeg * (clampedScore / 100);

    return {
      pathBg:   arcPath(startDeg, startDeg + totalDeg),
      pathFill: arcPath(startDeg, endDeg),
      cx,
      cy,
    };
  }, [size, clampedScore]);

  const color = scoreToColor(clampedScore);
  const sw    = Math.max(3, size * 0.07);

  return (
    <div className={styles.wrap} style={{ width: size, height: size * 0.72 }}>
      <svg
        width={size}
        height={size * 0.72}
        viewBox={`0 0 ${size} ${size * 0.72}`}
        aria-label={`Risk score: ${clampedScore}`}
        role="img"
      >
        {/* Background arc */}
        <path
          d={pathBg}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={pathFill}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          style={{
            filter: `drop-shadow(0 0 ${sw * 0.8}px ${color}66)`,
            transition: 'stroke-dasharray 0.6s ease',
          }}
        />
        {showLabel && (
          <>
            <text
              x={cx}
              y={cy + 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color}
              fontSize={size * 0.22}
              fontWeight="700"
              fontFamily="var(--font-mono,'IBM Plex Mono',monospace)"
            >
              {clampedScore}
            </text>
            <text
              x={cx}
              y={cy + size * 0.19}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.3)"
              fontSize={size * 0.1}
              fontFamily="var(--font-mono,'IBM Plex Mono',monospace)"
              letterSpacing="0.12em"
            >
              RISK
            </text>
          </>
        )}
      </svg>
    </div>
  );
};

export default RiskGauge;