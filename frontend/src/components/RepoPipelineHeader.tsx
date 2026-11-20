import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cpu,
  GitBranch,
  Layers,
  Shield,
  Square,
  Terminal,
  Webhook
} from "lucide-react";
import type { CompletedTiers } from "../hooks/useAnalyzeStream";
import { APPLE_SPRING } from "../lib/motion";
import type { PipelineStage, TransportMode } from "../types/analysis";
import { ExportFormatToggle, type ViewMode } from "./ExportFormatToggle";
import { FileChips } from "./FileChips";
import styles from "./RepoPipelineHeader.module.css";

interface RepoPipelineHeaderProps {
  stage: PipelineStage;
  progress: number;
  statusMessage: string;
  transport: TransportMode;
  completedTiers: CompletedTiers;
  selectedFiles: string[];
  activeFile: string | null;
  error: string | null;
  isRunning: boolean;
  hasResult: boolean;
  formattedText: string;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onSubmitRepo: (repoUrl: string) => void;
  onCancel: () => void;
  onReset: () => void;
  onSelectFile: (filePath: string | null) => void;
  onOpenWebhookModal: () => void;
}

export function RepoPipelineHeader({
  stage,
  progress,
  statusMessage,
  transport,
  completedTiers,
  selectedFiles,
  activeFile,
  error,
  isRunning,
  hasResult,
  formattedText,
  viewMode,
  onChangeViewMode,
  onSubmitRepo,
  onCancel,
  onReset,
  onSelectFile,
  onOpenWebhookModal
}: RepoPipelineHeaderProps) {
  const [inputValue, setInputValue] = useState("");
  const isCompact = stage !== "idle";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSubmitRepo(trimmed);
  };

  const tier1Done = completedTiers.classifier;
  const tier1Active = stage === "connecting" || stage === "classifying";

  const tier2Done = completedTiers.security && completedTiers.architecture;
  const tier2Active = stage === "auditing" && !tier2Done;

  const tier3Done = completedTiers.mentor || stage === "complete";
  const tier3Active =
    (stage === "synthesizing" || (stage === "auditing" && tier2Done)) && !tier3Done;

  const formNode = (
    <motion.form
      layoutId="repo-bar"
      transition={APPLE_SPRING}
      className={styles.repoBar}
      onSubmit={handleSubmit}
    >
      <GitBranch size={16} strokeWidth={1.5} className={styles.repoIcon} />
      <input
        type="url"
        className={styles.repoInput}
        placeholder="https://github.com/owner/repository"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        aria-label="GitHub repository URL"
        required
      />
      {isRunning ? (
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          <Square size={12} strokeWidth={1.5} />
          <span>Stop</span>
        </button>
      ) : (
        <button
          type="submit"
          className={styles.analyzeBtn}
          disabled={!inputValue.trim()}
        >
          <span>{isCompact ? "Analyze" : "Analyze Repository"}</span>
          <ArrowRight size={14} strokeWidth={1.5} />
        </button>
      )}
    </motion.form>
  );

  if (!isCompact) {
    return (
      <section className={styles.heroContainer} aria-label="Analyze repository">
        <div className={styles.heroBrand}>
          <Terminal size={13} strokeWidth={1.5} />
          <span>CodeIt Telemetry Engine</span>
        </div>

        <h1 className={styles.heroTitle}>Repository Diagnostics</h1>
        <p className={styles.heroSubtitle}>
          Multi-tier static, security, architecture, and syntax inspection with
          line-accurate metadata and Socratic mentorship.
        </p>

        <div className={styles.heroFormWrap}>{formNode}</div>

        <div className={styles.heroMeta}>
          <span className={styles.heroMetaItem}>
            <Cpu size={13} strokeWidth={1.5} />
            <span>8B Classifier</span>
          </span>
          <span className={styles.heroMetaItem}>
            <Shield size={13} strokeWidth={1.5} />
            <span>120B Security &amp; Architecture</span>
          </span>
          <span className={styles.heroMetaItem}>
            <Layers size={13} strokeWidth={1.5} />
            <span>20B Socratic Mentor</span>
          </span>
        </div>

        <div className={styles.heroWebhookWrap}>
          <button
            type="button"
            className={styles.heroWebhookBtn}
            onClick={onOpenWebhookModal}
          >
            <Webhook size={14} strokeWidth={1.5} />
            <span>Connect GitHub App Webhook</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <header className={styles.stickyHeader}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.brandBtn}
            onClick={onReset}
            title="Return to repository input"
          >
            <Terminal size={16} strokeWidth={1.5} />
            <span>CodeIt</span>
          </button>

          <div className={styles.compactFormWrap}>{formNode}</div>

          {hasResult && (
            <div className={styles.headerRight}>
              <ExportFormatToggle
                mode={viewMode}
                onChangeMode={onChangeViewMode}
                formattedText={formattedText}
              />
            </div>
          )}
        </div>

        {/* Razor-thin 2px SSE Progress Line */}
        <div className={styles.progressTrack} aria-hidden="true">
          <motion.div
            className={styles.progressFill}
            initial={{ scaleX: 0 }}
            animate={{
              scaleX: Math.min(1, Math.max(0, progress / 100)),
              opacity: stage === "complete" ? 0 : 1
            }}
            transition={APPLE_SPRING}
          />
        </div>
      </header>

      <div className={styles.pipelineStrip}>
        <div className={styles.stepperRow}>
          <div className={styles.tiers} role="status" aria-live="polite">
            <span
              className={`${styles.tierPill} ${
                tier1Done
                  ? styles.tierPillDone
                  : tier1Active
                    ? styles.tierPillActive
                    : ""
              }`}
            >
              {tier1Done ? (
                <CheckCircle2 size={13} strokeWidth={1.5} className={styles.tierDoneIcon} />
              ) : (
                <Circle
                  size={13}
                  strokeWidth={1.5}
                  className={tier1Active ? styles.tierActiveIcon : undefined}
                />
              )}
              <span>8B Classifier</span>
            </span>

            <ChevronRight size={13} strokeWidth={1.5} className={styles.tierArrow} />

            <span
              className={`${styles.tierPill} ${
                tier2Done
                  ? styles.tierPillDone
                  : tier2Active
                    ? styles.tierPillActive
                    : ""
              }`}
            >
              {tier2Done ? (
                <CheckCircle2 size={13} strokeWidth={1.5} className={styles.tierDoneIcon} />
              ) : (
                <Circle
                  size={13}
                  strokeWidth={1.5}
                  className={tier2Active ? styles.tierActiveIcon : undefined}
                />
              )}
              <span>120B Security &amp; Architecture</span>
            </span>

            <ChevronRight size={13} strokeWidth={1.5} className={styles.tierArrow} />

            <span
              className={`${styles.tierPill} ${
                tier3Done
                  ? styles.tierPillDone
                  : tier3Active
                    ? styles.tierPillActive
                    : ""
              }`}
            >
              {tier3Done ? (
                <CheckCircle2 size={13} strokeWidth={1.5} className={styles.tierDoneIcon} />
              ) : (
                <Circle
                  size={13}
                  strokeWidth={1.5}
                  className={tier3Active ? styles.tierActiveIcon : undefined}
                />
              )}
              <span>20B Mentor</span>
            </span>
          </div>

          <div className={styles.statusMeta}>
            <span className={styles.statusText}>{statusMessage}</span>
            <span className={styles.progressPct}>{progress}%</span>
            <span className={styles.transportTag}>{transport}</span>
          </div>
        </div>

        <FileChips
          files={selectedFiles}
          activeFile={activeFile}
          onSelectFile={onSelectFile}
        />
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <div className={styles.errorCard}>
            <div className={styles.errorLeft}>
              <AlertCircle size={16} strokeWidth={1.5} className={styles.errorIcon} />
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
