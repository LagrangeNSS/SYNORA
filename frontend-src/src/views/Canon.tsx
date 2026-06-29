import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { Dot, Kicker } from "../components/ui";

export function Canon() {
  const store = useStore();
  const [text, setText] = useState(store.worldview);
  const [saved, setSaved] = useState(true);

  useEffect(() => { setText(store.worldview); setSaved(true); }, [store.worldview]);

  const commit = async () => { await store.saveWorldview(text); setSaved(true); };
  const clear = async () => { setText(""); await store.saveWorldview(""); setSaved(true); };

  const minds = store.agents.length;
  const mems = store.overview?.memory_total ?? 0;
  const msgs = store.overview?.message_total ?? 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100%", background: "var(--syn-void)" }}>
      {/* editor */}
      <div style={{ padding: "48px 64px", overflow: "auto", display: "flex", flexDirection: "column", gap: 28, background: "radial-gradient(ellipse at 50% 0%,rgba(94,229,200,.025),transparent 40%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <Kicker>Canon · the shared ground</Kicker>
            <div style={{ font: "500 44px/1 var(--f-display)", letterSpacing: "-.025em", marginTop: 18 }}>
              {minds ? `A society of ${minds} minds.` : "An unwritten world."}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: saved ? "var(--syn-phos)" : "var(--syn-ash)", font: "500 10px/1 var(--f-mono)", letterSpacing: "0.24em", textTransform: "uppercase" }}>
            <Dot live={saved} />
            {saved ? "in canon" : "uncommitted"}
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}
          className="card" style={{ flex: 1, padding: "36px 44px", display: "flex", minHeight: 320 }}>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(e.target.value === store.worldview); }}
            placeholder="A grove between two long rivers. There is daylight without a sun…"
            style={{
              flex: 1, width: "100%", resize: "none", background: "transparent", border: "none", outline: "none",
              color: "var(--syn-bone)", font: "400 20px/1.6 var(--f-display)", letterSpacing: "-.005em",
              caretColor: "var(--syn-phos)",
            }} />
        </motion.div>
      </div>

      {/* resonance rail */}
      <div style={{ borderLeft: "1px solid var(--syn-line)", background: "var(--syn-onyx)", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Kicker>Resonance</Kicker>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
            <Bar label="bound minds" value={`${minds} / ${minds}`} frac={1} accent />
            <Bar label="memories linked" value={String(mems)} frac={Math.min(1, mems / Math.max(mems, 50))} />
            <Bar label="utterances" value={String(msgs)} frac={Math.min(1, msgs / Math.max(msgs, 50))} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--syn-line)", paddingTop: 24 }}>
          <Kicker>Scope</Kicker>
          <div style={{ color: "var(--syn-ash)", font: "400 12px/1.6 var(--f-body)", marginTop: 14 }}>
            {text.trim() ? `${text.trim().length} glyphs of shared ground, injected into every turn.` : "No shared ground set. Each mind reasons alone."}
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn btn-solid" style={{ justifyContent: "center" }} onClick={commit} disabled={saved}>Commit revision</button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: "center" }} onClick={clear} disabled={!text.trim()}>Clear canon</button>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, frac, accent }: { label: string; value: string; frac: number; accent?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ font: "400 11px/1 var(--f-body)", color: "var(--syn-bone)" }}>{label}</span>
        <span style={{ font: "500 11px/1 var(--f-mono)", color: "var(--syn-bone)" }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "var(--syn-tile)", borderRadius: 2 }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${frac * 100}%` }} transition={{ duration: 0.56 }}
          style={{ height: "100%", background: accent ? "var(--syn-phos)" : "var(--syn-bone)", borderRadius: 2 }} />
      </div>
    </div>
  );
}
