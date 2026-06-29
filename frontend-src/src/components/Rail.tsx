import type { ViewKey } from "../lib/types";
import { LogoMark } from "./Logo";

const ICONS: Record<ViewKey, JSX.Element> = {
  observe: (<><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12" r="2" fill="currentColor" /></>),
  minds: (<><circle cx="8" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="16" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3 19 C 3 15 21 15 21 19" stroke="currentColor" strokeWidth="1.4" fill="none" /></>),
  constellation: (<><circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8 11 L16 7 M8 13 L16 17" stroke="currentColor" strokeWidth="1.4" /></>),
  memory: (<><path d="M4 16 L8 12 L12 14 L20 6" stroke="currentColor" strokeWidth="1.4" fill="none" /><circle cx="20" cy="6" r="1.5" fill="currentColor" /></>),
  canon: (<path d="M12 3 L20 12 L12 21 L4 12 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />),
  engine: (<><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M12 3 L12 6 M12 18 L12 21 M3 12 L6 12 M18 12 L21 12" stroke="currentColor" strokeWidth="1.4" /></>),
};

const ORDER: ViewKey[] = ["observe", "minds", "constellation", "memory", "canon", "engine"];

export function Rail({ active, onChange, live }: { active: ViewKey; onChange: (v: ViewKey) => void; live?: boolean }) {
  return (
    <div style={{
      width: 72, flex: "none", borderRight: "1px solid var(--syn-line)",
      background: "var(--syn-onyx)", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "18px 0", gap: 16, position: "relative", zIndex: 2,
    }}>
      <div style={{ padding: "8px 0" }}>
        <LogoMark size={28} breathe />
      </div>
      <div style={{ width: 32, height: 1, background: "var(--syn-line)" }} />
      <nav style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
        {ORDER.map((v) => {
          const on = v === active;
          return (
            <button key={v} onClick={() => onChange(v)} title={v}
              style={{
                width: 40, height: 40, borderRadius: 10, position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? "var(--syn-tile)" : "transparent",
                border: on ? "1px solid var(--syn-line-4)" : "1px solid transparent",
                color: "var(--syn-bone)",
                transition: "background var(--t-fast) var(--ease-syn), opacity var(--t-fast) var(--ease-syn)",
                opacity: on ? 1 : 0.55,
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.opacity = "0.55"; }}>
              {on && <span style={{ position: "absolute", left: -12, top: 8, width: 2, height: 24, background: "var(--syn-phos)", borderRadius: 2 }} />}
              <svg width="18" height="18" viewBox="0 0 24 24">{ICONS[v]}</svg>
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: "auto" }}>
        <span style={{ display: "block", width: 6, height: 6, borderRadius: "50%",
          background: live ? "var(--syn-phos)" : "var(--syn-line-5)",
          boxShadow: live ? "0 0 10px var(--syn-phos)" : undefined,
          animation: live ? "synBreath 2.4s ease-in-out infinite" : undefined }} />
      </div>
    </div>
  );
}

export { ORDER as RAIL_ORDER };
