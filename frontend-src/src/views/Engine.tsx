import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { Kicker, Switch } from "../components/ui";
import { Bars } from "../components/charts";
import { riseItem, stagger } from "../motion/variants";

export function Engine() {
  const store = useStore();
  const cfg = store.config;
  const [model, setModel] = useState(cfg?.deepseek_model ?? "deepseek-v4-flash");
  const [key, setKey] = useState("");

  useEffect(() => { if (cfg) setModel(cfg.deepseek_model); }, [cfg?.deepseek_model]);

  const saveModel = () => store.saveConfig({ deepseek_model: model || undefined, deepseek_key: key || undefined }).then(() => setKey(""));

  const ov = store.overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--syn-void)" }}>
      <header style={{ padding: "22px 32px", borderBottom: "1px solid var(--syn-line)", flex: "none" }}>
        <Kicker>Engine</Kicker>
        <div style={{ font: "500 22px/1 var(--f-display)", letterSpacing: "-.01em", marginTop: 8 }}>Model · cadence · depth</div>
      </header>

      <motion.div variants={stagger} initial="hidden" animate="show"
        style={{ flex: 1, overflow: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridAutoRows: "min-content", gap: 14 }}>
        {/* model + depth */}
        <motion.div variants={riseItem} className="card" style={{ gridColumn: "span 8", borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
          <Kicker>Mind engine</Kicker>

          <div style={{ padding: "18px 20px", background: "var(--syn-void)", border: "1px solid var(--syn-line-2)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "500 16px/1 var(--f-display)", letterSpacing: "0.04em" }}>DEEPSEEK</div>
              <input className="field" value={model} onChange={(e) => setModel(e.target.value)}
                style={{ marginTop: 10, background: "transparent", border: "none", padding: 0, font: "400 12px/1.4 var(--f-mono)", color: "var(--syn-ash)", letterSpacing: "0.08em" }} />
            </div>
            <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none",
              background: cfg?.has_deepseek_key ? "var(--syn-phos)" : "var(--syn-line-5)",
              boxShadow: cfg?.has_deepseek_key ? "0 0 8px var(--syn-phos)" : undefined }} />
          </div>

          <div>
            <div className="kicker" style={{ marginBottom: 8 }}>API key</div>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="field" type="password" value={key} onChange={(e) => setKey(e.target.value)}
                placeholder={cfg?.has_deepseek_key ? "•••••••• · stored locally" : "paste sk-… to bring minds online"} />
              <button className="btn btn-solid btn-sm" onClick={saveModel} disabled={!key && model === cfg?.deepseek_model}>Save</button>
            </div>
          </div>

          {/* deep thinking */}
          <div style={{ padding: 20, background: "var(--syn-void)", border: "1px solid var(--syn-line-2)", borderRadius: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "center" }}>
            <div>
              <div style={{ font: "500 16px/1 var(--f-display)", letterSpacing: "0.02em" }}>Deep thinking</div>
              <div style={{ color: "var(--syn-ash)", font: "400 12px/1.5 var(--f-body)", marginTop: 8 }}>
                Inner monologue runs before every utterance · a deliberation pass, then speech.
              </div>
            </div>
            <Switch on={!!cfg?.deliberate} onChange={(v) => store.saveConfig({ deliberate: v })} />
          </div>

          {/* secondary toggles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ToggleRow label="Persona anchor" on={!!cfg?.anchor_enabled} onChange={(v) => store.saveConfig({ anchor_enabled: v })} />
            <ToggleRow label="Mood drift" on disabled />
          </div>

          {/* cadence */}
          <div style={{ borderTop: "1px solid var(--syn-line)", paddingTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ font: "500 16px/1 var(--f-display)", letterSpacing: "0.02em" }}>Cadence</span>
              <span style={{ font: "500 22px/1 var(--f-mono)" }}>{store.cadence.toFixed(2)}×</span>
            </div>
            <input type="range" min={0} max={1} step={0.01} value={store.cadence} onChange={(e) => store.setCadence(parseFloat(e.target.value))} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, font: "500 9px/1 var(--f-mono)", letterSpacing: "0.18em", color: "var(--syn-mute)" }}>
              <span>STILL</span><span>SLOW</span><span>NORM</span><span>QUICK</span><span>RACING</span>
            </div>
          </div>
        </motion.div>

        {/* run stats */}
        <motion.div variants={riseItem} className="card" style={{ gridColumn: "span 4", borderRadius: 14, padding: 28, display: "flex", flexDirection: "column", gap: 22 }}>
          <Kicker>Run</Kicker>
          <div>
            <div style={{ font: "500 44px/1 var(--f-mono)", letterSpacing: "-.02em" }}>{ov?.turn ?? 0}</div>
            <div style={{ color: "var(--syn-phos)", font: "500 11px/1 var(--f-mono)", marginTop: 8, letterSpacing: "0.18em" }}>TURNS ELAPSED</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--syn-line)", paddingTop: 18 }}>
            <StatRow label="RESIDENTS" value={String(store.agents.length)} />
            <StatRow label="MEMORIES" value={String(ov?.memory_total ?? 0)} />
            <StatRow label="UTTERANCES" value={String(ov?.message_total ?? 0)} />
            <StatRow label="ENGINE" value={store.engineMode === "idle" ? "idle" : store.engineMode} accent={store.engineMode !== "idle"} />
          </div>
          <div style={{ marginTop: "auto" }}>
            <Bars data={[3, 4, 3, 6, 5, 7, 8, 10, 6, 4, 3]} highlight={7} h={50} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function ToggleRow({ label, on, onChange, disabled }: { label: string; on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div style={{ padding: "14px 18px", background: "var(--syn-void)", border: "1px solid var(--syn-line-2)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ font: "500 13px/1 var(--f-body)" }}>{label}</span>
      <Switch on={on} onChange={(v) => !disabled && onChange?.(v)} />
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ font: "500 10px/1 var(--f-mono)", letterSpacing: "0.18em", color: "var(--syn-ash)" }}>{label}</span>
      <span style={{ font: "500 12px/1 var(--f-mono)", color: accent ? "var(--syn-phos)" : "var(--syn-bone)", textTransform: "uppercase" }}>{value}</span>
    </div>
  );
}
