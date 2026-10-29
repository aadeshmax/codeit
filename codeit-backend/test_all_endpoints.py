import hmac
import hashlib
import json
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    print("Health check OK:", data)
    assert "models" in data
    assert data["models"]["level1_classifier_8b"] == "allam-2-7b"
    assert data["models"]["level2_audit_120b"] == "openai/gpt-oss-120b"
    assert data["models"]["level3_mentor_20b"] == "openai/gpt-oss-20b"

def test_webhook_ping():
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "ping"},
        json={"zen": "Keep it logically awesome."}
    )
    assert res.status_code == 200
    print("Webhook Ping OK:", res.json())

def test_webhook_hmac_rejection():
    # Set a secret temporarily in env
    import os
    os.environ["GITHUB_WEBHOOK_SECRET"] = "supersecret123"
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

    # 3. Valid signature
    valid_sig = "sha256=" + hmac.new("supersecret123".encode(), payload, hashlib.sha256).hexdigest()
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": valid_sig},
        content=payload
    )
    assert res.status_code == 200
    print("Webhook HMAC validation OK: 200 Success")
    del os.environ["GITHUB_WEBHOOK_SECRET"]

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
    payload = {
        "action": "opened",
        "pull_request": {
            "number": 42,
            "head": {"sha": "6dcb09b5b57875f334f61aebed695e2e4193db5e"}
        },
        "repository": {
            "html_url": "https://github.com/octocat/Hello-World"
        }
    }
    res = client.post(
        "/api/webhook/github",
        headers={"X-GitHub-Event": "pull_request"},
        json=payload
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

if __name__ == "__main__":
    print("--- Running Test Suite ---")
    test_health()
    test_webhook_ping()
    test_webhook_hmac_rejection()
    test_webhook_pr_dispatch()
    test_sse_stream()
    test_websocket()
    print("--- ALL TESTS PASSED SUCCESSFULLY! ---")

