import type {
  Agent, Relationship, Message, MemoryPayload, PersonalityPayload,
  Overview, Config, RelHistoryPoint, RelHistoryAll,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch { /* ignore */ }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  agents: () => req<Agent[]>("GET", "/agents"),
  createAgent: (a: Partial<Agent>) => req<Agent>("POST", "/agents", a),
  deleteAgent: (id: string) => req<void>("DELETE", `/agents/${id}`),

  relationships: () => req<Relationship[]>("GET", "/relationships"),
  setRelationship: (r: { a: string; b: string; affinity: number; label: string; familiarity?: number; trust?: number }) =>
    req<{ ok: boolean }>("POST", "/relationships", r),
  deleteRelationship: (a: string, b: string) =>
    req<{ ok: boolean }>("DELETE", `/relationships?a=${a}&b=${b}`),
  relHistory: (a: string, b: string) =>
    req<RelHistoryPoint[]>("GET", `/relationship-history?a=${a}&b=${b}`),
  relHistoryAll: () => req<RelHistoryAll>("GET", "/relationship-history-all"),

  step: () => req<Message>("POST", "/step"),
  run: (n: number) => req<{ turn: number; messages: Message[] }>("POST", "/run", { n }),
  reset: (keep_agents: boolean) => req<{ ok: boolean }>("POST", "/reset", { keep_agents }),
  seed: () => req<{ ok: boolean; agents: string[] }>("POST", "/seed"),

  messages: (limit = 80) => req<Message[]>("GET", `/messages?limit=${limit}`),

  worldview: () => req<{ worldview: string }>("GET", "/worldview"),
  setWorldview: (worldview: string) => req<{ ok: boolean; worldview: string }>("POST", "/worldview", { worldview }),

  topic: () => req<{ topic: string }>("GET", "/topic"),
  setTopic: (topic: string) => req<{ ok: boolean }>("POST", "/topic", { topic }),

  memory: (id: string) => req<MemoryPayload>("GET", `/memory/${id}`),
  personality: (id: string) => req<PersonalityPayload>("GET", `/personality/${id}`),
  overview: () => req<Overview>("GET", "/overview"),

  config: () => req<Config>("GET", "/config"),
  setConfig: (c: Partial<{ anchor_enabled: boolean; deliberate: boolean; deepseek_key: string; deepseek_model: string }>) =>
    req<Config>("POST", "/config", c),
};
