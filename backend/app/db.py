"""Minimal Supabase PostgREST client.

* Writes use the SERVICE-ROLE key (server-only) and bypass RLS, so the caller must already have verified the user.
* Reads on behalf of a user forward that user's JWT with the anon key, so Row Level Security still applies.
The HTTP layer is injectable so the logic can be unit-tested without a network."""
from __future__ import annotations

from typing import Any, Callable, Optional

from .config import Settings

HttpFn = Callable[..., "tuple[int, Any]"]
_CLIENT: Any = None


class SupabaseError(RuntimeError):
    pass


def default_http(method: str, url: str, *, headers: dict, params: Optional[dict] = None, json: Any = None, timeout: float = 30.0):
    import httpx  # imported lazily so unit tests do not need it
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = httpx.Client(timeout=timeout)
    r = _CLIENT.request(method, url, headers=headers, params=params, json=json, timeout=timeout)
    try:
        body = r.json() if r.content else None
    except ValueError:
        body = r.text
    return r.status_code, body


class SupabaseRest:
    def __init__(self, settings: Settings, http: Optional[HttpFn] = None):
        self.s = settings
        self.http = http or default_http

    def _url(self, path: str) -> str:
        return f"{self.s.supabase_url}/rest/v1/{path}"

    def insert(self, table: str, rows: list[dict], chunk: int = 500) -> None:
        if not self.s.writes_configured:
            raise SupabaseError("Database writes are not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).")
        h = {"apikey": self.s.supabase_service_role_key, "Authorization": f"Bearer {self.s.supabase_service_role_key}",
             "Content-Type": "application/json", "Prefer": "return=minimal"}
        for i in range(0, len(rows), chunk):
            status, body = self.http("POST", self._url(table), headers=h, json=rows[i:i + chunk])
            if status not in (200, 201, 204):
                raise SupabaseError(f"Insert into {table} failed ({status}): {_msg(body)}")

    def delete(self, table: str, filters: dict[str, str]) -> None:
        if not self.s.writes_configured:
            raise SupabaseError("Database writes are not configured.")
        h = {"apikey": self.s.supabase_service_role_key, "Authorization": f"Bearer {self.s.supabase_service_role_key}"}
        status, body = self.http("DELETE", self._url(table), headers=h, params=filters)
        if status not in (200, 204):
            raise SupabaseError(f"Delete from {table} failed ({status}): {_msg(body)}")

    def _user_headers(self, user_jwt: str) -> dict:
        if not self.s.reads_configured:
            raise SupabaseError("Database reads are not configured (SUPABASE_URL / SUPABASE_ANON_KEY).")
        return {"apikey": self.s.supabase_anon_key, "Authorization": f"Bearer {user_jwt}", "Accept": "application/json"}

    def select(self, table: str, params: dict[str, str], user_jwt: str) -> list[dict]:
        status, body = self.http("GET", self._url(table), headers=self._user_headers(user_jwt), params=params)
        if status != 200:
            raise SupabaseError(f"Select from {table} failed ({status}): {_msg(body)}")
        return body or []

    def rpc(self, fn: str, args: dict, user_jwt: str) -> Any:
        h = {**self._user_headers(user_jwt), "Content-Type": "application/json"}
        status, body = self.http("POST", self._url(f"rpc/{fn}"), headers=h, json=args)
        if status != 200:
            raise SupabaseError(f"RPC {fn} failed ({status}): {_msg(body)}")
        return body


def _msg(body: Any) -> str:
    if isinstance(body, dict):
        return str(body.get("message") or body.get("error") or body)[:300]
    return str(body)[:300]
