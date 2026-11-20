import { useCallback, useState } from "react";
import { LayoutGroup, MotionConfig, motion } from "framer-motion";
import { MessageSquare, Webhook } from "lucide-react";
import { AnalyticsBentoGrid } from "./components/AnalyticsBentoGrid";
import type { ViewMode } from "./components/ExportFormatToggle";
import { FindingsList } from "./components/FindingsList";
import { RepoPipelineHeader } from "./components/RepoPipelineHeader";
import { SocraticMentorDrawer } from "./components/SocraticMentorDrawer";
import { WebhookAppModal } from "./components/WebhookAppModal";
import { useAnalyzeStream } from "./hooks/useAnalyzeStream";
import { formatRepoSlug } from "./lib/derive";
import { APPLE_SPRING } from "./lib/motion";
import type {
  ActiveFilters,
  Category,
  DiagnosticFinding,
  Severity
} from "./types/analysis";
import styles from "./App.module.css";

const EMPTY_FILTERS: ActiveFilters = {
  file: null,
  severity: null,
  category: null
};

export function App() {
  const stream = useAnalyzeStream();
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] =
    useState<DiagnosticFinding | null>(null);

  const handleSubmitRepo = useCallback(
    (repoUrl: string) => {
      setFilters(EMPTY_FILTERS);
      setViewMode("dashboard");
      setDrawerOpen(false);
      setSelectedFinding(null);
      void stream.analyze(repoUrl);
    },
    [stream]
  );

  const handleReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setViewMode("dashboard");
    setDrawerOpen(false);
    setWebhookModalOpen(false);
    setSelectedFinding(null);
    stream.reset();
  }, [stream]);

  const handleAskMentor = useCallback((finding: DiagnosticFinding | null) => {
    setSelectedFinding(finding);
    setDrawerOpen(true);
  }, []);

  const handleSelectFile = useCallback((file: string | null) => {
    setFilters((prev) => ({ ...prev, file }));
  }, []);

  const handleSelectSeverity = useCallback((severity: Severity | null) => {
    setFilters((prev) => ({ ...prev, severity }));
  }, []);

  const handleSelectCategory = useCallback((category: Category | null) => {
    setFilters((prev) => ({ ...prev, category }));
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);

  const handleReanalyzeCurrent = useCallback(() => {
    if (stream.repoUrl) {
      void stream.analyze(stream.repoUrl);
    }
  }, [stream]);

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.shell}>
        <LayoutGroup>
          <RepoPipelineHeader
            stage={stream.stage}
            progress={stream.progress}
            statusMessage={stream.statusMessage}
            transport={stream.transport}
            completedTiers={stream.completedTiers}
            selectedFiles={stream.selectedFiles}
            activeFile={filters.file}
            error={stream.error}
            isRunning={stream.isRunning}
            hasResult={Boolean(stream.result)}
            formattedText={stream.result?.formatted_text ?? ""}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onSubmitRepo={handleSubmitRepo}
            onCancel={stream.cancel}
            onReset={handleReset}
            onSelectFile={handleSelectFile}
            onOpenWebhookModal={() => setWebhookModalOpen(true)}
          />
        </LayoutGroup>

        {stream.stage !== "idle" && (
          <main className={styles.main}>
            {/* Live Running Telemetry Preview before Final Report arrives */}
            {stream.isRunning && !stream.result && (
              <motion.section
                className={styles.runningGrid}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={APPLE_SPRING}
                aria-label="Live audit telemetry"
              >
                <div className={styles.runningCard}>
                  <span className={styles.runningLabel}>Overall Health</span>
                  <span className={styles.runningValue}>
                    {stream.liveScores.overall !== null
                      ? `${stream.liveScores.overall}`
                      : "--"}
                  </span>
                  <span className={styles.runningPending}>
                    {stream.liveScores.overall !== null
                      ? "Synthesized"
                      : "Pending 20B Mentor"}
                  </span>
                </div>

                <div className={styles.runningCard}>
                  <span className={styles.runningLabel}>Security Audit</span>
                  <span className={styles.runningValue}>
                    {stream.liveScores.security !== null
                      ? `${stream.liveScores.security}`
                      : "--"}
                  </span>
                  <span className={styles.runningPending}>
                    {stream.completedTiers.security
                      ? "120B Security Complete"
                      : "Auditing with 120B"}
                  </span>
                </div>

                <div className={styles.runningCard}>
                  <span className={styles.runningLabel}>Architecture &amp; Syntax</span>
                  <span className={styles.runningValue}>
                    {stream.liveScores.architecture !== null
                      ? `${stream.liveScores.architecture}`
                      : "--"}
                  </span>
                  <span className={styles.runningPending}>
                    {stream.completedTiers.architecture
                      ? "120B Architecture Complete"
                      : "Auditing with 120B"}
                  </span>
                </div>

                <div className={styles.runningCard}>
                  <span className={styles.runningLabel}>Classified Files</span>
                  <span className={styles.runningValue}>
                    {stream.selectedFiles.length}
                  </span>
                  <span className={styles.runningPending}>
                    {stream.completedTiers.classifier
                      ? "8B Scope Locked"
                      : "Scanning tree"}
                  </span>
                </div>
              </motion.section>
            )}

            {/* Complete Results */}
            {stream.result && (
              <>
                <div className={styles.repoHeadingBar}>
                  <span className={styles.repoSlug}>
                    {formatRepoSlug(stream.result.repo_url)}
                  </span>
                  <div className={styles.repoActions}>
                    <button
                      type="button"
                      className={styles.openMentorBtn}
                      onClick={() => setWebhookModalOpen(true)}
                    >
                      <Webhook size={14} strokeWidth={1.5} />
                      <span>Add GitHub App</span>
                    </button>
                    <button
                      type="button"
                      className={styles.openMentorBtn}
                      onClick={() => handleAskMentor(null)}
                    >
                      <MessageSquare size={14} strokeWidth={1.5} />
                      <span>Ask Mentor</span>
                    </button>
                  </div>
                </div>

                {viewMode === "dashboard" ? (
                  <>
                    <AnalyticsBentoGrid
                      result={stream.result}
                      filters={filters}
                      onSelectSeverity={handleSelectSeverity}
                      onSelectCategory={handleSelectCategory}
                      onSelectFile={handleSelectFile}
                    />

                    <FindingsList
                      findings={stream.result.final_report.findings}
                      threadId={stream.result.thread_id}
                      filters={filters}
                      onClearFile={() => handleSelectFile(null)}
                      onClearSeverity={() => handleSelectSeverity(null)}
                      onClearCategory={() => handleSelectCategory(null)}
                      onClearAll={handleClearAllFilters}
                      onAskMentor={(f) => handleAskMentor(f)}
                    />
                  </>
                ) : (
                  <motion.section
                    className={styles.plainTextCard}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={APPLE_SPRING}
                    aria-label="Plain text report"
                  >
                    <div className={styles.plainTextHeader}>
                      <span className="mono">formatted_text</span>
                      <span className="tabular">
                        {stream.result.formatted_text.length.toLocaleString()} chars
                      </span>
                    </div>
                    <pre className={styles.plainTextPre}>
                      {stream.result.formatted_text}
                    </pre>
                  </motion.section>
                )}
              </>
            )}
          </main>
        )}

        <SocraticMentorDrawer
          open={drawerOpen}
          threadId={stream.threadId}
          finding={selectedFinding}
          onClose={() => setDrawerOpen(false)}
          onReanalyze={handleReanalyzeCurrent}
        />

        <WebhookAppModal
          open={webhookModalOpen}
          repoUrl={stream.result?.repo_url ?? (stream.repoUrl || null)}
          onClose={() => setWebhookModalOpen(false)}
        />
      </div>
    </MotionConfig>
  );
}

export default App;
