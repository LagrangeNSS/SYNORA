import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { synEase, synOut, T } from "../motion/variants";

export function Toast({ toast }: { toast: { id: number; msg: string; kind: "info" | "warn" } | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: T.base, ease: synOut }}
          style={{
            position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)",
            zIndex: 200, display: "flex", alignItems: "center", gap: 12,
            padding: "12px 18px", borderRadius: 10,
            background: "var(--syn-panel-2)",
            border: "1px solid var(--syn-line-3)",
            borderLeft: `2px solid ${toast.kind === "warn" ? "#E0686E" : "var(--syn-phos)"}`,
            boxShadow: "var(--shadow-card)",
          }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: toast.kind === "warn" ? "#E0686E" : "var(--syn-phos)",
          }} />
          <span style={{ font: "400 13px/1 var(--f-body)", color: "var(--syn-bone)", letterSpacing: "0.02em" }}>
            {toast.msg}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Modal({ open, onClose, children, width = 560 }:
  { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: T.fast }}
          onClick={onClose}
          style={{
            position: "fixed", inset: 0, zIndex: 150, display: "grid", placeItems: "center",
            background: "rgba(6,6,8,.72)", backdropFilter: "blur(4px)", padding: 24,
          }}>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: T.base, ease: synOut }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: Math.min(width, 1000), maxWidth: "100%", maxHeight: "88vh", overflow: "auto",
              background: "var(--syn-panel)", border: "1px solid var(--syn-line-3)",
              borderRadius: 18, padding: 32, boxShadow: "var(--shadow-card)",
            }}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 44, height: 24, borderRadius: 12, position: "relative", flex: "none",
      background: on ? "var(--syn-phos)" : "var(--syn-tile)",
      border: on ? "none" : "1px solid var(--syn-line-4)",
      transition: "background var(--t-fast) var(--ease-syn)",
    }}>
      <motion.span
        animate={{ x: on ? 20 : 0 }}
        transition={{ duration: T.fast, ease: synEase }}
        style={{
          position: "absolute", top: 2, left: 2, width: 20, height: 20, borderRadius: "50%",
          background: on ? "var(--syn-void)" : "var(--syn-bone)",
        }} />
    </button>
  );
}

export function Kicker({ children, phos = false, style }:
  { children: React.ReactNode; phos?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={phos ? "kicker kicker-phos" : "kicker"} style={style}>{children}</div>
  );
}

// dot in front of names etc.
export function Dot({ live = false, color }: { live?: boolean; color?: string }) {
  return <span style={{
    width: 6, height: 6, borderRadius: "50%", flex: "none",
    background: color ?? (live ? "var(--syn-phos)" : "var(--syn-line-5)"),
    boxShadow: live ? "0 0 10px var(--syn-phos)" : undefined,
    animation: live ? "synBreath 2.4s ease-in-out infinite" : undefined,
  }} />;
}
