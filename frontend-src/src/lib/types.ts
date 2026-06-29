// SYNORA · domain types (mirror of the FastAPI backend)

export type TraitKey =
  | "curiosity" | "assertiveness" | "warmth"
  | "skepticism" | "humor" | "emotional";

export interface Agent {
  id: string;
  name: string;
  color: string;
  identity?: string;
  values_anchor?: string;
  background?: string;
  speaking_style?: string;
  traits: Partial<Record<TraitKey, number>>;
  summary?: string;
}

export interface Relationship {
  a_id: string;
  b_id: string;
  affinity: number;     // -100..100
  trust: number;        // 0..100
  familiarity: number;  // 0..100
  init_affinity: number;
  label: string;
}

export interface Message {
  id: number;
  content: string;
  thinking: string;
  mood: string;
  turn: number;
  agent_id: string;
  name: string;
  color: string;
}

export interface MemoryItem {
  id: number;
  kind: "episodic" | "semantic" | "reflection";
  content: string;
  importance: number;
  created_turn: number;
  access_count: number;
  created_at: number;
}

export interface MemoryStats {
  episodic: number;
  semantic: number;
  reflection: number;
  total: number;
  avg_importance: number;
}

export interface MemoryPayload {
  stats: MemoryStats;
  histogram: number[];   // length 10
  items: MemoryItem[];
}

export interface PersonalityPoint { consistency: number; turn: number; created_at: number; }
export interface PersonalityPayload { history: PersonalityPoint[]; }

export interface GrowthPoint { turn: number; total: number; }
export interface Overview {
  turn: number;
  agents: Pick<Agent, "id" | "name" | "color">[];
  memory_total: number;
  message_total: number;
  anchor_enabled: boolean;
  memory_growth: Record<string, GrowthPoint[]>;
}

export interface Config {
  provider: string;
  anchor_enabled: boolean;
  deliberate: boolean;
  deepseek_model: string;
  has_deepseek_key: boolean;
  turn: number;
}

export interface RelHistoryPoint { affinity: number; trust: number; familiarity: number; turn: number; }
export interface RelSnapshot { a_id: string; b_id: string; affinity: number; trust: number; familiarity: number; turn: number; }
export interface RelBase { a_id: string; b_id: string; init_affinity: number; label: string; }
export interface RelHistoryAll { snapshots: RelSnapshot[]; base: RelBase[]; turn: number; }

export type ViewKey = "observe" | "minds" | "constellation" | "memory" | "canon" | "engine";
