import { describe, expect, it } from "vitest";
import { SAMPLE_CSV } from "./constants";
import { parseCsv, prepareBatch } from "./csv";

const ORDER = ["SeniorCitizen", "tenure", "MonthlyCharges", "TotalCharges", "gender", "Partner", "Dependents", "PhoneService", "MultipleLines",
  "InternetService", "OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies", "Contract", "PaperlessBilling", "PaymentMethod"];

describe("parseCsv", () => {
  it("handles quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x,1","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x,1", 'he said "hi"']]);
  });
  it("drops blank lines", () => { expect(parseCsv("a\n\n b \n")).toEqual([["a"], [" b "]]); });
});

describe("prepareBatch", () => {
  it("loads the 6-row sample, keeping the id and every feature as text", () => {
    const r = prepareBatch(SAMPLE_CSV, ORDER);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows).toHaveLength(6); expect(r.rows[0].customerID).toBe("S-1"); expect(r.rows[0].tenure).toBe("3"); expect(r.rows[4].TotalCharges).toBe(""); }
  });
  it("reports missing required columns but allows a missing TotalCharges column", () => {
    const noTotal = ORDER.filter((c) => c !== "TotalCharges").join(",") + "\n" + ORDER.filter((c) => c !== "TotalCharges").map(() => "x").join(",");
    expect(prepareBatch(noTotal, ORDER).ok).toBe(true);
    const r = prepareBatch("tenure\n1", ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Missing required column(s)");
  });
  it("rejects an empty file and files over 10,000 rows", () => {
    expect(prepareBatch("a,b", ORDER).ok).toBe(false);
    const big = ORDER.join(",") + "\n" + Array(10001).fill(ORDER.map(() => "1").join(",")).join("\n");
    const r = prepareBatch(big, ORDER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("10,000");
  });
  it("matches column names case-insensitively and ignores extra columns like Churn", () => {
    const header = ORDER.map((c) => c.toUpperCase()).join(",") + ",Churn";
    const r = prepareBatch(header + "\n" + ORDER.map(() => "v").join(",") + ",Yes", ORDER);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.rows[0].tenure).toBe("v"); expect("Churn" in r.rows[0]).toBe(false); }
  });
});
