"""Quick end-to-end check of the ORIGINAL trained model inside the pinned environment.

Run from the backend folder with the virtual environment active:   python scripts/selfcheck.py
It loads the saved pipeline, then checks single prediction, risk bands, batch scoring with an invalid row,
and consistency with the recorded metrics file. Nothing is written anywhere.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.batch_service import score_batch  # noqa: E402
from app.model_service import ModelService  # noqa: E402
from app.schemas import EXAMPLE_CUSTOMER  # noqa: E402

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("PASS  " if ok else "FAIL  ") + name + (f"   [{detail}]" if detail and not ok else ""))
    if not ok:
        failures.append(name)


service = ModelService.load(Path(__file__).resolve().parent.parent / "artifacts")
print(f"model: {service.model_name if service.ready else 'NOT LOADED'}")
if service.version_warning:
    print("WARNING:", service.version_warning)
check("model pipeline loads (needs scikit-learn 1.6.1, numpy 2.1.3, pandas 2.2.3, joblib 1.6.0)", service.ready, service.error or "")
if not service.ready:
    print("\nFix the environment first: pip install -r requirements.txt  (Python 3.12)")
    sys.exit(1)

check("19 input features", len(service.feature_order) == 19, str(len(service.feature_order)))
r = service.predict_one(dict(EXAMPLE_CUSTOMER))
p = r["churn_probability"]
check("single prediction returns a probability between 0 and 1", 0.0 <= p <= 1.0, str(p))
bands = service.schema["risk_bands"]
expected = "High" if p >= bands["high"] else "Medium" if p >= bands["medium"] else "Low"
check("risk level matches the 0.35 / 0.60 bands", r["risk_level"] == expected and bands == {"medium": 0.35, "high": 0.6}, f"{p} -> {r['risk_level']}")
check("predicted_churn uses the 0.50 threshold", r["predicted_churn"] == (p >= 0.5) and r["threshold"] == 0.5)
check("what-if drivers are returned", isinstance(r["drivers"], list) and len(r["drivers"]) > 0)

loyal = {**EXAMPLE_CUSTOMER, "tenure": 60, "Contract": "Two year", "MonthlyCharges": 55.0, "TotalCharges": 3300.0, "TechSupport": "Yes", "OnlineSecurity": "Yes",
         "InternetService": "DSL", "StreamingTV": "No", "StreamingMovies": "No", "MultipleLines": "No", "Partner": "Yes", "Dependents": "Yes", "PaymentMethod": "Bank transfer (automatic)"}
check("a long-term two-year customer scores lower risk than a new month-to-month one", service.predict_one(loyal)["churn_probability"] < p)
blank = service.predict_one({**EXAMPLE_CUSTOMER, "TotalCharges": None})
check("blank TotalCharges is imputed (prediction still works, with a warning)", 0.0 <= blank["churn_probability"] <= 1.0 and any("TotalCharges" in w for w in blank["warnings"]))

rows = [{**EXAMPLE_CUSTOMER, "customerID": "A"}, {**EXAMPLE_CUSTOMER, "customerID": "BAD", "Contract": "Weekly"}, {**loyal, "customerID": "C", "SeniorCitizen": "0", "tenure": "60"}]
resp, feats = score_batch(service, rows)
check("batch: 3 rows -> 2 scored, 1 failed", (resp.count, resp.scored, resp.failed) == (3, 2, 1), f"{resp.count}/{resp.scored}/{resp.failed}")
ok_rows = [x for x in resp.results if x.status == "ok"]
check("batch: every scored row has a probability and a risk level", all(x.churn_probability is not None and x.risk_level for x in ok_rows) and len(ok_rows) == 2)
bad = [x for x in resp.results if x.status == "error"][0]
check("batch: the invalid row has errors and NO probability", bad.churn_probability is None and bad.risk_level is None and len(bad.errors) > 0)
check("batch: summary counts add up", sum(resp.summary.values()) == resp.scored)
check("batch: string values from CSV (e.g. '60') are accepted", any(x.id == "C" for x in ok_rows))

sel = service.metrics.get("selected_model")
check("recorded metrics name the live model", sel == service.model_name, f"{sel} vs {service.model_name}")

print()
if failures:
    print(f"{len(failures)} CHECK(S) FAILED: " + "; ".join(failures))
    sys.exit(1)
print("ALL CHECKS PASSED")
