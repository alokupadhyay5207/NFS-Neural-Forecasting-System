import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
const S = "/tmp/smoke/shims/";
const r = await build({
  entryPoints: ["/home/claude/proj/churniq/web/src/main.tsx"], bundle: true, format: "iife", outfile: "/tmp/smoke/dist/bundle.js", sourcemap: false, logLevel: "info",
  nodePaths: ["/home/claude/.npm-global/lib/node_modules"], loader: { ".css": "empty" },
  alias: { "react-router-dom": S + "router.js", recharts: S + "recharts.js", "lucide-react": S + "lucide.js", three: S + "three.js", "@supabase/supabase-js": S + "supabase.js" },
  define: { "import.meta.env.VITE_SUPABASE_URL": '"https://smoke.supabase.co"', "import.meta.env.VITE_SUPABASE_ANON_KEY": '"anon-smoke"', "import.meta.env.VITE_API_BASE_URL": '""', "import.meta.env.VITE_ENABLE_GOOGLE_AUTH": '"false"', "process.env.NODE_ENV": '"development"' },
});
console.log("errors:", r.errors.length, "warnings:", r.warnings.length);
