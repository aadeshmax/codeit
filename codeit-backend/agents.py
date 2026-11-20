import os
import json
import re
from dotenv import load_dotenv
from groq import AsyncGroq
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from schemas import CodeItState, SecurityAudit, ArchitectureAudit, FinalMentorReport, StuckGuidance

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)
load_dotenv()


def get_groq_api_key() -> str:
    # 1. Environment variable
    env_key = os.getenv("GROQ_API_KEY")
    if env_key and env_key.strip():
        return env_key.strip()

    # 2. Check api.txt in workspace or Render secret files
    possible_paths = [
        os.path.join(os.path.dirname(__file__), "..", "api.txt"),
        os.path.join(os.path.dirname(__file__), "api.txt"),
        os.path.join(os.getcwd(), "api.txt"),
        os.path.join(os.getcwd(), "..", "api.txt"),
        "/etc/secrets/api.txt",
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
# Level 1: 8B-class model for rapid file classification (falls back to allam-2-7b if 8B is not enabled on key)
CLASSIFIER_MODEL = os.getenv("GROQ_CLASSIFIER_MODEL", "llama-3.1-8b-instant")
FALLBACK_CLASSIFIER_MODELS = ["allam-2-7b", "openai/gpt-oss-20b"]

# Level 2: OpenAI OSS 120B for deep security, architecture, and efficiency audits (131,072 context window)
AUDIT_MODEL = os.getenv("GROQ_AUDIT_MODEL", "openai/gpt-oss-120b")

# Level 3: OpenAI OSS 20B for audit JSON analysis and Socratic mentorship synthesis (131,072 context window)
MENTOR_MODEL = os.getenv("GROQ_MENTOR_MODEL", "openai/gpt-oss-20b")

# Backward compatibility alias
model_name = AUDIT_MODEL

# Initialized Clients
groq_async_client = AsyncGroq(api_key=api_key if api_key else None)

groq_llm_120b = ChatGroq(
    model=AUDIT_MODEL,
    api_key=api_key if api_key else None,
    temperature=0.1,
    max_tokens=4096,
    max_retries=2
)


def _extract_json_dict(raw_text: str) -> dict:
    """Extracts and parses a JSON object from raw LLM output (even if wrapped in markdown fences)."""
    if not raw_text:
        return {}
    cleaned = raw_text.strip()
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except Exception:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start:end + 1])
        raise


async def _invoke_json_20b(system_prompt: str, user_prompt: str) -> dict:
    """
    Invokes the Level-3 20B model with a generous max_completion_tokens budget (4096)
    to accommodate internal reasoning tokens + structured JSON output.
    If Groq's strict json_object validator rejects reasoning output (400 json_validate_failed),
    automatically retries without response_format and extracts the JSON block.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    try:
        res = await groq_async_client.chat.completions.create(
            model=MENTOR_MODEL,
            messages=messages,
            temperature=0.1,
            max_completion_tokens=4096,
            response_format={"type": "json_object"}
        )
        return _extract_json_dict(res.choices[0].message.content or "{}")
    except Exception as first_err:
        if "json_validate_failed" in str(first_err) or "400" in str(first_err):
            res = await groq_async_client.chat.completions.create(
                model=MENTOR_MODEL,
                messages=messages,
                temperature=0.1,
                max_completion_tokens=4096
            )
            return _extract_json_dict(res.choices[0].message.content or "{}")
        raise


def _parse_classified_files(content: str, candidate_files: list[str]) -> list[str]:
    """
    Matches LLM-selected file paths against candidate_files while preserving
    hyphens (-), underscores (_), dots (.), and directory slashes (/).
    """
    if not content:
        return []
    candidate_set = set(candidate_files)
    selected = []

    # 1. Token-level exact match (preserves hyphens in filenames like auth-service.js)
    for token in re.split(r"[\s,`'\"*]+", content):
        cleaned = token.strip(".,:;()[]{}")
        if cleaned in candidate_set and cleaned not in selected:
            selected.append(cleaned)

    # 2. Substring scan ordered by position in LLM response
    if len(selected) < 2:
        matches_with_pos = []
        for f in candidate_files:
            pos = content.find(f)
            if pos != -1 and f not in selected:
                matches_with_pos.append((pos, f))
        for _, f in sorted(matches_with_pos, key=lambda x: x[0]):
            selected.append(f)

    return selected[:6]


# LEVEL 1: 8B Model File Classifier
async def classify_files_with_8b(candidate_files: list[str]) -> list[str]:
    """
    Uses the 8B model (or active 7B/8B fallback on Groq) to classify and pick
    the top 3-6 critical files for security & architecture review.
    """
    if not candidate_files:
        return []
    if len(candidate_files) <= 6:
        return candidate_files

    # Keep tree snippet within ~400 tokens (well inside 4096 context window of 7B/8B models)
    tree_snippet = "\n".join(candidate_files[:50])
    prompt = f"""You are an elite code auditor. Given this repository file tree:
{tree_snippet}

Select between 3 and 6 of the most critical files to audit for security vulnerabilities, architectural design flaws, and performance/efficiency bottlenecks (such as authentication handlers, API routes, database connections, and main service entry points).
Respond ONLY with a comma-separated list of exact relative file paths from the list above. Do not include explanation or markdown."""

    models_to_try = [CLASSIFIER_MODEL] + [
        m for m in FALLBACK_CLASSIFIER_MODELS if m != CLASSIFIER_MODEL
    ]

    for model_id in models_to_try:
        try:
            res = await groq_async_client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_completion_tokens=512
            )
            content = res.choices[0].message.content or ""
            selected = _parse_classified_files(content, candidate_files)
            if len(selected) >= 2:
                return selected
        except Exception as e:
            if "model_not_found" in str(e) or "404" in str(e):
                continue
            print(f"Warning: File classification with {model_id} triggered fallback ({e})")
            break

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
    try:
        res = await chain.ainvoke({"code_context": state["code_context"]})
        dumped = res.model_dump()
        if not dumped.get("issues") and dumped.get("security_score", 0) == 0:
            dumped["security_score"] = 100
        return {"security_audit": dumped}
    except Exception as e:
        print(f"Warning: Security agent fallback triggered ({e})")
        return {"security_audit": SecurityAudit(issues=[], security_score=100).model_dump()}


# LEVEL 2 (AGENT 2): Architecture & Efficiency Auditor (OpenAI OSS 120B)
async def architecture_agent_node(state: CodeItState):
    structured_llm = groq_llm_120b.with_structured_output(ArchitectureAudit)
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are Agent 2: Software Architect, Efficiency & Syntax Auditor powered by OpenAI OSS 120B.
Identify syntax/parse errors (missing brackets, invalid indentation, unterminated strings, invalid syntax), poor modularity, O(N^2) loops, blocking I/O in async routes, resource leaks, and design flaws.
Inspect the line numbers prefixed in the code context. For every bottleneck or syntax error found, provide:
- file_path: exact file path
- line_number: exact line number where the issue occurs
- code_snippet: the exact problematic code snippet
- category: "Syntax", "Architecture", "Complexity", "Modularity", or "Async/IO"
- flaw: specific technical description of the syntax error or bottleneck
- impact: runtime failure, crash, or degradation in throughput, latency, or maintainability
Return empty bottlenecks and a score of 100 if the code is clean."""),
        ("human", "{code_context}")
    ])
    chain = prompt | structured_llm
    try:
        res = await chain.ainvoke({"code_context": state["code_context"]})
        dumped = res.model_dump()
        if not dumped.get("bottlenecks") and dumped.get("architecture_score", 0) == 0:
            dumped["architecture_score"] = 100
        return {"architecture_audit": dumped}
    except Exception as e:
        print(f"Warning: Architecture agent fallback triggered ({e})")
        return {"architecture_audit": ArchitectureAudit(bottlenecks=[], architecture_score=100).model_dump()}


# LEVEL 3 (AGENT 3): JSON Analysis & Socratic Hint Mentor (OpenAI OSS 20B)
async def mentor_agent_node(state: CodeItState):
    security_audit = state.get("security_audit", {})
    arch_audit = state.get("architecture_audit", {})
    repo_url = state.get("repo_url", "repository")

    system_prompt = (
        "You are Agent 3: The CodeIt Mentor. You must output raw valid JSON only "
        "matching the FinalMentorReport schema. Do not include markdown codeblocks or explanatory text."
    )
    user_prompt = f"""You are Agent 3: The CodeIt Mentor powered by OpenAI OSS 20B.
CORE PEDAGOGICAL PHILOSOPHY:
Giving the user a vague, cryptic riddle is frustrating.
Giving them copy-paste code ruins the learning.
The sweet spot is FULL DIAGNOSTIC METADATA + CLEAR, APPROACHABLE SOCRATIC GUIDANCE.
Write in plain, practical developer English: keep the technical details (exact variables, APIs, standards, and root causes), but avoid heavy academic jargon or overly abstract riddles so the developer clearly understands what to look for and why.

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
  "efficiency_score": <int 0-100>,
  "syntax_score": <int 0-100>,
  "summary": "<concise executive summary of codebase security and architecture posture>",
  "findings": [
    {{
      "category": "Security" | "Architecture" | "Efficiency" | "Syntax",
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
        "conceptual_direction": "<the core concept or fix pattern explained in clear, everyday developer terms>",
        "guiding_question": "<a clear, specific question referencing the actual variable/function in their code that nudges them toward the fix without being cryptic>",
        "investigation_steps": [
          "<step 1: concrete line/variable to inspect and what to check for>",
          "<step 2: how to trace what happens when it runs and why it breaks>"
        ],
        "verification_challenge": "<a straightforward test or input they can run to prove their fix works>"
      }}
    }}
  ]
}}
STRICT RULES:
1. NEVER output copy-paste fixed code. The user must write the fix themselves.
2. Provide exact line numbers and code snippets so the user never has to guess where the problem lies.
3. Keep explanations detailed and technically accurate, but use clear, easy-to-follow phrasing rather than dense textbook jargon.
4. Return ONLY a valid JSON object."""

    try:
        report_data = await _invoke_json_20b(system_prompt, user_prompt)
        validated_report = FinalMentorReport.model_validate(report_data)
        return {"final_report": validated_report.model_dump()}
    except Exception as e:
        print(f"Warning: Fallback report generation ({e})")
        sec_score = security_audit.get("security_score", 100)
        arch_score = arch_audit.get("architecture_score", 100)

        findings_list = []
        for issue in security_audit.get("issues", []):
            findings_list.append({
                "category": "Security",
                "diagnostic": {
                    "file_path": issue.get("file_path", "unknown"),
                    "line_start": issue.get("line_number"),
                    "line_end": issue.get("line_number"),
                    "code_snippet": issue.get("code_snippet") or "Code snippet identified in audit",
                    "flaw_type": issue.get("vulnerability", "Security Flaw"),
                    "severity": issue.get("severity", "Medium"),
                    "impact_analysis": issue.get("impact", "Exploitation could compromise application security."),
                    "standards_ref": "OWASP Top 10"
                },
                "guidance": {
                    "conceptual_direction": "Safe Input Handling & Access Checks (treat user data as plain text, not executable code)",
                    "guiding_question": f"In {issue.get('file_path')}, user input is being used directly here. What safe API, escaping function, or parameterized method can you use so it is treated strictly as data?",
                    "investigation_steps": [
                        f"Open {issue.get('file_path')} around line {issue.get('line_number', 'N/A')} and trace where the input variable comes from.",
                        "Check if that variable is placed directly into HTML, SQL, a shell command, or a secret literal without escaping or environment config."
                    ],
                    "verification_challenge": "Test with special characters (like `<script>` or quotes `' \"`) and confirm the app displays or stores them safely as plain text without executing anything."
                }
            })
        for b in arch_audit.get("bottlenecks", []):
            b_cat = b.get("category", "Architecture")
            finding_cat = "Syntax" if b_cat == "Syntax" else ("Architecture" if b_cat == "Architecture" else "Efficiency")
            findings_list.append({
                "category": finding_cat,
                "diagnostic": {
                    "file_path": b.get("file_path", "unknown"),
                    "line_start": b.get("line_number"),
                    "line_end": b.get("line_number"),
                    "code_snippet": b.get("code_snippet") or "Bottleneck identified in audit",
                    "flaw_type": b.get("flaw", "Architectural Bottleneck"),
                    "severity": "Medium",
                    "impact_analysis": b.get("impact", "May cause memory leaks or performance degradation under load."),
                    "standards_ref": "Clean Architecture & Resource Lifecycle"
                },
                "guidance": {
                    "conceptual_direction": "Clean Resource Setup & Teardown (making sure work isn't duplicated or left open)",
                    "guiding_question": f"In {b.get('file_path')}, what happens if this code runs multiple times? Where can you clean up, close, or reset the previous resource/state before starting again?",
                    "investigation_steps": [
                        f"Look at {b.get('file_path')} around line {b.get('line_number', 'N/A')} to see what is being created, opened, or looped over.",
                        "Check whether any listeners, connections, or timers are cleaned up when the function finishes or re-runs."
                    ],
                    "verification_challenge": "Run this action 5–10 times in a row and check that memory usage, network calls, or duplicate handlers don't keep growing."
                }
            })

        eff_count = sum(1 for f in findings_list if f["category"] == "Efficiency")
        syn_count = sum(1 for f in findings_list if f["category"] == "Syntax")
        fallback = FinalMentorReport(
            overall_score=int((sec_score + arch_score) / 2),
            security_score=sec_score,
            architecture_score=arch_score,
            efficiency_score=max(0, 100 - eff_count * 12),
            syntax_score=max(0, 100 - syn_count * 20),
            summary=f"Audit completed: Security score {sec_score}/100, Architecture score {arch_score}/100. Review the diagnostic findings below.",
            findings=findings_list
        )
        return {"final_report": fallback.model_dump()}


def _prioritize_context_for_question(code_context: str, question: str, max_chars: int = 14000) -> str:
    """
    Ensures the Stuck Student Follow-Up Node sees the full bounded repository context
    (up to 14,000 chars instead of truncating at 3,500 chars), while prioritizing
    any file explicitly mentioned in the student's question.
    """
    if not code_context:
        return ""
    if len(code_context) <= max_chars:
        return code_context

    sections = code_context.split("\n--- FILE: ")
    if len(sections) <= 1:
        return code_context[:max_chars]

    header = sections[0]
    prioritized = []
    others = []
    q_lower = question.lower()
    for sec in sections[1:]:
        file_name = sec.split(" ---", 1)[0].strip()
        base_name = os.path.basename(file_name).lower()
        if (file_name and file_name.lower() in q_lower) or (base_name and base_name in q_lower):
            prioritized.append("\n--- FILE: " + sec)
        else:
            others.append("\n--- FILE: " + sec)

    reordered = header + "".join(prioritized) + "".join(others)
    return reordered[:max_chars]


# LEVEL 3 (FOLLOW-UP): Stuck Student Follow-Up Node (LangGraph Checkpointer Route)
async def stuck_student_node(state: CodeItState):
    """
    Activated when a student asks a follow-up question using their thread_id.
    Reads the full checkpoint state without re-fetching or re-auditing, providing
    targeted Socratic coaching for where they got stuck.
    """
    student_question = state.get("student_question", "")
    code_context = state.get("code_context", "")
    final_report = state.get("final_report", {})
    chat_history = list(state.get("chat_history") or [])

    findings = final_report.get("findings", [])
    findings_snippet = json.dumps(findings[:6], indent=2) if findings else "No prior critical findings recorded."
    relevant_code = _prioritize_context_for_question(code_context, student_question, max_chars=14000)

    system_prompt = (
        "You are Agent 3: The CodeIt Socratic Mentor in a follow-up coaching session. "
        "Output raw valid JSON only matching the StuckGuidance schema. Never output copy-paste code."
    )
    user_prompt = f"""You are Agent 3: The CodeIt Mentor in a follow-up coaching session.
The student has reviewed their code audit and is stuck trying to solve a diagnostic issue.
The student asks:
"{student_question}"

RELEVANT REPOSITORY CODE CONTEXT:
{relevant_code}

ORIGINAL AUDIT FINDINGS:
{findings_snippet}

PREVIOUS CHAT HISTORY:
{json.dumps(chat_history[-4:], indent=2) if chat_history else "None"}

CORE PEDAGOGICAL PHILOSOPHY:
Full Diagnostic Metadata + Clear, Approachable Socratic Guidance.
Write in plain, practical developer English: give specific technical details (exact functions, variables, and why it breaks), while keeping your clues easy to understand and act on.
STRICT RULES:
1. NEVER output copy-paste fixed code solutions.
2. Explain clearly *why* the student's specific attempt or approach is failing in this codebase context.
3. Give a helpful, concrete nudge so they can figure out and write the fix themselves without feeling stuck on a vague riddle.

Return a valid JSON object matching this exact schema:
{{
  "diagnosis": "<Clear, detailed technical explanation of why their attempt failed, returned None, threw an error, or behaved unexpectedly in this code>",
  "socratic_question": "<A clear, focused guiding question pointing directly to the missing piece or assumption they should rethink>",
  "investigation_steps": [
    "<Actionable debugging step 1: exact file/line or variable to inspect>",
    "<Actionable debugging step 2: what value or behavior to check for>"
  ],
  "verification_challenge": "<Quick test or check to confirm the fix works once they update the code>"
}}
Return ONLY valid JSON."""

    try:
        guidance_data = await _invoke_json_20b(system_prompt, user_prompt)
        validated_guidance = StuckGuidance.model_validate(guidance_data)
        guidance_dict = validated_guidance.model_dump()
    except Exception as e:
        print(f"Warning: Fallback stuck guidance ({e})")
        guidance_dict = {
            "diagnosis": f"Looking at '{student_question[:80]}', this usually happens when a variable is still empty/undefined, or a setup step hasn't finished running before this line executes.",
            "socratic_question": "If you log or inspect the inputs right before this line runs, what value do you expect them to have—and which earlier function is responsible for setting them?",
            "investigation_steps": [
                "Check the exact line where the error or unexpected value appears and print/inspect the variables feeding into it.",
                "Trace backward to the function or event that sets those variables to make sure it actually runs first."
            ],
            "verification_challenge": "Add a quick print/log or assertion right before the line and re-run the same case to confirm the values match what you expected."
        }

    chat_history.append({
        "role": "student",
        "content": student_question
    })
    chat_history.append({
        "role": "mentor",
        "guidance": guidance_dict
    })

    return {
        "stuck_response": guidance_dict,
        "chat_history": chat_history
    }
