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
    file_path: Optional[str] = Field("N/A", description="Exact relative path")
    line_start: Optional[int] = Field(None, description="Starting line number of the offending code")
    line_end: Optional[int] = Field(None, description="Ending line number of the offending code")
    code_snippet: Optional[str] = Field("", description="Exact code excerpt from the repository")
    flaw_type: Optional[str] = Field("Flaw identified", description="Precise technical flaw name, CWE ID, or anti-pattern")
    severity: Optional[Literal["Low", "Medium", "High", "Critical"]] = Field("Medium", description="Severity level")
    impact_analysis: Optional[str] = Field("Potential impact on security, performance, or maintainability.", description="Why this matters in production")
    standards_ref: Optional[str] = Field(None, description="OWASP, CWE, PEP, or official documentation reference")

class SocraticGuidance(BaseModel):
    conceptual_direction: Optional[str] = Field("Review relevant design patterns and best practices.", description="Core engineering concept or design pattern needed to solve it")
    guiding_question: Optional[str] = Field("How can this code be refactored to eliminate the flaw while preserving intended functionality?", description="Thought-provoking Socratic question")
    investigation_steps: List[str] = Field(default_factory=list, description="Step-by-step checklist of what to inspect, test, or trace")
    verification_challenge: Optional[str] = Field("Write a unit test covering this scenario to verify the fix.", description="Edge case test scenario to prove the fix works")

class FullDiagnosticFinding(BaseModel):
    category: Optional[Literal["Security", "Architecture", "Efficiency"]] = Field("Security")
    diagnostic: DiagnosticMetadata = Field(default_factory=DiagnosticMetadata)
    guidance: SocraticGuidance = Field(default_factory=SocraticGuidance)

class FinalMentorReport(BaseModel):
    overall_score: int = 100
    security_score: int = 100
    architecture_score: int = 100
    summary: str = "Audit completed successfully."
    findings: List[FullDiagnosticFinding] = Field(
        default_factory=list,
        description="Findings pairing full diagnostic metadata with Socratic guidance"
    )
    # Backward compatibility
    hints: Optional[List[dict]] = Field(default_factory=list)

# Shared Graph State
class CodeItState(TypedDict, total=False):
    repo_url: str
    code_context: str
    selected_files: List[str]
    security_audit: dict
    architecture_audit: dict
    final_report: dict

# API Request & Response Schemas
class AnalyzeRequest(BaseModel):
    repo_url: str = Field(..., description="Public GitHub repository URL", example="https://github.com/pallets/flask")

class AnalyzeResponse(BaseModel):
    status: str
    repo_url: str
    selected_files: List[str] = []
    security_audit: SecurityAudit
    architecture_audit: ArchitectureAudit
    final_report: FinalMentorReport

class WebhookResponse(BaseModel):
    status: str
    event: str
    repo_url: Optional[str] = None
    delivery_id: Optional[str] = None
    message: str
    github_action_taken: Optional[str] = None
    analysis: Optional[AnalyzeResponse] = None
