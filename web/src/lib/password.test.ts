import { describe, expect, it } from "vitest";
import { passwordStrength } from "./password";
import { csvFromRows, toCsv } from "./export";

describe("passwordStrength", () => {
  it("rejects short or weak passwords and accepts a strong one", () => {
    expect(passwordStrength("").ok).toBe(false);
    expect(passwordStrength("abc123").ok).toBe(false);
    expect(passwordStrength("password").ok).toBe(false);
    expect(passwordStrength("Tr0ub4dor&3xyz").ok).toBe(true);
    expect(passwordStrength("Tr0ub4dor&3xyz").score).toBe(4);
  });
  it("gives a hint when too short", () => { expect(passwordStrength("Ab1!").hint).toContain("8 characters"); });
});

describe("csv export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x,1", 'say "hi"'], ["l1\nl2", 3]])).toBe('a,b\r\n"x,1","say ""hi"""\r\n"l1\nl2",3');
  });
  it("neutralises spreadsheet formula injection but keeps negative numbers", () => {
    const out = toCsv(["v"], [["=HYPERLINK(1)"], ["+cmd"], ["@SUM(A1)"], [-5], ["-5"]]);
    expect(out).toBe(["v", "'=HYPERLINK(1)", "'+cmd", "'@SUM(A1)", "-5", "-5"].join("\r\n"));
  });
  it("handles rows of different widths and nulls", () => { expect(csvFromRows([["t"], [], ["a", null, undefined]])).toBe("t\r\n\r\na,,"); });
});
