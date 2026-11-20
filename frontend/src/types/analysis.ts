export type Severity = "Low" | "Medium" | "High" | "Critical";

export type Category = "Security" | "Architecture" | "Efficiency" | "Syntax";

export type BottleneckCategory =
  | "Architecture"
  | "Complexity"
  | "Modularity"
  | "Async/IO"
  | "Syntax";

export interface SecurityIssue {
  file_path: string;
  line_number: number | null;
  code_snippet: string | null;
  severity: Severity;
  vulnerability: string;
  impact: string | null;
}

export interface SecurityAudit {
  issues: SecurityIssue[];
  security_score: number;
}

export interface ArchBottleneck {
  file_path: string;
  line_number: number | null;
  code_snippet: string | null;
  category: BottleneckCategory;
  flaw: string;
  impact: string | null;
}

export interface ArchitectureAudit {
  bottlenecks: ArchBottleneck[];
  architecture_score: number;
}

export interface DiagnosticMetadata {
  file_path: string;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string;
  flaw_type: string;
  severity: Severity;
  impact_analysis: string;
  standards_ref: string | null;
}

export interface SocraticGuidance {
  conceptual_direction: string;
  guiding_question: string;
  investigation_steps: string[];
  verification_challenge: string;
}

export interface DiagnosticFinding {
  category: Category;
  diagnostic: DiagnosticMetadata;
  guidance: SocraticGuidance;
}

export interface FinalMentorReport {
  overall_score: number;
  security_score: number;
  architecture_score: number;
  efficiency_score?: number | null;
  syntax_score?: number | null;
  summary: string;
  findings: DiagnosticFinding[];
  hints?: Record<string, unknown>[];
}

export interface AnalysisResult {
  status: string;
  thread_id: string;
  repo_url: string;
  formatted_text: string;
  selected_files: string[];
  security_audit: SecurityAudit;
  architecture_audit: ArchitectureAudit;
  final_report: FinalMentorReport;
}

export interface StuckGuidance {
  diagnosis: string;
  socratic_question: string;
  investigation_steps: string[];
  verification_challenge: string | null;
}

export type ChatTurn =
  | { role: "student"; content: string }
  | { role: "mentor"; guidance: StuckGuidance };

export interface MentorResponse {
  status: string;
  thread_id: string;
  question: string;
  formatted_text: string;
  guidance: StuckGuidance;
  chat_history: ChatTurn[];
}

export interface StreamAccumulatorPayload {
  thread_id: string;
  code_context?: string;
  selected_files?: string[];
  security_audit?: SecurityAudit;
  architecture_audit?: ArchitectureAudit;
  final_report?: FinalMentorReport;
  formatted_text?: string;
}

export type SSEEvent =
  | {
      event: "start";
      thread_id: string;
      repo_url: string;
      progress: number;
      message: string;
    }
  | {
      event: "classifying_files";
      model: string;
      progress: number;
      message: string;
    }
  | {
      event: "files_classified";
      model: string;
      selected_files: string[];
      progress: number;
      message: string;
    }
  | {
      event: "audits_started";
      model: string;
      progress: number;
      message: string;
    }
  | {
      event: "security_audit_complete";
      model: string;
      security_score?: number;
      issues_detected?: number;
      audit?: SecurityAudit;
      progress: number;
      message?: string;
    }
  | {
      event: "architecture_audit_complete";
      model: string;
      architecture_score?: number;
      bottlenecks_detected?: number;
      audit?: ArchitectureAudit;
      progress: number;
      message?: string;
    }
  | {
      event: "mentor_synthesis_complete";
      model: string;
      overall_score?: number;
      findings_count?: number;
      final_report?: FinalMentorReport;
      progress: number;
      message?: string;
    }
  | {
      event: "complete";
      status: string;
      thread_id: string;
      progress: number;
      formatted_text?: string;
      result: StreamAccumulatorPayload;
    }
  | {
      event: "error";
      message: string;
    };

export type PipelineStage =
  | "idle"
  | "connecting"
  | "classifying"
  | "auditing"
  | "synthesizing"
  | "complete"
  | "error";

export type TransportMode = "sse" | "ws" | "http";

export interface ActiveFilters {
  file: string | null;
  severity: Severity | null;
  category: Category | null;
}
