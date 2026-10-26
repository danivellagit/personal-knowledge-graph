// Build-time only (run in Node by build.mjs): the day-by-day Corpo section scores for data/corpo-history.json.
// DATA days are scored exactly as the app scores them; older days come from data/body/body-YYYY-MM-DD.md (Fitbit:
// sleep, heart, steps, active kcal, sessions) and are scored with the 7 days that ended on them; no meal or gym log
// exists for those, so Nutrizione and Allenamento stay null there. DATA rows also keep the day's session counts (gym, sport).
import { DATA, sleepParts } from "./salute-core";
import type { Day } from "./salute-core";
import { daySections, sleepDebt, corpoFacts } from "./scores";

export type HistRow = { date: string; source: "data" | "body"; sonno: number | null; recupero: number | null; sforzo: number | null; nutrizione: number | null; allenamento: number | null; oggi: number | null; debito?: number | null;
  gym?: number | null; sport?: number | null; costanza?: number | null; spo2?: number | null; spo2Low?: number | null; breathing?: number | null; tempDev?: number | null; hrSleepMin?: number | null; n: number };
const count = (r: Omit<HistRow, "n" | "date" | "source">) => [r.sonno, r.recupero, r.sforzo, r.nutrizione, r.allenamento].filter((v) => v !== null).length;

export function computeHistory(bodyDays: Day[]): HistRow[] {
  const dataDays = [...DATA.days], dataToday = DATA.today, dataDates = new Set(dataDays.map((x) => x.date));
  const out: HistRow[] = [];
  const full = [...bodyDays.filter((b) => !dataDates.has(b.date)), ...dataDays].sort((a, b) => (a.date < b.date ? -1 : 1));
  // night vitals + sleep consistency, kept with the scores so the long-term views (and the pace of aging) can use them
  const night = (x: Day) => { const c = sleepParts(x, full).reg; return { costanza: c === null ? null : Math.round(c), spo2: x.spo2 ?? null, spo2Low: x.spo2Low ?? null, breathing: x.breathing ?? null, tempDev: x.tempDev ?? null, hrSleepMin: x.hrSleepMin ?? null }; };
  for (const x of dataDays) {
    const r = daySections(x.date, true); if (!r) continue;
    // the day's done gym/GRID and padel/beach sessions, kept so the rolling training adherence still sees the day once it
    // has left the 7 DATA days (body rows have no training log: no counts there)
    const tc = corpoFacts.countOn(x.date);
    out.push({ date: x.date, source: "data", ...r, debito: sleepDebt(x.date)?.min ?? null, gym: tc?.gym ?? null, sport: tc?.sport ?? null, ...night(x), n: count(r) });
  }
  const all = [...bodyDays.filter((b) => !dataDates.has(b.date)), ...dataDays].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const b of bodyDays.filter((b) => !dataDates.has(b.date)).sort((a, z) => (a.date < z.date ? -1 : 1))) {
    const i = all.findIndex((y) => y.date === b.date);
    DATA.days.splice(0, DATA.days.length, ...all.slice(Math.max(0, i - 6), i + 1));
    (DATA as { today: string }).today = b.date;
    const r = daySections(b.date, false); if (!r) continue;
    out.push({ date: b.date, source: "body", ...r, debito: sleepDebt(b.date)?.min ?? null, ...night(b), n: count(r) });
  }
  DATA.days.splice(0, DATA.days.length, ...dataDays); (DATA as { today: string }).today = dataToday;
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
export const DATA_TODAY = DATA.today;
