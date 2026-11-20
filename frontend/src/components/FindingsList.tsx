import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Filter, X } from "lucide-react";
import { useChecklist } from "../hooks/useChecklist";
import { getFindingKey, pathsMatch } from "../lib/derive";
import { STAGGER_LIST } from "../lib/motion";
import type { ActiveFilters, DiagnosticFinding } from "../types/analysis";
import { DiagnosticCard } from "./DiagnosticCard";
import styles from "./FindingsList.module.css";

interface FindingsListProps {
  findings: DiagnosticFinding[];
  threadId: string;
  filters: ActiveFilters;
  onClearFile: () => void;
  onClearSeverity: () => void;
  onClearCategory: () => void;
  onClearAll: () => void;
  onAskMentor: (finding: DiagnosticFinding) => void;
}

export function FindingsList({
  findings,
  threadId,
  filters,
  onClearFile,
  onClearSeverity,
  onClearCategory,
  onClearAll,
  onAskMentor
}: FindingsListProps) {
  const { isChecked, toggle, getCompletedCount } = useChecklist(threadId);

  const hasFilters = Boolean(
    filters.file || filters.severity || filters.category
  );

  const indexedFindings = useMemo(
    () =>
      findings.map((finding, idx) => ({
        finding,
        key: getFindingKey(finding, idx)
      })),
    [findings]
  );

  const filtered = useMemo(() => {
    return indexedFindings.filter(({ finding }) => {
      if (filters.file && !pathsMatch(finding.diagnostic.file_path, filters.file)) {
        return false;
      }
      if (filters.severity && finding.diagnostic.severity !== filters.severity) {
        return false;
      }
      if (filters.category && finding.category !== filters.category) {
        return false;
      }
      return true;
    });
  }, [indexedFindings, filters]);

  return (
    <section className={styles.section} aria-label="Diagnostic findings">
      <div className={styles.toolbar}>
        <div className={styles.headingGroup}>
          <h2 className={styles.heading}>Diagnostic Findings</h2>
          <span className={styles.count}>
            {hasFilters
              ? `${filtered.length} of ${findings.length}`
              : `${findings.length}`}
          </span>
        </div>

        {hasFilters && (
          <div className={styles.activeFilters}>
            {filters.file && (
              <button
                type="button"
                className={styles.filterPill}
                onClick={onClearFile}
              >
                <span className="mono">{filters.file}</span>
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
            {filters.severity && (
              <button
                type="button"
                className={styles.filterPill}
                onClick={onClearSeverity}
              >
                <span>Severity: {filters.severity}</span>
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
            {filters.category && (
              <button
                type="button"
                className={styles.filterPill}
                onClick={onClearCategory}
              >
                <span>Domain: {filters.category}</span>
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              className={styles.clearAllBtn}
              onClick={onClearAll}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {findings.length === 0 ? (
        <div className={styles.emptyCard}>
          <CheckCircle2 size={24} strokeWidth={1.5} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No diagnostic issues detected</p>
          <p className={styles.emptySub}>
            Security, architecture, efficiency, and syntax checks reported zero
            findings across the inspected files.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyCard}>
          <Filter size={22} strokeWidth={1.5} color="var(--text-secondary)" />
          <p className={styles.emptyTitle}>No findings match the active filter</p>
          <p className={styles.emptySub}>
            Adjust the file, severity, or domain filter to view all{" "}
            {findings.length} findings.
          </p>
          <button
            type="button"
            className={styles.resetFilterBtn}
            onClick={onClearAll}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <motion.div
          key={`${filters.file ?? ""}-${filters.severity ?? ""}-${filters.category ?? ""}`}
          className={styles.list}
          variants={STAGGER_LIST}
          initial="hidden"
          animate="show"
        >
          {filtered.map(({ finding, key }) => (
            <DiagnosticCard
              key={key}
              finding={finding}
              findingKey={key}
              isStepChecked={isChecked}
              onToggleStep={toggle}
              completedCount={getCompletedCount(
                key,
                finding.guidance.investigation_steps.length
              )}
              onAskMentor={onAskMentor}
            />
          ))}
        </motion.div>
      )}
    </section>
  );
}
