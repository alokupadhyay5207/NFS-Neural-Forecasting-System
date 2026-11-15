"""Unit tests for NFS logic that does not need FastAPI or a network: JWT verification, record shaping,
reports, assistant context/prompt, LLM payloads, rate limiting and pipeline introspection.
Plain asserts, so they run under pytest (`python -m pytest -q`) and also standalone."""
import json
import time
from pathlib import Path
from types import SimpleNamespace as NS

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from app import assistant, llm, records, reports
from app.auth import AuthError, bearer_token, verify_token
from app.config import Settings
from app.db import SupabaseError, SupabaseRest
from app.pipeline_info import describe_pipeline
from app.ratelimit import RateLimiter

ARTIFACTS = Path(__file__).resolve().parent.parent / "artifacts"
URL = "https://abc.supabase.co"


def settings(**kw) -> Settings:
    base = dict(supabase_url=URL, supabase_anon_key="anon", supabase_service_role_key="service", supabase_jwt_secret="s" * 40,
                llm_provider="", llm_api_key="", llm_model="", llm_base_url="", llm_max_tokens=900,
                protect_legacy_api=False, max_body_mb=25, chat_rate_per_min=20)
    base.update(kw)
    return Settings(**base)


def raises(fn, exc):
    try:
        fn()
    except exc as e:
        return e
    raise AssertionError(f"expected {exc.__name__}")


def claims(**kw):
    c = {"sub": "user-1", "email": "a@b.co", "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 600}
    c.update(kw)
    return c


# ------------------------------------------------------------------ auth
def test_hs256_token_accepted():
    s = settings()
    u = verify_token(jwt.encode(claims(), s.supabase_jwt_secret, algorithm="HS256"), s)
    assert u.id == "user-1" and u.email == "a@b.co"


def test_rs256_token_accepted_via_jwks():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    tok = jwt.encode(claims(), key, algorithm="RS256", headers={"kid": "k1"})
    fake = NS(get_signing_key_from_jwt=lambda t: NS(key=key.public_key()))
    assert verify_token(tok, settings(), jwks_client=fake).id == "user-1"


def test_bad_tokens_rejected():
    s = settings()
    good = lambda **kw: jwt.encode(claims(**kw), s.supabase_jwt_secret, algorithm="HS256")
    assert "expired" in str(raises(lambda: verify_token(good(exp=int(time.time()) - 5), s), AuthError)).lower()
    raises(lambda: verify_token(good(aud="anon"), s), AuthError)                 # wrong audience
    raises(lambda: verify_token(good(iss="https://evil.example/auth/v1"), s), AuthError)  # wrong issuer
    raises(lambda: verify_token(jwt.encode(claims(), "x" * 40, algorithm="HS256"), s), AuthError)  # wrong secret
    raises(lambda: verify_token("not-a-jwt", s), AuthError)
    raises(lambda: verify_token(jwt.encode(claims(sub=None), s.supabase_jwt_secret, algorithm="HS256"), s), AuthError)


def test_alg_none_and_missing_config():
    s = settings()
    unsigned = jwt.encode(claims(), None, algorithm="none")
    raises(lambda: verify_token(unsigned, s), AuthError)
    e = raises(lambda: verify_token("x", settings(supabase_url="")), AuthError)
    assert e.status == 503
    e = raises(lambda: verify_token(jwt.encode(claims(), "k" * 40, algorithm="HS256"), settings(supabase_jwt_secret="")), AuthError)
    assert e.status == 503


def test_bearer_parsing():
    assert bearer_token("Bearer abc") == "abc"
    for bad in (None, "", "Basic abc", "Bearer ", "Bearer"):
        raises(lambda b=bad: bearer_token(b), AuthError)


# ------------------------------------------------------------------ records
FEATURES = {"Contract": "Month-to-month", "tenure": 3, "MonthlyCharges": 95.5, "TechSupport": "No", "gender": "Female"}
RESULT = {"churn_probability": 0.8123, "risk_level": "High", "predicted_churn": True, "threshold": 0.5, "model": {"name": "Random Forest"}, "drivers": [{"feature": "Contract"}]}


def test_single_row_shape():
    row = records.single_row(pid="p1", user_id="u1", customer_id="  C-1 ", features=FEATURES, result=RESULT, created_at="2026-01-01T00:00:00+00:00")
    assert row["customer_id"] == "C-1" and row["contract"] == "Month-to-month" and row["tenure"] == 3
    assert row["monthly_charges"] == 95.5 and row["tech_support"] == "No" and row["model_name"] == "Random Forest"
    assert records.clean_customer_id("   ") is None and len(records.clean_customer_id("x" * 300)) == 100


def _response():
    ok = lambda row, p, lv, cid: NS(row=row, id=cid, status="ok", churn_probability=p, risk_level=lv, predicted_churn=p >= 0.5)
    bad = NS(row=2, id="BAD", status="error", churn_probability=None, risk_level=None, predicted_churn=None)
    return NS(count=3, scored=2, failed=1, summary={"High": 1, "Medium": 0, "Low": 1}, model=NS(name="Random Forest"), results=[ok(1, 0.9, "High", "A"), bad, ok(3, 0.1, "Low", None)])


def test_batch_rows_keep_probability_and_skip_failures():
    resp = _response()
    rows = records.result_rows(batch_id="b", user_id="u", response=resp, features_by_row={1: FEATURES, 3: FEATURES}, created_at="t")
    assert [r["row_number"] for r in rows] == [1, 3]           # failed row 2 is never stored
    assert [r["churn_probability"] for r in rows] == [0.9, 0.1]  # real probabilities, never null/dash
    assert [r["risk_level"] for r in rows] == ["High", "Low"] and rows[0]["predicted_churn"] is True and rows[1]["customer_id"] is None
    b = records.batch_row(batch_id="b", user_id="u", filename="f.csv", response=resp, processing_ms=12, created_at="t")
    assert b["total_rows"] == 3 and b["successful_rows"] + b["failed_rows"] == b["total_rows"]
    assert b["high_count"] + b["medium_count"] + b["low_count"] == b["successful_rows"]  # matches the SQL CHECK constraints


# ------------------------------------------------------------------ db (fake HTTP)
class FakeHttp:
    def __init__(self, status=201, body=None):
        self.calls, self.status, self.body = [], status, body

    def __call__(self, method, url, *, headers, params=None, json=None, timeout=30.0):
        self.calls.append(dict(method=method, url=url, headers=headers, params=params, json=json))
        return self.status, self.body


def test_writes_use_service_key_and_chunk():
    http = FakeHttp()
    SupabaseRest(settings(), http).insert("predictions", [{"i": i} for i in range(1201)], chunk=500)
    assert len(http.calls) == 3 and all(c["headers"]["Authorization"] == "Bearer service" for c in http.calls)
    assert http.calls[0]["url"] == f"{URL}/rest/v1/predictions" and len(http.calls[2]["json"]) == 201


def test_reads_forward_user_jwt_not_service_key():
    http = FakeHttp(200, [])
    SupabaseRest(settings(), http).select("predictions", {"select": "*"}, "USER.JWT")
    h = http.calls[0]["headers"]
    assert h["Authorization"] == "Bearer USER.JWT" and h["apikey"] == "anon" and "service" not in json.dumps(h)


def test_db_errors_and_missing_config():
    raises(lambda: SupabaseRest(settings(), FakeHttp(403, {"message": "denied"})).insert("t", [{}]), SupabaseError)
    raises(lambda: SupabaseRest(settings(supabase_service_role_key=""), FakeHttp()).insert("t", [{}]), SupabaseError)
    raises(lambda: SupabaseRest(settings(supabase_anon_key=""), FakeHttp()).select("t", {}, "j"), SupabaseError)


# ------------------------------------------------------------------ llm
def test_llm_not_configured_is_explicit():
    raises(lambda: llm.complete(settings(), "sys", [{"role": "user", "content": "hi"}]), llm.LLMNotConfigured)


def test_llm_anthropic_and_openai_payloads():
    a = FakeHttp(200, {"content": [{"type": "text", "text": "Hello"}]})
    s = settings(llm_provider="anthropic", llm_api_key="K", llm_model="m1")
    assert llm.complete(s, "SYS", [{"role": "user", "content": "q"}], a) == "Hello"
    c = a.calls[0]
    assert c["url"].endswith("/v1/messages") and c["headers"]["x-api-key"] == "K" and c["json"]["system"] == "SYS" and c["json"]["model"] == "m1"
    o = FakeHttp(200, {"choices": [{"message": {"content": " Hi "}}]})
    s2 = settings(llm_provider="openai", llm_api_key="K", llm_model="m2")
    assert llm.complete(s2, "SYS", [{"role": "user", "content": "q"}], o) == "Hi"
    assert o.calls[0]["json"]["messages"][0] == {"role": "system", "content": "SYS"} and o.calls[0]["headers"]["Authorization"] == "Bearer K"
    raises(lambda: llm.complete(s, "S", [{"role": "user", "content": "q"}], FakeHttp(429, {"error": {"message": "slow down"}})), llm.LLMError)
    raises(lambda: llm.complete(s, "S", [{"role": "user", "content": "q"}], FakeHttp(200, {"content": []})), llm.LLMError)


# ------------------------------------------------------------------ assistant context + prompt
METRICS = json.loads((ARTIFACTS / "model_metrics.json").read_text())


class FakeDb:
    def __init__(self, fail=False):
        self.fail, self.calls = fail, []

    def rpc(self, fn, args, jwt_):
        self.calls.append((fn, jwt_))
        if self.fail:
            raise SupabaseError("boom")
        return {"total_predictions": 5} if fn == "analytics_overview" else []

    def select(self, table, params, jwt_):
        self.select_params = params
        return [{"features": {"tenure": 3}, "churn_probability": 0.7, "drivers": []}]


def test_context_is_user_scoped_and_grounded():
    ctx, used = assistant.gather_context(FakeDb(), "USER.JWT", METRICS, "11111111-1111-1111-1111-111111111111")
    assert ctx["overview"]["total_predictions"] == 5 and "attached prediction" in used
    assert ctx["model"]["live_prediction_model"] == METRICS["selected_model"] and "Logistic" not in json.dumps(ctx["model"]["live_prediction_model"])
    assert "Frequent support contacts" in ctx["unavailable_segment"]
    prompt = assistant.build_system_prompt(ctx)
    assert "Never invent" in prompt and "MODEL PREDICTION" in prompt and '"total_predictions":5' in prompt


def test_context_degrades_honestly():
    ctx, _ = assistant.gather_context(FakeDb(fail=True), "J", METRICS)
    assert str(ctx["overview"]).startswith("unavailable")
    ctx2, _ = assistant.gather_context(None, "J", METRICS)
    assert "unavailable" in ctx2["analytics_status"]


def test_clean_messages():
    m = lambda r, c: {"role": r, "content": c}
    assert assistant.clean_messages([m("assistant", "hi"), m("user", "a"), m("user", "b"), m("assistant", "c")]) == [m("user", "a\n\nb"), m("assistant", "c")]
    assert assistant.clean_messages([m("user", "x")] * 40, keep=12) == [m("user", "\n\n".join(["x"] * 12))]


# ------------------------------------------------------------------ reports
OV = {"total_predictions": 10, "customers_analysed": 9, "single_predictions": 2, "batch_predictions": 8, "batches": 1, "predicted_churn": 4,
      "high": 3, "medium": 3, "low": 4, "avg_probability": 0.4123, "first_prediction_at": "2026-01-01T00:00:00Z", "last_prediction_at": "2026-01-02T00:00:00Z"}
SEG = [{"key": "new_month_to_month", "size": 4, "high": 2, "medium": 1, "low": 1, "avg_probability": 0.6}, {"key": "high_bill_no_tech_support", "size": 0, "high": 0, "medium": 0, "low": 0, "avg_probability": None},
       {"key": "loyal_long_term", "size": 3, "high": 0, "medium": 0, "low": 3, "avg_probability": 0.1}]


def test_reports_use_only_supplied_data():
    r = reports.build_report("executive", overview=OV, segments=SEG, by_contract=[{"contract": "Two year", "predictions": 3, "high": 0, "avg_probability": 0.1}], activity=None, metrics=METRICS)
    text = json.dumps(r)
    assert "41.2%" in text and "Frequent support contacts" in text and "not confirmed churn" in r["disclaimer"]
    empty = reports.build_report("executive", overview={"total_predictions": 0}, segments=[], by_contract=[], activity=None, metrics=METRICS)
    assert empty["sections"][0]["heading"] == "No prediction data yet" and len(empty["sections"]) == 2


def test_model_and_batch_reports():
    m = reports.build_report("model", overview=None, segments=None, by_contract=None, activity=None, metrics=METRICS)
    t = json.dumps(m)
    assert f"{METRICS['test_metrics'][METRICS['selected_model']]['roc_auc']:.3f}" in t and "recorded comparison only" in t and "Limitations" in t
    batch = {"filename": "x.csv", "created_at": "2026-01-01T00:00:00+00:00", "total_rows": 10, "successful_rows": 8, "failed_rows": 2, "high_count": 2, "medium_count": 3, "low_count": 3, "processing_ms": 50, "model_name": "Random Forest"}
    b = reports.build_report("batch", overview=None, segments=None, by_contract=None, activity=None, metrics=METRICS, batch=batch, batch_stats={"avg_probability": 0.3, "predicted_churn": 2})
    assert "25.0%" in json.dumps(b) and "2 row(s) failed validation" in json.dumps(b)
    missing = reports.build_report("batch", overview=None, segments=None, by_contract=None, activity=None, metrics=METRICS, batch=None)
    assert missing["sections"][0]["heading"] == "Batch not found"


# ------------------------------------------------------------------ rate limit
def test_rate_limiter_window():
    t = [0.0]
    rl = RateLimiter(2, 60, clock=lambda: t[0])
    assert rl.allow("u") and rl.allow("u") and not rl.allow("u") and rl.allow("other")
    t[0] = 61
    assert rl.allow("u")


# ------------------------------------------------------------------ real pipeline introspection
def _load_real_pipeline():
    import warnings
    import joblib
    warnings.simplefilter("ignore")
    try:
        return joblib.load(ARTIFACTS / "churn_pipeline.joblib")
    except AttributeError:  # only when inspecting with a newer scikit-learn than the one that saved the file
        import sklearn.compose._column_transformer as ct

        class _R(list):
            pass
        ct._RemainderColsList = _R
        return joblib.load(ARTIFACTS / "churn_pipeline.joblib")


def test_pipeline_description_matches_saved_model():
    schema = json.loads((ARTIFACTS / "feature_schema.json").read_text())
    info = describe_pipeline(_load_real_pipeline(), schema)
    assert [s["name"] for s in info["top_level_steps"]] == ["preprocess", "model"]
    branches = {b["name"]: b for b in info["preprocessing"]["branches"]}
    assert [s["type"] for s in branches["num"]["steps"]] == ["SimpleImputer", "StandardScaler"] and branches["num"]["steps"][0]["strategy"] == "median"
    assert [s["type"] for s in branches["cat"]["steps"]] == ["SimpleImputer", "OneHotEncoder"] and branches["cat"]["steps"][0]["strategy"] == "most_frequent"
    assert len(branches["num"]["columns"]) + len(branches["cat"]["columns"]) == info["input_features"] == 19
    assert info["preprocessing"]["remainder"] == "drop"
    assert info["model"]["type"] == "RandomForestClassifier" and info["model"]["n_estimators"] == 300 and info["model"]["class_weight"] == "balanced"
    assert info["threshold"] == 0.5 and info["risk_bands"] == {"medium": 0.35, "high": 0.6}


# ------------------------------------------------------------------ added: privacy of attached prediction, segment report, importance
def test_attached_prediction_requests_features_but_never_the_customer_id():
    db = FakeDb()
    ctx, used = assistant.gather_context(db, "J", METRICS, "11111111-1111-1111-1111-111111111111")
    cols = db.select_params["select"].split(",")
    assert "features" in cols and "drivers" in cols and "customer_id" not in cols
    assert ctx["attached_prediction"]["features"] == {"tenure": 3} and "attribute_breakdowns" in ctx
    assert "attached_prediction" in assistant.build_system_prompt(ctx) and "tenure / charge / support breakdowns" in used


def test_segment_report_uses_supplied_breakdowns_only():
    bd = {"tenure_band": [{"ord": 1, "label": "0-11 months", "predictions": 4, "high": 2, "avg_probability": 0.55}],
          "monthly_charge_band": [], "tech_support": [{"label": "No", "predictions": 6, "high": 3, "avg_probability": 0.5}]}
    r = reports.build_report("segment", overview=OV, segments=SEG, by_contract=[{"contract": "Two year", "predictions": 3, "high": 0, "avg_probability": 0.1}],
                             activity=None, metrics=METRICS, breakdowns=bd)
    heads = [x["heading"] for x in r["sections"]]
    assert r["title"] == "Customer segment report" and "Risk by tenure" in heads and "Risk by tech-support status" in heads
    assert "Risk by monthly charge" not in heads                       # no data -> no invented section
    assert "55.0%" in json.dumps(r)
    empty = reports.build_report("segment", overview={"total_predictions": 0}, segments=[], by_contract=[], activity=None, metrics=METRICS)
    assert empty["sections"][0]["heading"] == "No prediction data yet"


def test_feature_importance_from_the_real_model():
    from app.pipeline_info import feature_importance
    imp = feature_importance(_load_real_pipeline())
    assert imp is not None and len(imp) == 19
    assert abs(sum(i["importance"] for i in imp) - 1.0) < 0.01          # importances sum to ~1
    assert {i["feature"] for i in imp} == set(json.loads((ARTIFACTS / "feature_schema.json").read_text())["feature_order"])
    assert imp == sorted(imp, key=lambda i: -i["importance"]) and {i["type"] for i in imp} == {"numeric", "categorical"}
