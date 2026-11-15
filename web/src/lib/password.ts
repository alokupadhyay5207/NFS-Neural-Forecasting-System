export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean; hint: string }

/** Simple, transparent strength check. Passwords are never sent anywhere except to Supabase Auth. */
export function passwordStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const s = Math.min(score, 4) as Strength["score"];
  const hint = pw.length < 8 ? "Use at least 8 characters." : s < 2 ? "Add upper-case letters, numbers or symbols." : "";
  return { score: s, label: pw ? labels[s] : "", ok: pw.length >= 8 && s >= 2, hint };
}
