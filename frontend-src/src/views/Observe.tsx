import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import type { Message } from "../lib/types";
import { initials } from "../lib/util";
import { Dot, Kicker } from "../components/ui";
import { speechIn, stagger } from "../motion/variants";

export function Observe() {
  const store = useStore();
  const feedRef = useRef<HTMLDivElement>(null);
  const [openThought, setOpenThought] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const msgs = store.messages;
  const lastId = msgs.length ? msgs[msgs.length - 1].id : -1;
  const running = store.engineMode !== "idle";

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const inject = () => {
    const t = draft.trim();
    store.injectTopic(t);
    setDraft("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--syn-void)" }}>
      {/* header */}
      <header style={{
        padding: "22px 32px", borderBottom: "1px solid var(--syn-line)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flex: "none",
      }}>
        <div>
          <Kicker phos={running}>{running ? "Live · observing" : "Observe"}</Kicker>
          <div style={{ font: "500 22px/1 var(--f-display)", letterSpacing: "-.01em", marginTop: 10 }}>
            {store.agents.length
              ? `${store.agents.length} minds, talking to themselves`
              : "An empty agora"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Stat label="Turn" value={String(store.overview?.turn ?? 0)} />
          <Stat label="Voices" value={String(store.overview?.message_total ?? msgs.length)} />
          <Dot live={running} />
        </div>
      </header>

      {/* feed */}
      <div ref={feedRef} style={{ flex: 1, overflow: "auto", padding: "26px 32px" }}>
        {msgs.length === 0 ? (
          <EmptyFeed seeded={store.agents.length > 0} onSeed={store.seed} onStep={store.advance} needsKey={store.needsKey} />
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show"
            style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 880 }}>
            {msgs.map((m, i) => (
              <Speech key={m.id} m={m} active={m.id === lastId && (running || store.busy)}
                isLast={i === msgs.length - 1}
                open={openThought === m.id}
                onToggle={() => setOpenThought((p) => (p === m.id ? null : m.id))} />
            ))}
          </motion.div>
        )}
      </div>

      {/* scrub / controls */}
      <footer style={{ borderTop: "1px solid var(--syn-line)", background: "var(--syn-onyx)", padding: "16px 32px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <button className="btn btn-solid btn-sm" onClick={() => store.advance()} disabled={running}>
            <Tri /> Advance
          </button>
          <button className={`btn btn-sm ${store.engineMode === "auto" ? "btn-phos" : "btn-ghost"}`} onClick={store.toggleAuto}>
            {store.engineMode === "auto" ? <><Dot live /> Auto · {store.cadence.toFixed(2)}×</> : <>Auto</>}
          </button>
          <button className={`btn btn-sm ${store.engineMode === "forever" ? "btn-phos" : "btn-ghost"}`} onClick={store.toggleForever}>
            {store.engineMode === "forever" ? <><Dot live /> Running</> : <>∞ Sustain</>}
          </button>

          <div style={{ flex: 1 }} />
          <div style={{
            flex: "0 1 420px", display: "flex", alignItems: "center", gap: 10,
            background: "var(--syn-void)", border: "1px solid var(--syn-line-2)", borderRadius: 8, padding: "9px 14px",
          }}>
            <span style={{ font: "500 9px/1 var(--f-mono)", letterSpacing: "0.24em", color: "var(--syn-phos)" }}>INJECT ›</span>
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") inject(); }}
              placeholder="a sudden turn of events…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--syn-bone)", font: "400 14px/1 var(--f-body)" }} />
            <span style={{ font: "400 10px/1 var(--f-mono)", color: "var(--syn-mute)" }}>⏎</span>
          </div>
        </div>
        <Scrub turn={store.overview?.turn ?? 0} count={msgs.length} />
      </footer>
    </div>
  );
}

function Speech({ m, active, isLast, open, onToggle }:
  { m: Message; active: boolean; isLast: boolean; open: boolean; onToggle: () => void }) {
  const showThought = (active && isLast) || open;
  return (
    <motion.div variants={speechIn} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 18 }}>
      {/* avatar column */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
        {active && (
          <span style={{
            position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
            width: 52, height: 52, borderRadius: "50%", border: "1px solid var(--syn-phos-dim)",
            animation: "synSignalPulse 2s ease-out infinite",
          }} />
        )}
        <div style={{
          width: 36, height: 36, borderRadius: "50%", zIndex: 1,
          background: active ? "var(--syn-void)" : "var(--syn-tile)",
          border: `1px solid ${active ? "var(--syn-phos)" : "var(--syn-line-4)"}`,
          color: active ? "var(--syn-phos)" : "var(--syn-bone)",
          display: "flex", alignItems: "center", justifyContent: "center",
          font: "500 11px/1 var(--f-display)", letterSpacing: "0.04em",
          boxShadow: active ? "0 0 16px var(--syn-phos-dim)" : undefined,
        }}>{initials(m.name)}</div>
        {!isLast && <div style={{ width: 1, flex: 1, background: "var(--syn-line)" }} />}
      </div>
      {/* body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ font: "500 13px/1 var(--f-display)", letterSpacing: "0.07em", color: active ? "var(--syn-phos)" : "var(--syn-bone)" }}>{m.name}</span>
          <span style={{ font: "400 10px/1 var(--f-mono)", letterSpacing: "0.16em", color: "var(--syn-ash)" }}>{String(m.turn).padStart(4, "0")}</span>
          {m.mood && (
            <span style={{
              padding: "3px 8px", borderRadius: 4,
              font: "500 9px/1 var(--f-mono)", letterSpacing: "0.18em", textTransform: "uppercase",
              background: active ? "var(--syn-phos-soft)" : "var(--syn-tile)",
              color: active ? "var(--syn-phos)" : "var(--syn-bone)",
              border: active ? "1px solid var(--syn-phos-dim)" : "none",
            }}>{m.mood}</span>
          )}
          {m.thinking && !showThought && (
            <button onClick={onToggle} title="inner monologue"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--syn-ash)", font: "500 9px/1 var(--f-mono)", letterSpacing: "0.18em" }}>
              <svg width="10" height="10" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="6" cy="6" r="1.4" fill="currentColor" /></svg>
              THOUGHT
            </button>
          )}
        </div>

        {showThought && m.thinking && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{
              padding: "14px 16px", background: "var(--syn-panel)",
              border: "1px solid var(--syn-phos-dim)", borderRadius: 10,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--syn-phos)", font: "500 9px/1 var(--f-mono)", letterSpacing: "0.24em", textTransform: "uppercase" }}>
              <svg width="10" height="10" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" /><circle cx="6" cy="6" r="1.5" fill="currentColor" /></svg>
              {active ? "composing" : "thought"}
              {!active && <button onClick={onToggle} style={{ marginLeft: "auto", color: "var(--syn-ash)" }}>✕</button>}
            </div>
            <div style={{ color: "var(--syn-bone)", font: "400 14px/1.55 var(--f-body)", fontStyle: "italic" }}>
              {m.thinking}
              {active && <span style={{ display: "inline-block", width: 6, height: 14, background: "var(--syn-phos)", marginLeft: 4, verticalAlign: -2, animation: "synCursorBlink .7s steps(1) infinite" }} />}
            </div>
          </motion.div>
        )}

        <div style={{ color: "var(--syn-bone)", font: "400 16px/1.55 var(--f-body)" }}>{m.content}</div>
      </div>
    </motion.div>
  );
}

function Scrub({ turn, count }: { turn: number; count: number }) {
  const ticks = Math.min(count, 16);
  return (
    <div style={{ position: "relative", height: 22, display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <div style={{ height: 2, width: "100%", background: "var(--syn-tile)", borderRadius: 2, position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: "100%", background: "var(--syn-bone)", borderRadius: 2, opacity: 0.85 }} />
        </div>
      </div>
      {Array.from({ length: ticks }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: `${(i / Math.max(ticks - 1, 1)) * 96 + 2}%`, top: "50%", transform: "translateY(-50%)", width: 1, height: 8, background: "var(--syn-line-5)" }} />
      ))}
      <div style={{ position: "absolute", right: 0, top: -2, font: "400 9px/1 var(--f-mono)", color: "var(--syn-mute)", letterSpacing: "0.16em" }}>T·{turn}</div>
    </div>
  );
}

function EmptyFeed({ seeded, onSeed, onStep, needsKey }:
  { seeded: boolean; onSeed: () => void; onStep: () => void; needsKey: boolean }) {
  return (
    <div style={{ height: "100%", minHeight: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <div style={{ width: 80, height: 80, position: "relative", display: "grid", placeItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid var(--syn-line-3)", animation: "synBreath 4s ease-in-out infinite" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--syn-ash)" }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {!seeded
          ? <button className="btn btn-solid btn-sm" onClick={onSeed}>Summon a society</button>
          : <button className="btn btn-solid btn-sm" onClick={onStep} disabled={needsKey}><Tri /> Begin</button>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
      <span className="kicker">{label}</span>
      <span style={{ font: "500 16px/1 var(--f-mono)", color: "var(--syn-bone)" }}>{value}</span>
    </div>
  );
}

function Tri() {
  return <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 2 L9 6 L3 10 Z" fill="currentColor" /></svg>;
}
