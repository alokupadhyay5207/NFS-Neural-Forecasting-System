"""Authenticated batch scoring. Mirrors the logic of the original /api/predict/batch endpoint (which is left
untouched) but also returns each scored row's normalised features so segment fields can be stored."""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Optional

from pydantic import ValidationError

from .model_service import ModelService, extract_id, normalise_row
from .schemas import BatchResponse, BatchRowResult, CustomerInput

log = logging.getLogger("nfs")


def _format_errors(err: ValidationError) -> list[str]:
    return [f"{'.'.join(str(p) for p in e['loc']) or 'row'}: {e['msg']}" for e in err.errors()]


def score_batch(service: ModelService, customers: list[dict[str, Any]]) -> tuple[BatchResponse, dict[int, dict]]:
    results: list[Optional[BatchRowResult]] = [None] * len(customers)
    good_rows, good_index = [], []
    for i, raw in enumerate(customers):
        try:
            customer = CustomerInput.model_validate(normalise_row(raw, service.feature_order, service.numeric_names))
        except ValidationError as err:
            results[i] = BatchRowResult(row=i + 1, id=extract_id(raw), status="error", errors=_format_errors(err))
            continue
        good_rows.append(customer.model_dump())
        good_index.append(i)
    features_by_row: dict[int, dict] = {}
    if good_rows:
        probabilities = service.predict_proba(good_rows)
        for i, row, p in zip(good_index, good_rows, probabilities):
            p = float(p)
            results[i] = BatchRowResult(
                row=i + 1, id=extract_id(customers[i]), status="ok", churn_probability=round(p, 4),
                predicted_churn=p >= service.schema["threshold"], risk_level=service.risk_level(p),
                warnings=service.warnings_for(row))
            features_by_row[i + 1] = row
    levels = Counter(r.risk_level for r in results if r.status == "ok")
    response = BatchResponse(
        count=len(results), scored=len(good_rows), failed=len(results) - len(good_rows),
        summary={level: levels.get(level, 0) for level in ("High", "Medium", "Low")},
        results=results, model=service.info())
    return response, features_by_row
