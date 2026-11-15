export const cx = (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(" ");
export const pct = (p: number, digits = 1) => (p * 100).toFixed(digits) + "%";
