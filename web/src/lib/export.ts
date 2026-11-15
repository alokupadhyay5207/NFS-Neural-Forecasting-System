/** Client-side CSV helpers (RFC 4180 quoting; guards against spreadsheet formula injection). */
const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s; // neutralise =cmd| style payloads
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(columns: string[], rows: unknown[][]): string {
  return [columns.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob(["\ufeff" + text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV from rows of differing widths (used for multi-table report exports). */
export const csvFromRows = (rows: unknown[][]): string => rows.map((r) => r.map(cell).join(",")).join("\r\n");
