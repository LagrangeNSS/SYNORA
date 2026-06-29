interface LogoProps {
  size?: number;
  live?: boolean;       // center node glows phosphor
  breathe?: boolean;    // mark breathes at 6s
  orbit?: boolean;      // orbital marks rotate
  stroke?: string;
  connectors?: boolean;
}

export function LogoMark({
  size = 44, live = false, breathe = false, orbit = false,
  stroke = "var(--syn-bone)", connectors = false,
}: LogoProps) {
  const center = live ? "var(--syn-phos)" : stroke;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44"
      style={{ animation: breathe ? "synBreath 6s ease-in-out infinite" : undefined, overflow: "visible" }}>
      <circle cx="22" cy="22" r="20" fill="none" stroke={stroke} strokeWidth="1" />
      <circle cx="22" cy="22" r="4.5" fill={center}
        style={live ? { filter: "drop-shadow(0 0 8px var(--syn-phos))" } : undefined} />
      {connectors && (
        <g opacity="0.35" stroke={stroke} strokeWidth="0.6">
          <line x1="22" y1="3.5" x2="22" y2="17.5" />
          <line x1="38.4" y1="32" x2="26" y2="24" />
          <line x1="5.6" y1="32" x2="18" y2="24" />
        </g>
      )}
      <g style={orbit ? { animation: "synOrbit 14s linear infinite", transformOrigin: "center" } : undefined}>
        <circle cx="22" cy="3.5" r="1.6" fill={stroke} />
        <circle cx="38.4" cy="32" r="1.6" fill={stroke} />
        <circle cx="5.6" cy="32" r="1.6" fill={stroke} />
      </g>
    </svg>
  );
}

export function LogoLockup({ size = 28, sub = false }: { size?: number; sub?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <LogoMark size={size} breathe />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: "500 22px/1 var(--f-display)", letterSpacing: "0.3em", color: "var(--syn-bone)" }}>
          SYNORA
        </span>
        {sub && (
          <span style={{ font: "400 8px/1 var(--f-mono)", letterSpacing: "0.34em", textTransform: "uppercase", color: "var(--syn-ash)" }}>
            Synthetic Agora
          </span>
        )}
      </div>
    </div>
  );
}
