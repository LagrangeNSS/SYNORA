import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Agent, Config, Message, Overview } from "./types";
import { clamp, lerp } from "./util";

export type EngineMode = "idle" | "auto" | "forever";

interface Toast { id: number; msg: string; kind: "info" | "warn"; }

interface StoreValue {
  ready: boolean;
  agents: Agent[];
  overview: Overview | null;
  config: Config | null;
  messages: Message[];
  worldview: string;
  topic: string;
  engineMode: EngineMode;
  cadence: number;
  busy: boolean;
  tick: number;            // bumps on any world-state change
  toast: Toast | null;
  needsKey: boolean;

  pushToast: (msg: string, kind?: "info" | "warn") => void;
  refreshCore: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  advance: () => Promise<boolean>;
  toggleAuto: () => void;
  toggleForever: () => void;
  setCadence: (c: number) => void;
  reset: () => Promise<void>;
  seed: () => Promise<void>;
  saveConfig: (c: Partial<{ anchor_enabled: boolean; deliberate: boolean; deepseek_key: string; deepseek_model: string }>) => Promise<void>;
  saveWorldview: (w: string) => Promise<void>;
  injectTopic: (t: string) => Promise<void>;
  bump: () => void;
}

const Ctx = createContext<StoreValue | null>(null);
export const useStore = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
};

export function SynoraProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [worldview, setWorldview] = useState("");
  const [topic, setTopic] = useState("");
  const [engineMode, setEngineMode] = useState<EngineMode>("idle");
  const [cadence, setCadenceState] = useState(0.62);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);

  const modeRef = useRef<EngineMode>("idle");
  const cadenceRef = useRef(cadence);
  const autoTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  cadenceRef.current = cadence;

  const bump = useCallback(() => setTick((t) => t + 1), []);

  const pushToast = useCallback((msg: string, kind: "info" | "warn" = "info") => {
    const id = Date.now();
    setToast({ id, msg, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const refreshCore = useCallback(async () => {
    const [ag, ov, cfg] = await Promise.all([api.agents(), api.overview(), api.config()]);
    setAgents(ag); setOverview(ov); setConfig(cfg);
  }, []);

  const refreshMessages = useCallback(async () => {
    const m = await api.messages(120);
    setMessages(m);
  }, []);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        const [ag, ov, cfg, wv, tp, msgs] = await Promise.all([
          api.agents(), api.overview(), api.config(), api.worldview(), api.topic(), api.messages(120),
        ]);
        setAgents(ag); setOverview(ov); setConfig(cfg);
        setWorldview(wv.worldview); setTopic(tp.topic); setMessages(msgs);
      } catch (e) {
        pushToast("Backend offline — start the engine first.", "warn");
      } finally {
        setReady(true);
      }
    })();
    return () => stopEngine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- engine ----
  const stopEngine = useCallback(() => {
    modeRef.current = "idle";
    setEngineMode("idle");
    if (autoTimer.current) { window.clearTimeout(autoTimer.current); autoTimer.current = null; }
  }, []);

  const advance = useCallback(async (): Promise<boolean> => {
    try {
      const msg = await api.step();
      setMessages((prev) => [...prev.slice(-160), msg]);
      const ov = await api.overview().catch(() => null);
      if (ov) setOverview(ov);
      bump();
      return true;
    } catch (e) {
      const m = e instanceof ApiError ? e.message : "step failed";
      pushToast(m, "warn");
      stopEngine();
      return false;
    }
  }, [bump, pushToast, stopEngine]);

  // auto cadence loop (timed)
  const scheduleAuto = useCallback(() => {
    if (modeRef.current !== "auto") return;
    const interval = lerp(2400, 450, cadenceRef.current);
    autoTimer.current = window.setTimeout(async () => {
      if (modeRef.current !== "auto") return;
      const ok = await advance();
      if (ok && modeRef.current === "auto") scheduleAuto();
    }, interval);
  }, [advance]);

  // forever loop (back-to-back)
  const runForever = useCallback(async () => {
    while (modeRef.current === "forever") {
      const ok = await advance();
      if (!ok) break;
    }
  }, [advance]);

  const toggleAuto = useCallback(() => {
    if (modeRef.current === "auto") { stopEngine(); return; }
    stopEngine();
    modeRef.current = "auto";
    setEngineMode("auto");
    advance().then((ok) => { if (ok && modeRef.current === "auto") scheduleAuto(); });
  }, [advance, scheduleAuto, stopEngine]);

  const toggleForever = useCallback(() => {
    if (modeRef.current === "forever") { stopEngine(); return; }
    stopEngine();
    modeRef.current = "forever";
    setEngineMode("forever");
    runForever();
  }, [runForever, stopEngine]);

  const setCadence = useCallback((c: number) => setCadenceState(clamp(c, 0, 1)), []);

  // ---- structural actions ----
  const wrap = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      pushToast(e instanceof ApiError ? e.message : "request failed", "warn");
    } finally { setBusy(false); }
  }, [pushToast]);

  const reset = useCallback(async () => {
    stopEngine();
    await wrap(async () => {
      await api.reset(true);
      await refreshCore();
      await refreshMessages();
      bump();
      pushToast("World reset · residents kept");
    });
  }, [wrap, refreshCore, refreshMessages, bump, pushToast, stopEngine]);

  const seed = useCallback(async () => {
    stopEngine();
    await wrap(async () => {
      await api.seed();
      const wv = await api.worldview();
      setWorldview(wv.worldview);
      await refreshCore();
      await refreshMessages();
      bump();
      pushToast("Sample society summoned");
    });
  }, [wrap, refreshCore, refreshMessages, bump, pushToast, stopEngine]);

  const saveConfig = useCallback(async (c: Parameters<StoreValue["saveConfig"]>[0]) => {
    await wrap(async () => {
      const cfg = await api.setConfig(c);
      setConfig(cfg);
    });
  }, [wrap]);

  const saveWorldview = useCallback(async (w: string) => {
    await wrap(async () => {
      await api.setWorldview(w);
      setWorldview(w);
      pushToast(w.trim() ? "Canon updated" : "Canon cleared");
    });
  }, [wrap, pushToast]);

  const injectTopic = useCallback(async (t: string) => {
    await wrap(async () => {
      await api.setTopic(t);
      setTopic(t);
      if (t.trim()) pushToast("Signal injected");
    });
  }, [wrap, pushToast]);

  const needsKey = !!config && !config.has_deepseek_key;

  const value: StoreValue = {
    ready, agents, overview, config, messages, worldview, topic,
    engineMode, cadence, busy, tick, toast, needsKey,
    pushToast, refreshCore, refreshMessages, advance,
    toggleAuto, toggleForever, setCadence,
    reset, seed, saveConfig, saveWorldview, injectTopic, bump,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
