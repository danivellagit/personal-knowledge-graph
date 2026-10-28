import { useState, useEffect, useLayoutEffect, useRef } from "grok/canvas";
import type { ReactNode, CSSProperties } from "grok/canvas";
import { DATA, MEDICO, AVATAR, WEIGHTS, MO, hm, isNum, addDays, ringTone } from "./salute-core";
import type { Tab as HTab } from "./salute-core";
import SaluteApp from "./salute-full";
import { HappyOrb } from "./happy-orb";
import { AREAS, HAPPINESS, LIFE_HEALTH_DAYS, LONG_DAYS, LONG_WEEKS_N, CORPO_HISTORY_DAYS, CORPO_HISTORY_FROM, secOn, secWeek, secLong, WEAKEST, daySubs, nutrSubOn, sleepDebt, debtText, PACE, corpoDaily, CORPO_LONG, corpoFacts, medFacts, scadenze, todayISO } from "./scores";
import type { Area, AreaId, Sub, SecKey } from "./scores";
import { LAVORO } from "./data/lavoro";
import { RELAZIONI } from "./data/relazioni";
import { CRESCITA } from "./data/crescita";
import { VITA } from "./data/vita";
import { WEEKLY } from "./data/weekly";
import { BIRTHDAYS, EVENTS, SCADENZE_UPDATED } from "./gen";
import { LIFE } from "./life-config";
const areaName = (id: string, dflt: string) => LIFE.areas.find((a) => a.id === id)?.name ?? dflt;
const agentLabel = (id: string) => (LIFE.areas.find((a) => a.id === id)?.agents ?? "").split(",")[0].trim() || "il tuo agente";

const romeDay = (): string => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: LIFE.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const K = {
  bg: "#0B0E10", card: "#1A2026", card2: "#222A31", line: "#2A3239", track: "#2C353C",
  t1: "#FFFFFF", t2: "#B7BEC4", t3: "#7F888F", good: "#00F19F", mid: "#FFDE00", low: "#FF0026", weak: "#FF9F2E", blue: "#6FB3E8",
};
// sleep colour shared with the health app (bars and swatches; rings use ringTone)
const SEC = { sleep: "#7BA1BB" };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, "Helvetica Neue", Arial, sans-serif';
const NUM = `"DIN Condensed", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", ${FONT}`;
const WDL = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const caps: CSSProperties = { textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 };
const lbl: CSSProperties = { fontSize: 12, lineHeight: "16px", color: K.t3 };
const txt: CSSProperties = { fontSize: 14, lineHeight: "20px", color: K.t2 };
const card: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, background: `linear-gradient(180deg, ${K.card2} 0%, ${K.card} 100%)`, border: `1px solid ${K.line}`, borderRadius: 16, padding: 16 };
const btn: CSSProperties = { background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left", color: K.t1, WebkitTapHighlightColor: "transparent" } as CSSProperties;
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
const col = (gap: number): CSSProperties => ({ display: "flex", flexDirection: "column", gap, minWidth: 0 });
const num = (size: number, color: string = K.t1): CSSProperties => ({ fontFamily: NUM, fontWeight: 700, fontSize: size, lineHeight: `${Math.round(size * 1.05)}px`, color, fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" });
const safeTop = "var(--sa-t, env(safe-area-inset-top, 0px))";
const frost: CSSProperties = { position: "sticky", top: 0, zIndex: 6, boxSizing: "border-box", padding: `calc(${safeTop} + 13px) 16px 14px`, background: `${K.bg}B8`, backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", borderBottom: `1px solid ${K.t1}10` } as CSSProperties;
const pDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return { y, m, dd, w: new Date(Date.UTC(y, m - 1, dd)).getUTCDay() }; };
const longDate = (d: string) => { const p = pDate(d); return `${p.dd} ${MO[p.m - 1]} ${p.y}`; };
const shortDate = (d: string) => { const p = pDate(d); return `${p.dd} ${MO[p.m - 1].slice(0, 3)}`; };
const diffDays = (a: string, b: string) => { const p = pDate(a), q = pDate(b); return Math.round((Date.UTC(q.y, q.m - 1, q.dd) - Date.UTC(p.y, p.m - 1, p.dd)) / 86400000); };
const itn = (v: number) => String(v).replace(".", ",");
const grp = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const ICONS: Record<string, string> = {
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  body: "M12 3.5a2 2 0 1 0 .1 0M6 8.5h12M12 8.5v6M12 14.5 9 21M12 14.5l3 6.5",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  work: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  money: "M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  people: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.8.8 3 2.7 3 5.7",
  grow: "M12 21V10M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2.5-5-6-5 0 3.5 2.5 5 6 5z",
  star: "M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z",
  right: "M10 6l6 6-6 6", back: "M15 5 8 12l7 7", ext: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  cake: "M4 20h16M5 20v-7h14v7M8 13v-3M12 13v-3M16 13v-3M8 7.5v.5M12 7.5v.5M16 7.5v.5",
  cal: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4", chart: "M4 20h16M7 17v-6M12 17V7M17 17v-9", check: "M5 12l4 4 10-10", sun: "M12 8a4 4 0 1 0 .1 0M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
};
const ic = (name: string, color: string = K.t1, size = 20, sw = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }} fill="none" stroke={color} strokeWidth={name === "more" ? 3.2 : sw} strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
);
const AREA_ICON: Record<AreaId, string> = { corpo: "body", salute: "heart", lavoro: "work", finanze: "money", relazioni: "people", crescita: "grow", vita: "star" };

// small score ring (WHOOP style); colour = the shared traffic-light scale of the health Page (ringTone: how full it is)
const ring = (v: number | null, size: number, stroke: number, center: ReactNode) => {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, f = v === null ? 0 : Math.max(0, Math.min(1, v / 100)), color = ringTone(f) ?? K.t3;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg width={size} height={size} style={{ display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.track} strokeWidth={stroke} />
        {f > 0 ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${C * f} ${C}`} strokeLinecap="round" /> : null}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{center}</div>
    </div>
  );
};
const soon = (small = false) => <span style={{ ...caps, fontSize: small ? 9 : 11, lineHeight: "1.2", color: K.t3, letterSpacing: "0.06em" }}>in arrivo</span>;
const hbar = (v: number | null, color: string) => (
  <div style={{ width: "100%", height: 6, borderRadius: 3, background: K.track, overflow: "hidden" }}>{v !== null ? <div style={{ width: `${Math.max(2, Math.min(100, v))}%`, height: "100%", background: color, borderRadius: 3 }} /> : null}</div>
);
const sectionTitle = (t: string, right?: ReactNode) => (
  <div style={{ ...row, justifyContent: "space-between", padding: "10px 2px 0" }}><span style={{ ...caps, fontSize: 13, lineHeight: "18px", color: K.t1 }}>{t}</span>{right ?? null}</div>
);

// ---------- desktop layout (PC browser, viewport >= life_app.desktop.min_width): sidebar + multi-column pages ----------
// Phones never reach the width, so they always get the phone layout below, unchanged (same DOM).
const DESK_Q = `(min-width: ${LIFE.desktop?.minWidth ?? 1024}px)`;
const deskMQ = (): MediaQueryList | null => (LIFE.desktop?.enabled === false || typeof window === "undefined" || !window.matchMedia ? null : window.matchMedia(DESK_Q));
const useDesk = (): boolean => {
  const [d, setD] = useState<boolean>(() => !!deskMQ()?.matches);
  useEffect(() => {
    const q = deskMQ(); if (!q) return;
    const f = () => setD(q.matches);
    if (q.addEventListener) q.addEventListener("change", f); else q.addListener(f);
    return () => { if (q.removeEventListener) q.removeEventListener("change", f); else q.removeListener(f); };
  }, []);
  return d;
};
const SIDE_W = 248;
// desktop-only CSS (rendered only in the desktop layout): hover states, the multi-column flow of the area pages and of the
// embedded health pages (.hx-view column -> masonry columns; a block never splits across columns)
const DESK_CSS = `
.dk .wb-view{padding-bottom:40px !important}
.dk button{transition:background-color .15s ease, filter .15s ease, border-color .15s ease}
.dk .dk-main button:not(:disabled):hover{filter:brightness(1.14)}
.dk .dk-side .wb-tab:hover{background:rgba(255,255,255,.06) !important}
.dk .dk-flow{column-width:340px;column-gap:20px}
.dk .dk-flow > *{break-inside:avoid;margin:0 0 14px}
.dk .hx-view{max-width:none !important}
.dk .hx-view > div{display:block !important;column-width:400px;column-gap:20px}
.dk .hx-view > div > :not([style*="position: fixed"]){break-inside:avoid;margin:0 0 14px !important}
.dk .hx-view > div > div:not([aria-label]):not(:has(> :not(span))){break-after:avoid}
.dk .hx-view > div > [aria-label^="Blocco"], .dk .hx-view > div > .dk-span{column-span:all}
.dk .hx-view > div > [aria-label^="Sezioni"], .dk .hx-view > div > [aria-label="Altro Corpo"]{display:contents !important}
.dk .hx-view > div > [aria-label^="Sezioni"] > *, .dk .hx-view > div > [aria-label="Altro Corpo"] > *{break-inside:avoid;margin:0 0 14px !important}
.dk-main ::-webkit-scrollbar{width:10px;height:10px}
`;

type Tab = "home" | "corpo" | "salute" | "lavoro" | "finanze" | "altro";
type View = { tab: Tab; sub: AreaId | null };
type CView = "oggi" | "settimana" | "lungo";

export default function App() {
  const [view, setView] = useState<View>({ tab: "home", sub: null });
  const desk = useDesk();
  // a section title + its card(s): one block on desktop (it never splits across columns), plain siblings on the phone
  const blk = (a: ReactNode, b: ReactNode) => (desk ? <div className="dk-blk" style={col(14)}>{a}{b}</div> : <>{a}{b}</>);
  const [corpoTab, setCorpoTab] = useState<HTab>("home");
  const [corpoSel, setCorpoSel] = useState<string>(DATA.today);
  const [corpoScreen, setCorpoScreen] = useState<boolean>(false);
  // Corpo time window (Oggi / Settimana / Lungo periodo), one selector for the whole area; Home always uses Lungo periodo
  const [corpoView, setCorpoView] = useState<CView>("oggi");
  // Salute: Medico (default) or the Biologia sub-page (moved from Corpo on 2026-10-26)
  const [saluteTab, setSaluteTab] = useState<"medico" | "biologia">("medico");
  const [saluteScreen, setSaluteScreen] = useState<boolean>(false);
  const [eve, setEve] = useState<{ bedBy: number; bedBy85: number; wake: number; need: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [view.tab, view.sub]);
  // always today (life_app.timezone) on open: a new day reloads the app (fresh data, picker on the new day);
  // back from the background after a while, the Corpo picker returns to today
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (romeDay() !== DATA.today) { location.reload(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) setCorpoSel(DATA.today);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const openArea = (id: AreaId) => { if (id === "salute") setSaluteTab("medico"); return setView(id === "corpo" || id === "salute" || id === "lavoro" || id === "finanze" ? { tab: id, sub: null } : { tab: "altro", sub: id }); };
  const area = (id: AreaId) => AREAS.find((a) => a.id === id) as Area;
  const today = pDate(todayISO);
  const todayLine = `${WDL[today.w].charAt(0).toUpperCase()}${WDL[today.w].slice(1)} ${today.dd} ${MO[today.m - 1]}`;

  const avatar = (
    <div style={{ width: 36, height: 36, borderRadius: 18, overflow: "hidden", flex: "0 0 auto", background: K.card2, border: `1px solid ${K.line}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {AVATAR ? <img src={AVATAR} alt="" width={36} height={36} style={{ display: "block", width: 36, height: 36, objectFit: "cover" }} /> : <span style={{ fontWeight: 700, color: K.t2 }}>{LIFE.ownerInitial}</span>}
    </div>
  );
  const header = (title: string, sub: string, back?: () => void, below?: ReactNode) => (
    <div style={frost}>
      <div style={{ ...row, gap: 12 }}>
        {back ? <button aria-label="Indietro" onClick={back} style={{ ...btn, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>{ic("back", K.t1, 22, 2.2)}</button> : avatar}
        <div style={{ ...col(1), flex: 1 }}>
          <span style={{ ...caps, fontSize: 16, lineHeight: "21px", color: K.t1 }}>{title}</span>
          <span style={lbl}>{sub}</span>
        </div>
      </div>
      {below ?? null}
    </div>
  );

  // ---------- Home: Life Health blob (data: HAPPINESS) with the 7-segment ring ----------
  const RING = 343, cx = RING / 2, R = 98, SW = 13, BLOB = 150;
  const polar = (r: number, deg: number): [number, number] => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cx + r * Math.sin(a)]; };
  const arcPath = (r: number, a: number, b: number) => { const [x1, y1] = polar(r, a), [x2, y2] = polar(r, b); return `M ${x1} ${y1} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x2} ${y2}`; };
  const N = AREAS.length, SEG = 360 / N, GAP = 7;
  const happyRing = (
    <div style={{ position: "relative", width: RING, height: 300, margin: "0 auto" }}>
      <svg width={RING} height={300} viewBox={`0 ${cx - 150} ${RING} 300`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {AREAS.map((a, i) => {
          const s = -90 + i * SEG + GAP / 2, e = s + SEG - GAP, mid = (s + e) / 2;
          const weak = WEAKEST && a.id === WEAKEST.id;
          const color = ringTone(a.score === null ? null : a.score / 100) ?? K.t3;
          const [lx, ly] = polar(R + 25, mid);
          const anchor = lx > cx + 12 ? "start" : lx < cx - 12 ? "end" : "middle";
          return (
            <g key={a.id} onClick={() => openArea(a.id)} style={{ cursor: "pointer" }} role="button" aria-label={a.name}>
              <path d={arcPath(R, s, e)} stroke={K.track} strokeWidth={SW} fill="none" strokeLinecap="round" />
              {a.score !== null ? <path d={arcPath(R, s, s + ((e - s) * a.score) / 100)} stroke={color} strokeWidth={SW} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color}55)` }} /> : null}
              <path d={arcPath(R, s, e)} stroke="transparent" strokeWidth={44} fill="none" />
              <text x={lx} y={ly - 2} textAnchor={anchor} fontSize={11} fontWeight={700} letterSpacing="0.06em" fill={weak ? K.weak : a.score === null ? K.t3 : K.t1} style={{ textTransform: "uppercase", fontFamily: FONT }}>{a.name.toUpperCase()}</text>
              <text x={lx} y={ly + 13} textAnchor={anchor} fontSize={a.score === null ? 10 : 13} fontWeight={700} fill={a.score === null ? K.t3 : weak ? K.weak : K.t2} style={{ fontFamily: a.score === null ? FONT : NUM }}>{a.score === null ? "in arrivo" : String(a.score)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: cx - BLOB / 2, top: 150 - BLOB / 2, pointerEvents: "none" }}>
        <HappyOrb size={BLOB} value={HAPPINESS} areas={AREAS.map((a) => ({ id: a.id, score: a.score }))}>
          <span style={num(52)}>{HAPPINESS === null ? "—" : HAPPINESS}</span>
          <span style={{ ...caps, fontSize: 11, lineHeight: "1.2", letterSpacing: "0.14em", color: K.t1, marginTop: 4, opacity: 0.9 }}>Life Health</span>
          <span aria-label="Periodo Life Health" style={{ fontSize: 10, lineHeight: "13px", fontWeight: 400, color: K.t2, marginTop: 3 }}>{LIFE_HEALTH_DAYS >= LONG_DAYS ? `media ultimi ${LONG_DAYS} giorni` : LIFE_HEALTH_DAYS > 1 ? `media ultimi ${LIFE_HEALTH_DAYS} giorni` : LIFE_HEALTH_DAYS === 1 ? "dato di ieri" : "dato di oggi"}</span>
        </HappyOrb>
      </div>
    </div>
  );
  const areaRow = (a: Area, last: boolean) => {
    const weak = WEAKEST && a.id === WEAKEST.id;
    return (
      <button key={a.id} onClick={() => openArea(a.id)} aria-label={`Apri ${a.name}`} style={{ ...btn, ...row, width: "100%", padding: "13px 0", borderBottom: last ? "none" : `1px solid ${K.line}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: K.bg, border: `1px solid ${K.line}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{ic(AREA_ICON[a.id], a.score === null ? K.t3 : weak ? K.weak : K.t1, 19)}</div>
        <div style={{ ...col(6), flex: 1 }}>
          <div style={{ ...row, justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: a.score === null ? K.t2 : K.t1 }}>{a.name}</span>
            {a.score === null ? soon() : <span style={num(20, weak ? K.weak : K.t1)}>{a.score}</span>}
          </div>
          {a.score === null ? <div style={{ height: 6, borderRadius: 3, background: K.track, opacity: 0.6 }} /> : hbar(a.score, weak ? K.weak : K.good)}
        </div>
        {ic("right", K.t3, 16, 2.2)}
      </button>
    );
  };
  // life conclusion (the owner 2026-10-25: "la conclusione della mia vita in tre righe", then what goes well, what goes
  // badly, what to do; max two points each; about the whole picture, refreshed every Monday in
  // data/happiness/weekly-summary.json; conclusion in regular weight, like the bullets)
  const weeklyList = (title: string, color: string, items: string[], k: string) => items.length ? (
    <div data-weekly={k} style={{ ...col(8), paddingTop: 14, borderTop: `1px solid ${K.line}` }}>
      <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color }}>{title}</span>
      {items.map((t, i) => (
        <div key={i} style={{ ...row, gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flex: "0 0 auto", marginTop: 7 }} />
          <span style={{ fontSize: 15, lineHeight: "21px", color: K.t1, flex: 1 }}>{t}</span>
        </div>
      ))}
    </div>
  ) : null;
  const updOf = (d: string) => { const p = pDate(d.slice(0, 10)); return `${p.dd} ${MO[p.m - 1]}`; };
  const weeklyBlock = WEEKLY ? (
    <div data-weekly="block" style={{ ...card, ...col(14) }}>
      <div style={{ ...col(6) }}>
        <span data-weekly="label" style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t3 }}>Il quadro · aggiornato il {updOf(WEEKLY.generatedAt)}</span>
        <div data-weekly="conclusion" style={{ ...col(2) }}>
          {WEEKLY.conclusion.map((t, i) => <span key={i} style={{ fontSize: 15, lineHeight: "21px", fontWeight: 400, color: K.t1 }}>{t}</span>)}
        </div>
      </div>
      {weeklyList("Cosa va bene", K.good, WEEKLY.good, "good")}
      {weeklyList("Cosa va male", K.low, WEEKLY.bad, "bad")}
      {weeklyList("Cosa fare per migliorare", K.blue, WEEKLY.improve, "improve")}
    </div>
  ) : null;
  const weeklyCol = (title: string, color: string, items: string[], k: string) => (
    <div data-weekly={k} style={{ ...card, ...col(10) }}>
      <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color }}>{title}</span>
      {items.length ? items.map((t, i) => (
        <div key={i} style={{ ...row, gap: 10, alignItems: "flex-start" }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flex: "0 0 auto", marginTop: 7 }} />
          <span style={{ fontSize: 15, lineHeight: "21px", color: K.t1, flex: 1 }}>{t}</span>
        </div>
      )) : <span style={lbl}>—</span>}
    </div>
  );
  const areaTile = (a: Area) => {
    const weak = WEAKEST && a.id === WEAKEST.id;
    return (
      <button key={a.id} onClick={() => openArea(a.id)} aria-label={`Apri ${a.name}`} style={{ ...btn, ...card, ...col(12), cursor: "pointer", borderColor: weak ? `${K.weak}66` : K.line }}>
        <div style={{ ...row, gap: 14 }}>
          {ring(a.score, 62, 6, a.score === null ? <span style={num(18, K.t3)}>—</span> : <span style={num(22, weak ? K.weak : K.t1)}>{a.score}</span>)}
          <div style={{ ...col(3), flex: 1 }}>
            <span style={{ ...row, gap: 8 }}>{ic(AREA_ICON[a.id], a.score === null ? K.t3 : weak ? K.weak : K.t1, 17)}<span style={{ ...caps, fontSize: 13, lineHeight: "17px", color: weak ? K.weak : K.t1 }}>{a.name}</span></span>
            <span style={lbl}>{a.score === null ? "in arrivo" : weak ? "l'area più debole" : a.agents === "da decidere" ? "" : `con ${a.agents}`}</span>
          </div>
          {ic("right", K.t3, 16, 2.2)}
        </div>
        {a.tip ? <span style={{ ...txt, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as CSSProperties}>{a.tip}</span> : null}
      </button>
    );
  };
  const homeDesk = (
    <div>
      {header("Life Health", todayLine)}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 420px) minmax(0, 1fr)", gap: 20, padding: "20px 16px 0", alignItems: "stretch" }}>
        <div aria-label="Life Health" style={{ ...card, padding: "22px 0 18px" }}>{happyRing}</div>
        {WEEKLY ? (
          <div data-weekly="block" style={{ ...card, ...col(12), justifyContent: "center", padding: "24px 28px" }}>
            <span data-weekly="label" style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t3 }}>Il quadro · aggiornato il {updOf(WEEKLY.generatedAt)}</span>
            <div data-weekly="conclusion" style={col(6)}>
              {WEEKLY.conclusion.map((t, i) => <span key={i} style={{ fontSize: 21, lineHeight: "30px", fontWeight: 400, color: K.t1 }}>{t}</span>)}
            </div>
          </div>
        ) : <div />}
      </div>
      {WEEKLY ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, alignItems: "stretch", padding: "14px 16px 0" }}>
          {weeklyCol("Cosa va bene", K.good, WEEKLY.good, "good")}
          {weeklyCol("Cosa va male", K.low, WEEKLY.bad, "bad")}
          {weeklyCol("Cosa fare per migliorare", K.blue, WEEKLY.improve, "improve")}
        </div>
      ) : null}
      <div style={{ ...col(14), padding: "20px 16px 0" }}>
        {sectionTitle("Le aree")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>{AREAS.map(areaTile)}</div>
      </div>
    </div>
  );
  const home = desk ? homeDesk : (
    <div>
      {header("Life Health", todayLine)}
      <div style={{ ...col(14), padding: "14px 16px 0" }}>
        <div style={{ padding: "8px 0 0" }}>{happyRing}</div>
        {weeklyBlock}
        {sectionTitle("Le aree")}
        <div style={{ ...card, padding: "2px 16px" }}>{AREAS.map((a, i) => areaRow(a, i === AREAS.length - 1))}</div>
      </div>
    </div>
  );

  // ---------- area page ----------
  const subCard = (s: Sub) => (
    <div key={s.key} style={{ ...card, ...row, alignItems: "center", gap: 14 }}>
      {s.ring ? ring(Math.round(s.ring.frac * 100), 58, 6, <span style={num(s.ring.label.length > 3 ? 18 : 22)}>{s.ring.label}</span>) : ring(s.score, 58, 6, s.score === null ? <span style={num(22, K.t3)}>—</span> : <span style={num(22)}>{s.score}</span>)}
      <div style={{ ...col(3), flex: 1 }}>
        <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{s.name}</span>
        <span style={txt}>{s.line}</span>
      </div>
    </div>
  );
  const hero = (a: Area) => (
    <div style={{ ...col(10), alignItems: "center", padding: "10px 0 4px" }}>
      {ring(a.score, 168, 13,
        a.score === null ? <>{soon()}</> : <><span style={num(56)}>{a.score}</span><span style={{ ...caps, fontSize: 10, lineHeight: "1.2", letterSpacing: "0.14em", color: K.t2 }}>{a.name}</span></>)}
    </div>
  );
  const tipCard = (t: string | null) => t ? (
    <div style={{ ...card, ...row, gap: 12, alignItems: "flex-start" }}>{ic("sun", K.weak, 18)}<div style={{ ...col(3), flex: 1 }}><span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.weak }}>Cosa fare oggi</span><span style={{ fontSize: 15, lineHeight: "21px", color: K.t1 }}>{t}</span></div></div>
  ) : null;
  const kv = (items: [string, string][]) => (
    <div style={{ ...card, padding: "2px 16px" }}>
      {items.map(([k, v], i) => <div key={k} style={{ ...row, justifyContent: "space-between", padding: "12px 0", borderBottom: i < items.length - 1 ? `1px solid ${K.line}` : "none" }}><span style={txt}>{k}</span><span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: K.t1, textAlign: "right" }}>{v}</span></div>)}
    </div>
  );
  const listCard = (items: { title: string; sub?: string; right?: string; color?: string }[]) => (
    <div style={{ ...card, padding: "2px 16px" }}>
      {items.map((x, i) => (
        <div key={x.title + i} style={{ ...row, justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: i < items.length - 1 ? `1px solid ${K.line}` : "none" }}>
          <div style={{ ...col(2), flex: 1 }}><span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{x.title}</span>{x.sub ? <span style={lbl}>{x.sub}</span> : null}</div>
          {x.right ? <span style={{ ...caps, fontSize: 11, lineHeight: "20px", color: x.color ?? K.t2, whiteSpace: "nowrap" }}>{x.right}</span> : null}
        </div>
      ))}
    </div>
  );
  const emptyCard = (t: string, tag = true) => <div style={{ ...card, ...col(6), alignItems: "center", textAlign: "center", padding: "22px 16px" }}>{tag ? soon() : null}<span style={txt}>{t}</span></div>;
  const page = (a: Area, extra: ReactNode, back?: () => void, before?: ReactNode) => desk ? (
    <div>
      {header(a.name, a.agents === "da decidere" ? "Agente da decidere" : `Con ${a.agents}`, back)}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 340px) minmax(0, 1fr)", gap: 20, padding: "20px 16px 0", alignItems: "start" }}>
        <div style={{ ...col(14), position: "sticky", top: 96 }}>
          <div style={{ ...card, padding: "18px 16px" }}>{hero(a)}</div>
          {tipCard(a.tip)}
        </div>
        <div className="dk-flow">
          {before ?? null}
          {a.subs.length ? blk(sectionTitle("Sezioni"), <div style={col(14)}>{a.subs.map(subCard)}</div>) : null}
          {extra}
        </div>
      </div>
    </div>
  ) : (
    <div>
      {header(a.name, a.agents === "da decidere" ? "Agente da decidere" : `Con ${a.agents}`, back)}
      <div style={{ ...col(14), padding: "14px 16px 0" }}>
        {hero(a)}
        {tipCard(a.tip)}
        {before ?? null}
        {a.subs.length ? <>{sectionTitle("Sezioni")}{a.subs.map(subCard)}</> : null}
        {extra}
      </div>
    </div>
  );

  // ---------- Corpo: hub + full-screen sub-pages (iOS push), built on the health page (src/health/health-page.tsx) ----------
  // hub = two blocks. OGGI: day picker + Oggi ring + guidance + the daily sections (all follow the picked day).
  // LUNGO PERIODO: its ring + Allenamento, Peso, Biologia, Tendenze (never follow the picker, no date).
  // A card opens its sub-page with ONE header (back, title; the day picker only on the daily ones)
  const SECTIONS: { key: string; tab: HTab; title: string; perDay: boolean; card: boolean }[] = [
    { key: "sonno", tab: "sonno", title: "Sonno", perDay: true, card: false }, { key: "recupero", tab: "recupero", title: "Recupero", perDay: true, card: false },
    { key: "sforzo", tab: "sforzo", title: "Sforzo", perDay: true, card: false }, { key: "nutrizione", tab: "nutrizione", title: "Nutrizione", perDay: true, card: true },
    { key: "allenamento", tab: "fitness", title: "Allenamento", perDay: false, card: true }, { key: "peso", tab: "peso", title: "Peso", perDay: false, card: false },
    { key: "tendenze", tab: "altro", title: "Tendenze", perDay: false, card: false },
  ];
  const toTop = () => { if (scroller.current) scroller.current.scrollTop = 0; };
  const hubScroll = useRef<number>(0), detailScroll = useRef<number>(0);
  // back to a hub / list: the scroll position goes back in a layout effect, i.e. in the same frame the page reappears
  // (was a 40 ms timeout: the top of the page flashed, then it jumped; part of the owner's "micro crash", 2026-10-25)
  const pendingY = useRef<number | null>(null);
  const restore = (y: number) => { pendingY.current = y; };
  useLayoutEffect(() => { if (pendingY.current !== null && scroller.current) { scroller.current.scrollTop = pendingY.current; pendingY.current = null; } }, [view.tab, view.sub, corpoTab, corpoScreen, saluteScreen, saluteTab]);
  const openSection = (t: HTab) => { hubScroll.current = scroller.current ? scroller.current.scrollTop : 0; setCorpoTab(t); toTop(); };
  const backToHub = () => { setCorpoTab("home"); restore(hubScroll.current); };
  const onHealthTab = (t: HTab) => { if (t === "home") backToHub(); else setCorpoTab(t); };
  const onHealthScreen = (open: boolean) => {
    if (open) { detailScroll.current = scroller.current ? scroller.current.scrollTop : 0; setCorpoScreen(true); toTop(); }
    else { setCorpoScreen(false); restore(detailScroll.current); }
  };
  const dIdx = DATA.days.findIndex((x) => x.date === corpoSel);
  const shiftDay = (k: number) => { const n = dIdx + k; if (n >= 0 && n < DATA.days.length) setCorpoSel(DATA.days[n].date); };
  // the picker always shows the date; the block title says Oggi / Ieri / the weekday (never "Oggi" three times)
  const dayLabel = (iso: string) => { const p = pDate(iso); return `${["dom", "lun", "mar", "mer", "gio", "ven", "sab"][p.w]} ${p.dd} ${MO[p.m - 1].slice(0, 3).toLowerCase()}`; };
  const dayWord = (iso: string) => { if (iso === DATA.today) return "Oggi"; const t = pDate(DATA.today), y = new Date(Date.UTC(t.y, t.m - 1, t.dd - 1)).toISOString().slice(0, 10); if (iso === y) return "Ieri"; const w = WDL[pDate(iso).w]; return w.charAt(0).toUpperCase() + w.slice(1); };
  const dev = DATA.device ?? null;
  const batt = dev && isNum(dev.battery) && Date.now() - Date.parse(`${dev.at}:00+01:00`) < 12 * 3600e3 ? Math.round(dev.battery as number) : null;
  const battCol = batt === null ? K.t3 : batt < 15 ? K.low : batt < 30 ? K.weak : K.t2;
  const battBadge = batt === null ? null : (
    <span aria-label="Batteria Fitbit" data-v={batt} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap", color: battCol, fontWeight: batt < 30 ? 700 : 400 }}>
      <svg width={18} height={10} viewBox="0 0 18 10" style={{ display: "block" }}><rect x={0.5} y={0.5} width={15} height={9} rx={2} fill="none" stroke="currentColor" /><rect x={16} y={3} width={1.5} height={4} rx={0.5} fill="currentColor" /><rect x={2} y={2} width={Math.max(1, (12 * batt) / 100)} height={6} rx={1} fill="currentColor" /></svg>
      {`${batt}%${batt < 15 ? " · caricalo" : ""}`}
    </span>
  );
  const streak = DATA.days.filter((x) => x.workouts.some((w) => w.status === "fatto")).length;
  const arrow = (dir: number, on: boolean) => (
    <button aria-label={dir < 0 ? "Giorno precedente" : "Giorno successivo"} onClick={() => shiftDay(dir)} disabled={!on} style={{ ...btn, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", opacity: on ? 1 : 0.3 }}>{ic(dir < 0 ? "back" : "right", K.t1, 16, 2.2)}</button>
  );
  const dayPicker = (
    <div aria-label="Selettore giorno" style={{ ...row, gap: 2, background: K.card, border: `1px solid ${K.line}`, borderRadius: 16, padding: "0 4px", flex: "0 0 auto" }}>
      {arrow(-1, dIdx > 0)}<span aria-label="Giorno scelto" style={{ fontSize: 13, fontWeight: 600, lineHeight: "30px", minWidth: 86, textAlign: "center", color: K.t1, whiteSpace: "nowrap" }}>{dayLabel(corpoSel)}</span>{arrow(1, dIdx < DATA.days.length - 1)}
    </div>
  );
  const streakTag = (
    <span style={{ ...row, gap: 4, fontSize: 13, fontWeight: 700, color: K.t1 }}><svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={K.weak} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.8 2.4-5 .3 1.6 1 2.6 2.1 3 .3-3 .2-5.4.5-8z" /></svg>{streak} giorni attivi</span>
  );
  const hubInfo = (
    <div style={{ ...row, justifyContent: "space-between", marginTop: 10 }}>{streakTag}<span style={{ ...row, gap: 8 }}>{battBadge}<span style={lbl}>agg. {DATA.updatedAt.slice(11, 16)}</span></span></div>
  );
  const corpoA = area("corpo");
  const dSubs = [...daySubs(corpoSel), nutrSubOn(corpoSel)];
  const subOf = (key: string, daily: boolean): Sub | null => (daily ? dSubs.find((x) => x.key === key) : null) ?? corpoA.subs.find((x) => x.key === key) ?? null;
  // weight: latest weighing, change vs the previous one, tiny sparkline (no score: no weight target in the data)
  const wL = WEIGHTS.length ? WEIGHTS[WEIGHTS.length - 1] : null, wP = WEIGHTS.length > 1 ? WEIGHTS[WEIGHTS.length - 2] : null;
  const pesoLine = wL ? `${itn(wL.kg)} kg · pesata il ${shortDate(wL.date)}${wP ? ` · ${wL.kg < wP.kg ? "−" : wL.kg > wP.kg ? "+" : "±"}${itn(Math.round(Math.abs(wL.kg - wP.kg) * 10) / 10)} kg in ${diffDays(wP.date, wL.date)} giorni` : ""}` : "Nessuna pesata registrata";
  // Peso follows the selector on its hub card only (the page keeps the full weight history): Oggi = latest weighing,
  // Settimana = weighings since Monday, Lungo periodo = change over the last 90 days
  const pesoWin = (() => {
    if (corpoView === "oggi" || !wL) return pesoLine;
    const from = corpoView === "settimana" ? addDays(DATA.today, -((pDate(DATA.today).w + 6) % 7)) : addDays(DATA.today, -LONG_DAYS + 1);
    const ws = WEIGHTS.filter((w) => w.date >= from && w.date <= DATA.today);
    const tail = corpoView === "settimana" ? "da lunedì" : `negli ultimi ${LONG_DAYS} giorni`;
    if (!ws.length) return `Nessuna pesata ${tail} · ultima ${itn(wL.kg)} kg il ${shortDate(wL.date)}`;
    const a = ws[0], z = ws[ws.length - 1], dk = Math.round((z.kg - a.kg) * 10) / 10;
    return ws.length === 1 ? `${itn(z.kg)} kg · 1 pesata ${tail}` : `${itn(z.kg)} kg · ${dk < 0 ? "−" : dk > 0 ? "+" : "±"}${itn(Math.abs(dk))} kg in ${ws.length} pesate ${tail}`;
  })();
  const spark = (() => {
    const W = 58, H = 58, ks = WEIGHTS.map((w) => w.kg);
    if (ks.length < 2) return <div style={{ width: W, height: H, borderRadius: 29, border: `6px solid ${K.track}`, boxSizing: "border-box", flex: "0 0 auto" }} />;
    const lo = Math.min(...ks), hi = Math.max(...ks), t0 = WEIGHTS[0].date, tN = diffDays(t0, WEIGHTS[WEIGHTS.length - 1].date) || 1;
    const pts = WEIGHTS.map((w) => [6 + (diffDays(t0, w.date) / tN) * (W - 12), 14 + (1 - (w.kg - lo) / (hi - lo || 1)) * (H - 28)]);
    return (
      <svg aria-label="Andamento peso" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", flex: "0 0 auto" }}>
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={K.blue} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.4} fill={K.blue} />
      </svg>
    );
  })();
  // hub rings in their section colour (as in the health app): Sonno steel blue, Recupero by level, Sforzo blue, Nutrizione violet
  const hubCard = (sec: (typeof SECTIONS)[number]) => {
    const wv = winOf(sec.key, corpoView);
    const x0 = sec.key === "peso" || sec.key === "tendenze" ? null : sec.key === "allenamento" && corpoView === "oggi" ? trainDay(corpoSel) : subOf(sec.key, sec.perDay);
    const x: Sub | null = wv && x0 ? { ...x0, score: wv.v, ring: null, line: wv.line } : x0;
    const line = sec.key === "tendenze" ? (corpoView === "settimana" ? "Corpo, sonno, recupero, sforzo e nutrizione giorno per giorno da lunedì" : `Corpo, sonno, recupero, sforzo e nutrizione negli ultimi ${LONG_DAYS} giorni`)
      : sec.key === "peso" ? pesoWin : x?.line ?? "";
    return (
      <button key={sec.key} aria-label={`Sezione ${sec.title}`} data-v={x?.ring ? x.ring.label : x?.score ?? ""} onClick={() => openSection(sec.tab)} style={{ ...btn, ...card, ...row, width: "100%", gap: 14 }}>
        {sec.key === "tendenze"
          ? <div style={{ width: 58, height: 58, borderRadius: 29, border: `6px solid ${K.track}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{ic("chart", K.t2, 20, 2)}</div>
          : sec.key === "peso" ? spark
          : x?.ring ? ring(Math.round(x.ring.frac * 100), 58, 6, <span style={num(x.ring.label.length > 3 ? 18 : 22)}>{x.ring.label}</span>)
          : ring(x?.score ?? null, 58, 6, x?.score == null ? <span style={num(22, K.t3)}>—</span> : <span style={num(22)}>{x.score}</span>)}
        <div style={{ ...col(3), flex: 1 }}>
          <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{sec.title}</span>
          <span style={txt}>{line}</span>
        </div>
        {ic("right", K.t3, 16, 2.2)}
      </button>
    );
  };
  const blockTitle = (t: string, right?: ReactNode) => (
    <div style={{ ...row, justifyContent: "space-between", padding: "6px 2px 0" }}><span style={{ ...caps, fontSize: 15, lineHeight: "20px", letterSpacing: "0.12em", color: K.t1 }}>{t}</span>{right ?? null}</div>
  );
  // ---------- ONE time window for the whole Corpo area (the owner 2026-10-26: "in corpo vai una vista per oggi - settimanale -
  // long term da sopra dove è il selettore e fine"): the segmented selector on top of the hub switches the hub ring, every
  // section card and the top card of every Corpo sub-page. Oggi = the picked day (day picker, as before); Settimana =
  // Monday-to-date average (resets on Monday, shown only); Lungo periodo = 90 closed days / 13 rolling weeks (the values
  // behind Corpo on Home and Life Health). Real rows only: a day or week without data shows "nessun dato".
  // the day view is labelled "Giornaliero" (the owner 2026-10-26: "non deve essere 'oggi' ma giornaliero"); its id stays "oggi"
  const VIEWS: { id: CView; label: string }[] = [{ id: "oggi", label: "Giornaliero" }, { id: "settimana", label: "Settimana" }, { id: "lungo", label: "Lungo periodo" }];
  const viewSel = (
    <div role="tablist" aria-label="Vista Corpo" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.25fr", gap: 2, background: K.card, border: `1px solid ${K.line}`, borderRadius: 12, padding: 3 }}>
      {VIEWS.map((v) => (
        <button key={v.id} role="tab" aria-selected={corpoView === v.id} aria-label={`Vista ${v.label}`} onClick={() => setCorpoView(v.id)}
          style={{ ...btn, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", height: 32, borderRadius: 9, fontSize: 13, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap", color: corpoView === v.id ? K.bg : K.t2, background: corpoView === v.id ? K.t1 : "transparent" }}>{v.label}</button>
      ))}
    </div>
  );
  const wkRange = (f: string, t: string) => { const a = pDate(f), z = pDate(t); return a.m === z.m ? `${a.dd}–${z.dd} ${MO[z.m - 1].slice(0, 3)}` : `${a.dd} ${MO[a.m - 1].slice(0, 3)} – ${z.dd} ${MO[z.m - 1].slice(0, 3)}`; };
  const fromLbl = (f: string) => `da ${["dom", "lun", "mar", "mer", "gio", "ven", "sab"][pDate(f).w]} ${pDate(f).dd}`;
  const nDays = (n: number) => (n === 1 ? "1 giorno" : `${n} giorni`);
  const weekFrom = addDays(DATA.today, -((pDate(DATA.today).w + 6) % 7));
  const weekDays = Array.from({ length: diffDays(weekFrom, DATA.today) + 1 }, (_, i) => addDays(weekFrom, i));
  const SK: SecKey[] = ["sonno", "recupero", "sforzo", "nutrizione"];
  const SEC_TITLE: Record<string, string> = { sonno: "Sonno", recupero: "Recupero", sforzo: "Sforzo", nutrizione: "Nutrizione", allenamento: "Allenamento" };
  const c0 = corpoFacts;
  const sessOn = (d: string) => { const x = DATA.days.find((y) => y.date === d); return x ? { done: (x.workouts ?? []).filter((w) => w.status === "fatto").length, planned: (x.workouts ?? []).filter((w) => w.status === "pianificato").length } : null; };
  // the window value + line of a section card (Settimana / Lungo periodo); Oggi keeps the day's own sub-score
  const winOf = (key: string, v: CView): { v: number | null; line: string } | null => {
    if (v === "oggi") return null;
    if (key === "allenamento") return v === "settimana"
      ? { v: c0.trainWeek, line: `Palestra ${c0.gym} su ${c0.gymGoal ?? "—"} · partite ${c0.sport} su ${c0.sportGoal ?? "—"} da lunedì` }
      : { v: c0.train, line: `Palestra ${c0.gymLong} · partite ${c0.sportLong} in ${LONG_WEEKS_N} settimane (${nDays(c0.trainLongDays)} registrati)` };
    if (!SK.includes(key as SecKey)) return null;
    if (v === "settimana") { const w = secWeek(key as SecKey, DATA.today); return { v: w.avg, line: w.n ? `Media di ${nDays(w.n)} ${fromLbl(w.from)}` : "Nessun dato questa settimana" }; }
    const l = secLong(key as SecKey); return { v: l.avg, line: l.n ? (l.n >= LONG_DAYS ? `Media degli ultimi ${LONG_DAYS} giorni` : `Media di ${nDays(l.n)} sugli ultimi ${LONG_DAYS}`) : `Nessun dato negli ultimi ${LONG_DAYS} giorni` };
  };
  // Allenamento on the picked day (Oggi): sessions done (and still planned today); the ring is full once a session is done
  const trainDay = (d: string): Sub => {
    const s = sessOn(d), pl = d === DATA.today ? Math.max(s?.planned ?? 0, c0.todayPlanned) : 0;
    return { key: "allenamento", name: "Allenamento", score: null, ring: s ? { label: String(s.done), frac: s.done ? 1 : 0 } : null,
      line: !s ? "Nessun dato" : s.done ? `${s.done === 1 ? "1 sessione fatta" : `${s.done} sessioni fatte`}${pl ? ` · ${pl} in programma` : ""}` : pl ? `Nessuna sessione fatta · ${pl} in programma` : "Nessuna sessione" };
  };
  type WRow = { key: string; label: string; v: number | null; ringOn: boolean; has: boolean; right: string[] };
  // top card of a sub-page in Settimana / Lungo periodo: the window ring + one row per day (Settimana) or per week (Lungo periodo)
  const windowCard = (aria: string, title: string, right: string, v: number | null, line: string, rows: WRow[], note?: string | null) => (
    <div aria-label={aria} data-v={v ?? ""} style={{ ...card, ...col(4) }}>
      <div style={{ ...row, gap: 14 }}>
        {ring(v, 72, 7, <span style={num(22, v === null ? K.t3 : K.t1)}>{v ?? "—"}</span>)}
        <div style={{ ...col(3), flex: 1 }}>
          <div style={{ ...row, justifyContent: "space-between", gap: 8 }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{title}</span><span style={{ ...lbl, whiteSpace: "nowrap" }}>{right}</span></div>
          <span style={txt}>{line}</span>
        </div>
      </div>
      {rows.map((w, i) => (
        <div key={w.key} aria-label={`Periodo ${w.label}`} data-v={w.v ?? ""} style={{ ...row, gap: 12, padding: "10px 0 0", marginTop: i ? 0 : 8, borderTop: `1px solid ${K.line}` }}>
          {w.ringOn ? ring(w.v, 34, 4, <span style={num(11, w.v === null ? K.t3 : K.t1)}>{w.v ?? "—"}</span>) : null}
          <span style={{ fontSize: 14, lineHeight: "19px", fontWeight: 600, color: w.has ? K.t1 : K.t3, flex: 1 }}>{w.label}</span>
          {w.has ? w.right.map((t, j) => <span key={j} style={{ ...lbl, color: K.t2, whiteSpace: "nowrap" }}>{t}</span>) : <span style={{ ...lbl, whiteSpace: "nowrap" }}>nessun dato</span>}
        </div>
      ))}
      {note ? <span style={{ ...lbl, paddingTop: 8 }}>{note}</span> : null}
    </div>
  );
  const fromFirst = <T,>(xs: T[], has: (x: T) => boolean): T[] => { const i = xs.findIndex(has); return i < 0 ? [] : xs.slice(i); };
  const nums0 = (xs: (number | null)[]): number[] => xs.filter((x): x is number => x !== null);
  const dayLbl = (d: string) => (d === DATA.today ? "Oggi" : `${["dom", "lun", "mar", "mer", "gio", "ven", "sab"][pDate(d).w]} ${pDate(d).dd}`);
  const subTop = (key: string): ReactNode => {
    const title = SEC_TITLE[key];
    if (corpoView === "oggi") {
      if (key === "nutrizione") { const x = dSubs.find((s) => s.key === "nutrizione"); return x ? subCard(x) : null; }
      if (key === "allenamento") return subCard(trainDay(DATA.today));
      return null; // Sonno, Recupero, Sforzo: the health page's own ring is the day's value
    }
    const w = winOf(key, corpoView) as { v: number | null; line: string };
    if (corpoView === "settimana") {
      const rows: WRow[] = key === "allenamento"
        ? weekDays.map((d) => { const c = c0.countOn(d); return { key: d, label: dayLbl(d), v: null, ringOn: false, has: c !== null, right: c ? [`palestra ${c.gym}`, `partite ${c.sport}`] : [] }; })
        : weekDays.map((d) => { const v = secOn(key as SecKey, d); return { key: d, label: dayLbl(d), v, ringOn: true, has: v !== null, right: [] }; });
      return windowCard(`${title} settimana`, "Questa settimana", fromLbl(weekFrom), w.v, w.line, rows);
    }
    const rows: WRow[] = key === "allenamento"
      ? fromFirst(c0.trainWeeks, (x) => x.k > 0).map((x) => ({ key: x.from, label: wkRange(x.from, x.to), v: x.score, ringOn: true, has: x.k > 0, right: [`palestra ${x.gym}/${c0.gymGoal ?? "—"}`, `partite ${x.sport}/${c0.sportGoal ?? "—"}`] }))
      : fromFirst(secLong(key as SecKey).weeks, (x) => x.n > 0).map((x) => ({ key: x.from, label: wkRange(x.from, x.to), v: x.avg, ringOn: true, has: x.n > 0, right: [nDays(x.n)] }));
    const shownW = rows.length, notes = [shownW < LONG_WEEKS_N ? `${shownW} settimane su ${LONG_WEEKS_N}: prima non ci sono dati.` : null,
      key === "allenamento" ? (c0.trainWeeks.some((x) => x.k > 0 && x.k < 7) ? "Le settimane con pochi giorni registrati contano meno." : null) : key === "nutrizione" ? "Contano solo i giorni con i pasti registrati." : null].filter(Boolean);
    const note = notes.length ? notes.join(" ") : null;
    return windowCard(`${title} lungo periodo`, "Lungo periodo", `ultimi ${LONG_DAYS} giorni`, w.v, w.line, rows, note);
  };
  const VIEW_NAME: Record<CView, string> = { oggi: "Oggi", settimana: "Settimana", lungo: "Lungo periodo" };
  // ---------- Tendenze follows the selector (the owner 2026-10-26: "tendenze.. nel giorno levalo, settimana in settimana, lungo
  // periodo ... 90"): hidden in Oggi; Settimana = the week's days (Monday to Sunday, future days empty); Lungo periodo = the
  // last 90 days (a line with gaps where no data). Real values only (secOn: live DATA days, then corpo-history).
  const TREND: { k: SecKey; name: string }[] = [{ k: "oggi", name: "Corpo" }, { k: "sonno", name: "Sonno" }, { k: "recupero", name: "Recupero" }, { k: "sforzo", name: "Sforzo" }, { k: "nutrizione", name: "Nutrizione" }];
  const trendDays = corpoView === "settimana" ? Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i)) : Array.from({ length: LONG_DAYS }, (_, i) => addDays(DATA.today, i - LONG_DAYS + 1));
  const trendChart = (vals: (number | null)[]) => {
    const W = 326, H = 92, pt = 8, pb = 18, n = vals.length, Y = (v: number) => pt + (1 - v / 100) * (H - pt - pb);
    if (corpoView === "settimana") {
      const bw = 30, gap = (W - bw * 7) / 6;
      return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {vals.map((v, i) => { const x = i * (bw + gap), d = trendDays[i], fut = d > DATA.today; return (
            <g key={d}>
              <rect x={x} y={pt} width={bw} height={H - pt - pb} rx={6} fill={K.track} opacity={fut ? 0.35 : 1} />
              {v !== null ? <rect x={x} y={Y(v)} width={bw} height={H - pb - Y(v)} rx={6} fill={ringTone(v / 100) ?? K.t3} /> : null}
              <text x={x + bw / 2} y={H - 4} fontSize={10} textAnchor="middle" fill={d === DATA.today ? K.t1 : K.t3}>{["L", "M", "M", "G", "V", "S", "D"][i]}</text>
            </g>); })}
        </svg>
      );
    }
    const X = (i: number) => 4 + (i / (n - 1)) * (W - 8);
    const segs: string[][] = []; let cur: string[] = [];
    vals.forEach((v, i) => { if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`); });
    if (cur.length) segs.push(cur);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {[34, 67].map((g) => <line key={g} x1={4} x2={W - 4} y1={Y(g)} y2={Y(g)} stroke={K.line} strokeWidth={1} />)}
        {segs.map((sg, j) => sg.length > 1 ? <polyline key={j} points={sg.join(" ")} fill="none" stroke={K.blue} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : <circle key={j} cx={sg[0].split(",")[0]} cy={sg[0].split(",")[1]} r={2.2} fill={K.blue} />)}
        <text x={4} y={H - 4} fontSize={10} fill={K.t3}>{shortDate(trendDays[0])}</text>
        <text x={W - 4} y={H - 4} fontSize={10} textAnchor="end" fill={K.t3}>oggi</text>
      </svg>
    );
  };
  const trendsBlock = corpoView === "oggi" ? null : (
    <div aria-label={`Tendenze ${VIEW_NAME[corpoView]}`} style={col(14)}>
      {blockTitle(corpoView === "settimana" ? "Questa settimana" : "Lungo periodo", <span style={lbl}>{corpoView === "settimana" ? fromLbl(weekFrom) : `ultimi ${LONG_DAYS} giorni`}</span>)}
      {TREND.map((t) => {
        const vals = trendDays.map((d) => (d > DATA.today ? null : secOn(t.k, d))), have = nums0(vals);
        const m = have.length ? Math.round(have.reduce((a, b) => a + b, 0) / have.length) : null;
        return (
          <div key={t.k} aria-label={`Tendenza ${t.name}`} data-n={have.length} data-v={m ?? ""} style={{ ...card, ...col(10) }}>
            <div style={{ ...row, justifyContent: "space-between", gap: 8 }}>
              <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{t.name}</span>
              <span style={{ ...lbl, whiteSpace: "nowrap" }}>{have.length ? `media ${m} · ${nDays(have.length)}` : "nessun dato"}</span>
            </div>
            {have.length ? trendChart(vals) : null}
          </div>
        );
      })}
      {corpoView === "lungo" ? <span style={{ ...lbl, textAlign: "center" }}>{`Storico dal ${shortDate(CORPO_HISTORY_FROM)}: la finestra cresce fino a ${LONG_DAYS} giorni.`}</span> : null}
    </div>
  );
  // hub: the selector, then the window's title (Oggi: the day + picker), its Corpo ring and the section cards in that window.
  // Oggi keeps the health app's day content (kcal, guidance, monitor) between ring and cards; the other views skip it
  const oggiV = corpoDaily(corpoSel);
  const weekV = secWeek("oggi", DATA.today);
  const hubHead = (
    <div aria-label={`Blocco ${VIEW_NAME[corpoView]}`} style={col(14)}>
      {viewSel}
      {corpoView === "oggi" ? blockTitle(dayWord(corpoSel), dayPicker)
        : corpoView === "settimana" ? blockTitle("Questa settimana", <span style={lbl}>{`${fromLbl(weekFrom)} · ${nDays(weekV.n)}`}</span>)
        : blockTitle("Lungo periodo", <span style={lbl}>{`ultimi ${LONG_DAYS} giorni`}</span>)}
    </div>
  );
  const bigRing = (aria: string, v: number | null) => (
    <div aria-label={aria} data-v={v ?? ""} style={{ display: "flex", justifyContent: "center", padding: "4px 0 2px" }}>{ring(v, 168, 13, <span style={num(56, v === null ? K.t3 : K.t1)}>{v ?? "—"}</span>)}</div>
  );
  const hubRing = corpoView === "oggi" ? bigRing("Corpo Oggi", oggiV) : corpoView === "settimana" ? bigRing("Corpo Settimana", weekV.avg) : bigRing("Corpo Lungo periodo", CORPO_LONG);
  const hubNote = corpoView === "settimana" ? "Media dei punteggi giornalieri da lunedì: riparte ogni lunedì, non entra in Life Health."
    : corpoView === "lungo" ? `Media fino a ${LONG_DAYS} giorni chiusi (${nDays(CORPO_HISTORY_DAYS)} nello storico) e allenamento sulle ultime ${LONG_WEEKS_N} settimane: è il Corpo che entra in Life Health.` : null;
  const corpoSections = (
    <>
      {hubNote ? <span aria-label="Nota vista" style={{ ...txt, textAlign: "center", padding: "0 8px" }}>{hubNote}</span> : null}
      <div aria-label={`Sezioni ${VIEW_NAME[corpoView]}`} style={col(14)}>{SECTIONS.filter((x) => x.perDay || x.key === "allenamento").map(hubCard)}</div>
      <div aria-label="Altro Corpo" style={col(14)}>{SECTIONS.filter((x) => !x.perDay && x.key !== "allenamento" && (x.key !== "tendenze" || corpoView !== "oggi")).map(hubCard)}</div>
    </>
  );
  // sleep debt card (Sonno sub-page): as of the picked day; tip only for tonight
  const toHM = (t: string | null | undefined) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return isNaN(h) ? null : h * 60 + (m || 0); };
  const clk = (m: number) => { const v = ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; };
  const debtCard = (() => {
    const db = sleepDebt(corpoSel); if (!db) return null;
    const lc = db.level === "nessuno" ? K.good : db.level === "basso" ? K.good : db.level === "moderato" ? K.mid : K.weak;
    const wakes = DATA.days.slice(-7).map((x) => toHM(x.wakeTime)).filter((v): v is number => v !== null).sort((a, z) => a - z);
    let wake = wakes.length ? wakes[Math.floor(wakes.length / 2)] : 8 * 60;
    const first = DATA.tomorrowFirst ? toHM(DATA.tomorrowFirst.time) : null;
    if (first !== null && first - 75 < wake) wake = first - 75;
    if (eve) wake = eve.wake;
    const sleepFor = db.level === "nessuno" ? db.need : db.clearWith, bed = wake - sleepFor - 15;
    const hh = (m: number) => { const v = Math.round(m); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
    // in the evening the health app's plan for tonight is the reference (same bedtime as the Stanotte card)
    const after = eve ? Math.max(0, Math.round(db.min * 0.5 + db.need - eve.need)) : null;
    const tip = corpoSel !== DATA.today ? null : eve && after !== null
      ? (db.level === "nessuno" ? `Dormendo ${hh(eve.need)} stanotte resti in pari.` : after < 15 ? `Dormendo ${hh(eve.need)} stanotte il debito si azzera.` : `Dormendo ${hh(eve.need)} stanotte il debito scende a ${debtText(after)}; per azzerarlo ti servono ${hh(db.clearWith)}.`)
      : db.level === "nessuno"
      ? `Per restare in pari ti servono ${hh(sleepFor)} di sonno: a letto entro le ${clk(bed)}, sveglia alle ${clk(wake)}.`
      : `Per azzerarlo ti servono ${hh(sleepFor)} di sonno: a letto entro le ${clk(bed)}, sveglia alle ${clk(wake)}.`;
    const mx = Math.max(120, ...db.nights.map((n) => n.debt));
    // average line, change vs a week earlier, and how many of the 14 nights were high / moderate / low
    const avgD = Math.round(db.nights.reduce((a, n) => a + n.debt, 0) / Math.max(1, db.nights.length));
    const wkAgo = sleepDebt(addDays(corpoSel, -7)), diff = wkAgo ? db.min - wkAgo.min : null;
    const lvN = (n: { debt: number }) => (n.debt > 150 ? "alto" : n.debt >= 60 ? "moderato" : "basso");
    const cnt = { alto: db.nights.filter((n) => lvN(n) === "alto").length, moderato: db.nights.filter((n) => lvN(n) === "moderato").length, basso: db.nights.filter((n) => lvN(n) === "basso").length };
    const dc = diff === null ? K.t3 : diff <= -15 ? K.good : diff >= 15 ? K.weak : K.t2;
    return (
      <div aria-label="Debito di sonno" data-v={db.min} style={{ ...card, ...col(12) }}>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={col(4)}>
            <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>Debito di sonno</span>
            <span style={num(36, db.level === "nessuno" ? K.good : K.t1)}>{db.level === "nessuno" ? "In pari" : debtText(db.min)}</span>
          </div>
          <span style={{ ...caps, fontSize: 11, lineHeight: "16px", color: lc, background: `${lc}1F`, border: `1px solid ${lc}59`, borderRadius: 999, padding: "3px 10px" }}>{db.level}</span>
        </div>
        {diff !== null ? <span aria-label="Debito vs settimana scorsa" style={{ ...caps, alignSelf: "flex-start", fontSize: 11, lineHeight: "16px", color: dc, background: `${dc}1F`, border: `1px solid ${dc}59`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{`${diff < 0 ? "−" : diff > 0 ? "+" : "±"}${debtText(Math.abs(diff))} vs settimana scorsa`}</span> : null}
        <div style={{ position: "relative" }}>
          <div aria-label="Ultime 14 notti" style={{ display: "grid", gridTemplateColumns: "repeat(14, minmax(0,1fr))", gap: 4, alignItems: "end", height: 56 }}>
            {db.nights.map((n) => <div key={n.date} title={n.date} style={{ height: n.debt < 15 ? 4 : Math.max(6, Math.round((n.debt / mx) * 56)), borderRadius: 3, background: n.slept === null ? K.track : SEC.sleep, opacity: n.date === corpoSel ? 1 : lvN(n) === "alto" ? 0.95 : lvN(n) === "moderato" ? 0.7 : 0.45 }} />)}
          </div>
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: Math.round((avgD / mx) * 56), borderTop: `1.5px dashed ${K.t2}`, pointerEvents: "none" }} />
          <span style={{ ...lbl, position: "absolute", right: 0, bottom: Math.round((avgD / mx) * 56) + 3, background: K.card, padding: "0 4px" }}>{`media ${debtText(avgD)}`}</span>
        </div>
        <div aria-label="Notti per livello" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
          {([["alto", cnt.alto, 0.95], ["moderato", cnt.moderato, 0.7], ["basso", cnt.basso, 0.45]] as [string, number, number][]).map(([k, v, o]) => (
            <div key={k} style={{ ...col(2), background: K.bg, borderRadius: 10, padding: "8px 10px" }}><span style={{ ...row, gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: SEC.sleep, opacity: o }} /><span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: K.t2 }}>{k}</span></span><span style={num(20)}>{`${v} ${v === 1 ? "notte" : "notti"}`}</span></div>
          ))}
        </div>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={lbl}>{shortDate(db.nights[0].date)}</span><span style={lbl}>debito notte per notte</span><span style={lbl}>{corpoSel === DATA.today ? "oggi" : shortDate(corpoSel)}</span></div>
        {tip ? <div style={{ ...row, gap: 10, alignItems: "flex-start", background: K.bg, borderRadius: 12, padding: 12 }}>{ic("sun", K.weak, 16)}<span style={{ ...txt, flex: 1, color: K.t1 }}>{tip}</span></div> : null}
      </div>
    );
  })();
  // pace of aging (Biologia, under the bio age): speed + the one factor to fix
  const paceCard = PACE ? (() => {
    const p = PACE, pc = p.pace <= 0.9 ? K.good : p.pace <= 1.1 ? K.blue : K.weak;
    const word = p.pace <= 0.9 ? "più lento del calendario" : p.pace <= 1.1 ? "in linea con il calendario" : "più veloce del calendario";
    return (
      <div aria-label="Ritmo di invecchiamento" data-v={p.pace} style={{ ...card, ...col(8) }}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>Ritmo di invecchiamento</span><span style={lbl}>ultimi 30 giorni</span></div>
        <span style={num(36, pc)}>{`${p.pace.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`}</span>
        <div aria-label="Indicatore ritmo" data-v={p.pace} style={col(6)}>
          <div style={{ position: "relative", height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${K.good} 0%, ${K.blue} 50%, ${K.weak} 100%)`, opacity: 0.9 }}>
            <div style={{ position: "absolute", top: -5, left: `calc(${(Math.max(0, Math.min(1, (p.pace - 0.5) / 1)) * 100).toFixed(1)}% - 11px)`, width: 22, height: 22, borderRadius: 11, background: K.t1, border: `3px solid ${K.bg}`, boxSizing: "border-box", boxShadow: "0 2px 8px rgba(0,0,0,.5)" }} />
            <div style={{ position: "absolute", top: -3, bottom: -3, left: "calc(50% - 1px)", width: 2, background: K.bg, opacity: 0.8 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8 }}><span style={lbl}>più lento</span><span style={{ ...lbl, color: K.t2 }}>1,0× calendario</span><span style={{ ...lbl, textAlign: "right" }}>più veloce</span></div>
        </div>
        <span style={txt}>{`Stai invecchiando a ${p.pace.toLocaleString("it-IT", { minimumFractionDigits: 1 })}×: ${word}.`}</span>
        {p.fix ? <div style={{ ...row, gap: 10, alignItems: "flex-start", background: K.bg, borderRadius: 12, padding: 12 }}>{ic("sun", K.weak, 16)}<span style={{ ...txt, flex: 1, color: K.t1 }}>{`Da sistemare: ${p.fix.name.toLowerCase()}. ${p.fix.why}`}</span></div> : null}
      </div>
    );
  })() : null;
  const curSec = SECTIONS.find((x) => x.tab === corpoTab) ?? null;
  // the five window sections (Sonno, Recupero, Sforzo, Nutrizione, Allenamento) follow the selector; Peso and Tendenze do not
  const winSec = !!curSec && (curSec.perDay || curSec.key === "allenamento");
  const corpoHeader = corpoScreen ? null
    : corpoTab === "home" ? header(corpoA.name, `Con ${corpoA.agents}`, undefined, hubInfo)
    : header(curSec?.title ?? "Corpo", winSec || (curSec?.key === "tendenze" && corpoView !== "oggi") ? `Corpo · ${corpoView === "oggi" ? (curSec?.perDay ? dayWord(corpoSel) : "Oggi") : VIEW_NAME[corpoView]}` : "Corpo · Lungo periodo", backToHub, curSec?.perDay && corpoView === "oggi" ? <div style={{ ...row, justifyContent: "flex-end", marginTop: 10 }}>{dayPicker}</div> : undefined);
  // the health detail below follows the picked day only in Oggi; otherwise (and on Allenamento, Peso, Tendenze) it shows today
  const hSel = corpoTab === "home" || (curSec?.perDay && corpoView === "oggi") ? corpoSel : DATA.today;
  const corpoPage = (
    <div>
      {corpoHeader}
      {(() => { const t = !corpoScreen && curSec && winSec ? subTop(curSec.key) : null; return t ? <div style={{ ...col(14), padding: "14px 16px 0" }}>{t}{corpoView !== "oggi" ? <div aria-label="Dettaglio di oggi">{blockTitle("Dettaglio di oggi")}</div> : null}</div> : null; })()}
      <SaluteApp embed noHeader tab={corpoTab} onTab={onHealthTab} onView={() => {}} onScreen={onHealthScreen} sel={hSel} onSel={setCorpoSel} sforzoScore={subOf("sforzo", true)?.score ?? null} sonnoScore={subOf("sonno", true)?.score ?? null} onEve={setEve}
        slots={{ hero: hubHead, ring: hubRing, tip: corpoA.tip, sections: corpoSections, sonnoMid: debtCard, windowed: corpoView !== "oggi", trends: trendsBlock }} />
    </div>
  );
  // ---------- Salute: medical part of the health app (embedded) + mente ----------
  const saluteA = area("salute");
  // one column, same padding and 14px gap as Corpo: Life blocks go into the embedded component's own column
  // a Medico sub-page (Capelli, Pillole, Storia di famiglia...) has its own back bar: the Salute header hides (same as Corpo), back restores the scroll
  const saluteOpen = useRef<boolean>(false), saluteScroll = useRef<number>(0);
  const onSaluteScreen = (open: boolean) => {
    if (open) { saluteOpen.current = true; setSaluteScreen(true); toTop(); }
    else if (saluteOpen.current) { saluteOpen.current = false; setSaluteScreen(false); restore(saluteScroll.current); }
  };
  // the scroll is saved on the tap itself: once the sub-page renders, the page is shorter and the browser has already clamped it
  // Biologia (moved here from Corpo on 2026-10-26): its card opens the health app's Biologia page inside Salute, with its own
  // back bar; a link from Biologia to a Corpo page (e.g. resting heart -> Recupero) opens that page in Corpo
  const bioScroll = useRef<number>(0);
  const openBio = () => { bioScroll.current = scroller.current ? scroller.current.scrollTop : 0; setSaluteTab("biologia"); toTop(); };
  const backToSalute = () => { saluteOpen.current = false; setSaluteScreen(false); setSaluteTab("medico"); restore(bioScroll.current); };
  const onBioTab = (t: HTab) => {
    if (t === "home" || t === "medico" || t === "biologia") return;
    saluteOpen.current = false; setSaluteScreen(false); setSaluteTab("medico");
    setCorpoScreen(false); setCorpoTab(t); setView({ tab: "corpo", sub: null }); toTop();
  };
  const saluteSub = (s: Sub) => s.key !== "biologia" ? subCard(s) : (
    <button key={s.key} aria-label="Sezione Biologia" data-v={s.score ?? ""} onClick={openBio} style={{ ...btn, ...card, ...row, width: "100%", gap: 14, textAlign: "left" }}>
      {ring(s.score, 58, 6, s.score == null ? <span style={num(22, K.t3)}>—</span> : <span style={num(22)}>{s.score}</span>)}
      <div style={{ ...col(3), flex: 1 }}>
        <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{s.name}</span>
        <span style={txt}>{s.line}</span>
      </div>
      {ic("right", K.t3, 16, 2.2)}
    </button>
  );
  const bioSub = saluteA.subs.find((x) => x.key === "biologia") ?? null;
  // one embedded instance (tab = medico or biologia): switching does not remount it, so no entry animation replays
  const salutePage = (
    <div onClickCapture={() => { if (!saluteOpen.current) saluteScroll.current = scroller.current ? scroller.current.scrollTop : 0; }}>
      {saluteScreen ? null : saluteTab === "biologia" ? header("Biologia", "Salute", backToSalute) : header(saluteA.name, `Con ${saluteA.agents}`)}
      {!saluteScreen && saluteTab === "biologia" && bioSub ? <div style={{ padding: "14px 16px 0" }}>{subCard(bioSub)}</div> : null}
      <SaluteApp embed noHeader tab={saluteTab} onTab={onBioTab} onView={() => {}} onScreen={onSaluteScreen} sel={DATA.today} slots={{
        hero: saluteTab === "medico" ? (desk
          ? <div className="dk-span" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 340px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
              <div style={col(14)}><div style={{ ...card, padding: "18px 16px" }}>{hero(saluteA)}</div>{tipCard(saluteA.tip)}</div>
              <div style={col(14)}>{sectionTitle("Sezioni")}<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>{saluteA.subs.map(saluteSub)}</div></div>
            </div>
          : <>{hero(saluteA)}{tipCard(saluteA.tip)}{sectionTitle("Sezioni")}{saluteA.subs.map(saluteSub)}</>) : null,
        bioPace: paceCard,
      }} />
    </div>
  );
  const L = LAVORO;
  // ---------- Lavoro (the work agent): ranked priorities first, then this week, sub-areas, what goes well, next steps, open items ----------
  const ST_C: Record<string, string> = { bene: K.good, "da seguire": K.weak, critico: K.low };
  const pill = (t: string, c: string) => <span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: c, background: `${c}1F`, border: `1px solid ${c}59`, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap", flex: "0 0 auto" }}>{t}</span>;
  const weekEnd = addDays(todayISO, 6);
  const upcoming = L.events.filter((e) => (e.end ?? e.date) >= todayISO).sort((a, z) => (a.date + (a.time ?? "")) < (z.date + (z.time ?? "")) ? -1 : 1);
  const thisWeek = upcoming.filter((e) => e.date <= weekEnd), later = upcoming.filter((e) => e.date > weekEnd);
  const wkDay = (d: string) => { const p = pDate(d), n = diffDays(todayISO, d); return n === 0 ? "oggi" : n === 1 ? "domani" : `${WDL[p.w].slice(0, 3)} ${p.dd}`; };
  const lavoroPrio = L.priorities && L.priorities.length ? (
    <>
      {blk(sectionTitle("Priorità", <span style={lbl}>in ordine</span>),
      <div key="p" aria-label="Priorità lavoro" style={{ ...card, padding: "2px 16px" }}>
        {L.priorities.map((p, i) => (
          <div key={p.rank} aria-label={`Priorità ${p.rank}`} style={{ ...col(6), padding: "14px 0", borderBottom: i < (L.priorities as unknown[]).length - 1 ? `1px solid ${K.line}` : "none" }}>
            <div style={{ ...row, gap: 10, alignItems: "flex-start" }}>
              <span style={{ ...num(15, i === 0 ? K.bg : K.t1), width: 24, height: 24, borderRadius: 12, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? K.t1 : K.track }}>{p.rank}</span>
              <span style={{ flex: 1, fontSize: 15, lineHeight: "21px", fontWeight: 600, color: K.t1 }}>{p.titolo}</span>
              {pill(p.status, ST_C[p.status])}
            </div>
            <span style={{ ...txt, paddingLeft: 34 }}>{p.line}</span>
            {p.next ? <div style={{ ...row, gap: 8, alignItems: "flex-start", paddingLeft: 34 }}><span aria-hidden="true" style={{ fontSize: 14, lineHeight: "20px", color: K.t3, flex: "0 0 auto" }}>→</span><span style={{ fontSize: 14, lineHeight: "20px", color: K.t1, flex: 1 }}>{p.next}{p.quando ? <span style={{ color: K.t3 }}>{` · entro ${shortDate(p.quando)}`}</span> : null}</span></div> : null}
          </div>
        ))}
      </div>)}
      {thisWeek.length && thisWeek.length <= 3 ? blk(sectionTitle("Questa settimana"), listCard(thisWeek.map((e) => ({ title: e.name, sub: e.time ? `${wkDay(e.date)} · ${e.time}` : wkDay(e.date), right: e.end ? `${shortDate(e.date)} – ${shortDate(e.end)}` : shortDate(e.date), color: e.date === todayISO ? K.weak : K.t2 })))) : null}
    </>
  ) : null;
  const lavoroExtra = (
    <>
      {!L.priorities?.length && L.priorita ? blk(sectionTitle("Priorità"), <div style={{ ...card, ...col(8) }}>{L.priorita.steps.map((x) => <div key={x} style={{ ...row, gap: 10, alignItems: "flex-start" }}>{ic("check", K.good, 16, 2.2)}<span style={{ ...txt, flex: 1 }}>{x}</span></div>)}</div>) : null}
      {L.wins && L.wins.length ? blk(sectionTitle("Cose che vanno bene"), <div aria-label="Cose che vanno bene" style={{ ...card, padding: "2px 16px" }}>
        {L.wins.map((w, i) => (
          <div key={w.titolo} style={{ ...row, gap: 10, alignItems: "flex-start", padding: "12px 0", borderBottom: i < (L.wins as unknown[]).length - 1 ? `1px solid ${K.line}` : "none" }}>
            {ic("check", K.good, 16, 2.2)}
            <span style={{ fontSize: 14, lineHeight: "20px", color: K.t1, flex: 1 }}>{w.titolo}</span>
            {w.data ? <span style={{ ...lbl, whiteSpace: "nowrap" }}>{shortDate(w.data)}</span> : null}
          </div>
        ))}
      </div>) : null}
      {L.openLoops.length ? blk(sectionTitle("Cose aperte", <span style={lbl}>aspettano te</span>), listCard(L.openLoops.map((x) => ({ title: x })))) : null}
      {L.soddisfazione ? blk(sectionTitle("Soddisfazione"), <div style={card}><span style={txt}>{L.soddisfazione.line}</span></div>) : null}
      {L.linkedin ? blk(sectionTitle("LinkedIn", <span style={lbl}>settimana del {shortDate(L.linkedin.week)}</span>), kv([
        ["Follower", grp(L.linkedin.followers)],
        ["Visite al profilo (90 giorni)", grp(L.linkedin.profileViews90d)],
        ["Impression post (7 giorni)", grp(L.linkedin.impressions7d)],
        ["Comparse nelle ricerche", grp(L.linkedin.searchAppearances)],
      ]), <div style={card}><span style={lbl}>Post migliore</span><div style={{ ...txt, marginTop: 2 }}>{L.linkedin.bestPost}</div></div>) : null}
      {(L.priorities?.length ? later : upcoming).length ? blk(sectionTitle(L.priorities?.length ? "Più avanti" : "In calendario"), listCard((L.priorities?.length ? later.slice(0, 3) : upcoming).map((e) => ({ title: e.name, sub: e.time ?? undefined, right: e.end ? `${shortDate(e.date)} – ${shortDate(e.end)}` : shortDate(e.date) })))) : null}
      <span style={{ ...lbl, padding: "0 2px" }}>Da {agentLabel("lavoro")}, aggiornato il {longDate(L.updated)}</span>
    </>
  );
  const kindColor = { scaduta: K.low, urgente: K.weak, aperta: K.t3, pagata: K.good } as const;
  const finanzeExtra = (
    <>
      {blk(sectionTitle("Scadenze", SCADENZE_UPDATED ? <span style={lbl}>aggiornate {shortDate(SCADENZE_UPDATED)}</span> : undefined),
      scadenze.length ? listCard(scadenze.map((x) => ({ title: x.cosa, sub: `${x.entita} · ${x.scadenza}${/\d/.test(x.importo) ? ` · ${x.importo} €` : ""} · ${x.chi}`, right: x.kind, color: kindColor[x.kind] }))) : emptyCard("Nessuna scadenza registrata."))}
    </>
  );
  // relazioni: birthdays in the next 60 days, events in the next 60 days
  const bdays = BIRTHDAYS.map((b) => {
    let y = today.y; let iso = `${y}-${String(b.m).padStart(2, "0")}-${String(b.d).padStart(2, "0")}`;
    if (iso < todayISO) { y += 1; iso = `${y}-${String(b.m).padStart(2, "0")}-${String(b.d).padStart(2, "0")}`; }
    return { ...b, iso, inDays: diffDays(todayISO, iso), age: b.y ? y - b.y : null };
  }).filter((b) => b.inDays <= 60).sort((a, z) => a.inDays - z.inDays);
  const evs = EVENTS.filter((e) => (e.end ?? e.date) >= todayISO && diffDays(todayISO, e.date) <= 60).sort((a, z) => (a.date < z.date ? -1 : 1));
  const when = (n: number) => (n === 0 ? "oggi" : n === 1 ? "domani" : `tra ${n} giorni`);
  const relazioniExtra = (
    <>
      {blk(sectionTitle("Compleanni in arrivo"),
      bdays.length ? listCard(bdays.slice(0, 8).map((b) => ({ title: b.name, sub: `${shortDate(b.iso)}${b.age ? ` · compie ${b.age} anni` : ""}`, right: when(b.inDays), color: b.inDays <= 7 ? K.weak : K.t2 }))) : emptyCard("Nessun compleanno nei prossimi due mesi."))}
      {evs.length ? blk(sectionTitle("Eventi in arrivo"), listCard(evs.map((e) => ({ title: e.name, right: e.end ? `${shortDate(e.date)} – ${shortDate(e.end)}` : shortDate(e.date) })))) : null}
      <span style={{ ...lbl, padding: "0 2px" }}>Dal report di {agentLabel("relazioni")} del {longDate(RELAZIONI.updated)}</span>
    </>
  );
  // Crescita / Vita (their agent): the remaining next steps of each sub-area (the tip card already shows one), then the date
  const areaExtra = (a: Area, d: { updated: string; sfere?: { name: string; steps: string[] }[] }) => {
    const steps = (d.sfere ?? []).flatMap((s) => s.steps.map((t) => ({ title: t, sub: s.name }))).filter((x) => x.title !== a.tip);
    return (
      <>
        {steps.length ? blk(sectionTitle("Prossimi passi"), listCard(steps)) : null}
        <span style={{ ...lbl, padding: "0 2px" }}>Da {agentLabel(a.id)}, aggiornato il {longDate(d.updated)}</span>
      </>
    );
  };
  // Vita: open personal to-dos from Notion (Open Loops + Personal tasks), dated first; overdue / high priority in orange
  const vitaTodo = (() => {
    const t = [...(VITA?.todo ?? [])].sort((a, b) => (a.data ?? "9999") < (b.data ?? "9999") ? -1 : (a.data ?? "9999") > (b.data ?? "9999") ? 1 : 0);
    if (!t.length) return null;
    const today = romeDay();
    return blk(sectionTitle("Cose aperte"), listCard(t.map((x) => ({ title: x.titolo, sub: x.quando ?? undefined,
      right: x.priorita === "alta" ? "priorità alta" : x.data && x.data < today ? "scaduta" : undefined,
      color: x.priorita === "alta" || (x.data && x.data < today) ? K.weak : K.t2 }))));
  })();
  const altro = (
    <div>
      {header("Altro", ((ns: string[]) => ns.length > 1 ? `${ns.slice(0, -1).map((n, i) => (i ? n.toLowerCase() : n)).join(", ")} e ${ns[ns.length - 1].toLowerCase()}` : ns[0] ?? "")(AREAS.filter((a) => ["relazioni", "crescita", "vita"].includes(a.id)).map((a) => a.name)))}
      <div style={{ ...col(14), padding: "14px 16px 0" }}>
        {desk ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>{(["relazioni", "crescita", "vita"] as AreaId[]).filter((id) => AREAS.some((a) => a.id === id)).map((id) => areaTile(area(id)))}</div>
          : <div style={{ ...card, padding: "2px 16px" }}>{(["relazioni", "crescita", "vita"] as AreaId[]).filter((id) => AREAS.some((a) => a.id === id)).map((id, i, ids) => areaRow(area(id), i === ids.length - 1))}</div>}
      </div>
    </div>
  );
  const backAltro = () => setView({ tab: "altro", sub: null });
  const screen = (() => {
    if (view.tab === "home") return home;
    if (view.tab === "corpo") return corpoPage;
    if (view.tab === "salute") return salutePage;
    if (view.tab === "lavoro") return page(area("lavoro"), lavoroExtra, undefined, lavoroPrio);
    if (view.tab === "finanze") return page(area("finanze"), finanzeExtra);
    if (view.sub === "relazioni") return page(area("relazioni"), relazioniExtra, backAltro);
    if (view.sub === "crescita") return page(area("crescita"), CRESCITA ? areaExtra(area("crescita"), CRESCITA) : emptyCard("Apprendimento e obiettivi personali: la riempiamo più avanti.", false), backAltro);
    if (view.sub === "vita") return page(area("vita"), VITA ? <>{vitaTodo}{areaExtra(area("vita"), VITA)}</> : emptyCard("Hobby, esperienze e viaggi: la riempiamo più avanti.", false), backAltro);
    return altro;
  })();

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "home", label: "Home", icon: "home" }, { id: "corpo", label: areaName("corpo", "Corpo"), icon: "body" }, { id: "salute", label: areaName("salute", "Salute"), icon: "heart" },
    { id: "lavoro", label: areaName("lavoro", "Lavoro"), icon: "work" }, { id: "finanze", label: areaName("finanze", "Finanze"), icon: "money" }, { id: "altro", label: "Altro", icon: "more" },
  ];
  const goTab = (id: Tab) => { if (id === "corpo") { setCorpoTab("home"); setCorpoScreen(false); } if (id !== "salute" || view.tab !== "salute") { saluteOpen.current = false; setSaluteScreen(false); } if (id === "salute") setSaluteTab("medico"); setView({ tab: id, sub: null }); };
  if (desk) {
    const scoreOf = (id: Tab | AreaId) => AREAS.find((a) => a.id === id)?.score ?? null;
    const sideItem = (key: string, label: string, icon: string, on: boolean, go: () => void, score: number | null, sub = false, tab = true) => (
      <button key={key} className={tab ? "wb-tab" : "dk-sub"} aria-label={label} aria-current={on ? "page" : undefined} onClick={go}
        style={{ ...btn, ...row, width: "100%", boxSizing: "border-box", gap: 12, height: sub ? 36 : 42, padding: sub ? "0 12px 0 44px" : "0 12px", borderRadius: 10, background: on ? K.card2 : "transparent", border: `1px solid ${on ? K.line : "transparent"}` }}>
        {sub ? null : ic(icon, on ? K.t1 : "#9AA1A8", 20, on ? 2.1 : 1.7)}
        <span className="wb-lbl" style={{ flex: 1, fontSize: sub ? 13 : 14, lineHeight: "18px", fontWeight: on ? 700 : 500, color: on ? K.t1 : sub ? K.t3 : K.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {score !== null ? <span style={num(15, WEAKEST && WEAKEST.id === key ? K.weak : on ? K.t1 : K.t3)}>{score}</span> : null}
      </button>
    );
    const altroIds = (["relazioni", "crescita", "vita"] as AreaId[]).filter((id) => AREAS.some((a) => a.id === id));
    return (
      <div className="wb-root dk" style={{ position: "fixed", inset: 0, height: "var(--app-h, 100vh)", background: K.bg, color: K.t1, fontFamily: FONT, overflow: "hidden" }}>
        <style>{DESK_CSS}</style>
        <nav className="wb-dock dk-side" aria-label="Navigazione" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDE_W, zIndex: 8, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 4, padding: "20px 14px", background: "#0E1215", borderRight: `1px solid ${K.line}`, overflowY: "auto" }}>
          <div style={{ ...row, gap: 12, padding: "0 6px 18px" }}>
            {avatar}
            <div style={{ ...col(1), flex: 1 }}>
              <span style={{ ...caps, fontSize: 15, lineHeight: "20px", color: K.t1 }}>{LIFE.appName || "Life"}</span>
              <span style={lbl}>{todayLine}</span>
            </div>
          </div>
          {TABS.map((t) => sideItem(t.id, t.label, t.icon, view.tab === t.id && (t.id !== "altro" || !view.sub), () => goTab(t.id), t.id === "home" ? HAPPINESS : t.id === "altro" ? null : scoreOf(t.id)))}
          {altroIds.map((id) => sideItem(id, area(id).name, AREA_ICON[id], view.tab === "altro" && view.sub === id, () => openArea(id), scoreOf(id), true, false))}
          <div style={{ flex: 1 }} />
          <span style={{ ...lbl, padding: "12px 8px 0" }}>{`Dati aggiornati alle ${DATA.updatedAt.slice(11, 16)}`}</span>
        </nav>
        <div ref={scroller} className="wb-view" style={{ position: "absolute", left: SIDE_W, top: 0, right: 0, bottom: 0, overflowY: "auto", boxSizing: "border-box" } as CSSProperties}>
          <div className="dk-main" style={{ maxWidth: 1560, margin: "0 auto", padding: "0 24px" }}>{screen}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="wb-root" style={{ position: "fixed", inset: 0, height: "var(--app-h, 100vh)", background: K.bg, color: K.t1, fontFamily: FONT, overflow: "hidden" }}>
      <div ref={scroller} className="wb-view" style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: "calc(var(--dock-h, 74px) + 28px)", boxSizing: "border-box" } as CSSProperties}>
        <div style={{ maxWidth: 440, margin: "0 auto" }}>{screen}</div>
      </div>
      <nav className="wb-dock" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 8, boxSizing: "border-box", padding: "4px 8px max(8px, var(--sa-b, env(safe-area-inset-bottom, 0px)))", background: K.bg, borderTop: `1px solid ${K.line}` }}>
        <div style={{ display: "flex", maxWidth: 440, margin: "0 auto" }}>
          {TABS.map((t) => {
            const on = view.tab === t.id;
            return (
              <button key={t.id} className="wb-tab" aria-label={t.label} onClick={() => goTab(t.id)} style={{ ...btn, flex: "1 1 0", minWidth: 0, height: 58, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {ic(t.icon, on ? K.t1 : "#9AA1A8", 23, on ? 2.1 : 1.7)}
                <span className="wb-lbl" style={{ fontSize: 10, lineHeight: "12px", fontWeight: on ? 700 : 600, letterSpacing: "0.02em", color: on ? K.t1 : "#9AA1A8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
