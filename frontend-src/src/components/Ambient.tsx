export function Ambient() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <div style={{
        position: "absolute", inset: "-200px",
        backgroundImage:
          "radial-gradient(circle at 18% 22%, rgba(94,229,200,.04), transparent 40%)," +
          "radial-gradient(circle at 82% 74%, rgba(120,140,180,.05), transparent 45%)",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)",
        backgroundSize: "80px 80px",
        animation: "synGridDrift 60s linear infinite",
        maskImage: "radial-gradient(ellipse at 50% 30%, #000 30%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, #000 30%, transparent 80%)",
      }} />
    </div>
  );
}
