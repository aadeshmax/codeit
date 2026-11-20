import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, getWebSocketUrl } from "../config";
import { ApiError, postAnalyze } from "../lib/api";
import type {
  AnalysisResult,
  ArchitectureAudit,
  FinalMentorReport,
  PipelineStage,
  SecurityAudit,
  SSEEvent,
  StreamAccumulatorPayload,
  TransportMode
} from "../types/analysis";

export interface CompletedTiers {
  classifier: boolean;
  security: boolean;
  architecture: boolean;
  mentor: boolean;
}

export interface AnalyzeStreamState {
  stage: PipelineStage;
  progress: number;
  statusMessage: string;
  selectedFiles: string[];
  threadId: string | null;
  repoUrl: string;
  result: AnalysisResult | null;
  error: string | null;
  transport: TransportMode;
  completedTiers: CompletedTiers;
  liveScores: {
    security: number | null;
    architecture: number | null;
    overall: number | null;
  };
}

const INITIAL_TIERS: CompletedTiers = {
  classifier: false,
  security: false,
  architecture: false,
  mentor: false
};

const INITIAL_STATE: AnalyzeStreamState = {
  stage: "idle",
  progress: 0,
  statusMessage: "",
  selectedFiles: [],
  threadId: null,
  repoUrl: "",
  result: null,
  error: null,
  transport: "sse",
  completedTiers: INITIAL_TIERS,
  liveScores: { security: null, architecture: null, overall: null }
};

function normalizeStreamResult(
  repoUrl: string,
  threadId: string,
  acc: StreamAccumulatorPayload,
  topLevelFormattedText?: string
): AnalysisResult {
  const securityAudit: SecurityAudit = acc.security_audit ?? {
    issues: [],
    security_score: acc.final_report?.security_score ?? 100
  };
  const architectureAudit: ArchitectureAudit = acc.architecture_audit ?? {
    bottlenecks: [],
    architecture_score: acc.final_report?.architecture_score ?? 100
  };
  const finalReport: FinalMentorReport = acc.final_report ?? {
    overall_score: Math.round(
      (securityAudit.security_score + architectureAudit.architecture_score) / 2
    ),
    security_score: securityAudit.security_score,
    architecture_score: architectureAudit.architecture_score,
    summary: "Analysis completed.",
    findings: []
  };

  return {
    status: "success",
    thread_id: acc.thread_id || threadId,
    repo_url: repoUrl,
    formatted_text:
      topLevelFormattedText ||
      acc.formatted_text ||
      finalReport.summary,
    selected_files: acc.selected_files ?? [],
    security_audit: securityAudit,
    architecture_audit: architectureAudit,
    final_report: finalReport
  };
}

export function useAnalyzeStream() {
  const [state, setState] = useState<AnalyzeStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const applyEvent = useCallback(
    (evt: SSEEvent, activeRepoUrl: string, fallbackThreadId: string): boolean => {
      switch (evt.event) {
        case "start":
          setState((prev) => ({
            ...prev,
            stage: "connecting",
            threadId: evt.thread_id || prev.threadId,
            progress: Math.max(prev.progress, evt.progress || 5),
            statusMessage: evt.message || "Connecting to repository"
          }));
          return false;

        case "classifying_files":
          setState((prev) => ({
            ...prev,
            stage: "classifying",
            progress: Math.max(prev.progress, evt.progress || 20),
            statusMessage: evt.message || "Classifying repository files"
          }));
          return false;

        case "files_classified":
          setState((prev) => ({
            ...prev,
            stage: "auditing",
            selectedFiles: evt.selected_files ?? [],
            progress: Math.max(prev.progress, evt.progress || 35),
            statusMessage: evt.message || "Selected target source files",
            completedTiers: { ...prev.completedTiers, classifier: true }
          }));
          return false;

        case "audits_started":
          setState((prev) => ({
            ...prev,
            stage: "auditing",
            progress: Math.max(prev.progress, evt.progress || 45),
            statusMessage: evt.message || "Running security and architecture audits"
          }));
          return false;

        case "security_audit_complete":
          setState((prev) => ({
            ...prev,
            stage: prev.completedTiers.architecture ? "synthesizing" : "auditing",
            progress: Math.max(prev.progress, evt.progress || 70),
            statusMessage: evt.message || "Security audit complete",
            completedTiers: { ...prev.completedTiers, security: true },
            liveScores: {
              ...prev.liveScores,
              security: evt.security_score ?? evt.audit?.security_score ?? prev.liveScores.security
            }
          }));
          return false;

        case "architecture_audit_complete":
          setState((prev) => ({
            ...prev,
            stage: prev.completedTiers.security ? "synthesizing" : "auditing",
            progress: Math.max(prev.progress, evt.progress || 85),
            statusMessage: evt.message || "Architecture audit complete",
            completedTiers: { ...prev.completedTiers, architecture: true },
            liveScores: {
              ...prev.liveScores,
              architecture:
                evt.architecture_score ??
                evt.audit?.architecture_score ??
                prev.liveScores.architecture
            }
          }));
          return false;

        case "mentor_synthesis_complete":
          setState((prev) => ({
            ...prev,
            stage: "synthesizing",
            progress: Math.max(prev.progress, evt.progress || 95),
            statusMessage: evt.message || "Synthesizing diagnostic guidance",
            completedTiers: { ...prev.completedTiers, mentor: true },
            liveScores: {
              ...prev.liveScores,
              overall:
                evt.overall_score ??
                evt.final_report?.overall_score ??
                prev.liveScores.overall
            }
          }));
          return false;

        case "complete": {
          const normalized = normalizeStreamResult(
            activeRepoUrl,
            evt.thread_id || fallbackThreadId,
            evt.result,
            evt.formatted_text
          );
          setState((prev) => ({
            ...prev,
            stage: "complete",
            progress: 100,
            statusMessage: "Analysis complete",
            threadId: normalized.thread_id,
            selectedFiles:
              normalized.selected_files.length > 0
                ? normalized.selected_files
                : prev.selectedFiles,
            result: normalized,
            error: null,
            completedTiers: {
              classifier: true,
              security: true,
              architecture: true,
              mentor: true
            },
            liveScores: {
              security: normalized.final_report.security_score,
              architecture: normalized.final_report.architecture_score,
              overall: normalized.final_report.overall_score
            }
          }));
          return true;
        }

        case "error":
          setState((prev) => ({
            ...prev,
            stage: "error",
            error: evt.message || "Analysis stream error",
            statusMessage: "Analysis interrupted"
          }));
          return true;

        default:
          return false;
      }
    },
    []
  );

  const runViaWebSocket = useCallback(
    (repoUrl: string, existingThreadId?: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const wsUrl = getWebSocketUrl("/ws/analyze");
        let settled = false;
        let receivedAnyMessage = false;

        try {
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            setState((prev) => ({
              ...prev,
              transport: "ws",
              statusMessage: "Connected via WebSocket"
            }));
            ws.send(
              JSON.stringify({
                repo_url: repoUrl,
                ...(existingThreadId ? { thread_id: existingThreadId } : {})
              })
            );
          };

          ws.onmessage = (msg) => {
            receivedAnyMessage = true;
            try {
              const parsed = JSON.parse(String(msg.data)) as SSEEvent;
              const done = applyEvent(parsed, repoUrl, existingThreadId ?? "");
              if (done && !settled) {
                settled = true;
                ws.close();
                resolve(parsed.event === "complete");
              }
            } catch {
              // Ignore malformed frames
            }
          };

          ws.onerror = () => {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          };

          ws.onclose = () => {
            if (wsRef.current === ws) {
              wsRef.current = null;
            }
            if (!settled) {
              settled = true;
              resolve(receivedAnyMessage);
            }
          };
        } catch {
          resolve(false);
        }
      });
    },
    [applyEvent]
  );

  const runViaSSE = useCallback(
    async (
      repoUrl: string,
      signal: AbortSignal,
      existingThreadId?: string
    ): Promise<"done" | "error_terminal" | "fallback"> => {
      const params = new URLSearchParams({ repo_url: repoUrl });
      if (existingThreadId) {
        params.set("thread_id", existingThreadId);
      }

      const url = `${API_BASE_URL}/api/analyze/stream?${params.toString()}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          signal
        });
      } catch (err) {
        if (signal.aborted) return "done";
        if (err instanceof TypeError) return "fallback";
        return "fallback";
      }

      if (!response.ok) {
        let detail = `Server returned ${response.status}`;
        try {
          const body = (await response.json()) as { detail?: string };
          if (body.detail) detail = body.detail;
        } catch {
          // Ignore non-JSON body
        }
        if (response.status >= 400 && response.status < 500) {
          setState((prev) => ({
            ...prev,
            stage: "error",
            error: detail,
            statusMessage: "Validation error"
          }));
          return "error_terminal";
        }
        return "fallback";
      }

      if (!response.body) {
        return "fallback";
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let finished = false;
      let sawDataFrame = false;

      try {
        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed || trimmed.startsWith(":")) {
              continue;
            }
            const dataLines = trimmed
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());

            if (dataLines.length === 0) continue;
            const rawJson = dataLines.join("\n");
            try {
              const parsed = JSON.parse(rawJson) as SSEEvent;
              sawDataFrame = true;
              const isTerminal = applyEvent(parsed, repoUrl, existingThreadId ?? "");
              if (isTerminal) {
                finished = true;
                break;
              }
            } catch {
              // Skip incomplete frame
            }
          }
        }
      } catch {
        if (signal.aborted) return "done";
        return sawDataFrame ? "error_terminal" : "fallback";
      } finally {
        reader.releaseLock();
      }

      return finished ? "done" : "fallback";
    },
    [applyEvent]
  );

  const analyze = useCallback(
    async (rawRepoUrl: string, existingThreadId?: string) => {
      const repoUrl = rawRepoUrl.trim();
      if (!repoUrl) return;

      cleanup();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        stage: "connecting",
        progress: 5,
        statusMessage: "Opening live telemetry stream",
        selectedFiles: [],
        threadId: existingThreadId ?? null,
        repoUrl,
        result: null,
        error: null,
        transport: "sse",
        completedTiers: INITIAL_TIERS,
        liveScores: { security: null, architecture: null, overall: null }
      });

      // 1. Primary transport: GET /api/analyze/stream (SSE)
      const sseOutcome = await runViaSSE(repoUrl, controller.signal, existingThreadId);
      if (sseOutcome === "done" || sseOutcome === "error_terminal" || controller.signal.aborted) {
        return;
      }

      // 2. Secondary transport: WebSocket /ws/analyze
      const wsOk = await runViaWebSocket(repoUrl, existingThreadId);
      if (wsOk || controller.signal.aborted) {
        return;
      }

      // 3. Final fallback: POST /api/analyze (JSON)
      setState((prev) => ({
        ...prev,
        transport: "http",
        stage: "auditing",
        progress: 50,
        statusMessage: "Running full repository analysis"
      }));

      try {
        const res = await postAnalyze(repoUrl, controller.signal, existingThreadId);
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          stage: "complete",
          progress: 100,
          statusMessage: "Analysis complete",
          threadId: res.thread_id,
          selectedFiles: res.selected_files,
          result: res,
          error: null,
          completedTiers: {
            classifier: true,
            security: true,
            architecture: true,
            mentor: true
          },
          liveScores: {
            security: res.final_report.security_score,
            architecture: res.final_report.architecture_score,
            overall: res.final_report.overall_score
          }
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Analysis request failed";
        setState((prev) => ({
          ...prev,
          stage: "error",
          error: message,
          statusMessage: "Analysis failed"
        }));
      }
    },
    [cleanup, runViaSSE, runViaWebSocket]
  );

  const cancel = useCallback(() => {
    cleanup();
    setState((prev) => ({
      ...prev,
      stage: prev.result ? "complete" : "idle",
      statusMessage: prev.result ? "Analysis complete" : ""
    }));
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState(INITIAL_STATE);
  }, [cleanup]);

  return {
    ...state,
    isRunning:
      state.stage === "connecting" ||
      state.stage === "classifying" ||
      state.stage === "auditing" ||
      state.stage === "synthesizing",
    analyze,
    cancel,
    reset
  };
}
