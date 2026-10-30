// Scores for every area. Inputs are only the real data blocks; null means "coming".
// The app shows results and tips only, never this logic.
import { DATA, MEDICO, recoveryOf, bioModel, sleepScore, strainScore, debtText as debtFmt, cardioMin, dayOf, addDays, parts, isNum, avg, nums, sum, clamp, sdev, bedRel, daysBetween, kindOf, dayMacro } from "./salute-core";
import type { Day, Workout, MedLab, MedCheck } from "./salute-core";
import { MENTE } from "./data/mente";
import { LAVORO } from "./data/lavoro";
import type { Status } from "./data/lavoro";
import { FINANZE } from "./data/finanze";
import { RELAZIONI } from "./data/relazioni";
import { CRESCITA } from "./data/crescita";
import { VITA } from "./data/vita";
import { SCADENZE, CORPO_HISTORY, SLEEP_BODY, SLEEP_NEED, BODY_DAYS, LIFE_HEALTH_HISTORY } from "./gen";
import { LIFE } from "./life-config";
// display name, agent label and weight of each area come from config.local.yml (life_app.areas.<id>, tools/life-app/life_config.py)
const AC = (id: string) => LIFE.areas.find((a) => a.id === id) ?? { id, name: id, agents: "", weight: 1, enabled: true };
const agentOf = (id: string, i = 0): string => (AC(id).agents.split(",")[i] ?? AC(id).agents.split(",")[0] ?? "").trim();

export type AreaId = "corpo" | "salute" | "lavoro" | "finanze" | "relazioni" | "crescita" | "vita";
// ring: what the hub ring shows when it is not the 0-100 score (Effort shows the strain 0-21, as in its page)
export type Sub = { key: string; name: string; score: number | null; line: string; tip?: string | null; ring?: { label: string; frac: number } | null };
export type Area = { id: AreaId; name: string; agents: string; score: number | null; subs: Sub[]; tip: string | null };

const STATUS: Record<Status, number> = { bene: 85, "da seguire": 60, critico: 30 };
// weakest weighs more; below the minimum threshold the total cannot be high
export const combine = (xs: (number | null)[]): number | null => {
  const v = nums(xs); if (!v.length) return null;
  const mn = Math.min(...v), mean = v.reduce((a, b) => a + b, 0) / v.length;
  let t = 0.5 * mn + 0.5 * mean;
  if (mn < 40) t = Math.min(t, mn + 25);
  return Math.round(clamp(t, 1, 100));
};
const pct = (x: number | null) => (x === null ? null : Math.round(clamp(x * 100, 1, 100)));

// ---------- Body (DATA of the health app) ----------
const days = DATA.days;
const tDay: Day = dayOf(DATA.today) ?? days[days.length - 1];
const baseOf = (x: Day, f: (y: Day) => number | null | undefined) => avg(days.filter((y) => y.date !== x.date).map(f));
// ---- sleep debt (WHOOP-style, same rule as the health app on the long history): each night's shortfall vs the 8 h base
// need is carried to the next night at half weight and repaid by sleeping more; 0-4 h. Results only in the UI.
const SLEEP_MAP = new Map(SLEEP_BODY.map((n) => [n.date, n.min + (n.nap ?? 0)]));
const sleptOn = (date: string): number | null => {
  const x = dayOf(date);
  if (x && isNum(x.sleepMin)) return (x.sleepMin as number) + (isNum(x.napMin) ? (x.napMin as number) : 0);
  return SLEEP_MAP.get(date) ?? null;
};
export type SleepDebt = { min: number; level: "nessuno" | "basso" | "moderato" | "alto"; need: number; nights: { date: string; slept: number | null; debt: number }[]; score: number; clearWith: number };
const DEBT_CARRY = 0.5, DEBT_CAP = 240;
const FIRST_NIGHT = [...SLEEP_BODY.map((n) => n.date), ...days.map((x) => x.date)].sort()[0] ?? DATA.today;
// WHOOP-style: the short-term shortfall carried forward and repaid night by night (seeded at 0 on the first night on record)
export const sleepDebt = (date: string): SleepDebt | null => {
  if (date < FIRST_NIGHT) return null;
  const nights: SleepDebt["nights"] = []; let debt = 0;
  for (let d = FIRST_NIGHT; d <= date; d = addDays(d, 1)) {
    const sl = sleptOn(d);
    debt = sl === null ? debt * DEBT_CARRY : Math.max(0, Math.min(DEBT_CAP, debt * DEBT_CARRY + (SLEEP_NEED - sl)));
    nights.push({ date: d, slept: sl, debt: Math.round(debt) });
  }
  if (sleptOn(date) === null) return null;
  const min = Math.round(debt);
  return { min, level: min < 15 ? "nessuno" : min < 60 ? "basso" : min <= 150 ? "moderato" : "alto", need: SLEEP_NEED, nights: nights.slice(-14),
    score: Math.round(clamp(100 - (min / 60) * 20, 10, 100)), clearWith: Math.round(SLEEP_NEED + min * DEBT_CARRY) };
};
// one format for the debt in both apps (the health app's)
export const debtText = debtFmt;
// Sleep score = the night's performance with the accumulated debt folded in (a long debt keeps it down)
const sonnoOn = (x: Day, date: string): number | null => {
  const sl = sleepScore(x), db = sleepDebt(date);
  return sl === null ? null : db === null ? sl : Math.round(sl * 0.7 + db.score * 0.3);
};
// recovery: the health app's own rule (30-day norm of HRV and resting HR + the Sleep score shown), so hub and page agree
export const recScore = (x: Day): number | null => recoveryOf(x, sonnoOn(x, x.date));
export const corpoFacts = (() => {
  const sl = sleepScore(tDay), rec = recScore(tDay);
  // nutrition: closed days with meals
  const PT = DATA.proteinTarget;
  const nd = days.filter((x) => x.date !== DATA.today && x.meals.length > 0);
  const dayN = (x: Day) => {
    const c: number[] = [];
    if (isNum(x.proteinG)) c.push(Math.min(1, x.proteinG / PT));
    const f = dayMacro(x, "fibre").v, s = dayMacro(x, "salt").v, g = dayMacro(x, "sugar").v;
    if (f !== null) c.push(Math.min(1, f / 30));
    if (s !== null) c.push(s <= 5 ? 1 : clamp(1 - (s - 5) / 5, 0, 1));
    if (g !== null) c.push(g <= 50 ? 1 : clamp(1 - (g - 50) / 50, 0, 1));
    return c.length ? c.reduce((a, b) => a + b, 0) / c.length : null;
  };
  const nutr = pct(avg(nd.map(dayN)));
  // training, three views: Today = today's sessions (and the day's strain, in Effort); Week =
  // week-to-date from Monday vs the weekly goals (resets every Monday, may be red on Monday morning: a nudge, display only);
  // Long term = the last 13 weeks rolling (~90 days) vs the weekly goals (no Monday reset). Only Long term feeds any score.
  const weekStart = addDays(DATA.today, -((parts(DATA.today).w + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= DATA.today);
  const SG = DATA.sportWeeklyGoal ?? null, kinds = SG && SG.kinds.length ? SG.kinds : ["padel", "beach"];
  const sportKind = (kind: string | null | undefined, name: string): string | null => {
    if (/beach/i.test(name) || kind === "beach") return "beach";
    if (/padel/i.test(name) || kind === "padel" || (/torneo|tournament/i.test(name) && (!kind || kind === "sport" || kind === "palestra"))) return "padel";
    return kind === "tennis" || /tennis/i.test(name) ? "tennis" : null;
  };
  const isGymW = (w: Workout) => ["grid", "palestra"].includes(kindOf(w));
  const isSportW = (w: Workout) => { const k = sportKind(kindOf(w), w.name); return k !== null && kinds.includes(k); };
  const done = (d: string, p: (w: Workout) => boolean) => (dayOf(d)?.workouts ?? []).filter((w) => w.status === "fatto" && p(w)).length;
  const gymGoal = isNum(DATA.gymWeeklyGoal) && DATA.gymWeeklyGoal > 0 ? DATA.gymWeeklyGoal : null;
  const sportGoal = SG && isNum(SG.count) && SG.count > 0 ? SG.count : null;
  // sessions done on a day: the DATA day when it has it, else the counts kept in corpo-history (rows written while the day
  // was a DATA day); null = no training log for that day (older Fitbit-only days: unknown, left out, never counted as 0)
  const HIST_BY = new Map(CORPO_HISTORY.map((h) => [h.date, h]));
  const countOn = (d: string): { gym: number; sport: number } | null => {
    if (dayOf(d)) return { gym: done(d, isGymW), sport: done(d, isSportW) };
    const h = HIST_BY.get(d);
    return h && isNum(h.gym) && isNum(h.sport) ? { gym: h.gym as number, sport: h.sport as number } : null;
  };
  // Week (display only): week-to-date from Monday, no pro-rating
  const gym = sum(week.map((d) => done(d, isGymW))), sport = sum(week.map((d) => done(d, isSportW)));
  const wk = nums([gymGoal ? Math.min(1, gym / gymGoal) : null, sportGoal ? Math.min(1, sport / sportGoal) : null]);
  const trainWeek = wk.length ? pct(wk.reduce((a, b) => a + b, 0) / wk.length) : null;
  // Long term at any date: 4 rolling 7-day blocks of closed days before it (date-7..date-1, date-14..date-8, ...);
  // the day itself counts only when it adds sessions (never penalised for "not yet"). Each block = min(1, done / goal
  // pro-rated to its days with a log), blocks weighted by those days. null while no day in the window has a log.
  // weeks: 4 for the daily score's training part (goalsAt, unchanged so stored daily scores keep their meaning);
  // LONG_WEEKS = 13 (~90 days, a quarter) for Long term
  const LONG_WEEKS = 13;
  const longAt = (date: string, nWeeks: number = LONG_WEEKS) => {
    const self = countOn(date);
    const all = Array.from({ length: nWeeks }, (_, b) => {
      const from = addDays(date, -7 * (b + 1)), to = addDays(from, 6);
      const cs = Array.from({ length: 7 }, (_, i) => countOn(addDays(from, i))).filter((c): c is { gym: number; sport: number } => c !== null);
      return { from, to, k: cs.length, gym: sum(cs.map((c) => c.gym)) + (b === 0 && self ? self.gym : 0), sport: sum(cs.map((c) => c.sport)) + (b === 0 && self ? self.sport : 0) };
    });
    const blocks = all.filter((b) => b.k > 0);
    const days = sum(blocks.map((b) => b.k));
    const ratio = (b: { k: number; gym: number; sport: number }, goal: number | null, key: "gym" | "sport") => (!goal || !b.k ? null : Math.min(1, b[key] / ((goal * b.k) / 7)));
    const part = (goal: number | null, key: "gym" | "sport") => (!goal || !days ? null : sum(blocks.map((b) => b.k * (ratio(b, goal, key) as number))) / days);
    const v = nums([part(gymGoal, "gym"), part(sportGoal, "sport")]);
    // per-week view (oldest first): a week without any training log has score null ("no data"), never 0
    const weeks = all.slice().reverse().map((b) => { const r = nums([ratio(b, gymGoal, "gym"), ratio(b, sportGoal, "sport")]); return { ...b, score: b.k && r.length ? pct(r.reduce((a, z) => a + z, 0) / r.length) : null }; });
    return { score: v.length ? pct(v.reduce((a, b) => a + b, 0) / v.length) : null, days, gym: sum(blocks.map((b) => b.gym)), sport: sum(blocks.map((b) => b.sport)), weeks };
  };
  const long = longAt(DATA.today);
  const train = long.score;
  // Today: sessions done today and still planned today
  const todayDone = (tDay.workouts ?? []).filter((w) => w.status === "fatto").length;
  const todayPlanned = Math.max((tDay.workouts ?? []).filter((w) => w.status === "pianificato").length, (DATA.upcoming ?? []).filter((u) => u.date === DATA.today).length);
  // biology: same rules as the health app's biological age
  const bio = DATA.bioAge ?? null;
  const chrono = (() => { if (!bio?.birthDate) return null; const b = parts(bio.birthDate), t = parts(DATA.today); return t.y - b.y - (t.m < b.m || (t.m === b.m && t.dd < b.dd) ? 1 : 0); })();
  // all wearable, training and weight signals through the health app's own model, then the labs (same rules as the health app)
  const y: number[] = [bioModel(days, bio, DATA.today).delta];
  const L = bio?.labs ?? null;
  if (L) {
    if (isNum(L.ldl)) y.push(L.ldl < 100 ? -0.5 : L.ldl < 130 ? 0 : L.ldl < 160 ? 0.5 : 1);
    if (isNum(L.hdl)) y.push(L.hdl < 40 ? 1 : L.hdl < 60 ? 0 : -1);
    if (isNum(L.tg)) y.push(L.tg < 150 ? 0 : L.tg < 200 ? 0.5 : 1);
    if (isNum(L.glucose)) y.push(L.glucose < 100 ? 0 : L.glucose < 126 ? 1 : 2);
    if (isNum(L.hba1c)) y.push(L.hba1c < 5.7 ? 0 : L.hba1c < 6.5 ? 1 : 2);
    if (isNum(L.uricAcid)) y.push(L.uricAcid <= 7 ? 0 : 0.5);
  }
  const bioAge = chrono === null ? null : Math.round((chrono + y.reduce((a, b) => a + b, 0)) * 2) / 2;
  const bioDiff = bioAge !== null && chrono !== null ? Math.round((bioAge - chrono) * 2) / 2 : null;
  const bioScore = bioDiff === null ? null : Math.round(clamp(70 - 10 * bioDiff, 5, 100));
  // a day's training score (Today and corpo-history): the long-term adherence as of that day, never the weekly view
  const goalsAt = (date: string): number | null => longAt(date, 4).score;
  const nutrOn = (x: Day): number | null => (x.meals.length ? pct(dayN(x)) : null);
  return { goalsAt, countOn, longAt, nutrOn, day: tDay, sl, rec, srScore: nums([sl, rec]).length ? Math.round(avg([sl, rec]) as number) : null, nutr, nutrDays: nd.length, gym, gymGoal, sport, sportGoal, train, trainWeek, trainLongDays: long.days, trainWeeks: long.weeks, gymLong: long.gym, sportLong: long.sport, todayDone, todayPlanned, chrono, bioAge, bioDiff, bioScore, proteinToday: tDay.proteinG, PT };
})();
const coachPick = (re: RegExp): string | null => (DATA.coach?.actions ?? []).find((a) => re.test(a)) ?? null;
const itn1 = (v: number) => String(Math.round(v * 10) / 10);
// strain: how close the day's strain is to the range suited to that morning's recovery (a live day is not penalised much for "not yet")
const strainRange = (rec: number | null): [number, number] => (rec === null ? [10, 14] : rec >= 67 ? [14, 18] : rec >= 34 ? [10, 14] : [6, 10]);
const strainSub = (x: Day): { score: number | null; value: number | null; range: [number, number] } => {
  const v = strainScore(x), rg = strainRange(recScore(x));
  if (v === null) return { score: null, value: null, range: rg };
  const [lo, hi] = rg, mid = (lo + hi) / 2, live = x.date === DATA.today;
  // above the range costs little (a long match or a tournament is the point, the cost shows in tomorrow's recovery)
  const sc = v < lo ? 85 - (lo - v) * (live ? 4 : 8) : v > hi ? Math.max(60, 85 - (v - hi) * 4) : 85 + 15 * (1 - Math.abs(v - mid) / ((hi - lo) / 2));
  return { score: Math.round(clamp(sc, 1, 100)), value: v, range: rg };
};
// the three day-based sections, for any day of the 7 (the Body day picker)
export const daySubs = (date: string): Sub[] => {
  const x = dayOf(date) ?? tDay, sl = sleepScore(x), rc = recScore(x), st = strainSub(x);
  return [
    { key: "sonno", name: "Sleep", score: sonnoOn(x, x.date), line: !isNum(x.sleepMin) ? "Night missing" : `${Math.floor(x.sleepMin / 60)}:${String(Math.round(x.sleepMin % 60)).padStart(2, "0")} slept${(() => { const db = sleepDebt(x.date); return db && db.min >= 15 ? ` · debt ${debtText(db.min)}` : x.bedtime ? ` · in bed at ${x.bedtime}` : ""; })()}`, tip: (() => { const t = coachPick(/letto|sonno|dorm|\bbed\b|sleep/i); return t && !/\d{1,2}[:.]\d{2}/.test(t) ? t : (sleepDebt(x.date)?.min ?? 0) >= 60 ? "An early night tonight to recover lost sleep: the right time is in Sleep." : "A slightly earlier night tonight: the right time is in Sleep."; })() },
    { key: "recupero", name: "Recovery", score: rc, line: rc === null ? "Night data coming" : `Level ${rc >= 67 ? "high" : rc >= 34 ? "medium" : "low"}${(() => { const p = dayOf(addDays(x.date, -1)), s = p ? strainScore(p) : null; return s === null ? "" : ` · yesterday's effort ${itn1(s)}`; })()}`, tip: rc !== null && rc < 34 ? "Light movement today and a long night." : null },
    { key: "sforzo", name: "Effort", score: st.score, ring: st.value === null ? null : { label: itn1(st.value), frac: clamp(st.value / 21, 0, 1) }, line: st.value === null ? "Upcoming activities" : `Goal ${st.range[0]}–${st.range[1]}${isNum(x.steps) ? ` · ${String(Math.round(x.steps)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} steps` : ""}`, tip: st.value !== null && st.value < st.range[0] && x.date === DATA.today ? `There is room to move more today: aim for an effort of ${st.range[0]}–${st.range[1]}.` : st.value !== null && st.value > st.range[1] ? "High effort: lighter tomorrow." : null },
  ];
};
const mix = (a: number | null, wa: number, b: number | null, wb: number) => (a === null ? b : b === null ? a : (a * wa + b * wb) / (wa + wb));
export const corpoDailyFrom = (sl: number | null, rc: number | null, sf: number | null, train: number | null, nutr: number | null): number | null =>
  combine([mix(sl, 1, rc, 1), mix(train, 0.7, sf, 0.3), nutr]);
// the day's section scores (also used at build time to write data/corpo-history.json); train = null when the gym log is unknown
export const daySections = (date: string, withTrain = true): { sonno: number | null; recupero: number | null; sforzo: number | null; nutrizione: number | null; allenamento: number | null; oggi: number | null } | null => {
  const x = dayOf(date); if (!x) return null;
  const ds = daySubs(date), S = (k: string) => ds.find((y) => y.key === k)?.score ?? null;
  const sl = S("sonno"), rc = S("recupero"), sf = S("sforzo"), nu = corpoFacts.nutrOn(x), tr = withTrain ? corpoFacts.goalsAt(date) : null;
  // a day with no data of its own yet (e.g. just after midnight) has no Today score, not one made of the week goals alone
  return { sonno: sl, recupero: rc, sforzo: sf, nutrizione: nu, allenamento: tr, oggi: nums([sl, rc, sf, nu]).length ? corpoDailyFrom(sl, rc, sf, tr, nu) : null };
};
// Nutrition of one day (the Body "Today" block follows the picked day)
export const nutrSubOn = (date: string): Sub => {
  const x = dayOf(date), pr = x?.proteinG, isT = date === DATA.today;
  return { key: "nutrizione", name: "Nutrition", score: x ? corpoFacts.nutrOn(x) : null,
    line: isNum(pr) ? `Protein ${isT ? "today " : ""}${String(Math.round((pr as number) * 10) / 10)} of ${corpoFacts.PT} g` : isT ? "Today's meals not logged yet" : "Meals not logged" };
};
export const corpoDaily = (date: string): number | null => daySections(date)?.oggi ?? null;
// ---- Body in three views for every daily section: Today = the day;
// Week = Monday-to-date average of the days with a value (resets on Monday, shown only); Long term = average over
// the 90 closed days before today + one row per rolling week (13) (the values behind Body / Life Health). Real rows only:
// a DATA day is scored live (as the app shows it), older days come from corpo-history; no value = not counted.
export type SecKey = "sonno" | "recupero" | "sforzo" | "nutrizione" | "oggi";
const SEC_MEMO = new Map<string, number | null>();
export const secOn = (key: SecKey, date: string): number | null => {
  const id = key + date; if (SEC_MEMO.has(id)) return SEC_MEMO.get(id) as number | null;
  const h = CORPO_HISTORY.find((r) => r.date === date) ?? null;
  const v = dayOf(date) ? (daySections(date)?.[key] ?? null) : h ? ((h as Record<string, unknown>)[key] as number | null) ?? null : null;
  SEC_MEMO.set(id, isNum(v) ? v : null); return isNum(v) ? v : null;
};
const avgOf = (date0: string, n: number, key: SecKey) => {
  const vs = nums(Array.from({ length: n }, (_, i) => secOn(key, addDays(date0, i))));
  return { avg: vs.length ? Math.round(avg(vs) as number) : null, n: vs.length };
};
export const secWeek = (key: SecKey, date: string) => {
  const from = addDays(date, -((parts(date).w + 6) % 7));
  return { from, ...avgOf(from, daysBetween(from, date) + 1, key) };
};
// Long term = LONG_DAYS closed days (90, ~a quarter) + 13 rolling weeks
export const LONG_DAYS = 90;
export const LONG_WEEKS_N = 13;
export const secLong = (key: SecKey) => {
  const all = avgOf(addDays(DATA.today, -LONG_DAYS), LONG_DAYS, key);
  const weeks = Array.from({ length: LONG_WEEKS_N }, (_, b) => { const from = addDays(DATA.today, -7 * (LONG_WEEKS_N - b)); return { from, to: addDays(from, 6), ...avgOf(from, 7, key) }; });
  return { ...all, weeks };
};
// Long term: the daily score over up to 90 closed days of the rolling history (grows over time) + the 13-week training
// adherence (Long term view, no Monday reset)
const HIST_DAYS = CORPO_HISTORY.filter((h) => h.date < DATA.today && h.date >= addDays(DATA.today, -LONG_DAYS));
const histDaily = nums(HIST_DAYS.map((h) => h.oggi));
const closedDaily = histDaily.length ? histDaily : nums(days.filter((x) => x.date !== DATA.today).map((x) => corpoDaily(x.date)));
export const CORPO_HISTORY_DAYS = closedDaily.length;
export const CORPO_HISTORY_FROM: string = CORPO_HISTORY.length ? CORPO_HISTORY[0].date : DATA.today;
// Biology lives under Health: it does not feed Body
export const CORPO_LONG: number | null = combine([closedDaily.length ? Math.round(avg(closedDaily) as number) : null, corpoFacts.train]);
const corpo = ((): Area => {
  const c = corpoFacts;
  const subs: Sub[] = [
    ...daySubs(DATA.today),
    { key: "nutrizione", name: "Nutrition", score: c.nutr, line: isNum(c.proteinToday) ? `Protein today ${String(Math.round(c.proteinToday * 10) / 10)} of ${c.PT} g` : "Today's meals not logged yet", tip: coachPick(/protein|cena|pasto|cibo|dinner|meal|food/i) ?? "One more protein meal today." },
    { key: "allenamento", name: "Training", score: c.train, line: `Week: gym ${c.gym}${c.gymGoal ? ` of ${c.gymGoal}` : ""}${c.sportGoal ? ` · matches ${c.sport} of ${c.sportGoal}` : ""}`, tip: coachPick(/palestra|allen|recupero|\bgym\b|train|workout|recover/i) },
  ];
  const weakest = [...subs].filter((s) => s.score !== null && s.tip).sort((a, b) => (a.score as number) - (b.score as number))[0];
  // Body = rest (sleep + recovery), movement (weekly training + today's strain), nutrition, biology; weights never shown
  // Body has two scores: "Today" (that day's sections, follows the day picker) and "Long term" (the trend of the daily
  // score over the days on record + weekly goals + biology; moves slowly). Happiness uses "Long term". Weights never shown.
  return { id: "corpo", name: AC("corpo").name, agents: AC("corpo").agents, score: CORPO_LONG, subs, tip: weakest?.tip ?? null };
})();

// ---------- Health ----------
export const todayISO = (() => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: LIFE.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } })();
export const medFacts = (() => {
  const items: MedLab[] = MEDICO.groups.flatMap((g) => g.items);
  const limite = items.filter((m) => m.status === "limite").length;
  let f = items.length ? (items.length - limite * 0.5) / items.length : null;
  const age = daysBetween(MEDICO.lab.date, todayISO);
  if (f !== null && age > 365) f *= 0.85;
  const overdue = MEDICO.checks.filter((c: MedCheck) => c.due !== null && c.due < todayISO).length;
  const score = f === null ? null : Math.round(clamp(f * 100 - 5 * overdue - 10 * MEDICO.lab.outOfRange, 1, 100));
  const next = [...MEDICO.checks].filter((c) => c.due !== null).sort((a, b) => ((a.due as string) < (b.due as string) ? -1 : 1));
  return { items: items.length, limite, score, labAgeDays: age, overdue, next };
})();
const salute = ((): Area => {
  const m = medFacts, n = m.next[0];
  const subs: Sub[] = [
    { key: "medico", name: "Medical", score: m.score, line: `Tests of ${(([y, m, d]) => `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${y}`)(MEDICO.lab.date.split("-"))} · ${MEDICO.lab.outOfRange ? `${MEDICO.lab.outOfRange} out of range` : "no values out of range"}`, tip: n ? `${n.title}: ${n.dueText}.` : null },
    // Biology (biological age from the wearable model + labs, the health app's own rules), moved here from Body
    { key: "biologia", name: "Biology", score: corpoFacts.bioScore, line: corpoFacts.bioAge === null ? "Coming" : `Biological age ${String(corpoFacts.bioAge)}${corpoFacts.chrono !== null ? ` vs ${corpoFacts.chrono} years` : ""}`, tip: "Keep tracking your key health markers and schedule your routine check-ups." },
    { key: "mente", name: "Mind", score: MENTE ? STATUS[MENTE.status] : null, line: MENTE ? MENTE.line : `Coming · how you are, with ${agentOf("salute", 1) || "your agent"}. Only what you decide`, tip: MENTE?.tip ?? null },
  ];
  const weakest = [...subs].filter((s) => s.score !== null).sort((a, b) => (a.score as number) - (b.score as number))[0];
  return { id: "salute", name: AC("salute").name, agents: AC("salute").agents, score: combine(subs.map((s) => s.score)), subs, tip: weakest?.tip ?? null };
})();

// ---------- Work ----------
const lavoro = ((): Area => {
  const L = LAVORO;
  // sub-areas (Clienti, Team, Ruolo...): their verdicts make the score, like Relationships; tip = the work agent's tip or the weakest's first step
  if (L.sfere && L.sfere.length) {
    const sf: Sub[] = L.sfere.map((s) => ({ key: s.key, name: s.name, score: s.score ?? STATUS[s.status], line: s.line, tip: s.steps[0] ?? null }));
    const sod: Sub = { key: "soddisfazione", name: "Satisfaction", score: L.soddisfazione ? STATUS[L.soddisfazione.status] : null, line: L.soddisfazione?.line ?? "Coming · how much you enjoy your work and find it meaningful" };
    const weakest = [...sf].sort((a, b) => (a.score as number) - (b.score as number))[0];
    return { id: "lavoro", name: AC("lavoro").name, agents: AC("lavoro").agents, score: combine([...sf, sod].map((s) => s.score)), subs: [...sf, sod], tip: L.tip ?? weakest?.tip ?? L.priorita?.steps[0] ?? null };
  }
  const subs: Sub[] = [
    { key: "priorita", name: "Priorities", score: L.priorita ? STATUS[L.priorita.status] : null, line: L.priorita?.line ?? "Coming", tip: L.priorita?.steps[0] ?? null },
    { key: "soddisfazione", name: "Satisfaction", score: L.soddisfazione ? STATUS[L.soddisfazione.status] : null, line: L.soddisfazione?.line ?? "Coming · how much you enjoy your work and find it meaningful" },
    { key: "linkedin", name: "LinkedIn", score: null, line: L.linkedin ? `${String(L.linkedin.followers).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} follower · ${String(L.linkedin.impressions7d).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} impressions in 7 days` : "Coming" },
  ];
  return { id: "lavoro", name: AC("lavoro").name, agents: AC("lavoro").agents, score: combine(subs.map((s) => s.score)), subs, tip: subs[0].tip ?? null };
})();

// ---------- Finances ----------
// a deadline is a date at the start of the field ("30/11/2026 (da confermare)") or "N days dal DATE"; other dates (e.g. "sollecitata 10/09/2026") are not deadlines
const itDate = (t: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t.trim()); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const g = /^(\d+)\s+days\s+dal\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(t.trim()); if (g) return addDays(`${g[4]}-${g[3]}-${g[2]}`, Number(g[1]));
  return null;
};
// the Stato column wins over the date: a paid row ("pagata", "pagato", ...) is never overdue or urgent; any other status keeps the date rules
export type Scad = (typeof SCADENZE)[number] & { kind: "scaduta" | "urgente" | "aperta" | "pagata"; due: string | null };
const isPaid = (stato: string | null | undefined): boolean => /^(pagat[aoie]|paid)\b/i.test((stato ?? "").trim());
export const scadenze: Scad[] = SCADENZE.map((x) => {
  const due = itDate(x.scadenza);
  const kind: Scad["kind"] = isPaid(x.stato) ? "pagata" : /scadut|overdue/i.test(x.scadenza) || (due !== null && due < todayISO) ? "scaduta" : /subito|asap|immediately/i.test(x.scadenza) || (due !== null && daysBetween(todayISO, due) <= 14) ? "urgente" : "aperta";
  return { ...x, kind, due };
}).sort((a, b) => { const o = { scaduta: 0, urgente: 1, aperta: 2, pagata: 3 }; return o[a.kind] - o[b.kind] || ((a.due ?? "9") < (b.due ?? "9") ? -1 : 1); });
const finanze = ((): Area => {
  const F = FINANZE;
  const over = scadenze.filter((x) => x.kind === "scaduta").length, urg = scadenze.filter((x) => x.kind === "urgente").length, open = scadenze.filter((x) => x.kind === "aperta").length;
  const sScore = scadenze.length ? Math.round(clamp(100 - 10 * over - 5 * urg - 1.5 * open, 5, 100)) : null;
  const spese = F.spese ? Math.round(clamp((F.spese.monthlyIn / F.spese.monthlyCost) * 100, 1, 100)) : null;
  const marg = F.margine ? Math.round(clamp((F.margine.months / 6) * 100, 1, 100)) : null;
  const mine = scadenze.find((x) => (x.kind === "scaduta" || x.kind === "urgente") && LIFE.ownerWords.some((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(x.chi)));
  const subs: Sub[] = [
    { key: "scadenze", name: "Taxes and deadlines", score: sScore, line: scadenze.length ? `${over} overdue · ${urg} urgent · ${open} open` : "Coming", tip: mine ? `${mine.cosa}${mine.importo && /\d/.test(mine.importo) ? ` (${mine.importo}\u00A0€)` : ""}.` : F.verdict?.steps[0] ?? null },
    { key: "spese", name: "Spending covered", score: spese, line: F.spese ? "Income and spending this month" : "Coming · whether this month's income comfortably covers spending" },
    { key: "margine", name: "Margin", score: marg, line: F.margine ? `${F.margine.months} months of spending covered` : "Coming · how many months of spending your savings cover" },
  ];
  return { id: "finanze", name: AC("finanze").name, agents: AC("finanze").agents, score: combine(subs.map((s) => s.score)), subs, tip: subs[0].tip ?? null };
})();

// ---------- Relationships ----------
const relazioni = ((): Area => {
  const subs: Sub[] = RELAZIONI.sfere.map((s) => ({ key: s.key, name: s.name, score: s.score ?? STATUS[s.status], line: s.line, tip: s.steps[0] ?? null }));
  const weakest = [...subs].sort((a, b) => (a.score as number) - (b.score as number))[0];
  return { id: "relazioni", name: AC("relazioni").name, agents: AC("relazioni").agents, score: combine(subs.map((s) => s.score)), subs, tip: weakest?.tip ?? null };
})();

// Growth / Life: one verdict, or sub-areas with verdict + steps like Relationships (score from the verdicts, tip = weakest's first step)
type Sfera = { key: string; name: string; status: Status; score?: number; line: string; steps: string[] };
const simple = (id: AreaId, name: string, agents: string, d: { status: Status; line: string; tip?: string | null; sfere?: Sfera[] } | null): Area => {
  if (!d) return { id, name, agents, score: null, subs: [], tip: null };
  if (!d.sfere || !d.sfere.length) return { id, name, agents, score: STATUS[d.status], subs: [], tip: d.tip ?? null };
  const subs: Sub[] = d.sfere.map((s) => ({ key: s.key, name: s.name, score: s.score ?? STATUS[s.status], line: s.line, tip: s.steps[0] ?? null }));
  const weakest = [...subs].sort((a, b) => (a.score as number) - (b.score as number))[0];
  return { id, name, agents, score: combine(subs.map((s) => s.score)), subs, tip: d.tip ?? weakest?.tip ?? null };
};

// areas switched off in config (life_app.areas.<id>.enabled: false) are not shown and not counted
export const AREAS: Area[] = [corpo, salute, lavoro, finanze, relazioni, simple("crescita", AC("crescita").name, AC("crescita").agents, CRESCITA), simple("vita", AC("vita").name, AC("vita").agents, VITA)].filter((a) => AC(a.id).enabled);
// the overall total: same rule as combine (the weakest weighs more, a very low area caps the total), with the configured
// per-area weights in the mean (weight 0 = shown on Home but left out of the total)
const combineWeighted = (xs: { score: number | null; w: number }[]): number | null => {
  const v = xs.filter((x) => isNum(x.score) && x.w > 0) as { score: number; w: number }[]; if (!v.length) return null;
  const mn = Math.min(...v.map((x) => x.score)), W = v.reduce((a, x) => a + x.w, 0), mean = v.reduce((a, x) => a + x.score * x.w, 0) / W;
  let t = 0.5 * mn + 0.5 * mean;
  if (mn < 40) t = Math.min(t, mn + 25);
  return Math.round(clamp(t, 1, 100));
};
// the day's overall total (combine over the areas, as before); written once a day to data/happiness/life-health-history.json
export const HAPPINESS_TODAY = combineWeighted(AREAS.map((a) => ({ score: a.score, w: AC(a.id).weight })));
// Life Health on Home = a long-term score: the average of the daily totals over the last 90 closed days (today excluded: its
// data is incomplete in the morning); grows from the history on record; no closed day yet = today's total
const LH_CLOSED = LIFE_HEALTH_HISTORY.filter((h) => h.date < todayISO && h.date >= addDays(todayISO, -LONG_DAYS) && isNum(h.total));
export const LIFE_HEALTH_DAYS = LH_CLOSED.length;
export const HAPPINESS: number | null = LH_CLOSED.length ? Math.round(avg(LH_CLOSED.map((h) => h.total)) as number) : HAPPINESS_TODAY;
export const WEAKEST: Area | null = [...AREAS].filter((a) => a.score !== null).sort((a, b) => (a.score as number) - (b.score as number))[0] ?? null;

// ---------- pace of aging (Life only: needs the long history) ----------
// the watch signals of the last 30 days against the days before them (or the whole history while it is short);
// shown as a speed (1,0x = in line with the calendar) and the one factor to fix. Results only in the UI.
export type Pace = { pace: number; days: number; fix: { name: string; why: string } | null };
export const PACE: Pace | null = (() => {
  const m = new Map<string, Day>(BODY_DAYS.map((d) => [d.date, d] as [string, Day]));
  days.forEach((d) => m.set(d.date, d));
  const all = [...m.values()].filter((d) => d.date <= DATA.today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const nights = (xs: Day[]) => xs.filter((d) => isNum(d.sleepMin)).length;
  if (nights(all) < 21) return null;
  const from = addDays(DATA.today, -29);
  const recent = all.filter((d) => d.date >= from), older = all.filter((d) => d.date < from);
  const base = nights(older) >= 7 ? older : all;
  const bio = DATA.bioAge ?? null;
  const r = bioModel(recent, bio, DATA.today, true, all), b = bioModel(base, bio, DATA.today, true, all);
  const pace = Math.round(clamp(1 + 0.3 * (r.delta - b.delta), 0.4, 2.5) * 10) / 10;
  const by = new Map(b.factors.map((f) => [f.name, f.years ?? 0]));
  const worse = r.factors.filter((f) => (f.years ?? 0) > 0).sort((a, z) => ((z.years ?? 0) - (by.get(z.name) ?? 0)) - ((a.years ?? 0) - (by.get(a.name) ?? 0)) || (z.years ?? 0) - (a.years ?? 0))[0] ?? null;
  return { pace, days: recent.length, fix: worse ? { name: worse.name, why: worse.why } : null };
})();
