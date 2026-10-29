import asyncio
import hashlib
import hmac
import json
import os
import sys
import uuid
import httpx
import uvicorn
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Header, WebSocket, WebSocketDisconnect, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.graph import StateGraph, START, END
from schemas import CodeItState, AnalyzeRequest, AnalyzeResponse, WebhookResponse
from fetcher import github_fetcher_node
from agents import (
    security_agent_node,
    architecture_agent_node,
    mentor_agent_node,
    CLASSIFIER_MODEL,
    AUDIT_MODEL,
    MENTOR_MODEL
)

# In-memory job registry for asynchronous production webhook audits
JOB_STORE: Dict[str, Dict[str, Any]] = {}

# 1. Initialize StateGraph
workflow = StateGraph(CodeItState)

# 2. Register Nodes
workflow.add_node("fetcher", github_fetcher_node)
workflow.add_node("security_agent", security_agent_node)
workflow.add_node("architecture_agent", architecture_agent_node)
workflow.add_node("mentor_agent", mentor_agent_node)

# 3. Connect Edges (Parallel Fan-Out & Fan-In)
workflow.add_edge(START, "fetcher")
workflow.add_edge("fetcher", "security_agent")
workflow.add_edge("fetcher", "architecture_agent")
workflow.add_edge("security_agent", "mentor_agent")
workflow.add_edge("architecture_agent", "mentor_agent")
workflow.add_edge("mentor_agent", END)

# 4. Compile Graph
codeit_app = workflow.compile()

# 5. Initialize FastAPI Server
app = FastAPI(
    title="CodeIt Production Backend API",
    description="Multi-agent GitHub code review & Socratic mentoring with multi-level Groq models, live SSE, WebSockets, and GitHub Webhook API integration.",
    version="2.5.0"
)

# Enable CORS for production web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "codeit-backend",
        "version": "2.5.0",
        "models": {
            "level1_classifier_8b": CLASSIFIER_MODEL,
            "level2_audit_120b": AUDIT_MODEL,
            "level3_mentor_20b": MENTOR_MODEL
        },
        "capabilities": [
            "full_diagnostic_metadata",
            "socratic_guidance",
            "live_sse_streaming",
            "websocket_streaming",
            "github_webhook_hmac_sha256",
            "github_pr_comment_api",
            "github_commit_status_api"
        ]
    }

# Standard Synchronous Analysis Endpoint
@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze_repository(request: AnalyzeRequest):
    if not request.repo_url or "github.com" not in request.repo_url:
        raise HTTPException(status_code=400, detail="A valid public GitHub repository URL is required.")
    
    try:
        result = await codeit_app.ainvoke({"repo_url": request.repo_url})
        return {
            "status": "success",
            "repo_url": request.repo_url,
            "selected_files": result.get("selected_files", []),
            "security_audit": result.get("security_audit"),
            "architecture_audit": result.get("architecture_audit"),
            "final_report": result.get("final_report")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# Production Live Server-Sent Events (SSE) Streaming Endpoint
@app.get("/api/analyze/stream")
async def analyze_repository_stream(repo_url: str = Query(..., description="GitHub Repository URL")):
    if not repo_url or "github.com" not in repo_url:
        raise HTTPException(status_code=400, detail="A valid public GitHub repository URL is required.")

    async def event_generator():
        # Live Keep-Alive & Initialization
        yield f": ping\n\n"
        yield f"data: {json.dumps({'event': 'start', 'repo_url': repo_url, 'progress': 5, 'message': 'Connecting to GitHub repository and initiating multi-level audit...'})}\n\n"

        try:
            state_accumulator = {}
            yield f"data: {json.dumps({'event': 'classifying_files', 'model': CLASSIFIER_MODEL, 'progress': 20, 'message': 'Level 1: 8B Model analyzing repository tree structure...'})}\n\n"

            async for chunk in codeit_app.astream({"repo_url": repo_url}, stream_mode="updates"):
                for node_name, node_output in chunk.items():
                    state_accumulator.update(node_output)

                    if node_name == "fetcher":
                        files = node_output.get("selected_files", [])
                        yield f"data: {json.dumps({'event': 'files_classified', 'model': CLASSIFIER_MODEL, 'selected_files': files, 'progress': 35, 'message': f'8B Model selected {len(files)} critical files for deep audit.'})}\n\n"
                        yield f"data: {json.dumps({'event': 'audits_started', 'model': AUDIT_MODEL, 'progress': 45, 'message': 'Level 2: OpenAI OSS 120B executing parallel security and architecture audits...'})}\n\n"

                    elif node_name == "security_agent":
                        score = node_output.get("security_audit", {}).get("security_score")
                        issues_count = len(node_output.get("security_audit", {}).get("issues", []))
                        yield f"data: {json.dumps({'event': 'security_audit_complete', 'model': AUDIT_MODEL, 'security_score': score, 'issues_detected': issues_count, 'progress': 70, 'message': f'120B Security Audit completed (Score: {score}/100, Issues: {issues_count}).'})}\n\n"

                    elif node_name == "architecture_agent":
                        score = node_output.get("architecture_audit", {}).get("architecture_score")
                        bottlenecks_count = len(node_output.get("architecture_audit", {}).get("bottlenecks", []))
                        yield f"data: {json.dumps({'event': 'architecture_audit_complete', 'model': AUDIT_MODEL, 'architecture_score': score, 'bottlenecks_detected': bottlenecks_count, 'progress': 85, 'message': f'120B Architecture Audit completed (Score: {score}/100).'})}\n\n"

                    elif node_name == "mentor_agent":
                        report = node_output.get("final_report", {})
                        findings = report.get("findings", [])
                        yield f"data: {json.dumps({'event': 'mentor_synthesis_complete', 'model': MENTOR_MODEL, 'overall_score': report.get('overall_score'), 'findings_count': len(findings), 'progress': 95, 'message': 'Level 3: 20B Model synthesized Full Diagnostic Metadata + Socratic Guidance.'})}\n\n"

            yield f"data: {json.dumps({'event': 'complete', 'status': 'success', 'progress': 100, 'result': state_accumulator})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

    # Production headers for live streaming across NGINX / Cloudflare
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Content-Type": "text/event-stream"
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

# WebSocket Real-Time Streaming Endpoint
@app.websocket("/ws/analyze")
async def websocket_analyze_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            repo_url = data.get("repo_url")
            if not repo_url or "github.com" not in repo_url:
                await websocket.send_json({"event": "error", "message": "Invalid GitHub repository URL"})
                continue

            await websocket.send_json({
                "event": "start",
                "repo_url": repo_url,
                "progress": 10,
                "message": "Analysis started across multi-level model pipeline"
            })

            state_accumulator = {}
            async for chunk in codeit_app.astream({"repo_url": repo_url}, stream_mode="updates"):
                for node_name, node_output in chunk.items():
                    state_accumulator.update(node_output)
                    if node_name == "fetcher":
                        files = node_output.get("selected_files", [])
                        await websocket.send_json({
                            "event": "files_classified",
                            "model": CLASSIFIER_MODEL,
                            "selected_files": files,
                            "progress": 35
                        })
                    elif node_name == "security_agent":
                        await websocket.send_json({
                            "event": "security_audit_complete",
                            "model": AUDIT_MODEL,
                            "audit": node_output.get("security_audit"),
                            "progress": 70
                        })
                    elif node_name == "architecture_agent":
                        await websocket.send_json({
                            "event": "architecture_audit_complete",
                            "model": AUDIT_MODEL,
                            "audit": node_output.get("architecture_audit"),
                            "progress": 85
                        })
                    elif node_name == "mentor_agent":
                        await websocket.send_json({
                            "event": "mentor_synthesis_complete",
                            "model": MENTOR_MODEL,
                            "final_report": node_output.get("final_report"),
                            "progress": 95
                        })

            await websocket.send_json({
                "event": "complete",
                "status": "success",
                "progress": 100,
                "result": state_accumulator
            })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"event": "error", "message": str(e)})
        except Exception:
            pass

# GitHub API Helper: Formats PR comment with Full Diagnostic Metadata + Socratic Guidance
def build_github_pr_comment(final_report: dict, repo_url: str) -> str:
    overall = final_report.get("overall_score", 0)
    sec_score = final_report.get("security_score", 0)
    arch_score = final_report.get("architecture_score", 0)
    summary = final_report.get("summary", "")
    findings = final_report.get("findings", [])

    badge = "🟢 Passing" if overall >= 75 else ("🟡 Needs Attention" if overall >= 50 else "🔴 Critical Concerns")

    comment = [
        f"## 🤖 CodeIt Socratic Code Review ({badge})",
        f"**Overall Score:** `{overall}/100` | **Security:** `{sec_score}/100` | **Architecture:** `{arch_score}/100`\n",
        f"### 📋 Executive Summary\n{summary}\n",
        "---",
        "### 🔍 Diagnostic Findings & Socratic Mentorship\n",
        "> *Philosophy: Full diagnostic precision to eliminate frustration, paired with Socratic inquiry so you learn by fixing it yourself.*\n"
    ]

    if not findings:
        comment.append("🎉 **No critical vulnerabilities or architectural bottlenecks detected! Great job!**")
    else:
        for idx, f in enumerate(findings, 1):
            cat = f.get("category", "General")
            diag = f.get("diagnostic", {})
            guid = f.get("guidance", {})

            file_path = diag.get("file_path", "unknown")
            l_start = diag.get("line_start")
            l_end = diag.get("line_end")
            lines_str = f"L{l_start}-L{l_end}" if l_start and l_end else (f"L{l_start}" if l_start else "N/A")
            snippet = diag.get("code_snippet", "").strip()

            comment.append(f"#### {idx}. [{cat}] {diag.get('flaw_type', 'Flaw')} in `{file_path}` ({lines_str})")
            comment.append(f"- **Severity:** `{diag.get('severity', 'Medium')}` | **Ref:** `{diag.get('standards_ref', 'N/A')}`")
            comment.append(f"- **Impact in Production:** {diag.get('impact_analysis', 'N/A')}\n")
            if snippet:
                comment.append(f"```\n{snippet}\n```")
            comment.append(f"**🧭 Conceptual Direction:** {guid.get('conceptual_direction', 'N/A')}")
            comment.append(f"**💡 Guiding Socratic Question:** *{guid.get('guiding_question', '')}*")
            steps = guid.get("investigation_steps", [])
            if steps:
                comment.append("**🛠️ Investigation Checklist:**")
                for step in steps:
                    comment.append(f"- [ ] {step}")
            challenge = guid.get("verification_challenge")
            if challenge:
                comment.append(f"**🧪 Verification Challenge:** `{challenge}`\n")
            comment.append("---")

    return "\n".join(comment)

# Background Task Worker for Production Webhook Processing
async def process_github_webhook_job(
    job_id: str,
    repo_url: str,
    event_type: str,
    pr_number: Optional[int],
    head_sha: Optional[str]
):
    JOB_STORE[job_id]["status"] = "processing"
    try:
        # Run full multi-agent pipeline
        result = await codeit_app.ainvoke({"repo_url": repo_url})
        final_report = result.get("final_report", {})

        JOB_STORE[job_id]["status"] = "completed"
        JOB_STORE[job_id]["result"] = {
            "selected_files": result.get("selected_files", []),
            "security_audit": result.get("security_audit"),
            "architecture_audit": result.get("architecture_audit"),
            "final_report": final_report
        }

        # If GITHUB_TOKEN is available, interact with GitHub API (Post PR comment / Commit Status)
        gh_token = os.getenv("GITHUB_TOKEN")
        if gh_token and "github.com" in repo_url:
            parts = repo_url.rstrip("/").split("/")
            owner, repo = parts[-2], parts[-1].replace(".git", "")
            headers = {
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "CodeIt-Production-Bot"
            }

            async with httpx.AsyncClient(headers=headers, timeout=20.0) as client:
                # 1. Post PR Review Comment if PR event
                if pr_number:
                    comment_body = build_github_pr_comment(final_report, repo_url)
                    pr_url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pr_number}/comments"
                    pr_res = await client.post(pr_url, json={"body": comment_body})
                    JOB_STORE[job_id]["github_pr_comment_status"] = pr_res.status_code

                # 2. Post Commit Status check if commit SHA present
                if head_sha:
                    overall = final_report.get("overall_score", 0)
                    state_str = "success" if overall >= 70 else "failure"
                    desc = f"CodeIt Score: {overall}/100. Security: {final_report.get('security_score')}/100."
                    status_url = f"https://api.github.com/repos/{owner}/{repo}/statuses/{head_sha}"
                    status_res = await client.post(status_url, json={
                        "state": state_str,
                        "description": desc[:140],
                        "context": "codeit/review"
                    })
                    JOB_STORE[job_id]["github_commit_status"] = status_res.status_code

    except Exception as e:
        JOB_STORE[job_id]["status"] = "failed"
        JOB_STORE[job_id]["error"] = str(e)

# Production GitHub Webhook Receiver
@app.post("/api/webhook/github", response_model=WebhookResponse)
async def github_webhook_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    x_github_delivery: Optional[str] = Header(None)
):
    body = await request.body()
    webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET")

    # Verify HMAC SHA256 Signature if secret is configured
    if webhook_secret:
        if not x_hub_signature_256:
            raise HTTPException(status_code=401, detail="X-Hub-Signature-256 header missing")
        expected_sig = "sha256=" + hmac.new(
            webhook_secret.encode("utf-8"),
            body,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, x_hub_signature_256):
            raise HTTPException(status_code=401, detail="Invalid HMAC-SHA256 signature")

    try:
        payload = json.loads(body.decode("utf-8")) if body else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = x_github_event or "unknown"
    delivery_id = x_github_delivery or str(uuid.uuid4())

    if event_type == "ping":
        return {
            "status": "ok",
            "event": "ping",
            "delivery_id": delivery_id,
            "message": "Ping event acknowledged. Webhook verified and ready."
        }

    # Extract target repository URL & commit/PR metadata
    repo_data = payload.get("repository", {})
    repo_url = repo_data.get("html_url") or repo_data.get("clone_url")

    pr_number = None
    head_sha = None
    if event_type == "pull_request":
        pr_number = payload.get("pull_request", {}).get("number")
        head_sha = payload.get("pull_request", {}).get("head", {}).get("sha")
    elif event_type == "push":
        head_sha = payload.get("after")

    if not repo_url:
        return {
            "status": "ignored",
            "event": event_type,
            "delivery_id": delivery_id,
            "message": "No repository URL identified in webhook payload."
        }

    # Register asynchronous job in JOB_STORE
    job_id = str(uuid.uuid4())
    JOB_STORE[job_id] = {
        "job_id": job_id,
        "repo_url": repo_url,
        "event_type": event_type,
        "pr_number": pr_number,
        "head_sha": head_sha,
        "status": "queued"
    }

    # Dispatch to background task worker to respond to GitHub within 100ms
    background_tasks.add_task(
        process_github_webhook_job,
        job_id,
        repo_url,
        event_type,
        pr_number,
        head_sha
    )

    action_msg = "Background audit queued. Feedback will be dispatched via GitHub API."
    return {
        "status": "accepted",
        "event": event_type,
        "repo_url": repo_url,
        "delivery_id": delivery_id,
        "message": f"Webhook received for {repo_url}. {action_msg}",
        "github_action_taken": f"Job ID: {job_id}"
    }

# Query asynchronous webhook audit job status
@app.get("/api/webhook/jobs/{job_id}")
async def get_webhook_job_status(job_id: str):
    if job_id not in JOB_STORE:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOB_STORE[job_id]

async def test_pipeline(repo_url: str = "https://github.com/pallets/flask"):
    print(f"Running Multi-Level Pipeline on {repo_url}...")
    print(f"- Classifier (8B): {CLASSIFIER_MODEL}")
    print(f"- Audits (120B): {AUDIT_MODEL}")
    print(f"- Mentor (20B): {MENTOR_MODEL}")
    result = await codeit_app.ainvoke({"repo_url": repo_url})
    print(json.dumps(result["final_report"], indent=2))

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        target = sys.argv[2] if len(sys.argv) > 2 else "https://github.com/pallets/flask"
        asyncio.run(test_pipeline(target))
    else:
        print(f"Starting CodeIt Production Backend API on http://0.0.0.0:8000")
        print(f"Multi-Level Architecture: 8B ({CLASSIFIER_MODEL}) -> 120B ({AUDIT_MODEL}) -> 20B ({MENTOR_MODEL})")
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
