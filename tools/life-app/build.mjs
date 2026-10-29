// Build the encrypted Life App PWA.
// usage: node build.mjs [--health-source page.tsx] [--kb <repo root, default ../..>] [--out DIR] [--password-file FILE]
//        [--salt-file FILE] [--data-dir DIR, default <kb>/data/happiness] [--scores-only] [--scores-out FILE, default out/scores.json]
// Settings: config.local.yml `life_app:` (resolved by life_config.py; flags win over it). See tools/life-app/README.md.
// Data sources (all real, nothing typed into the app code); the single source of truth is <kb>/data/happiness/:
//   Corpo + Salute/Medico -> the health page (src/health/health-page.tsx), included as salute-full.tsx in embedded mode;
//     the publisher passes a copy with DATA = data/happiness/corpo.json and MEDICO = medico.json (tools/happiness.py inject)
//   Mente, Lavoro, Finanze, Relazioni, Crescita, Vita -> data/happiness/<area>.json (one file per area/agent)
//   Corpo rolling history -> data/happiness/corpo-history.json (refreshed here)
//   Life Health history -> data/happiness/life-health-history.json (today's row refreshed here, closed days frozen)
//   --scores-only: stop after the history and write the numbers the app shows (out/scores.json, for the MD recaps); no password needed
//   Optional: Scadenze <- <kb>/data/finance/scadenzario.md · Compleanni <- <kb>/data/people/*.md (birthday:) ·
//   Eventi <- <kb>/data/events/*.md (date:) · body days <- <kb>/data/body/body-YYYY-MM-DD.md · workouts <- data/training/*.md
//   Medical archive <- data/health/records.md + vaccinations.md + data/body/labs/ (archive.mjs)
//   Misure (blood pressure, waist) <- data/health/blood-pressure.md + data/body/waist.md (misure.mjs)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, cpSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { webcrypto as wc, randomBytes, createHash } from "node:crypto";
import * as esbuild from "esbuild";
import { AREA_MODULES } from "./area-modules.mjs";
import { readTraining } from "./training.mjs";
import { trainingPatches } from "./training-patches.mjs";
import { stepsPatches } from "./steps-patches.mjs";
import { archivePatches } from "./archive-patches.mjs";
import { readArchive } from "./archive.mjs";
import { misurePatches } from "./misure-patches.mjs";
import { readMisure } from "./misure.mjs";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
// resolved settings (owner, areas, timezone, files): life_config.py reads config.local.yml through tools/config.py
const CFG = JSON.parse(execFileSync("python3", [join(HERE, "life_config.py")], { encoding: "utf8" }));
const saluteSrc = arg("health-source", arg("salute-source", CFG.health_page)), kb = resolve(arg("kb", join(HERE, "../.."))), out = resolve(arg("out", join(HERE, "out/site")));
const pwFile = arg("password-file", CFG.password_file);
const saltFile = arg("salt-file", CFG.salt_file);
const dataDir = resolve(arg("data-dir", join(kb, "data/happiness")));
const scoresOnly = process.argv.includes("--scores-only");
// training logs and plan templates (data/training/*.md, MD first): exercises, lift history, sessions for the 8-week view
const training = readTraining(kb);
const scoresOut = resolve(arg("scores-out", join(HERE, "out/scores.json")));
const ITER = 310000;
if (!saluteSrc || !existsSync(saluteSrc)) { console.error("missing health page source: " + saluteSrc); process.exit(2); }

// 1. health Page: the WHOLE health page source (src/health/health-page.tsx), included at build time.
// It is never edited on disk: build-time patches below only add an "embedded" mode (props) used by the Life App
// Corpo and Salute pages. Without props the component behaves as a standalone health page.
// Every patch must match exactly; if the health Page changes a patched line the build fails loudly (fix the anchor here).
// pages that predate the config globals (e.g. an instance's own copy of the page kept elsewhere) get the three
// declarations the build-time fragments use; the page in src/health/ declares them itself
const s0 = readFileSync(saluteSrc, "utf8");
const shim = [["TZ", "__LIFE_TZ__", "Europe/Rome"], ["COACH", "__LIFE_COACH__", "il coach"], ["GYM", "__LIFE_GYM__", "Palestra"]]
  .filter(([n]) => !new RegExp(`^const ${n}\\b`, "m").test(s0))
  .map(([n, g, d]) => `const ${n}: string = (typeof globalThis !== "undefined" ? (globalThis as unknown as { ${g}?: string }).${g} : undefined) ?? ${JSON.stringify(d)};`);
const s = shim.length ? s0.replace(/^((?:import [^\n]*\n)+)/m, (m) => m + shim.join("\n") + "\n") : s0;
if (!s.includes("export default function App()") || !s.includes("DATA:START") || !s.includes("const MEDICO")) { console.error("health Page source: App / DATA / MEDICO not found"); process.exit(3); }
let full = s;
const patch = (name, from, to, count = 1) => {
  const n = typeof from === "string" ? full.split(from).length - 1 : (full.match(new RegExp(from.source, "g" + from.flags.replace("g", ""))) || []).length;
  if (n !== count) { console.error(`health Page embed patch "${name}": expected ${count} match(es), found ${n}. Update the anchor in tools/life-app/build.mjs.`); process.exit(5); }
  full = typeof from === "string" ? full.split(from).join(to) : full.replace(new RegExp(from.source, "g" + from.flags.replace("g", "")), to);
};
patch("tab type", /type Tab = ([^;]+);/, 'type Tab = $1 | "medico" | "peso";\nexport type EmbedProps = { embed?: boolean; tab?: Tab; onTab?: (t: Tab) => void; onView?: () => void; onScreen?: (open: boolean) => void; noHeader?: boolean };');
patch("props", "export default function App() {", "export default function App(props: EmbedProps = {}) {");
patch("controlled tab", 'const [tab, setTab] = useState<Tab>("home");',
  'const [tabS, setTabS] = useState<Tab>(props.tab ?? "home");\n  const tab: Tab = props.tab ?? tabS;\n  const setTab = (t: Tab) => { setTabS(t); if (props.onTab) props.onTab(t); };');
patch("reset on parent tab", /(\n  const goTab = \(t: Tab\) => \{[^\n]*\n)/, '$1  useEffect(() => { if (props.embed) { setInfo(false); setScreen(null); setCal(false); } }, [props.tab]);\n  useLayoutEffectX(() => { if (props.onScreen) props.onScreen(screen !== null); }, [screen]);\n');
patch("scroll reset", "useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [scrollKey]);",
  "useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; if (props.onView) props.onView(); }, [scrollKey]);");
patch("safe top", 'const safeTop = "var(--sa-t, env(safe-area-inset-top, 0px))";', 'const safeTop = props.embed && !screen ? "0px" : "var(--sa-t, env(safe-area-inset-top, 0px))";');
patch("frost", 'const frost: CSSProperties = { position: "sticky",', 'const frost: CSSProperties = { position: props.embed && !screen ? "relative" : "sticky",');
patch("medico tab", ': tab === "fitness" ? fitness : altro;', ': tab === "fitness" ? fitness : tab === "medico" ? <div style={st(14)}>{props.slots?.hero ?? null}{medico}{props.slots?.sections ?? null}</div> : altro;');
patch("medico out of biologia", "\n      {medico}\n", "\n      {props.embed ? null : medico}\n");
patch("header", "const showHeader = !screen && (", "const showHeader = !props.noHeader && !screen && (");
patch("root", '<div className="wb-root" style={{', '<div className="wb-root" style={props.embed ? { boxSizing: "border-box", width: "100%", position: "relative", fontFamily: FONT, color: K.t1 } as CSSProperties : {');
patch("scroller", 'style={{ flex: 1, minHeight: 0, overflowY: "auto"', 'style={props.embed ? {} as CSSProperties : { flex: 1, minHeight: 0, overflowY: "auto"');
patch("bottom padding", 'paddingBottom: screen ? 28 :', 'paddingBottom: screen || props.embed ? 28 :');
patch("nav", "{!screen ? (", "{!screen && !props.embed ? (");
// biological age: in the Life App no numeric per-factor contribution (never show how it is calculated): qualitative label only
patch("bio years label", "  const yrs = (v: number) => ", '  const yrs = (v: number) => props.embed ? (v > 0 ? "da migliorare" : v < 0 ? "bene" : "nella norma") : ');
patch("bio sum card open", "      <div style={{ ...card, ...st(8) }}>\n        <span style={capLbl(12)}>Somma dei contributi</span>", "      {props.embed ? null : <div style={{ ...card, ...st(8) }}>\n        <span style={capLbl(12)}>Somma dei contributi</span>");
patch("bio sum card close", "      </div>\n      {insight(drivers.length", "      </div>}\n      {insight(drivers.length");
// day bar: no second avatar under the Life header (streak, date picker and update time stay)
patch("day bar avatar", "        <div style={{ ...row, gap: 8 }}>\n          {AVATAR ? (", "        <div style={{ ...row, gap: 8 }}>\n          {props.embed ? null : AVATAR ? (");
// ---- Corpo as ONE Life page (2026-10-23, the owner: sleep / recovery / strain separate, no sub-app glued under Life) ----
// selected day controlled by the Life header day picker
patch("controlled day", "const [sel, setSel] = useState<string>(DATA.today);",
  "const [selS, setSelS] = useState<string>(props.sel ?? DATA.today);\n  const sel: string = props.sel ?? selS;\n  const setSel = (x: string) => { setSelS(x); if (props.onSel) props.onSel(x); };");
patch("embed props type", "export type EmbedProps = { embed?: boolean;", "export type EmbedProps = { onEve?: (e: { bedBy: number; bedBy85: number; wake: number; need: number } | null) => void; sforzoScore?: number | null; sonnoScore?: number | null; sel?: string; onSel?: (d: string) => void; slots?: { hero?: ReactNode; ring?: ReactNode; tip?: string | null; sections?: ReactNode; sonnoMid?: ReactNode; bioPace?: ReactNode; windowed?: boolean; trends?: ReactNode } | null; embed?: boolean;");
// the three big rings open their own chip (Sonno / Recupero / Sforzo) instead of a detail screen
patch("dial tap", '<button key={id} onClick={() => open({ kind: "dial", id })}', '<button key={id} aria-label={props.embed ? `Sezione ${dialMeta[id].name}` : undefined} onClick={() => (props.embed ? goTab(id) : open({ kind: "dial", id }))}');
// no Sonno/Recupero/Sforzo switch nor second date pill inside the chips (the Life chips and day picker cover it)
patch("health switch", "const healthSwitch = (", "const healthSwitch = props.embed ? null : (");
// embedded Corpo hub (slots.windowed = Settimana / Lungo periodo view: only selector, ring and section cards): Corpo ring, one guidance card, the Life section cards (each opens a sub-page), then the rest of the day once
patch("life home", "\n  const home = (\n", `
  const lifeHome = (
    <div style={st(14)}>
      {props.slots?.hero ?? null}
      {props.slots?.ring ?? null}
      {props.slots?.windowed ? null : <>
      {todayHero}
      <button onClick={() => open({ kind: "coach" })} aria-label="Cosa fare oggi" style={{ ...btn, ...card, ...st(6) }}>
        <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.warn }}>{live ? "Cosa fare oggi" : dayTitle(d.date)}</span>
        {guideLead}
        {live && props.slots?.tip ? <span style={{ fontSize: 15, lineHeight: "21px", color: K.t1 }}>{props.slots.tip}</span> : null}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: live && props.slots?.tip ? 4 : 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: recColor(dRec) }}>{outlookTitle}</span>
          <span style={{ ...row, gap: 4 }}><span style={{ ...lbl, fontWeight: 700 }}>{coachTips.length} {coachTips.length === 1 ? "consiglio" : "consigli"}</span>{chev(K.t3)}</span>
        </div>
        <span style={txt}>{outlookAfter}</span>
      </button>
      {homeTwins}
      {hrNowCard}
      </>}
      {props.slots?.sections ?? null}
    </div>
  );
  const home = (
`);
// Tendenze in the Corpo Settimana / Lungo periodo views: the Life trend block (week days or 90 days) replaces the fixed 7-day page
patch("trends slot", "  const altro = (\n", "  const altro = props.slots?.trends ? <div style={st(14)}>{props.slots.trends}</div> : (\n");
patch("home content", 'content = tab === "home" ? home :', 'content = tab === "home" ? (props.embed && props.slots ? lifeHome : home) :');
// section and page headings in the Life section-title style (small capitals, like "SEZIONI")
patch("section title style", '    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12 }}>\n      <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: K.t1 }}>{t}</span>{right}',
  '    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: props.embed ? 0 : 12, padding: props.embed ? "10px 2px 0" : 0 }}>\n      <span style={props.embed ? { ...caps, fontSize: 13, lineHeight: "18px", color: K.t1 } : { fontSize: 20, lineHeight: "26px", fontWeight: 600, color: K.t1 }}>{t}</span>{right}');
patch("page title block", /\n      <div style=\{\{ \.\.\.st\(2\), paddingTop: 6 \}\}>\n        <span style=\{\{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: K\.t1 \}\}>(Fitness|Biologia)<\/span>\n        <span style=\{lbl\}>([^<\n]*)<\/span>\n      <\/div>\n/, '\n      {props.embed ? null : <div style={{ ...st(2), paddingTop: 6 }}>\n        <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: K.t1 }}>$1</span>\n        <span style={lbl}>$2</span>\n      </div>}\n', 2);
// detail screens inside the Life App: the Life header hides (onScreen), this back bar is the only header, Life title style
patch("back bar title", '<span style={{ ...caps, ...ell, fontSize: 13, textAlign: "center", color: K.t1 }}>{title}</span><span />',
  '<span style={{ ...caps, ...ell, fontSize: props.embed ? 16 : 13, lineHeight: props.embed ? "21px" : undefined, textAlign: props.embed ? "left" : "center", color: K.t1 }}>{title}</span><span />');
// factor status labels in the Life body font (small caps), not the condensed number font
patch("bio factor label", '<span style={numStyle(16, f.years === null ? K.t3 : f.years > 0 ? K.warn : f.years < 0 ? K.up : K.t2)}>',
  '<span style={props.embed ? { ...caps, fontSize: 11, lineHeight: "16px", whiteSpace: "nowrap", color: f.years === null ? K.t3 : f.years > 0 ? K.warn : f.years < 0 ? K.up : K.t2 } : numStyle(16, f.years === null ? K.t3 : f.years > 0 ? K.warn : f.years < 0 ? K.up : K.t2)}>');
patch("bio driver label", '<span style={{ ...numStyle(16, (f.years ?? 0) > 0 ? K.warn : K.up), flex: "0 0 auto" }}>',
  '<span style={{ ...(props.embed ? { ...caps, fontSize: 11, lineHeight: "16px", whiteSpace: "nowrap", color: (f.years ?? 0) > 0 ? K.warn : K.up } : numStyle(16, (f.years ?? 0) > 0 ? K.warn : K.up)), flex: "0 0 auto" }}>');
// moved blocks: tonight card under the Sonno ring (replacing the shorter in-page "Stanotte"), morning card under Recupero,
// match card on top of Allenamento (its own session list already has the day's activities), health monitor on top of Biologia; meals / protein gap / key stats / note /
// upcoming are already in Nutrizione, Sforzo, Recupero, Allenamento, so the hub just drops them
// Sonno: the in-page planner (Stanotte) is the one tonight card, same as the health app
patch("recupero morning", '{detailTop("recupero", withBack)}', '{detailTop("recupero", withBack)}\n      {props.embed && live ? morningCard : null}');
patch("tonight/morning tap", '<button onClick={() => open({ kind: "dial", id: "sonno" })} style={{ ...btn,', '<button onClick={() => (props.embed ? undefined : open({ kind: "dial", id: "sonno" }))} style={{ ...btn,', 2);
patch("allenamento top", ': tab === "fitness" ? fitness : tab === "medico"', ': tab === "fitness" ? (props.embed ? <div style={st(14)}>{live ? matchCard : null}{fitness}</div> : fitness) : tab === "medico"');
// Sforzo opens with the picked day's sessions (effort, kcal, zones), same as the health app; the week follows
patch("biologia top", ': tab === "biologia" ? biologia :', ': tab === "biologia" ? (props.embed ? <div style={st(14)}>{biologia}</div> : biologia) :');
// no dead tap affordances inside the Life sub-pages: the tonight/morning cards do nothing there, so no arrow
patch("tonight chev", ': chev(K.t1)}\n        </div>\n        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-end" }}>', ': props.embed ? null : chev(K.t1)}\n        </div>\n        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-end" }}>');
patch("morning chev", '"Stasera si riparte, con calma."}</span>\n      </div>\n      {chev(K.t1)}', '"Stasera si riparte, con calma."}</span>\n      </div>\n      {props.embed ? null : chev(K.t1)}');
patch("tonight/morning cursor", '<button onClick={() => (props.embed ? undefined : open({ kind: "dial", id: "sonno" }))} style={{ ...btn,', '<button onClick={() => (props.embed ? undefined : open({ kind: "dial", id: "sonno" }))} style={{ ...btn, cursor: props.embed ? "default" : "pointer",', 2);
// "Esami del sangue" scrolls to Medico, which in the Life App lives in Salute: hidden in Biologia (embedded)
patch("bio labs link", '{labs ? (\n        <button onClick={() => {\n          const s = scroller.current;', '{labs && !props.embed ? (\n        <button onClick={() => {\n          const s = scroller.current;');
// Peso: own Corpo sub-page (embedded); weight, chart and body data move out of Biologia
patch("bio corpo block", '      {sectionTitle("Corpo", lastWeigh ?', '      {props.embed ? null : <>{sectionTitle("Corpo", lastWeigh ?');
patch("bio corpo block end", ') : null}\n\n      {labs && !props.embed ? (', ') : null}</>}\n\n      {labs && !props.embed ? (');
patch("peso page", "\n  const biologia = (\n", `
  const wDelta = (i: number) => (i > 0 ? WEIGHTS[i].kg - WEIGHTS[i - 1].kg : null);
  const pesoPage = (
    <div style={st(14)}>
      <div style={three}>
        {stat("Peso", fmt(curKg), "kg")}
        {stat("Altezza", curH === null ? "—" : String(curH), "cm")}
        {stat("BMI", bmiNow === null ? "—" : r1(bmiNow).toLocaleString("it-IT"), bmiNow === null ? "" : bmiNow < 25 ? "normopeso" : bmiNow < 30 ? "sovrappeso" : "obesità")}
      </div>
      {weightChart ? (
        <div style={{ ...card, ...st(8) }}>
          <span style={capLbl(12)}>Andamento peso</span>
          {weightChart}
          {wFirst && wLast ? <span style={txt}>{wLast.kg < wFirst.kg ? \`−\${r1(wFirst.kg - wLast.kg).toLocaleString("it-IT")} kg\` : \`+\${r1(wLast.kg - wFirst.kg).toLocaleString("it-IT")} kg\`} in {daysBetween(wFirst.date, wLast.date)} giorni ({WEIGHTS.length} pesate).</span> : null}
        </div>
      ) : null}
      {sectionTitle("Pesate")}
      <div style={{ ...card, padding: "4px 16px" }}>
        {WEIGHTS.map((w, i) => ({ w, i })).reverse().map(({ w, i }, j, arr) => {
          const dl = wDelta(i);
          return (
            <div key={w.date} style={{ ...row, justifyContent: "space-between", padding: "12px 0", borderBottom: j < arr.length - 1 ? \`1px solid \${K.line}\` : "none" }}>
              <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{longDate(w.date)}</span>
              <span style={{ ...row, gap: 10 }}>{dl !== null && dl !== 0 ? <span style={{ ...lbl, color: dl < 0 ? K.up : K.warn }}>{\`\${dl < 0 ? "−" : "+"}\${r1(Math.abs(dl)).toLocaleString("it-IT")} kg\`}</span> : null}<span style={numStyle(18)}>{fmt(w.kg)} kg</span></span>
            </div>
          );
        })}
      </div>
      {sectionTitle("Composizione corporea")}
      <div style={three}>
        {stat("Grasso", isNum(bio?.bodyFatPct) ? r1(bio?.bodyFatPct as number).toLocaleString("it-IT") : "—", isNum(bio?.bodyFatPct) ? "%" : "da misurare")}
        {stat("Magra", isNum(bio?.bodyFatPct) && curKg !== null ? r1(curKg * (1 - (bio?.bodyFatPct as number) / 100)).toLocaleString("it-IT") : "—", isNum(bio?.bodyFatPct) && curKg !== null ? "kg" : "da misurare")}
        {stat("VO2 max", isNum(bio?.vo2max) ? fmt(bio?.vo2max) : "—", isNum(bio?.vo2max) ? "ml/kg/min" : "da misurare")}
      </div>
    </div>
  );
  const biologia = (
`);
// one place for upcoming sessions in the Life App (Allenamento); the Tendenze page title is the header
patch("sforzo upcoming", "\n        {upcomingCard}\n", "\n        {props.embed ? null : upcomingCard}\n");
patch("tendenze upcoming", "      </div>\n\n      {upcomingCard}\n\n      <span style={{ ...lbl, textAlign: \"center\" }}>Aggiornato il", "      </div>\n\n      {props.embed ? null : upcomingCard}\n\n      <span style={{ ...lbl, textAlign: \"center\" }}>Aggiornato il");
patch("tendenze title", '{sectionTitle("Tendenze 7 giorni")}', '{props.embed ? null : sectionTitle("Tendenze 7 giorni")}');
// results only: no correlation coefficient under the bedtime chart
patch("sonno correlation", '{r !== null ? ` · correlazione ${r.toFixed(2).replace(".", ",")}` : ""}', '{r !== null && !props.embed ? ` · correlazione ${r.toFixed(2).replace(".", ",")}` : ""}');
// Sforzo/Sonno sub-pages: ONE number, the same 0-100 score as the hub card; the Sforzo ring shows the day effort on 0-21 with the target band
// (the hero ring is now the same in both apps: Sforzo shows the strain 0–21 with its target band, Sonno the Sonno score)
// Biologia: heart charts live only in Recupero; one short line pointing there
patch("bio heart", '      {sectionTitle("Cuore a riposo", <span style={lbl}>media {days.length} giorni</span>)}', '      {props.embed ? (\n        <button onClick={() => goTab("recupero")} aria-label="Cuore a riposo" style={{ ...btn, ...card, ...row, padding: "14px 16px" }}>\n          <div style={{ ...st(2), flex: 1 }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>Cuore a riposo</span><span style={lbl}>{(() => { const tD = dayOf(DATA.today) ?? days[days.length - 1], bR = bandOf(tD, (y: Day) => y.rhr), bH = bandOf(tD, (y: Day) => y.hrvMs); return bR && bH ? `La tua norma, ultimi 30 giorni: FC a riposo ${Math.round(bR.lo)}–${Math.round(bR.hi)} bpm · HRV ${Math.round(bH.lo)}–${Math.round(bH.hi)} ms · andamento in Recupero` : `FC ${fmt(wkRhr)} bpm · HRV ${fmt(wkHrv)} ms, media ${days.length} giorni · andamento in Recupero`; })()}</span></div>{chev(K.t3)}\n        </button>\n      ) : <>\n      {sectionTitle("Cuore a riposo", <span style={lbl}>media {days.length} giorni</span>)}');
patch("bio heart end", '      <div style={card}>{lines([{ name: "HRV", color: K.violet, values: days.map((x: Day) => x.hrvMs) }], wkHrv ?? undefined)}</div>\n    </div>\n  );', '      <div style={card}>{lines([{ name: "HRV", color: K.violet, values: days.map((x: Day) => x.hrvMs) }], wkHrv ?? undefined)}</div>\n      </>}\n    </div>\n  );');
// tonight's bedtime goes up to the Life sleep-debt card, so both give the same time
patch("eve to life", "\n  const stanotteCard = eve ? (", "\n  const tnLife = eve ?? planFor(addDays(DATA.today, 1));\n  useEffect(() => { if (props.embed && props.onEve) props.onEve({ bedBy: tnLife.bedBy, bedBy85: tnLife.bedBy85, wake: tnLife.wake, need: tnLife.need }); }, [tnLife.bedBy, tnLife.wake, tnLife.need]);\n  const stanotteCard = eve ? (");
// Life sleep-debt card in the middle of Sonno, after the night summary and stages
patch("sonno mid slot", '{weekTitle("Sonno · 7 giorni")}', '{props.embed ? props.slots?.sonnoMid ?? null : null}\n      {weekTitle("Sonno · 7 giorni")}');
// Life only: pace of aging (from the long Corpo history) right under the bio age card
patch("bio pace slot", '        <span style={{ ...lbl, textAlign: "center" }}>Tocca per il dettaglio</span>\n      </button>\n', '        <span style={{ ...lbl, textAlign: "center" }}>Tocca per il dettaglio</span>\n      </button>\n      {props.embed ? props.slots?.bioPace ?? null : null}\n');
patch("peso tab", ': tab === "biologia" ? (props.embed ?', ': tab === "peso" ? pesoPage : tab === "biologia" ? (props.embed ?');
// Biologia (Life): own orb for the bio age
patch("bio orb open", "  const orb = (size: number) => (\n    <AgeBlob size={size} tone={blobTone}>", "  // Life: the bio age sits in a Life-style orb (soft colour fields, like Happiness), not the health blob\n  const orbTone = bioDiff === null || Math.abs(bioDiff) < 1 ? [\"lavoro\", \"vita\", \"lavoro\"] : bioDiff < 0 ? [\"corpo\", \"vita\", \"corpo\"] : bioDiff < 2.5 ? [\"lavoro\", \"finanze\", \"vita\"] : [\"finanze\", \"relazioni\", \"finanze\"];\n  const orbWrap = (size: number, ch: ReactNode) => (props.embed ? <div style={{ width: size + 24, maxWidth: \"100%\", height: size + 24, margin: -12, overflow: \"hidden\", display: \"flex\", alignItems: \"center\", justifyContent: \"center\", flex: \"0 0 auto\" }}><HappyOrb size={size} value={bioDiff === null ? 40 : clamp(45 - bioDiff * 10, 15, 80)} areas={orbTone.map((id) => ({ id, score: 80 }))}>{ch}</HappyOrb></div> : <AgeBlob size={size} tone={blobTone}>{ch}</AgeBlob>);\n  const orb = (size: number) => orbWrap(size, <>");
patch("bio orb close", "    </AgeBlob>\n  );\n\n  // ---------- liste: attività e pasti ----------", "    </>);\n\n  // ---------- liste: attività e pasti ----------");
// back without a "micro crash" (2026-10-25, the owner: "quando torno indietro ... fa un micro crash"): going back from a sub-page
// remounted the whole view (key change) and replayed the entry animations (view slide 280 ms, rings refill and glows fade
// 900 ms); the Life header and the scroll position arrived 2-5 frames later (useEffect + setTimeout). Now: the view that a
// back returns to is marked quiet (no entry animations), and onScreen fires in a layout effect so the Life App can put its
// header back and restore the scroll before the first paint (app.tsx, pendingY).
// the in-app back button waited for the async popstate of history.back() (1-3 frames with the sub-page still on screen,
// then the half-updated page); the system swipe-back hid this behind the iOS snapshot. Embedded: close at once (same
// state change as the swipe path), and still pop the entry pushed on open so the history stays in step.
patch("instant in-app back", "const closeScreen = () => { if (pushed.current) { pushed.current = false; try { window.history.back(); return; } catch { /* niente cronologia */ } } shut(); };",
  "const skipPop = useRef<boolean>(false), pushLater = useRef<boolean>(false);\n  const closeScreen = () => { pushLater.current = false; if (pushed.current) { pushed.current = false; try { skipPop.current = !!props.embed; window.history.back(); if (!props.embed) return; } catch { skipPop.current = false; /* niente cronologia */ } } shut(); };");
patch("deferred push", 'try { window.history.pushState({ wbScreen: true }, ""); pushed.current = true; } catch { pushed.current = false; }',
  'if (skipPop.current) { pushLater.current = true; } else { try { window.history.pushState({ wbScreen: true }, ""); pushed.current = true; } catch { pushed.current = false; } }');
// ...that one popstate is ignored, and a sub-page opened before it arrives pushes its entry only then, so the history
// stays one entry per open sub-page even with fast taps (else the next back could leave the app)
patch("skip own popstate", "    const onPop = () => { pushed.current = false; shut(); };",
  "    const onPop = () => { if (skipPop.current) { skipPop.current = false; if (pushLater.current) { pushLater.current = false; try { window.history.pushState({ wbScreen: true }, \"\"); pushed.current = true; } catch { pushed.current = false; } } return; } pushed.current = false; shut(); };");
patch("quiet view after back", "  let content: ReactNode;\n", `  const vKey = screen ? JSON.stringify(screen) : tab;
  const prevScreenX = useRef<Screen>(screen), prevTabX = useRef<Tab>(tab), quietKeyX = useRef<string | null>(null);
  if (props.embed && ((prevScreenX.current && !screen) || (prevTabX.current !== tab && !screen && (tab === "home" || tab === "medico")))) quietKeyX.current = vKey;
  prevScreenX.current = screen; prevTabX.current = tab;
  const quietView = !!props.embed && quietKeyX.current === vKey;
  let content: ReactNode;
`);
patch("quiet view class", '<div key={screen ? JSON.stringify(screen) : tab} className="wb-view" style={{ ...col,', '<div key={vKey} className={quietView ? "wb-view wb-quiet" : "wb-view"} style={{ ...col,');
patch("quiet view css", "@media (prefers-reduced-motion: reduce){.wb-view,.wb-fill,.wb-glow{animation:none !important;transition:none !important}}",
  "@media (prefers-reduced-motion: reduce){.wb-view,.wb-fill,.wb-glow{animation:none !important;transition:none !important}}\n.wb-quiet,.wb-quiet .wb-fill,.wb-quiet .wb-glow{animation:none !important}");
full = 'import { useLayoutEffect as useLayoutEffectX } from "grok/canvas";\n' + full;
// Corpo workouts (Oggi / Allenamento / gym session page) from data/training/*.md: tools/life-app/training-patches.mjs
trainingPatches(patch, HERE, training.lifts);
// Corpo steps card + Passi page (goal = corpo.json stepsGoal, history = STEPS_HIST): tools/life-app/steps-patches.mjs
stepsPatches(patch, HERE);
full = 'import { STEPS_HIST } from "./gen";\n' + full;
// Salute > Medico > Archivio (visits, reports, surgeries, lab draws, vaccines) from data/health/records.md,
// vaccinations.md and data/body/labs/ (archive.mjs): tools/life-app/archive-patches.mjs + archive.fragments.txt
archivePatches(patch, HERE);
full = 'import { ARCHIVE } from "./archive-data";\n' + full;
// Salute > Medico > Misure (home blood pressure, waist circumference) from data/health/blood-pressure.md and
// data/body/waist.md (misure.mjs): tools/life-app/misure-patches.mjs + misure.fragments.txt (after the archive patches)
misurePatches(patch, HERE);
full = 'import { MISURE } from "./misure-data";\n' + full;
full = 'import { HappyOrb } from "./happy-orb";\nimport { TRAINING } from "./training-data";\nimport { BODY_DAYS } from "./gen";\n' + full;
// own class prefix so the health CSS (with !important) never touches the Life App shell/dock classes
full = full.replace(/\bwb-/g, "hx-");
full += `
export { DATA, MEDICO, WEIGHTS, LIFTS, AVATAR, recoveryOf, doneOf, bioModel, sleepParts, sleepDebtOn, debtText, sleepScore, strainScore, cardioMin, dayOf, addDays, parts, isNum, avg, nums, sum, clamp, sdev, bedRel, toMin, daysBetween, kindOf, dayMacro, AgeBlob, MO, WD, fmt, hm, r1, clock, ringTone };
export type { Factor, Day, Workout, Meal, MedLab, MedCheck, BlobTone, Upcoming, Tab };
`;
const core = `export * from "./salute-full";\n`;

// 2. generated data from the knowledge base
const fm = (txt) => { const m = /^---\n([\s\S]*?)\n---/.exec(txt); return m ? m[1] : ""; };
const field = (front, k) => { const m = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(front); if (!m) return null; let v = m[1].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "").trim(); return v || null; };
const birthdays = [];
for (const f of (existsSync(join(kb, "data/people")) ? readdirSync(join(kb, "data/people")) : []).filter((x) => x.endsWith(".md")).sort()) {
  const front = fm(readFileSync(join(kb, "data/people", f), "utf8")); const b = field(front, "birthday"); if (!b) continue;
  let y = null, a, c, m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b))) { y = +m[1]; a = +m[2]; c = +m[3]; }
  else if ((m = /^(\d{2})-(\d{2})$/.exec(b))) { a = +m[1]; c = +m[2]; if (a > 12 && c <= 12) [a, c] = [c, a]; }
  else continue;
  if (a < 1 || a > 12 || c < 1 || c > 31) continue;
  const name = (field(front, "name") || f.replace(/\.md$/, "")).replace(/\s*\(.*\)$/, "");
  birthdays.push({ name, m: a, d: c, y });
}
const events = [];
for (const f of (existsSync(join(kb, "data/events")) ? readdirSync(join(kb, "data/events")) : []).filter((x) => x.endsWith(".md")).sort()) {
  const front = fm(readFileSync(join(kb, "data/events", f), "utf8"));
  const date = field(front, "date") || field(front, "start"); const end = field(front, "end") || field(front, "end_date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  events.push({ date, end: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null, name: field(front, "name") || f.replace(/\.md$/, "") });
}
const scadenze = [];
// deadlines table (optional): data/finance/scadenzario.md, columns Cosa | Entità | Scadenza (DD/MM/YYYY) | Importo | Chi | Stato
const SCAD_FILE = join(kb, "data/finance/scadenzario.md");
if (existsSync(SCAD_FILE)) {
  const t = readFileSync(SCAD_FILE, "utf8").split("\n").filter((l) => l.startsWith("|"));
  const head = t[0].split("|").slice(1, -1).map((x) => x.trim().toLowerCase());
  const ix = (n) => head.findIndex((h) => h.startsWith(n));
  if (t.length > 2) for (const l of t.slice(2)) {
    const c = l.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < head.length) continue;
    scadenze.push({ cosa: c[ix("cosa")], entita: c[ix("entit")], scadenza: c[ix("scadenza")], importo: c[ix("importo")], chi: c[ix("chi")], stato: c[ix("stato")] });
  }
}
const sUpd = existsSync(SCAD_FILE) ? (/^updated:\s*(\S+)/m.exec(readFileSync(SCAD_FILE, "utf8")) || [])[1] || null : null;
const gen = `// generated by build.mjs, do not edit
import type { Day } from "./salute-core";
export const BIRTHDAYS: { name: string; m: number; d: number; y: number | null }[] = ${JSON.stringify(birthdays)};
export const EVENTS: { date: string; end: string | null; name: string }[] = ${JSON.stringify(events)};
export const SCADENZE: { cosa: string; entita: string; scadenza: string; importo: string; chi: string; stato: string }[] = ${JSON.stringify(scadenze)};
export const SCADENZE_UPDATED: string | null = ${JSON.stringify(sUpd)};
`;
const HIST_FILE = join(dataDir, "corpo-history.json");
// Life Health history (date -> the day's overall total + per-area scores): the Home number is the average of the closed days
const LH_FILE = join(dataDir, "life-health-history.json");
const lhOld = existsSync(LH_FILE) ? JSON.parse(readFileSync(LH_FILE, "utf8")) : [];
const histOld = existsSync(HIST_FILE) ? JSON.parse(readFileSync(HIST_FILE, "utf8")) : [];
const genWith = (h) => gen + `export const SLEEP_BODY: { date: string; min: number; nap: number | null }[] = ${JSON.stringify(sleepBody)};
export const SLEEP_NEED: number = ${sleepNeed};
export const BODY_DAYS: Day[] = ${JSON.stringify(bodyDays.sort((a, b) => (a.date < b.date ? -1 : 1)))};
export const STEPS_HIST: { date: string; steps: number }[] = ${JSON.stringify(stepsHist)};
export const LIFE_HEALTH_HISTORY: { date: string; total: number | null; areas?: Record<string, number | null>; source: string }[] = ${JSON.stringify(lhOld.map((r) => ({ date: r.date, total: r.total, areas: r.areas, source: r.source })))};
export const CORPO_HISTORY: { date: string; source: string; sonno: number | null; recupero: number | null; sforzo: number | null; nutrizione: number | null; allenamento: number | null; oggi: number | null; n: number; gym?: number | null; sport?: number | null }[] = ${JSON.stringify(h)};\n`;

// 2b. body days (data/body/body-YYYY-MM-DD.md, written by the 30-minute routine) -> Day objects for the Corpo history backfill
const bodyDays = [];
{
  const dir = join(kb, "data/body");
  const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
  for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => /^body-\d{4}-\d{2}-\d{2}\.md$/.test(f)) : []) {
    const t = readFileSync(join(dir, f), "utf8"), front = (/^---\n([\s\S]*?)\n---/.exec(t) || [])[1] || "";
    const fv = (k) => { const m = new RegExp("^" + k + ":[ \\t]*(.*)$", "m").exec(front); return m ? m[1].trim().replace(/^"(.*)"$/, "$1") : null; };
    const date = fv("date"); if (!date) continue;
    const row = (k) => { const m = new RegExp("^\\| " + k + " \\| ([0-9]+)[^|]*\\| ([0-9]+)", "m").exec(t); return m ? [Number(m[1]), Number(m[2])] : null; };
    const act = row("active"), bas = row("basal"), sleepMin = num(fv("sleep_min")), awakeMin = num(fv("awake_min"));
    const sess = (/^## Sessions\n([\s\S]*?)(\n\n|\n#)/m.exec(t) || [])[1] || "";
    const KIND = { padel: "padel", "beach volleyball": "beach", tennis: "tennis", walk: "camminata" };
    const workouts = [];
    for (const l of sess.split("\n")) {
      const m = /^- (\d\d:\d\d)\S*\s*\*\*([^*]+)\*\* (\d+)' · avg heart (\d+|—)(.*)$/.exec(l); if (!m) continue;
      const kc = /· (\d+) kcal/.exec(m[5]);
      workouts.push({ time: m[1], name: m[2], status: "fatto", detail: "", kind: KIND[m[2].toLowerCase()] || "sport", durationMin: Number(m[3]), avgHr: num(m[4]), kcal: kc ? Number(kc[1]) : null });
    }
    bodyDays.push({ date, eatenKcal: null, proteinG: null, activeKcal: act ? act[1] : null, basalKcal: bas ? bas[1] : null,
      burnedKcal: act && bas ? act[1] + bas[1] : null, fitbitTotalKcal: num(fv("kcal")), steps: num(fv("steps")), incomplete: false, note: null, meals: [], workouts,
      sleepMin, deepMin: num(fv("deep_min")), remMin: num(fv("rem_min")), rhr: num(fv("rhr")), hrvMs: num(fv("hrv_ms")),
      bedtime: fv("bed") || null, wakeTime: fv("wake") || null, inBedMin: sleepMin !== null ? sleepMin + (awakeMin ?? 0) : null, awakeMin, wakeups: null, napMin: num(fv("nap_min")),
      spo2: num(fv("spo2")), spo2Low: num(fv("spo2_low")), breathing: num(fv("breathing")), tempDev: num(fv("temp_dev")), hrSleepMin: num(fv("hr_sleep_min")) });
  }
}

// 2b'. daily steps (Passi page): data/body/steps-history.md (Google Health daily totals, tools/steps_history.py) + the body
// day files; a day keeps its highest total (a day's count only grows). The app adds corpo.json history/days on top.
const stepsHist = (() => {
  const m = new Map();
  const put = (date, v) => { if (typeof v !== "number" || !isFinite(v)) return; if (!m.has(date) || v > m.get(date)) m.set(date, v); };
  const f = join(kb, "data/body/steps-history.md");
  if (existsSync(f)) for (const l of readFileSync(f, "utf8").split("\n")) { const r = /^\| (\d{4}-\d{2}-\d{2}) \| (\d+) \|/.exec(l); if (r) put(r[1], Number(r[2])); }
  for (const d of bodyDays) put(d.date, d.steps);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, steps]) => ({ date, steps }));
})();
console.log(`steps history: ${stepsHist.length} days (${stepsHist[0]?.date} .. ${stepsHist[stepsHist.length - 1]?.date})`);

// 2c. sleep debt inputs: every night on record from the body files (the DATA days override them in the app)
const sleepBody = bodyDays.filter((d) => d.sleepMin !== null).map((d) => ({ date: d.date, min: d.sleepMin, nap: d.napMin })).sort((a, b) => (a.date < b.date ? -1 : 1));
// same base need as the health app (8 h); the health app adds today's strain and the carried debt for tonight's plan
const sleepNeed = 480;

// 3. bundle
const work = join(HERE, "out/work"); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
cpSync(join(HERE, "src"), work, { recursive: true });
// area data: data/happiness/<area>.json -> work/data/<area>.ts (the modules scores.ts and app.tsx import)
mkdirSync(join(work, "data"), { recursive: true });
for (const [f, tpl] of Object.entries(AREA_MODULES)) {
  const p = join(dataDir, f + ".json");
  if (!existsSync(p)) { console.error(`missing ${p} (run python3 tools/happiness.py validate)`); process.exit(6); }
  const v = JSON.parse(readFileSync(p, "utf8"));
  writeFileSync(join(work, "data", f + ".ts"), `// generated by build.mjs from data/happiness/${f}.json, do not edit\n` + tpl.replace("__VALUE__", () => JSON.stringify(v)));
}
// weekly conclusion on Home: data/happiness/weekly-summary.json (tools/weekly_summary.py), null = block hidden
{
  const p = join(dataDir, "weekly-summary.json");
  const v = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  writeFileSync(join(work, "data", "weekly.ts"), `// generated by build.mjs from data/happiness/weekly-summary.json, do not edit\nexport const WEEKLY: { week: string; from: string; to: string; generatedAt: string; conclusion: string[]; good: string[]; bad: string[]; improve: string[] } | null = ${JSON.stringify(v && { week: v.week, from: v.from, to: v.to, generatedAt: v.generatedAt, conclusion: v.conclusion, good: v.good, bad: v.bad, improve: v.improve })};\n`);
  console.log(`weekly summary: ${v ? v.week : "none"}`);
}
writeFileSync(join(work, "salute-full.tsx"), full);
// owner, areas and timezone for app.tsx / scores.ts (from config.local.yml life_app.*; no secret in here)
writeFileSync(join(work, "life-config.ts"), `// generated by build.mjs from life_config.py, do not edit
export const LIFE: { ownerName: string; ownerInitial: string; ownerWords: string[]; timezone: string; appName: string; desktop: { enabled: boolean; minWidth: number }; areas: { id: string; name: string; agents: string; weight: number; enabled: boolean }[] } = ${JSON.stringify({
  ownerName: CFG.owner_name, ownerInitial: CFG.owner_initial, ownerWords: CFG.owner_words, timezone: CFG.timezone, appName: CFG.app_name,
  desktop: { enabled: CFG.desktop?.enabled !== false, minWidth: Math.max(600, CFG.desktop?.min_width || 1024) },
  areas: CFG.areas.map((a) => ({ id: a.id, name: a.name, agents: a.agents, weight: a.weight, enabled: a.enabled })) })};
`);
writeFileSync(join(work, "salute-core.tsx"), core);
const archive = readArchive(kb);
writeFileSync(join(work, "archive-data.ts"), `// generated by build.mjs from data/health/records.md, vaccinations.md, data/body/labs (archive.mjs), do not edit\nexport const ARCHIVE: { items: unknown[]; vaccines: unknown[] } = ${JSON.stringify(archive)};\n`);
console.log(`archive: ${archive.items.length} entries, ${archive.vaccines.length} vaccines`);
const misure = readMisure(kb);
writeFileSync(join(work, "misure-data.ts"), `// generated by build.mjs from data/health/blood-pressure.md and data/body/waist.md (misure.mjs), do not edit\nexport const MISURE: { bp: { arm: string; rows: unknown[]; updated: string | null }; waist: { rows: unknown[]; updated: string | null } } = ${JSON.stringify(misure)};\n`);
console.log(`misure: ${misure.bp.rows.length} blood pressure readings, ${misure.waist.rows.length} waist measurements`);
writeFileSync(join(work, "training-data.ts"), `// generated by build.mjs from data/training/*.md (training.mjs), do not edit\nexport const TRAINING: { logs: unknown[]; sessions: unknown[]; plans: unknown[] } = ${JSON.stringify({ logs: training.logs, sessions: training.sessions, plans: training.plans })};\n`);
writeFileSync(join(work, "gen.ts"), genWith(histOld));
// 3a. Corpo rolling history: score the DATA days (as the app does) + the older body days, merge into data/happiness/corpo-history.json.
// The current day is always refreshed; a past day is replaced only when the new row has at least as many section scores.
{
  const hr = await esbuild.build({ entryPoints: [join(work, "history.ts")], bundle: true, format: "esm", platform: "node", write: false,
    jsx: "automatic", alias: { "grok/canvas": join(HERE, "grok-canvas-shim.js") }, nodePaths: [join(HERE, "node_modules")], logLevel: "warning" });
  const hf = join(HERE, "out/hist.mjs"); writeFileSync(hf, hr.outputFiles[0].text);
  const H = await import(pathToFileURL(hf).href + "?t=" + Date.now());
  const rows = H.computeHistory(bodyDays), today = H.DATA_TODAY, by = new Map(histOld.map((r) => [r.date, r]));
  for (const r of rows) { const o = by.get(r.date); if (!o || r.date === today || r.n >= o.n) by.set(r.date, r); }
  const merged = [...by.values()].filter((r) => r.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  writeFileSync(HIST_FILE, JSON.stringify(merged, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  writeFileSync(join(work, "gen.ts"), genWith(merged));
  console.log(`corpo history: ${merged.length} days (${merged[0]?.date} .. ${merged[merged.length - 1]?.date})`);
}
// 3b. the numbers the app shows (same scores.ts), for the MD recaps in data/happiness (tools/happiness.py recap)
{
  const rr = await esbuild.build({ entryPoints: [join(work, "recap.ts")], bundle: true, format: "esm", platform: "node", write: false,
    jsx: "automatic", alias: { "grok/canvas": join(HERE, "grok-canvas-shim.js") }, nodePaths: [join(HERE, "node_modules")], logLevel: "warning" });
  const rf = join(HERE, "out/recap.mjs"); writeFileSync(rf, rr.outputFiles[0].text);
  const R = await import(pathToFileURL(rf).href + "?t=" + Date.now());
  mkdirSync(dirname(scoresOut), { recursive: true });
  writeFileSync(scoresOut, JSON.stringify(R.RECAP, null, 1) + "\n");
  // 3c. Life Health history: one row per day, the current day refreshed on every build (so a closed day keeps its final
  // value), closed days never rewritten. Only real computed totals; nothing is written when the day has no total.
  {
    const t = R.RECAP.todayISO, by = new Map(lhOld.map((r) => [r.date, r]));
    const areasNow = Object.fromEntries(R.RECAP.areas.map((a) => [a.id, a.score])), old = by.get(t);
    // unchanged total and areas: keep the row as is (no new "at"), so a rebuild does not dirty the checkout
    const same = old && old.total === R.RECAP.happinessToday && JSON.stringify(old.areas ?? null) === JSON.stringify(areasNow);
    if (R.RECAP.happinessToday !== null && !same && (!old || old.source === "build")) {
      const at = new Intl.DateTimeFormat("sv-SE", { timeZone: CFG.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(" ", "T");
      by.set(t, { date: t, total: R.RECAP.happinessToday, areas: areasNow, source: "build", at });
    }
    const rows = [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
    const txt = JSON.stringify(rows).replace(/\},\{"date"/g, '},\n{"date"') + "\n";
    // read-only builds (tools/hr_now_publish.sh sets HAPPINESS_NO_COMMIT=1: it promises to write nothing in the repo, and
    // nothing would commit the file) never touch it; the next normal publish writes and commits the row
    const readOnly = process.env.HAPPINESS_NO_COMMIT === "1" || process.env.LIFE_HEALTH_NO_WRITE === "1";
    if (!readOnly && (!existsSync(LH_FILE) || readFileSync(LH_FILE, "utf8") !== txt)) writeFileSync(LH_FILE, txt);
    console.log(`life health history: ${rows.length} days (${rows[0]?.date} .. ${rows[rows.length - 1]?.date}), Home ${R.RECAP.happiness} over ${R.RECAP.lifeHealthDays} closed days, today ${R.RECAP.happinessToday}`);
  }
  if (scoresOnly) { if (!process.env.LIFE_KEEP_WORK) rmSync(work, { recursive: true, force: true }); console.log(JSON.stringify({ scores: scoresOut, happiness: R.RECAP.happiness })); process.exit(0); }
}
// optional avatar (life_app.avatar: a small JPEG/PNG OUTSIDE the repo), embedded only inside the encrypted bundle;
// timezone, coach name and gym label for the health page (globals read by src/health/health-page.tsx)
const AV = CFG.avatar;
const avMime = AV && /\.png$/i.test(AV) ? "image/png" : "image/jpeg";
const coach = (CFG.areas.find((a) => a.id === "corpo")?.agents || "").split(",")[0].trim() || "il coach";
writeFileSync(join(work, "avatar-init.js"), (AV && existsSync(AV)
  ? `globalThis.__SALUTE_AVATAR__ = "data:${avMime};base64,${readFileSync(AV).toString("base64")}";\n` : "globalThis.__SALUTE_AVATAR__ = null;\n")
  + `globalThis.__LIFE_TZ__ = ${JSON.stringify(CFG.timezone)};\nglobalThis.__LIFE_COACH__ = ${JSON.stringify(coach)};\nglobalThis.__LIFE_GYM__ = ${JSON.stringify(CFG.gym_label)};\n`);
// photos for the Capelli view (optional hook, life_app.hooks.hair_photos): an ES module OUTSIDE the data that exports
// writeHairInit(workDir) -> count and writes <workDir>/hair-init.js (globalThis.__SALUTE_HAIR_PHOTOS__ = [...]), embedded only
// inside the encrypted bundle. No hook: an empty list (the view shows placeholders).
let hairN = 0;
if (CFG.hooks.hair_photos && existsSync(CFG.hooks.hair_photos)) hairN = await (await import(pathToFileURL(CFG.hooks.hair_photos).href)).writeHairInit(work);
else writeFileSync(join(work, "hair-init.js"), "globalThis.__SALUTE_HAIR_PHOTOS__ = [];\n");
// life-log write-back (README "Write-back"): repo + fine-grained token (Contents r/w on that repo only), embedded ONLY in the
// encrypted bundle. LIFE_LOG_MOCK=1 -> fake in-memory API; LIFE_LOG_OFF=1 or no token file -> queue on the phone only.
const LOG_TOKEN_FILE = process.env.LIFE_LOG_TOKEN_FILE || CFG.writeback.token_file;
let logToken = "", logMode = "off";
if (process.env.LIFE_LOG_MOCK === "1") logMode = "mock";
else if (CFG.writeback.enabled && CFG.writeback.repo && process.env.LIFE_LOG_OFF !== "1" && existsSync(LOG_TOKEN_FILE)) { logToken = readFileSync(LOG_TOKEN_FILE, "utf8").trim(); logMode = logToken ? "github" : "off"; }
// (app_version = the shell's data-build at runtime, so the plaintext stays identical between builds of the same code)
const logCfg = logMode === "mock" ? { mock: true }
  : logMode === "github" ? { repo: process.env.LIFE_LOG_REPO || CFG.writeback.repo, branch: process.env.LIFE_LOG_BRANCH || CFG.writeback.branch, token: logToken }
  : null;
writeFileSync(join(work, "lifelog-init.js"), `globalThis.__LIFE_LOG__ = ${JSON.stringify(logCfg)};\n`, { mode: 0o600 });
const r = await esbuild.build({
  entryPoints: [join(work, "entry.jsx")], bundle: true, minify: true, format: "iife", write: false, target: ["safari15"],
  jsx: "automatic", alias: { "grok/canvas": join(HERE, "grok-canvas-shim.js") }, nodePaths: [join(HERE, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning", legalComments: "none",
});
const js = r.outputFiles[0].text;
rmSync(join(work, "lifelog-init.js"), { force: true });   // the token never stays on disk outside ~/.secrets
if (!process.env.LIFE_KEEP_WORK) rmSync(work, { recursive: true, force: true });

// 4. encrypt (AES-256-GCM, key = PBKDF2-SHA256(password, salt, 310k)); the salt is per instance, kept outside the repo
const pw = readFileSync(pwFile, "utf8").replace(/\r?\n$/, "");
if (!pw) { console.error("empty password file"); process.exit(4); }
if (!existsSync(saltFile)) { mkdirSync(dirname(saltFile), { recursive: true }); writeFileSync(saltFile, randomBytes(16).toString("base64") + "\n"); }
const salt = Buffer.from(readFileSync(saltFile, "utf8").trim(), "base64");
const base = await wc.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
const key = await wc.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const iv = randomBytes(12);
const ct = Buffer.from(await wc.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(js)));
const build = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + createHash("sha256").update(ct).digest("hex").slice(0, 8);
const P = { s: salt.toString("base64"), i: ITER, v: iv.toString("base64"), c: ct.toString("base64"), b: build };

rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, "icons"), { recursive: true });
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const shell = readFileSync(join(HERE, "shell.html"), "utf8").replace(/__APP_NAME__/g, () => esc(CFG.app_name)).replace(/__LANG__/g, () => esc(CFG.lang)).replace(/__USERNAME__/g, () => esc(CFG.login_username));
writeFileSync(join(out, "index.html"), shell.replace("__PAYLOAD__", () => JSON.stringify(P)));
const man = JSON.parse(readFileSync(join(HERE, "manifest.webmanifest"), "utf8"));
writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify({ ...man, name: CFG.app_name, short_name: CFG.app_name, description: CFG.description, lang: CFG.lang }, null, 2) + "\n");
copyFileSync(join(HERE, "sw.js"), join(out, "sw.js"));
for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) copyFileSync(join(HERE, "icons", f), join(out, "icons", f));
writeFileSync(join(out, "version.txt"), build + "\n");
writeFileSync(join(out, ".nojekyll"), "");
writeFileSync(join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");
// the life-log token must never be readable in a published file (only inside the AES-GCM payload)
if (logToken) for (const f of readdirSync(out, { recursive: true })) {
  const p = join(out, String(f));
  try { if (readFileSync(p).includes(logToken)) { rmSync(out, { recursive: true, force: true }); console.error("life-log token found in clear in " + f + "; output removed"); process.exit(11); } } catch { /* directory */ }
}
// DUMP_PLAIN_JS=FILE: also write the plaintext bundle there (local diffing only; never commit or publish it)
// (it contains the life-log token when one is configured: mode 600, delete after use)
if (process.env.DUMP_PLAIN_JS) writeFileSync(process.env.DUMP_PLAIN_JS, js, { mode: 0o600 });
writeFileSync(join(HERE, "out/last-plain.sha256"), createHash("sha256").update(js).update(shell).update(readFileSync(join(HERE, "sw.js"))).update(readFileSync(join(out, "manifest.webmanifest"))).digest("hex") + "\n");
console.log(JSON.stringify({ out, build, lifeLog: logMode, hairPhotos: hairN, birthdays: birthdays.length, events: events.length, scadenze: scadenze.length, jsBytes: js.length }));
