import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import type { Agent, TraitKey } from "../lib/types";
import { initials, TRAIT_ORDER, voiceOf } from "../lib/util";
import { Kicker, Modal, Dot } from "../components/ui";
import { riseItem, stagger } from "../motion/variants";

const TRAIT_CAP: Record<TraitKey, string> = {
  curiosity: "CURIOSITY", assertiveness: "DECISIVE", warmth: "WARMTH",
  skepticism: "SKEPTIC", humor: "HUMOR", emotional: "VOLATILE",
};
const PALETTE = ["#5EE5C8", "#B08D57", "#9B4D6E", "#6E8CA0", "#5FA8D3", "#6B8E7B", "#C19A4B", "#E59A8C", "#B5544A"];

export function Minds() {
  const store = useStore();
  const [agents, setAgents] = useState<Agent[]>(store.agents);
  const [sel, setSel] = useState<string | null>(null);
  const [summon, setSummon] = useState(false);

  useEffect(() => {
    api.agents().then((a) => { setAgents(a); if (!sel && a.length) setSel(a[0].id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tick]);

  const current = useMemo(() => agents.find((a) => a.id === sel) ?? agents[0], [agents, sel]);

  const refresh = async () => {
    const a = await api.agents();
    setAgents(a);
    await store.refreshCore();
  };

  const del = async (id: string) => {
    await api.deleteAgent(id);
    await refresh();
    setSel((p) => (p === id ? null : p));
    store.pushToast("Resident dismissed");
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", height: "100%", background: "var(--syn-void)" }}>
      {/* list */}
      <div style={{ borderRight: "1px solid var(--syn-line)", background: "var(--syn-onyx)", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "24px 24px 18px", borderBottom: "1px solid var(--syn-line)" }}>
          <Kicker>Residents</Kicker>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 14 }}>
            <span style={{ font: "500 28px/1 var(--f-display)", letterSpacing: "-.02em" }}>{String(agents.length).padStart(2, "0")}</span>
            <button onClick={() => setSummon(true)} style={{ font: "400 11px/1 var(--f-mono)", letterSpacing: "0.16em", color: "var(--syn-phos)" }}>+ summon</button>
          </div>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show"
          style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4, overflow: "auto", flex: 1 }}>
          {agents.map((a) => {
            const on = a.id === current?.id;
            return (
              <motion.button key={a.id} variants={riseItem} onClick={() => setSel(a.id)}
                style={{
                  padding: "14px 12px", borderRadius: 10, textAlign: "left",
                  display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 12, alignItems: "center",
                  background: on ? "var(--syn-panel)" : "transparent",
                  border: `1px solid ${on ? "var(--syn-phos)" : "transparent"}`,
                  transition: "background var(--t-fast) var(--ease-syn)",
                }}>
                <span style={{
                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--syn-tile)", border: `1px solid ${on ? "var(--syn-phos)" : "var(--syn-line-4)"}`,
                  color: on ? "var(--syn-phos)" : "var(--syn-bone)", font: "500 11px/1 var(--f-display)",
                }}>{initials(a.name)}</span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ font: "500 13px/1 var(--f-display)", letterSpacing: "0.06em", color: "var(--syn-bone)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ font: "400 11px/1 var(--f-mono)", color: "var(--syn-ash)", marginTop: 5, letterSpacing: "0.08em" }}>{voiceOf(a.traits)}</div>
                </span>
                {on ? <Dot live /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.color, opacity: 0.7 }} />}
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* detail */}
      <div style={{ overflow: "auto", padding: "32px 36px" }}>
        {current ? <Detail key={current.id} a={current} onDelete={() => del(current.id)} /> : <EmptyDetail onSummon={() => setSummon(true)} onSeed={store.seed} />}
      </div>

      <SummonModal open={summon} onClose={() => setSummon(false)} onCreated={refresh} count={agents.length} />
    </div>
  );
}

function Detail({ a, onDelete }: { a: Agent; onDelete: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}
      style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <Portrait color={a.color} />
          <div>
            <Kicker phos>Resident</Kicker>
            <div style={{ font: "500 52px/1 var(--f-display)", letterSpacing: "-.02em", marginTop: 14 }}>{a.name}</div>
            {a.identity && <div style={{ color: "var(--syn-ash)", font: "400 14px/1.55 var(--f-body)", marginTop: 12, maxWidth: 520 }}>{a.identity}</div>}
          </div>
        </div>
        <button onClick={onDelete} title="dismiss"
          style={{ height: 36, padding: "0 14px", borderRadius: 8, background: "var(--syn-tile)", border: "1px solid var(--syn-line-4)", color: "var(--syn-ash)", font: "500 10px/1 var(--f-mono)", letterSpacing: "0.22em", textTransform: "uppercase" }}>
          Dismiss
        </button>
      </div>

      {/* bento */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card" style={{ gridRow: "span 2", padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Kicker>Personality</Kicker>
            <span style={{ font: "400 10px/1 var(--f-mono)", color: "var(--syn-ash)", letterSpacing: "0.16em" }}>6 axes</span>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 0" }}>
            <Radar traits={a.traits} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--syn-line)", paddingTop: 18 }}>
            {TRAIT_ORDER.map((k) => {
              const v = a.traits[k] ?? 0;
              return (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "90px 1fr 40px", gap: 14, alignItems: "center" }}>
                  <span style={{ font: "500 10px/1 var(--f-mono)", letterSpacing: "0.18em", color: "var(--syn-ash)" }}>{TRAIT_CAP[k]}</span>
                  <div style={{ height: 3, background: "var(--syn-tile)", borderRadius: 2 }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: "100%", background: v > 0.66 ? "var(--syn-phos)" : "var(--syn-bone)", borderRadius: 2 }} />
                  </div>
                  <span style={{ font: "500 11px/1 var(--f-mono)", textAlign: "right", color: "var(--syn-bone)" }}>{v.toFixed(2).slice(1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Panel title="Core values" body={a.values_anchor} accent />
        <Panel title="Voice signature" body={a.speaking_style} italic />
        <Panel title="Background" body={a.background} span />
      </div>
    </motion.div>
  );
}

function Panel({ title, body, accent, italic, span }: { title: string; body?: string; accent?: boolean; italic?: boolean; span?: boolean }) {
  return (
    <div className="card" style={{ padding: 24, gridColumn: span ? "span 2" : undefined }}>
      <Kicker style={{ marginBottom: 16 }}>{title}</Kicker>
      {body
        ? <div style={{ color: "var(--syn-bone)", font: "400 15px/1.6 var(--f-body)", fontStyle: italic ? "italic" : "normal", whiteSpace: "pre-wrap" }}>{body}</div>
        : <div style={{ color: "var(--syn-mute)", font: "400 13px/1.5 var(--f-body)" }}>—</div>}
      {accent && <span style={{ display: "block", width: 24, height: 2, background: "var(--syn-phos)", marginTop: 16 }} />}
    </div>
  );
}

function Portrait({ color }: { color: string }) {
  return (
    <div style={{ width: 120, height: 120, borderRadius: 16, background: "linear-gradient(135deg,#1C1D20,#0A0A0B)", border: "1px solid var(--syn-line-4)", position: "relative", overflow: "hidden", display: "grid", placeItems: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 30%, ${color}22, transparent 55%)` }} />
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="42" fill="none" stroke="var(--syn-bone)" strokeWidth=".4" opacity=".3" />
        <circle cx="44" cy="44" r="32" fill="none" stroke="var(--syn-bone)" strokeWidth=".4" opacity=".5" />
        <circle cx="44" cy="44" r="22" fill="none" stroke="var(--syn-bone)" strokeWidth=".5" opacity=".7" />
        <circle cx="44" cy="44" r="10" fill="var(--syn-bone)" />
        <circle cx="44" cy="44" r="4" fill="var(--syn-void)" />
      </svg>
    </div>
  );
}

function Radar({ traits }: { traits: Agent["traits"] }) {
  const S = 300, C = S / 2, R = 120;
  const pts = TRAIT_ORDER.map((k, i) => {
    const ang = (-90 + i * 60) * (Math.PI / 180);
    const v = traits[k] ?? 0;
    const r = 26 + v * (R - 26);
    return { x: C + Math.cos(ang) * r, y: C + Math.sin(ang) * r, ax: C + Math.cos(ang) * R, ay: C + Math.sin(ang) * R, lx: C + Math.cos(ang) * (R + 22), ly: C + Math.sin(ang) * (R + 22), k, v };
  });
  const poly = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${S} ${S}`} style={{ maxWidth: 320, height: "auto", overflow: "visible" }}>
      {[40, 80, 120].map((r) => <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="var(--syn-tile)" strokeWidth="1" />)}
      {pts.map((p, i) => <line key={i} x1={C} y1={C} x2={p.ax} y2={p.ay} stroke="var(--syn-line)" strokeWidth=".5" />)}
      <motion.polygon points={poly} fill="var(--syn-phos-soft)" stroke="var(--syn-phos)" strokeWidth="1.5"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }} style={{ transformOrigin: "center" }} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--syn-phos)" />)}
      {pts.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor={p.lx < C - 10 ? "end" : p.lx > C + 10 ? "start" : "middle"}
          fill="var(--syn-ash)" fontFamily="var(--f-mono)" fontSize="8" letterSpacing="1.4">
          {TRAIT_CAP[p.k]} · {(p.v).toFixed(2).slice(1)}
        </text>
      ))}
    </svg>
  );
}

function EmptyDetail({ onSummon, onSeed }: { onSummon: () => void; onSeed: () => void }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
      <Portrait color="#5EE5C8" />
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-solid btn-sm" onClick={onSeed}>Summon a society</button>
        <button className="btn btn-ghost btn-sm" onClick={onSummon}>+ One resident</button>
      </div>
    </div>
  );
}

function SummonModal({ open, onClose, onCreated, count }: { open: boolean; onClose: () => void; onCreated: () => void; count: number }) {
  const store = useStore();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [identity, setIdentity] = useState("");
  const [values, setValues] = useState("");
  const [background, setBackground] = useState("");
  const [voice, setVoice] = useState("");
  const [traits, setTraits] = useState<Record<TraitKey, number>>(
    { curiosity: 0.5, assertiveness: 0.5, warmth: 0.5, skepticism: 0.5, humor: 0.5, emotional: 0.5 });

  useEffect(() => { if (open) { setName(""); setColor(PALETTE[count % PALETTE.length]); setIdentity(""); setValues(""); setBackground(""); setVoice(""); } }, [open, count]);

  const create = async () => {
    if (!name.trim()) return;
    await api.createAgent({ name: name.trim(), color, identity, values_anchor: values, background, speaking_style: voice, traits });
    onClose();
    onCreated();
    store.pushToast("Resident summoned");
  };

  return (
    <Modal open={open} onClose={onClose} width={680}>
      <Kicker phos>Summon a resident</Kicker>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 20 }}>
        <Lab label="Name"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. KAIROS" /></Lab>
        <Lab label="Signal color">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 6 }}>
            {PALETTE.map((c) => <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--syn-bone)" : "1px solid var(--syn-line-4)" }} />)}
          </div>
        </Lab>
      </div>
      <Lab label="Identity" style={{ marginTop: 14 }}><textarea className="field" rows={2} value={identity} onChange={(e) => setIdentity(e.target.value)} /></Lab>
      <Lab label="Core values" style={{ marginTop: 14 }}><textarea className="field" rows={2} value={values} onChange={(e) => setValues(e.target.value)} /></Lab>
      <Lab label="Background" style={{ marginTop: 14 }}><textarea className="field" rows={2} value={background} onChange={(e) => setBackground(e.target.value)} /></Lab>
      <Lab label="Voice" style={{ marginTop: 14 }}><textarea className="field" rows={2} value={voice} onChange={(e) => setVoice(e.target.value)} /></Lab>
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
        {TRAIT_ORDER.map((k) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "84px 1fr 32px", gap: 10, alignItems: "center" }}>
            <span style={{ font: "500 9px/1 var(--f-mono)", letterSpacing: "0.16em", color: "var(--syn-ash)" }}>{TRAIT_CAP[k]}</span>
            <input type="range" min={0} max={1} step={0.01} value={traits[k]} onChange={(e) => setTraits((t) => ({ ...t, [k]: parseFloat(e.target.value) }))} />
            <span style={{ font: "500 10px/1 var(--f-mono)", textAlign: "right", color: "var(--syn-bone)" }}>{traits[k].toFixed(2).slice(1)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-solid btn-sm" onClick={create} disabled={!name.trim()}>Summon</button>
      </div>
    </Modal>
  );
}

function Lab({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "block", ...style }}>
      <div className="kicker" style={{ marginBottom: 8 }}>{label}</div>
      {children}
    </label>
  );
}
