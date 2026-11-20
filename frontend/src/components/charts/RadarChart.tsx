import { useState } from "react";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import type { RadarAxisPoint } from "../../lib/derive";
import { getScoreColor } from "../../lib/derive";
import { APPLE_SPRING } from "../../lib/motion";
import type { Category } from "../../types/analysis";
import styles from "./charts.module.css";

interface RadarChartProps {
  axes: RadarAxisPoint[];
  activeCategory: Category | null;
  onSelectCategory: (category: Category | null) => void;
}

const CX = 110;
const CY = 100;
const MAX_R = 64;
const RINGS = [0.25, 0.5, 0.75, 1];

// 4 orthogonal axes: Top (Security), Right (Architecture), Bottom (Efficiency), Left (Syntax)
const ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

function pointAt(angle: number, ratio: number): [number, number] {
  return [CX + Math.cos(angle) * MAX_R * ratio, CY + Math.sin(angle) * MAX_R * ratio];
}

function buildPolygonPath(ratios: number[]): string {
  return (
    ratios
      .map((ratio, idx) => {
        const angle = ANGLES[idx] ?? 0;
        const [x, y] = pointAt(angle, ratio);
        return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}

export function RadarChart({
  axes,
  activeCategory,
  onSelectCategory
}: RadarChartProps) {
  const [hovered, setHovered] = useState<RadarAxisPoint | null>(null);

  const ratios = axes.map((a) => Math.max(0.06, a.score / 100));
  const dataPath = buildPolygonPath(ratios);
  const zeroPath = buildPolygonPath([0.04, 0.04, 0.04, 0.04]);

  const focused =
    hovered ??
    axes.find((a) => a.category === activeCategory) ??
    null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Compass size={15} strokeWidth={1.5} className={styles.cardIcon} />
          <h2 className={styles.cardTitle}>Domain Radar</h2>
        </div>
        <span className={styles.cardHint}>4 Axes</span>
      </div>

      <div className={styles.radarWrap}>
        <svg
          viewBox="0 0 220 200"
          className={styles.radarSvg}
          role="img"
          aria-label="Four-axis radar chart comparing Security, Architecture, Efficiency, and Syntax"
        >
          {/* Concentric 1px hairline rings */}
          {RINGS.map((ring) => (
            <path
              key={ring}
              d={buildPolygonPath([ring, ring, ring, ring])}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={1}
            />
          ))}

          {/* Hairline axis spokes */}
          {ANGLES.map((angle, idx) => {
            const [x, y] = pointAt(angle, 1);
            return (
              <line
                key={idx}
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth={1}
              />
            );
          })}

          {/* Animated data polygon */}
          <motion.path
            initial={{ d: zeroPath, opacity: 0.4 }}
            animate={{ d: dataPath, opacity: 1 }}
            transition={APPLE_SPRING}
            fill="rgba(10, 132, 255, 0.16)"
            stroke="#0A84FF"
            strokeWidth={1.75}
            strokeLinejoin="round"
          />

          {/* Interactive axis vertices and labels */}
          {axes.map((axis, idx) => {
            const angle = ANGLES[idx] ?? 0;
            const [vx, vy] = pointAt(angle, ratios[idx] ?? 0.06);
            const [lx, ly] = pointAt(angle, 1.28);
            const isSelected = activeCategory === axis.category;
            const isHovered = hovered?.category === axis.category;

            const textAnchor =
              idx === 1 ? "start" : idx === 3 ? "end" : "middle";
            const dy = idx === 0 ? -2 : idx === 2 ? 10 : 4;

            return (
              <g
                key={axis.category}
                className={styles.radarAxisBtn}
                onMouseEnter={() => setHovered(axis)}
                onMouseLeave={() => setHovered(null)}
                onClick={() =>
                  onSelectCategory(isSelected ? null : axis.category)
                }
              >
                <motion.circle
                  cx={vx}
                  cy={vy}
                  r={isSelected || isHovered ? 5 : 3.5}
                  fill={isSelected ? "#0A84FF" : getScoreColor(axis.score)}
                  stroke="#141416"
                  strokeWidth={1.5}
                  transition={APPLE_SPRING}
                />
                <text
                  x={lx}
                  y={ly + dy}
                  textAnchor={textAnchor}
                  fill={isSelected || isHovered ? "#F5F5F7" : "#86868B"}
                  fontSize={10.5}
                  fontWeight={isSelected ? 600 : 500}
                >
                  {axis.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className={styles.radarTooltip}>
          {focused ? (
            <>
              <span className={styles.radarTooltipStrong}>{focused.label}</span>
              <span>
                {focused.score}/100 · {focused.count}{" "}
                {focused.count === 1 ? "finding" : "findings"}
              </span>
            </>
          ) : (
            <>
              <span>Select axis to filter</span>
              <span>100 max</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
