"""Loads the saved churn pipeline ONCE and turns validated customers into predictions.

Nothing here trains or changes the model - it only reads the three files in artifacts/.
"""
import json
import logging
from pathlib import Path
from typing import Any, Optional, get_args

import joblib
import numpy as np
import pandas as pd
import sklearn

from .schemas import CustomerInput

log = logging.getLogger("churniq")

MODEL_FILE = "churn_pipeline.joblib"
SCHEMA_FILE = "feature_schema.json"
METRICS_FILE = "model_metrics.json"
ADDONS = ["OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies"]


class ArtifactError(RuntimeError):
    """An artifact file is missing, unreadable, or does not match the API."""


def _find(directory: Path, name: str) -> Path:
    """Return directory/name. Also tolerates Windows copies such as 'churn_pipeline (1).joblib'."""
    exact = directory / name
    if exact.is_file():
        return exact
    stem, suffix = Path(name).stem, Path(name).suffix
    matches = sorted(directory.glob(f"{stem}*{suffix}")) if directory.is_dir() else []
    if len(matches) == 1:
        log.warning("Using '%s' because '%s' was not found (consider renaming it).", matches[0].name, name)
        return matches[0]
    if not matches:
        raise ArtifactError(f"'{name}' was not found in {directory}")
    raise ArtifactError(f"Several files look like '{name}' in {directory}: {[m.name for m in matches]}. Keep only one.")


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as err:
        raise ArtifactError(f"Could not read {path.name}: {type(err).__name__}: {err}") from err


class ModelService:
    def __init__(self, directory: Path):
        self.directory = directory
        self.error: Optional[str] = None
        self.version_warning: Optional[str] = None
        self.pipeline: Any = None
        self.schema: dict = {}
        self.metrics: dict = {}
        self.reference: dict[str, Any] = {}

    # ------------------------------------------------------------------ loading
    @classmethod
    def load(cls, directory: Path) -> "ModelService":
        """Never raises: if something is wrong the problem is stored in .error and shown by /api/health."""
        service = cls(Path(directory))
        try:
            service._load()
            log.info("Model loaded: %s (%d features)", service.model_name, len(service.feature_order))
        except Exception as err:  # noqa: BLE001 - we want to report any failure clearly
            service.pipeline = None
            service.error = str(err)
            log.error("MODEL NOT LOADED: %s", err)
        return service

    def _load(self) -> None:
        self.schema = _read_json(_find(self.directory, SCHEMA_FILE))
        self.metrics = _read_json(_find(self.directory, METRICS_FILE))
        model_path = _find(self.directory, MODEL_FILE)

        saved = self.saved_sklearn
        if saved and saved != sklearn.__version__:
            self.version_warning = (
                f"The model was saved with scikit-learn {saved} but this computer runs {sklearn.__version__}. "
                f"Predictions may be wrong or loading may fail. Fix: pip install scikit-learn=={saved}"
            )
            log.warning(self.version_warning)
        try:
            pipeline = joblib.load(model_path)
        except Exception as err:
            hint = f" Try: pip install scikit-learn=={saved}" if saved else ""
            raise ArtifactError(f"Could not read the model file {model_path.name}: {type(err).__name__}: {err}.{hint}") from err

        self._check_consistency(pipeline)
        self.pipeline = pipeline
        self._build_reference_values()

    def _check_consistency(self, pipeline: Any) -> None:
        """Make sure the pipeline, feature_schema.json and the API's input model all agree."""
        if not hasattr(pipeline, "predict_proba") or not hasattr(pipeline, "feature_names_in_"):
            raise ArtifactError("The loaded object is not a fitted scikit-learn pipeline with predict_proba.")
        order = self.schema.get("feature_order")
        if list(pipeline.feature_names_in_) != order:
            raise ArtifactError("The model's feature names/order differ from feature_schema.json.")
        if list(CustomerInput.model_fields) != order:
            raise ArtifactError("The API input model (schemas.py) does not match feature_order in feature_schema.json.")
        for name, allowed in self.schema["categorical_features"].items():
            if set(get_args(CustomerInput.model_fields[name].annotation)) != set(allowed):
                raise ArtifactError(f"Allowed values for '{name}' in schemas.py differ from feature_schema.json.")
        if list(getattr(pipeline, "classes_", [0, 1])) != [0, 1]:
            raise ArtifactError("Unexpected class labels; expected [0, 1] (0 = stay, 1 = churn).")

    def _build_reference_values(self) -> None:
        """'Typical' value of each field (median / most common in training), learned by the saved imputers."""
        try:
            pre = self.pipeline.named_steps["preprocess"]
            for name, transformer, cols in pre.transformers_:
                if name in ("num", "cat"):
                    stats = transformer.named_steps["imputer"].statistics_
                    for col, value in zip(cols, stats):
                        self.reference[col] = float(value) if name == "num" else str(value)
        except Exception as err:  # explanations are optional, predictions still work
            log.warning("Per-customer explanations disabled: %s", err)
            self.reference = {}

    # ------------------------------------------------------------------ info
    @property
    def ready(self) -> bool:
        return self.pipeline is not None and self.error is None

    @property
    def feature_order(self) -> list[str]:
        return self.schema.get("feature_order", [])

    @property
    def numeric_names(self) -> list[str]:
        return list(self.schema.get("numeric_features", {}))

    @property
    def model_name(self) -> str:
        return self.metrics.get("selected_model", "unknown")

    @property
    def saved_sklearn(self) -> Optional[str]:
        return self.metrics.get("environment", {}).get("scikit_learn")

    def info(self) -> dict:
        return {
            "name": self.model_name,
            "trained_at_utc": self.metrics.get("created_at_utc"),
            "scikit_learn_saved": self.saved_sklearn,
            "scikit_learn_running": sklearn.__version__,
            "class_weight": self.metrics.get("settings", {}).get("class_weight"),
        }

    # ------------------------------------------------------------------ prediction
    def _frame(self, rows: list[dict]) -> pd.DataFrame:
        frame = pd.DataFrame(rows, columns=self.feature_order)
        frame[self.numeric_names] = frame[self.numeric_names].astype(float)  # None -> NaN (imputed by the pipeline)
        return frame

    def predict_proba(self, rows: list[dict]) -> np.ndarray:
        return self.pipeline.predict_proba(self._frame(rows))[:, 1]

    def risk_level(self, p: float) -> str:
        bands = self.schema["risk_bands"]
        return "High" if p >= bands["high"] else "Medium" if p >= bands["medium"] else "Low"

    def warnings_for(self, row: dict) -> list[str]:
        out = []
        for name, info in self.schema["numeric_features"].items():
            value = row.get(name)
            if value is None:
                out.append(f"{name} was not provided, so the typical training value ({info['median']}) was used.")
            elif value < info["min"] or value > info["max"]:
                out.append(f"{name}={value} is outside the range seen in training ({info['min']} to {info['max']}); "
                           "the prediction may be less reliable.")
        if row["InternetService"] == "No" and any(row[a] != "No internet service" for a in ADDONS):
            out.append("InternetService is 'No' but some add-on services are not 'No internet service'.")
        if row["InternetService"] != "No" and any(row[a] == "No internet service" for a in ADDONS):
            out.append("InternetService is set, but some add-ons say 'No internet service'.")
        if (row["PhoneService"] == "No") != (row["MultipleLines"] == "No phone service"):
            out.append("PhoneService and MultipleLines are inconsistent ('No phone service' goes with PhoneService 'No').")
        return out

    def drivers(self, row: dict, base: float, top: int = 6) -> list[dict]:
        """Simple what-if sensitivity: swap ONE field at a time for its typical value and see how the
        probability moves. This is NOT SHAP and not causal - just a quick, honest look at the biggest levers."""
        if not self.reference:
            return []
        fields = [f for f in self.feature_order if f in self.reference and row.get(f) is not None]
        variants = [{**row, f: self.reference[f]} for f in fields]
        probs = self.predict_proba(variants)
        out = [{"feature": f, "value": row[f], "effect_points": round(float(base - p) * 100, 1)}
               for f, p in zip(fields, probs)]
        out = [d for d in out if abs(d["effect_points"]) >= 0.1]
        return sorted(out, key=lambda d: abs(d["effect_points"]), reverse=True)[:top]

    def predict_one(self, row: dict) -> dict:
        p = float(self.predict_proba([row])[0])
        return {
            "churn_probability": round(p, 4),
            "predicted_churn": p >= self.schema["threshold"],
            "risk_level": self.risk_level(p),
            "threshold": self.schema["threshold"],
            "risk_bands": self.schema["risk_bands"],
            "warnings": self.warnings_for(row),
            "drivers": self.drivers(row, p),
            "model": self.info(),
        }


# ---------------------------------------------------------------------- batch helpers
ID_KEYS = ("customerid", "customer_id", "id")


def extract_id(raw: dict) -> Optional[str]:
    lowered = {str(k).strip().lower(): v for k, v in raw.items()}
    for key in ID_KEYS:
        if lowered.get(key) not in (None, ""):
            return str(lowered[key])
    return None


def normalise_row(raw: dict, feature_order: list[str], numeric_names: list[str]) -> dict:
    """Prepare one CSV-style row for validation: match column names ignoring case, trim spaces,
    turn blanks into None and numeric text into numbers. Unknown columns (like Churn) are ignored."""
    lookup = {str(k).strip().lower(): k for k in raw}
    clean: dict[str, Any] = {}
    for feature in feature_order:
        key = lookup.get(feature.lower())
        if key is None:
            continue
        value = raw[key]
        if isinstance(value, str):
            value = value.strip() or None
        if feature in numeric_names and isinstance(value, str):
            try:
                value = float(value)
            except ValueError:
                pass  # leave the text in place so validation reports it
        if feature in ("SeniorCitizen", "tenure") and isinstance(value, float) and value.is_integer():
            value = int(value)
        if value is not None:
            clean[feature] = value
    return clean
