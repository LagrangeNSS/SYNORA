import type { TraitKey } from "./types";

export function initials(name: string): string {
  const s = (name || "").trim();
  if (!s) return "··";
  if (/[\u4e00-\u9fa5]/.test(s)) return s.slice(0, 1);
  const parts = s.split(/[\s\-_·]+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  const ascii = s.replace(/[^A-Za-z0-9]/g, "");
  return (ascii.slice(0, 2) || s.slice(0, 2)).toUpperCase();
}

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");

export function fmtSigned(n: number, digits = 0): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

export const TRAIT_LABELS: Record<TraitKey, string> = {
  curiosity: "curious",
  assertiveness: "decisive",
  warmth: "warm",
  skepticism: "skeptical",
  humor: "playful",
  emotional: "feeling",
};

export const TRAIT_ORDER: TraitKey[] = [
  "curiosity", "assertiveness", "warmth", "skepticism", "humor", "emotional",
];

// derive a one-word "voice" descriptor from dominant trait
export function voiceOf(traits: Partial<Record<TraitKey, number>>): string {
  let best: TraitKey = "curiosity";
  let max = -1;
  for (const k of TRAIT_ORDER) {
    const v = traits[k] ?? 0;
    if (v > max) { max = v; best = k; }
  }
  return TRAIT_LABELS[best];
}

export function relColor(affinity: number): string {
  if (affinity > 4) return "var(--syn-phos)";
  if (affinity < -4) return "var(--syn-line-5)";
  return "var(--syn-ash)";
}

// pseudo-stable layout angle for a node index
export function ringPos(i: number, n: number, cx: number, cy: number, r: number) {
  const ang = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
}
