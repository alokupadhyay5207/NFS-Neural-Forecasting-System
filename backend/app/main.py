"""NFS (Neural Forecasting System) API: serves the trained churn model, its recorded metrics, and the legacy web page."""
import logging
import os
from collections import Counter
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import sklearn
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from .auth import AuthError, bearer_token, verify_token
from .config import get_settings
from .model_service import ModelService, extract_id, normalise_row
from .routes_v1 import build_pipeline_route, build_v1_router
from .schemas import BatchRequest, BatchResponse, BatchRowResult, CustomerInput, PredictionResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger("nfs")

def _env(new: str, old: str, default: str) -> str:
    """Prefer the new NFS_* variable, fall back to the original CHURNIQ_* one, then the default."""
    return os.getenv(new) or os.getenv(old) or default


BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ARTIFACTS = BACKEND_DIR / "artifacts"
FRONTEND_INDEX = Path(_env("NFS_FRONTEND_DIR", "CHURNIQ_FRONTEND_DIR", str(BACKEND_DIR.parent / "frontend"))) / "index.html"
MAX_BATCH_ROWS = int(_env("NFS_MAX_BATCH_ROWS", "CHURNIQ_MAX_BATCH_ROWS", "10000"))
CORS_ORIGINS = [o.strip() for o in _env(
    "NFS_CORS_ORIGINS", "CHURNIQ_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


def get_service(request: Request) -> ModelService:
    return request.app.state.service


def require_ready(service: ModelService = Depends(get_service)) -> ModelService:
    if not service.ready:
        raise HTTPException(status_code=503, detail=f"The model is not available: {service.error}")
    return service


def legacy_guard(request: Request) -> None:
    """The original unauthenticated endpoints stay open for local use. In production set NFS_PROTECT_LEGACY_API=true
    to require a valid Supabase JWT on them as well."""
    settings = get_settings()
    if settings.protect_legacy_api:
        try:
            verify_token(bearer_token(request.headers.get("authorization")), settings)
        except AuthError as e:
            raise HTTPException(status_code=e.status, detail=str(e))


def format_errors(err: ValidationError) -> list[str]:
    return [f"{'.'.join(str(p) for p in e['loc']) or 'row'}: {e['msg']}" for e in err.errors()]


def create_app(artifacts_dir: Optional[Path] = None) -> FastAPI:
    directory = Path(artifacts_dir or _env("NFS_ARTIFACTS_DIR", "CHURNIQ_ARTIFACTS_DIR", str(DEFAULT_ARTIFACTS)))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.service = ModelService.load(directory)  # loaded once, reused for every request
        yield

    app = FastAPI(
        title="NFS API", version="1.0.0", lifespan=lifespan,
        description="Churn predictions from the saved scikit-learn Random Forest pipeline. "
                    "Trained on the IBM Telco sample dataset - a portfolio project, not a production system.",
    )
    app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])
    api = APIRouter(prefix="/api", tags=["NFS"])

    @api.get("/health")
    def health(service: ModelService = Depends(get_service)):
        return {
            "status": "ok" if service.ready else "degraded",
            "model_loaded": service.ready,
            "error": service.error,
            "version_warning": service.version_warning,
            "model": service.info() if service.metrics else None,
            "artifacts_dir": str(service.directory),
            "scikit_learn_running": sklearn.__version__,
        }

    @api.get("/schema")
    def schema(service: ModelService = Depends(get_service)):
        """feature_schema.json exactly as saved - the frontend builds its form from this."""
        if not service.schema:
            raise HTTPException(status_code=503, detail=f"feature_schema.json is not available: {service.error}")
        return service.schema

    @api.get("/metrics")
    def metrics(service: ModelService = Depends(get_service)):
        """model_metrics.json exactly as recorded by the training notebook."""
        if not service.metrics:
            raise HTTPException(status_code=503, detail=f"model_metrics.json is not available: {service.error}")
        return service.metrics

    @api.post("/predict", response_model=PredictionResponse)
    def predict(customer: CustomerInput, service: ModelService = Depends(require_ready), _guard: None = Depends(legacy_guard)):
        try:
            return service.predict_one(customer.model_dump())
        except Exception as err:
            log.exception("Prediction failed")
            raise HTTPException(status_code=500, detail="Prediction failed unexpectedly. See the server log.") from err

    @api.post("/predict/batch", response_model=BatchResponse)
    def predict_batch(body: BatchRequest, service: ModelService = Depends(require_ready), _guard: None = Depends(legacy_guard)):
        if len(body.customers) > MAX_BATCH_ROWS:
            raise HTTPException(status_code=422, detail=f"Too many rows ({len(body.customers)}). The limit is {MAX_BATCH_ROWS}.")
        results: list[Optional[BatchRowResult]] = [None] * len(body.customers)
        good_rows, good_index = [], []
        for i, raw in enumerate(body.customers):
            try:
                customer = CustomerInput.model_validate(normalise_row(raw, service.feature_order, service.numeric_names))
            except ValidationError as err:
                results[i] = BatchRowResult(row=i + 1, id=extract_id(raw), status="error", errors=format_errors(err))
                continue
            good_rows.append(customer.model_dump())
            good_index.append(i)
        if good_rows:
            try:
                probabilities = service.predict_proba(good_rows)
            except Exception as err:
                log.exception("Batch prediction failed")
                raise HTTPException(status_code=500, detail="Batch prediction failed unexpectedly. See the server log.") from err
            for i, row, p in zip(good_index, good_rows, probabilities):
                p = float(p)
                results[i] = BatchRowResult(
                    row=i + 1, id=extract_id(body.customers[i]), status="ok", churn_probability=round(p, 4),
                    predicted_churn=p >= service.schema["threshold"], risk_level=service.risk_level(p),
                    warnings=service.warnings_for(row))
        levels = Counter(r.risk_level for r in results if r.status == "ok")
        return BatchResponse(
            count=len(results), scored=len(good_rows), failed=len(results) - len(good_rows),
            summary={level: levels.get(level, 0) for level in ("High", "Medium", "Low")},
            results=results, model=service.info())

    app.include_router(api)
    app.include_router(build_pipeline_route())
    app.include_router(build_v1_router(MAX_BATCH_ROWS))

    @app.get("/", include_in_schema=False)
    def home():
        if FRONTEND_INDEX.is_file():
            return FileResponse(FRONTEND_INDEX)
        return JSONResponse({"message": "NFS API is running. Interactive docs: /docs",
                             "frontend": f"No frontend found at {FRONTEND_INDEX}"})

    return app


app = create_app()
