import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { useCountUp } from "../../hooks/useCountUp";
import type { SeverityBucket } from "../../lib/derive";
import { APPLE_SPRING } from "../../lib/motion";
import type { Severity } from "../../types/analysis";
import styles from "./charts.module.css";

interface SeverityDonutProps {
  buckets: SeverityBucket[];
  activeSeverity: Severity | null;
  onSelectSeverity: (severity: Severity | null) => void;
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SeverityDonut({
  buckets,
  activeSeverity,
  onSelectSeverity
}: SeverityDonutProps) {
  const total = buckets.reduce((acc, b) => acc + b.count, 0);
  const activeBucket = buckets.find((b) => b.severity === activeSeverity);
  const centerValue = useCountUp(activeBucket ? activeBucket.count : total);

  let cumulativeLength = 0;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <ShieldAlert size={15} strokeWidth={1.5} className={styles.cardIcon} />
          <h2 className={styles.cardTitle}>Severity Breakdown</h2>
        </div>
        <span className={styles.cardHint}>
          {activeSeverity ? activeSeverity : "All"}
        </span>
      </div>

      <div className={styles.donutWrap}>
        <div className={styles.donutSvgWrap}>
          <svg
            viewBox="0 0 180 180"
            className={styles.donutSvg}
            role="img"
            aria-label={`Severity distribution across ${total} findings`}
          >
            <circle
              cx={90}
              cy={90}
              r={RADIUS}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={14}
            />

            {total > 0 &&
              buckets.map((bucket) => {
                if (bucket.count === 0) return null;
                const fraction = bucket.count / total;
                const segLength = Math.max(0, fraction * CIRCUMFERENCE - 2);
                const offset = -cumulativeLength;
                cumulativeLength += fraction * CIRCUMFERENCE;

                const isSelected = activeSeverity === bucket.severity;
                const isDimmed = activeSeverity !== null && !isSelected;

                return (
                  <motion.circle
                    key={bucket.severity}
                    cx={90}
                    cy={90}
                    r={RADIUS}
                    fill="none"
                    stroke={bucket.color}
                    strokeWidth={isSelected ? 17 : 14}
                    strokeDasharray={`${segLength} ${CIRCUMFERENCE}`}
                    initial={{ strokeDashoffset: CIRCUMFERENCE }}
                    animate={{
                      strokeDashoffset: offset,
                      opacity: isDimmed ? 0.28 : 1
                    }}
                    transition={APPLE_SPRING}
                    transform="rotate(-90 90 90)"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      onSelectSeverity(isSelected ? null : bucket.severity)
                    }
                  />
                );
              })}
          </svg>

          <div className={styles.donutCenter}>
            <span className={styles.donutCount}>{centerValue}</span>
            <span className={styles.donutSub}>
              {activeSeverity ?? (total === 1 ? "Finding" : "Findings")}
            </span>
          </div>
        </div>

        <div className={styles.legendGrid}>
          {buckets.map((bucket) => {
            const isSelected = activeSeverity === bucket.severity;
            return (
              <button
                key={bucket.severity}
                type="button"
                className={`${styles.legendItem} ${
                  isSelected ? styles.legendItemActive : ""
                }`}
                onClick={() =>
                  onSelectSeverity(isSelected ? null : bucket.severity)
                }
              >
                <span className={styles.legendLeft}>
                  <span
                    className={styles.legendDot}
                    style={{ backgroundColor: bucket.color }}
                  />
                  {bucket.severity}
                </span>
                <span className={styles.legendVal}>{bucket.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
