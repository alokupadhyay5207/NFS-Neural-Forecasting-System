"""NFS Intelligence: builds the grounded context and prompt for the LLM. The model only ever sees aggregate
analytics for the signed-in user (plus one explicitly attached prediction), and is told to refuse to invent numbers."""
from __future__ import annotations

import json
from typing import Any, Optional

from .db import SupabaseError, SupabaseRest
from .reports import SEGMENT_LABELS, SEGMENT_RULES, model_summary

SYSTEM_PROMPT = """You are NFS Intelligence, the analytics assistant inside NFS (Neural Forecasting System), a customer churn risk platform.

Ground rules - follow them strictly:
1. Use ONLY the DATA block below. Never invent customer counts, probabilities, percentages, model metrics or customer details. If something is not in DATA, say it is not available.
2. Everything in DATA about customers is a MODEL PREDICTION, not confirmed churn. Say "predicted" or "at risk", never imply a customer has left or will certainly leave.
3. The live model is a Random Forest trained with balanced class weights on the IBM Telco sample dataset. Its probabilities are risk scores for ranking, not calibrated real-world likelihoods. Mention uncertainty when relevant.
4. Logistic Regression appears only as recorded comparison metrics; it is not a live model.
5. Do not claim correlation proves causation. The model's "drivers" are what-if sensitivities, not causes.
6. You only have this one user's aggregate data. You cannot see other users' data, and you do not have individual customer records unless one prediction is attached in DATA under "attached_prediction" (its 19 input fields and the model's what-if drivers; no names or contact details exist in the data).
   When asked why an attached customer may be at risk, reason ONLY from those input fields, the probability and the drivers; say these are model sensitivities and patterns, not proven causes, and not confirmed behaviour.
7. Retention suggestions must be general, responsible and tied to the aggregate patterns in DATA. Do not claim an action will reduce churn by a specific amount.
8. Risk bands: Medium from probability 0.35, High from 0.60; predicted churn at 0.50 or above.
9. Be concise and plain. Use short paragraphs or a short list. Cite the figures you use. If the question is unrelated to NFS analytics, say so briefly.
"""


def gather_context(db: Optional[SupabaseRest], user_jwt: str, metrics: dict, prediction_id: Optional[str] = None) -> tuple[dict, list[str]]:
    ctx: dict[str, Any] = {"scope": "Aggregate analytics for the signed-in user only.", "model": model_summary(metrics),
                           "segment_definitions": {k: {"label": SEGMENT_LABELS[k], "rule": SEGMENT_RULES[k]} for k in SEGMENT_LABELS},
                           "unavailable_segment": "Frequent support contacts (the dataset has no support-ticket field)"}
    used = ["model_metrics"]
    if db is None:
        ctx["analytics_status"] = "unavailable: database is not configured on the server"
        return ctx, used
    for key, fn, args, label in (("overview", "analytics_overview", {}, "overview"), ("segments", "segment_stats", {}, "segments"),
                                 ("risk_by_contract", "breakdown_by_contract", {}, "contract breakdown"), ("attribute_breakdowns", "attribute_breakdowns", {}, "tenure / charge / support breakdowns"), ("activity_last_30_days", "activity_by_day", {"p_days": 30}, "activity")):
        try:
            ctx[key] = db.rpc(fn, args, user_jwt)
            used.append(label)
        except SupabaseError as e:
            ctx[key] = f"unavailable ({e})"[:160]
    if prediction_id:
        try:
            rows = db.select("predictions", {"id": f"eq.{prediction_id}", "select": "features,churn_probability,risk_level,predicted_churn,threshold,drivers,model_name,created_at", "limit": "1"}, user_jwt)
            ctx["attached_prediction"] = rows[0] if rows else "not found for this account"
            if rows:
                used.append("attached prediction")
        except SupabaseError as e:
            ctx["attached_prediction"] = f"unavailable ({e})"[:160]
    return ctx, used


def build_system_prompt(context: dict) -> str:
    return SYSTEM_PROMPT + "\nDATA (authoritative, JSON):\n" + json.dumps(context, default=str, separators=(",", ":"))


def clean_messages(messages: list[dict], keep: int = 12) -> list[dict]:
    """Keep the last `keep` turns, drop a leading assistant turn, and merge consecutive same-role turns."""
    out: list[dict] = []
    for m in messages[-keep:]:
        role, text = m["role"], m["content"].strip()
        if not text:
            continue
        if not out and role != "user":
            continue
        if out and out[-1]["role"] == role:
            out[-1]["content"] += "\n\n" + text
        else:
            out.append({"role": role, "content": text})
    return out
