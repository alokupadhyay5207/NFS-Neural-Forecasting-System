"""Describes the REAL saved pipeline by reading it at runtime, so the ML Workflow page can never claim
steps or settings that do not exist. Every section is read defensively."""
from __future__ import annotations

from typing import Any

_STEP_PARAMS = ("strategy", "fill_value", "with_mean", "with_std", "handle_unknown", "drop", "sparse_output")
_MODEL_PARAMS = ("n_estimators", "max_depth", "min_samples_leaf", "min_samples_split", "max_features", "criterion", "class_weight", "random_state")


def _step(name: str, obj: Any) -> dict:
    out = {"name": name, "type": type(obj).__name__}
    for k in _STEP_PARAMS:
        if hasattr(obj, k):
            v = getattr(obj, k)
            if isinstance(v, (str, int, float, bool)) or v is None:
                out[k] = v
    return out


def describe_pipeline(pipeline: Any, schema: dict | None = None) -> dict:
    info: dict = {"top_level_steps": [], "preprocessing": {"branches": [], "remainder": None}, "model": None,
                  "input_features": None, "threshold": None, "risk_bands": None}
    try:
        info["top_level_steps"] = [{"name": n, "type": type(s).__name__} for n, s in pipeline.steps]
    except Exception:
        pass
    try:
        pre = pipeline.named_steps["preprocess"]
        for name, tr, cols in pre.transformers_:
            if name == "remainder":
                continue
            steps = [_step(n, s) for n, s in getattr(tr, "steps", [])]
            info["preprocessing"]["branches"].append({"name": name, "columns": [str(c) for c in cols], "steps": steps})
        rem = getattr(pre, "remainder", None)
        info["preprocessing"]["remainder"] = rem if isinstance(rem, str) else None
    except Exception:
        pass
    try:
        clf = pipeline.steps[-1][1]
        info["model"] = {"type": type(clf).__name__, **{k: _plain(getattr(clf, k)) for k in _MODEL_PARAMS if hasattr(clf, k)}}
    except Exception:
        pass
    try:
        info["input_features"] = len(pipeline.feature_names_in_)
    except Exception:
        pass
    info["feature_importance"] = feature_importance(pipeline)
    if schema:
        info["threshold"] = schema.get("threshold")
        info["risk_bands"] = schema.get("risk_bands")
    return info


def feature_importance(pipeline: Any) -> list[dict] | None:
    """Random Forest impurity-based importance, summed back from one-hot columns to the 19 original input fields.
    This is a GLOBAL property of the trained model (not an explanation of one customer, and not causal)."""
    try:
        pre = pipeline.named_steps["preprocess"]
        clf = pipeline.steps[-1][1]
        names = [str(n) for n in pre.get_feature_names_out()]
        imps = [float(v) for v in clf.feature_importances_]
        if len(names) != len(imps):
            return None
        kinds: dict[str, str] = {}
        for name, _tr, cols in pre.transformers_:
            if name in ("num", "cat"):
                for c in cols:
                    kinds[str(c)] = "numeric" if name == "num" else "categorical"
        totals: dict[str, float] = {}
        for n, v in zip(names, imps):
            body = n.split("__", 1)[1] if "__" in n else n
            matches = [c for c in kinds if body == c or body.startswith(c + "_")]
            if not matches:
                return None  # cannot map safely: better to show nothing than something wrong
            c = max(matches, key=len)
            totals[c] = totals.get(c, 0.0) + v
        return [{"feature": c, "importance": round(v, 4), "type": kinds[c]} for c, v in sorted(totals.items(), key=lambda kv: -kv[1])]
    except Exception:
        return None


def _plain(v: Any) -> Any:
    return v if isinstance(v, (str, int, float, bool)) or v is None else str(v)
