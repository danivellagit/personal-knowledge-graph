// Happiness orb (Home): a soft sphere that breathes slowly, with the 7 area colours flowing inside as blurred,
// slowly rotating colour fields. Each colour's share follows its area score; areas "in arrivo" stay grey.
// Brightness and saturation follow the Happiness value. CSS-only animation (compositor, 60fps), paused when the
// page is hidden, static under prefers-reduced-motion.
import { useEffect, useState } from "grok/canvas";
import type { ReactNode } from "grok/canvas";

export type OrbArea = { id: string; score: number | null };
const HUE: Record<string, string> = {
  corpo: "#00E89A", salute: "#FF5E86", lavoro: "#5FA8FF", finanze: "#FFD04A", relazioni: "#FF9A3D", crescita: "#A98BFF", vita: "#38E0D2",
};
const GREY = "#56606A";
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
const CSS = `
@keyframes lfhpBreath { 0%,100% { transform: scale(0.985); } 50% { transform: scale(1.03); } }
@keyframes lfhpGlow { 0%,100% { opacity: .42; transform: scale(.96); } 50% { opacity: .78; transform: scale(1.06); } }
@keyframes lfhpSpin { to { transform: rotate(360deg); } }
@keyframes lfhpSpinR { to { transform: rotate(-360deg); } }
.lf-hp-core { animation: lfhpBreath 5.6s ease-in-out infinite; }
.lf-hp-glow { animation: lfhpGlow 5.6s ease-in-out infinite; }
.lf-hp-a { animation: lfhpSpin 34s linear infinite; }
.lf-hp-b { animation: lfhpSpinR 47s linear infinite; }
.lf-hp-paused .lf-hp-core, .lf-hp-paused .lf-hp-glow, .lf-hp-paused .lf-hp-a, .lf-hp-paused .lf-hp-b { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .lf-hp-core, .lf-hp-glow, .lf-hp-a, .lf-hp-b { animation: none !important; } }
`;

export function HappyOrb({ size, value, areas, children }: { size: number; value: number | null; areas: OrbArea[]; children?: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const h = value === null ? 0.45 : Math.max(0, Math.min(1, value / 100));
  // colour shares: weight grows with the score; missing areas keep a small grey share
  const ws = areas.map((a) => ({ c: a.score === null ? GREY : HUE[a.id] ?? GREY, w: a.score === null ? 0.55 : 0.6 + (a.score / 100) * 1.4, a: a.score === null ? 0.55 : 0.55 + (a.score / 100) * 0.45 }));
  const tot = ws.reduce((s, x) => s + x.w, 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  ws.forEach((x) => { const a0 = (acc / tot) * 360, a1 = ((acc + x.w) / tot) * 360, m = (a0 + a1) / 2; stops.push(`${hexA(x.c, x.a)} ${m.toFixed(1)}deg`); acc += x.w; });
  stops.push(stops[0].replace(/ [\d.]+deg$/, " 360deg"));
  const conic = `conic-gradient(from 0deg, ${stops.join(", ")})`;
  const top = [...ws].sort((p, q) => q.w - p.w);
  const blobs = [[28, 30], [72, 34], [62, 76], [26, 70]].map(([x, y], i) => `radial-gradient(circle at ${x}% ${y}%, ${hexA(top[i % top.length].c, 0.85 * top[i % top.length].a)} 0%, transparent 46%)`).join(", ");
  const sat = (0.95 + 0.75 * h).toFixed(2), bri = (0.78 + 0.42 * h).toFixed(2);
  const glowC = hexA(top[0]?.c ?? GREY, 0.25 + 0.4 * h);
  const R = size / 2;
  return (
    <div className={`lf-hp${hidden ? " lf-hp-paused" : ""}`} style={{ position: "relative", width: size, height: size, pointerEvents: "none" }}>
      <style>{CSS}</style>
      <div className="lf-hp-glow" style={{ position: "absolute", inset: -16, borderRadius: "50%", background: `radial-gradient(circle, ${glowC} 0%, transparent 68%)`, filter: "blur(14px)", pointerEvents: "none", willChange: "transform, opacity" }} />
      <div className="lf-hp-core" style={{ position: "absolute", inset: 0, borderRadius: "50%", clipPath: `circle(${R}px at ${R}px ${R}px)`, background: "#0E1418", willChange: "transform", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
        <div className="lf-hp-a" style={{ position: "absolute", inset: "-28%", background: conic, filter: `blur(${Math.round(size * 0.075)}px) saturate(${sat}) brightness(${bri})`, willChange: "transform" }} />
        <div className="lf-hp-b" style={{ position: "absolute", inset: "-14%", background: blobs, mixBlendMode: "screen", opacity: 0.35 + 0.35 * h, filter: `blur(${Math.round(size * 0.09)}px) saturate(${sat})`, willChange: "transform" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 34% 26%, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 38%), radial-gradient(circle at 50% 50%, rgba(8,11,14,0) 60%, rgba(8,11,14,.42) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 50% 52%, rgba(10,14,18,.22) 0%, rgba(10,14,18,0) 44%)" }} />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 -10px 28px rgba(0,0,0,.35)" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", textShadow: "0 1px 12px rgba(0,0,0,.45)", pointerEvents: "none" }}>{children}</div>
    </div>
  );
}
