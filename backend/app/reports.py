"""Report generation from REAL data only: aggregate analytics, recorded model metrics and one batch's counts.
Reports are deterministic; an optional AI narrative can be attached separately and is labelled as such."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

SEGMENT_LABELS = {
    "new_month_to_month": "New month-to-month customers",
    "high_bill_no_tech_support": "High monthly bill, no tech support",
    "loyal_long_term": "Loyal long-term customers",
}
SEGMENT_RULES = {
    "new_month_to_month": "Month-to-month contract and tenure under 12 months",
    "high_bill_no_tech_support": "Monthly charges above $85 and TechSupport = No",
    "loyal_long_term": "Tenure of 36 months or more on a one- or two-year contract",
}
DISCLAIMER = ("Risk levels are model predictions, not confirmed churn. The model was trained on the IBM Telco sample dataset "
              "with balanced class weights, so probabilities rank customers by risk and are not calibrated real-world likelihoods.")


def pct(x: Any, digits: int = 1) -> str:
    return "n/a" if x is None else f"{float(x) * 100:.{digits}f}%"


def share(n: int, total: int) -> str:
    return "n/a" if not total else f"{n / total * 100:.1f}%"


def model_summary(metrics: dict) -> dict:
    """Compact, factual view of model_metrics.json used by reports and by the assistant's context."""
    sel = metrics.get("selected_model")
    tm = metrics.get("test_metrics", {})
    t = tm.get(sel, {})
    return {
        "live_prediction_model": sel,
        "evaluation": "held-out test set, IBM Telco sample dataset",
        "test_rows": metrics.get("dataset", {}).get("test_rows"),
        "threshold": metrics.get("settings", {}).get("threshold"),
        "class_weight": metrics.get("settings", {}).get("class_weight"),
        "selected_model_test_metrics": {k: t.get(k) for k in ("accuracy", "precision", "recall", "f1", "roc_auc")},
        "confusion_matrix": {k: t.get(k) for k in ("tn", "fp", "fn", "tp")},
        "recorded_comparison_only": {n: {"f1": m.get("f1"), "roc_auc": m.get("roc_auc")} for n, m in tm.items()
                                      if n != sel and not str(n).startswith("Baseline")},
        "note": "Only the selected model is used for live predictions; other entries are recorded metrics, not live models.",
    }


def _sec(heading: str, paragraphs: Optional[list[str]] = None, columns: Optional[list[str]] = None, rows: Optional[list[list]] = None) -> dict:
    return {"heading": heading, "paragraphs": paragraphs or [], "table": {"columns": columns, "rows": rows} if columns else None}


def _overview_sections(o: dict) -> list[dict]:
    total = o.get("total_predictions") or 0
    if not total:
        return [_sec("No prediction data yet", ["No predictions have been saved to this account, so there is nothing to summarise. Run a single or batch prediction first."])]
    first, last = (o.get("first_prediction_at") or "")[:10], (o.get("last_prediction_at") or "")[:10]
    return [
        _sec("Key figures", [f"Predictions saved between {first} and {last}."], ["Measure", "Value"], [
            ["Customers analysed", o.get("customers_analysed")], ["Total predictions", total],
            ["Single predictions", o.get("single_predictions")], ["Batch predictions", o.get("batch_predictions")],
            ["Batch uploads", o.get("batches")], ["Predicted to churn (probability ≥ threshold)", o.get("predicted_churn")],
            ["Average predicted churn probability", pct(o.get("avg_probability"))]]),
        _sec("Risk distribution", columns=["Risk level", "Predictions", "Share"], rows=[
            [lv, o.get(k), share(o.get(k) or 0, total)] for lv, k in (("High", "high"), ("Medium", "medium"), ("Low", "low"))]),
    ]


def _segment_section(segments: list[dict]) -> dict:
    rows = [[SEGMENT_LABELS.get(s["key"], s["key"]), s.get("size"), s.get("high"), s.get("medium"), s.get("low"), pct(s.get("avg_probability")) if s.get("size") else "n/a"] for s in segments]
    return _sec("Customer segments", ["Segments can overlap, so sizes are not additive. “Frequent support contacts” is unavailable because the dataset has no support-ticket field."],
                ["Segment", "Size", "High", "Medium", "Low", "Avg probability"], rows)


def _contract_section(by_contract: list[dict]) -> dict:
    return _sec("Risk by contract type", columns=["Contract", "Predictions", "High risk", "Avg probability"],
                rows=[[c["contract"], c["predictions"], c["high"], pct(c.get("avg_probability"))] for c in by_contract])


def _breakdown_sections(b: Optional[dict]) -> list[dict]:
    out = []
    for key, title in (("tenure_band", "Risk by tenure"), ("monthly_charge_band", "Risk by monthly charge"), ("tech_support", "Risk by tech-support status")):
        rows = (b or {}).get(key) or []
        if rows:
            out.append(_sec(title, columns=["Group", "Predictions", "High risk", "Avg probability"],
                            rows=[[r["label"], r["predictions"], r["high"], pct(r.get("avg_probability"))] for r in rows]))
    return out


def _model_sections(metrics: dict) -> list[dict]:
    m = model_summary(metrics)
    t, cm = m["selected_model_test_metrics"], m["confusion_matrix"]
    comp = [[n, f"{x.get('f1', 0):.3f}", f"{x.get('roc_auc', 0):.3f}", ("live model" if n == m["live_prediction_model"] else "recorded comparison only")]
            for n, x in metrics.get("test_metrics", {}).items() if not str(n).startswith("Baseline")]
    return [
        _sec(f"{m['live_prediction_model']} – held-out test results", [f"Evaluated on {m['test_rows']:,} test customers from the IBM Telco sample dataset at threshold {m['threshold']}."] if m["test_rows"] else [],
             ["Metric", "Value"], [["Accuracy", pct(t["accuracy"])], ["Precision", f"{t['precision']:.3f}"], ["Recall", f"{t['recall']:.3f}"], ["F1-score", f"{t['f1']:.3f}"], ["ROC-AUC", f"{t['roc_auc']:.3f}"]]),
        _sec("Confusion matrix", columns=["", "Predicted stay", "Predicted churn"], rows=[["Actual stay", cm["tn"], cm["fp"]], ["Actual churn", cm["fn"], cm["tp"]]]),
        _sec("Model comparison", ["Random Forest is the only model used for live predictions; Logistic Regression exists only as recorded comparison metrics."], ["Model", "Test F1", "Test ROC-AUC", "Role"], comp),
        _sec("Limitations", [
            "Results come from one held-out split of a public sample dataset and do not guarantee real-world performance.",
            f"Training used class_weight “{m['class_weight']}”, so predicted probabilities are risk scores for ranking customers, not calibrated likelihoods.",
            "The what-if drivers show how the prediction moves if one field changes; they are not causal explanations.",
            "No ROC-curve points were saved by the training notebook, so only the ROC-AUC value is available."]),
    ]


def build_report(kind: str, *, overview: Optional[dict], segments: Optional[list], by_contract: Optional[list],
                 activity: Optional[list], metrics: dict, batch: Optional[dict] = None, batch_stats: Optional[dict] = None,
                 breakdowns: Optional[dict] = None) -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    titles = {"executive": "Executive summary", "risk": "Customer risk report", "batch": "Batch prediction report", "model": "Model performance report", "segment": "Customer segment report"}
    sections: list[dict] = []
    if kind == "executive":
        sections += _overview_sections(overview or {})
        if (overview or {}).get("total_predictions"):
            sections += [_segment_section(segments or []), _contract_section(by_contract or [])]
        s = model_summary(metrics)["selected_model_test_metrics"]
        sections.append(_sec("Model in use", [f"{model_summary(metrics)['live_prediction_model']} (held-out test F1 {s['f1']:.3f}, ROC-AUC {s['roc_auc']:.3f}). See the model report for details."]))
    elif kind == "risk":
        sections += _overview_sections(overview or {})
        if (overview or {}).get("total_predictions"):
            sections += [_contract_section(by_contract or []), _segment_section(segments or [])]
            if activity:
                sections.append(_sec("Daily activity (last 30 days)", columns=["Date", "Predictions", "High risk", "Predicted churn", "Avg probability"],
                                     rows=[[a["activity_day"], a["prediction_count"], a["high_count"], a["churn_count"], pct(a.get("avg_probability"))] for a in activity]))
    elif kind == "segment":
        if not (overview or {}).get("total_predictions"):
            sections += _overview_sections(overview or {})
        else:
            sections += [_segment_section(segments or []), _contract_section(by_contract or []), *_breakdown_sections(breakdowns),
                         _sec("How to read this", ["Groups are formed from the stored customer fields (contract, tenure, monthly charge, tech support). Average probability is the model's predicted churn risk, not observed churn. Differences between groups describe patterns in the model's predictions and do not prove cause."])]
    elif kind == "batch":
        if not batch:
            sections.append(_sec("Batch not found", ["The selected batch does not exist or does not belong to this account."]))
        else:
            ok = batch["successful_rows"]
            sections.append(_sec(f"Batch: {batch['filename']}", [f"Processed {batch['created_at'][:19].replace('T', ' ')} UTC with {batch.get('model_name') or 'the live model'}."],
                                 ["Measure", "Value"], [["Rows in file", batch["total_rows"]], ["Successfully scored", ok], ["Failed validation", batch["failed_rows"]],
                                                        ["Processing time (ms)", batch.get("processing_ms")],
                                                        ["Avg predicted churn probability", pct((batch_stats or {}).get("avg_probability"))],
                                                        ["Predicted to churn", (batch_stats or {}).get("predicted_churn")]]))
            sections.append(_sec("Risk distribution", columns=["Risk level", "Customers", "Share of scored"], rows=[
                ["High", batch["high_count"], share(batch["high_count"], ok)], ["Medium", batch["medium_count"], share(batch["medium_count"], ok)], ["Low", batch["low_count"], share(batch["low_count"], ok)]]))
            if batch["failed_rows"]:
                sections.append(_sec("Failed rows", [f"{batch['failed_rows']} row(s) failed validation and were not given a probability."]))
    elif kind == "model":
        sections += _model_sections(metrics)
    return {"kind": kind, "title": titles.get(kind, "Report"), "generated_at": now, "sections": sections, "ai_summary": None, "disclaimer": DISCLAIMER}
