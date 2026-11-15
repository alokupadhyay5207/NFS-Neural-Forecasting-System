"""Server-side LLM client. API keys come only from backend environment variables; nothing here runs in the browser.
Supports Anthropic's Messages API and any OpenAI-compatible chat-completions API."""
from __future__ import annotations

from typing import Any, Optional

from .config import Settings
from .db import HttpFn, default_http


class LLMNotConfigured(RuntimeError):
    pass


class LLMError(RuntimeError):
    pass


def complete(settings: Settings, system: str, messages: list[dict], http: Optional[HttpFn] = None) -> str:
    if not settings.llm_configured:
        raise LLMNotConfigured("The AI assistant is not configured. Set NFS_LLM_PROVIDER, NFS_LLM_API_KEY and NFS_LLM_MODEL on the backend.")
    http = http or default_http
    if settings.llm_provider == "anthropic":
        base = settings.llm_base_url or "https://api.anthropic.com"
        status, body = http("POST", f"{base}/v1/messages", timeout=60.0,
                            headers={"x-api-key": settings.llm_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                            json={"model": settings.llm_model, "max_tokens": settings.llm_max_tokens, "system": system, "messages": messages})
        _check(status, body)
        parts = [b.get("text", "") for b in (body or {}).get("content", []) if b.get("type") == "text"]
        text = "".join(parts).strip()
    else:
        base = settings.llm_base_url or "https://api.openai.com/v1"
        status, body = http("POST", f"{base}/chat/completions", timeout=60.0,
                            headers={"Authorization": f"Bearer {settings.llm_api_key}", "Content-Type": "application/json"},
                            json={"model": settings.llm_model, "max_tokens": settings.llm_max_tokens,
                                  "messages": [{"role": "system", "content": system}, *messages]})
        _check(status, body)
        try:
            text = (body["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, TypeError):
            raise LLMError("The AI provider returned an unexpected response.")
    if not text:
        raise LLMError("The AI provider returned an empty response.")
    return text


def _check(status: int, body: Any) -> None:
    if status == 200:
        return
    detail = ""
    if isinstance(body, dict):
        err = body.get("error")
        detail = (err.get("message") if isinstance(err, dict) else str(err or ""))[:200]
    raise LLMError(f"The AI provider returned an error ({status}). {detail}".strip())
