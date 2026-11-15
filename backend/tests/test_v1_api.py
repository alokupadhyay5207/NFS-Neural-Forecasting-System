"""API-level tests for the authenticated /api/v1 endpoints, with a fake Supabase (no network, no real keys).
Run with:  python -m pytest -q      (from the backend folder, virtual environment active)"""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import EXAMPLE_CUSTOMER

URL = "https://abc.supabase.co"
SECRET = "s" * 40


def token(sub="user-1", **kw):
    claims = {"sub": sub, "email": f"{sub}@x.co", "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 600, **kw}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def auth(sub="user-1", **kw):
    return {"Authorization": f"Bearer {token(sub, **kw)}"}


class FakeSupabase:
    """Records every HTTP call the backend makes to Supabase."""
    def __init__(self):
        self.calls, self.fail_table = [], None

    def __call__(self, method, url, *, headers, params=None, json=None, timeout=30.0):
        self.calls.append(dict(method=method, url=url, headers=headers, params=params, json=json))
        if self.fail_table and url.endswith("/" + self.fail_table) and method == "POST":
            return 500, {"message": "boom"}
        return (201, None) if method == "POST" else (204, None)

    def inserts(self, table):
        return [c for c in self.calls if c["method"] == "POST" and c["url"].endswith("/rest/v1/" + table)]


@pytest.fixture()
def env(monkeypatch):
    for k, v in {"SUPABASE_URL": URL, "SUPABASE_ANON_KEY": "anon", "SUPABASE_SERVICE_ROLE_KEY": "service-key", "SUPABASE_JWT_SECRET": SECRET}.items():
        monkeypatch.setenv(k, v)
    for k in ("NFS_LLM_PROVIDER", "NFS_LLM_API_KEY", "NFS_LLM_MODEL", "NFS_PROTECT_LEGACY_API"):
        monkeypatch.delenv(k, raising=False)


@pytest.fixture()
def client(env):
    with TestClient(create_app()) as c:
        c.fake = FakeSupabase()
        c.app.state.http = c.fake
        yield c


def test_v1_requires_a_valid_login(client):
    assert client.post("/api/v1/predict", json={"customer": EXAMPLE_CUSTOMER}).status_code == 401
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/v1/me", headers=auth(exp=int(time.time()) - 10)).status_code == 401
    assert client.get("/api/v1/me", headers=auth()).json() == {"id": "user-1", "email": "user-1@x.co"}


def test_single_prediction_is_saved_for_the_verified_user(client):
    r = client.post("/api/v1/predict", headers=auth("user-7"), json={"customer_id": " C-1 ", "customer": EXAMPLE_CUSTOMER})
    assert r.status_code == 200
    body = r.json()
    assert body["saved"] is True and body["prediction_id"] and body["risk_level"] in ("Low", "Medium", "High")
    (call,) = client.fake.inserts("predictions")
    row = call["json"][0]
    assert row["user_id"] == "user-7" and row["customer_id"] == "C-1"
    assert row["churn_probability"] == body["churn_probability"]                    # stored value is the model's output
    assert call["headers"]["Authorization"] == "Bearer service-key"                 # trusted server-side write


def test_user_id_cannot_be_chosen_by_the_client(client):
    r = client.post("/api/v1/predict", headers=auth("real-user"), json={"customer_id": "x", "user_id": "someone-else", "customer": EXAMPLE_CUSTOMER})
    assert r.status_code == 422                                                      # extra fields are rejected
    assert not client.fake.inserts("predictions")


def test_prediction_still_returned_when_saving_fails(client):
    client.fake.fail_table = "predictions"
    body = client.post("/api/v1/predict", headers=auth(), json={"customer": EXAMPLE_CUSTOMER}).json()
    assert body["saved"] is False and body["save_error"] and body["prediction_id"] is None and "churn_probability" in body


def test_batch_saves_only_successful_rows_with_real_probabilities(client):
    rows = [{**EXAMPLE_CUSTOMER, "customerID": "A"}, {**EXAMPLE_CUSTOMER, "customerID": "BAD", "Contract": "Weekly"}, {**EXAMPLE_CUSTOMER, "customerID": "C", "tenure": 60}]
    r = client.post("/api/v1/predict/batch", headers=auth("user-9"), json={"filename": "x.csv", "customers": rows})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 3 and body["scored"] == 2 and body["failed"] == 1 and body["saved"] and body["batch_id"]
    (b,) = client.fake.inserts("prediction_batches")
    assert b["json"][0]["user_id"] == "user-9" and b["json"][0]["total_rows"] == 3 and b["json"][0]["failed_rows"] == 1
    results = [x for c in client.fake.inserts("batch_prediction_results") for x in c["json"]]
    assert sorted(x["customer_id"] for x in results) == ["A", "C"]                  # failed row is never stored
    assert all(isinstance(x["churn_probability"], float) and x["risk_level"] in ("Low", "Medium", "High") for x in results)
    assert all(x["user_id"] == "user-9" and x["batch_id"] == body["batch_id"] for x in results)


def test_partially_saved_batch_is_cleaned_up(client):
    client.fake.fail_table = "batch_prediction_results"
    body = client.post("/api/v1/predict/batch", headers=auth(), json={"filename": "x.csv", "customers": [EXAMPLE_CUSTOMER]}).json()
    assert body["saved"] is False and body["batch_id"] is None
    assert any(c["method"] == "DELETE" and c["url"].endswith("/prediction_batches") for c in client.fake.calls)


def test_batch_row_limit_and_empty_batch(client):
    assert client.post("/api/v1/predict/batch", headers=auth(), json={"customers": []}).status_code == 422


def test_assistant_reports_not_configured_instead_of_faking(client):
    assert client.get("/api/v1/assistant/status", headers=auth()).json()["configured"] is False
    r = client.post("/api/v1/assistant/chat", headers=auth(), json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 503 and "not configured" in r.json()["detail"]


def test_model_report_needs_no_database(client):
    r = client.post("/api/v1/reports/generate", headers=auth(), json={"kind": "model"})
    assert r.status_code == 200 and r.json()["title"] == "Model performance report" and r.json()["ai_summary"] is None


def test_pipeline_endpoint_describes_the_real_model(client):
    body = client.get("/api/pipeline").json()
    assert body["model"]["type"] == "RandomForestClassifier" and body["input_features"] == 19


def test_legacy_endpoints_open_by_default_and_protected_on_request(client, monkeypatch):
    assert client.post("/api/predict", json=EXAMPLE_CUSTOMER).status_code == 200
    monkeypatch.setenv("NFS_PROTECT_LEGACY_API", "true")
    assert client.post("/api/predict", json=EXAMPLE_CUSTOMER).status_code == 401
    assert client.post("/api/predict", json=EXAMPLE_CUSTOMER, headers=auth()).status_code == 200


def test_analytics_endpoints_are_user_scoped_and_forward_the_users_jwt(client):
    client.fake_get = []
    def fake(method, url, *, headers, params=None, json=None, timeout=30.0):
        client.fake_get.append((method, url, headers.get("Authorization"), json))
        return 200, {"ok": True}
    client.app.state.http = fake
    assert client.get("/api/v1/analytics/overview").status_code == 401
    t = token("user-3")
    assert client.get("/api/v1/analytics/overview", headers={"Authorization": f"Bearer {t}"}).json() == {"ok": True}
    method, url, authz, _ = client.fake_get[-1]
    assert url.endswith("/rpc/analytics_overview") and authz == f"Bearer {t}" and "service-key" not in authz
    client.get("/api/v1/analytics/activity?days=9999", headers={"Authorization": f"Bearer {t}"})
    assert client.fake_get[-1][3] == {"p_days": 365}


def test_predict_is_rate_limited_per_user(client, monkeypatch):
    monkeypatch.setenv("NFS_API_RATE_PER_MIN", "2")
    codes = [client.post("/api/v1/predict", headers=auth("limited-user"), json={"customer": EXAMPLE_CUSTOMER}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    assert client.post("/api/v1/predict", headers=auth("another-user"), json={"customer": EXAMPLE_CUSTOMER}).status_code == 200
