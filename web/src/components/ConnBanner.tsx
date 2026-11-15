import type { ConnState } from "../lib/types";
import { Banner, Btn } from "./ui";

export function ConnBanner({ conn, retry }: { conn: ConnState; retry: () => void }) {
  if (conn.state === "ok") return null;
  const text =
    conn.state === "checking" ? "Connecting to the NFS prediction API…"
    : conn.state === "no-model" ? "The API is running but the model could not be loaded: " + conn.error
    : "Cannot reach the NFS prediction API. " + conn.message;
  return (
    <Banner tone="error">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{text}</span>
        {conn.state !== "checking" && <Btn kind="ghost" className="!px-3 !py-1.5" onClick={retry}>Retry</Btn>}
      </div>
    </Banner>
  );
}
