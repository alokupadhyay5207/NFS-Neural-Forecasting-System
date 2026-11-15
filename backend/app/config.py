"""Environment-based settings for the NFS backend. Secrets are read only from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:  # local development convenience: read backend/.env if python-dotenv is installed. Real env vars win.
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except ImportError:
    pass


def _env(*names: str, default: str = "") -> str:
    for n in names:
        v = os.getenv(n)
        if v:
            return v.strip()
    return default


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str  # server-only; never sent to the browser
    supabase_jwt_secret: str        # only needed for projects still using the legacy HS256 JWT secret
    llm_provider: str               # "anthropic" | "openai" (OpenAI-compatible)
    llm_api_key: str
    llm_model: str
    llm_base_url: str
    llm_max_tokens: int
    protect_legacy_api: bool        # require a valid JWT on the original /api/predict endpoints
    max_body_mb: int
    chat_rate_per_min: int
    api_rate_per_min: int = 120     # predict / analytics requests per user per minute
    batch_rate_per_min: int = 12    # batch uploads per user per minute

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url)

    @property
    def writes_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def reads_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_anon_key)

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_provider in ("anthropic", "openai") and self.llm_api_key and self.llm_model)


def get_settings() -> Settings:
    provider = _env("NFS_LLM_PROVIDER").lower()
    default_model = "claude-sonnet-5-5" if provider == "anthropic" else ""
    return Settings(
        supabase_url=_env("SUPABASE_URL").rstrip("/"),
        supabase_anon_key=_env("SUPABASE_ANON_KEY"),
        supabase_service_role_key=_env("SUPABASE_SERVICE_ROLE_KEY"),
        supabase_jwt_secret=_env("SUPABASE_JWT_SECRET"),
        llm_provider=provider,
        llm_api_key=_env("NFS_LLM_API_KEY"),
        llm_model=_env("NFS_LLM_MODEL", default=default_model),
        llm_base_url=_env("NFS_LLM_BASE_URL").rstrip("/"),
        llm_max_tokens=int(_env("NFS_LLM_MAX_TOKENS", default="900")),
        protect_legacy_api=_env("NFS_PROTECT_LEGACY_API").lower() in ("1", "true", "yes"),
        max_body_mb=int(_env("NFS_MAX_BODY_MB", default="25")),
        chat_rate_per_min=int(_env("NFS_CHAT_RATE_PER_MIN", default="20")),
        api_rate_per_min=int(_env("NFS_API_RATE_PER_MIN", default="120")),
        batch_rate_per_min=int(_env("NFS_BATCH_RATE_PER_MIN", default="12")),
    )
