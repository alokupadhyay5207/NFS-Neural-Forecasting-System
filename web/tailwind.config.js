/** NFS design tokens. Dark, deep-navy base with electric blue / cyan / violet accents. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        navy: { 950: "#050A1A", 900: "#08112B", 800: "#0C1838", 700: "#12214A", 600: "#1B2D63" },
        electric: "#3B82F6",
        cyan: { nfs: "#22D3EE" },
        violet: { nfs: "#8B5CF6" },
        risk: { high: "#F43F5E", medium: "#F59E0B", low: "#10B981" },
      },
      backgroundImage: {
        "nfs-gradient": "linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)",
        "nfs-gradient-wide": "linear-gradient(90deg, #22D3EE 0%, #3B82F6 45%, #8B5CF6 100%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(99,132,255,.25), 0 8px 32px -8px rgba(59,130,246,.35)",
      },
    },
  },
  plugins: [],
};
