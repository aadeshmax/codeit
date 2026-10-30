import hmac
import hashlib
import json
import os
import sys

# Configure stdout for UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    print("Health check OK:", data)
    assert data["github_app_id"] == "5523137"
    assert "github_app_jwt_signing" in data["capabilities"]

def test_github_app_jwt_signing():
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    from github_app_auth import create_app_jwt
    import jwt

    # Generate test RSA key pair
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode("utf-8")

    token = create_app_jwt(app_id="5523137", private_key=pem)
    decoded = jwt.decode(token, public_pem, algorithms=["RS256"])
    assert decoded["iss"] == "5523137"
    print("GitHub App RS256 JWT Signed & Verified OK (App ID 5523137)")

def test_webhook_hmac_verification():
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "codeit_app_secret_123")
    payload = json.dumps({"zen": "testing"}).encode("utf-8")
    
    # 1. Missing signature
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "ping"},
        content=payload
    )
    assert res.status_code == 401
    print("Webhook HMAC rejection (missing header) OK: 401 Unauthorized")

    # 2. Invalid signature
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=invalid"},
        content=payload
    )
    assert res.status_code == 401
    print("Webhook HMAC rejection (invalid signature) OK: 401 Unauthorized")

    # 3. Valid signature with codeit_app_secret_123
    valid_sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": valid_sig},
        content=payload
    )
    assert res.status_code == 200
    print(f"Webhook HMAC validation OK with secret '{secret}': 200 Success")

def test_websocket():
    with client.websocket_connect("/ws/analyze") as ws:
        ws.send_json({"repo_url": "https://github.com/octocat/Hello-World"})
        events_received = []
        while True:
            msg = ws.receive_json()
            events_received.append(msg.get("event"))
            print("WS Event received:", msg.get("event"))
            if msg.get("event") in ["complete", "error"]:
                break
        assert "complete" in events_received
        print("WebSocket stream completed successfully!")

def test_webhook_pr_dispatch():
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "codeit_app_secret_123")
    payload_obj = {
        "action": "opened",
        "pull_request": {
            "number": 42,
            "head": {"sha": "6dcb09b5b57875f334f61aebed695e2e4193db5e"}
        },
        "repository": {
            "html_url": "https://github.com/octocat/Hello-World"
        }
    }
    raw_payload = json.dumps(payload_obj).encode("utf-8")
    sig = "sha256=" + hmac.new(secret.encode(), raw_payload, hashlib.sha256).hexdigest()

    res = client.post(
        "/api/webhook/github",
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": sig,
            "Content-Type": "application/json"
        },
        content=raw_payload
    )
    assert res.status_code == 200
    data = res.json()
    print("Webhook PR Dispatch Accepted:", data)
    assert data["status"] == "accepted"
    job_id = data["github_action_taken"].replace("Job ID: ", "")
    
    # Check job registry
    job_res = client.get(f"/api/webhook/jobs/{job_id}")
    assert job_res.status_code == 200
    print("Job status:", job_res.json().get("status"))

def test_sse_stream():
    with client.stream("GET", "/api/analyze/stream?repo_url=https://github.com/octocat/Hello-World") as res:
        assert res.status_code == 200
        assert res.headers.get("x-accel-buffering") == "no"
        lines = []
        for line in res.iter_lines():
            if line:
                lines.append(line)
                print("SSE Line:", line[:80])
        assert len(lines) > 0
        print("SSE live stream completed successfully!")

def test_checkpointer_and_stuck_student():
    thread_id = "test-student-thread-99"

    # 1. Analyze repository and persist checkpoint under thread_id
    res = client.post(
        "/api/analyze",
        json={"repo_url": "https://github.com/octocat/Hello-World", "thread_id": thread_id}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["thread_id"] == thread_id
    print("Checkpoint created under thread_id:", thread_id)

    # 2. Inspect checkpoint state directly
    cp_res = client.get(f"/api/student/checkpoint/{thread_id}")
    assert cp_res.status_code == 200
    cp_data = cp_res.json()
    assert cp_data["status"] == "found"
    assert cp_data["thread_id"] == thread_id
    print("Checkpoint verified:", cp_data)

    # 3. Student gets stuck on Hint #2 and asks follow-up
    # LangGraph routes directly to Stuck Student Follow-Up Node without re-fetching or re-running audits!
    stuck_res = client.post(
        "/api/student/stuck",
        json={
            "thread_id": thread_id,
            "question": "I tried using os.getenv() in auth.py but it still returns None, what am I missing?"
        }
    )
    assert stuck_res.status_code == 200
    stuck_data = stuck_res.json()
    assert stuck_data["status"] == "success"
    assert stuck_data["thread_id"] == thread_id
    guidance = stuck_data["guidance"]
    assert "diagnosis" in guidance
    assert "socratic_question" in guidance
    assert len(guidance["investigation_steps"]) > 0
    print("Stuck Student Follow-Up Diagnosis:", guidance["diagnosis"][:100], "...")
    print("Socratic Question:", guidance["socratic_question"])
    print("Investigation Steps:", guidance["investigation_steps"])
    assert len(stuck_data["chat_history"]) == 2

    # 4. Multi-turn conversation persistence: Student asks follow-up question in same thread
    stuck_res_2 = client.post(
        "/api/chat",
        json={
            "thread_id": thread_id,
            "question": "Should I use python-dotenv or system environment variables?"
        }
    )
    assert stuck_res_2.status_code == 200
    stuck_data_2 = stuck_res_2.json()
    assert len(stuck_data_2["chat_history"]) == 4
    print("Multi-turn conversation turns accumulated:", len(stuck_data_2["chat_history"]))

    # 5. Unknown thread_id rejection
    bad_res = client.post(
        "/api/student/stuck",
        json={
            "thread_id": "nonexistent-thread-000",
            "question": "Where is my repo?"
        }
    )
    assert bad_res.status_code == 404
    print("Nonexistent thread_id rejection OK: 404 Not Found")

if __name__ == "__main__":
    print("--- Running Test Suite ---")
    test_health()
    test_github_app_jwt_signing()
    test_webhook_hmac_verification()
    test_webhook_pr_dispatch()
    test_checkpointer_and_stuck_student()
    test_sse_stream()
    test_websocket()
    print("--- ALL TESTS PASSED SUCCESSFULLY! ---")

