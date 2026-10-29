import os
import json
import re
from dotenv import load_dotenv
from groq import AsyncGroq
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from schemas import CodeItState, SecurityAudit, ArchitectureAudit, FinalMentorReport

load_dotenv()

def get_groq_api_key() -> str:
    # 1. Environment variable
    api_key = os.getenv("GROQ_API_KEY")
    if api_key and api_key.strip():
        return api_key.strip()
    
    # 2. Check api.txt in common workspace locations
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "..", "api.txt"),
        os.path.join(os.path.dirname(__file__), "api.txt"),
        os.path.join(os.getcwd(), "api.txt"),
        os.path.join(os.getcwd(), "..", "api.txt"),
        r"c:\codeit\api.txt"
    ]
    for path in possible_paths:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                key = f.read().strip()
                if key:
                    os.environ["GROQ_API_KEY"] = key
                    return key
    return ""

api_key = get_groq_api_key()

# Multi-Level Model Architecture
# Level 1: 8B-class model for rapid file classification
CLASSIFIER_MODEL = os.getenv("GROQ_CLASSIFIER_MODEL", "allam-2-7b")

# Level 2: OpenAI OSS 120B for deep security, architecture, and efficiency audits
AUDIT_MODEL = os.getenv("GROQ_AUDIT_MODEL", "openai/gpt-oss-120b")

# Level 3: OpenAI OSS 20B for audit JSON analysis and Socratic mentorship synthesis
MENTOR_MODEL = os.getenv("GROQ_MENTOR_MODEL", "openai/gpt-oss-20b")

# Backward compatibility alias
model_name = AUDIT_MODEL

# Initialized Clients
groq_async_client = AsyncGroq(api_key=api_key if api_key else None)

groq_llm_120b = ChatGroq(
    model=AUDIT_MODEL,
    api_key=api_key if api_key else None,
    temperature=0.1,
    max_retries=2
)

# LEVEL 1: 8B Model File Classifier
async def classify_files_with_8b(candidate_files: list[str]) -> list[str]:
    """Uses the 8B model to classify and pick the top critical files for security & architecture review."""
    if not candidate_files:
        return []
    if len(candidate_files) <= 6:
        return candidate_files

    tree_snippet = "\n".join(candidate_files[:60])
    prompt = f"""You are an elite code auditor. Given this repository file tree:
{tree_snippet}

Select between 3 and 6 of the most critical files to audit for security vulnerabilities, architectural design flaws, and performance/efficiency bottlenecks (such as authentication handlers, API routes, database connections, and main service entry points).
Respond ONLY with a comma-separated list of exact relative file paths from the list above. Do not include explanation or markdown."""

    try:
        res = await groq_async_client.chat.completions.create(
            model=CLASSIFIER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0
        )
        content = res.choices[0].message.content or ""
        # Extract file paths from comma or newline delimited output
        raw_items = [re.sub(r"[`'\"* -]", "", item).strip() for item in re.split(r"[,\n]", content)]
        selected = [item for item in raw_items if item in candidate_files]
        if len(selected) >= 2:
            return selected[:6]
    except Exception as e:
        print(f"Warning: 8B file classification fallback triggered ({e})")
    
    # Fallback heuristic
    return candidate_files[:6]

# LEVEL 2 (AGENT 1): Security & Vulnerability Auditor (OpenAI OSS 120B)
async def security_agent_node(state: CodeItState):
    structured_llm = groq_llm_120b.with_structured_output(SecurityAudit)
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are Agent 1: Security & Vulnerability Auditor powered by OpenAI OSS 120B.
Identify hardcoded secrets, injection flaws, insecure configs, and auth weaknesses in the code.
Inspect the line numbers prefixed in the code context. For every issue found, provide:
- file_path: exact file path
- line_number: exact line number where the flaw occurs
- code_snippet: the exact problematic code snippet
- severity: "Low", "Medium", "High", or "Critical"
- vulnerability: technical vulnerability name (e.g., CWE-798 Hardcoded Credentials)
- impact: blast radius and exploitation risk in a production environment
Return empty issues and a score of 100 if the code is clean."""),
        ("human", "{code_context}")
    ])
    chain = prompt | structured_llm
    res = await chain.ainvoke({"code_context": state["code_context"]})
    return {"security_audit": res.model_dump()}

# LEVEL 2 (AGENT 2): Architecture & Efficiency Auditor (OpenAI OSS 120B)
async def architecture_agent_node(state: CodeItState):
    structured_llm = groq_llm_120b.with_structured_output(ArchitectureAudit)
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are Agent 2: Software Architect & Efficiency Auditor powered by OpenAI OSS 120B.
Identify poor modularity, O(N^2) loops, blocking I/O in async routes, resource leaks, and design flaws.
Inspect the line numbers prefixed in the code context. For every bottleneck found, provide:
- file_path: exact file path
- line_number: exact line number where the bottleneck occurs
- code_snippet: the exact problematic code snippet
- category: "Architecture", "Complexity", "Modularity", or "Async/IO"
- flaw: specific technical description of the bottleneck
- impact: degradation in throughput, latency, or maintainability in production
Return empty bottlenecks and a score of 100 if the code is clean."""),
        ("human", "{code_context}")
    ])
    chain = prompt | structured_llm
    res = await chain.ainvoke({"code_context": state["code_context"]})
    return {"architecture_audit": res.model_dump()}

# LEVEL 3 (AGENT 3): JSON Analysis & Socratic Hint Mentor (OpenAI OSS 20B)
async def mentor_agent_node(state: CodeItState):
    security_audit = state.get("security_audit", {})
    arch_audit = state.get("architecture_audit", {})
    repo_url = state.get("repo_url", "repository")

    prompt = f"""You are Agent 3: The CodeIt Mentor powered by OpenAI OSS 20B.
CORE PEDAGOGICAL PHILOSOPHY:
Giving the user a vague hint is frustrating.
Giving them copy-paste code ruins the learning.
The sweet spot is FULL DIAGNOSTIC METADATA + SOCRATIC GUIDANCE.

Analyze the following two audit JSON outputs for repository: {repo_url}
Security Audit JSON:
{json.dumps(security_audit)}

Architecture & Efficiency Audit JSON:
{json.dumps(arch_audit)}

Synthesize these audits into a final JSON report.
For EVERY detected issue, pair full diagnostic metadata with Socratic guidance:
{{
  "overall_score": <int 0-100>,
  "security_score": <int 0-100>,
  "architecture_score": <int 0-100>,
  "summary": "<concise executive summary of codebase security and architecture posture>",
  "findings": [
    {{
      "category": "Security" | "Architecture" | "Efficiency",
      "diagnostic": {{
        "file_path": "<exact relative path>",
        "line_start": <int or null>,
        "line_end": <int or null>,
        "code_snippet": "<exact offending line or code block>",
        "flaw_type": "<e.g. CWE-798 Hardcoded Secret, Blocking Event Loop>",
        "severity": "Low" | "Medium" | "High" | "Critical",
        "impact_analysis": "<why this causes failures/exploits in production>",
        "standards_ref": "<OWASP Top 10, CWE-ID, or official docs ref>"
      }},
      "guidance": {{
        "conceptual_direction": "<core software design pattern or security principle needed>",
        "guiding_question": "<thought-provoking question guiding developer toward the fix>",
        "investigation_steps": [
          "<step 1: what to inspect>",
          "<step 2: what to trace>"
        ],
        "verification_challenge": "<an edge case test scenario to verify their fix>"
      }}
    }}
  ]
}}
STRICT RULES:
1. NEVER output copy-paste fixed code. The user must write the fix themselves.
2. Provide exact line numbers and code snippets so the user never has to guess where the problem lies.
3. Return ONLY a valid JSON object."""

    try:
        res = await groq_async_client.chat.completions.create(
            model=MENTOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        content = res.choices[0].message.content or "{}"
        report_data = json.loads(content)
        validated_report = FinalMentorReport.model_validate(report_data)
        return {"final_report": validated_report.model_dump()}
    except Exception as e:
        print(f"Warning: Fallback report generation ({e})")
        sec_score = security_audit.get("security_score", 100)
        arch_score = arch_audit.get("architecture_score", 100)
        fallback = FinalMentorReport(
            overall_score=int((sec_score + arch_score) / 2),
            security_score=sec_score,
            architecture_score=arch_score,
            summary="Audits processed successfully.",
            findings=[]
        )
        return {"final_report": fallback.model_dump()}
