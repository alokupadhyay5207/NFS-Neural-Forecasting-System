"""Run with:  python -m pytest -q      (from the backend folder, with the virtual environment active)"""
import joblib
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import DEFAULT_ARTIFACTS, create_app
from app.schemas import EXAMPLE_CUSTOMER

LOYAL = {**EXAMPLE_CUSTOMER, "tenure": 60, "MonthlyCharges": 55.0, "TotalCharges": 3300.0, "Contract": "Two year",
         "InternetService": "DSL", "OnlineSecurity": "Yes", "OnlineBackup": "Yes", "DeviceProtection": "Yes",
         "TechSupport": "Yes", "StreamingTV": "No", "StreamingMovies": "No", "Partner": "Yes", "Dependents": "Yes",
         "PaperlessBilling": "No", "PaymentMethod": "Bank transfer (automatic)", "MultipleLines": "No", "gender": "Male"}


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_health_reports_loaded_model(client):
    body = client.get("/api/health").json()
    assert body["model_loaded"] is True and body["model"]["name"] == "Random Forest"


def test_schema_and_metrics_are_served_unchanged(client):
    assert client.get("/api/schema").json()["feature_order"][0] == "SeniorCitizen"
    metrics = client.get("/api/metrics").json()
    assert metrics["selected_model"] == "Random Forest" and "test_metrics" in metrics


def test_prediction_matches_the_saved_pipeline_exactly(client):
    pipeline = joblib.load(DEFAULT_ARTIFACTS / "churn_pipeline.joblib")
    expected = float(pipeline.predict_proba(pd.DataFrame([EXAMPLE_CUSTOMER])[list(pipeline.feature_names_in_)])[0, 1])
    body = client.post("/api/predict", json=EXAMPLE_CUSTOMER).json()
    assert body["churn_probability"] == pytest.approx(expected, abs=1e-4)
    assert body["risk_level"] in ("Low", "Medium", "High")


def test_risk_level_follows_the_schema_bands(client):
    for customer in (EXAMPLE_CUSTOMER, LOYAL):
        body = client.post("/api/predict", json=customer).json()
        p, bands = body["churn_probability"], body["risk_bands"]
        assert body["risk_level"] == ("High" if p >= bands["high"] else "Medium" if p >= bands["medium"] else "Low")
        assert body["predicted_churn"] == (p >= body["threshold"])


def test_risky_customer_scores_higher_than_loyal_customer(client):
    risky = client.post("/api/predict", json=EXAMPLE_CUSTOMER).json()["churn_probability"]
    loyal = client.post("/api/predict", json=LOYAL).json()["churn_probability"]
    assert risky > loyal


@pytest.mark.parametrize("change", [
    {"Contract": "Weekly"}, {"gender": "female"}, {"SeniorCitizen": 2}, {"tenure": -1}, {"tenure": 2.5},
    {"MonthlyCharges": 0}, {"MonthlyCharges": "abc"}, {"unexpected": 1},
])
def test_invalid_input_is_rejected_with_422(client, change):
    assert client.post("/api/predict", json={**EXAMPLE_CUSTOMER, **change}).status_code == 422


def test_missing_field_is_rejected(client):
    body = {k: v for k, v in EXAMPLE_CUSTOMER.items() if k != "Contract"}
    r = client.post("/api/predict", json=body)
    assert r.status_code == 422 and r.json()["detail"][0]["loc"][-1] == "Contract"


def test_missing_total_charges_is_allowed_with_a_warning(client):
    r = client.post("/api/predict", json={**EXAMPLE_CUSTOMER, "TotalCharges": None})
    assert r.status_code == 200 and any("TotalCharges" in w for w in r.json()["warnings"])


def test_batch_scores_good_rows_and_reports_bad_rows(client):
    csv_like = {k: str(v) for k, v in EXAMPLE_CUSTOMER.items()}  # CSV values arrive as text
    rows = [{"customerID": "A-1", **csv_like}, {"customerID": "BAD", **csv_like, "Contract": "Weekly"},
            {"customerID": "A-3", **{k: str(v) for k, v in LOYAL.items()}, "TotalCharges": " "}]
    body = client.post("/api/predict/batch", json={"customers": rows}).json()
    assert (body["count"], body["scored"], body["failed"]) == (3, 2, 1)
    assert body["results"][1]["status"] == "error" and "Contract" in body["results"][1]["errors"][0]
    assert body["results"][0]["id"] == "A-1" and sum(body["summary"].values()) == 2


def test_empty_batch_is_rejected(client):
    assert client.post("/api/predict/batch", json={"customers": []}).status_code == 422


def test_clear_error_when_the_model_file_is_missing(tmp_path):
    for name in ("feature_schema.json", "model_metrics.json"):
        (tmp_path / name).write_bytes((DEFAULT_ARTIFACTS / name).read_bytes())
    with TestClient(create_app(tmp_path)) as c:
        health = c.get("/api/health").json()
        assert health["model_loaded"] is False and "churn_pipeline.joblib" in health["error"]
        assert c.post("/api/predict", json=EXAMPLE_CUSTOMER).status_code == 503
        assert c.get("/api/metrics").status_code == 200  # recorded metrics are still readable


def test_corrupt_model_file_gives_a_clear_error(tmp_path):
    for name in ("feature_schema.json", "model_metrics.json"):
        (tmp_path / name).write_bytes((DEFAULT_ARTIFACTS / name).read_bytes())
    (tmp_path / "churn_pipeline.joblib").write_bytes(b"this is not a model")
    with TestClient(create_app(tmp_path)) as c:
        assert "Could not read the model file" in c.get("/api/health").json()["error"]
        assert c.post("/api/predict", json=EXAMPLE_CUSTOMER).status_code == 503


def test_windows_style_duplicate_filename_is_found(tmp_path):
    for name in ("feature_schema.json", "model_metrics.json"):
        (tmp_path / name).write_bytes((DEFAULT_ARTIFACTS / name).read_bytes())
    (tmp_path / "churn_pipeline (1).joblib").write_bytes((DEFAULT_ARTIFACTS / "churn_pipeline.joblib").read_bytes())
    with TestClient(create_app(tmp_path)) as c:
        assert c.get("/api/health").json()["model_loaded"] is True
