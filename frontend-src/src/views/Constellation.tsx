import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import type { Agent, RelHistoryAll, Relationship } from "../lib/types";
import { clamp, initials, pairKey } from "../lib/util";
import { Kicker } from "../components/ui";

type Metric = "affinity" | "trust" | "familiarity";
const W = 800, H = 720, CX = 400, CY = 360;

export function Constellation() {
  const store = useStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [metric, setMetric] = useState<Metric>("affinity");
  const [focus, setFocus] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // replay
  const [replay, setReplay] = useState(false);
  const [hist, setHist] = useState<RelHistoryAll | null>(null);
  const [rt, setRt] = useState(0);
  const playRef = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([api.agents(), api.relationships()]).then(([a, r]) => { setAgents(a); setRels(r); });
  }, [store.tick]);

  // node positions: focus → center, others on a ring
  const pos = useMemo(() => {
    const map: Record<string, { x: number; y: number; r: number }> = {};
    const degree: Record<string, number> = {};
    rels.forEach((r) => { degree[r.a_id] = (degree[r.a_id] || 0) + 1; degree[r.b_id] = (degree[r.b_id] || 0) + 1; });
    const focusId = focus ?? agents.slice().sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))[0]?.id;
    const others = agents.filter((a) => a.id !== focusId);
    const R = Math.min(250, 150 + others.length * 12);
    others.forEach((a, i) => {
      const ang = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const deg = degree[a.id] || 0;
      map[a.id] = { x: CX + Math.cos(ang) * R, y: CY + Math.sin(ang) * R, r: 30 + Math.min(deg, 6) * 3 };
    });
    if (focusId) map[focusId] = { x: CX, y: CY, r: 50 };
    return { map, focusId };
  }, [agents, rels, focus]);

  const valFor = (r: Relationship): number => {
    if (replay && hist) {
      const k = pairKey(r.a_id, r.b_id);
      const snaps = hist.snapshots.filter((s) => pairKey(s.a_id, s.b_id) === k && s.turn <= rt);
      const last = snaps[snaps.length - 1];
      if (last) return metric === "affinity" ? last.affinity : metric === "trust" ? last.trust : last.familiarity;
      const base = hist.base.find((b) => pairKey(b.a_id, b.b_id) === k);
      return metric === "affinity" ? (base?.init_affinity ?? 0) : 0;
    }
    return metric === "affinity" ? r.affinity : metric === "trust" ? r.trust : r.familiarity;
  };

  const edgeStyle = (r: Relationship) => {
    const v = valFor(r);
    if (metric === "affinity") {
      const color = v > 4 ? "var(--syn-phos)" : v < -4 ? "var(--syn-line-5)" : "var(--syn-ash)";
      return { color, width: 1 + Math.min(Math.abs(v), 100) / 28, strong: Math.abs(v) > 40 };
    }
    const t = clamp(v, 0, 100) / 100;
    return { color: t > 0.5 ? "var(--syn-phos)" : "var(--syn-ash)", width: 1 + t * 3.2, strong: t > 0.6 };
  };

  const refresh = async () => { const [a, r] = await Promise.all([api.agents(), api.relationships()]); setAgents(a); setRels(r); store.refreshCore(); };

  const onNode = (id: string) => {
    if (linkFrom) {
      if (linkFrom !== id) {
        api.setRelationship({ a: linkFrom, b: id, affinity: 0, label: "NEW", familiarity: 10, trust: 10 })
          .then(() => { refresh(); store.pushToast("Tie formed"); });
      }
      setLinkFrom(null);
      return;
    }
    setFocus(id); setSelEdge(null);
  };

  const startReplay = async () => {
    if (replay) { stopPlay(); setReplay(false); return; }
    const h = await api.relHistoryAll();
    if (!h.turn) { store.pushToast("No drift to replay yet", "warn"); return; }
    setHist(h); setReplay(true); setRt(0); setSelEdge(null);
  };
  const stopPlay = () => { if (playRef.current) { clearInterval(playRef.current); playRef.current = null; } };
  const togglePlay = () => {
    if (playRef.current) { stopPlay(); return; }
    if (hist && rt >= hist.turn) setRt(0);
    playRef.current = window.setInterval(() => {
      setRt((p) => { if (hist && p >= hist.turn) { stopPlay(); return hist.turn; } return p + 1; });
    }, 360);
  };
  useEffect(() => () => stopPlay(), []);

  const edges = rels.map((r) => ({ r, a: pos.map[r.a_id], b: pos.map[r.b_id], key: pairKey(r.a_id, r.b_id) }))
    .filter((e) => e.a && e.b);
  const selectedRel = selEdge ? rels.find((r) => pairKey(r.a_id, r.b_id) === selEdge) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", height: "100%", background: "var(--syn-void)" }}>
      {/* canvas column */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ padding: "22px 32px", borderBottom: "1px solid var(--syn-line)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <div>
            <Kicker>Constellation</Kicker>
            <div style={{ font: "500 22px/1 var(--f-display)", letterSpacing: "-.01em", marginTop: 8 }}>
              {agents.length} minds · {rels.length} ties{replay && hist ? ` · T·${rt}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="seg">
              {(["affinity", "trust", "familiarity"] as Metric[]).map((m) => (
                <button key={m} className={metric === m ? "on" : ""} onClick={() => setMetric(m)}>{m}</button>
              ))}
            </div>
            <button className={`btn btn-sm ${replay ? "btn-phos" : "btn-ghost"}`} onClick={startReplay}>{replay ? "✕ replay" : "▶ replay"}</button>
          </div>
        </header>

        <div style={{ flex: 1, position: "relative", background: "radial-gradient(ellipse at center,#0E0E10 0%,#0A0A0B 70%)", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px)", backgroundSize: "40px 40px", maskImage: "radial-gradient(ellipse at 50% 50%,#000 30%,transparent 80%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 50%,#000 30%,transparent 80%)" }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(94,229,200,.04),transparent 70%)", animation: "synBreath 8s ease-in-out infinite" }} />

          <svg viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <defs>
              <radialGradient id="nodeGrad" cx="50%" cy="40%" r="50%"><stop offset="0" stopColor="#2A2B30" /><stop offset="1" stopColor="#0F1012" /></radialGradient>
              <radialGradient id="nodeActive" cx="50%" cy="40%" r="50%"><stop offset="0" stopColor="rgba(94,229,200,.4)" /><stop offset=".6" stopColor="rgba(94,229,200,.1)" /><stop offset="1" stopColor="transparent" /></radialGradient>
            </defs>
            <g transform={`translate(${CX} ${CY}) scale(${zoom}) translate(${-CX} ${-CY})`}>
              {/* edges */}
              {edges.map((e) => {
                const st = edgeStyle(e.r);
                const sel = selEdge === e.key;
                const dim = focus && e.r.a_id !== focus && e.r.b_id !== focus;
                return (
                  <g key={e.key} opacity={dim ? 0.25 : 1}>
                    <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={st.color} strokeWidth={st.width}
                      style={{ filter: st.strong ? "drop-shadow(0 0 4px rgba(94,229,200,.3))" : undefined, transition: "stroke .4s, stroke-width .4s" }} />
                    {sel && (
                      <>
                        <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="var(--syn-phos)" strokeWidth="1.6" strokeDasharray="6 6" style={{ filter: "drop-shadow(0 0 6px var(--syn-phos))", animation: "synDashTravel 1.4s linear infinite" }} />
                        <circle r="3" fill="var(--syn-phos)" style={{ filter: "drop-shadow(0 0 6px var(--syn-phos))" }}>
                          <animateMotion path={`M ${e.a.x} ${e.a.y} L ${e.b.x} ${e.b.y}`} dur="2.4s" repeatCount="indefinite" />
                        </circle>
                        <g transform={`translate(${(e.a.x + e.b.x) / 2} ${(e.a.y + e.b.y) / 2})`}>
                          <rect x="-62" y="-12" width="124" height="22" rx="4" fill="var(--syn-panel)" stroke="var(--syn-phos)" strokeWidth=".6" />
                          <text y="3" textAnchor="middle" fill="var(--syn-phos)" fontFamily="var(--f-mono)" fontSize="9" letterSpacing="1.5">
                            {(e.r.label || "TIE").toUpperCase().slice(0, 12)} · {(valFor(e.r) / (metric === "affinity" ? 100 : 100)).toFixed(2).replace("0.", ".")}
                          </text>
                        </g>
                      </>
                    )}
                    {/* hit area */}
                    <line x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="transparent" strokeWidth="14"
                      style={{ cursor: replay ? "default" : "pointer" }}
                      onClick={() => { if (!replay) { setSelEdge(sel ? null : e.key); setFocus(null); } }} />
                  </g>
                );
              })}
              {/* nodes */}
              {agents.map((a) => {
                const p = pos.map[a.id]; if (!p) return null;
                const isFocus = a.id === pos.focusId;
                const isLink = linkFrom === a.id;
                return (
                  <motion.g key={a.id} initial={false} animate={{ x: p.x, y: p.y }} transition={{ duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                    style={{ cursor: "pointer" }} onClick={() => onNode(a.id)}>
                    {isFocus && <circle r={p.r + 30} fill="url(#nodeActive)" />}
                    {isFocus && <circle r={p.r + 12} fill="none" stroke="rgba(94,229,200,.25)" strokeWidth="1" style={{ animation: "synBreath 3s ease-in-out infinite" }} />}
                    <circle r={p.r} fill="url(#nodeGrad)" stroke={isFocus || isLink ? "var(--syn-phos)" : "var(--syn-line-4)"} strokeWidth={isFocus ? 1.5 : 1}
                      style={{ filter: isFocus ? "drop-shadow(0 0 12px rgba(94,229,200,.5))" : undefined }} />
                    <text y="-2" textAnchor="middle" fill="var(--syn-bone)" fontFamily="var(--f-display)" fontSize={isFocus ? 16 : 13} fontWeight="500" letterSpacing="1">{initials(a.name)}</text>
                    <text y="14" textAnchor="middle" fill={isFocus ? "var(--syn-phos)" : "var(--syn-ash)"} fontFamily="var(--f-mono)" fontSize="8" letterSpacing="1.4">{a.name.slice(0, 8)}</text>
                  </motion.g>
                );
              })}
            </g>
          </svg>

          {/* zoom controls */}
          <div style={{ position: "absolute", bottom: 80, left: 24, display: "flex", flexDirection: "column", gap: 6 }}>
            {[["+", () => setZoom((z) => clamp(z + 0.15, 0.6, 2))], ["−", () => setZoom((z) => clamp(z - 0.15, 0.6, 2))], ["⊙", () => { setZoom(1); setFocus(null); }]].map(([t, fn], i) => (
              <button key={i} onClick={fn as () => void} style={{ width: 32, height: 32, borderRadius: 6, background: "var(--syn-panel)", border: "1px solid var(--syn-line-2)", color: "var(--syn-bone)", font: "500 14px/1 var(--f-body)" }}>{t as string}</button>
            ))}
          </div>

          {/* replay scrub */}
          {replay && hist && (
            <div style={{ position: "absolute", left: 24, right: 24, bottom: 20, display: "flex", alignItems: "center", gap: 12, background: "var(--syn-panel-2)", border: "1px solid var(--syn-line-3)", borderRadius: 10, padding: "10px 14px" }}>
              <button className="btn btn-phos btn-sm" style={{ minWidth: 34, justifyContent: "center", padding: "8px 10px" }} onClick={togglePlay}>{playRef.current ? "⏸" : "▶"}</button>
              <input type="range" min={0} max={hist.turn} value={rt} onChange={(e) => setRt(parseInt(e.target.value, 10))} style={{ flex: 1 }} />
              <span style={{ font: "500 11px/1 var(--f-mono)", color: "var(--syn-phos)", minWidth: 40, textAlign: "right" }}>#{rt}</span>
            </div>
          )}
        </div>
      </div>

      {/* side panel */}
      <SidePanel agents={agents} rels={rels} metric={metric}
        focus={pos.focusId === focus ? focus : focus}
        focusId={pos.focusId} selectedRel={selectedRel} valFor={valFor}
        linkMode={!!linkFrom} onLink={() => setLinkFrom((p) => (p ? null : "PICK"))}
        onPickFirst={() => {}} setLinkFrom={setLinkFrom}
        onSelectEdge={(k) => { setSelEdge(k); setFocus(null); }}
        onSave={refresh} onCloseEdge={() => setSelEdge(null)} />
    </div>
  );
}

function SidePanel(props: {
  agents: Agent[]; rels: Relationship[]; metric: Metric; focus: string | null; focusId?: string;
  selectedRel: Relationship | null | undefined; valFor: (r: Relationship) => number;
  linkMode: boolean; onLink: () => void; onPickFirst: () => void; setLinkFrom: (s: string | null) => void;
  onSelectEdge: (k: string) => void; onSave: () => void; onCloseEdge: () => void;
}) {
  const { agents, rels, selectedRel, focus, focusId } = props;
  if (selectedRel) return <EdgeEditor rel={selectedRel} agents={agents} onSave={props.onSave} onClose={props.onCloseEdge} />;
  const node = agents.find((a) => a.id === (focus ?? focusId));
  return (
    <div style={{ borderLeft: "1px solid var(--syn-line)", background: "var(--syn-onyx)", padding: "24px 24px", overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Kicker phos>Network</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <Mini label="Minds" value={String(agents.length)} />
          <Mini label="Ties" value={String(rels.length)} />
        </div>
      </div>
      <button className={`btn btn-sm ${props.linkMode ? "btn-phos" : "btn-ghost"}`} onClick={() => props.setLinkFrom(props.linkMode ? null : "PICK_WAIT")} style={{ justifyContent: "center" }}>
        {props.linkMode ? "Pick two nodes…" : "+ Connect"}
      </button>
      {node && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--syn-tile)", border: "1px solid var(--syn-phos)", display: "grid", placeItems: "center", color: "var(--syn-phos)", font: "500 11px/1 var(--f-display)" }}>{initials(node.name)}</span>
            <div><div style={{ font: "500 14px/1 var(--f-display)", letterSpacing: "0.05em" }}>{node.name}</div></div>
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {rels.filter((r) => r.a_id === node.id || r.b_id === node.id).map((r) => {
              const other = agents.find((a) => a.id === (r.a_id === node.id ? r.b_id : r.a_id));
              return (
                <button key={pairKey(r.a_id, r.b_id)} onClick={() => props.onSelectEdge(pairKey(r.a_id, r.b_id))}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", borderRadius: 8, background: "var(--syn-void)", border: "1px solid var(--syn-line-2)" }}>
                  <span style={{ font: "400 12px/1 var(--f-body)", color: "var(--syn-bone)" }}>{other?.name}</span>
                  <span className="tag" style={{ background: "transparent", padding: 0, color: r.affinity > 4 ? "var(--syn-phos)" : r.affinity < -4 ? "var(--syn-line-5)" : "var(--syn-ash)" }}>{r.label || "tie"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EdgeEditor({ rel, agents, onSave, onClose }: { rel: Relationship; agents: Agent[]; onSave: () => void; onClose: () => void }) {
  const store = useStore();
  const [aff, setAff] = useState(rel.affinity);
  const [trust, setTrust] = useState(rel.trust);
  const [fam, setFam] = useState(rel.familiarity);
  const [label, setLabel] = useState(rel.label);
  useEffect(() => { setAff(rel.affinity); setTrust(rel.trust); setFam(rel.familiarity); setLabel(rel.label); }, [rel.a_id, rel.b_id]);
  const A = agents.find((a) => a.id === rel.a_id), B = agents.find((a) => a.id === rel.b_id);

  const save = async () => {
    await api.setRelationship({ a: rel.a_id, b: rel.b_id, affinity: aff, trust, familiarity: fam, label });
    onSave(); store.pushToast("Tie updated");
  };
  const remove = async () => { await api.deleteRelationship(rel.a_id, rel.b_id); onSave(); onClose(); store.pushToast("Tie severed"); };

  return (
    <div style={{ borderLeft: "1px solid var(--syn-line)", background: "var(--syn-onyx)", padding: 24, overflow: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker phos>Tie</Kicker>
        <button onClick={onClose} style={{ color: "var(--syn-ash)" }}>✕</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
        <Avatar name={A?.name} /><span style={{ color: "var(--syn-mute)" }}>—</span><Avatar name={B?.name} />
      </div>
      <Slider label="AFFINITY" min={-100} max={100} value={aff} onChange={setAff} bipolar />
      <Slider label="TRUST" min={0} max={100} value={trust} onChange={setTrust} />
      <Slider label="FAMILIARITY" min={0} max={100} value={fam} onChange={setFam} />
      <div>
        <div className="kicker" style={{ marginBottom: 8 }}>Label</div>
        <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="confidant · rival · mentor…" />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button className="btn btn-ghost btn-sm" style={{ color: "#E0686E", borderColor: "#5a3034" }} onClick={remove}>Sever</button>
        <button className="btn btn-solid btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={save}>Save</button>
      </div>
    </div>
  );
}

function Slider({ label, min, max, value, onChange, bipolar }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void; bipolar?: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ font: "500 10px/1 var(--f-mono)", letterSpacing: "0.22em", color: "var(--syn-ash)" }}>{label}</span>
        <span style={{ font: "500 11px/1 var(--f-mono)", color: "var(--syn-bone)" }}>{bipolar && value > 0 ? "+" : ""}{value.toFixed(0)}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}
function Avatar({ name }: { name?: string }) {
  return <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--syn-tile)", border: "1px solid var(--syn-line-4)", display: "grid", placeItems: "center", color: "var(--syn-bone)", font: "500 12px/1 var(--f-display)" }}>{initials(name || "?")}</span>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="well" style={{ padding: 14 }}><div className="kicker">{label}</div><div style={{ font: "500 24px/1 var(--f-mono)", marginTop: 10 }}>{value}</div></div>;
}
