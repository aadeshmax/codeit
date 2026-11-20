import { motion } from "framer-motion";
import { FileCode2 } from "lucide-react";
import type { FileHotspot } from "../../lib/derive";
import { pathsMatch, SEVERITY_COLOR } from "../../lib/derive";
import { APPLE_SPRING } from "../../lib/motion";
import styles from "./charts.module.css";

interface FileHotspotBarsProps {
  hotspots: FileHotspot[];
  activeFile: string | null;
  onSelectFile: (filePath: string | null) => void;
}

export function FileHotspotBars({
  hotspots,
  activeFile,
  onSelectFile
}: FileHotspotBarsProps) {
  const maxCount = Math.max(1, ...hotspots.map((h) => h.count));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <FileCode2 size={15} strokeWidth={1.5} className={styles.cardIcon} />
          <h2 className={styles.cardTitle}>File Hotspots</h2>
        </div>
        <span className={styles.cardHint}>{hotspots.length} Files</span>
      </div>

      {hotspots.length === 0 ? (
        <div className={styles.emptyChart}>No source files indexed</div>
      ) : (
        <div className={styles.hotspotList}>
          {hotspots.map((item) => {
            const isSelected =
              activeFile !== null && pathsMatch(activeFile, item.filePath);
            const ratio = item.count > 0 ? item.count / maxCount : 0.04;
            const fillColor =
              item.count > 0
                ? SEVERITY_COLOR[item.worstSeverity]
                : "rgba(255, 255, 255, 0.16)";

            return (
              <button
                key={item.filePath}
                type="button"
                className={`${styles.hotspotRow} ${
                  isSelected ? styles.hotspotRowActive : ""
                }`}
                onClick={() =>
                  onSelectFile(isSelected ? null : item.filePath)
                }
                title={item.filePath}
              >
                <div className={styles.hotspotTop}>
                  <span className={styles.hotspotPath}>{item.filePath}</span>
                  <span className={styles.hotspotCount}>{item.count}</span>
                </div>
                <div className={styles.barTrack}>
                  <motion.div
                    className={styles.barFill}
                    style={{ backgroundColor: fillColor }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: ratio }}
                    transition={APPLE_SPRING}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
