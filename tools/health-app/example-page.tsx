// Example health page for tools/health-app: a dark mobile dashboard of the last 7 days.
//
// Replace it with your own page whenever you like (health_app.source). The only contract with the
// builder is:
//   1. the file default-exports a React component (it is rendered into #root, a full-screen
//      scroll container; pad the top with var(--sa-t) and the bottom with var(--sa-b));
//   2. everything that changes day to day sits between the two marker lines below, as one
//      `const DATA = {...};` literal, so a routine can swap the block without touching the code
//      (tools/publish_health_app.sh --data FILE, or --fill to build it from the body layer);
//   3. imports come from "react" only (or "grok/canvas" / "page-kit", which canvas-shim.js serves).
// The whole bundle, DATA included, is encrypted before it is published.
//
// DATA (every number may be null = no reading that day; the page shows "—"):
//   updatedAt   "YYYY-MM-DDTHH:MM"   when the block was written (shown in the header)
//   owner       string               first name, shown in the greeting
//   goals       { kcalIn, proteinG, steps, sleepMin, workoutsPerWeek }
//   days[]      oldest first, usually 7:
//     { date "YYYY-MM-DD", kcalIn, kcalOut, proteinG, steps, sleepMin, deepMin, remMin,
//       bedtime "HH:MM", wakeTime "HH:MM", restingHr, hrvMs,
//       workouts: [{ name, min, kcal, hrAvg }] }
//   notes[]     short strings shown at the bottom (a coach's line, a caveat)
import React, { useMemo, useState } from "react";

// ==== DATA:START (replaced by the publisher; keep both marker lines) ====
const DATA = {
  updatedAt: "2030-01-07T08:00",
  owner: "Sample Person",
  goals: { kcalIn: 2300, proteinG: 140, steps: 9000, sleepMin: 450, workoutsPerWeek: 3 },
  days: [
    { date: "2030-01-01", kcalIn: 2210, kcalOut: 2540, proteinG: 128, steps: 8421, sleepMin: 431, deepMin: 62, remMin: 95, bedtime: "23:40", wakeTime: "07:22", restingHr: 58, hrvMs: 41, workouts: [{ name: "Running", min: 42, kcal: 410, hrAvg: 148 }] },
    { date: "2030-01-02", kcalIn: 2480, kcalOut: 2310, proteinG: 151, steps: 6120, sleepMin: 468, deepMin: 71, remMin: 102, bedtime: "23:05", wakeTime: "07:10", restingHr: 57, hrvMs: 44, workouts: [] },
    { date: "2030-01-03", kcalIn: 2050, kcalOut: 2890, proteinG: 133, steps: 11240, sleepMin: 402, deepMin: 55, remMin: 88, bedtime: "00:10", wakeTime: "07:05", restingHr: 59, hrvMs: 38, workouts: [{ name: "Strength training", min: 55, kcal: 320, hrAvg: 121 }] },
    { date: "2030-01-04", kcalIn: 2390, kcalOut: 2460, proteinG: 142, steps: 9310, sleepMin: 455, deepMin: 66, remMin: 99, bedtime: "23:20", wakeTime: "07:15", restingHr: 57, hrvMs: 46, workouts: [] },
    { date: "2030-01-05", kcalIn: 2620, kcalOut: 3120, proteinG: 118, steps: 14870, sleepMin: 389, deepMin: 49, remMin: 81, bedtime: "00:35", wakeTime: "07:24", restingHr: 60, hrvMs: 36, workouts: [{ name: "Tennis", min: 90, kcal: 720, hrAvg: 139 }] },
    { date: "2030-01-06", kcalIn: 2150, kcalOut: 2380, proteinG: 147, steps: 7650, sleepMin: 492, deepMin: 78, remMin: 110, bedtime: "22:50", wakeTime: "07:22", restingHr: 56, hrvMs: 49, workouts: [{ name: "Walk", min: 48, kcal: 190, hrAvg: 102 }] },
    { date: "2030-01-07", kcalIn: null, kcalOut: 1240, proteinG: null, steps: 3210, sleepMin: 446, deepMin: 64, remMin: 97, bedtime: "23:15", wakeTime: "06:41", restingHr: 57, hrvMs: 45, workouts: [] },
  ],
  notes: ["Sample data: every number on this page is made up. Replace the DATA block with your own."],
};
// ==== DATA:END ====

const C = {
  bg: "#0B0E10", card: "#15191C", line: "#232A2F", text: "#FFFFFF", dim: "#B5BCC2", faint: "#7D868D",
  in: "#00F19F", out: "#0093E7", protein: "#9C7ED9", steps: "#FFB547", sleep: "#5B8CFF", deep: "#2F4FD1", rem: "#8FB0FF", warn: "#FFDE00",
};
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif';
const AVATAR: string | null = (globalThis as any).__HEALTH_APP_AVATAR__ || null;

type Workout = { name: string; min: number | null; kcal?: number | null; hrAvg?: number | null };
type Day = {
  date: string; kcalIn: number | null; kcalOut: number | null; proteinG: number | null; steps: number | null;
  sleepMin: number | null; deepMin?: number | null; remMin?: number | null; bedtime?: string | null; wakeTime?: string | null;
  restingHr?: number | null; hrvMs?: number | null; workouts?: Workout[];
};

const n = (v: any) => (typeof v === "number" && isFinite(v) ? v : null);
const fmt = (v: any, d = 0) => (n(v) === null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }));
const hm = (m: any) => (n(m) === null ? "—" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`);
const avg = (xs: any[]) => { const v = xs.map(n).filter((x) => x !== null) as number[]; return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const wd = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const dm = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" });

function Card({ title, right, children }: any) {
  return (
    <section style={{ background: C.card, borderRadius: 18, padding: "14px 14px 12px", border: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: C.dim, fontWeight: 700 }}>{title}</h2>
        {right ? <div style={{ fontSize: 12, color: C.faint }}>{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, sub, color }: any) {
  return (
    <div style={{ background: C.card, borderRadius: 16, padding: "12px 12px 10px", border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// One bar chart for every metric: series stacked or side by side, an optional goal line.
function Bars({ days, sel, onSel, series, goal, stacked = false, height = 120 }: any) {
  const W = 340, H = height, pad = 18, slot = (W - 8) / days.length;
  const totals = days.map((d: Day) => (stacked ? series.reduce((a: number, s: any) => a + (n(s.get(d)) || 0), 0) : Math.max(0, ...series.map((s: any) => n(s.get(d)) || 0))));
  const max = Math.max(goal || 0, ...totals) * 1.12 || 1;
  const y = (v: number) => H - pad - (v / max) * (H - pad - 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img">
      {goal ? <line x1={4} x2={W - 4} y1={y(goal)} y2={y(goal)} stroke={C.faint} strokeDasharray="3 4" strokeWidth={1} /> : null}
      {days.map((d: Day, i: number) => {
        const x0 = 4 + i * slot, active = i === sel, bw = stacked ? slot * 0.5 : (slot * 0.62) / series.length;
        let acc = 0;
        return (
          <g key={d.date} onClick={() => onSel(i)} style={{ cursor: "pointer" }} opacity={sel === null || active ? 1 : 0.45}>
            <rect x={x0} y={0} width={slot} height={H} fill="transparent" />
            {series.map((s: any, j: number) => {
              const v = n(s.get(d));
              if (v === null || v <= 0) return null;
              if (stacked) {
                const top = y(acc + v), h = y(acc) - top; acc += v;
                return <rect key={j} x={x0 + (slot - bw) / 2} y={top} width={bw} height={Math.max(h, 1)} rx={j === series.length - 1 ? 3 : 0} fill={s.color} />;
              }
              const x = x0 + (slot - bw * series.length) / 2 + j * bw;
              return <rect key={j} x={x + 1} y={y(v)} width={bw - 2} height={Math.max(H - pad - y(v), 1)} rx={3} fill={s.color} />;
            })}
            <text x={x0 + slot / 2} y={H - 4} textAnchor="middle" fontSize={10} fill={active ? C.text : C.faint} fontWeight={active ? 700 : 400}>{wd(d.date)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ items }: any) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
      {items.map(([label, color]: any) => (
        <span key={label} style={{ fontSize: 12, color: C.dim, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 9, height: 9, borderRadius: 3, background: color, display: "inline-block" }} />{label}
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const days: Day[] = (DATA.days || []) as Day[];
  const g = DATA.goals || ({} as any);
  const [sel, setSel] = useState<number | null>(days.length ? days.length - 1 : null);
  const pick = (i: number) => setSel(sel === i ? null : i);
  const day = sel === null ? null : days[sel];

  const s = useMemo(() => {
    const full = days.filter((d) => n(d.kcalIn) !== null && n(d.kcalOut) !== null);
    const workouts = days.flatMap((d) => (d.workouts || []).map((w) => ({ ...w, date: d.date })));
    return {
      balance: full.length ? avg(full.map((d) => (d.kcalIn as number) - (d.kcalOut as number))) : null,
      protein: avg(days.map((d) => d.proteinG)), steps: avg(days.map((d) => d.steps)), sleep: avg(days.map((d) => d.sleepMin)),
      workouts, workoutMin: workouts.reduce((a, w) => a + (n(w.min) || 0), 0),
    };
  }, [days]);

  const first = String(DATA.owner || "").split(" ")[0];
  const range = days.length ? `${dm(days[0].date)} – ${dm(days[days.length - 1].date)}` : "";
  const bal = s.balance === null ? "—" : `${s.balance > 0 ? "+" : ""}${fmt(s.balance)}`;

  return (
    <div data-health-app-root style={{ minHeight: "100%", background: C.bg, color: C.text, fontFamily: FONT }}>
      <header style={{ position: "sticky", top: 0, zIndex: 2, padding: "calc(var(--sa-t, 0px) + 12px) 16px 12px", background: "rgba(11,14,16,.82)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          {AVATAR ? <img src={AVATAR} alt="" style={{ width: 38, height: 38, borderRadius: 19, objectFit: "cover" }} />
            : <div style={{ width: 38, height: 38, borderRadius: 19, background: "#1E2428", display: "grid", placeItems: "center", fontWeight: 800, color: C.in }}>{(first[0] || "•").toUpperCase()}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{first ? `Hi ${first}` : "Last 7 days"}</div>
            <div style={{ fontSize: 12, color: C.faint }}>{range}{DATA.updatedAt ? ` · updated ${String(DATA.updatedAt).replace("T", " ")}` : ""}</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 440, margin: "0 auto", padding: "14px 14px calc(var(--sa-b, 0px) + 28px)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Tile label="kcal balance" value={bal} sub="avg / day, eaten − burned" color={s.balance !== null && s.balance > 0 ? C.warn : C.in} />
          <Tile label="Protein" value={`${fmt(s.protein)} g`} sub={g.proteinG ? `avg / day · goal ${g.proteinG} g` : "avg / day"} color={C.protein} />
          <Tile label="Steps" value={fmt(s.steps)} sub={g.steps ? `avg / day · goal ${fmt(g.steps)}` : "avg / day"} color={C.steps} />
          <Tile label="Sleep" value={hm(s.sleep)} sub={g.sleepMin ? `avg / night · goal ${hm(g.sleepMin)}` : "avg / night"} color={C.sleep} />
        </div>

        {day ? (
          <Card title={`${wd(day.date)} ${dm(day.date)}`} right="tap a bar to change day">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 13 }}>
              {[
                ["Eaten", `${fmt(day.kcalIn)} kcal`], ["Burned", `${fmt(day.kcalOut)} kcal`], ["Protein", `${fmt(day.proteinG)} g`],
                ["Steps", fmt(day.steps)], ["Sleep", hm(day.sleepMin)], ["Bed → up", day.bedtime && day.wakeTime ? `${day.bedtime}–${day.wakeTime}` : "—"],
                ["Resting HR", `${fmt(day.restingHr)} bpm`], ["HRV", `${fmt(day.hrvMs)} ms`], ["Workouts", String((day.workouts || []).length)],
              ].map(([k, v]) => (
                <div key={k}><div style={{ color: C.faint, fontSize: 11 }}>{k}</div><div style={{ fontWeight: 700, marginTop: 2 }}>{v}</div></div>
              ))}
            </div>
          </Card>
        ) : null}

        <Card title="Energy" right="kcal / day">
          <Bars days={days} sel={sel} onSel={pick} goal={g.kcalIn} series={[{ get: (d: Day) => d.kcalIn, color: C.in }, { get: (d: Day) => d.kcalOut, color: C.out }]} />
          <Legend items={[["Eaten", C.in], ["Burned", C.out], ["Intake goal", C.faint]]} />
        </Card>

        <Card title="Protein" right={g.proteinG ? `goal ${g.proteinG} g` : "g / day"}>
          <Bars days={days} sel={sel} onSel={pick} goal={g.proteinG} height={100} series={[{ get: (d: Day) => d.proteinG, color: C.protein }]} />
        </Card>

        <Card title="Steps" right={g.steps ? `goal ${fmt(g.steps)}` : "per day"}>
          <Bars days={days} sel={sel} onSel={pick} goal={g.steps} height={100} series={[{ get: (d: Day) => d.steps, color: C.steps }]} />
        </Card>

        <Card title="Sleep" right={g.sleepMin ? `goal ${hm(g.sleepMin)}` : "per night"}>
          <Bars days={days} sel={sel} onSel={pick} goal={g.sleepMin} stacked series={[
            { get: (d: Day) => d.deepMin, color: C.deep },
            { get: (d: Day) => d.remMin, color: C.rem },
            { get: (d: Day) => (n(d.sleepMin) === null ? null : (d.sleepMin as number) - (n(d.deepMin) || 0) - (n(d.remMin) || 0)), color: C.sleep },
          ]} />
          <Legend items={[["Deep", C.deep], ["REM", C.rem], ["Light", C.sleep]]} />
        </Card>

        <Card title="Workouts" right={`${s.workouts.length} · ${hm(s.workoutMin)}${g.workoutsPerWeek ? ` · goal ${g.workoutsPerWeek}/week` : ""}`}>
          {s.workouts.length ? s.workouts.map((w: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <div style={{ width: 44, fontSize: 12, color: C.faint }}>{wd(w.date)}</div>
              <div style={{ flex: 1, fontWeight: 700 }}>{w.name}</div>
              <div style={{ fontSize: 12, color: C.dim, textAlign: "right" }}>
                {hm(w.min)}{n(w.kcal) !== null ? ` · ${fmt(w.kcal)} kcal` : ""}{n(w.hrAvg) !== null ? ` · ${fmt(w.hrAvg)} bpm` : ""}
              </div>
            </div>
          )) : <div style={{ color: C.faint, fontSize: 14 }}>No workouts recorded.</div>}
        </Card>

        {(DATA.notes || []).length ? (
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, padding: "4px 4px 0" }}>
            {(DATA.notes || []).map((t: string, i: number) => <p key={i} style={{ margin: "0 0 6px" }}>{t}</p>)}
          </div>
        ) : null}
      </main>
    </div>
  );
}
