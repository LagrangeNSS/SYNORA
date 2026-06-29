import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import type { MemoryItem, MemoryPayload, PersonalityPayload } from "../lib/types";
import { Kicker } from "../components/ui";
import { Bars, ChartEmpty, LineChart, Sparkline } from "../components/charts";
import { riseItem, stagger } from "../motion/variants";

const KIND_COLOR: Record<string, string> = { episodic: "#46B6C9", semantic: "#5EE5C8", reflection: "#C9A24A" };

export function Memory() {
  const store = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const [mem, setMem] = useState<MemoryPayload | null>(null);
  const [pers, setPers] = useState<PersonalityPayload | null>(null);
  const [cut, setCut] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);
  const playRef = useRef<number | null>(null);

  const agents = store.overview?.agents ?? store.agents;
  const maxTurn = store.overview?.turn ?? 0;

  useEffect(() => { if (!sel && agents.length) setSel(agents[0].id); }, [agents, sel]);
  useEffect(() => {
    if (!sel) return;
    Promise.all([api.memory(sel), api.personality(sel)]).then(([m, p]) => { setMem(m); setPers(p); }).catch(() => {});
  }, [sel, store.tick]);

  const clip = <T extends { x: number }>(pts: T[]) => (cut == null ? pts : pts.filter((p) => p.x <= cut));
  const items: MemoryItem[] = useMemo(() => {
    const all = mem?.items ?? [];
    return cut == null ? all : all.filter((m) => m.created_turn <= cut);
  }, [mem, cut]);

  const stats = useMemo(() => {
    if (cut == null) return mem?.stats ?? null;
    const k = { episodic: 0, semantic: 0, reflection: 0 };
    let imp = 0;
    items.forEach((m) => { (k as any)[m.kind]++; imp += m.importance; });
    return { ...k, total: items.length, avg_importance: items.length ? +(imp / items.length).toFixed(2) : 0 };
  }, [mem, items, cut]);

  const growth = (store.overview?.memory_growth?.[sel ?? ""] ?? []).map((d) => ({ x: d.turn, y: d.total }));
  const consPts = (pers?.history ?? []).map((d) => ({ x: d.turn, y: d.consistency }));
  const lastCons = consPts.length ? consPts[consPts.length - 1].y : null;
  const hist = useMemo(() => {
    if (cut == null) return mem?.histogram ?? [];
    const h = Array(10).fill(0);
    items.forEach((m) => { h[Math.max(0, Math.min(9, Math.round(m.importance) - 1))]++; });
    return h;
  }, [mem, items, cut]);

  // replay
  const startReplay = () => {
    if (replay) { stop(); setReplay(false); setCut(null); return; }
    if (!maxTurn) { store.pushToast("No memory to replay yet", "warn"); return; }
    setReplay(true); setCut(0);
  };
  const stop = () => { if (playRef.current) { clearInterval(playRef.current); playRef.current = null; } };
  const togglePlay = () => {
    if (playRef.current) { stop(); return; }
    if ((cut ?? 0) >= maxTurn) setCut(0);
    playRef.current = window.setInterval(() => setCut((p) => { const n = (p ?? 0) + 1; if (n >= maxTurn) { stop(); return maxTurn; } return n; }), 420);
  };
  useEffect(() => () => stop(), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--syn-void)" }}>
      <header style={{ padding: "22px 32px", borderBottom: "1px solid var(--syn-line)", display: "flex", justifyContent: "space-between", alignItems: "center", flex: "none" }}>
        <div>
          <Kicker>Memory</Kicker>
          <div style={{ font: "500 22px/1 var(--f-display)", letterSpacing: "-.01em", marginTop: 8 }}>Drift &amp; recall across the agora</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="seg" style={{ maxWidth: 360, overflow: "auto" }}>
            {agents.map((a) => (
              <button key={a.id} className={sel === a.id ? "on" : ""} onClick={() => setSel(a.id)}>{a.name.slice(0, 8)}</button>
            ))}
          </div>
          <button className={`btn btn-sm ${replay ? "btn-phos" : "btn-ghost"}`} onClick={startReplay}>{replay ? "✕" : "▶"} replay</button>
        </div>
      </header>

      {replay && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 32px", borderBottom: "1px solid var(--syn-line)", background: "var(--syn-onyx)" }}>
          <button className="btn btn-phos btn-sm" style={{ minWidth: 34, justifyContent: "center", padding: "8px 10px" }} onClick={togglePlay}>{playRef.current ? "⏸" : "▶"}</button>
          <input type="range" min={0} max={maxTurn} value={cut ?? 0} onChange={(e) => setCut(parseInt(e.target.value, 10))} style={{ flex: 1 }} />
          <span style={{ font: "500 11px/1 var(--f-mono)", color: "var(--syn-phos)", minWidth: 40, textAlign: "right" }}>#{cut ?? 0}</span>
        </div>
      )}

      <motion.div variants={stagger} initial="hidden" animate="show"
        style={{ flex: 1, overflow: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridAutoRows: "min-content", gap: 14 }}>
        <Tile span={3} label="Memories held" value={String(stats?.total ?? 0)} delta={growth.length ? `+${clip(growth).length}` : undefined}>
          <Sparkline data={clip(growth).map((p) => p.y)} h={28} />
        </Tile>
        <Tile span={3} label="Avg importance" value={(stats?.avg_importance ?? 0).toFixed(2)}>
          <Bars data={hist} h={28} />
        </Tile>
        <Tile span={3} label="Persona consistency" value={lastCons != null ? lastCons.toFixed(2).slice(1) : "—"}>
          <Sparkline data={clip(consPts).map((p) => p.y)} color="var(--syn-bone)" h={28} fill={false} />
        </Tile>
        <Tile span={3} label="Reflections" value={String(stats?.reflection ?? 0)}>
          <Bars data={[stats?.episodic ?? 0, stats?.semantic ?? 0, stats?.reflection ?? 0]} h={28} colorOf={(i) => [KIND_COLOR.episodic, KIND_COLOR.semantic, KIND_COLOR.reflection][i]} />
        </Tile>

        <Card span={8} title="Memory growth" sub="cumulative recall mass per turn">
          {clip(growth).length ? <LineChart series={[{ name: "memories", color: "var(--syn-phos)", points: clip(growth) }]} h={220} /> : <ChartEmpty />}
        </Card>
        <Card span={4} title="Composition" sub="episodic · semantic · reflection">
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
            {(["episodic", "semantic", "reflection"] as const).map((k) => {
              const v = (stats as any)?.[k] ?? 0; const tot = stats?.total || 1;
              return (
                <div key={k}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ font: "500 10px/1 var(--f-mono)", letterSpacing: "0.18em", color: "var(--syn-ash)", textTransform: "uppercase" }}>{k}</span>
                    <span style={{ font: "500 11px/1 var(--f-mono)" }}>{v}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--syn-tile)", borderRadius: 3 }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(v / tot) * 100}%` }} transition={{ duration: 0.56 }} style={{ height: "100%", background: KIND_COLOR[k], borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card span={8} title="Persona consistency" sub={store.overview?.anchor_enabled ? "anchor on · should hold high" : "anchor off · watch it drift"}>
          {clip(consPts).length ? <LineChart series={[{ name: "consistency", color: "var(--syn-phos)", points: clip(consPts) }]} h={200} yMin={0} yMax={1} yTicks={5} /> : <ChartEmpty label="needs a few turns" />}
        </Card>
        <Card span={4} title="Importance" sub="1 → 10, higher = more load-bearing">
          {hist.some((v) => v) ? <Bars data={hist} h={150} /> : <ChartEmpty />}
        </Card>

        <Card span={12} title="Memory bank" sub="episodic · semantic sediment · reflection">
          {items.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {items.slice(0, 40).map((m) => (
                <motion.div key={m.id} variants={riseItem} style={{ display: "grid", gridTemplateColumns: "80px 1fr 56px", gap: 14, alignItems: "center", padding: "10px 12px", background: "var(--syn-void)", border: "1px solid var(--syn-line)", borderRadius: 8 }}>
                  <span style={{ font: "500 9px/1 var(--f-mono)", letterSpacing: "0.16em", textTransform: "uppercase", color: KIND_COLOR[m.kind] }}>{m.kind}</span>
                  <span style={{ font: "400 13px/1.4 var(--f-body)", color: "var(--syn-bone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.content}</span>
                  <span style={{ font: "500 10px/1 var(--f-mono)", color: "var(--syn-ash)", textAlign: "right" }}>T{m.created_turn} · {m.importance.toFixed(0)}</span>
                </motion.div>
              ))}
            </div>
          ) : <ChartEmpty label="no memories yet" />}
        </Card>
      </motion.div>
    </div>
  );
}

function Tile({ span, label, value, delta, children }: { span: number; label: string; value: string; delta?: string; children?: React.ReactNode }) {
  return (
    <motion.div variants={riseItem} className="card" style={{ gridColumn: `span ${span}`, borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 130, gap: 12 }}>
      <Kicker>{label}</Kicker>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ font: "500 34px/1 var(--f-mono)", letterSpacing: "-.01em" }}>{value}</span>
        {delta && <span style={{ font: "500 11px/1 var(--f-mono)", color: "var(--syn-phos)" }}>{delta}</span>}
      </div>
      {children}
    </motion.div>
  );
}

function Card({ span, title, sub, children }: { span: number; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={riseItem} className="card" style={{ gridColumn: `span ${span}`, borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Kicker>{title}</Kicker>
        {sub && <span style={{ font: "400 10px/1 var(--f-mono)", color: "var(--syn-mute)", letterSpacing: "0.12em" }}>{sub}</span>}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </motion.div>
  );
}
