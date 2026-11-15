/**
 * API client for the NFS FastAPI backend.
 * Base URL: empty in development (Vite proxies /api to http://127.0.0.1:8000); set VITE_API_BASE_URL in production.
 * Pass { auth: true } for /v1 endpoints: the signed-in user's Supabase access token is sent as a bearer token.
 */
import { supabase } from "./supabase";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  kind: "offline" | "validation" | "auth" | "server";
  status?: number;
  detail?: unknown;
  constructor(kind: ApiError["kind"], message: string, status?: number, detail?: unknown) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = unknown>(path: string, body?: unknown, opts: { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = opts.auth ? await authHeaders() : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(API_BASE + "/api" + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("offline", "Cannot reach the NFS prediction API. Check that the backend is running and try again.");
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* no JSON body */ }
  if (!res.ok) {
    const d = data && data.detail;
    if (res.status === 401) throw new ApiError("auth", "Your session has expired. Please sign in again.", 401, d);
    throw new ApiError(
      res.status === 422 ? "validation" : "server",
      typeof d === "string" ? d : res.status === 422 ? "Some fields are invalid. Please check the highlighted inputs." : "The server returned an error (" + res.status + ").",
      res.status, d,
    );
  }
  return data as T;
}
