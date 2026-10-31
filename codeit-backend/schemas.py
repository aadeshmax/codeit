from typing import TypedDict, List, Literal, Optional
from pydantic import BaseModel, Field

# Agent 1 Output: Security Audit (120B)
class SecurityIssue(BaseModel):
    file_path: str
    line_number: Optional[int] = Field(None, description="Starting line number of the vulnerability")
    code_snippet: Optional[str] = Field(None, description="Offending code snippet")
    severity: Literal["Low", "Medium", "High", "Critical"]
    vulnerability: str = Field(description="Technical flaw identified (e.g. CWE-798, SQL Injection)")
    impact: Optional[str] = Field(None, description="Blast radius and security risk if exploited")

class SecurityAudit(BaseModel):
    issues: List[SecurityIssue]
    security_score: int = Field(description="0 to 100")

# Agent 2 Output: Architecture & Efficiency Audit (120B)
class ArchBottleneck(BaseModel):
    file_path: str
    line_number: Optional[int] = Field(None, description="Starting line number of the bottleneck")
    code_snippet: Optional[str] = Field(None, description="Offending code snippet")
    category: Literal["Architecture", "Complexity", "Modularity", "Async/IO"]
    flaw: str = Field(description="Structural or efficiency issue identified")
    impact: Optional[str] = Field(None, description="Impact on latency, scalability, or maintainability")

class ArchitectureAudit(BaseModel):
    bottlenecks: List[ArchBottleneck]
    architecture_score: int = Field(description="0 to 100")

# Agent 3: The Sweet Spot - Full Diagnostic Metadata + Socratic Guidance (20B)
class DiagnosticMetadata(BaseModel):
    file_path: str
    line_start: Optional[int] = Field(None, description="Starting line number of the offending code")
    line_end: Optional[int] = Field(None, description="Ending line number of the offending code")
    code_snippet: str = Field(description="Exact code excerpt from the repository")
    flaw_type: str = Field(description="Precise technical flaw name, CWE ID, or anti-pattern")
    severity: Literal["Low", "Medium", "High", "Critical"]
    impact_analysis: str = Field(description="Why this matters in production: operational failure mode or security risk")
    standards_ref: Optional[str] = Field(None, description="OWASP, CWE, PEP, or official documentation reference")

class SocraticGuidance(BaseModel):
    conceptual_direction: str = Field(description="Core engineering concept or design pattern needed to solve it")
    guiding_question: str = Field(description="Thought-provoking Socratic question that sparks the insight without writing the code")
    investigation_steps: List[str] = Field(description="Step-by-step checklist of what to inspect, test, or trace")
    verification_challenge: str = Field(description="Edge case test scenario to prove the fix works")

class FullDiagnosticFinding(BaseModel):
    category: Literal["Security", "Architecture", "Efficiency"]
    diagnostic: DiagnosticMetadata
    guidance: SocraticGuidance

class FinalMentorReport(BaseModel):
    overall_score: int
    security_score: int
    architecture_score: int
    summary: str
    findings: List[FullDiagnosticFinding] = Field(
        default_factory=list,
        description="Findings pairing full diagnostic metadata with Socratic guidance"
    )
    # Backward compatibility
    hints: Optional[List[dict]] = Field(default_factory=list)

# Shared Graph State (Saved across checkpoints under thread_id)
class CodeItState(TypedDict, total=False):
    thread_id: str
    repo_url: str
    code_context: str
    selected_files: List[str]
    security_audit: dict
    architecture_audit: dict
    final_report: dict
    # Fields for Stuck Student Follow-Up Node
    student_question: Optional[str]
    chat_history: Optional[List[dict]]
    stuck_response: Optional[dict]

# API Request & Response Schemas
class AnalyzeRequest(BaseModel):
    repo_url: str = Field(..., description="Public GitHub repository URL", example="https://github.com/pallets/flask")
    thread_id: Optional[str] = Field(None, description="Optional custom thread ID for checkpoint tracking")

class AnalyzeResponse(BaseModel):
    status: str
    thread_id: str
    repo_url: str
    formatted_text: str = Field(description="Ready-to-display human readable markdown/text report for the web frontend")
    selected_files: List[str] = []
    security_audit: SecurityAudit
    architecture_audit: ArchitectureAudit
    final_report: FinalMentorReport

# Stuck Student Schemas (Follow-up Node)
class StuckStudentRequest(BaseModel):
    thread_id: str = Field(..., description="Thread ID returned from /api/analyze to restore state checkpoint", example="42b87f2e-13a8-444a-a035-7c08272f3d61")
    question: str = Field(
        ...,
        description="The student's question or description of where they got stuck",
        example="I tried using os.getenv() in auth.py but it still returns None, what am I missing?"
    )

class StuckGuidance(BaseModel):
    diagnosis: str = Field(description="Diagnostic analysis of why the student's attempt produced the error or unexpected behavior")
    socratic_question: str = Field(description="A targeted Socratic question pointing them to what needs fixing without writing the code")
    investigation_steps: List[str] = Field(default_factory=list, description="Actionable debugging steps for the student to run in their environment")
    verification_challenge: Optional[str] = Field(None, description="Verification challenge to test once fixed")

class StuckStudentResponse(BaseModel):
    status: str
    thread_id: str
    question: str
    formatted_text: str = Field(description="Ready-to-display human readable markdown/text coaching reply for the frontend")
    guidance: StuckGuidance
    chat_history: List[dict]

class WebhookResponse(BaseModel):
    status: str
    event: str
    thread_id: Optional[str] = None
    repo_url: Optional[str] = None
    delivery_id: Optional[str] = None
    message: str
    github_action_taken: Optional[str] = None
    analysis: Optional[AnalyzeResponse] = None
