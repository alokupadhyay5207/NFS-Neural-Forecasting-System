/** CSV parsing and batch-row preparation, ported unchanged in behaviour from the original single-file page. */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const MAX_BATCH_ROWS = 10000;

export type PreparedBatch = { ok: true; rows: Record<string, string>[] } | { ok: false; error: string };

/** Turns CSV text into the row objects the /api/predict/batch endpoint expects (values stay strings). */
export function prepareBatch(text: string, featureOrder: string[]): PreparedBatch {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "The file is empty or has no data rows." };
  const map: Record<string, number> = {};
  table[0].forEach((h, i) => { map[h.trim().toLowerCase()] = i; });
  const missing = featureOrder.filter((c) => c !== "TotalCharges" && !(c.toLowerCase() in map));
  if (missing.length) return { ok: false, error: "Missing required column(s): " + missing.join(", ") };
  if (table.length - 1 > MAX_BATCH_ROWS) {
    return { ok: false, error: "This file has " + (table.length - 1) + " rows; the limit is 10,000 per upload." };
  }
  const idIdx = ["customerid", "customer_id", "id"].map((k) => map[k]).find((v) => v !== undefined);
  const rows = table.slice(1).map((r) => {
    const o: Record<string, string> = {};
    featureOrder.forEach((c) => {
      const i = map[c.toLowerCase()];
      if (i !== undefined) o[c] = (r[i] ?? "").trim();
    });
    if (idIdx !== undefined) o.customerID = (r[idIdx] ?? "").trim();
    return o;
  });
  return { ok: true, rows };
}
