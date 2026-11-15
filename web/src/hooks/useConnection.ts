import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { ConnState, Health, Schema } from "../lib/types";

/** Checks the prediction backend (health + feature schema), same flow as the original single-file page. */
export function useConnection() {
  const [conn, setConn] = useState<ConnState>({ state: "checking" });
  const [schema, setSchema] = useState<Schema | null>(null);

  const connect = useCallback(() => {
    setConn({ state: "checking" });
    Promise.all([api<Health>("/health"), api<Schema>("/schema").catch(() => null)])
      .then(([health, sch]) => {
        setSchema(sch);
        if (!health.model_loaded) setConn({ state: "no-model", error: health.error || "The trained model is not loaded." });
        else setConn({ state: "ok", health });
      })
      .catch((e: unknown) => setConn({ state: "offline", message: e instanceof ApiError ? e.message : "API offline." }));
  }, []);

  useEffect(() => { connect(); }, [connect]);
  return { conn, schema, retry: connect };
}
