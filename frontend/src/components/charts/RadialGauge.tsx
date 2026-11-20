import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useCountUp } from "../../hooks/useCountUp";
import { clampScore, getScoreColor, getScoreLabel } from "../../lib/derive";
import { APPLE_SPRING } from "../../lib/motion";
import styles from "./charts.module.css";

interface RadialGaugeProps {
  overallScore: number;
  securityScore: number;
  architectureScore: number;
}

const RADIUS = 72;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RadialGauge({
  overallScore,
  securityScore,
  architectureScore
}: RadialGaugeProps) {
  const safeOverall = clampScore(overallScore);
  const animatedScore = useCountUp(safeOverall);
  const color = getScoreColor(safeOverall);
  const statusLabel = getScoreLabel(safeOverall);
  const targetOffset = CIRCUMFERENCE * (1 - safeOverall / 100);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Activity size={15} strokeWidth={1.5} className={styles.cardIcon} />
          <h2 className={styles.cardTitle}>Overall Health</h2>
        </div>
        <span className={styles.cardHint}>0–100</span>
      </div>

      <div className={styles.gaugeWrap}>
        <div className={styles.gaugeSvgWrap}>
          <svg
            viewBox="0 0 180 180"
            className={styles.gaugeSvg}
            role="img"
            aria-label={`Overall health score ${safeOverall} out of 100`}
          >
            <circle
              cx={90}
              cy={90}
              r={RADIUS}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={8}
            />
            <motion.circle
              cx={90}
              cy={90}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              initial={{ strokeDashoffset: CIRCUMFERENCE }}
              animate={{ strokeDashoffset: targetOffset }}
              transition={APPLE_SPRING}
              transform="rotate(-90 90 90)"
            />
          </svg>
          <div className={styles.gaugeCenter}>
            <span className={styles.gaugeScore} style={{ color }}>
              {animatedScore}
            </span>
            <span className={styles.gaugeStatus}>{statusLabel}</span>
          </div>
        </div>

        <div className={styles.subMetrics}>
          <div className={styles.subMetric}>
            <span className={styles.subMetricLabel}>Security</span>
            <span className={styles.subMetricVal}>{clampScore(securityScore)}</span>
          </div>
          <div className={styles.subMetric}>
            <span className={styles.subMetricLabel}>Arch</span>
            <span className={styles.subMetricVal}>{clampScore(architectureScore)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
