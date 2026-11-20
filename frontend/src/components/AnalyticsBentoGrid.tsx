import { motion } from "framer-motion";
import { Fingerprint } from "lucide-react";
import {
  deriveFileHotspots,
  deriveRadarAxes,
  deriveSeverityBuckets
} from "../lib/derive";
import { STAGGER_ITEM, STAGGER_LIST } from "../lib/motion";
import type {
  ActiveFilters,
  AnalysisResult,
  Category,
  Severity
} from "../types/analysis";
import { FileHotspotBars } from "./charts/FileHotspotBars";
import { RadarChart } from "./charts/RadarChart";
import { RadialGauge } from "./charts/RadialGauge";
import { SeverityDonut } from "./charts/SeverityDonut";
import styles from "./charts/charts.module.css";

interface AnalyticsBentoGridProps {
  result: AnalysisResult;
  filters: ActiveFilters;
  onSelectSeverity: (severity: Severity | null) => void;
  onSelectCategory: (category: Category | null) => void;
  onSelectFile: (filePath: string | null) => void;
}

export function AnalyticsBentoGrid({
  result,
  filters,
  onSelectSeverity,
  onSelectCategory,
  onSelectFile
}: AnalyticsBentoGridProps) {
  const report = result.final_report;
  const radarAxes = deriveRadarAxes(result);
  const severityBuckets = deriveSeverityBuckets(report.findings);
  const hotspots = deriveFileHotspots(report.findings, result.selected_files);

  return (
    <motion.section
      className={styles.bentoSection}
      variants={STAGGER_LIST}
      initial="hidden"
      animate="show"
      aria-label="Repository telemetry"
    >
      <motion.div variants={STAGGER_ITEM} className={styles.summaryStrip}>
        <div>
          <div className={styles.summaryLabel}>Executive Summary</div>
          <p className={styles.summaryText}>{report.summary}</p>
        </div>
        <div className={styles.threadBadge} title={`Checkpoint thread ${result.thread_id}`}>
          <Fingerprint size={13} strokeWidth={1.5} />
          <span>{result.thread_id.slice(0, 8)}</span>
        </div>
      </motion.div>

      <div className={styles.grid}>
        <motion.div variants={STAGGER_ITEM} className={styles.cardSlot}>
          <RadialGauge
            overallScore={report.overall_score}
            securityScore={report.security_score}
            architectureScore={report.architecture_score}
          />
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className={styles.cardSlot}>
          <RadarChart
            axes={radarAxes}
            activeCategory={filters.category}
            onSelectCategory={onSelectCategory}
          />
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className={styles.cardSlot}>
          <SeverityDonut
            buckets={severityBuckets}
            activeSeverity={filters.severity}
            onSelectSeverity={onSelectSeverity}
          />
        </motion.div>

        <motion.div variants={STAGGER_ITEM} className={styles.cardSlot}>
          <FileHotspotBars
            hotspots={hotspots}
            activeFile={filters.file}
            onSelectFile={onSelectFile}
          />
        </motion.div>
      </div>
    </motion.section>
  );
}
