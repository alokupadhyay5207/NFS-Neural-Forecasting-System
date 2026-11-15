"""Authenticated NFS API (/api/v1). Every route verifies the caller's Supabase JWT first."""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from . import assistant, llm, records, reports
from .auth import AuthError, AuthUser, bearer_token, verify_token
from .batch_service import score_batch
from .config import Settings, get_settings
from .db import SupabaseError, SupabaseRest
from .model_service import ModelService
from .pipeline_info import describe_pipeline
from .ratelimit import RateLimiter
from .v1_schemas import (ChatRequest, ChatResponse, ReportRequest, V1BatchRequest, V1BatchResponse,
                         V1PredictRequest, V1PredictResponse)

log = logging.getLogger("nfs")
MAX_BATCH_ROWS_DEFAULT = 10000
_chat_limiter: Optional[RateLimiter] = None
_limiters: dict[str, RateLimiter] = {}


def rate_limit(user: AuthUser, bucket: str, per_min: int) -> None:
    """Per-user sliding-window limit (in memory, per process). Raises 429 when exceeded."""
    lim = _limiters.get(bucket)
    if lim is None or lim.limit != per_min:
        lim = _limiters[bucket] = RateLimiter(per_min)
    if not lim.allow(user.id):
        log.warning("rate limit hit bucket=%s user=%s", bucket, user.id)
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment and try again.")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def current_user(request: Request) -> AuthUser:
    try:
        return verify_token(bearer_token(request.headers.get("authorization")), get_settings())
    except AuthError as e:
        raise HTTPException(status_code=e.status, detail=str(e), headers={"WWW-Authenticate": "Bearer"} if e.status == 401 else None)


def limit_body(request: Request) -> None:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > get_settings().max_body_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Request is too large (limit {get_settings().max_body_mb} MB).")


def _service(request: Request) -> ModelService:
    service = request.app.state.service
    if not service.ready:
        raise HTTPException(status_code=503, detail=f"The model is not available: {service.error}")
    return service


def _db(request: Request, settings: Settings) -> SupabaseRest:
    return SupabaseRest(settings, getattr(request.app.state, "http", None))


def build_v1_router(max_batch_rows: int = MAX_BATCH_ROWS_DEFAULT) -> APIRouter:
    r = APIRouter(prefix="/api/v1", tags=["NFS v1 (authenticated)"])

    @r.get("/me")
    def me(user: AuthUser = Depends(current_user)):
        return {"id": user.id, "email": user.email}

    @r.post("/predict", response_model=V1PredictResponse, dependencies=[Depends(limit_body)])
    def predict(body: V1PredictRequest, request: Request, user: AuthUser = Depends(current_user)):
        service, settings = _service(request), get_settings()
        rate_limit(user, "predict", settings.api_rate_per_min)
        features = body.customer.model_dump()
        try:
            result = service.predict_one(features)
        except Exception as err:
            log.exception("Prediction failed")
            raise HTTPException(status_code=500, detail="Prediction failed unexpectedly. See the server log.") from err
        pid, created = str(uuid.uuid4()), _now()
        saved, save_error = False, None
        try:
            _db(request, settings).insert("predictions", [records.single_row(
                pid=pid, user_id=user.id, customer_id=body.customer_id, features=features, result=result, created_at=created)])
            saved = True
        except SupabaseError as e:
            log.error("Could not save prediction: %s", e)
            save_error = "The prediction was computed but could not be saved to your history."
        log.info("predict user=%s risk=%s saved=%s", user.id, result["risk_level"], saved)
        return {**result, "prediction_id": pid if saved else None, "saved": saved, "save_error": save_error, "created_at": created}

    @r.post("/predict/batch", response_model=V1BatchResponse, dependencies=[Depends(limit_body)])
    def predict_batch(body: V1BatchRequest, request: Request, user: AuthUser = Depends(current_user)):
        service, settings = _service(request), get_settings()
        rate_limit(user, "batch", settings.batch_rate_per_min)
        if len(body.customers) > max_batch_rows:
            raise HTTPException(status_code=422, detail=f"Too many rows ({len(body.customers)}). The limit is {max_batch_rows}.")
        t0 = time.perf_counter()
        try:
            response, features_by_row = score_batch(service, body.customers)
        except Exception as err:
            log.exception("Batch prediction failed")
            raise HTTPException(status_code=500, detail="Batch prediction failed unexpectedly. See the server log.") from err
        ms, batch_id, created = int((time.perf_counter() - t0) * 1000), str(uuid.uuid4()), _now()
        saved, save_error = False, None
        db = _db(request, settings)
        try:
            db.insert("prediction_batches", [records.batch_row(batch_id=batch_id, user_id=user.id, filename=body.filename, response=response, processing_ms=ms, created_at=created)])
            try:
                db.insert("batch_prediction_results", records.result_rows(batch_id=batch_id, user_id=user.id, response=response, features_by_row=features_by_row, created_at=created))
                saved = True
            except SupabaseError:
                try:
                    db.delete("prediction_batches", {"id": f"eq.{batch_id}"})  # never leave a half-saved batch behind
                except SupabaseError:
                    log.error("Could not clean up partially saved batch %s", batch_id)
                raise
        except SupabaseError as e:
            log.error("Could not save batch: %s", e)
            save_error = "The predictions were computed but could not be saved to your history."
        log.info("batch user=%s rows=%d scored=%d failed=%d ms=%d saved=%s", user.id, response.count, response.scored, response.failed, ms, saved)
        return {**response.model_dump(), "batch_id": batch_id if saved else None, "saved": saved, "save_error": save_error, "processing_ms": ms, "created_at": created}

    # ------------------------------------------------------------------ analytics (user-scoped through RLS)
    def _analytics(request: Request, user: AuthUser, fn: str, args: Optional[dict] = None):
        settings = get_settings()
        rate_limit(user, "analytics", settings.api_rate_per_min)
        if not settings.reads_configured:
            raise HTTPException(status_code=503, detail="Database reads are not configured on the server.")
        try:
            return _db(request, settings).rpc(fn, args or {}, user.token)
        except SupabaseError as e:
            log.error("analytics %s failed: %s", fn, e)
            raise HTTPException(status_code=502, detail="Could not read analytics from the database.")

    @r.get("/analytics/overview")
    def analytics_overview(request: Request, user: AuthUser = Depends(current_user)):
        return _analytics(request, user, "analytics_overview")

    @r.get("/analytics/activity")
    def analytics_activity(request: Request, days: int = 30, user: AuthUser = Depends(current_user)):
        return _analytics(request, user, "activity_by_day", {"p_days": max(1, min(days, 365))})

    @r.get("/analytics/segments")
    def analytics_segments(request: Request, user: AuthUser = Depends(current_user)):
        return _analytics(request, user, "segment_stats")

    @r.get("/analytics/breakdowns")
    def analytics_breakdowns(request: Request, user: AuthUser = Depends(current_user)):
        return {"by_contract": _analytics(request, user, "breakdown_by_contract"), **_analytics(request, user, "attribute_breakdowns")}

    # ------------------------------------------------------------------ AI assistant
    @r.get("/assistant/status")
    def assistant_status(user: AuthUser = Depends(current_user)):
        s = get_settings()
        return {"configured": s.llm_configured, "provider": s.llm_provider or None, "model": s.llm_model or None}

    @r.post("/assistant/chat", response_model=ChatResponse)
    def chat(body: ChatRequest, request: Request, user: AuthUser = Depends(current_user)):
        global _chat_limiter
        settings = get_settings()
        if not settings.llm_configured:
            raise HTTPException(status_code=503, detail="The AI assistant is not configured on the server.")
        if _chat_limiter is None or _chat_limiter.limit != settings.chat_rate_per_min:
            _chat_limiter = RateLimiter(settings.chat_rate_per_min)
        if not _chat_limiter.allow(user.id):
            raise HTTPException(status_code=429, detail="Too many assistant requests. Please wait a minute.")
        service = _service(request)
        db = _db(request, settings) if settings.reads_configured else None
        context, used = assistant.gather_context(db, user.token, service.metrics, body.prediction_id)
        msgs = assistant.clean_messages([m.model_dump() for m in body.messages])
        if not msgs:
            raise HTTPException(status_code=422, detail="Send at least one user message.")
        try:
            reply = llm.complete(settings, assistant.build_system_prompt(context), msgs, getattr(request.app.state, "http", None))
        except llm.LLMError as e:
            log.error("LLM error: %s", e)
            raise HTTPException(status_code=502, detail=str(e))
        return {"reply": reply, "provider": settings.llm_provider, "model": settings.llm_model, "used_context": used}

    # ------------------------------------------------------------------ reports
    @r.post("/reports/generate")
    def generate_report(body: ReportRequest, request: Request, user: AuthUser = Depends(current_user)):
        settings, service = get_settings(), _service(request)
        overview = segments = by_contract = activity = batch = batch_stats = breakdowns = None
        if body.kind != "model":
            if not settings.reads_configured:
                raise HTTPException(status_code=503, detail="Database reads are not configured on the server.")
            db = _db(request, settings)
            try:
                if body.kind == "batch":
                    if not body.batch_id:
                        raise HTTPException(status_code=422, detail="batch_id is required for a batch report.")
                    rows = db.select("prediction_batches", {"id": f"eq.{body.batch_id}", "select": "*", "limit": "1"}, user.token)
                    batch = rows[0] if rows else None
                    if batch:
                        res = db.select("batch_prediction_results", {"batch_id": f"eq.{body.batch_id}", "select": "churn_probability,predicted_churn", "limit": "10000"}, user.token)
                        if res:
                            batch_stats = {"avg_probability": sum(float(x["churn_probability"]) for x in res) / len(res), "predicted_churn": sum(1 for x in res if x["predicted_churn"])}
                else:
                    overview = db.rpc("analytics_overview", {}, user.token)
                    segments = db.rpc("segment_stats", {}, user.token)
                    by_contract = db.rpc("breakdown_by_contract", {}, user.token)
                    activity = db.rpc("activity_by_day", {"p_days": 30}, user.token) if body.kind == "risk" else None
                    breakdowns = db.rpc("attribute_breakdowns", {}, user.token) if body.kind == "segment" else None
            except SupabaseError as e:
                log.error("Report data error: %s", e)
                raise HTTPException(status_code=502, detail="Could not read analytics data from the database.")
        report = reports.build_report(body.kind, overview=overview, segments=segments, by_contract=by_contract, activity=activity,
                                      metrics=service.metrics, batch=batch, batch_stats=batch_stats, breakdowns=breakdowns)
        if body.include_ai_summary:
            if not settings.llm_configured:
                raise HTTPException(status_code=503, detail="The AI assistant is not configured on the server.")
            try:
                import json
                prompt = ("Write a concise 2-3 paragraph narrative of this report for a business reader. Use only the figures in the data below, "
                          "say 'predicted' not 'will churn', note uncertainty, and give 2-3 general, responsible retention suggestions grounded in the data.\n\n"
                          + json.dumps({"title": report["title"], "sections": report["sections"]}, default=str))
                report["ai_summary"] = llm.complete(settings, assistant.SYSTEM_PROMPT, [{"role": "user", "content": prompt}], getattr(request.app.state, "http", None))
            except llm.LLMError as e:
                log.error("LLM error: %s", e)
                raise HTTPException(status_code=502, detail=str(e))
        return report

    return r


def build_pipeline_route() -> APIRouter:
    """Public, non-sensitive description of the saved pipeline (used by the ML Workflow page)."""
    r = APIRouter(prefix="/api", tags=["NFS"])

    @r.get("/pipeline")
    def pipeline(request: Request):
        service = request.app.state.service
        if not service.ready:
            raise HTTPException(status_code=503, detail=f"The model is not available: {service.error}")
        return describe_pipeline(service.pipeline, service.schema)

    return r
