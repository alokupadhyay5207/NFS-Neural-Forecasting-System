import { useId } from "react";

/** NFS mark: a neural network of connected data nodes inside a hexagon, blue-to-violet gradient. */
export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="NFS logo">
      <defs>
        <linearGradient id={id} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22D3EE" /><stop offset=".5" stopColor="#3B82F6" /><stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M32 8 L13 20 L13 44 L32 56 L51 44 L51 20 Z" opacity=".55" />
        <path d="M32 8 L32 32 M13 20 L32 32 M51 20 L32 32 M13 44 L32 32 M51 44 L32 32 M32 56 L32 32" />
        <path d="M13 20 L51 44 M51 20 L13 44" opacity=".35" />
      </g>
      <g fill={`url(#${id})`}>
        <circle cx="32" cy="8" r="3.4" /><circle cx="13" cy="20" r="3.4" /><circle cx="51" cy="20" r="3.4" />
        <circle cx="13" cy="44" r="3.4" /><circle cx="51" cy="44" r="3.4" /><circle cx="32" cy="56" r="3.4" />
        <circle cx="32" cy="32" r="5.6" />
      </g>
      <circle cx="32" cy="32" r="2.2" fill="#050A1A" />
    </svg>
  );
}

export function Logo({ size = 36, subtitle = true }: { size?: number; subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={size} />
      <div className="leading-tight">
        <p className="text-lg font-bold tracking-[0.18em] text-white">NFS</p>
        {subtitle && <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Neural Forecasting System</p>}
      </div>
    </div>
  );
}
