import { API_BASE_URL } from "../config";
import type { AnalysisResult, MentorResponse } from "../types/analysis";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown; message?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Non-JSON error body
  }
  return `Request failed with status ${res.status}`;
}

export async function postAnalyze(
  repoUrl: string,
  signal?: AbortSignal,
  threadId?: string
): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo_url: repoUrl,
      ...(threadId ? { thread_id: threadId } : {})
    }),
    signal
  });

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }

  return (await res.json()) as AnalysisResult;
}

export async function postStuckStudent(
  threadId: string,
  question: string,
  signal?: AbortSignal
): Promise<MentorResponse> {
  const res = await fetch(`${API_BASE_URL}/api/student/stuck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      question
    }),
    signal
  });

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorDetail(res));
  }

  return (await res.json()) as MentorResponse;
}
