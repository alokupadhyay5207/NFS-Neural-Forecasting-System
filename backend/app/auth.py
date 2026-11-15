"""Supabase JWT verification. The backend trusts a user identity only after the token's signature,
audience, expiry and issuer have been verified."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import jwt  # PyJWT

from .config import Settings

_JWKS_CLIENTS: dict[str, Any] = {}


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: Optional[str]
    token: str  # forwarded to Supabase so reads run under the user's own Row Level Security


def _jwks_client(settings: Settings):
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    if url not in _JWKS_CLIENTS:
        _JWKS_CLIENTS[url] = jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _JWKS_CLIENTS[url]


def verify_token(token: str, settings: Settings, jwks_client: Any = None) -> AuthUser:
    """Verify a Supabase access token and return the user. Raises AuthError on any problem."""
    if not settings.auth_configured:
        raise AuthError("Authentication is not configured on the server (SUPABASE_URL missing).", 503)
    try:
        alg = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        raise AuthError("Malformed token.")
    issuer = f"{settings.supabase_url}/auth/v1"
    try:
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise AuthError("Server is not configured to verify HS256 tokens (SUPABASE_JWT_SECRET missing).", 503)
            claims = jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated", issuer=issuer)
        elif alg in ("RS256", "ES256"):
            client = jwks_client or _jwks_client(settings)
            key = client.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated", issuer=issuer)
        else:
            raise AuthError("Unsupported token algorithm.")
    except AuthError:
        raise
    except jwt.ExpiredSignatureError:
        raise AuthError("Session expired. Please sign in again.")
    except jwt.PyJWTError:
        raise AuthError("Invalid token.")
    except Exception:  # JWKS fetch problems etc.
        raise AuthError("Could not verify the session.", 503)
    sub = claims.get("sub")
    if not sub:
        raise AuthError("Token has no subject.")
    return AuthUser(id=str(sub), email=claims.get("email"), token=token)


def bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Missing bearer token.")
    token = authorization[7:].strip()
    if not token:
        raise AuthError("Missing bearer token.")
    return token
