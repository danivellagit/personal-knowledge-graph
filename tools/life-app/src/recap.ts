// Build-time only (run in Node by build.mjs, never bundled into the app): the numbers the app shows, as JSON, for the
// MD recaps in data/happiness/ (tools/happiness.py recap). Same code as the app (scores.ts), so the recap cannot drift.
import { DATA, MEDICO } from "./salute-core";
import { secWeek, secLong, AREAS, HAPPINESS, HAPPINESS_TODAY, LIFE_HEALTH_DAYS, WEAKEST, CORPO_LONG, CORPO_HISTORY_DAYS, corpoDaily, corpoFacts, medFacts, scadenze, sleepDebt, debtText, PACE, todayISO } from "./scores";

const debt = sleepDebt(DATA.today);
const c = corpoFacts;
export const RECAP = {
  todayISO, dataToday: DATA.today, dataUpdatedAt: DATA.updatedAt, medicoUpdated: MEDICO.updated,
  // happiness = the Home number (average of the daily totals over the last 90 closed days); happinessToday = today's total
  happiness: HAPPINESS, happinessToday: HAPPINESS_TODAY, lifeHealthDays: LIFE_HEALTH_DAYS,
  weakest: WEAKEST ? { id: WEAKEST.id, name: WEAKEST.name, tip: WEAKEST.tip } : null,
  areas: AREAS.map((a) => ({ id: a.id, name: a.name, agents: a.agents, score: a.score, tip: a.tip,
    subs: a.subs.map((s) => ({ key: s.key, name: s.name, score: s.score, line: s.line, tip: s.tip ?? null, ring: s.ring ? s.ring.label : null })) })),
  corpo: {
    oggi: corpoDaily(DATA.today), lungo: CORPO_LONG, historyDays: CORPO_HISTORY_DAYS,
    debt: debt ? { text: debtText(debt.min), level: debt.level } : null,
    pace: PACE ? { pace: PACE.pace, fix: PACE.fix ? PACE.fix.name : null } : null,
    gym: c.gym, gymGoal: c.gymGoal ?? null, sport: c.sport, sportGoal: c.sportGoal ?? null,
    sections: Object.fromEntries((["sonno", "recupero", "sforzo", "nutrizione", "oggi"] as const).map((k) => { const w = secWeek(k, DATA.today), l = secLong(k); return [k, { week: w.avg, weekDays: w.n, long: l.avg, longDays: l.n, weeks: l.weeks.map((x) => ({ from: x.from, avg: x.avg, days: x.n })) }]; })),
    train: { oggi: { done: c.todayDone, planned: c.todayPlanned }, settimana: c.trainWeek, lungo: c.train, lungoDays: c.trainLongDays, gymLong: c.gymLong, sportLong: c.sportLong },
    proteinToday: c.proteinToday ?? null, proteinTarget: c.PT, bioAge: c.bioAge ?? null, chrono: c.chrono ?? null,
    coach: DATA.coach ? { headline: DATA.coach.headline ?? null, actions: DATA.coach.actions ?? [] } : null,
  },
  medico: { score: medFacts.score, items: medFacts.items, limite: medFacts.limite, overdue: medFacts.overdue,
    lab: MEDICO.lab, nextLabs: MEDICO.nextLabs, watch: MEDICO.watch,
    next: medFacts.next.slice(0, 5).map((x) => ({ title: x.title, dueText: x.dueText, status: x.status })) },
  scadenze: scadenze.map((x) => ({ cosa: x.cosa, entita: x.entita, scadenza: x.scadenza, importo: x.importo, chi: x.chi, stato: x.stato, kind: x.kind })),
};
