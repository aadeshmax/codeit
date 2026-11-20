import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  MessageSquare,
  RotateCcw,
  SendHorizontal,
  X
} from "lucide-react";
import { ApiError, postStuckStudent } from "../lib/api";
import { formatLineBadge } from "../lib/derive";
import { SHEET_SPRING } from "../lib/motion";
import type { ChatTurn, DiagnosticFinding } from "../types/analysis";
import styles from "./SocraticMentorDrawer.module.css";

interface SocraticMentorDrawerProps {
  open: boolean;
  threadId: string | null;
  finding: DiagnosticFinding | null;
  onClose: () => void;
  onReanalyze: () => void;
}

export function SocraticMentorDrawer({
  open,
  threadId,
  finding,
  onClose,
  onReanalyze
}: SocraticMentorDrawerProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastThreadRef = useRef<string | null>(null);

  // Reset conversation when switching to a brand new analysis thread
  useEffect(() => {
    if (threadId !== lastThreadRef.current) {
      lastThreadRef.current = threadId;
      setHistory([]);
      setError(null);
      setSessionExpired(false);
    }
  }, [threadId]);

  // Pre-seed context prompt when user opens drawer from a specific finding
  useEffect(() => {
    if (open && finding) {
      const loc = formatLineBadge(
        finding.diagnostic.line_start,
        finding.diagnostic.line_end
      );
      setQuestion(
        `Regarding ${finding.diagnostic.file_path} (${loc}): `
      );
      setError(null);
    }
  }, [open, finding]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, submitting]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendQuestion = async () => {
    const trimmed = question.trim();
    if (!trimmed || !threadId || submitting) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmitting(true);
    setError(null);
    setSessionExpired(false);
    setHistory((prev) => [...prev, { role: "student", content: trimmed }]);
    setQuestion("");

    try {
      const res = await postStuckStudent(threadId, trimmed, controller.signal);
      if (controller.signal.aborted) return;

      if (res.chat_history && res.chat_history.length > 0) {
        setHistory(res.chat_history);
      } else {
        setHistory((prev) => [
          ...prev,
          { role: "mentor", guidance: res.guidance }
        ]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiError && err.status === 404) {
        setSessionExpired(true);
        setError(
          "Checkpoint session expired after server restart. Re-run analysis to restore context."
        );
      } else {
        setError(
          err instanceof Error ? err.message : "Unable to reach Mentor endpoint."
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendQuestion();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="mentor-backdrop"
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.aside
            key="mentor-sheet"
            className={styles.drawer}
            initial={{ x: "100%" }}
            animate={{ x: "0%" }}
            exit={{ x: "100%" }}
            transition={SHEET_SPRING}
            role="dialog"
            aria-modal="true"
            aria-label="Socratic Mentor"
          >
            <div className={styles.header}>
              <div className={styles.headerTitleGroup}>
                <h2 className={styles.headerTitle}>Ask Mentor</h2>
                {threadId && (
                  <span className={styles.headerSub}>
                    Checkpoint {threadId.slice(0, 8)} · No repository re-scan
                  </span>
                )}
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close Mentor drawer"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {finding && (
              <div className={styles.contextBanner}>
                <div className={styles.contextMeta}>
                  <span>{finding.diagnostic.file_path}</span>
                  <span>
                    {formatLineBadge(
                      finding.diagnostic.line_start,
                      finding.diagnostic.line_end
                    )}
                  </span>
                </div>
                <div className={styles.contextFlaw}>
                  {finding.diagnostic.flaw_type}
                </div>
                <div className={styles.contextHint}>
                  {finding.guidance.guiding_question}
                </div>
              </div>
            )}

            <div className={styles.messages}>
              {history.length === 0 && !submitting && !error && (
                <div className={styles.emptyThread}>
                  <MessageSquare size={22} strokeWidth={1.5} />
                  <p>
                    Describe what you attempted or where you are stuck. The
                    mentor reads your saved LangGraph checkpoint directly.
                  </p>
                </div>
              )}

              {history.map((turn, idx) =>
                turn.role === "student" ? (
                  <div key={idx} className={styles.studentBubble}>
                    {turn.content}
                  </div>
                ) : (
                  <div key={idx} className={styles.mentorCard}>
                    <div>
                      <div className={styles.blockLabel}>Diagnosis</div>
                      <p className={styles.diagnosisText}>
                        {turn.guidance.diagnosis}
                      </p>
                    </div>

                    <div className={styles.socraticBox}>
                      <div className={styles.blockLabel}>Socratic Question</div>
                      <p>{turn.guidance.socratic_question}</p>
                    </div>

                    {turn.guidance.investigation_steps.length > 0 && (
                      <div>
                        <div className={styles.blockLabel}>
                          Investigation Steps
                        </div>
                        <ol className={styles.stepsList}>
                          {turn.guidance.investigation_steps.map((s, sIdx) => (
                            <li key={sIdx}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {turn.guidance.verification_challenge && (
                      <div>
                        <div className={styles.blockLabel}>
                          Verification Challenge
                        </div>
                        <p className={styles.challengeText}>
                          {turn.guidance.verification_challenge}
                        </p>
                      </div>
                    )}
                  </div>
                )
              )}

              {submitting && (
                <div className={styles.pendingState}>
                  <span>Querying checkpoint state...</span>
                </div>
              )}

              {error && (
                <div className={styles.errorBox} role="alert">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={15} strokeWidth={1.5} color="#FF453A" />
                    <span>{error}</span>
                  </div>
                  {sessionExpired && (
                    <button
                      type="button"
                      className={styles.reanalyzeBtn}
                      onClick={() => {
                        onClose();
                        onReanalyze();
                      }}
                    >
                      <RotateCcw size={13} strokeWidth={1.5} />
                      <span>Re-run Analysis</span>
                    </button>
                  )}
                </div>
              )}

              <div ref={listEndRef} />
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <div className={styles.inputRow}>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Describe what you tried and what happened..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={submitting || !threadId}
                />
                <button
                  type="submit"
                  className={styles.sendBtn}
                  disabled={submitting || !question.trim() || !threadId}
                  aria-label="Send question"
                >
                  <SendHorizontal size={15} strokeWidth={1.5} />
                </button>
              </div>
              <span className={styles.composerHint}>
                Enter to send · Shift+Enter for new line · Powered by POST /api/student/stuck
              </span>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
