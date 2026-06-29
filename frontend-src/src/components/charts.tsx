// All charts are hand-drawn SVG: viewBox-driven, responsive, no chart lib.

interface Pt { x: number; y: number; }

function path(points: Pt[], w: number, h: number, pad = 2): string {
  if (!points.length) return "";
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(0, ...ys), yMax = Math.max(...ys, 1);
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;
  const sx = (x: number) => pad + ((w - pad * 2) * (x - xMin)) / (xMax - xMin);
  const sy = (y: number) => h - pad - ((h - pad * 2) * (y - yMin)) / (yMax - yMin);
  return points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
}

export function Sparkline({ data, color = "var(--syn-phos)", h = 40, fill = true }:
  { data: number[]; color?: string; h?: number; fill?: boolean }) {
  const pts = data.map((y, x) => ({ x, y }));
  const w = 200;
  const d = path(pts, w, h);
  const area = d ? `${d} L ${w} ${h} L 0 ${h} Z` : "";
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill && area && <path d={area} fill="url(#sparkG)" opacity="0.14" />}
      <defs>
        <linearGradient id="sparkG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} stroke={color} strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Bars({ data, highlight = -1, h = 80, colorOf }:
  { data: number[]; highlight?: number; h?: number; colorOf?: (i: number, v: number) => string }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: h, width: "100%" }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.max((v / max) * 100, v > 0 ? 4 : 1.5)}%`,
          background: colorOf ? colorOf(i, v) : (i === highlight ? "var(--syn-phos)" : v > 0 ? "var(--syn-bone)" : "var(--syn-line-5)"),
          borderRadius: 2,
          transition: "height var(--t-slow) var(--ease-syn)",
        }} />
      ))}
    </div>
  );
}

export function Ring({ value, max = 1, color = "var(--syn-phos)", size = 64, stroke = 4, label, sub }:
  { value: number; max?: number; color?: string; size?: number; stroke?: number; label?: string; sub?: string }) {
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--syn-tile)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray var(--t-slow) var(--ease-syn)" }} />
      </svg>
      {(label || sub) && (
        <div>
          {label && <div style={{ font: "500 16px/1 var(--f-mono)", color: "var(--syn-bone)" }}>{label}</div>}
          {sub && <div style={{ font: "400 10px/1 var(--f-mono)", color: "var(--syn-ash)", marginTop: 5, letterSpacing: "0.16em" }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// multi-series line chart with axes
export interface Series { name: string; color: string; points: Pt[]; }
export function LineChart({ series, w = 1040, h = 240, yMin, yMax, yTicks = 4 }:
  { series: Series[]; w?: number; h?: number; yMin?: number; yMax?: number; yTicks?: number }) {
  const all = series.flatMap((s) => s.points);
  const PAD = { l: 40, r: 14, t: 12, b: 24 };
  if (!all.length) return <ChartEmpty />;
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  let lo = yMin ?? Math.min(0, ...ys), hi = yMax ?? Math.max(...ys, 1);
  if (xMax === xMin) xMax = xMin + 1;
  if (hi === lo) hi = lo + 1;
  const iw = w - PAD.l - PAD.r, ih = h - PAD.t - PAD.b;
  const sx = (x: number) => PAD.l + (iw * (x - xMin)) / (xMax - xMin);
  const sy = (y: number) => PAD.t + ih - (ih * (y - lo)) / (hi - lo);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", height: "auto" }}>
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const val = lo + ((hi - lo) * i) / yTicks;
        const y = PAD.t + ih - (ih * i) / yTicks;
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={w - PAD.r} y2={y} stroke="var(--syn-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 3} fill="var(--syn-mute)" fontFamily="var(--f-mono)" fontSize="9" textAnchor="end">
              {Number.isInteger(val) ? val : val.toFixed(1)}
            </text>
          </g>
        );
      })}
      {series.map((s, si) => {
        if (!s.points.length) return null;
        const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
        return (
          <g key={si}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {s.points.length <= 40 && s.points.map((p, i) => (
              <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="2.2" fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function ChartEmpty({ label = "no signal yet" }: { label?: string }) {
  return (
    <div style={{
      width: "100%", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--syn-mute)", font: "500 10px/1 var(--f-mono)", letterSpacing: "0.22em", textTransform: "uppercase",
    }}>
      {label}
    </div>
  );
}
