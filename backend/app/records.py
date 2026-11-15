"""Pure helpers that shape model outputs into database rows. No I/O, so they are easy to test."""
from __future__ import annotations

from typing import Any, Optional

MAX_ID_LEN = 100


def clean_customer_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = str(value).strip()[:MAX_ID_LEN]
    return value or None


def segment_fields(features: dict) -> dict:
    """The only four customer attributes kept with batch results (and copied on single predictions)."""
    def num(key, cast):
        v = features.get(key)
        return None if v is None else cast(v)
    return {
        "contract": features.get("Contract"),
        "tenure": num("tenure", lambda v: int(float(v))),
        "monthly_charges": num("MonthlyCharges", float),
        "tech_support": features.get("TechSupport"),
    }


def single_row(*, pid: str, user_id: str, customer_id: Optional[str], features: dict, result: dict, created_at: str) -> dict:
    return {
        "id": pid, "user_id": user_id, "customer_id": clean_customer_id(customer_id), "features": features,
        "churn_probability": result["churn_probability"], "risk_level": result["risk_level"],
        "predicted_churn": bool(result["predicted_churn"]), "threshold": result["threshold"],
        "model_name": result["model"]["name"], "drivers": result.get("drivers"),
        **segment_fields(features), "created_at": created_at,
    }


def batch_row(*, batch_id: str, user_id: str, filename: str, response: Any, processing_ms: int, created_at: str) -> dict:
    s = response.summary
    return {
        "id": batch_id, "user_id": user_id, "filename": (filename or "upload.csv")[:255],
        "total_rows": response.count, "successful_rows": response.scored, "failed_rows": response.failed,
        "high_count": s.get("High", 0), "medium_count": s.get("Medium", 0), "low_count": s.get("Low", 0),
        "processing_ms": processing_ms, "model_name": response.model.name, "created_at": created_at,
    }


def result_rows(*, batch_id: str, user_id: str, response: Any, features_by_row: dict[int, dict], created_at: str) -> list[dict]:
    """One row per SUCCESSFUL customer only. Failed rows never get a probability."""
    rows = []
    for r in response.results:
        if r.status != "ok" or r.churn_probability is None or r.risk_level is None:
            continue
        rows.append({
            "batch_id": batch_id, "user_id": user_id, "row_number": r.row, "customer_id": clean_customer_id(r.id),
            "churn_probability": r.churn_probability, "risk_level": r.risk_level, "predicted_churn": bool(r.predicted_churn),
            **segment_fields(features_by_row.get(r.row, {})), "created_at": created_at,
        })
    return rows
