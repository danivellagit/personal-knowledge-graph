import { useState, useEffect, useRef, useGrokTheme } from "grok/canvas";
import type { ReactNode, CSSProperties, ChangeEvent } from "grok/canvas";

type Meal = { time: string; name: string; dish: string; kcal: number | null; protein: number | null; carbs?: number | null; fat?: number | null; sugar?: number | null; fibre?: number | null; salt?: number | null };
type Workout = { time: string; name: string; status: "fatto" | "pianificato"; detail: string; kind?: string | null; kcal?: number | null; durationMin?: number | null; avgHr?: number | null; maxHr?: number | null; pctAbove140?: number | null; minAbove140?: number | null; partners?: string | null; zoneMin?: { fatBurn?: number | null; cardio?: number | null; peak?: number | null } | null; exercises?: string[] | null };
type Day = {
  date: string; eatenKcal: number | null; proteinG: number | null; burnedKcal: number | null; activeKcal: number | null; basalKcal: number | null;
  fitbitTotalKcal: number | null; steps: number | null; incomplete: boolean; note: string | null; meals: Meal[]; workouts: Workout[];
  carbsG?: number | null; fatG?: number | null; sugarG?: number | null; fibreG?: number | null; saltG?: number | null;
  sleepMin?: number | null; deepMin?: number | null; remMin?: number | null; rhr?: number | null; hrvMs?: number | null;
  spo2?: number | null; spo2Low?: number | null; breathing?: number | null; tempDev?: number | null; hrSleepMin?: number | null;
  bedtime?: string | null; wakeTime?: string | null; bedTarget?: string | null;
  inBedMin?: number | null; awakeMin?: number | null; wakeups?: number | null; napMin?: number | null;
};
type BioAge = { updatedAt?: string | null; birthDate?: string | null; heightCm?: number | null; weightKg?: number | null; weightDate?: string | null; vo2max?: number | null; bodyFatPct?: number | null;
  labsDate?: string | null; labs?: { totalChol?: number | null; ldl?: number | null; hdl?: number | null; tg?: number | null; glucose?: number | null; hba1c?: number | null; uricAcid?: number | null; kidneyOk?: boolean | null; liverOk?: boolean | null } | null };
type Upcoming = { date: string; time: string; name: string; kind?: string | null; detail?: string | null; partners?: string | null };
// foto profilo: nell'app installata la inserisce la build (data URI dentro il pacchetto cifrato); qui manca e si vede l'iniziale
const AVATAR: string | null = typeof globalThis !== "undefined" ? ((globalThis as unknown as { __SALUTE_AVATAR__?: string | null }).__SALUTE_AVATAR__ ?? null) : null;
// fuso orario e nome del coach: li inserisce la build (tools/life-app/build.mjs, da config.local.yml life_app.*)
const TZ: string = (typeof globalThis !== "undefined" ? (globalThis as unknown as { __LIFE_TZ__?: string }).__LIFE_TZ__ : undefined) ?? "Europe/Rome";
const COACH: string = (typeof globalThis !== "undefined" ? (globalThis as unknown as { __LIFE_COACH__?: string }).__LIFE_COACH__ : undefined) ?? "il coach";
const GYM: string = (typeof globalThis !== "undefined" ? (globalThis as unknown as { __LIFE_GYM__?: string }).__LIFE_GYM__ : undefined) ?? "Palestra";
// foto (vista Capelli): le inserisce solo la build cifrata, dal hook life_app.hooks.hair_photos (mai in git):
// [{ date, n, file, bytes, dataUrl }] dalla più vecchia. Senza hook: lista vuota, si vedono i segnaposto.
type HairPhoto = { date: string; n?: number; file?: string; bytes?: number; pinned?: boolean; dataUrl: string };
const HAIR_PHOTOS: HairPhoto[] = (() => { const g: unknown = typeof globalThis !== "undefined" ? (globalThis as unknown as { __SALUTE_HAIR_PHOTOS__?: unknown }).__SALUTE_HAIR_PHOTOS__ : null; return Array.isArray(g) ? (g as HairPhoto[]).filter((p: HairPhoto) => !!p && typeof p.date === "string" && typeof p.dataUrl === "string") : []; })();

// ==== DATA:START (sostituire solo questo blocco ad ogni aggiornamento; tenere solo gli ultimi 7 giorni) ====
// SCHEMA (i campi con ? sono opzionali: se mancano o sono null la pagina li salta o mostra "—")
// DATA.updatedAt "YYYY-MM-DDTHH:MM" ora locale (life_app.timezone) · DATA.today "YYYY-MM-DD" · DATA.proteinTarget g/giorno
// DATA.days[] (7 giorni, dal più vecchio):
//   date, eatenKcal (mangiate, totale giorno autorevole), proteinG, burnedKcal (NOSTRE = basalKcal nostra + activeKcal Fitbit),
//   activeKcal (Fitbit), basalKcal (nostra), fitbitTotalKcal (solo secondario), steps, incomplete (bool), note (string|null),
//   carbsG?, fatG?, sugarG?, fibreG?, saltG? (totali giorno; se null la pagina somma i pasti e segnala "parziale"),
//   sleepMin?, deepMin?, remMin? (notte che finisce quel mattino), rhr?, hrvMs?,
//   spo2?, spo2Low? (SpO2 % media e minima della notte), breathing? (respiri/min), tempDev? (°C vs baseline Fitbit), hrSleepMin? (FC minima nel sonno)
//   -> da `python3 tools/night_vitals.py` (legge data/body/body-YYYY-MM-DD.md); null o assenti se mancano
//   meals[]: { time, name (Colazione|Pranzo|Spuntino|Cena), dish, kcal, protein, carbs?, fat?, sugar?, fibre?, salt? }
//   workouts[]: { time, name, status ("fatto"|"pianificato"), detail, kind? (grid|palestra|padel|beach|tennis|camminata|sport),
//                 kcal? (Fitbit), durationMin?, avgHr?, maxHr?, pctAbove140? (% tempo >140 bpm), minAbove140?,
//                 partners? ("Da solo" | nomi), zoneMin? { fatBurn?, cardio?, peak? } (minuti zona attiva Fitbit), exercises? string[] }
// DATA.upcoming[]?: { date, time, name, kind?, detail?, partners? } prossimi impegni sportivi (padel/tennis/torneo = "Giorno partita")
// DATA.gymWeeklyGoal? numero di sessioni palestra/GRID a settimana (null = nessun obiettivo)
// DATA.sportWeeklyGoal? { count, kinds: ["padel","beach"] } partite a settimana di quegli sport (tornei = padel)
// DATA.tomorrowFirst? { date, time "HH:MM", title } primo impegno di domani (anche non sportivo), per l'orario di sveglia
// days[].bedTarget? "HH:MM" obiettivo letto di quella notte, se fissato; altrimenti la pagina lo ricava
// days[].bedtime?, days[].wakeTime? "HH:MM" (notte che finisce quel mattino, sessione principale Fitbit)
// days[].inBedMin?, awakeMin?, wakeups? (stessa notte: totalMinutes, minutesAwake, segmenti AWAKE interni) · napMin? (pisolini di quel giorno, min dormiti)
// DATA.bioAge?: { updatedAt, birthDate, heightCm, weightKg, weightDate, vo2max?, bodyFatPct?, labsDate, labs { totalChol, ldl, hdl, tg, glucose, hba1c, uricAcid, kidneyOk, liverOk } }
//   (input della stima età biologica; FC riposo, HRV, sonno, orari e passi la pagina li calcola da days[])
const DATA: { updatedAt: string; today: string; proteinTarget: number; days: Day[]; upcoming?: Upcoming[]; gymWeeklyGoal?: number | null; sportWeeklyGoal?: { count: number; kinds: string[] } | null; tomorrowFirst?: { date?: string | null; time: string; title: string } | null; device?: { battery: number | null; at: string } | null; history?: (Partial<Day> & { date: string; zoneMin?: number | null })[] | null; stages?: Record<string, string> | null; zones?: { rhr: number; max: number; days: Record<string, number[]>; sessions?: Record<string, string> | null } | null; hrNow?: { bpm: number; at: string; last60: number[]; h24?: number[] } | null; bioAge?: BioAge; coach?: { updatedAt?: string | null; headline?: string | null; verdict?: string | null; actions?: string[] | null } | null } = {
  updatedAt: "2030-01-14T08:00",
  today: "2030-01-14",
  proteinTarget: 120,
  stepsGoal: 8000,
  days: [
    {
      date: "2030-01-08",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2152,
      activeKcal: 674,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 8366,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [],
      sleepMin: 410,
      deepMin: 69,
      remMin: 90,
      inBedMin: 435,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "23:44",
      wakeTime: "06:59",
      rhr: 58,
      hrvMs: 54.5,
      spo2: 95.2,
      spo2Low: 91,
      breathing: 13.1,
      tempDev: 0,
      hrSleepMin: 50
    },
    {
      date: "2030-01-09",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2520,
      activeKcal: 421,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 10959,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [
        {
          time: "18:30",
          name: "Palestra (esempio)",
          status: "fatto",
          detail: "Allenamento di esempio",
          kind: "palestra",
          kcal: 320,
          durationMin: 55,
          avgHr: 118
        }
      ],
      sleepMin: 407,
      deepMin: 69,
      remMin: 89,
      inBedMin: 432,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "23:46",
      wakeTime: "06:58",
      rhr: 55,
      hrvMs: 50.4,
      spo2: 95.1,
      spo2Low: 91,
      breathing: 14.8,
      tempDev: -0.2,
      hrSleepMin: 50
    },
    {
      date: "2030-01-10",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2411,
      activeKcal: 555,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 5309,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [],
      sleepMin: 418,
      deepMin: 71,
      remMin: 91,
      inBedMin: 443,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "22:48",
      wakeTime: "06:11",
      rhr: 53,
      hrvMs: 54.5,
      spo2: 96.8,
      spo2Low: 91,
      breathing: 13.8,
      tempDev: -0.3,
      hrSleepMin: 50
    },
    {
      date: "2030-01-11",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2193,
      activeKcal: 689,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 5127,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [
        {
          time: "19:00",
          name: "Tennis (esempio)",
          status: "fatto",
          detail: "Partita di esempio",
          kind: "tennis",
          kcal: 480,
          durationMin: 75,
          avgHr: 132
        }
      ],
      sleepMin: 496,
      deepMin: 84,
      remMin: 109,
      inBedMin: 521,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "23:05",
      wakeTime: "07:46",
      rhr: 55,
      hrvMs: 45.6,
      spo2: 96.9,
      spo2Low: 91,
      breathing: 13.6,
      tempDev: -0.1,
      hrSleepMin: 50
    },
    {
      date: "2030-01-12",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2467,
      activeKcal: 720,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 8748,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [
        {
          time: "18:30",
          name: "Palestra (esempio)",
          status: "fatto",
          detail: "Allenamento di esempio",
          kind: "palestra",
          kcal: 320,
          durationMin: 55,
          avgHr: 118
        }
      ],
      sleepMin: 429,
      deepMin: 72,
      remMin: 94,
      inBedMin: 454,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "23:52",
      wakeTime: "07:26",
      rhr: 55,
      hrvMs: 41.2,
      spo2: 96.6,
      spo2Low: 91,
      breathing: 14.7,
      tempDev: 0.1,
      hrSleepMin: 50
    },
    {
      date: "2030-01-13",
      eatenKcal: 1600,
      proteinG: 90,
      burnedKcal: 2336,
      activeKcal: 391,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 8691,
      incomplete: false,
      note: null,
      meals: [
        {
          time: "08:00",
          name: "Colazione",
          dish: "Yogurt e frutta (esempio)",
          kcal: 350,
          protein: 20,
          carbs: 45,
          fat: 8,
          sugar: 25,
          fibre: 4,
          salt: 0.3
        },
        {
          time: "13:00",
          name: "Pranzo",
          dish: "Pasta al pomodoro (esempio)",
          kcal: 650,
          protein: 25,
          carbs: 95,
          fat: 15,
          sugar: 9,
          fibre: 7,
          salt: 1.8
        },
        {
          time: "20:00",
          name: "Cena",
          dish: "Pollo e verdure (esempio)",
          kcal: 600,
          protein: 45,
          carbs: 40,
          fat: 22,
          sugar: 8,
          fibre: 9,
          salt: 1.5
        }
      ],
      workouts: [],
      sleepMin: 497,
      deepMin: 84,
      remMin: 109,
      inBedMin: 522,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "22:53",
      wakeTime: "07:35",
      rhr: 53,
      hrvMs: 40.2,
      spo2: 95,
      spo2Low: 91,
      breathing: 14,
      tempDev: 0,
      hrSleepMin: 50
    },
    {
      date: "2030-01-14",
      eatenKcal: null,
      proteinG: null,
      burnedKcal: null,
      activeKcal: 516,
      basalKcal: 1750,
      fitbitTotalKcal: null,
      steps: 3500,
      incomplete: true,
      note: null,
      meals: [],
      workouts: [
        {
          time: "19:00",
          name: "Palestra (esempio)",
          status: "pianificato",
          detail: "In programma",
          kind: "palestra"
        }
      ],
      sleepMin: 462,
      deepMin: 78,
      remMin: 101,
      inBedMin: 487,
      awakeMin: 25,
      wakeups: 2,
      bedtime: "22:10",
      wakeTime: "06:17",
      rhr: 60,
      hrvMs: 47.2,
      spo2: 97,
      spo2Low: 91,
      breathing: 13.3,
      tempDev: 0.2,
      hrSleepMin: 50
    }
  ],
  upcoming: [
    {
      date: "2030-01-16",
      time: "19:00",
      name: "Tennis (esempio)",
      kind: "tennis",
      detail: "Partita di esempio"
    }
  ],
  gymWeeklyGoal: 2,
  sportWeeklyGoal: {
    count: 1,
    kinds: [
      "tennis"
    ]
  },
  tomorrowFirst: {
    date: "2030-01-15",
    time: "09:00",
    title: "Impegno di esempio"
  },
  history: [
    {
      date: "2029-12-08",
      sleepMin: 381,
      deepMin: 64,
      remMin: 83,
      awakeMin: 25,
      bedtime: "22:42",
      wakeTime: "06:50",
      rhr: 59,
      hrvMs: 45.9,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 8529,
      zoneMin: 11,
      activeKcal: 375
    },
    {
      date: "2029-12-09",
      sleepMin: 413,
      deepMin: 70,
      remMin: 90,
      awakeMin: 25,
      bedtime: "23:28",
      wakeTime: "06:42",
      rhr: 54,
      hrvMs: 54.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9290,
      zoneMin: 20,
      activeKcal: 769
    },
    {
      date: "2029-12-10",
      sleepMin: 471,
      deepMin: 80,
      remMin: 103,
      awakeMin: 25,
      bedtime: "22:43",
      wakeTime: "06:59",
      rhr: 59,
      hrvMs: 39.6,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 6481,
      zoneMin: 31,
      activeKcal: 348
    },
    {
      date: "2029-12-11",
      sleepMin: 446,
      deepMin: 75,
      remMin: 98,
      awakeMin: 25,
      bedtime: "23:20",
      wakeTime: "07:19",
      rhr: 57,
      hrvMs: 44.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 10193,
      zoneMin: 0,
      activeKcal: 542
    },
    {
      date: "2029-12-12",
      sleepMin: 500,
      deepMin: 85,
      remMin: 110,
      awakeMin: 25,
      bedtime: "23:22",
      wakeTime: "06:41",
      rhr: 59,
      hrvMs: 54,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 6362,
      zoneMin: 15,
      activeKcal: 647
    },
    {
      date: "2029-12-13",
      sleepMin: 452,
      deepMin: 76,
      remMin: 99,
      awakeMin: 25,
      bedtime: "22:23",
      wakeTime: "07:32",
      rhr: 60,
      hrvMs: 45.4,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 8310,
      zoneMin: 13,
      activeKcal: 379
    },
    {
      date: "2029-12-14",
      sleepMin: 397,
      deepMin: 67,
      remMin: 87,
      awakeMin: 25,
      bedtime: "23:44",
      wakeTime: "07:19",
      rhr: 56,
      hrvMs: 48.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 8377,
      zoneMin: 10,
      activeKcal: 582
    },
    {
      date: "2029-12-15",
      sleepMin: 412,
      deepMin: 70,
      remMin: 90,
      awakeMin: 25,
      bedtime: "23:32",
      wakeTime: "06:32",
      rhr: 57,
      hrvMs: 49.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 6732,
      zoneMin: 28,
      activeKcal: 442
    },
    {
      date: "2029-12-16",
      sleepMin: 489,
      deepMin: 83,
      remMin: 107,
      awakeMin: 25,
      bedtime: "22:42",
      wakeTime: "06:37",
      rhr: 58,
      hrvMs: 39.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 5374,
      zoneMin: 35,
      activeKcal: 632
    },
    {
      date: "2029-12-17",
      sleepMin: 480,
      deepMin: 81,
      remMin: 105,
      awakeMin: 25,
      bedtime: "23:58",
      wakeTime: "07:01",
      rhr: 56,
      hrvMs: 48.1,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 8661,
      zoneMin: 38,
      activeKcal: 331
    },
    {
      date: "2029-12-18",
      sleepMin: 390,
      deepMin: 66,
      remMin: 85,
      awakeMin: 25,
      bedtime: "23:05",
      wakeTime: "07:11",
      rhr: 56,
      hrvMs: 54.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 7051,
      zoneMin: 24,
      activeKcal: 517
    },
    {
      date: "2029-12-19",
      sleepMin: 497,
      deepMin: 84,
      remMin: 109,
      awakeMin: 25,
      bedtime: "23:50",
      wakeTime: "06:46",
      rhr: 54,
      hrvMs: 50.8,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 4208,
      zoneMin: 3,
      activeKcal: 626
    },
    {
      date: "2029-12-20",
      sleepMin: 487,
      deepMin: 82,
      remMin: 107,
      awakeMin: 25,
      bedtime: "22:48",
      wakeTime: "07:35",
      rhr: 54,
      hrvMs: 42.7,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9623,
      zoneMin: 30,
      activeKcal: 416
    },
    {
      date: "2029-12-21",
      sleepMin: 388,
      deepMin: 65,
      remMin: 85,
      awakeMin: 25,
      bedtime: "23:21",
      wakeTime: "07:27",
      rhr: 57,
      hrvMs: 48.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 4175,
      zoneMin: 18,
      activeKcal: 787
    },
    {
      date: "2029-12-22",
      sleepMin: 424,
      deepMin: 72,
      remMin: 93,
      awakeMin: 25,
      bedtime: "22:50",
      wakeTime: "07:27",
      rhr: 59,
      hrvMs: 45,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 7467,
      zoneMin: 11,
      activeKcal: 527
    },
    {
      date: "2029-12-23",
      sleepMin: 425,
      deepMin: 72,
      remMin: 93,
      awakeMin: 25,
      bedtime: "23:57",
      wakeTime: "07:38",
      rhr: 55,
      hrvMs: 50.6,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9451,
      zoneMin: 12,
      activeKcal: 356
    },
    {
      date: "2029-12-24",
      sleepMin: 495,
      deepMin: 84,
      remMin: 108,
      awakeMin: 25,
      bedtime: "23:53",
      wakeTime: "07:33",
      rhr: 59,
      hrvMs: 51.3,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9639,
      zoneMin: 16,
      activeKcal: 509
    },
    {
      date: "2029-12-25",
      sleepMin: 500,
      deepMin: 85,
      remMin: 110,
      awakeMin: 25,
      bedtime: "22:25",
      wakeTime: "06:33",
      rhr: 60,
      hrvMs: 45.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9704,
      zoneMin: 2,
      activeKcal: 736
    },
    {
      date: "2029-12-26",
      sleepMin: 400,
      deepMin: 68,
      remMin: 88,
      awakeMin: 25,
      bedtime: "22:52",
      wakeTime: "07:32",
      rhr: 60,
      hrvMs: 40.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 5054,
      zoneMin: 39,
      activeKcal: 781
    },
    {
      date: "2029-12-27",
      sleepMin: 453,
      deepMin: 77,
      remMin: 99,
      awakeMin: 25,
      bedtime: "22:39",
      wakeTime: "06:38",
      rhr: 55,
      hrvMs: 51.3,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9660,
      zoneMin: 22,
      activeKcal: 635
    },
    {
      date: "2029-12-28",
      sleepMin: 440,
      deepMin: 74,
      remMin: 96,
      awakeMin: 25,
      bedtime: "23:34",
      wakeTime: "07:14",
      rhr: 60,
      hrvMs: 42.9,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 6444,
      zoneMin: 2,
      activeKcal: 423
    },
    {
      date: "2029-12-29",
      sleepMin: 446,
      deepMin: 75,
      remMin: 98,
      awakeMin: 25,
      bedtime: "23:31",
      wakeTime: "07:13",
      rhr: 56,
      hrvMs: 48.9,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 5702,
      zoneMin: 5,
      activeKcal: 431
    },
    {
      date: "2029-12-30",
      sleepMin: 437,
      deepMin: 74,
      remMin: 96,
      awakeMin: 25,
      bedtime: "23:20",
      wakeTime: "07:14",
      rhr: 54,
      hrvMs: 45.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 9089,
      zoneMin: 16,
      activeKcal: 530
    },
    {
      date: "2029-12-31",
      sleepMin: 468,
      deepMin: 79,
      remMin: 102,
      awakeMin: 25,
      bedtime: "22:40",
      wakeTime: "07:17",
      rhr: 54,
      hrvMs: 45.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 6653,
      zoneMin: 7,
      activeKcal: 479
    },
    {
      date: "2030-01-01",
      sleepMin: 386,
      deepMin: 65,
      remMin: 84,
      awakeMin: 25,
      bedtime: "23:57",
      wakeTime: "07:12",
      rhr: 54,
      hrvMs: 40.5,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 10597,
      zoneMin: 0,
      activeKcal: 748
    },
    {
      date: "2030-01-02",
      sleepMin: 459,
      deepMin: 78,
      remMin: 100,
      awakeMin: 25,
      bedtime: "23:01",
      wakeTime: "06:52",
      rhr: 54,
      hrvMs: 53,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 4503,
      zoneMin: 16,
      activeKcal: 647
    },
    {
      date: "2030-01-03",
      sleepMin: 423,
      deepMin: 71,
      remMin: 93,
      awakeMin: 25,
      bedtime: "23:41",
      wakeTime: "07:27",
      rhr: 57,
      hrvMs: 43.8,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 10067,
      zoneMin: 0,
      activeKcal: 472
    },
    {
      date: "2030-01-04",
      sleepMin: 448,
      deepMin: 76,
      remMin: 98,
      awakeMin: 25,
      bedtime: "22:39",
      wakeTime: "07:25",
      rhr: 56,
      hrvMs: 46.2,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 8455,
      zoneMin: 24,
      activeKcal: 500
    },
    {
      date: "2030-01-05",
      sleepMin: 476,
      deepMin: 80,
      remMin: 104,
      awakeMin: 25,
      bedtime: "22:28",
      wakeTime: "07:40",
      rhr: 54,
      hrvMs: 42.7,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 7610,
      zoneMin: 2,
      activeKcal: 733
    },
    {
      date: "2030-01-06",
      sleepMin: 401,
      deepMin: 68,
      remMin: 88,
      awakeMin: 25,
      bedtime: "00:00",
      wakeTime: "07:07",
      rhr: 56,
      hrvMs: 47.1,
      breathing: 14,
      spo2: 96,
      hrSleepMin: 51,
      steps: 10286,
      zoneMin: 33,
      activeKcal: 373
    }
  ],
  stages: {
    "2030-01-08": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-09": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-10": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-11": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-12": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-13": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5",
    "2030-01-14": "W0+5 L5+60 D65+40 L105+70 R175+30 L205+90 D295+20 L315+60 R375+35 W410+5"
  },
  zones: {
    rhr: 56,
    max: 188,
    days: {
      "2030-01-08": [
        60,
        3,
        8,
        0,
        0
      ],
      "2030-01-09": [
        30,
        16,
        6,
        0,
        0
      ],
      "2030-01-10": [
        17,
        17,
        7,
        0,
        0
      ],
      "2030-01-11": [
        37,
        23,
        3,
        0,
        0
      ],
      "2030-01-12": [
        10,
        18,
        10,
        0,
        0
      ],
      "2030-01-13": [
        22,
        3,
        1,
        0,
        0
      ],
      "2030-01-14": [
        52,
        22,
        3,
        0,
        0
      ]
    }
  },
  bioAge: {
    updatedAt: "2030-01-14",
    birthDate: "1990-01-01",
    heightCm: 175,
    weightKg: 75,
    weightDate: "2030-01-11",
    vo2max: null,
    bodyFatPct: null,
    labsDate: "2029-09-16",
    labs: {
      totalChol: 180,
      ldl: 100,
      hdl: 55,
      tg: 110,
      glucose: 88,
      hba1c: 5.2,
      uricAcid: 5.5,
      kidneyOk: true,
      liverOk: true
    }
  },
  coach: {
    updatedAt: "2030-01-14T08:00",
    headline: "Settimana di esempio",
    verdict: "Dati finti: sostituiscili con i tuoi.",
    actions: [
      "Stasera a letto entro le 23:00 (esempio).",
      "Un pasto proteico in più oggi (esempio)."
    ]
  }
};
// ==== DATA:END ====


// pesate, dalla più vecchia (dati di esempio; la build le sostituisce con data/body/weigh-ins.md se esiste)
const WEIGHTS: { date: string; kg: number }[] = [
  { date: "2030-01-01", kg: 80 },
  { date: "2030-01-08", kg: 79.5 },
];
// carichi in palestra: la build li sostituisce con quelli di data/training/*.md (training.mjs)
const LIFTS: { date: string; ex: string; kg: number; sets: number | null; reps: number | null }[] = [
  { date: "2030-01-08", ex: "Esercizio di esempio", kg: 20, sets: 3, reps: 10 },
];

// ==== MEDICO: dati medici, FUORI dal blocco DATA. La build lo sostituisce con data/happiness/medico.json. ====
type MedLab = { name: string; value: string; unit: string; ref: string; status: "ok" | "limite"; long?: boolean; bar?: { v: number; lo: number | null; hi: number | null; min: number; max: number } };
type MedStatus = "in corso" | "in attesa" | "da fare" | "proposto" | "facoltativo" | "da decidere";
type MedCheck = { title: string; sub: string; due: string | null; dueText: string; status: MedStatus };
type HairDay = { p?: "am" | "pm" };
type HairTab = "oggi" | "terapia" | "foto" | "visite";
type HairSlot = { key: string; label: string; file: string | null };
type HairSet = { date: string; label: string; source: "clinica" | "casa"; note: string; slots: HairSlot[] };
type Hair = { updated: string; restart: string; headline: string; clinicWords: string; plain: string; doctor: string; clinic: string;
  therapy: { key: string; name: string; kind?: string; dose?: string; when?: string; slots: string[]; since?: string; prescriber?: string; before?: string; status: string }[];
  supply: { name: string; detail: string; last: string | null; lastText: string; next: string | null; nextText: string }[];
  photoProtocol: { day: number; time: string; next: string; angles: { key: string; label: string; how: string }[]; rules: { icon: string; text: string }[] };
  photoSets: HairSet[];
  visits: { date: string; title: string; time?: string; place?: string; doctor?: string; cost?: string; points?: string[] }[];
  steps: { text: string; when: string }[] };
type PillMoment = { key: string; label: string; when: string; items: { name: string; dose: string; note: string; link?: string | null }[] };
type Pills = { updated: string; rule: string; moments: PillMoment[];
  creatine?: { dose: string; from: string; points: string[] } | null;
  stock?: { name: string; count: number; countDate: string; perDay: number; note: string; reminder: string | null; reminderText: string } | null;
  hold: { name: string; why: string }[]; optional?: { name: string; dose: string; note: string }[]; doctor: string[];
  // registro giorno per giorno (data/happiness/medico.json pills.log): solo aggiunte in coda, l'ultima riga di un giorno vince
  log?: PillLogRow[] };
type PillLogRow = { date: string; status: "taken" | "missed" | "cleared"; slot?: "mattina" | "sera" | null; at?: string | null; by?: string; note?: string };
type FamGroup = { key: string; label: string; who: string; side: string; items: { name: string; age: string | null; year: string | null; note: string; source: string }[] };
type FamilyHistory = { updated: string; source: string; groups: FamGroup[]; timeline: { date: string; label: string; who: string; text: string }[]; undated?: string[];
  forOwner?: { why: string; what: string; when: string }[]; open?: string[] };
type Medico = { updated: string; lab: { name: string; site: string; date: string; reports: number; outOfRange: number }; nextLabs: string; groups: { title: string; items: MedLab[] }[]; watch: string; checks: MedCheck[]; meds: { name: string; dose: string }[]; visits: { date: string; title: string }[]; family: string; hair?: Hair; pills?: Pills; familyHistory?: FamilyHistory };
const MEDICO: Medico = {
  updated: "2030-01-14",
  lab: {
    name: "Laboratorio di esempio",
    site: "Sede di esempio",
    date: "2029-09-16",
    reports: 1,
    outOfRange: 0
  },
  nextLabs: "2030-09-16",
  groups: [
    {
      title: "Metabolismo",
      items: [
        {
          name: "Glucosio",
          value: "88",
          unit: "mg/dL",
          ref: "70-100",
          status: "ok",
          bar: {
            v: 88,
            lo: 70,
            hi: 100,
            min: 50,
            max: 130
          }
        }
      ]
    },
    {
      title: "Lipidi",
      items: [
        {
          name: "Colesterolo totale",
          value: "180",
          unit: "mg/dL",
          ref: "≤ 190",
          status: "ok",
          bar: {
            v: 180,
            lo: null,
            hi: 190,
            min: 100,
            max: 260
          }
        },
        {
          name: "Colesterolo HDL",
          value: "55",
          unit: "mg/dL",
          ref: "≥ 40",
          status: "ok",
          bar: {
            v: 55,
            lo: 40,
            hi: null,
            min: 20,
            max: 90
          }
        }
      ]
    }
  ],
  watch: "Valori di esempio: sostituiscili con il tuo ultimo referto.",
  checks: [
    {
      title: "Controllo di esempio",
      sub: "Una riga per ogni controllo da fare",
      due: "2030-02-13",
      dueText: "entro un mese",
      status: "da fare"
    },
    {
      title: "Dentista (esempio)",
      sub: "Una volta l'anno",
      due: null,
      dueText: "ogni anno",
      status: "proposto"
    }
  ],
  meds: [],
  visits: [],
  family: "Esempio: nessuna storia familiare inserita."
};

type Tab = "home" | "sonno" | "recupero" | "sforzo" | "biologia" | "nutrizione" | "altro" | "fitness";
type DialId = "sonno" | "recupero" | "sforzo";
type Screen = { kind: "dial"; id: DialId } | { kind: "act"; key: string } | { kind: "meal"; key: string } | { kind: "bio" } | { kind: "coach" } | { kind: "match"; key: string } | { kind: "hr" } | { kind: "hair" } | { kind: "pills" } | { kind: "fam" } | { kind: "checks" } | { kind: "labs" } | { kind: "visits" } | null;
type Sort = "ora" | "kcal" | "protein";
type MKey = "carbs" | "fat" | "sugar" | "fibre" | "salt";
type Factor = { name: string; value: string; years: number | null; why: string };
type Trend = { dir: "up" | "down" | "flat"; good: boolean | null };
type Contrib = { icon: string; label: string; value: string; trend: Trend | null; onClick?: () => void };

const DKEY: Record<MKey, "carbsG" | "fatG" | "sugarG" | "fibreG" | "saltG"> = { carbs: "carbsG", fat: "fatG", sugar: "sugarG", fibre: "fibreG", salt: "saltG" };
const WD = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MO = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const parts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return { y, m, dd, w: new Date(Date.UTC(y, m - 1, dd)).getUTCDay() }; };
const r1 = (v: number): number => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
// migliaia sempre con il punto (anche 9.667: il formato italiano di serie non raggruppa le 4 cifre)
const fmt = (v: number | null | undefined, u = "") => (!isNum(v) ? "—" : `${r1(v).toLocaleString("it-IT").replace(/^(-?\d)(\d{3})(?=,|$)/, "$1.$2")}${u}`);
const hm = (m: number | null | undefined): string => (!isNum(m) ? "—" : `${Math.floor(Math.round(m) / 60)}:${String(Math.round(m) % 60).padStart(2, "0")}`);
const nums = (xs: (number | null | undefined)[]): number[] => xs.filter(isNum);
const avg = (xs: (number | null | undefined)[]): number | null => { const v = nums(xs); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sum = (xs: (number | null | undefined)[]): number => nums(xs).reduce((a, b) => a + b, 0);
const clamp = (v: number, a = 0, z = 100) => Math.max(a, Math.min(z, v));
// one traffic-light scale for every progress ring (this Page and the Life App): how full the ring is (0-1 on its own scale)
// < 0.34 red, < 0.67 yellow, else green; empty / no data = null (only the grey track shows)
const RING_TONES = { lo: "#FF0026", mid: "#FFDE00", hi: "#16EC06" };
const ringTone = (frac: number | null | undefined): string | null => (!isNum(frac) || frac <= 0 ? null : frac < 0.34 ? RING_TONES.lo : frac < 0.67 ? RING_TONES.mid : RING_TONES.hi);
const KIND_NAME: Record<string, string> = { grid: "GRID", palestra: "Palestra", padel: "Padel", beach: "Beach volley", tennis: "Tennis", camminata: "Camminata", sport: "Sport" };
const MEAL_ORDER = ["Colazione", "Pranzo", "Spuntino", "Cena"];
// fonti proteiche che mangia davvero (dai suoi pasti registrati), per porzione
const PROTEIN_FOODS: { name: string; portion: string; p: number; kcal: number }[] = [
  { name: "Bresaola", portion: "100 g", p: 32, kcal: 150 },
  { name: "Albumi", portion: "200 g", p: 20, kcal: 86 },
  { name: "Budino proteico Lidl", portion: "200 g", p: 20, kcal: 150 },
  { name: "Tramezzini High Protein", portion: "1 confezione", p: 23, kcal: 340 },
  { name: "Prosciutto crudo", portion: "80 g", p: 20, kcal: 200 },
  { name: "Mozzarella di bufala", portion: "125 g", p: 21, kcal: 360 },
];
const dayMacro = (d: Day, k: MKey): { v: number | null; partial: boolean } => {
  const f = d[DKEY[k]];
  if (isNum(f)) return { v: f, partial: false };
  const vals = d.meals.map((m: Meal) => m[k]);
  const got = nums(vals);
  if (!got.length) return { v: null, partial: false };
  return { v: got.reduce((a, b) => a + b, 0), partial: got.length < vals.length };
};
const toMin = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const m = /(\d{1,2})[:.](\d{2})/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const l = t.toLowerCase();
  if (l.includes("colazione") || l.includes("mattin")) return 480;
  if (l.includes("pranzo")) return 780;
  if (l.includes("pomerigg")) return 960;
  if (l.includes("cena") || l.includes("sera")) return 1230;
  return null;
};
const clock = (m: number | null | undefined): string => {
  if (!isNum(m)) return "—";
  const v = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const bedRel = (t: string | null | undefined): number | null => { const m = toMin(t); return m === null ? null : m < 720 ? m + 1440 : m; };
const sdev = (xs: number[]): number | null => { if (xs.length < 2) return null; const a = xs.reduce((p, q) => p + q, 0) / xs.length; return Math.sqrt(xs.reduce((p, q) => p + (q - a) * (q - a), 0) / xs.length); };
const pearson = (xs: number[], ys: number[]): number | null => {
  if (xs.length < 3) return null;
  const ax = xs.reduce((p, q) => p + q, 0) / xs.length, ay = ys.reduce((p, q) => p + q, 0) / ys.length;
  let n = 0, dx = 0, dy = 0;
  xs.forEach((x, i) => { n += (x - ax) * (ys[i] - ay); dx += (x - ax) ** 2; dy += (ys[i] - ay) ** 2; });
  return dx && dy ? n / Math.sqrt(dx * dy) : null;
};
const daysBetween = (a: string, b: string): number => { const p = parts(a), q = parts(b); return Math.round((Date.UTC(q.y, q.m - 1, q.dd) - Date.UTC(p.y, p.m - 1, p.dd)) / 86400000); };
const kindOf = (w: Workout): string => w.kind ?? (w.name.toUpperCase().startsWith("GRID") ? "grid" : "palestra");

// ---------- punteggi: nostra stima, solo dai DATA ----------
// SONNO v2, stile WHOOP/Oura: punteggio = Sufficienza^0,6 × Qualità^0,4
//   Sufficienza = 100 × (ore dormite / bisogno)^2,5 (rigida: 7h su 8h = 72, 6h = 49)
//   Bisogno = 8h base + sforzo del giorno prima (+3,5 min per punto sopra 10, max +30) + debito delle 3 notti prima
//             (25% / 15% / 10% dell'ammanco rispetto a 8h, max +45) − pisolino del giorno prima (max 60); limiti 7h–10h
//   Qualità = media pesata dei componenti disponibili: Regolarità 40% (70% scarto letto/sveglia vs 4 notti prima,
//             30% orario: −25 punti per ogni ora a letto dopo le 00:30), Ristoratore 35% (profondo vs 17%, REM vs 22%),
//             Efficienza 25% (sonno / tempo a letto: 75% = 0, 95% = 100; −4 per risveglio oltre il secondo)
type SleepParts = {
  score: number | null; need: number; base: number; strainAdd: number; debt: number; napCut: number; ratio: number | null; suff: number | null;
  regDev: number | null; reg: number | null; timing: number | null; cons: number | null; effPct: number | null; eff: number | null;
  deepPct: number | null; remPct: number | null; rest: number | null;
};
const SLEEP_BASE = 480;
const addDays = (date: string, k: number): string => { const p = parts(date); return new Date(Date.UTC(p.y, p.m - 1, p.dd + k)).toISOString().slice(0, 10); };
const dayOf = (date: string): Day | undefined => DATA.days.find((y: Day) => y.date === date);
// OGGI = la data vera nel fuso orario configurato, non l'ultima data dei dati: se i dati sono ancora di ieri (notte non sincronizzata, build
// di prima di mezzanotte, app riaperta dal background) si aggiungono i giorni mancanti vuoti e si apre comunque su oggi
const romeISO = (): string => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } };
const LOAD_DAY = romeISO();
if (LOAD_DAY > DATA.today && daysBetween(DATA.today, LOAD_DAY) <= 14) {
  for (let t = addDays(DATA.days.length ? DATA.days[DATA.days.length - 1].date : DATA.today, 1); t <= LOAD_DAY; t = addDays(t, 1)) {
    if (!dayOf(t)) DATA.days.push({ date: t, eatenKcal: null, proteinG: null, burnedKcal: null, activeKcal: null, basalKcal: null, fitbitTotalKcal: null, steps: null, incomplete: true, note: null, meals: [], workouts: [] });
  }
  DATA.today = LOAD_DAY;
}
// debito di sonno stile WHOOP: l'ammanco della notte rispetto al bisogno base si porta alla notte dopo per metà e si ripaga
// dormendo di più (0–4 h, parte da 0 alla prima notte registrata). Il Life App usa la stessa regola sulla sua storia lunga.
const DEBT_CARRY = 0.5, DEBT_CAP = 240;
const sleptOf = (x: Day | undefined): number | null => (x && isNum(x.sleepMin) && x.sleepMin > 0 ? x.sleepMin + (isNum(x.napMin) ? x.napMin : 0) : null);
const sleepDebtOn = (date: string, list: Day[] = DATA.days): number | null => {
  const ds = list.filter((y: Day) => y.date <= date).sort((a: Day, b: Day) => (a.date < b.date ? -1 : 1));
  if (!ds.length) return null;
  let debt = 0, seen = false;
  for (let t = ds[0].date; t <= date; t = addDays(t, 1)) {
    const s = sleptOf(ds.find((y: Day) => y.date === t));
    if (s === null) debt *= DEBT_CARRY; else { debt = clamp(debt * DEBT_CARRY + SLEEP_BASE - s, 0, DEBT_CAP); seen = true; }
  }
  return seen ? Math.round(debt) : null;
};
// un solo formato per il debito ovunque (anche nel Life App): a 5 minuti, "3h 20m"
const debtText = (m: number): string => { const v = Math.round(m / 5) * 5; return v < 60 ? `${v} min` : `${Math.floor(v / 60)}h${v % 60 ? ` ${String(v % 60).padStart(2, "0")}m` : ""}`; };
const sleepNeed = (date: string): { need: number; base: number; strainAdd: number; debt: number; napCut: number } => {
  const prev = dayOf(addDays(date, -1));
  const s = prev ? strainScore(prev) : null;
  const strainAdd = isNum(s) ? Math.round(clamp((s - 10) * 3.5, 0, 30)) : 0;
  const dt = Math.round(DEBT_CARRY * (sleepDebtOn(addDays(date, -1)) ?? 0));
  const napCut = prev && isNum(prev.napMin) ? Math.round(Math.min(60, prev.napMin)) : 0;
  return { need: clamp(SLEEP_BASE + strainAdd + dt - napCut, 420, 600), base: SLEEP_BASE, strainAdd, debt: dt, napCut };
};
const sleepParts = (x: Day, list: Day[] = DATA.days): SleepParts => {
  const n = sleepNeed(x.date);
  const sl = isNum(x.sleepMin) && x.sleepMin > 0 ? x.sleepMin : null;
  const ratio = sl === null ? null : sl / n.need;
  const suff = ratio === null ? null : 100 * Math.pow(Math.min(1, ratio), 2.5);
  // regolarità: letto e sveglia rispetto alla media delle (fino a) 4 notti precedenti
  const prev = list.filter((y: Day) => y.date < x.date).sort((a: Day, b: Day) => (a.date < b.date ? -1 : 1)).slice(-4);
  const pb = nums(prev.map((y: Day) => bedRel(y.bedtime))), pw = nums(prev.map((y: Day) => toMin(y.wakeTime)));
  const b = bedRel(x.bedtime), wk = toMin(x.wakeTime);
  const devs = nums([b !== null && pb.length >= 2 ? Math.abs(b - (avg(pb) as number)) : null, wk !== null && pw.length >= 2 ? Math.abs(wk - (avg(pw) as number)) : null]);
  const regDev = devs.length ? avg(devs) : null;
  const reg = regDev === null ? null : clamp(100 - regDev * 0.6);
  const timing = b === null ? null : clamp(100 - (Math.max(0, b - 1470) / 60) * 25);
  const cons = reg !== null && timing !== null ? 0.7 * reg + 0.3 * timing : reg ?? timing;
  const inBed = isNum(x.inBedMin) && x.inBedMin > 0 ? x.inBedMin : sl !== null && isNum(x.awakeMin) ? sl + x.awakeMin : null;
  const effPct = sl !== null && inBed !== null ? Math.min(100, (sl / inBed) * 100) : null;
  const eff = effPct === null ? null : clamp(((effPct - 75) / 20) * 100 - 4 * Math.max(0, (x.wakeups ?? 0) - 2));
  const deepPct = sl !== null && isNum(x.deepMin) ? (x.deepMin / sl) * 100 : null, remPct = sl !== null && isNum(x.remMin) ? (x.remMin / sl) * 100 : null;
  const rs = nums([deepPct === null ? null : 100 * Math.pow(Math.min(1, deepPct / 17), 1.5), remPct === null ? null : 100 * Math.pow(Math.min(1, remPct / 22), 1.5)]);
  const rest = rs.length ? (avg(rs) as number) : null;
  const q = [{ v: cons, w: 0.4 }, { v: rest, w: 0.35 }, { v: eff, w: 0.25 }].filter((c) => c.v !== null) as { v: number; w: number }[];
  const qw = q.reduce((a, c) => a + c.w, 0), Q = qw > 0 ? q.reduce((a, c) => a + c.v * c.w, 0) / qw : null;
  const score = suff === null ? null : Math.round(clamp(Q === null ? suff : Math.pow(Math.max(suff, 0.01), 0.6) * Math.pow(Math.max(Q, 0.01), 0.4), 1, 100));
  return { score, ...n, ratio, suff, regDev, reg, timing, cons, effPct, eff, deepPct, remPct, rest };
};
const sleepScore = (x: Day): number | null => sleepParts(x).score;
// ---------- età biologica: tutti i segnali disponibili, pesati come un healthspan (fitness, sonno, cuore, movimento, peso) ----------
// i fattori senza dato (VO2max, massa magra) restano "da misurare" e non spostano l'età; gli esami li aggiunge App.
// wearOnly: solo i segnali dell'orologio (serve al Life App per confrontare il ritmo degli ultimi 30 giorni con la sua storia)
const bioModel = (win: Day[], bio: BioAge | null, today: string, wearOnly = false, ctx?: Day[]): { factors: Factor[]; delta: number } => {
  const F: Factor[] = [];
  const nights = win.filter((x: Day) => isNum(x.sleepMin) && x.sleepMin > 0);
  const full = win.filter((x: Day) => !x.incomplete && x.date !== today && isNum(x.steps));
  const A = (f: (x: Day) => number | null | undefined, list: Day[] = win): number | null => avg(list.map(f));
  const weeks = Math.max(1, win.length / 7);
  // prudenza: un dato mancante non conta mai come buono; con pochi giorni il fattore pesa meno (sotto 3 giorni è neutro);
  // nessun fattore sposta l'età di più di un anno
  const COV: Record<string, (x: Day) => unknown> = { "Costanza del sonno": (x) => sleepParts(x, ctx ?? win).reg, "Durata sonno": (x) => x.sleepMin, "Sonno profondo + REM": (x) => x.deepMin, "FC a riposo": (x) => x.rhr,
    "FC minima nel sonno": (x) => x.hrSleepMin, HRV: (x) => x.hrvMs, "Respirazione notturna": (x) => x.breathing, "Ossigeno nel sonno": (x) => x.spo2, "Passi al giorno": (x) => (x.incomplete || x.date === today ? null : x.steps) };
  const add = (name: string, v: number | null, value: () => string, y: (n: number) => number, good: string, bad: string) => {
    if (v === null) { F.push({ name, value: "—", years: null, why: "Dato mancante." }); return; }
    const n = COV[name] ? win.filter((x: Day) => isNum(COV[name](x))).length : win.length;
    if (n < 3) { F.push({ name, value: value(), years: 0, why: "Pochi giorni di dati: per ora non conta." }); return; }
    const yy = Math.round(clamp(y(v) * Math.min(1, n / 7), -1, 1) * 4) / 4;
    F.push({ name, value: value(), years: yy, why: yy <= 0 ? good : bad });
  };
  // sonno
  const cs = avg(nights.map((x: Day) => sleepParts(x, ctx ?? win).reg));
  const csDev = avg(nights.map((x: Day) => sleepParts(x, ctx ?? win).regDev));
  add("Costanza del sonno", cs, () => (csDev === null ? "—" : `orari: ${Math.round(csDev)} min di scarto in media`), (n) => (n >= 80 ? -1 : n >= 65 ? 0 : n >= 50 ? 0.75 : 1.5), "Vai a letto e ti svegli a orari simili.", "Orari di letto e sveglia che cambiano molto: il ritmo circadiano ne risente.");
  const sl = A((x: Day) => x.sleepMin, nights);
  add("Durata sonno", sl, () => `${hm(sl)} a notte`, (n) => (n >= 420 && n <= 540 ? -1 : n >= 390 ? 0 : n >= 360 ? 1 : 1.5), "Sonno sufficiente.", "Sotto le 7 ore consigliate.");
  const rs = avg(nights.map((x: Day) => (isNum(x.deepMin) && isNum(x.remMin) && isNum(x.sleepMin) ? ((x.deepMin + x.remMin) / x.sleepMin) * 100 : null)));
  add("Sonno profondo + REM", rs, () => `${Math.round(rs ?? 0)}% della notte`, (n) => (n >= 40 ? -0.25 : n >= 33 ? 0 : 0.5), "Buona quota di sonno ristoratore.", "Poco sonno profondo e REM: notti più lunghe e regolari lo alzano.");
  // cuore e notte
  const rh = A((x: Day) => x.rhr);
  add("FC a riposo", rh, () => fmt(rh, " bpm"), (n) => (n <= 55 ? -1.5 : n <= 60 ? -0.5 : n <= 65 ? 0 : n <= 70 ? 1 : 2), "Cuore efficiente a riposo.", "Un po' alta: più cardio e sonno la abbassano.");
  const hs = A((x: Day) => x.hrSleepMin);
  add("FC minima nel sonno", hs, () => fmt(hs, " bpm"), (n) => (n <= 55 ? 0 : 0.5), "Di notte il cuore scende bene.", "Di notte il cuore resta alto: cena leggera e niente alcol la sera aiutano.");
  const hv = A((x: Day) => x.hrvMs);
  add("HRV", hv, () => fmt(hv, " ms"), (n) => (n >= 50 ? -1 : n >= 40 ? -0.5 : n >= 35 ? 0 : n >= 30 ? 0.5 : 1), "Buona variabilità: recupero solido.", "Sotto la media tipica alla tua età: sonno corto e stress la abbassano.");
  const br = A((x: Day) => x.breathing);
  add("Respirazione notturna", br, () => fmt(br, " respiri/min"), (n) => (n >= 10 && n <= 18 ? 0 : 0.5), "Respiro notturno regolare.", "Respiro notturno fuori dal solito intervallo.");
  const sp = A((x: Day) => x.spo2);
  add("Ossigeno nel sonno", sp, () => fmt(sp, "%"), (n) => (n >= 93 ? 0 : 0.5), "Ossigenazione notturna buona.", "Ossigeno notturno basso: se resta così parlane con il medico.");
  // movimento
  const stp = A((x: Day) => x.steps, full);
  add("Passi al giorno", stp, () => Math.round(stp ?? 0).toLocaleString("it-IT"), (n) => (n >= 10000 ? -1 : n >= 7500 ? -0.5 : n >= 5000 ? 0 : 1), "Molto attivo: è un tuo punto di forza.", "Pochi passi: una camminata al giorno cambia molto.");
  const cm = win.length ? sum(win.map(cardioMin)) / weeks : null;
  add("Cardio a settimana", cm, () => `${Math.round(cm ?? 0)} min`, (n) => (n >= 150 ? -1 : n >= 75 ? 0 : 1), "Sopra i 150 minuti consigliati.", "Sotto i 150 minuti di cardio consigliati.");
  // segnali che misurano la stessa cosa non si sommano senza limite: tetto per gruppo
  const GROUPS: [string[], number, number][] = [
    [["Costanza del sonno", "Durata sonno", "Sonno profondo + REM"], -1, 2],
    [["FC a riposo", "FC minima nel sonno", "HRV"], -1.5, 2],
    [["Respirazione notturna", "Ossigeno nel sonno"], 0, 1],
    [["Passi al giorno", "Cardio a settimana", "Minuti ad alta intensità", "Allenamento di forza"], -1.5, 2],
  ];
  const total = () => {
    const inG = new Set(GROUPS.flatMap((g) => g[0]));
    const g = GROUPS.reduce((a, [ns, lo, hi]) => a + clamp(sum(F.filter((f) => ns.includes(f.name)).map((f) => f.years)), lo, hi), 0);
    return g + sum(F.filter((f) => !inG.has(f.name)).map((f) => f.years));
  };
  if (wearOnly) return { factors: F, delta: total() };
  const done = win.flatMap((x: Day) => x.workouts.filter((w: Workout) => w.status === "fatto"));
  const hiN = done.map((w: Workout) => w.minAbove140).filter(isNum);
  const hi = hiN.length ? sum(hiN) / weeks : null;
  add("Minuti ad alta intensità", hi, () => `${Math.round(hi ?? 0)} min a settimana`, (n) => (n >= 30 ? -0.5 : n >= 10 ? 0 : 0.5), "Ogni settimana hai lavoro ad alta intensità.", "Poco lavoro intenso: una partita tirata o qualche scatto a settimana bastano.");
  const fz = done.filter((w: Workout) => kindOf(w) === "grid" || kindOf(w) === "palestra").length / weeks;
  add("Allenamento di forza", fz, () => `${r1(fz).toLocaleString("it-IT")} sedute a settimana`, (n) => (n >= 2 ? -0.75 : n >= 1 ? 0 : 0.75), "Forza almeno due volte a settimana.", "Meno di due sedute di forza a settimana.");
  // peso: BMI e andamento
  const last = WEIGHTS.length ? WEIGHTS[WEIGHTS.length - 1] : null;
  const kg = last ? last.kg : isNum(bio?.weightKg) ? bio.weightKg : null;
  const bmi = kg !== null && isNum(bio?.heightCm) ? kg / (bio.heightCm / 100) ** 2 : null;
  const ref = last ? WEIGHTS.find((w) => daysBetween(w.date, last.date) <= 60) ?? null : null;
  const tr = last && ref && ref.date !== last.date ? last.kg - ref.kg : null;
  if (bmi === null) F.push({ name: "Peso", value: "—", years: null, why: "Mancano peso o altezza." });
  else {
    const y = (bmi < 18.5 ? 0.5 : bmi < 25 ? 0 : bmi < 30 ? 0.75 : 1.5) + (bmi >= 25 && tr !== null ? (tr <= -1 ? -0.25 : tr >= 1 ? 0.25 : 0) : 0);
    F.push({ name: "Peso", value: `${fmt(kg, " kg")}${tr !== null ? ` · ${tr < 0 ? "−" : "+"}${fmt(Math.abs(tr), " kg")} in ${daysBetween(ref!.date, last!.date)} giorni` : ""}`, years: y, why: bmi < 25 ? "Peso nella norma." : tr !== null && tr <= -1 ? "Sopra il peso ideale, ma sta scendendo: continua così." : "Sopra il peso ideale: scendere un po' ringiovanisce." });
  }
  // fitness e composizione: senza misura non si stimano
  const vo2 = bio?.vo2max, bf = bio?.bodyFatPct;
  F.push(isNum(vo2) ? { name: "VO2max", value: fmt(vo2), years: vo2 >= 50 ? -2.5 : vo2 >= 45 ? -1.25 : vo2 >= 40 ? 0 : vo2 >= 35 ? 1.25 : 2.5, why: "Capacità aerobica: il segnale che pesa di più." } : { name: "VO2max", value: "da misurare", years: null, why: "Il segnale che pesa di più: una corsa con GPS o un test da sforzo lo misurano." });
  F.push(isNum(bf) ? { name: "Massa magra", value: `grasso ${fmt(bf, "%")}`, years: bf < 15 ? -1 : bf < 20 ? 0 : bf < 25 ? 0.75 : 1.5, why: "Composizione corporea." } : { name: "Massa magra", value: "da misurare", years: null, why: "Una bilancia impedenziometrica o una DEXA la misurano." });
  return { factors: F, delta: total() };
};
const cardioMin = (x: Day): number => sum(x.workouts.filter((w: Workout) => w.status === "fatto" && isNum(w.avgHr) && w.avgHr >= 120).map((w: Workout) => w.durationMin));
const strainOf = (load: number): number => Math.round(21 * (1 - Math.exp(-load / 1500)) * 10) / 10;
// le kcal di una sessione comprendono il metabolismo di base di quei minuti: per lo sforzo conta solo la parte attiva,
// così lo sforzo del giorno non è mai più basso di quello di una sua sessione
const BASAL_MIN = (() => { const v = nums(DATA.days.filter((y: Day) => y.date !== DATA.today && !y.incomplete).map((y: Day) => y.basalKcal)); return (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 1900) / 1440; })();
const actActive = (w: Workout): number => (w.status === "fatto" && isNum(w.kcal) ? Math.max(0, w.kcal - (isNum(w.durationMin) ? w.durationMin * BASAL_MIN : 0)) : 0);
const strainScore = (x: Day): number | null => (isNum(x.activeKcal) ? strainOf(Math.max(x.activeKcal, sum(x.workouts.map(actActive))) + 5 * cardioMin(x)) : null);
const actLoad = (w: Workout): number | null => {
  if (w.status !== "fatto") return null;
  const k = actActive(w), c = isNum(w.avgHr) && w.avgHr >= 120 && isNum(w.durationMin) ? 5 * w.durationMin : 0;
  return k + c > 0 ? k + c : null;
};
const actStrain = (w: Workout): number | null => { const l = actLoad(w); return l === null ? null : strainOf(l); };
// RECUPERO stile WHOOP, uguale nelle due app: HRV e FC a riposo della notte rispetto alla tua norma degli ultimi 30 giorni
// (la stessa norma delle frecce e dei grafici) + il punteggio Sonno mostrato; dopo una notte da bollino rosso non si va sul verde
const HIST_ALL: Day[] = [...(DATA.history ?? []).map((h) => ({ workouts: [], meals: [], incomplete: false, ...h }) as unknown as Day), ...DATA.days].sort((a: Day, z: Day) => (a.date < z.date ? -1 : 1));
const norm30 = (x: Day, f: (y: Day) => number | null | undefined): number | null => avg(HIST_ALL.filter((y: Day) => y.date < x.date && y.date >= addDays(x.date, -30)).map(f));
const recoveryOf = (x: Day, sl: number | null): number | null => {
  const bh = norm30(x, (y: Day) => y.hrvMs), br = norm30(x, (y: Day) => y.rhr);
  if (!isNum(x.hrvMs) || !isNum(x.rhr) || bh === null || br === null || sl === null || bh <= 0 || br <= 0) return null;
  const hv = clamp(50 + ((x.hrvMs - bh) / bh) * 250), rh = clamp(50 - ((x.rhr - br) / br) * 500);
  const v = clamp(0.5 * hv + 0.25 * rh + 0.25 * sl, 1, 99);
  return Math.round(sl < 34 ? Math.min(v, 66) : v);
};
// un impegno in agenda già svolto (stessa attività, stesso sport o stesso orario nel giorno): non è più "in programma"
const doneOf = (u: { date: string; time: string; name: string; kind?: string | null }): Workout | null => {
  const sport = (k: string | null | undefined, n: string) => /padel|tennis|beach|torneo|partita|match/i.test(`${k ?? ""} ${n}`);
  const s0 = toMin(u.time);
  return (dayOf(u.date)?.workouts ?? []).find((w: Workout) => w.status === "fatto" && (w.name === u.name || (!!u.kind && kindOf(w) === u.kind) || (sport(u.kind, u.name) && sport(kindOf(w), w.name)) || (s0 !== null && /\d/.test(u.time) && toMin(w.time) !== null && Math.abs((toMin(w.time) as number) - s0) <= 45))) ?? null;
};

// ---------- età biologica: blob organico animato (canvas 2D) ----------
// contorno che "respira" + puntini che brillano vicino al bordo; si ferma se la scheda è nascosta o fuori schermo,
// un solo fotogramma fisso con prefers-reduced-motion. Massimo 220 puntini, ~30 fps, DPR max 2.
type BlobTone = { rimA: string; rimB: string; dotA: [number, number, number]; dotB: [number, number, number] };
function AgeBlob(props: { size: number; tone: BlobTone; children?: ReactNode }) {
  const { size, tone } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    const c = size / 2, R = size * 0.4;
    // seme fisso: la forma resta la stessa a ogni apertura
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const waves = [2, 3, 4, 5].map((k, i) => ({ k, a: [0.034, 0.026, 0.016, 0.01][i], p: rnd() * 6.283, w: (0.18 + rnd() * 0.22) * (i % 2 ? -1 : 1) }));
    const N = Math.min(220, Math.round(size * 0.75));
    const dots = Array.from({ length: N }, () => ({ th: rnd() * 6.283, rho: 1 - Math.pow(rnd(), 2) * 0.86, s: 0.5 + Math.pow(rnd(), 2.6) * 2.3, ph: rnd() * 6.283, sp: 0.6 + rnd() * 1.8, dr: (rnd() - 0.5) * 0.05, wob: rnd() * 6.283 }));
    const rad = (th: number, t: number) => R * (1 + waves.reduce((a, q) => a + q.a * Math.sin(q.k * th + q.p + q.w * t), 0));
    const path = (t: number, scale = 1) => {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) { const th = (i / 96) * 6.283, r = rad(th, t) * scale; const x = c + r * Math.cos(th), y = c + r * Math.sin(th); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
    };
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      // alone esterno
      ctx.save(); path(t); ctx.shadowColor = tone.rimA + "88"; ctx.shadowBlur = size * 0.07; ctx.fillStyle = "#05080A"; ctx.fill(); ctx.restore();
      // interno: centro scuro, bagliore colorato verso il bordo
      ctx.save(); path(t); ctx.clip();
      const lg = ctx.createLinearGradient(0, c - R, 0, c + R); lg.addColorStop(0, tone.rimA); lg.addColorStop(1, tone.rimB);
      ctx.fillStyle = lg; ctx.fillRect(0, 0, size, size);
      const rg = ctx.createRadialGradient(c, c, 0, c, c, R * 1.08);
      rg.addColorStop(0, "rgba(3,5,7,1)"); rg.addColorStop(0.42, "rgba(3,5,7,0.96)"); rg.addColorStop(0.7, "rgba(3,5,7,0.8)"); rg.addColorStop(0.88, "rgba(3,5,7,0.6)"); rg.addColorStop(1, "rgba(3,5,7,0.42)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, size, size);
      for (const d of dots) {
        const th = d.th + d.dr * t, rr = rad(th, t) * Math.min(0.97, d.rho + 0.02 * Math.sin(t * 0.5 + d.wob));
        const x = c + rr * Math.cos(th), y = c + rr * Math.sin(th);
        const tw = 0.5 + 0.5 * Math.sin(t * d.sp + d.ph);
        const al = Math.min(1, (0.12 + 0.95 * Math.pow(d.rho, 2)) * (0.45 + 0.6 * tw));
        // colore del puntino: segue il gradiente verticale (nel tono misto blu in alto, ambra in basso)
        const f = Math.max(0, Math.min(1, (y - (c - R)) / (2 * R)));
        const A = tone.dotA, B = tone.dotB;
        ctx.fillStyle = `rgba(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)},${al.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, d.s * (0.85 + 0.25 * tw), 0, 6.283); ctx.fill();
      }
      ctx.restore();
      // bordo luminoso
      ctx.save(); path(t); ctx.lineWidth = 1.3; ctx.strokeStyle = lg; ctx.shadowColor = tone.rimA; ctx.shadowBlur = 4; ctx.globalAlpha = 0.85; ctx.stroke(); ctx.restore();
    };
    const reduce = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { draw(0); return; }
    let raf = 0, last = 0, t0 = 0, visible = true, running = false;
    const loop = (now: number) => {
      raf = 0;
      if (!running) return;
      if (!t0) t0 = now;
      if (now - last >= 33) { last = now; draw((now - t0) / 1000); }
      raf = requestAnimationFrame(loop);
    };
    const sync = () => {
      const on = visible && !(typeof document !== "undefined" && document.hidden);
      if (on && !running) { running = true; if (!raf) raf = requestAnimationFrame(loop); }
      else if (!on && running) { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    };
    draw(0);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") { io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); sync(); }); io.observe(cv); }
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { running = false; if (raf) cancelAnimationFrame(raf); if (io) io.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, [size, tone.rimA, tone.rimB]);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, width: size, height: size, display: "block" }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{props.children}</div>
    </div>
  );
}

export default function App() {
  const base = useGrokTheme();
  // palette scura stile app di recupero: colori con significato fisso
  const K = {
    bg: "#0B0E10", top: "#2A3843", mid: "#121A20", card: "#1A2026", card2: "#222A31", line: "#2A3239", track: "#2C353C",
    t1: "#FFFFFF", t2: "#B7BEC4", t3: "#7F888F",
    sleep: "#7BA1BB", recHi: "#16EC06", recMid: "#FFDE00", recLo: "#FF0026", strain: "#0093E7",
    up: "#00F19F", warn: "#FF9F2E", link: "#8C9BFF", inA: "#6B5BE6", inB: "#2FA6DE", teal: "#00F19F", violet: "#9C7ED9",
    orb: "#0B3A2C", white: "#FFFFFF", whiteDim: "#FFFFFFCC", rowEnd: "#27313B", nav: "#161B20F2", shadow: "#00000080", navOn: "#FFFFFF14", mealBox: "#3A3150",
    navPill: "#1E2328", navEdge: "#30373E", navOff: "#9AA1A8", orbA: "#3C3B5E", orbB: "#29394D", orbCore: "#14161F", navShadow: "#05070A",
    okBand: "#1F4A3A", warnBand: "#4A3A1F",
  };
  const FONT = base.font.family;
  const NUM = `"DIN Condensed", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", ${FONT}`;
  const caps: CSSProperties = { textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 };
  const days = DATA.days;
  const PT = DATA.proteinTarget;

  const [tab, setTab] = useState<Tab>("home");
  const [screen, setScreen] = useState<Screen>(null);
  const [sel, setSel] = useState<string>(DATA.today);
  const [cal, setCal] = useState<boolean>(false);
  const [info, setInfo] = useState<boolean>(false);
  const [q, setQ] = useState<string>("");
  const [mealDay, setMealDay] = useState<string>("tutti");
  const [sort, setSort] = useState<Sort>("ora");
  const [cibiView, setCibiView] = useState<"elenco" | "analisi">("elenco");

  const d = days.find((x: Day) => x.date === sel) ?? days[days.length - 1];
  const selIdx = days.findIndex((x: Day) => x.date === d.date);
  const go = (date: string) => { setSel(date); setMealDay(date); setCal(false); };
  const shift = (k: number) => { const n = selIdx + k; if (n >= 0 && n < days.length) go(days[n].date); };
  const upcoming = (DATA.upcoming ?? []).filter((u: Upcoming) => u.date >= DATA.today && !doneOf(u));
  const time = DATA.updatedAt.slice(11, 16);
  // batteria del Fitbit: solo se letta nelle ultime 12 ore; neutra, ambra sotto il 30%, rossa sotto il 15%
  const dev = DATA.device ?? null;
  const batt = dev && isNum(dev.battery) && Date.now() - Date.parse(`${dev.at}:00+01:00`) < 12 * 3600e3 ? Math.round(dev.battery) : null;
  const battCol = batt === null ? K.t3 : batt < 15 ? K.recLo : batt < 30 ? K.warn : K.t2;
  const battBadge = batt === null ? null : (
    <span aria-label="Batteria Fitbit" data-v={batt} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, lineHeight: "16px", whiteSpace: "nowrap", color: battCol, fontWeight: batt < 30 ? 700 : 400 }}>
      <svg width={18} height={10} viewBox="0 0 18 10" style={{ display: "block" }}><rect x={0.5} y={0.5} width={15} height={9} rx={2} fill="none" stroke="currentColor" /><rect x={16} y={3} width={1.5} height={4} rx={0.5} fill="currentColor" /><rect x={2} y={2} width={Math.max(1, (12 * batt) / 100)} height={6} rx={1} fill="currentColor" /></svg>
      {`${batt}%${batt < 15 ? " · caricalo" : ""}`}
    </span>
  );
  const dayTitle = (date: string) => { const p = parts(date); return date === DATA.today ? "Oggi" : `${WD[p.w]} ${p.dd} ${MO[p.m - 1]}`; };
  const shortDay = (date: string) => { const p = parts(date); return date === DATA.today ? "Oggi" : `${WD[p.w]} ${p.dd}`; };
  const longDate = (dt: string) => { const p = parts(dt); return `${p.dd} ${MO[p.m - 1]} ${p.y}`; };
  const live = d.date === DATA.today;
  const dayName = (date: string) => (date === DATA.today ? "oggi" : dayTitle(date));

  // ---------- viewport e scroll ----------
  const viewportH = (): number => {
    const w = typeof window !== "undefined" ? window : null;
    if (!w) return 760;
    let h = w.innerHeight;
    if (w.visualViewport && w.visualViewport.height > 0) h = Math.min(h, w.visualViewport.height);
    return Math.max(320, Math.floor(h));
  };
  const [vh, setVh] = useState<number>(viewportH());
  useEffect(() => {
    const on = () => setVh(viewportH());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("orientationchange", on); };
  }, []);
  const scroller = useRef<HTMLDivElement>(null);
  const scrollKey = `${tab}|${screen ? JSON.stringify(screen) : ""}`;
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [scrollKey]);
  // sottopagine: Indietro (o il gesto indietro del telefono / browser) torna alla pagina di partenza nella stessa posizione
  const fromY = useRef<number>(0), backY = useRef<number | null>(null), pushed = useRef<boolean>(false), scrNow = useRef<Screen>(null);
  scrNow.current = screen;
  useEffect(() => { if (!screen && backY.current !== null && scroller.current) scroller.current.scrollTop = backY.current; backY.current = null; }, [scrollKey]);
  const shut = () => { if (scrNow.current) { backY.current = fromY.current; setScreen(null); } };
  useEffect(() => {
    const onPop = () => { pushed.current = false; shut(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const open = (s: Screen) => {
    setInfo(false); setCal(false);
    if (!screen) { fromY.current = scroller.current ? scroller.current.scrollTop : 0; try { window.history.pushState({ wbScreen: true }, ""); pushed.current = true; } catch { pushed.current = false; } }
    setScreen(s);
  };
  const closeScreen = () => { if (pushed.current) { pushed.current = false; try { window.history.back(); return; } catch { /* niente cronologia */ } } shut(); };
  const goTab = (t: Tab) => { setInfo(false); if (pushed.current) { pushed.current = false; try { window.history.back(); } catch { /* niente cronologia */ } } setScreen(null); setCal(false); setTab(t); };

  // ---------- baseline: media degli altri giorni ----------
  const others = (x: Day) => days.filter((y: Day) => y.date !== x.date);
  const baseOf = (x: Day, f: (y: Day) => number | null | undefined, cumulative = false): number | null =>
    avg(others(x).filter((y: Day) => !cumulative || (y.date !== DATA.today && !y.incomplete)).map(f));
  const recScore = (x: Day): number | null => recoveryOf(x, sonnoOf(x));
  const trendOf = (v: number | null | undefined, b: number | null | undefined, higherBetter: boolean | null, tol = 0.03): Trend | null => {
    if (!isNum(v) || !isNum(b) || b === 0) return null;
    const r = (v - b) / Math.abs(b);
    if (Math.abs(r) < tol) return { dir: "flat", good: null };
    const dir = r > 0 ? "up" : "down";
    return { dir, good: higherBetter === null ? null : (dir === "up") === higherBetter };
  };
  const recColor = (v: number | null) => (v === null ? K.t3 : v >= 67 ? K.recHi : v >= 34 ? K.recMid : K.recLo);
  const bal = (x: Day): number | null => (isNum(x.eatenKcal) && isNum(x.burnedKcal) ? x.eatenKcal - x.burnedKcal : null);
  const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${String(Math.abs(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`);

  // ---------- primitive grafiche ----------
  const st = (gap: number): CSSProperties => ({ display: "flex", flexDirection: "column", gap, minWidth: 0 });
  const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, minWidth: 0 };
  const ell: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
  const lbl: CSSProperties = { fontSize: 12, lineHeight: "16px", color: K.t3 };
  const txt: CSSProperties = { fontSize: 14, lineHeight: "20px", color: K.t2 };
  const capLbl = (size = 12): CSSProperties => ({ ...caps, fontSize: size, lineHeight: `${size + 4}px`, color: K.t1 });
  const card: CSSProperties = { boxSizing: "border-box", width: "100%", minWidth: 0, background: `linear-gradient(180deg, ${K.card2} 0%, ${K.card} 100%)`, border: `1px solid ${K.line}`, borderRadius: 16, padding: 16 };
  const btn: CSSProperties = { background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", fontFamily: FONT, textAlign: "left", color: K.t1 };
  // un solo header per schermata: fisso in alto, vetro smerigliato, il contenuto scorre sotto; copre anche la barra di stato iOS
  const safeTop = "var(--sa-t, env(safe-area-inset-top, 0px))";
  const frost: CSSProperties = { position: "sticky", top: 0, zIndex: 6, boxSizing: "border-box", background: `${K.bg}B8`, backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", borderBottom: `1px solid ${K.t1}10` } as CSSProperties;
  // dentro il contenuto (colonna con padding 16 e 14 in alto): il header si allarga a tutta la colonna
  const frostIn: CSSProperties = { ...frost, margin: "-14px -16px 0", padding: `calc(${safeTop} + 13px) 16px 14px` };
  const numStyle = (size: number, color: string = K.t1): CSSProperties => ({ fontFamily: NUM, fontWeight: 700, fontSize: size, lineHeight: `${Math.round(size * 1.05)}px`, color, fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" });

  const ICONS: Record<string, string> = {
    home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
    moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
    heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
    bolt: "M13 3 5 14h6l-1 7 9-12h-6z",
    food: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2.5 2-2.5 7 0 8v10",
    menu: "M4 7h16M4 12h16M4 17h16",
    back: "M15 5 8 12l7 7", left: "M14 6 8 12l6 6", right: "M10 6l6 6-6 6",
    info: "M12 11v6M12 7.5v.5",
    pulse: "M3 12h4l2-5 4 10 2-5h6",
    clock: "M12 7v5l3 2",
    steps: "M8 4c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 16h4v3H6zM16 8c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5z",
    flame: "M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z",
    bed: "M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 11.5a1.5 1.5 0 1 0 0-.1",
    dumbbell: "M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12",
    ball: "M5 5a10 10 0 0 1 14 14M5 5a10 10 0 0 0 14 14",
    walk: "M13 4.5a1.5 1.5 0 1 0 .1 0M10 21l2-6 3 3v3M12 15l-1-5 4 2 3 1M11 10l-3 2-1 3",
    check: "M5 12l4 4 10-10",
    cal: "M5 6h14v14H5zM5 10h14M9 4v4M15 4v4",
  };
  const ic = (name: string, color: string = K.t1, size = 20, sw = 1.8) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {name === "info" || name === "clock" || name === "ball" ? <circle cx={12} cy={12} r={9} /> : null}
      <path d={ICONS[name] ?? ICONS.pulse} />
    </svg>
  );
  const kindIcon = (k: string) => (k === "palestra" ? "dumbbell" : k === "padel" || k === "tennis" || k === "beach" ? "ball" : k === "camminata" ? "walk" : "bolt");

  const ring = (frac: number, color: string, size: number, stroke: number, center: ReactNode, glow = false, band?: [number, number] | null) => {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r, f = isNum(frac) ? clamp(frac, 0, 1) : 0;
    const rb = r - stroke / 2 - 7, Cb = 2 * Math.PI * rb;
    color = ringTone(f) ?? color;
    return (
      <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", transform: "rotate(-90deg)", filter: glow && f > 0 ? `drop-shadow(0 0 6px ${color}55)` : "none" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.track} strokeWidth={stroke} />
          {f > 0 ? <circle className="wb-fill" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - f)} style={{ "--wb-c": C } as CSSProperties} /> : null}
          {band ? <circle aria-label="Fascia obiettivo" cx={size / 2} cy={size / 2} r={rb} fill="none" stroke={K.t1} strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${Math.max(2, (clamp(band[1], 0, 1) - clamp(band[0], 0, 1)) * Cb)} ${Cb}`} strokeDashoffset={-clamp(band[0], 0, 1) * Cb} /> : null}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{center}</div>
      </div>
    );
  };
  const tri = (t: Trend | null) => {
    if (!t) return <span style={{ width: 10, flex: "0 0 auto" }} />;
    const color = t.good === null ? K.t3 : t.good ? K.up : K.warn;
    if (t.dir === "flat") return <span style={{ width: 10, height: 10, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><span style={{ width: 5, height: 5, borderRadius: 3, background: K.t3 }} /></span>;
    return <svg width={10} height={10} viewBox="0 0 10 10" style={{ flex: "0 0 auto" }}><path d={t.dir === "up" ? "M5 1 9.5 8.5H.5z" : "M5 9 9.5 1.5H.5z"} fill={color} /></svg>;
  };
  const chev = (color: string = K.t3) => ic("right", color, 16, 2.2);
  const hbar = (frac: number, color: string, h = 6) => (
    <div style={{ width: "100%", height: h, borderRadius: h / 2, background: K.track, overflow: "hidden" }}><div style={{ width: `${(isNum(frac) ? clamp(frac, 0, 1) : 0) * 100}%`, height: "100%", background: color, borderRadius: h / 2 }} /></div>
  );
  const segBar = (segs: { label: string; value: number; color: string }[], h = 10) => {
    const tot = segs.reduce((a, s) => a + (isNum(s.value) ? s.value : 0), 0);
    return (
      <div style={{ display: "flex", width: "100%", height: h, borderRadius: h / 2, overflow: "hidden", background: K.track, gap: 2 }}>
        {tot > 0 ? segs.filter((s) => s.value > 0).map((s) => <div key={s.label} style={{ width: `${(s.value / tot) * 100}%`, background: s.color }} />) : null}
      </div>
    );
  };
  const legend = (items: { label: string; color: string; text?: string }[]) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {items.map((s) => <span key={s.label} style={{ ...lbl, color: K.t2, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />{s.label}{s.text ? ` ${s.text}` : ""}</span>)}
    </div>
  );
  const sectionTitle = (t: string, right?: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12 }}>
      <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: K.t1 }}>{t}</span>{right}
    </div>
  );
  const chip = (text: string, on: boolean, onClick: () => void, key?: string) => (
    <button key={key ?? text} onClick={onClick} style={{ ...btn, flex: "0 0 auto", padding: "6px 12px", borderRadius: 999, border: `1px solid ${on ? K.t1 : K.line}`, background: on ? K.t1 : K.card, color: on ? K.bg : K.t2, fontSize: 12, lineHeight: "16px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{text}</button>
  );
  const chips = (children: ReactNode) => <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>;
  const stat = (label: string, value: string, sub?: string) => (
    <div style={{ ...card, ...st(2), padding: 12 }}><span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: K.t3 }}>{label}</span><span style={numStyle(22)}>{value}</span>{sub ? <span style={lbl}>{sub}</span> : null}</div>
  );
  const three: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 };
  const two: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 };

  // card insight con bordo sfumato viola-blu
  const insight = (text: ReactNode, link?: { label: string; onClick: () => void }) => (
    <div style={{ borderRadius: 16, padding: 1, background: `linear-gradient(135deg, ${K.inA}, ${K.inB})` }}>
      <div style={{ ...st(10), borderRadius: 15, padding: 16, background: K.mid }}>
        <span style={{ fontSize: 15, lineHeight: "21px", color: K.t1 }}>{text}</span>
        {link ? <button onClick={link.onClick} style={{ ...btn, ...caps, fontSize: 12, color: K.link, display: "flex", alignItems: "center", gap: 6 }}>{link.label}<span style={{ fontSize: 16 }}>→</span></button> : null}
      </div>
    </div>
  );

  // elenco contributori (icona · etichetta · valore · freccia vs media)
  const contribCard = (rows: Contrib[], legendText = "vs ultimi 30 giorni", notch = true) => (
    <div style={{ position: "relative", marginTop: notch ? 10 : 0 }}>
      {notch ? <div style={{ position: "absolute", top: -7, left: "50%", marginLeft: -7, width: 14, height: 14, background: K.card2, borderLeft: `1px solid ${K.line}`, borderTop: `1px solid ${K.line}`, transform: "rotate(45deg)" }} /> : null}
      <div style={{ ...card, padding: "4px 16px 14px" }}>
        {rows.map((r, i) => {
          const inner = (
            <div style={{ ...row, padding: "14px 0", borderBottom: i < rows.length - 1 ? `1px solid ${K.line}` : "none", width: "100%" }}>
              {ic(r.icon, K.t2, 20, 1.6)}
              <span style={{ ...caps, ...ell, flex: 1, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{r.label}</span>
              <span style={{ ...numStyle(18), flex: "0 0 auto" }}>{r.value}</span>
              {tri(r.trend)}
            </div>
          );
          return r.onClick ? <button key={r.label} onClick={r.onClick} style={{ ...btn, display: "block", width: "100%" }}>{inner}</button> : <div key={r.label}>{inner}</div>;
        })}
        <div style={{ ...row, gap: 6, background: K.bg, borderRadius: 8, padding: "6px 10px", marginTop: 4 }}>
          <svg width={18} height={10} viewBox="0 0 18 10" style={{ flex: "0 0 auto" }}><path d="M4 1 8 8H0z" fill={K.up} /><path d="M14 9 18 2h-8z" fill={K.warn} /></svg>
          <span style={{ fontSize: 12, color: K.t1, fontWeight: 600, flex: "0 0 auto" }}>{shortDay(d.date)}</span><span style={{ ...lbl, ...ell }}>{legendText}</span>
        </div>
      </div>
    </div>
  );

  // barre settimanali (tocca per cambiare giorno)
  const weekBars = (vals: (number | null | undefined)[], max: number, color: (v: number) => string, f: (v: number) => string, ref?: number) => {
    const W = 340, H = 168, pt = 22, pb = 34, n = days.length, bw = (W / n) * 0.52;
    const top = Math.max(max, ...nums(vals), 1);
    const y = (v: number) => pt + (1 - clamp(v / top, 0, 1)) * (H - pt - pb);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {ref !== undefined ? <line x1={0} x2={W} y1={y(ref)} y2={y(ref)} stroke={K.t3} strokeDasharray="3 4" /> : null}
        {days.map((x: Day, i: number) => {
          const v = vals[i], cx = (W / n) * (i + 0.5), on = x.date === d.date, p = parts(x.date);
          return (
            <g key={x.date} onClick={() => go(x.date)} style={{ cursor: "pointer" }}>
              <rect x={cx - W / n / 2} y={0} width={W / n} height={H} fill="transparent" />
              {isNum(v) ? <rect x={cx - bw / 2} y={y(v)} width={bw} height={Math.max(2, H - pb - y(v))} rx={3} fill={color(v)} opacity={on ? 1 : 0.55} /> : <rect x={cx - bw / 2} y={H - pb - 2} width={bw} height={2} fill={K.track} />}
              <text x={cx} y={isNum(v) ? y(v) - 6 : H - pb - 8} fontSize={11} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={700} fontFamily={NUM}>{isNum(v) ? f(v) : "—"}</text>
              <text x={cx} y={H - 18} fontSize={10} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500} letterSpacing="0.06em">{WD[p.w].toUpperCase()}</text>
              <text x={cx} y={H - 5} fontSize={11} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500}>{p.dd}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  // grafico a linee per i trend
  const smooth = (pts: [number, number][]) => {
    if (!pts.length) return "";
    let p = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2; p += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`; }
    return p;
  };
  const lines = (series: { name: string; color: string; values: (number | null | undefined)[] }[], ref?: number) => {
    const W = 340, H = 130, pl = 10, pr = 10, pt = 12, pb = 22;
    const all = series.flatMap((s) => nums(s.values)).concat(isNum(ref) ? [ref] : []);
    const lo0 = all.length ? Math.min(...all) : 0, hi0 = all.length ? Math.max(...all) : 1;
    const lo = lo0 - (hi0 - lo0) * 0.25 - 1, hi = hi0 + (hi0 - lo0) * 0.15 + 1;
    const x = (i: number) => pl + (i * (W - pl - pr)) / Math.max(days.length - 1, 1);
    const y = (v: number) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
    const step = (W - pl - pr) / Math.max(days.length - 1, 1);
    return (
      <div style={st(8)}>
        {legend(series.map((s) => ({ label: s.name, color: s.color, text: `${shortDay(d.date).toLowerCase()} ${fmt(s.values[selIdx])}` })))}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {isNum(ref) ? <line x1={pl} x2={W - pr} y1={y(ref)} y2={y(ref)} stroke={K.t3} strokeDasharray="3 4" /> : null}
          {selIdx >= 0 ? <line x1={x(selIdx)} x2={x(selIdx)} y1={pt - 6} y2={H - pb} stroke={K.t3} strokeOpacity={0.5} /> : null}
          {series.map((s) => {
            const pts: [number, number][] = s.values.map((v, i) => (isNum(v) ? [x(i), y(v)] as [number, number] : null)).filter((p): p is [number, number] => p !== null);
            return (
              <g key={s.name}>
                {pts.length > 1 ? <path d={`${smooth(pts)} L${pts[pts.length - 1][0]},${H - pb} L${pts[0][0]},${H - pb} Z`} fill={s.color} opacity={0.12} /> : null}
                {pts.length > 1 ? <path d={smooth(pts)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" /> : null}
                {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={K.bg} stroke={s.color} strokeWidth={2} />)}
              </g>
            );
          })}
          {days.map((x0: Day, i: number) => <text key={x0.date} x={x(i)} y={H - 6} fontSize={10} textAnchor="middle" fill={x0.date === d.date ? K.t1 : K.t3} fontWeight={x0.date === d.date ? 700 : 500}>{parts(x0.date).dd}</text>)}
          {days.map((x0: Day, i: number) => <rect key={`h${x0.date}`} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" style={{ cursor: "pointer" }} onClick={() => go(x0.date)} />)}
        </svg>
      </div>
    );
  };

  // ---------- valori del giorno selezionato ----------
  const dSl = sleepScore(d), dStr = strainScore(d);
  // la tua norma: ultimi 30 giorni (storico compatto + giorni della settimana); i punteggi restano sui 7 giorni
  const H30: Day[] = [...(DATA.history ?? []).map((h) => ({ workouts: [], meals: [], incomplete: false, ...h }) as unknown as Day), ...days].sort((a: Day, z: Day) => (a.date < z.date ? -1 : 1));
  const prior = (x: Day, n = 30): Day[] => H30.filter((y: Day) => y.date < x.date && y.date >= addDays(x.date, -n));
  const norm = (x: Day, f: (y: Day) => number | null | undefined, cumulative = false): number | null => avg(prior(x).filter((y: Day) => !cumulative || (y.date !== DATA.today && !y.incomplete)).map(f));
  const bandOf = (x: Day, f: (y: Day) => number | null | undefined, cumulative = false): { lo: number; hi: number; mid: number } | null => {
    const v = nums(prior(x).filter((y: Day) => !cumulative || (y.date !== DATA.today && !y.incomplete)).map(f));
    if (v.length < 6) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length, s = sdev(v) ?? 0;
    return { lo: m - s, hi: m + s, mid: m };
  };
  const inNorm = (v: number | null | undefined, b: { lo: number; hi: number } | null): boolean | null => (!isNum(v) || !b ? null : v >= b.lo && v <= b.hi);
  const spH = (y: Day) => sleepParts(y, H30);
  // SONNO: un solo numero ovunque (anello, Recupero, grafici, Life App) = la notte con il debito accumulato
  const debtOf = (date: string): number | null => sleepDebtOn(date, H30);
  const sonnoOf = (x: Day): number | null => { const s = sleepScore(x); if (s === null) return null; const db = debtOf(x.date); return db === null ? s : Math.round(s * 0.7 + clamp(100 - (db / 60) * 20, 10, 100) * 0.3); };
  const dSn = sonnoOf(d);
  const dRec = recScore(d);
  const bHrv = norm(d, (y: Day) => y.hrvMs), bRhr = norm(d, (y: Day) => y.rhr), bSleep = norm(d, (y: Day) => y.sleepMin);
  const bSlScore = norm(d, sonnoOf);
  const bSteps = norm(d, (y: Day) => y.steps, true), bAct = norm(d, (y: Day) => y.activeKcal, true);
  const bEat = baseOf(d, (y: Day) => y.eatenKcal, true), bProt = baseOf(d, (y: Day) => y.proteinG, true);
  const bCardio = baseOf(d, (y: Day) => cardioMin(y), true);
  const restorative = (x: Day) => (isNum(x.deepMin) && isNum(x.remMin) ? x.deepMin + x.remMin : null);
  const restPct = (x: Day) => { const r = restorative(x); return r !== null && isNum(x.sleepMin) && x.sleepMin > 0 ? (r / x.sleepMin) * 100 : null; };
  const allBeds = nums(days.map((x: Day) => bedRel(x.bedtime)));
  const bedAvg = avg(allBeds);
  const strainTarget = dRec === null ? null : dRec >= 67 ? "14–18" : dRec >= 34 ? "10–14" : "6–10";
  const strainRange: [number, number] | null = dRec === null ? null : dRec >= 67 ? [14, 18] : dRec >= 34 ? [10, 14] : [6, 10];

  // ---------- coach (toni calmi, mai colpevolizzanti) ----------
  const coach = (x: Day): { icon: string; t: string }[] => {
    const out: { icon: string; t: string }[] = [];
    const isLive = x.date === DATA.today, pre = isLive ? "Finora " : "";
    const wkH = baseOf(x, (y: Day) => y.hrvMs);
    if (isNum(x.proteinG)) {
      if (x.proteinG >= PT) out.push({ icon: "check", t: `Obiettivo proteine raggiunto: ${fmt(x.proteinG)} g su ${PT}.` });
      else if (x.proteinG < PT * 0.85) out.push({ icon: "food", t: `${pre}${fmt(x.proteinG)} g di proteine: ne mancano circa ${Math.round(PT - x.proteinG)} per arrivare a ${PT}. Un pasto con carne, pesce, albumi o yogurt greco aiuta.` });
    }
    const salt = dayMacro(x, "salt"), fib = dayMacro(x, "fibre"), sug = dayMacro(x, "sugar");
    if (salt.v !== null && salt.v > 5) out.push({ icon: "food", t: `Sale ${fmt(salt.v, " g")}, sopra i 5 g consigliati: nei prossimi pasti meno salumi e pane confezionato, e più acqua.` });
    if (fib.v !== null && fib.v < 30) out.push({ icon: "food", t: isLive ? `Fibre a ${fmt(fib.v, " g")} su 30: una porzione abbondante di verdura a cena chiude il gap.` : `Fibre ${fmt(fib.v, " g")} su 30 g: una porzione di verdura o frutta in più fa la differenza.` });
    if (sug.v !== null && sug.v > 50) out.push({ icon: "food", t: `Zuccheri ${fmt(sug.v, " g")}, oltre il riferimento di 50 g: niente di grave, basta tenere leggero il resto.` });
    const bl = bal(x);
    if (bl !== null && !isLive && bl > 500) out.push({ icon: "flame", t: `Surplus di ${String(Math.round(bl)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kcal: capita, conta la media della settimana.` });
    if (bl !== null && !isLive && bl < -1000) out.push({ icon: "flame", t: `Deficit ampio (${signed(bl)} kcal): utile per dimagrire, ma occhio a recupero ed energia.` });
    if (isNum(x.sleepMin) && x.sleepMin < 360) out.push({ icon: "moon", t: `${hm(x.sleepMin)} di sonno: stasera prova ad andare a letto un po' prima.` });
    const br = bedRel(x.bedtime);
    if (br !== null && br > 1440 + 60) out.push({ icon: "bed", t: `A letto alle ${clock(br)}: anticipare anche di 30 minuti aiuta sonno e recupero.` });
    if (isNum(x.hrvMs) && wkH !== null && x.hrvMs < wkH * 0.9) out.push({ icon: "heart", t: `HRV ${fmt(x.hrvMs)} ms, sotto la tua media (${fmt(wkH)}): oggi meglio un allenamento più leggero.` });
    const i0 = days.findIndex((y: Day) => y.date === x.date);
    const nextDate = days[i0 + 1]?.date ?? (() => { const p = parts(x.date); return new Date(Date.UTC(p.y, p.m - 1, p.dd + 1)).toISOString().slice(0, 10); })();
    upcoming.filter((u: Upcoming) => u.date === nextDate).forEach((u: Upcoming) => out.push({ icon: "cal", t: `Domani ${u.name} (${u.time}): carboidrati a cena, acqua e a letto presto.` }));
    upcoming.filter((u: Upcoming) => u.date === x.date).forEach((u: Upcoming) => out.push({ icon: "cal", t: `Oggi ${u.name} (${u.time}): colazione con carboidrati e bevi spesso.` }));
    if (!out.length) out.push({ icon: "check", t: x.meals.length || isNum(x.sleepMin) ? "Niente da segnalare: giornata equilibrata." : "Pochi dati per questo giorno." });
    return out;
  };
  const coachTips = coach(d);
  // consigli divisi per pagina: cibo in Nutrizione, recupero in Recupero
  const nutTips = coachTips.filter((k) => k.icon === "food" || k.icon === "flame");
  const recTips = ((): { icon: string; t: string }[] => {
    const out: { icon: string; t: string }[] = [];
    const nH = norm(d, (y: Day) => y.hrvMs), nR = norm(d, (y: Day) => y.rhr), prevD = dayOf(addDays(d.date, -1)), ps = prevD ? strainScore(prevD) : null;
    const debt = debtOf(d.date);
    const doneHard = d.date === DATA.today && isNum(dStr) && !!strainRange && dStr >= strainRange[0];
    if (dRec !== null && doneHard) out.push({ icon: "check", t: `Oggi hai già uno sforzo di ${fmt(dStr)}${strainRange && (dStr as number) > strainRange[1] ? ", sopra la fascia del tuo recupero" : ""}: il resto della giornata è recupero: acqua, un buon pasto e a letto presto.` });
    else if (dRec !== null) out.push(dRec >= 67 ? { icon: "bolt", t: "Recupero alto: è il giorno giusto per l'allenamento più impegnativo della settimana." } : dRec >= 34 ? { icon: "pulse", t: `Recupero medio: allenati pure, tenendo lo sforzo nella fascia ${strainTarget}.` } : { icon: "walk", t: "Recupero basso: oggi camminata, mobilità o stretching; l'intensità può aspettare domani." });
    const bdH = bandOf(d, (y: Day) => y.hrvMs), bdR = bandOf(d, (y: Day) => y.rhr);
    if (isNum(d.hrvMs) && nH !== null && (bdH ? d.hrvMs < bdH.lo : d.hrvMs < nH * 0.9)) out.push({ icon: "heart", t: "HRV sotto la tua norma: bevi di più, niente alcol stasera e cena non troppo tardi." });
    if (isNum(d.rhr) && nR !== null && (bdR ? d.rhr > bdR.hi : d.rhr > nR + 3)) out.push({ icon: "pulse", t: "FC a riposo sopra la tua norma: spesso è stanchezza accumulata o l'inizio di un malanno, dà priorità al riposo." });
    if (isNum(debt) && debt >= 60) out.push({ icon: "moon", t: `Hai ${debtText(debt)} di debito di sonno: è la leva più forte sul recupero di domani, il piano per stanotte è in Sonno.` });
    if (isNum(ps) && ps >= 14) out.push({ icon: "walk", t: "Ieri sforzo alto: 10 minuti di mobilità o una camminata leggera aiutano le gambe a recuperare." });
    if (!out.length || out.length === 1) out.push({ icon: "check", t: "Orari di sonno regolari e una giornata senza alcol sono quello che tiene il recupero alto." });
    return out;
  })();
  // sforzo del giorno già dentro (o sopra) la fascia del recupero: da qui il consiglio è recuperare
  const dayDone = live && isNum(dStr) && !!strainRange && dStr >= strainRange[0];
  const outlookTitle = dayDone ? "Sforzo fatto, ora recupero" : dRec === null ? "Prospettiva del giorno" : dRec >= 67 ? "Pronto a spingere" : dRec >= 34 ? "Giornata equilibrata" : "Giornata di recupero";
  const outlookText = dRec === null
    ? `Recupero non disponibile${isNum(d.sleepMin) ? "" : ": manca la notte"}. ${coachTips[0].t}`
    : `Recupero ${dRec}%: sforzo consigliato ${strainTarget}. ${dayDone ? "Lo sforzo di oggi è fatto: il resto della giornata è recupero." : dRec >= 67 ? "Il corpo è pronto a un carico importante." : dRec >= 34 ? "Allenati pure, senza strafare." : "Meglio movimento leggero e una notte lunga."}`;

  // ---------- età biologica (stima a regole) ----------
  const bio = DATA.bioAge ?? null;
  const chrono = (() => { if (!bio?.birthDate) return null; const b = parts(bio.birthDate), t = parts(DATA.today); return t.y - b.y - (t.m < b.m || (t.m === b.m && t.dd < b.dd) ? 1 : 0); })();
  const wkRhr = avg(days.map((x: Day) => x.rhr)), wkHrv = avg(days.map((x: Day) => x.hrvMs)), wkSleep = avg(days.map((x: Day) => x.sleepMin));
  const nightDays = days.filter((x: Day) => isNum(x.sleepMin));
  const fullDays = days.filter((x: Day) => !x.incomplete && x.date !== DATA.today && isNum(x.steps));
  const bioM = bioModel(DATA.days, bio, DATA.today);
  const factors: Factor[] = [...bioM.factors];
  const missing: string[] = factors.filter((f) => f.value === "da misurare").map((f) => `${f.name}: da misurare. ${f.why}`);
  {
    const L = bio?.labs ?? null, ld = bio?.labsDate ? longDate(bio.labsDate) : "—";
    const lab = (name: string, v: number | null | undefined, u: string, y: (n: number) => number, why: (n: number) => string) => { if (isNum(v)) factors.push({ name, value: `${fmt(v, u)} · esami ${ld}`, years: y(v), why: why(v) }); };
    if (L) {
      lab("Colesterolo LDL", L.ldl, " mg/dl", (n) => (n < 100 ? -0.5 : n < 130 ? 0 : n < 160 ? 0.5 : 1), (n) => (n < 100 ? "Ottimale (<100)." : "Sopra l'ottimale."));
      lab("Colesterolo HDL", L.hdl, " mg/dl", (n) => (n < 40 ? 1 : n < 60 ? 0 : -1), (n) => (n < 40 ? "Basso." : n < 60 ? "Nella norma; sopra 60 sarebbe protettivo, lo alza l'attività aerobica." : "Protettivo."));
      lab("Trigliceridi", L.tg, " mg/dl", (n) => (n < 150 ? 0 : n < 200 ? 0.5 : 1), (n) => (n < 150 ? "Nella norma." : "Alti."));
      lab("Glicemia", L.glucose, " mg/dl", (n) => (n < 100 ? 0 : n < 126 ? 1 : 2), (n) => (n < 100 ? "Nella norma." : "Sopra la norma."));
      lab("HbA1c", L.hba1c, " %", (n) => (n < 5.7 ? 0 : n < 6.5 ? 1 : 2), (n) => (n < 5.7 ? "Nella norma." : "Sopra la norma."));
      lab("Acido urico", L.uricAcid, " mg/dl", (n) => (n <= 7 ? 0 : 0.5), (n) => (n <= 7 ? "Nella norma." : "Entro il limite del laboratorio (7,7) ma nella fascia alta: carne, alcol e bevande zuccherate lo alzano, l'acqua aiuta."));
      if (typeof L.kidneyOk === "boolean") factors.push({ name: "Reni", value: L.kidneyOk ? "nella norma" : "da rivedere", years: L.kidneyOk ? 0 : null, why: L.kidneyOk ? "Nella norma." : "Parlane con il medico." });
      if (typeof L.liverOk === "boolean") factors.push({ name: "Fegato", value: L.liverOk ? "nella norma" : "da rivedere", years: L.liverOk ? 0 : null, why: L.liverOk ? "Nella norma." : "Parlane con il medico." });
      if (bio?.labsDate && daysBetween(bio.labsDate, DATA.today) > 365) missing.push(`Esami del sangue recenti (ultimi del ${longDate(bio.labsDate)})`);
    } else missing.push("Esami del sangue");
    missing.push("Pressione arteriosa");
  }
  const bioDelta = bioM.delta + factors.slice(bioM.factors.length).reduce((a, f) => a + (f.years ?? 0), 0);
  const bioAge = chrono === null ? null : Math.round((chrono + bioDelta) * 2) / 2;
  const bioDiff = bioAge !== null && chrono !== null ? Math.round((bioAge - chrono) * 2) / 2 : null;
  // per fattore solo un giudizio, mai gli anni
  const yrs = (v: number) => (v > 0 ? "da migliorare" : v < 0 ? "bene" : "nella norma");
  const drivers = [...factors].filter((f) => (f.years ?? 0) !== 0).sort((a, z) => Math.abs(z.years ?? 0) - Math.abs(a.years ?? 0));
  const blobTone: BlobTone = bioDiff === null || Math.abs(bioDiff) < 1
    ? { rimA: "#6FB3E8", rimB: "#4F8FCB", dotA: [160, 210, 248], dotB: [125, 182, 236] }
    : bioDiff < 0 ? { rimA: "#46E3A4", rimB: "#2CC98A", dotA: [125, 242, 186], dotB: [100, 228, 166] }
    : bioDiff < 2.5 ? { rimA: "#5B8FD6", rimB: "#E3B04B", dotA: [180, 208, 246], dotB: [246, 208, 115] }
    : { rimA: "#E9B949", rimB: "#C98F2A", dotA: [250, 216, 122], dotB: [240, 190, 92] };
  const ageLineColor = bioDiff === null || Math.abs(bioDiff) < 1 ? "#86C2EE" : bioDiff < 0 ? "#5FE3A8" : "#F2CC6B";
  const ageLine = bioDiff === null ? null : bioDiff === 0 ? "pari alla tua età" : `${Math.abs(bioDiff).toLocaleString("it-IT")} ${Math.abs(bioDiff) === 1 ? "anno" : "anni"} più ${bioDiff < 0 ? "giovane" : "vecchio"}`;
  const orb = (size: number) => (
    <AgeBlob size={size} tone={blobTone}>
      <span style={numStyle(Math.round(size / 4.4))}>{bioAge === null ? "—" : bioAge.toLocaleString("it-IT")}</span>
      <span style={{ ...caps, fontSize: Math.max(10, Math.round(size / 19)), lineHeight: "1.2", letterSpacing: "0.14em", color: K.t2, marginTop: 4 }}>Età biologica</span>
      {ageLine && size >= 140 ? <span style={{ fontSize: Math.round(size / 17), lineHeight: "1.2", fontWeight: 700, color: ageLineColor, marginTop: 8 }}>{ageLine}</span> : null}
    </AgeBlob>
  );

  // ---------- liste: attività e pasti ----------
  const chronoW = days.flatMap((x: Day) => x.workouts.map((w: Workout, i: number) => ({ w, date: x.date, key: `${x.date}w${i}` })));
  const allMeals = days.flatMap((x: Day) => x.meals.map((m: Meal, i: number) => ({ m, date: x.date, key: `${x.date}#${i}` })));
  const listRow = (key: string, badge: ReactNode, title: string, sub: string, onClick: () => void, last: boolean) => (
    <button key={key} onClick={onClick} style={{ ...btn, ...row, width: "100%", padding: "12px 0", borderBottom: last ? "none" : `1px solid ${K.line}` }}>
      {badge}
      <div style={{ ...st(2), flex: 1 }}>
        <span style={{ ...ell, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{title}</span>
        <span style={{ ...ell, ...lbl }}>{sub}</span>
      </div>
      {chev()}
    </button>
  );
  const box = (top: string, bottom: string, color: string, filled = true) => (
    <div style={{ width: 54, height: 44, borderRadius: 10, flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: filled ? color : "transparent", border: filled ? "none" : `1px solid ${K.line}` }}>
      <span style={numStyle(18, filled ? K.white : K.t2)}>{top}</span>
      <span style={{ ...ell, maxWidth: 50, fontSize: 9, lineHeight: "11px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: filled ? K.whiteDim : K.t3 }}>{bottom}</span>
    </div>
  );
  const actRows = (x: Day, withDate = false) => x.workouts.map((w: Workout, i: number) => {
    const s = actStrain(w), k = kindOf(w);
    const sub = [withDate ? shortDay(x.date) : "", w.time, isNum(w.durationMin) ? `${w.durationMin} min` : "", isNum(w.avgHr) ? `FC ${w.avgHr}` : "", w.status === "pianificato" ? "pianificato" : ""].filter(Boolean).join(" · ");
    return listRow(`${x.date}w${i}`, s !== null ? box(fmt(s), KIND_NAME[k] ?? "", K.strain) : box("—", KIND_NAME[k] ?? "", K.strain, false), w.name, sub, () => open({ kind: "act", key: `${x.date}w${i}` }), i === x.workouts.length - 1);
  });
  const mealRows = (x: Day) => x.meals.map((m: Meal, i: number) =>
    listRow(`${x.date}#${i}`, box(isNum(m.kcal) ? String(Math.round(m.kcal)) : "—", "kcal", K.mealBox), `${m.name} · ${m.time}`, m.dish, () => open({ kind: "meal", key: `${x.date}#${i}` }), i === x.meals.length - 1));
  const listCard = (title: string, right: ReactNode, rows: ReactNode) => (
    <div style={{ ...card, padding: "14px 16px 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={capLbl(12)}>{title}</span>{right}</div>
      <div style={st(0)}>{rows}</div>
    </div>
  );
  const upcomingCard = upcoming.length ? listCard("Prossimi impegni", <span style={lbl}>{upcoming.length}</span>, upcoming.map((u: Upcoming, i: number) => (
    <div key={i} style={{ ...row, padding: "12px 0", borderBottom: i < upcoming.length - 1 ? `1px solid ${K.line}` : "none" }}>
      <div style={{ width: 54, height: 44, borderRadius: 10, border: `1px solid ${K.line}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{ic(kindIcon(u.kind ?? ""), K.t2, 22)}</div>
      <div style={{ ...st(2), flex: 1 }}><span style={{ ...ell, fontSize: 15, fontWeight: 600, color: K.t1 }}>{u.name}</span><span style={{ ...ell, ...lbl }}>{dayTitle(u.date)} · {u.time}{u.detail ? ` · ${u.detail}` : ""}</span></div>
    </div>
  ))) : null;

  // ---------- intestazione: avatar · selettore data · aggiornamento ----------
  const activeDays = days.filter((x: Day) => x.workouts.some((w: Workout) => w.status === "fatto")).length;
  const arrowBtn = (dir: -1 | 1) => {
    const dis = dir < 0 ? selIdx <= 0 : selIdx >= days.length - 1;
    return <button onClick={() => shift(dir)} disabled={dis} style={{ ...btn, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", opacity: dis ? 0.3 : 1 }}>{ic(dir < 0 ? "left" : "right", K.t1, 18, 2.2)}</button>;
  };
  const datePill = (
    <div style={{ ...row, gap: 2, background: K.card2, border: `1px solid ${K.line}`, borderRadius: 999, padding: "0 4px" }}>
      {arrowBtn(-1)}
      <button onClick={() => setCal(!cal)} style={{ ...btn, ...caps, fontSize: 12, padding: "6px 8px", color: K.t1, minWidth: 64, textAlign: "center" }}>{live ? "Oggi" : shortDay(d.date)}</button>
      {arrowBtn(1)}
    </div>
  );
  const calendar = cal ? (
    <div style={{ ...card, padding: 10, display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
      {days.map((x: Day) => {
        const p = parts(x.date), on = x.date === d.date, rc = recScore(x);
        return (
          <button key={x.date} onClick={() => go(x.date)} style={{ ...btn, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 0", borderRadius: 10, background: on ? K.t1 : "transparent" }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: on ? K.bg : K.t3 }}>{WD[p.w].toUpperCase()}</span>
            <span style={numStyle(18, on ? K.bg : K.t1)}>{p.dd}</span>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: rc === null ? K.track : recColor(rc) }} />
          </button>
        );
      })}
    </div>
  ) : null;
  const header = (
    <div style={st(10)}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
        <div style={{ ...row, gap: 8 }}>
          {AVATAR ? (
            <div style={{ width: 34, height: 34, borderRadius: 17, padding: 1.5, boxSizing: "border-box", background: `linear-gradient(135deg, ${K.inA}, ${K.inB})`, flex: "0 0 auto" }}>
              <img src={AVATAR} alt="" width={31} height={31} style={{ display: "block", width: 31, height: 31, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${K.bg}`, boxSizing: "border-box" }} />
            </div>
          ) : <div style={{ width: 32, height: 32, borderRadius: 16, background: `linear-gradient(135deg, ${K.inA}, ${K.inB})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: K.white, flex: "0 0 auto" }}>D</div>}
          <span style={{ ...row, gap: 2, fontSize: 13, fontWeight: 700, color: K.t1 }}>{ic("flame", K.warn, 16, 2)}{activeDays}</span>
        </div>
        {datePill}
        <span style={{ ...lbl, textAlign: "right", display: "inline-flex", alignItems: "center", gap: 8 }}>{battBadge}<span>agg. {time}</span></span>
      </div>
      {calendar}
    </div>
  );

  // ---------- quadranti ----------
  const dialMeta: Record<DialId, { name: string; v: number | null; frac: number; color: string; unit: string }> = {
    sonno: { name: "Sonno", v: dSn, frac: (dSn ?? 0) / 100, color: K.sleep, unit: "" },
    recupero: { name: "Recupero", v: dRec, frac: (dRec ?? 0) / 100, color: recColor(dRec), unit: "%" },
    sforzo: { name: "Sforzo", v: dStr, frac: (dStr ?? 0) / 21, color: K.strain, unit: "" },
  };
  const smallDial = (id: DialId) => {
    const m = dialMeta[id];
    return (
      <button key={id} onClick={() => open({ kind: "dial", id })} style={{ ...btn, ...st(10), alignItems: "center" }}>
        {ring(m.frac, m.color, 98, 7, <span style={numStyle(28, m.v === null ? K.t3 : K.t1)}>{m.v === null ? "—" : m.v.toLocaleString("it-IT")}{m.v !== null && m.unit ? <span style={{ fontSize: 16 }}>{m.unit}</span> : null}</span>, true)}
        <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t1, display: "flex", alignItems: "center", gap: 2 }}>{m.name}{ic("right", K.t2, 12, 2.4)}</span>
      </button>
    );
  };

  // ---------- statistiche chiave ----------
  const keyStats: Contrib[] = [
    { icon: "heart", label: "HRV", value: fmt(d.hrvMs, " ms"), trend: trendOf(d.hrvMs, bHrv, true), onClick: () => open({ kind: "dial", id: "recupero" }) },
    { icon: "pulse", label: "FC a riposo", value: fmt(d.rhr, " bpm"), trend: trendOf(d.rhr, bRhr, false), onClick: () => open({ kind: "dial", id: "recupero" }) },
    { icon: "moon", label: "Ore di sonno", value: hm(d.sleepMin), trend: trendOf(d.sleepMin, bSleep, true), onClick: () => open({ kind: "dial", id: "sonno" }) },
    { icon: "bed", label: "Profondo + REM", value: hm(restorative(d)), trend: trendOf(restorative(d), norm(d, restorative), true), onClick: () => open({ kind: "dial", id: "sonno" }) },
    { icon: "steps", label: "Passi", value: fmt(d.steps), trend: trendOf(d.steps, bSteps, true), onClick: () => open({ kind: "dial", id: "sforzo" }) },
    { icon: "flame", label: "Calorie attive", value: fmt(d.activeKcal), trend: trendOf(d.activeKcal, bAct, true), onClick: () => open({ kind: "dial", id: "sforzo" }) },
    { icon: "food", label: "Calorie mangiate", value: fmt(d.eatenKcal), trend: trendOf(d.eatenKcal, bEat, null), onClick: () => goTab("nutrizione") },
    { icon: "food", label: "Proteine", value: fmt(d.proteinG, " g"), trend: trendOf(d.proteinG, bProt, true), onClick: () => goTab("nutrizione") },
    { icon: "flame", label: live ? "Bilancio kcal finora" : "Bilancio kcal", value: signed(bal(d)), trend: null, onClick: () => goTab("nutrizione") },
  ];

  // monitor salute: quante metriche sono nella tua norma
  const rp = restPct(d);
  // monitor salute: i segnali della notte confrontati con la tua norma (media degli altri giorni)
  const bBr = norm(d, (y: Day) => y.breathing), bSp = norm(d, (y: Day) => y.spo2);
  const monRows: { name: string; value: string; ok: boolean | null; off: string }[] = [
    { name: "HRV", value: fmt(d.hrvMs, " ms"), ok: isNum(d.hrvMs) && bHrv !== null ? d.hrvMs >= bHrv * 0.85 : null, off: "più bassa del solito" },
    { name: "FC a riposo", value: fmt(d.rhr, " bpm"), ok: isNum(d.rhr) && bRhr !== null ? d.rhr <= bRhr + 3 : null, off: "più alta del solito" },
    { name: "Respirazione", value: fmt(d.breathing, " respiri/min"), ok: isNum(d.breathing) && bBr !== null ? Math.abs(d.breathing - bBr) <= 1 : null, off: "diversa dal solito" },
    { name: "Ossigeno nel sonno", value: fmt(d.spo2, "%"), ok: isNum(d.spo2) && bSp !== null ? d.spo2 >= bSp - 1 : null, off: "più basso del solito" },
    { name: "Temperatura pelle", value: isNum(d.tempDev) ? `${d.tempDev > 0 ? "+" : d.tempDev < 0 ? "−" : "±"}${fmt(Math.abs(d.tempDev), " °C")}` : "—", ok: isNum(d.tempDev) ? Math.abs(d.tempDev) <= 0.5 : null, off: "fuori dal solito" },
  ];
  const monitor = monRows.map((m) => m.ok).filter((v): v is boolean => v !== null);
  const monOk = monitor.filter(Boolean).length;
  const monAll = monitor.length > 0 && monOk === monitor.length;
  const monOff = monRows.filter((m) => m.ok === false);
  const monHead = !monitor.length ? "Dati della notte in arrivo" : monAll ? "Tutto nella norma" : monOff.length >= 2 ? "Diversi segnali fuori norma" : "Un segnale da osservare";
  const monTip = !monitor.length ? "Servono le misure della notte dall'orologio." : monAll ? "I segnali della notte sono nei tuoi valori abituali."
    : monOff.length >= 2 ? `${monOff.map((m) => `${m.name.toLowerCase()} ${m.off}`).join(", ")}: è come si presenta spesso l'inizio di un malanno, o tanto stress. Oggi riposo, acqua e a letto presto; se domani è ancora così, ascolta il corpo.`
    : `${monOff[0].name} ${monOff[0].off}: da sola non preoccupa, può dipendere da alcol, cena tardi o un allenamento duro. Guardala domani.`;
  const monCol = !monitor.length ? K.t3 : monAll ? K.up : K.warn;
  const monitorFull = (
    <div style={{ ...card, ...st(10) }} aria-label="Monitor salute">
      <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>Monitor salute</span><span style={lbl}>{monitor.length ? `${monOk}/${monitor.length} nella norma` : ""}</span></div>
      <span style={{ fontSize: 17, fontWeight: 700, color: monCol }}>{monHead}</span>
      <div style={{ ...st(0) }}>
        {monRows.map((m, i) => (
          <div key={m.name} style={{ ...row, justifyContent: "space-between", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${K.line}` : "none" }}>
            <div style={{ ...st(0), minWidth: 0 }}><span style={{ ...caps, ...ell, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{m.name}</span><span style={{ ...lbl, ...ell }}>{m.value}</span></div>
            <span style={{ ...caps, fontSize: 11, whiteSpace: "nowrap", flex: "0 0 auto", color: m.ok === null ? K.t3 : m.ok ? K.up : K.warn }}>{m.ok === null ? "—" : m.ok ? "nella norma" : "da osservare"}</span>
          </div>
        ))}
      </div>
      <span style={txt}>{monTip}</span>
    </div>
  );
  const monitorLine = (
    <button onClick={() => goTab("biologia")} aria-label="Monitor salute" style={{ ...btn, ...card, ...row, padding: "14px 16px" }}>
      <div style={{ width: 26, height: 26, borderRadius: 6, background: `${monCol}26`, border: `1px solid ${monCol}66`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{ic(monAll ? "check" : "heart", monCol, 14, 2.4)}</div>
      <div style={{ ...st(2), flex: 1, minWidth: 0 }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>Monitor salute</span><span style={lbl}>{monHead}{monitor.length ? ` · ${monOk}/${monitor.length}` : ""}</span></div>
      {chev(K.t1)}
    </button>
  );
  const halfCard = (title: string, onClick: () => void, badge: ReactNode, line1: string, line1Color: string, line2: string) => (
    <button onClick={onClick} style={{ ...btn, ...card, ...st(10), padding: 14 }}>
      <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}><span style={ell}>{title}</span>{ic("right", K.t1, 14, 2.4)}</span>
      <div style={{ ...row, gap: 10 }}>
        {badge}
        <div style={st(0)}><span style={{ ...caps, ...ell, fontSize: 11, color: line1Color }}>{line1}</span><span style={{ ...ell, ...lbl }}>{line2}</span></div>
      </div>
    </button>
  );
  const sqBadge = (content: ReactNode, color: string) => <div style={{ width: 26, height: 26, borderRadius: 6, background: `${color}26`, border: `1px solid ${color}66`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", color, fontSize: 11, fontWeight: 700 }}>{content}</div>;

  // ---------- ora locale, dal vivo ----------
  const romeNow = (): { date: string; min: number } => {
    try {
      const p: Record<string, string> = {};
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date()).forEach((x: { type: string; value: string }) => { p[x.type] = x.value; });
      return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
    } catch (e) { const n = new Date(); return { date: DATA.today, min: n.getHours() * 60 + n.getMinutes() }; }
  };
  const [now, setNow] = useState<{ date: string; min: number }>(romeNow());
  useEffect(() => {
    let hiddenAt = 0;
    const tick = () => setNow(romeNow());
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (romeISO() !== LOAD_DAY) { location.reload(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) go(DATA.today);
      tick();
    };
    const t = setInterval(() => { if (romeISO() !== LOAD_DAY && !document.hidden) location.reload(); else tick(); }, 20000);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  const WDL = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const dayWord = (date: string) => { const p = parts(date); return date === now.date ? "oggi" : date === addDays(now.date, 1) ? "domani" : `${WDL[p.w]} ${p.dd}`; };
  const dur = (m: number) => { const r = Math.max(0, Math.round(m)), h = Math.floor(r / 60), mm = r % 60; return h ? `${h} h ${String(mm).padStart(2, "0")} min` : `${mm} min`; };

  // ---------- impegni (prossimi + pianificati) ----------
  type Plan = { date: string; time: string; name: string; kind: string | null; detail: string | null; partners: string | null };
  const isMatch = (kind: string | null | undefined, name: string) => kind === "padel" || kind === "tennis" || kind === "beach" || /torneo|partita|match|beach/i.test(name);
  const isGym = (k: string | null | undefined) => k === "grid" || k === "palestra";
  const plansOn = (date: string, all = false): Plan[] => {
    const out: Plan[] = [];
    (DATA.upcoming ?? []).filter((u: Upcoming) => u.date === date && (all || !doneOf(u))).forEach((u: Upcoming) => out.push({ date, time: u.time, name: u.name, kind: u.kind ?? null, detail: u.detail ?? null, partners: u.partners ?? null }));
    (dayOf(date)?.workouts ?? []).filter((w: Workout) => w.status === "pianificato").forEach((w: Workout) => {
      if (!out.some((o) => o.name === w.name || (o.time === w.time && isMatch(o.kind, o.name) === isMatch(kindOf(w), w.name)))) out.push({ date, time: w.time, name: w.name, kind: kindOf(w), detail: w.detail ?? null, partners: w.partners ?? null });
    });
    return out.sort((a, b) => (toMin(a.time) ?? 1440) - (toMin(b.time) ?? 1440));
  };
  const matchesOn = (date: string): Plan[] => plansOn(date, true).filter((p) => isMatch(p.kind, p.name));

  // ---------- piano della sera ----------
  const DEFAULT_WAKE = 480;
  const firstOn = (date: string): { t: number; title: string } | null => {
    const c: { t: number; title: string }[] = [];
    const tf = DATA.tomorrowFirst;
    if (tf && (tf.date ?? addDays(DATA.today, 1)) === date) { const t = toMin(tf.time); if (t !== null) c.push({ t, title: tf.title }); }
    plansOn(date).forEach((p) => { const t = /\d/.test(p.time) ? toMin(p.time) : null; if (t !== null) c.push({ t, title: p.name }); });
    return c.sort((a, b) => a.t - b.t)[0] ?? null;
  };
  const planFor = (date: string) => {
    const n = sleepNeed(date), f = firstOn(date);
    const wake = f ? Math.max(330, Math.min(DEFAULT_WAKE, f.t - 90)) : DEFAULT_WAKE;
    return { ...n, wake, bedBy: Math.floor((wake - n.need - 15) / 5) * 5, bedBy85: Math.floor((wake - 0.85 * n.need - 15) / 5) * 5, ev: f ? { name: f.title, time: clock(f.t) } : null };
  };
  const relBed = (m: number) => { const v = ((Math.round(m) % 1440) + 1440) % 1440; return v < 720 ? v + 1440 : v; };
  const nightTarget = (x: Day): number | null => { const bt = toMin(x.bedTarget); if (bt !== null) return relBed(bt); return x.bedtime ? relBed(planFor(x.date).bedBy) : null; };
  const onTarget = (x: Day): boolean | null => { const b = bedRel(x.bedtime), t = nightTarget(x); return b === null || t === null ? null : b <= t + 30; };
  const bedStreak = (() => {
    let n = 0;
    for (let i = days.length - 1; i >= 0; i--) { const o = onTarget(days[i]); if (o === null) { if (i === days.length - 1) continue; break; } if (!o) break; n++; }
    return n;
  })();
  const streakTxt = (n: number) => `${n} ${n === 1 ? "notte" : "notti"} di fila nell'obiettivo`;
  const eveNight = now.min >= 1260 ? addDays(now.date, 1) : now.min < 300 ? now.date : null;
  const eve = eveNight && daysBetween(DATA.today, eveNight) <= 2 ? planFor(eveNight) : null;
  const eveLeft = eve && eveNight ? eve.bedBy - (now.date === eveNight ? now.min : now.min - 1440) : 0;
  const stanotteCard = eve ? (
    <button onClick={() => open({ kind: "dial", id: "sonno" })} style={{ ...btn, borderRadius: 16, padding: 1, background: `linear-gradient(135deg, ${K.inA}, ${K.inB})` }}>
      <div style={{ ...st(10), borderRadius: 15, padding: 16, background: K.mid }}>
        <div style={{ ...row, justifyContent: "space-between" }}>
          <span style={{ ...row, gap: 8 }}>{ic("moon", K.sleep, 18)}<span style={capLbl(12)}>Stanotte</span></span>
          {bedStreak > 0 ? <span style={{ ...lbl, fontWeight: 700, color: K.up }}>{streakTxt(bedStreak)}</span> : chev(K.t1)}
        </div>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={st(2)}><span style={lbl}>A letto entro</span><span style={numStyle(44, K.sleep)}>{clock(eve.bedBy)}</span></div>
          <div style={{ ...st(2), alignItems: "flex-end" }}><span style={lbl}>{eveLeft > 0 ? "Mancano" : "Adesso"}</span><span style={numStyle(28)}>{eveLeft > 0 ? dur(eveLeft) : "a letto"}</span></div>
        </div>
        {hbar(eveLeft > 0 ? 1 - clamp(eveLeft / 180, 0, 1) : 1, K.sleep, 4)}
        <span style={txt}>{`Ti servono ${hm(eve.need)} · sveglia alle ${clock(eve.wake)}${eve.ev ? ` per ${eve.ev.name} alle ${eve.ev.time}` : ""}. Al minimo (${hm(0.85 * eve.need)}) entro le ${clock(eve.bedBy85)}.`}</span>
        <span style={lbl}>{eveLeft > 60 ? "Luci basse e schermi giù mezz'ora prima aiutano ad addormentarsi." : eveLeft > 0 ? "È il momento di rallentare: luci basse, telefono lontano dal letto." : eveLeft > -30 ? "Sei in tempo: buona notte." : "Anche adesso va bene: ogni minuto di sonno in più conta."}</span>
      </div>
    </button>
  ) : null;
  const lastNight = days[days.length - 1];
  const lnTarget = lastNight ? nightTarget(lastNight) : null, lnBed = lastNight ? bedRel(lastNight.bedtime) : null;
  const lnOk = lnTarget !== null && lnBed !== null && lnBed <= lnTarget + 30;
  const morningCard = !eveNight && now.date === DATA.today && lastNight && lastNight.date === DATA.today && now.min < 960 && lnTarget !== null && lnBed !== null ? (
    <button onClick={() => open({ kind: "dial", id: "sonno" })} style={{ ...btn, ...card, ...row, padding: "14px 16px" }}>
      {sqBadge(ic(lnOk ? "check" : "moon", lnOk ? K.up : K.sleep, 14, 2.4), lnOk ? K.up : K.sleep)}
      <div style={{ ...st(2), flex: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: K.t1 }}>{`A letto alle ${clock(lnBed)}, obiettivo ${clock(lnTarget)}`}</span>
        <span style={lbl}>{bedStreak > 0 ? streakTxt(bedStreak) : "Stasera si riparte, con calma."}</span>
      </div>
      {chev(K.t1)}
    </button>
  ) : null;

  // ---------- proteine guidate ----------
  type PFood = { name: string; portion: string; p: number; kcal: number };
  const proteinPlan = (have: number): { gap: number; items: PFood[]; p: number; kcal: number } | null => {
    const gap = PT - have;
    if (gap <= 0) return null;
    const F = PROTEIN_FOODS, combos: PFood[][] = [];
    for (let i = 0; i < F.length; i++) { combos.push([F[i]]); for (let j = i + 1; j < F.length; j++) { combos.push([F[i], F[j]]); for (let k = j + 1; k < F.length; k++) combos.push([F[i], F[j], F[k]]); } }
    const sc = combos.map((items) => ({ items, p: sum(items.map((f) => f.p)), kcal: sum(items.map((f) => f.kcal)) }));
    const ok = sc.filter((c) => c.p >= gap).sort((a, z) => a.kcal - z.kcal || a.items.length - z.items.length);
    const best = ok[0] ?? sc.sort((a, z) => z.p - a.p || a.kcal - z.kcal)[0];
    return best ? { gap, ...best } : null;
  };
  const tDay = dayOf(DATA.today);
  const pPlan = live ? proteinPlan(isNum(d.proteinG) ? d.proteinG : 0) : null;
  const proteinTip = pPlan ? (
    <div style={{ ...st(8), background: K.bg, borderRadius: 12, padding: 12 }}>
      <span style={{ ...lbl, color: K.t2 }}>{`Mancano ${Math.round(pPlan.gap)} g. Per esempio:`}</span>
      {pPlan.items.map((f) => (
        <div key={f.name} style={{ ...row, justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...txt, ...ell, color: K.t1, flex: 1 }}>{`${f.name} · ${f.portion}`}</span><span style={numStyle(16, K.violet)}>{`+${f.p} g`}</span>
        </div>
      ))}
      <span style={lbl}>{`Così arrivi a ${Math.round((isNum(d.proteinG) ? d.proteinG : 0) + pPlan.p)}/${PT} g.`}</span>
    </div>
  ) : null;
  const homeProtein = pPlan && d.meals.length ? (
    <button onClick={() => goTab("nutrizione")} style={{ ...btn, ...card, ...row, padding: "14px 16px" }}>
      {sqBadge(ic("food", K.violet, 14, 2.2), K.violet)}
      <div style={{ ...st(2), flex: 1 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: K.t1 }}>{`Mancano ${Math.round(pPlan.gap)} g di proteine`}</span>
        <span style={{ ...lbl, ...ell }}>{pPlan.items.map((f) => `${f.name} ${f.portion}`).join(" + ")}</span>
      </div>
      {chev(K.t1)}
    </button>
  ) : null;

  // ---------- settimana palestra + sport ----------
  const weekStart = addDays(DATA.today, -((parts(DATA.today).w + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDates[6];
  const SG = DATA.sportWeeklyGoal ?? null;
  const sportKinds = SG && SG.kinds.length ? SG.kinds : ["padel", "beach"];
  const sportLabel = sportKinds.map((k) => (k === "beach" ? "beach" : (KIND_NAME[k] ?? k).toLowerCase())).join("/").replace(/^./, (c) => c.toUpperCase());
  const sportKindOf = (kind: string | null | undefined, name: string): string | null => {
    if (/beach/i.test(name) || kind === "beach") return "beach";
    if (/padel/i.test(name) || kind === "padel" || (/torneo/i.test(name) && (!kind || kind === "sport" || kind === "palestra"))) return "padel";
    return kind === "tennis" || /tennis/i.test(name) ? "tennis" : null;
  };
  const isGoalSport = (kind: string | null | undefined, name: string) => { const k = sportKindOf(kind, name); return k !== null && sportKinds.includes(k); };
  const gymDone = (date: string) => (dayOf(date)?.workouts ?? []).filter((w: Workout) => w.status === "fatto" && isGym(kindOf(w))).length;
  const gymPlanned = (date: string) => plansOn(date).filter((p) => isGym(p.kind) && !isMatch(p.kind, p.name)).length;
  const sportDone = (date: string) => (dayOf(date)?.workouts ?? []).filter((w: Workout) => w.status === "fatto" && isGoalSport(kindOf(w), w.name)).length;
  const sportPlanned = (date: string) => (sportDone(date) ? 0 : plansOn(date).filter((p) => isGoalSport(p.kind, p.name)).length);
  const sportOn = (date: string) => matchesOn(date).length > 0 || (dayOf(date)?.workouts ?? []).some((w: Workout) => w.status === "fatto" && ["padel", "tennis", "sport", "beach"].includes(kindOf(w)));
  const gymWeek = sum(weekDates.map(gymDone)), gymPend = sum(weekDates.filter((x) => x >= DATA.today).map(gymPlanned));
  const sportWeek = sum(weekDates.map(sportDone)), sportPend = sum(weekDates.filter((x) => x >= DATA.today).map(sportPlanned));
  const gymGoal = isNum(DATA.gymWeeklyGoal) && DATA.gymWeeklyGoal > 0 ? DATA.gymWeeklyGoal : null;
  const sportGoal = SG && isNum(SG.count) && SG.count > 0 ? SG.count : null;
  // sforzo consigliato oggi: recupero di oggi + obiettivi della settimana + sessioni in programma (solo il consiglio, mai il calcolo)
  const effortTip = (() => {
    if (dRec === null || d.date !== DATA.today || !strainTarget) return null;
    const T = DATA.today, tmr = addDays(T, 1), hi = dRec >= 67, mid = dRec >= 34;
    const todayP = plansOn(T), doneT = (dayOf(T)?.workouts ?? []).filter((w: Workout) => w.status === "fatto");
    const gymToday = todayP.some((p) => isGym(p.kind) && !isMatch(p.kind, p.name)) || doneT.some((w: Workout) => isGym(kindOf(w)));
    const sportT = todayP.find((p) => isGoalSport(p.kind, p.name) || isMatch(p.kind, p.name));
    const matchTmr = matchesOn(tmr)[0] ?? null;
    const daysLeft = weekDates.filter((x) => x > T).length;
    const gymNeed = gymGoal ? Math.max(0, gymGoal - gymWeek - sum(weekDates.filter((x) => x > T).map(gymPlanned))) : 0;
    const sportNeed = sportGoal ? Math.max(0, sportGoal - sportWeek - sportPend) : 0;
    const sName = sportT ? (sportKindOf(sportT.kind, sportT.name) === "beach" ? "beach" : "padel") : sportLabel.toLowerCase();
    const out: string[] = [];
    const doneSport = doneT.find((w: Workout) => isGoalSport(kindOf(w), w.name) || isMatch(kindOf(w), w.name)) ?? null;
    const tD = dayOf(T), dS = tD ? strainScore(tD) : null, reached = isNum(dS) && !!strainRange && dS >= strainRange[0], above = reached && !!strainRange && (dS as number) > strainRange[1];
    if (doneT.some((w: Workout) => isGym(kindOf(w)))) out.push(hi && !matchTmr && !reached ? "forza già fatta, c'è ancora margine per una camminata" : "forza già fatta, per oggi basta carichi");
    else if (gymToday) out.push(hi ? "palestra sì, a pieno carico" : mid ? "palestra sì, carichi soliti" : "palestra leggera, carichi un po' più bassi");
    else if (!reached && gymNeed > 0 && mid && !matchTmr) out.push(gymNeed >= daysLeft ? "palestra sì, serve per l'obiettivo della settimana" : "palestra sì se hai tempo");
    else if (!reached && gymNeed > 0 && !mid) out.push("palestra rimandata a domani");
    if (doneSport) { const ss = actStrain(doneSport); out.push(`${doneSport.name.toLowerCase()} fatto${ss !== null ? `, sforzo ${fmt(ss)}` : ""}`); }
    else if (sportT) out.push(hi ? `${sName} a tutta` : mid ? `${sName} tranquillo` : `${sName} leggero`);
    else if (!reached && sportNeed > 0 && mid && !gymToday) out.push(`${sName} se riesci, ti manca questa settimana`);
    if (!out.length) out.push(reached ? "sforzo di oggi già fatto" : hi ? "giornata buona per spingere" : mid ? "movimento normale, niente di estremo" : "camminata e stretching, niente carichi");
    const tail = above ? " Sei sopra la fascia del tuo recupero: per oggi basta, ora acqua, un buon pasto e a letto presto."
      : reached ? " La fascia di oggi è raggiunta: il resto della giornata è recupero."
      : matchTmr ? ` Domani c'è ${matchTmr.name}: oggi non arrivare in cima alla fascia.` : !mid ? " Il corpo chiede recupero: una notte lunga vale più di un allenamento." : "";
    const goals = [gymGoal ? `palestra ${gymWeek}/${gymGoal}` : null, sportGoal ? `${sportLabel.toLowerCase()} ${sportWeek}/${sportGoal}` : null].filter(Boolean).join(" · ");
    return { range: strainTarget, head: out.join(", "), text: `${out.join(", ").replace(/^./, (c) => c.toUpperCase())}.${tail}`, goals };
  })();
  const outlookFull = effortTip && !dayDone ? `${outlookText} Oggi: ${effortTip.head}.` : outlookText;
  const effortCard = effortTip ? (
    <div style={{ ...card, ...st(8) }} aria-label="Sforzo consigliato oggi">
      <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>Sforzo consigliato oggi</span><span style={{ ...lbl, color: K.strain, fontWeight: 700 }}>{`fascia ${effortTip.range}`}</span></div>
      <span style={txt}>{effortTip.text}</span>
    </div>
  ) : null;
  const nextGymText = (() => {
    const tRec = tDay ? recScore(tDay) : null;
    const out: string[] = [];
    const gymMet = gymGoal !== null && gymWeek >= gymGoal, sportMet = sportGoal !== null && sportWeek >= sportGoal;
    if (gymMet) out.push(`Obiettivo palestra raggiunto: da qui a domenica solo se ti va.`);
    else {
      const need = gymGoal !== null ? gymGoal - gymWeek : null;
      const ahead = Array.from({ length: 7 }, (_, i) => addDays(DATA.today, i + 1)).filter((x) => gymGoal === null || x <= weekEnd);
      const todayOk = now.date === DATA.today && gymDone(DATA.today) === 0 && !matchesOn(DATA.today).length && now.min < 1200 && (tRec === null || tRec >= 50);
      const planned = ahead.find((x) => gymPlanned(x) > 0);
      const free = ahead.filter((x) => !matchesOn(x).length);
      const good = free.find((x) => !matchesOn(addDays(x, -1)).length) ?? free[0];
      const pre = need !== null ? `${need === 1 ? "Manca 1 sessione" : `Mancano ${need} sessioni`} di palestra: ` : "";
      if (todayOk) out.push(`${pre}${tRec !== null ? `recupero ${tRec}%, ` : ""}oggi è un buon giorno, se ti va.`);
      else if (planned) out.push(`${pre}la prossima in programma è ${dayWord(planned)}.`);
      else if (good) out.push(`${pre}il prossimo buon giorno è ${dayWord(good)}.`);
      else out.push(need !== null ? "La settimana è quasi finita: da lunedì si riparte con calma." : "Settimana piena di partite: la palestra può aspettare.");
    }
    if (sportGoal !== null && !sportMet) {
      const nextS = weekDates.find((x) => x >= DATA.today && sportPlanned(x) > 0);
      out.push(nextS ? `${plansOn(nextS).find((p) => isGoalSport(p.kind, p.name))?.name ?? sportLabel} ${dayWord(nextS)}: con quella arrivi all'obiettivo ${sportLabel.toLowerCase()}.` : `Per ${sportLabel.toLowerCase()} c'è tempo fino a domenica.`);
    }
    return out.join(" ");
  })();
  const goalRow = (icon: string, label: string, done: number, goal: number | null, pend: number, color: string) => {
    const met = goal !== null && done >= goal;
    return (
      <div style={st(6)}>
        <div style={{ ...row, justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...row, gap: 8, ...caps, fontSize: 12, color: K.t1 }}>{ic(icon, color, 18)}{label}</span>
          <span style={{ ...row, gap: 6 }}>
            {pend > 0 && !met ? <span style={lbl}>{`+${pend} in programma`}</span> : null}
            <span style={numStyle(20, met ? K.up : K.t1)}>{goal !== null ? `${done} su ${goal}` : `${done}`}</span>
            {met ? ic("check", K.up, 16, 2.6) : null}
          </span>
        </div>
        {goal !== null ? (
          <div style={{ position: "relative", width: "100%", height: 6, borderRadius: 3, background: K.track, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${clamp((done + pend) / goal, 0, 1) * 100}%`, background: `${color}55`, borderRadius: 3 }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${clamp(done / goal, 0, 1) * 100}%`, background: met ? K.up : color, borderRadius: 3 }} />
          </div>
        ) : null}
      </div>
    );
  };
  const gymCard = (
    <div style={{ ...card, ...st(12) }}>
      <span style={capLbl(12)}>Obiettivi della settimana</span>
      {goalRow("dumbbell", "Palestra", gymWeek, gymGoal, gymPend, K.strain)}
      {goalRow("ball", sportLabel, sportWeek, sportGoal, sportPend, K.teal)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 2, marginTop: 2 }}>
        {weekDates.map((x) => {
          const p = parts(x), dn = gymDone(x), pl = x >= DATA.today ? gymPlanned(x) : 0, sd = sportDone(x), spl = x >= DATA.today ? sportPlanned(x) : 0, isT = x === DATA.today;
          return (
            <div key={x} style={{ ...st(5), alignItems: "center" }}>
              <span style={{ ...caps, fontSize: 10, lineHeight: "12px", letterSpacing: "0.06em", color: isT ? K.t1 : K.t3 }}>{WD[p.w]}</span>
              <div style={{ width: 34, height: 34, boxSizing: "border-box", borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: dn ? K.strain : "transparent", border: dn ? "none" : `1.5px ${pl ? "dashed" : "solid"} ${pl ? K.strain : isT ? K.t2 : K.line}` }}>
                {dn > 1 ? <span style={numStyle(16, K.white)}>{dn}</span> : dn ? ic("dumbbell", K.white, 18, 2) : pl ? ic("dumbbell", K.strain, 16, 1.8) : null}
              </div>
              <div style={{ width: 22, height: 22, boxSizing: "border-box", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: sd ? K.teal : "transparent", border: sd ? "none" : spl ? `1.5px dashed ${K.teal}` : "none" }}>
                {sd ? ic("ball", K.bg, 14, 2) : spl ? ic("ball", K.teal, 12, 1.8) : sportOn(x) ? ic("ball", K.t3, 12, 1.6) : null}
              </div>
              <span style={{ fontSize: 11, lineHeight: "14px", color: isT ? K.t1 : K.t3, fontWeight: isT ? 700 : 500 }}>{p.dd}</span>
            </div>
          );
        })}
      </div>
      {legend([{ label: "Palestra", color: K.strain }, { label: sportLabel, color: K.teal }, { label: "In programma", color: K.t3 }])}
      <span style={txt}>{nextGymText}</span>
      {gymGoal === null && sportGoal === null ? <span style={lbl}>Imposta un obiettivo settimanale: dillo a {COACH}.</span> : null}
    </div>
  );
  const goalChip = (icon: string, label: string, done: number, goal: number | null, color: string) => {
    if (goal === null) return null;
    const met = done >= goal;
    return (
      <span style={{ ...row, gap: 6, flex: "0 0 auto" }}>
        <span aria-label={label} style={{ display: "flex" }}>{ic(icon, met ? K.up : color, 16, 2)}</span>
        <span style={numStyle(16, met ? K.up : K.t1)}>{`${done}/${goal}`}</span>{met ? ic("check", K.up, 13, 2.8) : null}
      </span>
    );
  };
  const homeGoals = gymGoal !== null || sportGoal !== null ? (
    <button onClick={() => goTab("sforzo")} style={{ ...btn, ...card, ...row, padding: "12px 16px", gap: 10 }}>
      <span style={{ ...caps, fontSize: 11, color: K.t1, flex: "0 0 auto", marginRight: 6 }}>Obiettivi settimana</span>
      {goalChip("dumbbell", "Palestra", gymWeek, gymGoal, K.strain)}
      {goalChip("ball", sportLabel, sportWeek, sportGoal, K.teal)}
      <span style={{ flex: 1 }} />{chev(K.t1)}
    </button>
  ) : null;

  // =================== FITNESS (la vista del coach) ===================
  // DATA.coach (se c'è) vince sul verdetto scritto dai dati
  const fitWeek = weekDates.flatMap((x) => (dayOf(x)?.workouts ?? []).map((w: Workout, i: number) => ({ w, date: x, key: `${x}w${i}` }))).filter((e) => e.w.status === "fatto");
  const fitMin = sum(fitWeek.map((e) => e.w.durationMin)), fitKcal = sum(fitWeek.map((e) => e.w.kcal));
  const fitRec = tDay ? recScore(tDay) : null, fitSleep = tDay ? sleepScore(tDay) : null;
  const fitTomorrow = matchesOn(addDays(DATA.today, 1))[0] ?? null;
  const goalsMet = (gymGoal === null || gymWeek >= gymGoal) && (sportGoal === null || sportWeek >= sportGoal);
  const autoHeadline = (() => {
    const strong = fitWeek.length >= 3 || goalsMet;
    const brake = fitSleep !== null && fitSleep < 70 ? "il sonno ti frena" : isNum(tDay?.proteinG) && (tDay?.proteinG as number) < PT * 0.6 ? "le proteine non bastano" : null;
    return strong ? (brake ? `Settimana forte, ma ${brake}` : "Settimana forte, continua così") : brake ? `Settimana leggera e ${brake}` : "Settimana da costruire";
  })();
  const autoVerdict = [
    gymGoal !== null ? `Palestra ${gymWeek} su ${gymGoal}${sportGoal !== null ? `, ${sportLabel.toLowerCase()} ${sportWeek} su ${sportGoal}` : ""}${goalsMet ? ": obiettivi presi." : "."}` : `${fitWeek.length} allenamenti questa settimana.`,
    tDay && sonnoOf(tDay) !== null ? `Sonno ${sonnoOf(tDay)}${fitRec !== null ? `, recupero al ${fitRec}%` : ""}.` : "",
    fitTomorrow ? `Domani ${fitTomorrow.name}${fitTomorrow.time ? ` alle ${fitTomorrow.time.slice(0, 5)}` : ""}: stasera si chiude presto.` : "",
  ].filter(Boolean).join(" ");
  const C = DATA.coach ?? null;
  const fitHeadline = C?.headline || autoHeadline, fitVerdict = C?.verdict || autoVerdict;
  // un solo orario per stanotte in tutta l'app: quello del piano della sera (le frasi del coach si allineano)
  const bedNight = planFor(now.min >= 300 ? addDays(now.date, 1) : now.date).bedBy;
  const bedWords = `entro ${clock(bedNight).startsWith("01") ? "l'" : "le "}${clock(bedNight)}`;
  const alignBed = (t: string) => t.replace(/entro (?:le |l')\d{1,2}[:.]\d{2}/gi, bedWords);
  const fitActions = C?.actions && C.actions.length ? C.actions.slice(0, 3).map(alignBed) : [
    `Proteine a ${PT} g ogni giorno${isNum(tDay?.proteinG) ? `: oggi sei a ${fmt(tDay?.proteinG)}` : ""}`,
    `A letto prima dell'00:30${bedAvg !== null ? `: in media vai alle ${clock(bedAvg)}` : ""}`,
    gymGoal !== null ? `Palestra upper body ${gymGoal} volte${gymWeek >= gymGoal ? ": questa settimana è fatta" : `: ne mancano ${gymGoal - gymWeek}`}` : "Fissa un obiettivo di palestra settimanale",
  ];
  const fitCall = fitRec === null ? { word: "Ascoltati", color: K.t2, text: "Il recupero di oggi non c'è ancora: carico solo se ti senti bene." }
    : fitRec >= 67 ? { word: "Spingi", color: K.recHi, text: `Recupero al ${fitRec}%: il corpo regge, oggi puoi caricare.` }
    : fitRec >= 34 ? { word: "Mantieni", color: K.recMid, text: `Recupero al ${fitRec}%: carico moderato, niente record.${fitTomorrow ? " Domani si gioca: oggi niente pesi pesanti." : ""}` }
    : { word: "Vacci piano", color: K.recLo, text: `Recupero al ${fitRec}%: oggi recupero attivo, il carico aspetta.` };
  const fitPlans = Array.from({ length: 10 }, (_, i) => addDays(DATA.today, i)).flatMap((x) => plansOn(x))
    .filter((p) => p.date > now.date || (p.date === now.date && (toMin(p.time) ?? 1440) > now.min)).slice(0, 3);
  const planTip = (p: Plan) => {
    if (isMatch(p.kind, p.name)) return p.date === addDays(now.date, 1) ? `A letto ${bedWords}, colazione con carboidrati 2-3 ore prima, borraccia piena.` : "Notte piena prima, carboidrati a colazione, acqua a ogni cambio campo.";
    if (p.kind === "grid") return "Colazione leggera un'ora prima e acqua: è un'ora intensa.";
    if (p.kind === "palestra") return "Upper body completo: prima i multiarticolari, braccia alla fine. Proteine entro due ore.";
    if (/calcio/i.test(p.name)) return "Dieci minuti di riscaldamento vero e acqua: la sera prima non saltare la cena.";
    return "Acqua e un pasto vero un paio d'ore prima.";
  };
  const fitDays = days.slice(-7);
  const fitness = (
    <div style={st(14)}>
      <div style={{ ...st(2), paddingTop: 6 }}>
        <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: K.t1 }}>Fitness</span>
        <span style={lbl}>La settimana vista da {COACH}</span>
      </div>
      <div style={{ borderRadius: 18, padding: 1, background: `linear-gradient(135deg, ${K.strain}, ${K.inA})` }}>
        <div style={{ ...st(10), borderRadius: 17, padding: 18, background: K.mid }}>
          <span style={{ ...row, gap: 8 }}>{ic("dumbbell", K.strain, 18, 2)}<span style={{ ...caps, fontSize: 11, color: K.t2 }}>Il verdetto di {COACH}</span></span>
          <span style={{ fontSize: 24, lineHeight: "29px", fontWeight: 800, color: K.t1 }}>{fitHeadline}</span>
          <span style={{ ...txt, color: K.t1 }}>{fitVerdict}</span>
          {C?.updatedAt ? <span style={lbl}>{`Aggiornato ${C.updatedAt.slice(8, 10)}/${C.updatedAt.slice(5, 7)} alle ${C.updatedAt.slice(11, 16)}`}</span> : null}
        </div>
      </div>

      {sectionTitle("Questa settimana", <span style={lbl}>{`${parts(weekStart).dd}–${parts(weekEnd).dd} ${MO[parts(weekEnd).m - 1].slice(0, 3)}`}</span>)}
      <div style={three}>
        {stat("Sessioni", String(fitWeek.length), "fatte")}
        {stat("Minuti", fitMin ? Math.round(fitMin).toLocaleString("it-IT") : "—", "di allenamento")}
        {stat("Kcal", fitKcal ? Math.round(fitKcal).toLocaleString("it-IT") : "—", "in sessione")}
      </div>
      <div style={{ ...card, ...st(12) }}>
        {goalRow("dumbbell", "Palestra", gymWeek, gymGoal, gymPend, K.strain)}
        {goalRow("ball", sportLabel, sportWeek, sportGoal, sportPend, K.teal)}
      </div>
      {fitWeek.length ? (
        <div style={{ ...card, padding: "4px 16px" }}>
          {fitWeek.slice().reverse().map((e, i, arr) => {
            const k = kindOf(e.w), s = actStrain(e.w);
            const sub = [shortDay(e.date), isNum(e.w.durationMin) ? `${e.w.durationMin} min` : "", isNum(e.w.kcal) ? `${Math.round(e.w.kcal)} kcal` : "", isNum(e.w.avgHr) ? `FC ${e.w.avgHr}` : "", e.w.partners ?? ""].filter(Boolean).join(" · ");
            return listRow(e.key, s !== null ? box(fmt(s), KIND_NAME[k] ?? "", K.strain) : box("—", KIND_NAME[k] ?? "", K.strain, false), e.w.name, sub, () => open({ kind: "act", key: e.key }), i === arr.length - 1);
          })}
        </div>
      ) : <span style={{ ...lbl, padding: "0 4px" }}>Nessun allenamento registrato questa settimana.</span>}

      {LIFTS.length ? (() => {
        const exs = Array.from(new Set(LIFTS.map((l) => l.ex)));
        const ago = addDays(DATA.today, -28);
        const rows = exs.map((ex) => {
          const ls = LIFTS.filter((l) => l.ex === ex).sort((a, b) => (a.date < b.date ? -1 : 1));
          const best = ls.reduce((a, l) => (l.kg > a.kg ? l : a), ls[0]), last = ls[ls.length - 1];
          const then = [...ls].reverse().find((l) => l.date <= ago) ?? null;
          const ch = then ? best.kg - then.kg : null;
          return { ex, best, last, ch, n: ls.length };
        });
        const lastDate = LIFTS.reduce((a, l) => (l.date > a ? l.date : a), LIFTS[0].date);
        return (
          <>
            {sectionTitle("Forza", <span style={lbl}>upper body completo</span>)}
            <div style={{ ...card, padding: "4px 16px" }} aria-label="Forza">
              {rows.map((r, i) => (
                <div key={r.ex} style={{ ...row, justifyContent: "space-between", gap: 10, padding: "12px 0", borderBottom: i < rows.length - 1 ? `1px solid ${K.line}` : "none" }}>
                  <div style={{ ...st(2), minWidth: 0 }}>
                    <span style={{ ...caps, ...ell, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{r.ex}</span>
                    <span style={{ ...lbl, ...ell }}>{`${r.last.sets && r.last.reps ? `${r.last.sets}×${r.last.reps}` : "serie non annotate"} · ultima ${shortDay(r.last.date)}`}</span>
                  </div>
                  <div style={{ ...st(0), alignItems: "flex-end", flex: "0 0 auto" }}>
                    <span style={numStyle(18)}>{`${fmt(r.best.kg)} kg`}</span>
                    <span style={{ ...lbl, color: r.ch === null ? K.t3 : r.ch > 0 ? K.up : r.ch < 0 ? K.warn : K.t2 }}>{r.ch === null ? "nuovo" : r.ch === 0 ? "stabile in 4 sett." : `${r.ch > 0 ? "+" : "−"}${fmt(Math.abs(r.ch))} kg in 4 sett.`}</span>
                  </div>
                </div>
              ))}
            </div>
            <span style={{ ...txt, padding: "0 4px" }}>{rows.every((r) => r.ch === null) ? `Prima seduta annotata il ${longDate(lastDate)}: dalle prossime vedrai il miglioramento. Quando le ultime ripetizioni vengono facili, sali di 2,5 kg.` : rows.some((r) => (r.ch ?? 0) > 0) ? "Stai salendo di carico: continua così, alza solo quando l'ultima serie viene pulita." : "Carichi fermi da un mese: prova una ripetizione in più per serie prima di alzare il peso."}</span>
          </>
        );
      })() : null}

      {sectionTitle("Carico e recupero", <span style={lbl}>ultimi 7 giorni</span>)}
      <div style={{ ...card, ...st(12) }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4, alignItems: "end" }}>
          {fitDays.map((x: Day) => {
            const s = strainScore(x), r = recScore(x), sl = sonnoOf(x), isT = x.date === DATA.today;
            return (
              <div key={x.date} style={{ ...st(6), alignItems: "center" }}>
                <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 84 }}>
                  <div style={{ width: 10, height: `${Math.max(4, ((s ?? 0) / 21) * 84)}px`, borderRadius: 3, background: s === null ? K.track : K.strain }} />
                  <div style={{ width: 10, height: `${Math.max(4, ((r ?? 0) / 100) * 84)}px`, borderRadius: 3, background: r === null ? K.track : recColor(r) }} />
                </div>
                <span style={numStyle(12, K.strain)}>{s === null ? "—" : fmt(s)}</span>
                <span style={numStyle(12, r === null ? K.t3 : recColor(r))}>{r === null ? "—" : `${r}%`}</span>
                <span style={numStyle(12, K.sleep)}>{sl === null ? "—" : String(sl)}</span>
                <span style={{ fontSize: 10, lineHeight: "12px", fontWeight: isT ? 700 : 500, color: isT ? K.t1 : K.t3 }}>{isT ? "Oggi" : WD[parts(x.date).w]}</span>
              </div>
            );
          })}
        </div>
        {legend([{ label: "Sforzo", color: K.strain }, { label: "Recupero", color: K.recMid }, { label: "Sonno", color: K.sleep }])}
        <div style={{ ...row, alignItems: "flex-start", gap: 10, background: K.bg, borderRadius: 12, padding: 12 }}>
          <span style={{ ...caps, fontSize: 13, color: fitCall.color, flex: "0 0 auto" }}>{fitCall.word}</span>
          <span style={{ ...txt, flex: 1, color: K.t1 }}>{fitCall.text}</span>
        </div>
      </div>

      {sectionTitle("Prossime sessioni")}
      {fitPlans.length ? (
        <div style={{ ...card, padding: "4px 16px" }}>
          {fitPlans.map((p, i) => (
            <div key={`${p.date}${p.name}`} style={{ ...st(4), padding: "12px 0", borderBottom: i < fitPlans.length - 1 ? `1px solid ${K.line}` : "none" }}>
              <div style={{ ...row, gap: 10 }}>
                {ic(isMatch(p.kind, p.name) ? "ball" : p.kind === "palestra" ? "dumbbell" : "bolt", isMatch(p.kind, p.name) ? K.teal : K.strain, 18)}
                <span style={{ ...ell, flex: 1, fontSize: 15, fontWeight: 600, color: K.t1 }}>{p.name}</span>
                <span style={{ ...lbl, flex: "0 0 auto", textTransform: "capitalize" }}>{`${dayWord(p.date)} · ${p.time}`}</span>
              </div>
              {p.partners ? <span style={{ ...lbl, paddingLeft: 28 }}>{`con ${p.partners}`}</span> : null}
              <span style={{ ...txt, paddingLeft: 28 }}>{planTip(p)}</span>
            </div>
          ))}
        </div>
      ) : <span style={{ ...lbl, padding: "0 4px" }}>Nessuna sessione in calendario nei prossimi giorni.</span>}

      {sectionTitle("Le 3 priorità della settimana")}
      <div style={{ ...card, padding: "4px 16px" }}>
        {fitActions.map((a, i) => (
          <div key={i} style={{ ...row, alignItems: "flex-start", gap: 12, padding: "13px 0", borderBottom: i < fitActions.length - 1 ? `1px solid ${K.line}` : "none" }}>
            <span style={{ ...numStyle(20, K.strain), width: 18, flex: "0 0 auto" }}>{i + 1}</span>
            <span style={{ ...txt, flex: 1, color: K.t1 }}>{a}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ---------- giorno partita ----------
  const matchRange = (p: Plan) => { const m = /(\d{1,2})[:.](\d{2})\D+(\d{1,2})[:.](\d{2})/.exec(p.time), s = /\d/.test(p.time) ? toMin(p.time) : null; return { s, e: m ? Number(m[3]) * 60 + Number(m[4]) : s !== null ? s + 90 : null }; };
  const sportKey = (p: Plan) => (p.kind === "padel" || p.kind === "tennis" || p.kind === "beach" ? p.kind : /tennis/i.test(p.name) ? "tennis" : /beach/i.test(p.name) ? "beach" : "padel");
  const sameSport = (p: Plan, w: Workout) => { const k = sportKey(p); return kindOf(w) === k || new RegExp(k, "i").test(w.name); };
  const matchDone = (p: Plan): Workout | null => (dayOf(p.date)?.workouts ?? []).find((w: Workout) => w.status === "fatto" && (sameSport(p, w) || kindOf(w) === "sport")) ?? null;
  const todayMatch = live ? matchesOn(now.date)[0] ?? null : null;
  const matchCard = todayMatch ? (() => {
    const r = matchRange(todayMatch), done = matchDone(todayMatch), s = done ? actStrain(done) : null, after = (r.e !== null && now.min >= r.e) || done !== null;
    return (
      <button onClick={() => open({ kind: "match", key: `${todayMatch.date}|${todayMatch.name}` })} style={{ ...btn, borderRadius: 16, padding: 1, background: `linear-gradient(135deg, ${K.up}, ${K.inB})` }}>
        <div style={{ ...st(6), borderRadius: 15, padding: 16, background: K.mid }}>
          <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...row, gap: 8 }}>{ic("ball", K.up, 18)}<span style={capLbl(12)}>Giorno partita</span></span>{chev(K.t1)}</div>
          <span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, color: K.t1 }}>{todayMatch.name}</span>
          <span style={txt}>{[todayMatch.time, todayMatch.partners ? `con ${todayMatch.partners}` : ""].filter(Boolean).join(" · ")}</span>
          <span style={lbl}>{after ? (s !== null ? `Sforzo ${fmt(s)}: tocca per il confronto con le altre partite.` : "Com'è andata? Sforzo e confronto appena arrivano i dati.") : r.s !== null && now.min < r.s - 60 ? `Inizia tra ${dur(r.s - now.min)}: colazione, spuntino e acqua.` : r.s !== null && now.min < r.s ? `Inizia tra ${dur(r.s - now.min)}: spuntino leggero e acqua.` : "In campo: acqua a ogni cambio campo."}</span>
        </div>
      </button>
    );
  })() : null;
  const matchScreen = (key: string) => {
    const [dt, nm] = key.split("|");
    const p = matchesOn(dt).find((x) => x.name === nm) ?? matchesOn(dt)[0];
    if (!p) return <div style={st(14)}>{backBar("Giorno partita")}<span style={{ ...lbl, textAlign: "center" }}>Nessuna partita in programma.</span></div>;
    const r = matchRange(p), s0 = r.s ?? 600, e0 = r.e ?? s0 + 90, pd = parts(p.date);
    const done = matchDone(p), ds = done ? actStrain(done) : null;
    const prev = chronoW.filter((e) => e.date < p.date && e.w.status === "fatto" && sameSport(p, e.w)).reverse();
    const prevS = nums(prev.map((e) => actStrain(e.w))), prevAvg = avg(prevS);
    const left = p.date === now.date && now.min < s0 ? s0 - now.min : null;
    const post = proteinPlan(PT - 35);
    const steps = [
      { t: `${clock(s0 - 180)}–${clock(s0 - 120)}`, h: "Colazione", x: "Carboidrati facili e un po' di proteine: pane o fette biscottate con miele o marmellata, un caffellatte o uno yogurt, una banana. Pochi grassi e poca fibra." },
      { t: `${clock(s0 - 60)}–${clock(s0 - 30)}`, h: "Spuntino", x: "Una banana o una barretta, e un bicchiere d'acqua." },
      { t: p.time, h: "Durante", x: "Qualche sorso a ogni cambio campo; tra un match e l'altro una banana o qualche cracker." },
      { t: `da ${clock(e0)}`, h: "Dopo", x: `Entro un'ora proteine e carboidrati${post ? `: per esempio ${post.items.map((f) => `${f.name.toLowerCase()} ${f.portion}`).join(" e ")} con pane o riso` : ""}.` },
    ];
    const water = [
      { h: "Al risveglio", v: "500 ml" }, { h: "Nell'ora prima", v: "300–500 ml" }, { h: "In campo", v: "150–250 ml ogni 15–20 min" }, { h: "Dopo", v: "acqua e un pizzico di sale" },
    ];
    return (
      <div style={st(14)}>
        {backBar("Giorno partita")}
        <div style={{ ...st(6), alignItems: "center", textAlign: "center", padding: "10px 0 4px" }}>
          {ring(left === null ? 1 : 1 - clamp(left / 600, 0, 1), K.up, 150, 10, (
            <>{ic("ball", K.up, 30, 1.8)}<span style={{ ...numStyle(left !== null && left >= 60 ? 22 : 26), marginTop: 6 }}>{left !== null ? dur(left) : done ? fmt(ds) : clock(s0)}</span><span style={{ ...caps, fontSize: 10, color: K.t2 }}>{left !== null ? "all'inizio" : done ? "sforzo" : "inizio"}</span></>
          ), true)}
          <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 600, color: K.t1, marginTop: 8 }}>{p.name}</span>
          <span style={txt}>{`${WDL[pd.w].replace(/^./, (c) => c.toUpperCase())} ${pd.dd} ${MO[pd.m - 1]} · ${p.time}`}</span>
          {p.partners || p.detail ? <span style={lbl}>{[p.partners ? `Con ${p.partners}` : "", p.detail ?? ""].filter(Boolean).join(" · ")}</span> : null}
        </div>
        <div style={{ ...card, padding: "4px 16px" }}>
          {steps.map((s, i) => (
            <div key={s.h} style={{ ...row, alignItems: "flex-start", padding: "13px 0", borderBottom: i < steps.length - 1 ? `1px solid ${K.line}` : "none" }}>
              <div style={{ ...st(2), width: 92, flex: "0 0 auto" }}><span style={{ ...caps, fontSize: 11, color: K.up }}>{s.h}</span><span style={{ ...numStyle(15, K.t2) }}>{s.t}</span></div>
              <span style={{ ...txt, flex: 1, color: K.t1 }}>{s.x}</span>
            </div>
          ))}
        </div>
        <div style={{ ...card, ...st(10) }}>
          <span style={capLbl(12)}>Acqua</span>
          {water.map((w) => <div key={w.h} style={{ ...row, justifyContent: "space-between" }}><span style={txt}>{w.h}</span><span style={{ ...txt, color: K.t1, fontWeight: 600, textAlign: "right" }}>{w.v}</span></div>)}
        </div>
        <div style={{ ...card, ...st(10) }}>
          <span style={capLbl(12)}>Dopo la partita</span>
          {done ? (
            <>
              <div style={three}>{stat("Sforzo", fmt(ds))}{stat("Durata", isNum(done.durationMin) ? `${done.durationMin}′` : "—", "minuti")}{stat("FC media", fmt(done.avgHr), "bpm")}</div>
              <span style={txt}>{ds !== null && prevAvg !== null ? `${ds > prevAvg + 0.5 ? "Più intensa della" : ds < prevAvg - 0.5 ? "Più leggera della" : "In linea con la"} media delle ultime ${prevS.length} ${prevS.length === 1 ? "partita" : "partite"} (${fmt(prevAvg)}).` : "Prima partita registrata di questo tipo."}</span>
            </>
          ) : <span style={txt}>{prevAvg !== null ? `Qui comparirà lo sforzo della partita, accanto alla media delle ultime (${fmt(prevAvg)}).` : "Qui comparirà lo sforzo della partita."}</span>}
        </div>
        {prev.length ? listCard("Le ultime partite", <span style={lbl}>{prev.length}</span>, prev.slice(0, 5).map((e, i) => {
          const s = actStrain(e.w);
          return listRow(`pm${e.key}`, s !== null ? box(fmt(s), "sforzo", K.strain) : box("—", "sforzo", K.strain, false), e.w.name, [shortDay(e.date), e.w.time, isNum(e.w.durationMin) ? `${e.w.durationMin} min` : "", isNum(e.w.avgHr) ? `FC ${e.w.avgHr}` : ""].filter(Boolean).join(" · "), () => open({ kind: "act", key: e.key }), i === Math.min(prev.length, 5) - 1);
        })) : null}
      </div>
    );
  };

  // =================== HOME ===================
  // guida del giorno: prima il recupero, poi lo sforzo che ne segue
  const guideLead = dRec === null ? null : (
    <span aria-label="Recupero e sforzo di oggi" style={{ ...row, gap: 8, flexWrap: "wrap" }}>
      <span style={numStyle(24, recColor(dRec))}>{`${dRec}%`}</span><span style={lbl}>recupero</span>
      <span style={{ color: K.t2, fontSize: 16, lineHeight: "20px" }}>{"→"}</span>
      {dayDone ? <><span style={numStyle(24, K.strain)}>{fmt(dStr)}</span><span style={lbl}>{`sforzo di oggi · fascia ${strainTarget}`}</span></> : <><span style={numStyle(24, K.strain)}>{strainTarget}</span><span style={lbl}>{live ? "sforzo di oggi" : "sforzo consigliato"}</span></>}
    </span>
  );
  const outlookAfter = dRec === null ? outlookFull : outlookFull.replace(/^Recupero \d+%: sforzo consigliato [^.]+\. /, "");
  const hrNorm = norm(d, (y: Day) => y.rhr), hrBand = bandOf(d, (y: Day) => y.rhr);
  const twin = (title: string, aria: string, onClick: () => void, big: string, bigColor: string, unit: string, sub: string) => (
    <button aria-label={aria} onClick={onClick} style={{ ...btn, ...card, ...st(6), padding: 14 }}>
      <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}><span style={ell}>{title}</span>{ic("right", K.t1, 14, 2.4)}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}><span style={numStyle(26, bigColor)}>{big}</span><span style={{ ...lbl, color: K.t2 }}>{unit}</span></span>
      <span style={lbl}>{sub}</span>
    </button>
  );
  // BATTITO ORA: l'ultimo battito sincronizzato, la sua zona e gli ultimi 60 minuti colorati per zona; grigio se vecchio di oltre 20 min
  const HN = DATA.hrNow ?? null;
  const hnEdges = DATA.zones ? [0.5, 0.6, 0.7, 0.8, 0.9].map((f) => Math.round((DATA.zones as { rhr: number }).rhr + f * ((DATA.zones as { max: number }).max - (DATA.zones as { rhr: number }).rhr))) : [];
  const hnZone = (b: number) => { for (let i = hnEdges.length - 1; i >= 0; i--) if (b >= hnEdges[i]) return i; return -1; };
  const HZC = [K.sleep, K.up, K.recMid, K.warn, K.recLo];
  const hnCol = (b: number) => { const z = hnZone(b); return z < 0 ? K.t1 : HZC[z]; };
  const hrNowCard = HN ? (() => {
    const at = toMin(HN.at.slice(11, 16)) ?? 0, age = daysBetween(HN.at.slice(0, 10), now.date) * 1440 + now.min - at, stale = age > 20;
    const z = hnZone(HN.bpm), col = stale ? K.t3 : hnCol(HN.bpm);
    const W = 340, H = 60, v = HN.last60, ok = nums(v.map((x) => (x > 0 ? x : null)));
    const lo = ok.length ? Math.min(...ok) - 4 : 50, hi = ok.length ? Math.max(...ok) + 4 : 100;
    const X = (i: number) => (i / Math.max(1, v.length - 1)) * W, Y = (b: number) => 4 + (1 - (b - lo) / (hi - lo || 1)) * (H - 8);
    const mark = z < 0 ? 0 : (z + (z < hnEdges.length - 1 ? clamp((HN.bpm - hnEdges[z]) / (hnEdges[z + 1] - hnEdges[z]), 0, 1) : 0.5)) / 5;
    return (
      <div aria-label="Battito ora" role="button" tabIndex={0} onClick={() => open({ kind: "hr" })} onKeyDown={(e: { key: string }) => { if (e.key === "Enter" || e.key === " ") open({ kind: "hr" }); }} data-stale={stale ? 1 : 0} data-v={HN.bpm} style={{ ...card, ...st(12), cursor: "pointer" }}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...capLbl(12), whiteSpace: "nowrap" }}>Battito ora</span><span style={{ ...row, gap: 6, minWidth: 0 }}><span style={{ ...lbl, color: stale ? K.warn : K.t2, whiteSpace: "nowrap" }}>{stale ? `non aggiornato · ${HN.at.slice(11, 16)}` : `aggiornato alle ${HN.at.slice(11, 16)}`}</span>{chev(K.t3)}</span></div>
        <div style={{ ...row, gap: 12, alignItems: "center" }}>
          <span className="wb-beat" aria-hidden="true" style={{ display: "inline-flex", animation: stale ? "none" : `wb-beat ${(60 / Math.max(30, HN.bpm)).toFixed(2)}s ease-in-out infinite`, filter: stale ? "none" : `drop-shadow(0 0 8px ${col}88)` }}>{ic("heart", col, 30, 2.4)}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={numStyle(48, stale ? K.t3 : K.t1)}>{HN.bpm}</span><span style={{ ...lbl, color: K.t2 }}>bpm</span></span>
          <span style={{ flex: 1 }} />
          <span style={{ ...caps, fontSize: 11, lineHeight: "16px", color: col, background: `${col}1F`, border: `1px solid ${col}59`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{z < 0 ? "a riposo" : `zona ${z + 1}`}</span>
        </div>
        {hnEdges.length ? (
          <div aria-label="Zona attuale" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 3 }}>
            {HZC.map((c, i) => <span key={i} style={{ height: 6, borderRadius: 3, background: c, opacity: stale ? 0.25 : i === z ? 1 : 0.35 }} />)}
            <span style={{ position: "absolute", top: -4, left: `calc(${(mark * 100).toFixed(1)}% - 7px)`, width: 14, height: 14, borderRadius: 7, background: K.t1, border: `3px solid ${K.bg}`, boxSizing: "border-box" }} />
          </div>
        ) : null}
        <svg aria-label="Battito ultimi 60 minuti" width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }}>
          {v.map((b, i) => (i > 0 && b > 0 && v[i - 1] > 0 ? <line key={i} x1={X(i - 1)} y1={Y(v[i - 1])} x2={X(i)} y2={Y(b)} stroke={stale ? K.t3 : hnCol((b + v[i - 1]) / 2)} strokeWidth={2.4} strokeLinecap="round" /> : null))}
        </svg>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={lbl}>60 min fa</span><span style={lbl}>{HN.at.slice(11, 16)}</span></div>
      </div>
    );
  })() : null;
  // dettaglio "Battito" (stile live HR): adesso, ultimi 60 min / 6 h / 24 h colorati per zona, minimo / media / massimo, tempo per zona
  const hrHead = (b: number, stale: boolean, size: number) => {
    const z = hnZone(b), col = stale ? K.t3 : hnCol(b);
    return (
      <div style={{ ...row, gap: 12, alignItems: "center" }}>
        <span className="wb-beat" aria-hidden="true" style={{ display: "inline-flex", animation: stale ? "none" : `wb-beat ${(60 / Math.max(30, b)).toFixed(2)}s ease-in-out infinite`, filter: stale ? "none" : `drop-shadow(0 0 8px ${col}88)` }}>{ic("heart", col, Math.round(size * 0.62), 2.4)}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span style={numStyle(size, stale ? K.t3 : K.t1)}>{b}</span><span style={{ ...lbl, color: K.t2 }}>bpm</span></span>
        <span style={{ flex: 1 }} />
        <span style={{ ...caps, fontSize: 11, lineHeight: "16px", color: col, background: `${col}1F`, border: `1px solid ${col}59`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{z < 0 ? "a riposo" : `zona ${z + 1}`}</span>
      </div>
    );
  };
  const hrStrip = (b: number, stale: boolean) => {
    if (!hnEdges.length) return null;
    const z = hnZone(b), mark = z < 0 ? 0 : (z + (z < hnEdges.length - 1 ? clamp((b - hnEdges[z]) / (hnEdges[z + 1] - hnEdges[z]), 0, 1) : 0.5)) / 5;
    return (
      <div aria-label="Zona attuale" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 3 }}>
        {HZC.map((c, i) => <span key={i} style={{ height: 6, borderRadius: 3, background: c, opacity: stale ? 0.25 : i === z ? 1 : 0.35 }} />)}
        <span style={{ position: "absolute", top: -4, left: `calc(${(mark * 100).toFixed(1)}% - 7px)`, width: 14, height: 14, borderRadius: 7, background: K.t1, border: `3px solid ${K.bg}`, boxSizing: "border-box" }} />
      </div>
    );
  };
  const hrLine = (v: number[], H: number, stale: boolean, aria: string) => {
    const W = 340, ok = nums(v.map((x) => (x > 0 ? x : null)));
    const lo = ok.length ? Math.min(...ok) - 4 : 50, hi = ok.length ? Math.max(...ok) + 4 : 100;
    const X = (i: number) => (i / Math.max(1, v.length - 1)) * W, Y = (b: number) => 4 + (1 - (b - lo) / (hi - lo || 1)) * (H - 8);
    return (
      <svg aria-label={aria} data-n={v.length} width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }}>
        {v.map((b, i) => (i > 0 && b > 0 && v[i - 1] > 0 ? <line key={i} x1={X(i - 1)} y1={Y(v[i - 1])} x2={X(i)} y2={Y(b)} stroke={stale ? K.t3 : hnCol((b + v[i - 1]) / 2)} strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null))}
      </svg>
    );
  };
  const [hrRange, setHrRange] = useState<number>(60);
  const hrScreen = () => !HN ? null : (() => {
    const at = toMin(HN.at.slice(11, 16)) ?? 0, age = daysBetween(HN.at.slice(0, 10), now.date) * 1440 + now.min - at, stale = age > 20;
    const full = HN.h24 && HN.h24.length ? HN.h24 : HN.last60, rg = Math.min(hrRange, full.length), raw = full.slice(-rg);
    const g = Math.max(1, Math.ceil(raw.length / 180)), v: number[] = [];
    for (let i = 0; i < raw.length; i += g) { const s = raw.slice(i, i + g).filter((x) => x > 0); v.push(s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0); }
    const ok = raw.filter((x) => x > 0), mn = ok.length ? Math.min(...ok) : null, mx = ok.length ? Math.max(...ok) : null, av = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;
    const zt = [0, 0, 0, 0, 0, 0]; ok.forEach((b) => { zt[hnZone(b) + 1] += 1; });
    const clk = (m: number) => clock(((Math.round(m) % 1440) + 1440) % 1440);
    const ranges: [number, string][] = [[60, "1 h"], [360, "6 h"], [1440, "24 h"]];
    const zr: [string, string, number][] = [["A riposo", K.t1, zt[0]], ...HZC.map((c, i) => [`Zona ${i + 1}${hnEdges[i] ? ` · ${hnEdges[i]}${hnEdges[i + 1] ? `–${hnEdges[i + 1] - 1}` : "+"} bpm` : ""}`, c, zt[i + 1]] as [string, string, number])];
    const zmax = Math.max(1, ...zt);
    return (
      <div style={st(14)}>
        {backBar("Battito")}
        <div aria-label="Battito dettaglio" data-range={rg} style={{ ...card, ...st(12) }}>
          <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>Adesso</span><span style={{ ...lbl, color: stale ? K.warn : K.t2 }}>{stale ? `non aggiornato · ultimo alle ${HN.at.slice(11, 16)}` : `aggiornato alle ${HN.at.slice(11, 16)}`}</span></div>
          {hrHead(HN.bpm, stale, 64)}
          {hrStrip(HN.bpm, stale)}
        </div>
        <div role="group" aria-label="Intervallo battito" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 6, background: K.card, border: `1px solid ${K.line}`, borderRadius: 12, padding: 4 }}>
          {ranges.map(([m, l]) => <button key={m} aria-label={`Intervallo ${l}`} aria-pressed={hrRange === m} onClick={() => setHrRange(m)} style={{ ...btn, ...caps, fontSize: 12, lineHeight: "16px", padding: "8px 0", borderRadius: 9, textAlign: "center", color: hrRange === m ? K.bg : K.t1, background: hrRange === m ? K.t1 : "transparent" }}>{l}</button>)}
        </div>
        <div style={{ ...card, ...st(8) }}>
          <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>{rg <= 60 ? "Minuto per minuto" : `Ultime ${Math.round(rg / 60)} ore`}</span><span style={lbl}>{ok.length ? `${Math.min(...ok)}–${Math.max(...ok)} bpm` : ""}</span></div>
          {hrLine(v, 150, stale, "Battito grafico")}
          <div style={{ ...row, justifyContent: "space-between" }}><span style={lbl}>{clk(at - rg)}</span><span style={lbl}>{clk(at - rg / 2)}</span><span style={lbl}>{HN.at.slice(11, 16)}</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
          {([["Minimo", mn], ["Media", av], ["Massimo", mx]] as [string, number | null][]).map(([k, x]) => (
            <div key={k} aria-label={`Battito ${k.toLowerCase()}`} style={{ ...card, ...st(4), padding: 12 }}><span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: K.t3 }}>{k}</span><span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><span style={numStyle(24, x === null ? K.t3 : hnCol(x))}>{x ?? "—"}</span><span style={lbl}>bpm</span></span></div>
          ))}
        </div>
        <div aria-label="Tempo per zona" style={{ ...card, ...st(10) }}>
          <span style={capLbl(12)}>Tempo per zona</span>
          {zr.map(([n, c, m]) => (
            <div key={n} style={st(4)}>
              <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...lbl, color: K.t1 }}>{n}</span><span style={numStyle(14)}>{m >= 60 ? hm(m) : `${m} min`}</span></div>
              <div style={{ height: 6, borderRadius: 3, background: K.track }}><div style={{ width: `${(m / zmax) * 100}%`, height: 6, borderRadius: 3, background: c, opacity: m ? 1 : 0 }} /></div>
            </div>
          ))}
        </div>
        <span style={{ ...lbl, textAlign: "center" }}>L'orologio sincronizza a blocchi: il dato più recente arriva di solito con 1–15 minuti di ritardo, non è una misura in diretta.</span>
      </div>
    );
  })();
  const homeTwins = (
    <div style={two}>
      {twin("Monitor salute", "Monitor salute in breve", () => goTab("biologia"), monitor.length ? `${monOk}/${monitor.length}` : "—", monitor.length ? (monAll ? K.up : K.warn) : K.t3, monitor.length ? "nella norma" : "in arrivo", monitor.length ? (monAll ? "segnali della notte" : `${monOff.length} da osservare`) : "servono le misure")}
      {twin("Cuore da fermo", "Cuore da fermo", () => goTab("recupero"), isNum(d.rhr) ? String(Math.round(d.rhr)) : "—", K.t1, "bpm", `${hrBand ? `norma ${Math.round(hrBand.lo)}–${Math.round(hrBand.hi)} · ` : hrNorm !== null ? `norma ${Math.round(hrNorm)} · ` : ""}${isNum(d.hrvMs) ? `HRV ${Math.round(d.hrvMs)}` : "HRV —"}`)}
    </div>
  );
  // =================== OGGI IN BREVE: la prima cosa che vedi in Corpo ===================
  // calorie bruciate del giorno, gli allenamenti fatti (kcal di ognuno), poi passi e mangiate vs bruciate
  const kcalTxt = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const durTxt = (m: number) => { const r = Math.round(m); return r >= 60 ? `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, "0")}min` : `${r} min`; };
  // minuti per zona di una sessione, dai battiti minuto per minuto (le stesse zone personali di Sforzo)
  const sessZones = (date: string, w: Workout): number[] | null => {
    const t = /\d{1,2}:\d{2}/.exec(w.time), ser = t && DATA.zones?.sessions ? DATA.zones.sessions[`${date} ${t[0].padStart(5, "0")}`] : null;
    if (!ser || !hnEdges.length) return null;
    const z = [0, 0, 0, 0, 0];
    ser.split(" ").map(Number).forEach((b) => { const i = b > 0 ? hnZone(b) : -1; if (i >= 0) z[i] += 1; });
    return sum(z) > 0 ? z : null;
  };
  const zoneStrip = (zs: number[]) => {
    const tot = Math.max(1, sum(zs));
    return (
      <div aria-label="Minuti per zona" style={st(6)}>
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: K.track }}>{zs.map((v, i) => (v ? <span key={i} style={{ width: `${(v / tot) * 100}%`, height: 6, background: HZC[i] }} /> : null))}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 4 }}>
          {zs.map((v, i) => <span key={i} style={{ ...row, gap: 4, fontSize: 11, lineHeight: "14px", color: v ? K.t2 : K.t3, whiteSpace: "nowrap" }}><span style={{ width: 6, height: 6, borderRadius: 2, background: HZC[i], flex: "0 0 auto" }} />{`Z${i + 1} ${v}′`}</span>)}
        </div>
      </div>
    );
  };
  const kindBadge = (k: string, muted = false) => (
    <div style={{ width: 44, height: 44, borderRadius: 10, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: muted ? "transparent" : `${K.strain}26`, border: muted ? `1px dashed ${K.t3}` : `1px solid ${K.strain}66` }}>{ic(kindIcon(k), muted ? K.t3 : K.strain, 22)}</div>
  );
  // una riga allenamento: nome, orario, durata, FC media, con chi; a destra le kcal. In Sforzo anche sforzo e minuti per zona
  const doneRow = (x: Day, w: Workout, i: number, last: boolean, effort: boolean) => {
    const k = kindOf(w), sv = actStrain(w), zs = effort ? sessZones(x.date, w) : null;
    const meta = [w.time, isNum(w.durationMin) ? durTxt(w.durationMin) : ""].filter(Boolean).join(" · ");
    const meta2 = [isNum(w.avgHr) ? `FC media ${w.avgHr}` : "", w.partners ? `con ${w.partners}` : ""].filter(Boolean).join(" · ");
    return (
      <button key={`${x.date}w${i}`} aria-label={`Allenamento ${w.name}`} onClick={() => open({ kind: "act", key: `${x.date}w${i}` })} style={{ ...btn, ...st(10), width: "100%", padding: "12px 0", borderBottom: last ? "none" : `1px solid ${K.line}` }}>
        <div style={{ ...row, alignItems: "center" }}>
          {effort && sv !== null ? box(fmt(sv), KIND_NAME[k] ?? "", K.strain) : kindBadge(k)}
          <div style={{ ...st(2), flex: 1 }}>
            <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{w.name}</span>
            <span style={lbl}>{meta}</span>
            {meta2 ? <span style={lbl}>{meta2}</span> : null}
          </div>
          <div style={{ ...st(0), alignItems: "flex-end", flex: "0 0 auto" }}>
            <span style={numStyle(22, isNum(w.kcal) ? K.t1 : K.t3)}>{isNum(w.kcal) ? kcalTxt(w.kcal) : "—"}</span>
            <span style={lbl}>kcal</span>
          </div>
        </div>
        {zs ? zoneStrip(zs) : null}
      </button>
    );
  };
  const planRow = (p: Plan, i: number, last: boolean) => (
    <div key={`plan${i}`} aria-label={`In programma ${p.name}`} style={{ ...row, padding: "12px 0", borderBottom: last ? "none" : `1px solid ${K.line}` }}>
      {kindBadge(p.kind ?? "", true)}
      <div style={{ ...st(2), flex: 1 }}>
        <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t2 }}>{p.name}</span>
        <span style={lbl}>{[p.time, p.partners ? `con ${p.partners}` : ""].filter(Boolean).join(" · ")}</span>
      </div>
    </div>
  );
  const doneOfDay = (x: Day) => x.workouts.map((w: Workout, i: number) => ({ w, i })).filter((e) => e.w.status === "fatto");
  const workoutRows = (x: Day, effort: boolean) => {
    const dn = doneOfDay(x), pl = x.date === DATA.today ? plansOn(x.date) : [];
    if (!dn.length && !pl.length) return null;
    return (
      <div style={st(0)}>
        {dn.map((e, j) => doneRow(x, e.w, e.i, j === dn.length - 1 && !pl.length, effort))}
        {pl.length ? <span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: K.t3, paddingTop: dn.length ? 12 : 4 }}>In programma</span> : null}
        {pl.map((q, j) => planRow(q, j, j === pl.length - 1))}
      </div>
    );
  };
  const miniTile = (k: string, v: string, u?: string, color: string = K.t1) => (
    <div style={{ ...st(2), background: K.bg, borderRadius: 10, padding: "8px 10px", minWidth: 0 }}>
      <span style={{ ...caps, ...ell, fontSize: 10, lineHeight: "14px", color: K.t3 }}>{k}</span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 0 }}><span style={numStyle(20, color)}>{v}</span>{u ? <span style={{ ...lbl, ...ell }}>{u}</span> : null}</span>
    </div>
  );
  const todayHero = (() => {
    const burned = isNum(d.burnedKcal) ? d.burnedKcal : null, rows = workoutRows(d, false), bl = bal(d);
    return (
      <div aria-label="Oggi in breve" data-v={burned ?? ""} style={{ ...card, ...st(12) }}>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={st(2)}>
            <span style={capLbl(12)}>Calorie bruciate</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}><span aria-label="Calorie bruciate valore" style={numStyle(56, burned === null ? K.t3 : K.t1)}>{burned === null ? "—" : kcalTxt(burned)}</span><span style={{ ...lbl, color: K.t2 }}>kcal</span></span>
          </div>
          <span style={{ ...lbl, textAlign: "right", paddingBottom: 6 }}>{[isNum(d.activeKcal) ? `${kcalTxt(d.activeKcal)} attive` : "", live ? "finora" : ""].filter(Boolean).join(" · ")}</span>
        </div>
        <div style={{ borderTop: `1px solid ${K.line}` }}>
          {rows ?? <span style={{ ...txt, display: "block", padding: "12px 0 0" }}>{live ? "Ancora nessun allenamento oggi: anche una camminata conta." : "Nessun allenamento in questo giorno."}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
          {miniTile("Passi", isNum(d.steps) ? kcalTxt(d.steps) : "—")}
          {miniTile("Mangiate", isNum(d.eatenKcal) ? kcalTxt(d.eatenKcal) : "—", "kcal", isNum(d.eatenKcal) ? K.t1 : K.t3)}
          {miniTile("Bilancio", signed(bl), bl === null ? undefined : "kcal", bl === null ? K.t3 : K.t1)}
        </div>
      </div>
    );
  })();
  const home = (
    <div style={st(14)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 4, justifyItems: "center", padding: "10px 0 2px" }}>
        {smallDial("sonno")}{smallDial("recupero")}{smallDial("sforzo")}
      </div>
      {todayHero}
      {live && todayMatch && !matchDone(todayMatch) ? matchCard : null}
      {live ? stanotteCard : null}
      {live ? morningCard : null}
      <button onClick={() => open({ kind: "coach" })} style={{ ...btn, ...card, ...st(6) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: K.t1 }}>{outlookTitle}</span>
          <span style={{ ...row, gap: 6 }}>{sqBadge(ic("check", recColor(dRec), 14, 2.6), recColor(dRec))}<span style={{ ...lbl, fontWeight: 700 }}>{coachTips.length}</span></span>
        </div>
        {guideLead}
        <span style={txt}>{outlookAfter}</span>
      </button>
      {homeTwins}
      {homeProtein}
      {homeGoals}

      {sectionTitle("La mia giornata", <span style={lbl}>{dayTitle(d.date)}</span>)}
      <button onClick={() => open({ kind: "coach" })} style={{ ...btn, ...card, ...row, padding: "14px 16px", background: `linear-gradient(90deg, ${K.card2}, ${K.rowEnd})` }}>
        {ic("cal", K.t2, 20)}<span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Prospettiva del giorno</span>{chev(K.t1)}
      </button>
      {d.meals.length ? listCard("Pasti", <span style={lbl}>{fmt(d.eatenKcal)} kcal · {fmt(d.proteinG)} g prot.</span>, mealRows(d)) : null}
      {!d.workouts.length && !d.meals.length ? <span style={{ ...lbl, padding: "0 4px" }}>Nessuna attività o pasto registrato in questo giorno.</span> : null}
      {d.note ? <div style={{ ...card, ...row, alignItems: "flex-start", borderColor: `${K.warn}55` }}>{ic("info", K.warn, 18)}<span style={{ ...txt, flex: 1 }}>{d.note}</span></div> : null}
      {upcomingCard}

      {sectionTitle("Statistiche chiave")}
      {contribCard(keyStats, "vs ultimi 30 giorni · pasti vs settimana", false)}
    </div>
  );

  // =================== DETTAGLIO QUADRANTI ===================
  const formula: Record<DialId, { f: string; v: string }> = {
    sonno: { f: "Sonno (stile WHOOP) = Sufficienza^0,6 × Qualità^0,4. Sufficienza = (ore dormite / bisogno)^2,5: il bisogno è 8 ore + sforzo del giorno prima (max +30 min) + debito delle 3 notti prima (max +45 min) − pisolino. Qualità = Regolarità 40% (orari di letto e sveglia rispetto alle 4 notti prima, e letto dopo l'00:30 pesa), Sonno ristoratore 35% (profondo verso 17%, REM verso 22%), Efficienza 25% (sonno sul tempo a letto, risvegli). Se un dato manca, gli altri si ripesano. Ottimale ≥ 85, sufficiente 70–84, scarso < 70.", v: isNum(d.sleepMin) ? `${hm(d.sleepMin)} dormite · profondo ${hm(d.deepMin)} · REM ${hm(d.remMin)}` : "Notte non ancora sincronizzata: punteggio non disponibile." },
    recupero: { f: "Recupero = 50% HRV rispetto alla tua media degli altri giorni (±20% = 0–100) + 25% FC a riposo rispetto alla media (−10% = 100, +10% = 0) + 25% punteggio sonno. Verde 67–99, giallo 34–66, rosso 1–33.", v: `HRV ${fmt(d.hrvMs, " ms")} (media ${fmt(bHrv)}) · FC riposo ${fmt(d.rhr, " bpm")} (media ${fmt(bRhr)}) · sonno ${dSl === null ? "—" : `${dSl}%`}${dRec === null ? " · mancano dati: non calcolato" : ""}` },
    sforzo: { f: "Sforzo = 21 × (1 − e^(−carico/1500)), scala 0–21. Carico = kcal attive + 5 × minuti di sessioni con FC media ≥ 120.", v: `${fmt(d.activeKcal)} kcal attive · ${cardioMin(d)} min di sessione a FC ≥ 120 · carico ${isNum(d.activeKcal) ? Math.round(d.activeKcal + 5 * cardioMin(d)).toLocaleString("it-IT") : "—"}` },
  };
  const detailTop = (id: DialId, withBack: boolean) => {
    const m = dialMeta[id];
    return (
      <>
        {withBack ? (
          <div style={frostIn}>
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px", alignItems: "center" }}>
              <button onClick={closeScreen} aria-label="Indietro" style={{ ...btn, width: 40, height: 40, display: "flex", alignItems: "center" }}>{ic("back", K.t1, 24, 2.2)}</button>
              <div style={{ display: "flex", justifyContent: "center" }}>{datePill}</div>
              <span />
            </div>
            {calendar ? <div style={{ marginTop: 10 }}>{calendar}</div> : null}
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 6px" }}>
          {ring(m.frac, m.color, 232, 14, (
            <>
              <span aria-label={`${m.name} valore`} style={numStyle(72, m.v === null ? K.t3 : K.t1)}>{m.v === null ? "—" : m.v.toLocaleString("it-IT")}{m.v !== null && m.unit ? <span style={{ fontSize: 34 }}>{m.unit}</span> : null}</span>
              <span style={{ ...caps, fontSize: 13, color: K.t1, marginTop: 6 }}>{id === "sonno" ? "Sonno" : id === "sforzo" ? "Sforzo" : "Recupero"}</span>
              {id === "sforzo" && m.v !== null ? <span style={{ ...lbl, marginTop: 4 }}>{`su 21${strainRange ? ` · obiettivo ${strainRange[0]}–${strainRange[1]}` : ""}`}</span> : id === "sonno" && isNum(d.sleepMin) ? <span style={{ ...lbl, marginTop: 4 }}>{`${hm(d.sleepMin)} dormite`}</span> : null}
            </>
          ), true, id === "sforzo" && strainRange ? [strainRange[0] / 21, strainRange[1] / 21] : null)}
        </div>
      </>
    );
  };
  const weekTitle = (t: string) => <span style={{ ...capLbl(12), marginTop: 8 }}>{t}</span>;

  // ---- SONNO ----
  const sleepDays = days.filter((x: Day) => isNum(x.sleepMin));
  const light = (x: Day) => (isNum(x.sleepMin) ? Math.max(0, x.sleepMin - (x.deepMin ?? 0) - (x.remMin ?? 0)) : null);
  const bedDev = (x: Day) => { const b = bedRel(x.bedtime); return b !== null && bedAvg !== null ? Math.abs(b - bedAvg) : null; };
  const sp = sleepParts(d);
  const slBand = (v: number | null): { t: string; c: string } => (v === null ? { t: "—", c: K.t3 } : v >= 85 ? { t: "Ottimale", c: K.recHi } : v >= 70 ? { t: "Sufficiente", c: K.recMid } : { t: "Scarso", c: K.recLo });
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
  const tonight = planFor(addDays(DATA.today, 1));
  const needWhy = (n: { strainAdd: number; debt: number; napCut: number }) => `8:00 di base${n.strainAdd ? ` + ${n.strainAdd} min per lo sforzo` : ""}${n.debt ? ` + ${n.debt} min di debito` : ""}${n.napCut ? ` − ${n.napCut} min di pisolino` : ""}`;
  const weakest = [{ k: "suff", v: sp.suff }, { k: "cons", v: sp.cons }, { k: "eff", v: sp.eff }, { k: "rest", v: sp.rest }].filter((c) => c.v !== null).sort((a, b) => (a.v as number) - (b.v as number))[0];
  const weakText: Record<string, string> = {
    suff: "Il punto debole è la durata: serve più tempo a letto.",
    cons: "Il punto debole è la regolarità: orari diversi dalle notti prima e letto tardi.",
    eff: "Il punto debole è l'efficienza: troppo tempo sveglio a letto o troppi risvegli.",
    rest: "Il punto debole è il sonno ristoratore: profondo o REM sotto l'obiettivo.",
  };
  const sleepInsight = dSl === null || sp.ratio === null ? "Questa notte non è ancora sincronizzata: il punteggio arriva con i dati." : `${dSl >= 85 ? "Notte ottima: mantieni orari simili anche stasera." : weakest ? weakText[weakest.k] : ""}${(debtOf(d.date) ?? 0) >= 60 ? ` Il debito di sonno (${debtText(debtOf(d.date) as number)}) tiene basso il punteggio.` : ""}`;
  const sleepScatter = (() => {
    const pts = days.map((x: Day) => ({ x: bedRel(x.bedtime), y: x.sleepMin, date: x.date })).filter((p): p is { x: number; y: number; date: string } => isNum(p.x) && isNum(p.y));
    if (pts.length < 2) return null;
    const W = 340, H = 150, pl = 30, pb = 22, pt = 10, pr = 12;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys, 300) - 30, y1 = Math.max(...ys, 480) + 30;
    const X = (v: number) => pl + ((v - x0) / (x1 - x0)) * (W - pl - pr), Y = (v: number) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb);
    const r = pearson(xs, ys);
    return (
      <>
        {weekTitle("Ora di letto e durata")}
        <div style={{ ...card, ...st(8) }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
            <line x1={pl} x2={W - pr} y1={Y(480)} y2={Y(480)} stroke={K.t3} strokeDasharray="3 4" />
            <text x={pl - 4} y={Y(480) + 4} fontSize={10} textAnchor="end" fill={K.t3}>8h</text>
            {[x0 + 30, (x0 + x1) / 2, x1 - 30].map((v, i) => <text key={i} x={X(v)} y={H - 6} fontSize={10} textAnchor="middle" fill={K.t3}>{clock(v)}</text>)}
            {pts.map((p) => <circle key={p.date} cx={X(p.x)} cy={Y(p.y)} r={p.date === d.date ? 7 : 5} fill={p.date === d.date ? K.t1 : K.sleep} style={{ cursor: "pointer" }} onClick={() => go(p.date)} />)}
          </svg>
          <span style={txt}>{r === null ? "Pochi dati per un legame." : r < -0.3 ? "Quando vai a letto più tardi tendi a dormire meno: la sveglia non si sposta abbastanza." : r > 0.3 ? "Quando vai a letto più tardi dormi più a lungo, spesso perché ti svegli più tardi." : "Nessun legame chiaro tra ora di letto e durata in questi giorni."}</span>
          <span style={lbl}>Orizzontale: ora di letto · verticale: durata · {pts.length} notti{r !== null ? ` · correlazione ${r.toFixed(2).replace(".", ",")}` : ""}</span>
        </div>
      </>
    );
  })();
  // ---- Sonno: una sola scomposizione, fasi su corsie, pianificatore, metriche vs la tua norma ----
  const statusBar = (v: number | null) => {
    const i = v === null ? -1 : v >= 85 ? 2 : v >= 70 ? 1 : 0, cs = [K.recLo, K.recMid, K.recHi];
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 3 }}>{[0, 1, 2].map((j) => <div key={j} style={{ height: 6, borderRadius: 3, background: j === i ? cs[j] : K.track }} />)}</div>;
  };
  const cmpFoot = (text: string) => (
    <div style={{ ...row, gap: 6, background: K.bg, borderRadius: 8, padding: "6px 10px", marginTop: 4 }}>
      <svg width={18} height={10} viewBox="0 0 18 10" style={{ flex: "0 0 auto" }}><path d="M4 1 8 8H0z" fill={K.up} /><path d="M14 9 18 2h-8z" fill={K.warn} /></svg>
      <span style={{ fontSize: 12, color: K.t1, fontWeight: 600, flex: "0 0 auto" }}>{shortDay(d.date)}</span><span style={{ ...lbl, ...ell }}>{text}</span>
    </div>
  );
  const sleepBreak = [
    { name: "Ore vs bisogno", v: sp.suff, shown: sp.ratio === null ? null : Math.round(sp.ratio * 100), t: trendOf(sp.ratio, norm(d, (y: Day) => spH(y).ratio), true) },
    { name: "Orari", v: sp.cons, shown: sp.cons === null ? null : Math.round(sp.cons), t: trendOf(sp.cons, norm(d, (y: Day) => spH(y).cons), true) },
    { name: "Efficienza", v: sp.eff, shown: sp.effPct === null ? null : Math.round(sp.effPct), t: trendOf(sp.effPct, norm(d, (y: Day) => spH(y).effPct), true, 0.01) },
    { name: "Sonno ristoratore", v: sp.rest, shown: sp.rest === null ? null : Math.round(sp.rest), t: trendOf(sp.rest, norm(d, (y: Day) => spH(y).rest), true) },
  ];
  const breakCard = (
    <div style={{ position: "relative", marginTop: 10 }}>
      <div style={{ position: "absolute", top: -7, left: "50%", marginLeft: -7, width: 14, height: 14, background: K.card2, borderLeft: `1px solid ${K.line}`, borderTop: `1px solid ${K.line}`, transform: "rotate(45deg)" }} />
      <div aria-label="Scomposizione sonno" style={{ ...card, padding: "4px 16px 14px" }}>
        {sleepBreak.map((c, i) => (
          <div key={c.name} style={{ ...st(8), padding: "14px 0", borderBottom: i < sleepBreak.length - 1 ? `1px solid ${K.line}` : "none" }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <span style={{ ...caps, ...ell, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{c.name}</span>
              <span style={{ ...row, gap: 8, flex: "0 0 auto" }}><span style={{ ...caps, fontSize: 11, color: slBand(c.v).c }}>{slBand(c.v).t}</span><span style={numStyle(18)}>{c.shown === null ? "—" : `${c.shown}%`}</span>{tri(c.t)}</span>
            </div>
            {statusBar(c.v)}
          </div>
        ))}
        {cmpFoot("vs ultimi 30 giorni")}
      </div>
    </div>
  );
  const sleepWhy = sp.ratio === null ? "" : [
    "",
  ].filter(Boolean).join(" · ");
  const STG: { k: string; name: string; color: string }[] = [
    { k: "W", name: "Sveglio", color: K.t2 }, { k: "L", name: "Leggero", color: K.sleep }, { k: "D", name: "Profondo", color: K.violet }, { k: "R", name: "REM", color: K.teal },
  ];
  const stagesOf = (date: string) => (DATA.stages?.[date] ?? "").split(" ").map((t) => /^([WLDR])(\d+)\+(\d+)$/.exec(t)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ k: m[1], s: Number(m[2]), n: Number(m[3]) }));
  const stageShare = (y: Day, k: string): number | null => {
    if (!isNum(y.sleepMin) || y.sleepMin <= 0) return null;
    const aw = isNum(y.awakeMin) ? y.awakeMin : 0, tot = y.sleepMin + aw;
    const v = k === "W" ? (isNum(y.awakeMin) ? y.awakeMin : null) : k === "D" ? y.deepMin : k === "R" ? y.remMin : isNum(y.deepMin) && isNum(y.remMin) ? y.sleepMin - y.deepMin - y.remMin : null;
    return isNum(v) ? (100 * v) / tot : null;
  };
  const stripeDefs = (id: string) => <defs><pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={6} height={6} fill={K.track} /><rect width={2.4} height={6} fill={`${K.t1}26`} /></pattern></defs>;
  const lanesCard = (x: Day) => {
    const ss = stagesOf(x.date);
    if (!ss.length) return null;
    const T = Math.max(...ss.map((s) => s.s + s.n)), all = sum(ss.map((s) => s.n)) || 1;
    return (
      <div aria-label="Ultima notte" style={{ ...card, ...st(14) }}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>{x.date === DATA.today ? "Ultima notte" : `Notte · ${shortDay(x.date)}`}</span><span style={lbl}>{`${x.bedtime ?? "—"} → ${x.wakeTime ?? "—"}`}</span></div>
        <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}><svg width={18} height={8} style={{ display: "block" }}>{stripeDefs("stLeg")}<rect width={18} height={8} rx={2} fill="url(#stLeg)" /></svg>tua norma, ultimi 30 giorni</span>
        {STG.map((g) => {
          const m = sum(ss.filter((s) => s.k === g.k).map((s) => s.n)), p = (100 * m) / all, b = bandOf(x, (y: Day) => stageShare(y, g.k));
          const S = 60, X = (v: number) => (clamp(v, 0, S) / S) * 340;
          return (
            <div key={g.k} style={st(6)}>
              <div style={{ ...row, justifyContent: "space-between" }}>
                <span style={{ ...row, gap: 8 }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{g.name}</span><span style={{ ...lbl, color: g.color === K.t2 ? K.t1 : g.color, fontWeight: 700 }}>{`${Math.round(p)}%`}</span></span>
                <span style={numStyle(18)}>{hm(m)}</span>
              </div>
              <svg width="100%" height={14} viewBox="0 0 340 14" preserveAspectRatio="none" style={{ display: "block" }}>
                <rect x={0} y={0} width={340} height={14} rx={4} fill={K.track} />
                {ss.filter((s) => s.k === g.k).map((s, i) => <rect key={i} x={(s.s / T) * 340} y={1} width={Math.max(1.5, (s.n / T) * 340)} height={12} rx={2} fill={g.color} />)}
              </svg>
              <svg width="100%" height={6} viewBox="0 0 340 6" preserveAspectRatio="none" style={{ display: "block" }}>
                {stripeDefs(`st${g.k}`)}
                {b ? <rect x={X(Math.max(0, b.lo))} y={0} width={Math.max(3, X(b.hi) - X(Math.max(0, b.lo)))} height={6} rx={2} fill={`url(#st${g.k})`} /> : null}
                <rect x={Math.max(0, X(p) - 2)} y={0} width={4} height={6} rx={1} fill={g.color === K.t2 ? K.t1 : g.color} />
              </svg>
              {b ? <span style={lbl}>{`norma ${Math.round(Math.max(0, b.lo))}–${Math.round(b.hi)}% · ${p >= b.lo && p <= b.hi ? "nella tua norma" : p < b.lo ? "sotto la norma" : "sopra la norma"}`}</span> : null}
            </div>
          );
        })}
      </div>
    );
  };
  const normPill = (v: number | null | undefined, b: { lo: number; hi: number } | null, higherBetter: boolean) => {
    const ok = inNorm(v, b);
    if (ok === null || !isNum(v) || !b) return <span style={{ ...lbl }}>norma in arrivo</span>;
    const up = v > b.hi, good = ok ? true : up === higherBetter, c = ok ? K.up : good ? K.up : K.warn;
    return <span style={{ ...caps, alignSelf: "flex-start", fontSize: 10, lineHeight: "14px", padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", color: c, background: `${c}1F`, border: `1px solid ${c}55` }}>{ok ? "nella tua norma" : up ? "sopra la norma" : "sotto la norma"}</span>;
  };
  const wakeCount = (x: Day): number | null => (isNum(x.wakeups) ? x.wakeups : (() => { const w = stagesOf(x.date).filter((s) => s.k === "W" && s.s > 0); return stagesOf(x.date).length ? w.length : null; })());
  const sleepTiles = isNum(d.sleepMin) ? (
    <div style={two}>
      {[
        { name: "Tempo a letto", value: hm(d.inBedMin), v: d.inBedMin, b: bandOf(d, (y: Day) => y.inBedMin), hb: true, aria: undefined as string | undefined },
        { name: "Risvegli", value: `${wakeCount(d) ?? "—"}${isNum(d.awakeMin) ? ` · ${Math.round(d.awakeMin)} min` : ""}`, v: d.awakeMin, b: bandOf(d, (y: Day) => y.awakeMin), hb: false, aria: undefined },
        { name: "Scarto orari", value: sp.regDev === null ? "—" : `${Math.round(sp.regDev)} min`, v: sp.regDev, b: bandOf(d, (y: Day) => spH(y).regDev), hb: false, aria: "Costanza del sonno" },
        { name: "Ristoratore", value: hm(restorative(d)), v: restorative(d), b: bandOf(d, restorative), hb: true, aria: undefined },
      ].map((t) => (
        <div key={t.name} aria-label={t.aria ?? `Sonno ${t.name}`} style={{ ...card, ...st(6), padding: 14 }}>
          <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.t3 }}>{t.name}</span>
          <span style={numStyle(24)}>{t.value}</span>
          {normPill(t.v, t.b, t.hb)}
        </div>
      ))}
    </div>
  ) : null;
  const needChart = (() => {
    const W = 340, H = 168, pt = 22, pb = 34, n = days.length, bw = (W / n) * 0.5;
    const vals = days.map((x: Day) => (isNum(x.sleepMin) ? x.sleepMin : null)), needs = days.map((x: Day) => sleepNeed(x.date).need);
    const top = Math.max(540, ...nums(vals), ...needs);
    const y = (v: number) => pt + (1 - clamp(v / top, 0, 1)) * (H - pt - pb);
    const cx = (i: number) => (W / n) * (i + 0.5);
    return (
      <div style={{ ...card, ...st(8) }}>
        {legend([{ label: "Dormite", color: K.sleep }, { label: "Bisogno", color: K.t1 }])}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          <path d={needs.map((v, i) => `${i ? "L" : "M"}${cx(i)},${y(v)}`).join(" ")} fill="none" stroke={K.t1} strokeOpacity={0.7} strokeWidth={2} strokeDasharray="4 4" />
          {days.map((x: Day, i: number) => {
            const v = vals[i], on = x.date === d.date, p = parts(x.date);
            return (
              <g key={x.date} onClick={() => go(x.date)} style={{ cursor: "pointer" }}>
                <rect x={cx(i) - W / n / 2} y={0} width={W / n} height={H} fill="transparent" />
                {isNum(v) ? <rect x={cx(i) - bw / 2} y={y(v)} width={bw} height={Math.max(2, H - pb - y(v))} rx={3} fill={K.sleep} opacity={on ? 1 : 0.55} /> : null}
                <circle cx={cx(i)} cy={y(needs[i])} r={3} fill={K.bg} stroke={K.t1} strokeWidth={2} />
                {on ? <text x={cx(i)} y={isNum(v) ? Math.min(y(v), y(needs[i])) - 7 : H - pb - 8} fontSize={11} textAnchor="middle" fill={K.t1} fontWeight={700} fontFamily={NUM}>{isNum(v) ? hm(v) : "—"}</text> : null}
                <text x={cx(i)} y={H - 18} fontSize={10} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500} letterSpacing="0.06em">{WD[p.w].toUpperCase()}</text>
                <text x={cx(i)} y={H - 5} fontSize={11} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500}>{p.dd}</text>
              </g>
            );
          })}
        </svg>
        <span style={lbl}>Barre: ore dormite · linea: il sonno che ti serviva quella notte</span>
      </div>
    );
  })();
  const usualBed = (() => { const v = nums(prior(d).map((y: Day) => bedRel(y.bedtime))).sort((a, z) => a - z); return v.length >= 5 ? v[Math.floor(v.length / 2)] : null; })();
  const usualWake = (() => { const v = nums(prior(d).map((y: Day) => toMin(y.wakeTime))).sort((a, z) => a - z); return v.length >= 5 ? v[Math.floor(v.length / 2)] + 1440 : null; })();
  const sleepDetail = (withBack: boolean) => (
    <div style={st(14)}>
      {detailTop("sonno", withBack)}
      {breakCard}
      {insight(<>{sleepInsight}{sleepWhy ? <span style={{ display: "block", marginTop: 8, fontSize: 13, lineHeight: "18px", color: K.t2 }}>{`${sleepWhy}.`}</span> : null}</>)}
      {d.date === DATA.today ? (
        <div style={{ ...card, ...st(8) }}>
          <span style={capLbl(12)}>Stanotte</span>
          {(() => {
            const wR = tonight.wake + 1440, b100 = relBed(tonight.bedBy), b85 = relBed(tonight.bedBy85);
            const lo = Math.min(b100, usualBed ?? b100) - 30, hi = Math.max(wR, usualWake ?? wR) + 30, X = (m: number) => ((m - lo) / (hi - lo)) * 100;
            const left = eveNight === addDays(DATA.today, 1) ? eveLeft : null;
            const bar = (b: number, col: string, label: string, sub: string) => (
              <div style={st(6)}>
                <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{label}</span><span style={{ ...lbl, color: K.t2 }}>{sub}</span></div>
                <div style={{ position: "relative", height: 22, borderRadius: 6, background: K.track }}>
                  <div style={{ position: "absolute", left: `${X(b)}%`, width: `${X(wR) - X(b)}%`, top: 0, bottom: 0, borderRadius: 6, background: col, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", boxSizing: "border-box" }}>
                    <span style={{ ...numStyle(14, K.white) }}>{clock(b)}</span><span style={{ ...numStyle(14, K.white) }}>{clock(wR)}</span>
                  </div>
                </div>
              </div>
            );
            return (
              <div aria-label="Pianificatore sonno" style={st(12)}>
                <span style={{ fontSize: 15, lineHeight: "21px", color: K.t1 }}>{`Per recuperare tutto a letto entro le ${clock(tonight.bedBy)}; ne hai abbastanza (85%) entro le ${clock(tonight.bedBy85)}.`}</span>
                <div style={{ ...row, gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...caps, fontSize: 11, lineHeight: "16px", color: K.sleep, background: `${K.sleep}1F`, border: `1px solid ${K.sleep}59`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" }}>{`${hm(wR - b100)} a letto`}</span>
                  {left !== null && left > 0 ? <span style={{ ...lbl, color: K.t2 }}>{`mancano ${dur(left)}`}</span> : null}
                </div>
                <div style={st(10)}>
                  {usualBed !== null && usualWake !== null ? (
                    <div style={{ position: "relative", height: 16 }}>
                      <div style={{ position: "absolute", left: `${X(usualBed)}%`, width: `${X(usualWake) - X(usualBed)}%`, top: 6, height: 8, borderTop: `1.5px dashed ${K.t2}`, borderLeft: `1.5px dashed ${K.t2}`, borderRight: `1.5px dashed ${K.t2}`, boxSizing: "border-box" }} />
                      <span style={{ ...lbl, position: "absolute", left: `${X(usualBed)}%`, top: -8, background: K.card, padding: "0 4px", marginLeft: 6, whiteSpace: "nowrap" }}>{`di solito ${clock(usualBed)}–${clock(usualWake)}`}</span>
                    </div>
                  ) : null}
                  {bar(b100, K.sleep, "Recuperare tutto", `${hm(tonight.need)} di sonno`)}
                  {bar(b85, `${K.sleep}99`, "Abbastanza 85%", `${hm(0.85 * tonight.need)} di sonno`)}
                </div>
                <span style={txt}>{`Sveglia alle ${clock(tonight.wake)}${tonight.ev ? ` per ${tonight.ev.name} alle ${tonight.ev.time}` : ""}. ${tonight.debt > 0 || tonight.strainAdd > 0 ? `Ti serve un po' di più del solito${tonight.strainAdd > 0 ? " per lo sforzo di oggi" : ""}${tonight.debt > 0 ? `${tonight.strainAdd > 0 ? " e" : ""} per recuperare il sonno perso` : ""}.` : "Un sonno pieno ti tiene in pari."}`}</span>
              </div>
            );
          })()}
        </div>
      ) : null}
      {lanesCard(d)}
      {sleepTiles}
      {isNum(d.sleepMin) && !stagesOf(d.date).length ? (
        <div style={{ ...card, ...st(12) }}>
          <span style={capLbl(12)}>Fasi della notte</span>
          {segBar([{ label: "d", value: d.deepMin ?? 0, color: K.violet }, { label: "r", value: d.remMin ?? 0, color: K.teal }, { label: "l", value: light(d) ?? 0, color: K.sleep }], 14)}
          {legend([{ label: "Profondo", color: K.violet, text: hm(d.deepMin) }, { label: "REM", color: K.teal, text: hm(d.remMin) }, { label: "Leggero", color: K.sleep, text: hm(light(d)) }])}
        </div>
      ) : null}
      {weekTitle("Sonno · 7 giorni")}
      <div style={card}>{weekBars(days.map((x: Day) => sonnoOf(x)), 100, () => K.sleep, (v) => `${Math.round(v)}`)}</div>
      {weekTitle("Ore dormite vs bisogno · 7 giorni")}
      {needChart}
      {weekTitle("Orari: letto e sveglia")}
      <div style={{ ...card, ...st(10) }}>
        {days.map((x: Day) => { const b0 = bedRel(x.bedtime), w0 = toMin(x.wakeTime), s0 = 1320, span = 840, wR = w0 === null ? null : w0 + 1440; return (
          <button key={x.date} onClick={() => go(x.date)} style={{ ...btn, ...row, gap: 8 }}>
            <span style={{ ...lbl, width: 44, flex: "0 0 auto", color: x.date === d.date ? K.t1 : K.t3, fontWeight: x.date === d.date ? 700 : 400 }}>{shortDay(x.date)}</span>
            <div style={{ position: "relative", flex: 1, height: 10, borderRadius: 5, background: K.track }}>
              {b0 !== null && wR !== null ? <div style={{ position: "absolute", left: `${clamp((b0 - s0) / span, 0, 1) * 100}%`, width: `${Math.max(0.02, clamp((wR - s0) / span, 0, 1) - clamp((b0 - s0) / span, 0, 1)) * 100}%`, top: 0, bottom: 0, borderRadius: 5, background: K.sleep }} /> : null}
            </div>
            <span style={{ ...lbl, width: 84, textAlign: "right", flex: "0 0 auto" }}>{x.bedtime ?? "—"}→{x.wakeTime ?? "—"}</span>
          </button>
        ); })}
        <span style={lbl}>{usualBed !== null && usualWake !== null ? `Scala 22:00 → 12:00 · di solito a letto alle ${clock(usualBed)}, sveglia alle ${clock(usualWake)}` : `Scala 22:00 → 12:00 · a letto in media alle ${clock(bedAvg)}`}</span>
      </div>
      {sleepScatter}
      {sleepDays.length ? (
        <>
          {weekTitle("Notte per notte")}
          <div style={{ ...card, ...st(12) }}>
            {legend([{ label: "Profondo", color: K.violet }, { label: "REM", color: K.teal }, { label: "Leggero", color: K.sleep }])}
            {[...sleepDays].reverse().map((x: Day) => (
              <button key={x.date} onClick={() => go(x.date)} style={{ ...btn, ...st(4) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 14, color: K.t1, fontWeight: x.date === d.date ? 700 : 400 }}>{shortDay(x.date)} · {hm(x.sleepMin)}</span><span style={lbl}>prof. {hm(x.deepMin)} · REM {hm(x.remMin)}</span></div>
                <div style={{ width: `${clamp(((x.sleepMin ?? 0) / 540) * 100, 4, 100)}%` }}>{segBar([{ label: "d", value: x.deepMin ?? 0, color: K.violet }, { label: "r", value: x.remMin ?? 0, color: K.teal }, { label: "l", value: light(x) ?? 0, color: K.sleep }], 8)}</div>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  // ---- RECUPERO ----
  const recInsight = dRec === null
    ? "Recupero non ancora disponibile: mancano HRV, FC a riposo o sonno di questo giorno."
    : (() => {
      const w = (v: number | null | undefined, b: { lo: number; hi: number } | null) => (!isNum(v) || !b ? null : v < b.lo ? "sotto la tua norma" : v > b.hi ? "sopra la tua norma" : "nella tua norma");
      const h = w(d.hrvMs, bandOf(d, (y: Day) => y.hrvMs)), r = w(d.rhr, bandOf(d, (y: Day) => y.rhr));
      const a = h && r ? (h === r ? `HRV e FC a riposo ${h}` : `HRV ${h}, FC a riposo ${r}`) : h ? `HRV ${h}` : r ? `FC a riposo ${r}` : "";
      const sl = dSn !== null && dSn < 34 ? ", frenato dalla notte corta" : "";
      const tw = d.date === DATA.today && d.workouts.some((w: Workout) => w.status === "fatto");
      return `${a ? `${a}: ` : ""}recupero ${dRec >= 67 ? "alto" : dRec >= 34 ? "medio" : "basso"}${sl}.${tw ? " È il recupero di stanotte: lo sforzo di oggi peserà su quello di domani." : ""}`;
    })();
  // 30 giorni fino al giorno scelto, con la fascia della tua norma (media ± la variazione tipica)
  const normChart = (name: string, f: (y: Day) => number | null | undefined, color: string, u: string, hb: boolean) => {
    const win = H30.filter((y: Day) => y.date <= d.date && y.date >= addDays(d.date, -29));
    const vs = win.map(f), v = nums(vs);
    if (v.length < 4) return null;
    // la stessa fascia usata ovunque (testo, consigli, pill): i 30 giorni prima del giorno scelto
    const m = v.reduce((a, b) => a + b, 0) / v.length, s = sdev(v) ?? 0, bd = bandOf(d, f), bLo = bd ? bd.lo : m - s, bHi = bd ? bd.hi : m + s;
    const W = 340, H = 140, pl = 26, pr = 8, pt = 10, pb = 20;
    const lo = Math.min(...v, bLo) - 2, hi = Math.max(...v, bHi) + 2;
    const X = (i: number) => pl + (i * (W - pl - pr)) / Math.max(win.length - 1, 1), Y = (x: number) => pt + (1 - (x - lo) / (hi - lo || 1)) * (H - pt - pb);
    const pts = vs.map((x, i) => (isNum(x) ? [X(i), Y(x)] as [number, number] : null)).filter((p): p is [number, number] => p !== null);
    const cur = f(d), ok = inNorm(cur, { lo: bLo, hi: bHi }), hiSide = isNum(cur) && cur > bHi, good = ok === null ? null : ok || hiSide === hb;
    return (
      <div aria-label={`${name} 30 giorni`} style={{ ...card, ...st(8) }}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>{name}</span><span style={{ ...lbl, color: good === null ? K.t3 : good ? K.up : K.warn }}>{`${shortDay(d.date).toLowerCase()} ${fmt(cur, u)}${ok === null ? "" : ok ? " · nella norma" : hiSide ? " · sopra la norma" : " · sotto la norma"}`}</span></div>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          <rect x={pl} y={Y(bHi)} width={W - pl - pr} height={Math.max(2, Y(bLo) - Y(bHi))} fill={color} opacity={0.14} rx={4} />
          <text x={pl - 4} y={Y(bHi) + 4} fontSize={10} textAnchor="end" fill={K.t3}>{Math.round(bHi)}</text>
          <text x={pl - 4} y={Y(bLo) + 4} fontSize={10} textAnchor="end" fill={K.t3}>{Math.round(bLo)}</text>
          {pts.length > 1 ? <path d={smooth(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" /> : null}
          {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2} fill={color} />)}
          {isNum(cur) ? <circle cx={X(win.length - 1)} cy={Y(cur)} r={5} fill={K.bg} stroke={K.t1} strokeWidth={2.5} /> : null}
          {win.map((y: Day, i: number) => (i % 7 === (win.length - 1) % 7 ? <text key={y.date} x={X(i)} y={H - 5} fontSize={10} textAnchor={i === win.length - 1 ? "end" : "middle"} fill={i === win.length - 1 ? K.t1 : K.t3}>{`${parts(y.date).dd}/${parts(y.date).m}`}</text> : null))}
        </svg>
        <span style={lbl}>{`Fascia: la tua norma degli ultimi 30 giorni, ${Math.round(bLo)}–${Math.round(bHi)}${u}`}</span>
      </div>
    );
  };
  const recEffort = (() => {
    const W = 340, H = 168, pt = 22, pb = 34, n = days.length, bw = (W / n) * 0.5, cx = (i: number) => (W / n) * (i + 0.5);
    const y = (v: number) => pt + (1 - clamp(v / 100, 0, 1)) * (H - pt - pb);
    const st21 = days.map((x: Day) => strainScore(x));
    const sp2 = st21.map((v, i) => (isNum(v) ? [cx(i), y((v / 21) * 100)] as [number, number] : null)).filter((p): p is [number, number] => p !== null);
    return (
      <div aria-label="Recupero e sforzo" style={{ ...card, ...st(8) }}>
        {legend([{ label: "Recupero, colore per livello", color: K.t2 }, { label: "Sforzo su 21", color: K.strain }])}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
          {days.map((x: Day, i: number) => {
            const v = recScore(x), on = x.date === d.date, p = parts(x.date);
            return (
              <g key={x.date} onClick={() => go(x.date)} style={{ cursor: "pointer" }}>
                <rect x={cx(i) - W / n / 2} y={0} width={W / n} height={H} fill="transparent" />
                {isNum(v) ? <rect x={cx(i) - bw / 2} y={y(v)} width={bw} height={Math.max(2, H - pb - y(v))} rx={3} fill={recColor(v)} opacity={on ? 1 : 0.5} /> : <rect x={cx(i) - bw / 2} y={H - pb - 2} width={bw} height={2} fill={K.track} />}
                <text x={cx(i)} y={H - 18} fontSize={10} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500} letterSpacing="0.06em">{WD[p.w].toUpperCase()}</text>
                <text x={cx(i)} y={H - 5} fontSize={11} textAnchor="middle" fill={on ? K.t1 : K.t3} fontWeight={on ? 700 : 500}>{p.dd}</text>
              </g>
            );
          })}
          {sp2.length > 1 ? <path d={smooth(sp2)} fill="none" stroke={K.strain} strokeWidth={2.5} strokeLinecap="round" /> : null}
          {st21.map((v, i) => (isNum(v) ? <g key={i}><circle cx={cx(i)} cy={y((v / 21) * 100)} r={3.5} fill={K.bg} stroke={K.strain} strokeWidth={2} /><text x={cx(i)} y={y((v / 21) * 100) - 8} fontSize={10} textAnchor="middle" fill={K.strain} fontWeight={700} fontFamily={NUM}>{fmt(v)}</text></g> : null))}
        </svg>
        <span style={txt}>{(() => { const pairs = days.map((x: Day) => ({ r: recScore(x), s: strainScore(x) })).filter((q) => isNum(q.r) && isNum(q.s)) as { r: number; s: number }[]; const over = pairs.filter((q) => (q.r < 34 && q.s >= 10) || (q.r < 67 && q.s >= 14)).length; return !pairs.length ? "Servono più giorni con recupero e sforzo." : over === 0 ? "Questa settimana lo sforzo è rimasto in linea con il recupero." : `${over} ${over === 1 ? "giorno" : "giorni"} con più sforzo di quanto il recupero suggeriva: dopo quei giorni dà spazio al sonno.`; })()}</span>
      </div>
    );
  })();
  const recDetail = (withBack: boolean) => (
    <div style={st(14)}>
      {detailTop("recupero", withBack)}
      {contribCard([
        { icon: "heart", label: "Variabilità cardiaca", value: fmt(d.hrvMs), trend: trendOf(d.hrvMs, bHrv, true) },
        { icon: "pulse", label: "FC a riposo", value: fmt(d.rhr), trend: trendOf(d.rhr, bRhr, false) },
        { icon: "moon", label: "Sonno", value: dSn === null ? "—" : String(dSn), trend: trendOf(dSn, bSlScore, true) },
        { icon: "bolt", label: "Respirazione", value: fmt(d.breathing), trend: trendOf(d.breathing, bBr, null) },
      ])}
      {insight(recInsight)}
      {monitorLine}
      {d.date === DATA.today ? hrNowCard : null}
      {weekTitle("Recupero e sforzo · 7 giorni")}
      {recEffort}
      {weekTitle("HRV · 30 giorni · più alta è meglio")}
      {normChart("HRV", (y: Day) => y.hrvMs, K.violet, " ms", true)}
      {weekTitle("FC a riposo · 30 giorni · più bassa è meglio")}
      {normChart("FC a riposo", (y: Day) => y.rhr, K.recLo, " bpm", false)}
      <div aria-label="Consigli recupero" style={{ ...card, ...st(10) }}>
        <span style={capLbl(12)}>Consigli</span>
        {recTips.slice(0, 4).map((k, i) => <div key={i} style={{ ...row, alignItems: "flex-start", gap: 10 }}>{ic(k.icon, K.t2, 18)}<span style={{ ...txt, flex: 1 }}>{k.t}</span></div>)}
      </div>
    </div>
  );

  // ---- SFORZO ----
  const doneW = chronoW.filter((e) => e.w.status === "fatto");
  type Zones = { fatBurn?: number | null; cardio?: number | null; peak?: number | null };
  const dayZones = (x: Day) => {
    const zs = x.workouts.map((w: Workout) => w.zoneMin).filter((z): z is Zones => !!z);
    return zs.length ? { fat: sum(zs.map((z) => z.fatBurn)), cardio: sum(zs.map((z) => z.cardio)), peak: sum(zs.map((z) => z.peak)) } : null;
  };
  const above140 = (x: Day): number | null => {
    const v = x.workouts.map((w: Workout) => (isNum(w.minAbove140) ? w.minAbove140 : isNum(w.pctAbove140) && isNum(w.durationMin) ? (w.pctAbove140 / 100) * w.durationMin : null));
    return nums(v).length ? Math.round(sum(v)) : null;
  };
  const zoneBars = (z: { fat: number; cardio: number; peak: number }, title: string) => {
    const zt = z.fat + z.cardio + z.peak;
    return zt > 0 ? (
      <div style={{ ...card, ...st(10) }}>
        <span style={capLbl(12)}>{title} · {zt} min</span>
        {([["Brucia grassi", z.fat, K.sleep], ["Cardio", z.cardio, K.strain], ["Picco", z.peak, K.recLo]] as [string, number, string][]).map(([n, v, c]) => (
          <div key={n} style={{ ...row, gap: 10 }}><span style={{ ...lbl, width: 92, flex: "0 0 auto", color: K.t2 }}>{n}</span><div style={{ flex: 1 }}>{hbar(v / zt, c, 8)}</div><span style={{ ...numStyle(15), width: 78, textAlign: "right", flex: "0 0 auto" }}>{v} min · {Math.round((v * 100) / zt)}%</span></div>
        ))}
      </div>
    ) : null;
  };
  const strInsight = dStr === null ? "Sforzo non disponibile: mancano le calorie attive." : `${dStr >= 18 ? "Carico molto alto: oggi il corpo ha lavorato tantissimo." : dStr >= 14 ? "Carico impegnativo per il sistema cardiovascolare." : dStr >= 10 ? "Carico moderato." : "Carico leggero."}${strainRange ? (dStr < strainRange[0] ? (live ? " Sotto la fascia di oggi: c'è ancora spazio per muoverti." : " Sotto la fascia del giorno.") : dStr > strainRange[1] ? " Sopra la fascia del giorno: domani più leggero." : " Dentro la fascia del giorno.") : ""}${live ? " Giornata in corso." : ""}`;
  const byKind: Record<string, { n: number; kcal: number; min: number }> = {};
  doneW.forEach((e) => { const k = kindOf(e.w); const o = byKind[k] ?? { n: 0, kcal: 0, min: 0 }; o.n += 1; o.kcal += e.w.kcal ?? 0; o.min += e.w.durationMin ?? 0; byKind[k] = o; });
  const kinds = Object.entries(byKind).sort((a, z) => z[1].min - a[1].min);
  const maxKindMin = Math.max(1, ...kinds.map(([, o]) => o.min));
  const maxHrs = nums(doneW.map((e) => e.w.maxHr));
  // zone personali (riserva cardiaca tra FC a riposo e FC massima), dai battiti minuto per minuto
  const ZD = DATA.zones ?? null;
  const ZC = [K.sleep, K.up, K.recMid, K.warn, K.recLo];
  const zEdges = ZD ? [0.5, 0.6, 0.7, 0.8, 0.9].map((f) => Math.round(ZD.rhr + f * (ZD.max - ZD.rhr))) : [];
  const zOf = (x: Day): number[] | null => {
    const dz = ZD?.days?.[x.date] ?? null, ss = x.workouts.filter((w: Workout) => w.status === "fatto").map((w: Workout) => sessZones(x.date, w)).filter((q): q is number[] => !!q);
    if (!ss.length) return dz;
    const sz = [0, 1, 2, 3, 4].map((i) => sum(ss.map((q) => q[i])));
    return dz ? dz.map((v, i) => Math.max(v, sz[i])) : sz;
  };
  const z13 = (x: Day): number | null => { const z = zOf(x); return z ? z[0] + z[1] + z[2] : null; };
  const z45 = (x: Day): number | null => { const z = zOf(x); return z ? z[3] + z[4] : null; };
  const zoneIdx = (bpm: number) => { for (let i = 4; i >= 0; i--) if (bpm >= zEdges[i]) return i; return -1; };
  const forzaMin = (x: Day): number => sum(x.workouts.filter((w: Workout) => w.status === "fatto" && isGym(kindOf(w))).map((w: Workout) => w.durationMin));
  const zoneCard = (zs: number[], title: string, ref: number[] | null, refText: string) => {
    const mx = Math.max(1, ...zs, ...(ref ?? []));
    return (
      <div aria-label="Zone personali" style={{ ...card, ...st(10) }}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>{title}</span><span style={lbl}>{`${sum(zs)} min`}</span></div>
        {zs.map((v, i) => (
          <div key={i} style={st(4)}>
            <div style={{ ...row, justifyContent: "space-between", gap: 8 }}>
              <span style={{ ...row, gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ZC[i], flex: "0 0 auto" }} /><span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{`Zona ${i + 1}`}</span><span style={lbl}>{i < 4 ? `${zEdges[i]}–${zEdges[i + 1] - 1} bpm` : `${zEdges[4]}+ bpm`}</span></span>
              <span style={numStyle(16)}>{`${v} min`}</span>
            </div>
            <div style={{ position: "relative" }}>{hbar(v / mx, ZC[i], 8)}{ref ? <div style={{ position: "absolute", top: -2, bottom: -2, left: `calc(${(clamp(ref[i] / mx, 0, 1) * 100).toFixed(1)}% - 1px)`, width: 2, background: K.t1, opacity: 0.7, borderRadius: 1 }} /> : null}</div>
          </div>
        ))}
        {ref ? <span style={lbl}>{refText}</span> : null}
      </div>
    );
  };
  const strDetail = (withBack: boolean) => {
    const z = dayZones(d);
    const zd = zOf(d), zPrior = prior(d).filter((y: Day) => y.date !== DATA.today).map(zOf).filter((q): q is number[] => !!q);
    const zRef = zPrior.length >= 5 ? [0, 1, 2, 3, 4].map((i) => Math.round(sum(zPrior.map((q) => q[i])) / zPrior.length)) : null;
    const fNorm = baseOf(d, forzaMin, true);
    return (
      <div style={st(14)}>
        {detailTop("sforzo", withBack)}
        {(() => {
          const dn = doneOfDay(d), kc = sum(dn.map((e) => e.w.kcal)), rows = workoutRows(d, true);
          return (
            <div aria-label="Allenamenti del giorno" style={{ ...card, padding: "14px 16px 4px" }}>
              <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>{live ? "Oggi" : "Allenamenti"}</span><span style={lbl}>{dn.length ? `${dn.length} ${dn.length === 1 ? "sessione" : "sessioni"}${kc ? ` · ${kcalTxt(kc)} kcal` : ""}` : ""}</span></div>
              {rows ?? <span style={{ ...txt, display: "block", padding: "10px 0 12px" }}>{live ? "Ancora nessun allenamento oggi." : "Nessun allenamento in questo giorno."}</span>}
            </div>
          );
        })()}
        {contribCard(zd ? [
          { icon: "heart", label: "Zone 1–3", value: hm(z13(d)), trend: trendOf(z13(d), norm(d, z13, true), true) },
          { icon: "pulse", label: "Zone 4–5", value: hm(z45(d)), trend: trendOf(z45(d), norm(d, z45, true), true) },
          { icon: "dumbbell", label: "Forza", value: hm(forzaMin(d)), trend: trendOf(forzaMin(d), fNorm, true) },
          { icon: "steps", label: "Passi", value: fmt(d.steps), trend: trendOf(d.steps, bSteps, true) },
        ] : [
          { icon: "pulse", label: "Minuti a FC ≥ 120", value: `${cardioMin(d)}`, trend: trendOf(cardioMin(d), bCardio, true) },
          { icon: "dumbbell", label: "Forza", value: hm(forzaMin(d)), trend: trendOf(forzaMin(d), fNorm, true) },
          { icon: "steps", label: "Passi", value: fmt(d.steps), trend: trendOf(d.steps, bSteps, true) },
        ], "vs ultimi 30 giorni · forza vs settimana")}
        {insight(strInsight)}
        {effortCard}
        {zd ? zoneCard(zd, "Zone personali", zRef, `Riga bianca: la tua media al giorno negli ultimi 30 giorni. Zone dalla tua FC a riposo (${ZD?.rhr}) alla massima (${ZD?.max}).`) : z ? zoneBars(z, "Zone di frequenza cardiaca") : null}
        {gymCard}
        {weekTitle("Sforzo · 7 giorni")}
        <div style={card}>{weekBars(days.map((x: Day) => strainScore(x)), 21, () => K.strain, (v) => fmt(v))}</div>
        {weekTitle("Passi · linea = 10.000")}
        <div style={card}>{weekBars(days.map((x: Day) => x.steps), 10000, (v) => (v >= 10000 ? K.strain : `${K.strain}AA`), (v) => `${r1(v / 1000).toLocaleString("it-IT")}k`, 10000)}</div>
        {kinds.length ? (
          <div style={{ ...card, ...st(12) }}>
            <span style={capLbl(12)}>Settimana per tipo</span>
            {kinds.map(([k, o]) => (
              <div key={k} style={st(6)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ ...row, gap: 8, fontSize: 14, color: K.t1 }}>{ic(kindIcon(k), K.t2, 18)}{KIND_NAME[k] ?? k} ×{o.n}</span><span style={lbl}>{o.min ? `${o.min} min` : "durata n.d."}{o.kcal ? ` · ${String(Math.round(o.kcal)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kcal` : ""}</span></div>
                {hbar(o.min / maxKindMin, K.strain)}
              </div>
            ))}
            <div style={three}>
              {stat("Sessioni", String(doneW.length), "fatte")}
              {stat("Minuti", String(sum(doneW.map((e) => e.w.durationMin))), "registrati")}
              {stat("FC max", maxHrs.length ? String(Math.max(...maxHrs)) : "—", "bpm")}
            </div>
          </div>
        ) : null}
        {chronoW.some((e) => e.date !== d.date) ? listCard("Altre sessioni", <span style={lbl}>{chronoW.filter((e) => e.date !== d.date).length}</span>, [...days].reverse().filter((x: Day) => x.date !== d.date).flatMap((x: Day) => (x.workouts.length ? actRows(x, true) : []))) : null}
        {upcomingCard}
      </div>
    );
  };

  // =================== DETTAGLIO ATTIVITÀ ===================
  const backBar = (title: string) => (
    <div style={frostIn}>
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 40px", alignItems: "center" }}>
        <button onClick={closeScreen} aria-label="Indietro" style={{ ...btn, width: 40, height: 40, display: "flex", alignItems: "center" }}>{ic("back", K.t1, 24, 2.2)}</button>
        <span style={{ ...caps, ...ell, fontSize: 13, textAlign: "center", color: K.t1 }}>{title}</span><span />
      </div>
    </div>
  );
  const delta = (a: number | null | undefined, b: number | null | undefined, u: string) => (isNum(a) && isNum(b) ? `${a - b > 0 ? "+" : a - b < 0 ? "−" : "±"}${r1(Math.abs(a - b)).toLocaleString("it-IT")}${u}` : null);
  const actScreen = (key: string) => {
    const idx = chronoW.findIndex((e) => e.key === key);
    if (idx < 0) return backBar("Attività");
    const { w, date } = chronoW[idx];
    const k = kindOf(w), s = actStrain(w);
    const prev = [...chronoW.slice(0, idx)].reverse().find((e) => kindOf(e.w) === k && e.w.status === "fatto");
    const ps = prev ? actStrain(prev.w) : null;
    const z = w.zoneMin ?? null;
    const above = isNum(w.pctAbove140) ? `${w.pctAbove140}%${isNum(w.minAbove140) ? ` · ${w.minAbove140} min` : ""}` : isNum(w.minAbove140) ? `${w.minAbove140} min` : "—";
    const cmp: [string, string | null, number | null | undefined, number | null | undefined][] = prev ? ([
      ["Sforzo", delta(s, ps, ""), s, ps], ["FC media", delta(w.avgHr, prev.w.avgHr, " bpm"), w.avgHr, prev.w.avgHr], ["FC max", delta(w.maxHr, prev.w.maxHr, " bpm"), w.maxHr, prev.w.maxHr],
      ["Durata", delta(w.durationMin, prev.w.durationMin, " min"), w.durationMin, prev.w.durationMin], ["Calorie", delta(w.kcal, prev.w.kcal, " kcal"), w.kcal, prev.w.kcal], ["% sopra 140", delta(w.pctAbove140, prev.w.pctAbove140, " pt"), w.pctAbove140, prev.w.pctAbove140],
    ] as [string, string | null, number | null | undefined, number | null | undefined][]).filter(([, v]) => v !== null) : [];
    return (
      <div style={st(14)}>
        {backBar(KIND_NAME[k] ?? "Attività")}
        <div style={{ ...st(4), alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: 20, lineHeight: "26px", fontWeight: 600, color: K.t1 }}>{w.name}</span>
          <span style={lbl}>{dayTitle(date)} · {w.time}{w.partners ? ` · ${w.partners}` : ""}{w.status === "pianificato" ? " · pianificato" : ""}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
          {ring((s ?? 0) / 21, K.strain, 200, 12, <><span style={numStyle(60, s === null ? K.t3 : K.t1)}>{s === null ? "—" : s.toLocaleString("it-IT")}</span><span style={{ ...caps, fontSize: 12, color: K.t1, marginTop: 4 }}>Sforzo attività</span></>, true)}
        </div>
        {contribCard([
          { icon: "clock", label: "Durata", value: fmt(w.durationMin, " min"), trend: prev ? trendOf(w.durationMin, prev.w.durationMin, true) : null },
          { icon: "pulse", label: "FC media", value: fmt(w.avgHr, " bpm"), trend: prev ? trendOf(w.avgHr, prev.w.avgHr, null) : null },
          { icon: "heart", label: "FC max", value: fmt(w.maxHr, " bpm"), trend: prev ? trendOf(w.maxHr, prev.w.maxHr, null) : null },
          { icon: "flame", label: "Calorie", value: fmt(w.kcal, " kcal"), trend: prev ? trendOf(w.kcal, prev.w.kcal, true) : null },
          { icon: "bolt", label: "Sopra 140 bpm", value: above, trend: null },
        ], prev ? `vs ${KIND_NAME[k] ?? k} di ${shortDay(prev.date)}` : "primo di questo tipo in 7 giorni")}
        {(() => {
          const key = (e: { date: string; w: Workout }) => `${e.date} ${e.w.time.slice(0, 5)}`;
          const ser = ZD?.sessions?.[key({ date, w })];
          if (!ser || !zEdges.length) return z ? zoneBars({ fat: z.fatBurn ?? 0, cardio: z.cardio ?? 0, peak: z.peak ?? 0 }, "Zone di frequenza cardiaca") : null;
          const hr = ser.split(" ").map(Number), ok = hr.filter((v) => v > 0);
          if (ok.length < 3) return null;
          const zm = [0, 1, 2, 3, 4].map((i) => hr.filter((v) => v > 0 && zoneIdx(v) === i).length);
          const past = chronoW.slice(0, idx).filter((e) => kindOf(e.w) === k && e.w.status === "fatto").map((e) => ZD?.sessions?.[key(e)]).filter((s): s is string => !!s).map((s) => s.split(" ").map(Number));
          const ref = past.length ? [0, 1, 2, 3, 4].map((i) => Math.round(sum(past.map((p) => p.filter((v) => v > 0 && zoneIdx(v) === i).length)) / past.length)) : null;
          const W = 340, H = 140, pl = 28, pr = 6, pt = 8, pb = 18;
          const lo = Math.min(...ok) - 5, hi = Math.max(...ok) + 5;
          const X = (i: number) => pl + (i * (W - pl - pr)) / Math.max(hr.length - 1, 1), Y = (v: number) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
          return (
            <>
              <div aria-label="Frequenza cardiaca sessione" style={{ ...card, ...st(8) }}>
                <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>Frequenza cardiaca</span><span style={lbl}>{`media ${Math.round(avg(ok) as number)} · max ${Math.max(...ok)} bpm`}</span></div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
                  {zEdges.filter((e) => e > lo && e < hi).map((e) => <g key={e}><line x1={pl} x2={W - pr} y1={Y(e)} y2={Y(e)} stroke={K.t3} strokeOpacity={0.5} strokeDasharray="2 4" /><text x={pl - 4} y={Y(e) + 3} fontSize={9} textAnchor="end" fill={K.t3}>{e}</text></g>)}
                  {hr.map((v, i) => (i > 0 && v > 0 && hr[i - 1] > 0 ? <line key={i} x1={X(i - 1)} y1={Y(hr[i - 1])} x2={X(i)} y2={Y(v)} stroke={zoneIdx(v) >= 0 ? ZC[zoneIdx(v)] : K.t3} strokeWidth={2.5} strokeLinecap="round" /> : null))}
                  <text x={pl} y={H - 4} fontSize={10} fill={K.t3}>{w.time.slice(0, 5)}</text>
                  <text x={W - pr} y={H - 4} fontSize={10} textAnchor="end" fill={K.t3}>{`${hr.length - 1} min`}</text>
                </svg>
                {legend([0, 1, 2, 3, 4].map((i) => ({ label: `Z${i + 1}`, color: ZC[i] })))}
              </div>
              {zoneCard(zm, "Zone in questa sessione", ref, past.length === 1 ? `Riga bianca: la sessione di ${(KIND_NAME[k] ?? k).toLowerCase()} precedente.` : `Riga bianca: media delle ${past.length} sessioni di ${(KIND_NAME[k] ?? k).toLowerCase()} precedenti.`)}
            </>
          );
        })()}
        {isNum(w.pctAbove140) ? (
          <div style={{ ...card, ...st(10) }}>
            <span style={capLbl(12)}>Intensità</span>
            {segBar([{ label: "a", value: 100 - w.pctAbove140, color: K.sleep }, { label: "b", value: w.pctAbove140, color: K.strain }], 12)}
            {legend([{ label: "Sotto 140 bpm", color: K.sleep, text: `${100 - w.pctAbove140}%` }, { label: "Sopra 140 bpm", color: K.strain, text: `${w.pctAbove140}%` }])}
          </div>
        ) : null}
        {prev ? (
          <div style={{ ...card, ...st(10) }}>
            <span style={capLbl(12)}>Confronto con la precedente</span>
            <span style={lbl}>{KIND_NAME[k] ?? k} di {dayTitle(prev.date)} · {prev.w.time}</span>
            {cmp.length ? cmp.map(([n, v, a, b]) => (
              <div key={n} style={{ ...row, justifyContent: "space-between" }}><span style={txt}>{n}</span><span style={{ ...row, gap: 8 }}><span style={lbl}>{fmt(b)} → {fmt(a)}</span><span style={numStyle(16)}>{v}</span></span></div>
            )) : <span style={txt}>Nessun dato numerico in comune da confrontare.</span>}
          </div>
        ) : null}
        {w.exercises && w.exercises.length ? (
          <div style={{ ...card, ...st(8) }}>
            <span style={capLbl(12)}>Esercizi</span>
            {w.exercises.map((e, i) => <div key={i} style={{ ...row, gap: 10 }}>{ic("dumbbell", K.t3, 16)}<span style={txt}>{e}</span></div>)}
          </div>
        ) : null}
        {w.detail ? <div style={{ ...card, ...st(6) }}><span style={capLbl(12)}>Note</span><span style={{ ...txt, overflowWrap: "anywhere" }}>{w.detail}</span></div> : null}
      </div>
    );
  };

  // =================== DETTAGLIO PASTO ===================
  const donut = (segs: { label: string; value: number; color: string }[], size: number, stroke: number, center: ReactNode) => {
    const r = (size - stroke) / 2, C = 2 * Math.PI * r, tot = segs.reduce((a, x) => a + x.value, 0);
    let off = 0;
    return (
      <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.track} strokeWidth={stroke} />
          {tot > 0 ? segs.map((x) => { const len = (x.value / tot) * C; const el = <circle key={x.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 3)} ${C}`} strokeDashoffset={-off} />; off += len; return el; }) : null}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{center}</div>
      </div>
    );
  };
  const MC = { p: K.violet, c: K.strain, f: K.recMid };
  const macroLegend = (p: number, c: number, f: number) => {
    const tot = p * 4 + c * 4 + f * 9 || 1;
    return legend([{ label: "Proteine", color: MC.p, text: `${fmt(p, " g")} · ${Math.round((p * 400) / tot)}%` }, { label: "Carboidrati", color: MC.c, text: `${fmt(c, " g")} · ${Math.round((c * 400) / tot)}%` }, { label: "Grassi", color: MC.f, text: `${fmt(f, " g")} · ${Math.round((f * 900) / tot)}%` }]);
  };
  const mealScreen = (key: string) => {
    const e = allMeals.find((x) => x.key === key);
    if (!e) return backBar("Pasto");
    const m = e.m, day = days.find((x: Day) => x.date === e.date) ?? d;
    const ok = isNum(m.protein) && isNum(m.carbs) && isNum(m.fat);
    const share = (v: number | null | undefined, t: number | null | undefined) => (isNum(v) && isNum(t) && t > 0 ? `${Math.round((v / t) * 100)}% del giorno` : "");
    const rows: [string, string, number | null | undefined, string, number | null | undefined][] = [
      ["flame", "Calorie", m.kcal, " kcal", day.eatenKcal], ["food", "Proteine", m.protein, " g", day.proteinG],
      ["food", "Carboidrati", m.carbs, " g", dayMacro(day, "carbs").v], ["food", "Grassi", m.fat, " g", dayMacro(day, "fat").v],
      ["food", "Zuccheri", m.sugar, " g", dayMacro(day, "sugar").v], ["food", "Fibre", m.fibre, " g", dayMacro(day, "fibre").v], ["food", "Sale", m.salt, " g", dayMacro(day, "salt").v],
    ];
    return (
      <div style={st(14)}>
        {backBar(m.name)}
        <div style={{ ...st(4), alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: 17, lineHeight: "24px", fontWeight: 600, color: K.t1 }}>{m.dish}</span>
          <span style={lbl}>{dayTitle(e.date)} · {m.time}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
          {donut(ok ? [{ label: "p", value: (m.protein as number) * 4, color: MC.p }, { label: "c", value: (m.carbs as number) * 4, color: MC.c }, { label: "f", value: (m.fat as number) * 9, color: MC.f }] : [], 200, 14, <><span style={numStyle(54)}>{fmt(m.kcal)}</span><span style={{ ...caps, fontSize: 12, color: K.t1 }}>kcal</span></>)}
        </div>
        {ok ? <div style={{ display: "flex", justifyContent: "center" }}>{macroLegend(m.protein as number, m.carbs as number, m.fat as number)}</div> : <span style={{ ...lbl, textAlign: "center" }}>Macro incompleti per questo pasto.</span>}
        <div style={{ ...card, padding: "4px 16px" }}>
          {rows.map(([icon, label, v, u, tot], i) => (
            <div key={label} style={{ ...row, padding: "13px 0", borderBottom: i < rows.length - 1 ? `1px solid ${K.line}` : "none" }}>
              {ic(icon, K.t2, 18, 1.6)}
              <span style={{ ...caps, flex: 1, fontSize: 12, color: K.t1 }}>{label}</span>
              <span style={lbl}>{share(v, tot)}</span>
              <span style={{ ...numStyle(18), minWidth: 70, textAlign: "right" }}>{fmt(v, u)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // =================== COACH ===================
  const coachScreen = (
    <div style={st(14)}>
      {backBar("Prospettiva del giorno")}
      {insight(`${outlookTitle}. ${outlookFull}`)}
      <div style={{ ...card, padding: "4px 16px" }}>
        {coachTips.map((k, i) => (
          <div key={i} style={{ ...row, alignItems: "flex-start", padding: "14px 0", borderBottom: i < coachTips.length - 1 ? `1px solid ${K.line}` : "none" }}>{ic(k.icon, K.t2, 20, 1.6)}<span style={{ ...txt, flex: 1, color: K.t1 }}>{k.t}</span></div>
        ))}
      </div>
      {upcomingCard}
    </div>
  );

  // =================== ETÀ BIOLOGICA ===================
  const bioScreen = (
    <div style={st(14)}>
      {backBar("Longevità")}
      {bio?.updatedAt ? <span style={{ ...lbl, textAlign: "center" }}>Input aggiornati il {longDate(bio.updatedAt)}</span> : null}
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 10px" }}>{orb(300)}</div>
      <div style={{ ...card, ...st(8) }}>
        <span style={capLbl(12)}>Somma dei contributi</span>
        <svg width="100%" viewBox="0 0 340 40" style={{ display: "block" }}>
          {Array.from({ length: 49 }).map((_, i) => <line key={i} x1={10 + i * 6.67} x2={10 + i * 6.67} y1={i % 8 === 0 ? 8 : 14} y2={28} stroke={K.track} strokeWidth={2} />)}
          <line x1={170} x2={170} y1={4} y2={34} stroke={K.t3} strokeWidth={2} />
          <line x1={clamp(170 + bioDelta * 30, 12, 328)} x2={clamp(170 + bioDelta * 30, 12, 328)} y1={2} y2={36} stroke={K.t1} strokeWidth={3} />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={lbl}>più giovane</span><span style={numStyle(16)}>{yrs(bioDelta)}</span><span style={lbl}>più vecchio</span></div>
      </div>
      {insight(drivers.length ? `Pesano di più: ${drivers.slice(0, 3).map((f) => `${f.name.toLowerCase()} (${yrs(f.years ?? 0)})`).join(", ")}.` : "Nessun fattore pesa in modo particolare.")}
      <div style={{ ...card, padding: "4px 16px" }}>
        {factors.map((f, i) => (
          <div key={f.name} style={{ ...st(4), padding: "13px 0", borderBottom: i < factors.length - 1 ? `1px solid ${K.line}` : "none" }}>
            <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...caps, fontSize: 12, color: K.t1 }}>{f.name}</span><span style={numStyle(16, f.years === null ? K.t3 : f.years > 0 ? K.warn : f.years < 0 ? K.up : K.t2)}>{f.years === null ? (f.value === "da misurare" ? "da misurare" : "—") : yrs(f.years)}</span></div>
            <span style={lbl}>{f.value}</span>
            <span style={txt}>{f.why}</span>
          </div>
        ))}
      </div>
      <div style={{ ...card, ...st(6) }}>
        <span style={capLbl(12)}>Dati mancanti</span>
        {missing.map((m) => <span key={m} style={txt}>• {m}</span>)}
      </div>
    </div>
  );

  // =================== NUTRIZIONE ===================
  const mealDays = days.filter((x: Day) => x.meals.length > 0);
  const shown = allMeals
    .filter((e) => mealDay === "tutti" || e.date === mealDay)
    .filter((e) => !q.trim() || `${e.m.dish} ${e.m.name}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, z) => (sort === "kcal" ? (z.m.kcal ?? -1) - (a.m.kcal ?? -1) : sort === "protein" ? (z.m.protein ?? -1) - (a.m.protein ?? -1) : (a.date + a.m.time).localeCompare(z.date + z.m.time)));
  const shownKcal = sum(shown.map((e) => e.m.kcal)), shownProt = sum(shown.map((e) => e.m.protein));
  const topList = (title: string, k: "kcal" | "protein", u: string, col: string) => {
    const L = [...shown].filter((e) => isNum(e.m[k])).sort((a, z) => (z.m[k] ?? 0) - (a.m[k] ?? 0)).slice(0, 5);
    if (!L.length) return null;
    const tot = sum(shown.map((e) => e.m[k])) || 1, top = (L[0].m[k] ?? 1) || 1;
    return (
      <div style={{ ...card, ...st(12) }}>
        <span style={capLbl(12)}>{title}</span>
        {L.map((e) => (
          <button key={e.key} onClick={() => open({ kind: "meal", key: e.key })} style={{ ...btn, ...st(4) }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}><span style={{ ...txt, ...ell, flex: 1 }}>{e.m.dish}</span><span style={{ ...lbl, flex: "0 0 auto" }}>{fmt(e.m[k], u)} · {Math.round(((e.m[k] ?? 0) * 100) / tot)}%</span></div>
            {hbar((e.m[k] ?? 0) / top, col)}
            <span style={lbl}>{e.m.name} · {shortDay(e.date)} {e.m.time}</span>
          </button>
        ))}
      </div>
    );
  };
  const byMeal = MEAL_ORDER.concat([...new Set(shown.map((e) => e.m.name))].filter((n) => !MEAL_ORDER.includes(n))).map((n) => {
    const es = shown.filter((e) => e.m.name === n);
    return { n, es, kcal: avg(es.map((e) => e.m.kcal)), prot: avg(es.map((e) => e.m.protein)), carbs: avg(es.map((e) => e.m.carbs)), fat: avg(es.map((e) => e.m.fat)), t: avg(es.map((e) => toMin(e.m.time))), totK: sum(es.map((e) => e.m.kcal)) };
  }).filter((g) => g.es.length);
  const windows = mealDays.filter((x: Day) => mealDay === "tutti" || x.date === mealDay).map((x: Day) => { const ts = nums(x.meals.map((m: Meal) => toMin(m.time))); return { x, first: ts.length ? Math.min(...ts) : null, last: ts.length ? Math.max(...ts) : null, n: x.meals.length }; });
  const P = d.proteinG, cc = dayMacro(d, "carbs"), ff = dayMacro(d, "fat");
  const macroOk = isNum(P) && cc.v !== null && ff.v !== null;
  const macroTot = macroOk ? (P as number) * 4 + (cc.v as number) * 4 + (ff.v as number) * 9 : 0;
  const nutRow = (label: string, k: MKey, ref: number, kind: "limite" | "obiettivo") => {
    const r = dayMacro(d, k), over = r.v !== null && kind === "limite" && r.v > ref, good = r.v !== null && kind === "obiettivo" && r.v >= ref;
    return (
      <div key={label} style={st(6)}>
        <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...caps, fontSize: 12, color: K.t1 }}>{label}{r.partial ? " *" : ""}</span><span style={{ ...row, gap: 6 }}><span style={numStyle(17)}>{fmt(r.v, " g")}</span><span style={lbl}>/ {kind} {ref} g</span></span></div>
        {hbar((r.v ?? 0) / ref, over ? K.warn : good ? K.up : kind === "limite" ? K.sleep : K.strain)}
      </div>
    );
  };
  const maxG = Math.max(1, ...mealDays.map((y: Day) => (y.proteinG ?? 0) + (dayMacro(y, "carbs").v ?? 0) + (dayMacro(y, "fat").v ?? 0)));
  const fsW = nums(windows.map((w) => w.first)), lsW = nums(windows.map((w) => w.last));
  const nutrizione = (
    <div style={st(14)}>
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
        {ring(isNum(d.eatenKcal) && isNum(d.burnedKcal) && d.burnedKcal > 0 ? d.eatenKcal / d.burnedKcal : 0, K.violet, 220, 14, (
          <>
            <span style={numStyle(60, isNum(d.eatenKcal) ? K.t1 : K.t3)}>{isNum(d.eatenKcal) ? Math.round(d.eatenKcal).toLocaleString("it-IT") : "—"}</span>
            <span style={{ ...caps, fontSize: 12, color: K.t1, marginTop: 4 }}>kcal mangiate</span>
          </>
        ), true)}
      </div>
      {(() => {
        const bl = bal(d), dn = doneOfDay(d);
        return (
          <div aria-label="Bilancio calorie" style={{ ...card, ...st(12) }}>
            <div style={{ ...row, justifyContent: "space-between" }}><span style={capLbl(12)}>Energia</span>{live ? <span style={lbl}>finora</span> : null}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
              {miniTile("Bruciate", isNum(d.burnedKcal) ? kcalTxt(d.burnedKcal) : "—", "kcal")}
              {miniTile("Bilancio", signed(bl), bl === null ? undefined : "kcal", bl === null ? K.t3 : K.t1)}
            </div>
            {dn.length ? (
              <div style={st(6)}>
                {dn.map((e) => (
                  <button key={e.i} onClick={() => open({ kind: "act", key: `${d.date}w${e.i}` })} style={{ ...btn, ...row, gap: 8 }}>
                    {ic(kindIcon(kindOf(e.w)), K.strain, 16, 2)}
                    <span style={{ ...txt, ...ell, flex: 1, color: K.t1 }}>{`${e.w.name} · ${e.w.time}`}</span>
                    <span style={{ ...numStyle(16), flex: "0 0 auto" }}>{isNum(e.w.kcal) ? `${kcalTxt(e.w.kcal)} kcal` : "—"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })()}
      {nutTips.length ? (
        <div aria-label="Consigli nutrizione" style={{ ...card, ...st(10) }}>
          <span style={capLbl(12)}>Consigli</span>
          {nutTips.slice(0, 4).map((k, i) => <div key={i} style={{ ...row, alignItems: "flex-start", gap: 10 }}>{ic(k.icon, K.t2, 18)}<span style={{ ...txt, flex: 1 }}>{k.t}</span></div>)}
        </div>
      ) : null}
      {d.meals.length ? (
        <>
          <div style={{ ...card, ...st(14) }}>
            <span style={capLbl(12)}>Nutrienti del giorno</span>
            {macroOk ? (
              <div style={{ ...row, gap: 16 }}>
                {donut([{ label: "p", value: (P as number) * 4, color: MC.p }, { label: "c", value: (cc.v as number) * 4, color: MC.c }, { label: "f", value: (ff.v as number) * 9, color: MC.f }], 112, 12, <><span style={numStyle(22)}>{Math.round(macroTot).toLocaleString("it-IT")}</span><span style={lbl}>kcal macro</span></>)}
                <div style={st(8)}>
                  {([["Proteine", P as number, 4, MC.p], ["Carboidrati", cc.v as number, 4, MC.c], ["Grassi", ff.v as number, 9, MC.f]] as [string, number, number, string][]).map(([n, g, kk, col]) => (
                    <span key={n} style={{ ...row, gap: 8, ...lbl, color: K.t2 }}><span style={{ width: 10, height: 3, borderRadius: 2, background: col, flex: "0 0 auto" }} />{n} {fmt(g, " g")} · {Math.round((g * kk * 100) / (macroTot || 1))}%</span>
                  ))}
                  {cc.partial || ff.partial ? <span style={lbl}>* parziale: alcuni pasti senza macro</span> : null}
                </div>
              </div>
            ) : <span style={lbl}>Ripartizione macro non disponibile: mancano carboidrati o grassi.</span>}
            <div style={st(6)}>
              <div style={{ ...row, justifyContent: "space-between" }}><span style={{ ...caps, fontSize: 12, color: K.t1 }}>Proteine</span><span style={{ ...row, gap: 6 }}><span style={numStyle(17)}>{fmt(P, " g")}</span><span style={lbl}>/ obiettivo {PT} g</span></span></div>
              {hbar((P ?? 0) / PT, (P ?? 0) >= PT ? K.up : MC.p)}
              {proteinTip}
            </div>
            {nutRow("Zuccheri", "sugar", 50, "limite")}
            {nutRow("Fibre", "fibre", 30, "obiettivo")}
            {nutRow("Sale", "salt", 5, "limite")}
          </div>
          {listCard("Pasti", <span style={lbl}>tocca per i nutrienti</span>, mealRows(d))}
        </>
      ) : <span style={{ ...lbl, textAlign: "center" }}>Nessun pasto registrato per {dayName(d.date)}.</span>}
      {mealDays.length ? (
        <>
          {weekTitle("Calorie mangiate · 7 giorni")}
          <div style={card}>{weekBars(days.map((x: Day) => x.eatenKcal), 3000, () => K.violet, (v) => `${r1(v / 1000).toLocaleString("it-IT")}k`)}</div>
          {weekTitle(`Proteine · linea = ${PT} g`)}
          <div style={card}>{weekBars(days.map((x: Day) => x.proteinG), PT, (v) => (v >= PT ? K.up : MC.p), (v) => String(Math.round(v)), PT)}</div>
          {weekTitle("Macro per giorno (g)")}
          <div style={{ ...card, ...st(12) }}>
            {legend([{ label: "Proteine", color: MC.p }, { label: "Carboidrati", color: MC.c }, { label: "Grassi", color: MC.f }])}
            {mealDays.map((x: Day) => {
              const c2 = dayMacro(x, "carbs"), f2 = dayMacro(x, "fat"), pp = x.proteinG ?? 0, tot = pp + (c2.v ?? 0) + (f2.v ?? 0);
              return (
                <button key={x.date} onClick={() => go(x.date)} style={{ ...btn, ...st(4) }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 14, color: K.t1, fontWeight: x.date === d.date ? 700 : 400 }}>{shortDay(x.date)}{c2.partial || f2.partial ? " *" : ""}</span><span style={lbl}>P {fmt(pp)} · C {fmt(c2.v)} · G {fmt(f2.v)}</span></div>
                  <div style={{ width: `${clamp((tot / maxG) * 100, 4, 100)}%` }}>{segBar([{ label: "p", value: pp, color: MC.p }, { label: "c", value: c2.v ?? 0, color: MC.c }, { label: "f", value: f2.v ?? 0, color: MC.f }], 8)}</div>
                </button>
              );
            })}
          </div>
          {weekTitle("Zuccheri e fibre (g)")}
          <div style={card}>{lines([{ name: "Zuccheri", color: MC.f, values: days.map((x: Day) => dayMacro(x, "sugar").v) }, { name: "Fibre", color: K.up, values: days.map((x: Day) => dayMacro(x, "fibre").v) }])}</div>

          {sectionTitle("Cibi della settimana", <span style={lbl}>{shown.length} pasti</span>)}
          <input value={q} onChange={(e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="Cerca un cibo (es. mozzarella, tramezzino)" style={{ ...card, padding: "11px 14px", fontSize: 14, color: K.t1, fontFamily: FONT, outline: "none" }} />
          {chips(<>{chip("Tutti", mealDay === "tutti", () => setMealDay("tutti"))}{mealDays.map((x: Day) => chip(shortDay(x.date), mealDay === x.date, () => setMealDay(x.date), x.date))}</>)}
          {chips(<>{chip("Per ora", sort === "ora", () => setSort("ora"))}{chip("Più kcal", sort === "kcal", () => setSort("kcal"))}{chip("Più proteine", sort === "protein", () => setSort("protein"))}{chip("Elenco", cibiView === "elenco", () => setCibiView("elenco"))}{chip("Analisi", cibiView === "analisi", () => setCibiView("analisi"))}</>)}
          <span style={lbl}>{String(Math.round(shownKcal)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kcal · {fmt(shownProt, " g")} proteine nei pasti mostrati</span>
          {cibiView === "elenco" ? (shown.length ? listCard("Elenco", null, shown.map((e, i) => listRow(`l${e.key}`, box(isNum(e.m.kcal) ? String(Math.round(e.m.kcal)) : "—", "kcal", K.mealBox), `${e.m.name} · ${shortDay(e.date)} ${e.m.time}`, `${e.m.dish} · ${fmt(e.m.protein)} g prot.`, () => open({ kind: "meal", key: e.key }), i === shown.length - 1))) : <span style={lbl}>Nessun pasto corrisponde alla ricerca.</span>) : (
            <>
              {topList("Fonti principali di proteine", "protein", " g", MC.p)}
              {topList("Fonti principali di calorie", "kcal", " kcal", K.violet)}
              {byMeal.length ? (
                <div style={{ ...card, ...st(12) }}>
                  <span style={capLbl(12)}>Per pasto · medie</span>
                  {byMeal.map((g) => (
                    <div key={g.n} style={st(4)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ fontSize: 14, fontWeight: 600, color: K.t1 }}>{g.n} ×{g.es.length}</span><span style={lbl}>~{clock(g.t)} · {fmt(g.kcal)} kcal · {fmt(g.prot, " g")} prot.</span></div>
                      {g.prot !== null && g.carbs !== null && g.fat !== null ? segBar([{ label: "p", value: g.prot * 4, color: MC.p }, { label: "c", value: g.carbs * 4, color: MC.c }, { label: "f", value: g.fat * 9, color: MC.f }], 8) : null}
                      <span style={lbl}>{Math.round((g.totK * 100) / (shownKcal || 1))}% delle kcal mostrate · C {fmt(g.carbs, " g")} · G {fmt(g.fat, " g")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {windows.length ? (
                <div style={{ ...card, ...st(12) }}>
                  <span style={capLbl(12)}>Orari dei pasti · 6:00–24:00</span>
                  {windows.map((w) => (
                    <div key={w.x.date} style={st(4)}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 14, color: K.t1 }}>{shortDay(w.x.date)}</span><span style={lbl}>{clock(w.first)} → {clock(w.last)}{w.first !== null && w.last !== null ? ` · finestra ${hm(w.last - w.first)}` : ""}</span></div>
                      <div style={{ position: "relative", height: 12, borderRadius: 6, background: K.track }}>
                        {w.x.meals.map((m: Meal, i: number) => { const t = toMin(m.time); return t === null ? null : <span key={i} style={{ position: "absolute", left: `calc(${clamp((t - 360) / 1080, 0, 1) * 100}% - 5px)`, top: 1, width: 10, height: 10, borderRadius: 5, background: K.violet }} />; })}
                      </div>
                    </div>
                  ))}
                  <span style={lbl}>Primo pasto in media {clock(avg(fsW))} · ultimo {clock(avg(lsW))} · {fmt(avg(windows.map((w) => w.n)))} pasti al giorno</span>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );

  // =================== ALTRO ===================
  const altro = (
    <div style={st(14)}>
      {sectionTitle("Tendenze 7 giorni")}
      {weekTitle("Recupero e sonno (%)")}
      <div style={card}>{lines([{ name: "Recupero", color: K.recHi, values: days.map((x: Day) => recScore(x)) }, { name: "Sonno", color: K.sleep, values: days.map((x: Day) => sonnoOf(x)) }])}</div>
      {weekTitle("Sforzo (0–21)")}
      <div style={card}>{lines([{ name: "Sforzo", color: K.strain, values: days.map((x: Day) => strainScore(x)) }])}</div>
      {weekTitle("Mangiate vs bruciate (kcal)")}
      <div style={card}>{lines([{ name: "Mangiate", color: K.violet, values: days.map((x: Day) => x.eatenKcal) }, { name: "Bruciate", color: K.warn, values: days.map((x: Day) => x.burnedKcal) }])}</div>
      {weekTitle("FC a riposo e HRV")}
      <div style={card}>{lines([{ name: "FC riposo", color: K.recLo, values: days.map((x: Day) => x.rhr) }, { name: "HRV", color: K.violet, values: days.map((x: Day) => x.hrvMs) }])}</div>
      <div style={three}>
        {stat("Sonno medio", hm(wkSleep), `${nightDays.length} notti`)}
        {stat("FC riposo", fmt(wkRhr), "media bpm")}
        {stat("HRV", fmt(wkHrv), "media ms")}
      </div>

      {sectionTitle("Giorno per giorno", <span style={lbl}>sonno · recupero · sforzo</span>)}
      <div style={{ ...card, padding: "4px 16px" }}>
        {[...days].reverse().map((x: Day, i: number) => {
          const rc = recScore(x), sl = sonnoOf(x), sr = strainScore(x);
          return (
            <button key={x.date} onClick={() => { go(x.date); goTab("home"); }} style={{ ...btn, ...row, gap: 8, width: "100%", padding: "12px 0", borderBottom: i < days.length - 1 ? `1px solid ${K.line}` : "none" }}>
              <div style={{ ...st(2), flex: 1 }}>
                <span style={{ ...ell, fontSize: 15, fontWeight: 600, color: K.t1 }}>{dayTitle(x.date)}{x.incomplete ? " · dati incompleti" : ""}</span>
                <span style={{ ...ell, ...lbl }}>{fmt(x.steps)} passi · {fmt(x.eatenKcal)}/{fmt(x.burnedKcal)} kcal · bil. {signed(bal(x))}</span>
              </div>
              <span style={{ ...numStyle(15, K.sleep), width: 36, textAlign: "right", flex: "0 0 auto" }}>{sl === null ? "—" : String(sl)}</span>
              <span style={{ ...numStyle(15, recColor(rc)), width: 36, textAlign: "right", flex: "0 0 auto" }}>{rc === null ? "—" : `${rc}%`}</span>
              <span style={{ ...numStyle(15, K.strain), width: 30, textAlign: "right", flex: "0 0 auto" }}>{fmt(sr)}</span>
            </button>
          );
        })}
      </div>

      {upcomingCard}

      <span style={{ ...lbl, textAlign: "center" }}>Aggiornato il {DATA.updatedAt.slice(8, 10)}/{DATA.updatedAt.slice(5, 7)} alle {time}</span>
    </div>
  );

  // =================== BIOLOGIA ===================
  const labs = bio?.labs ?? null;
  const wLast = WEIGHTS.length ? WEIGHTS[WEIGHTS.length - 1] : null, wFirst = WEIGHTS.length ? WEIGHTS[0] : null;
  const curKg = isNum(bio?.weightKg) ? (bio?.weightKg as number) : wLast ? wLast.kg : null;
  const curH = isNum(bio?.heightCm) ? (bio?.heightCm as number) : null;
  const bmiNow = curKg !== null && curH !== null ? curKg / (curH / 100) ** 2 : null;
  const lastWeigh = bio?.weightDate ?? (wLast ? wLast.date : null);
  const weightChart = (() => {
    if (WEIGHTS.length < 2) return null;
    const W = 340, H = 128, pl = 34, pr = 16, pt = 18, pb = 24;
    const t0 = 0, t1 = daysBetween(WEIGHTS[0].date, WEIGHTS[WEIGHTS.length - 1].date) || 1;
    const ks = WEIGHTS.map((w) => w.kg), lo = Math.min(...ks) - 1, hi = Math.max(...ks) + 1;
    const X = (dt: string) => pl + ((daysBetween(WEIGHTS[0].date, dt) - t0) / t1) * (W - pl - pr);
    const Y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
    const pts: [number, number][] = WEIGHTS.map((w) => [X(w.date), Y(w.kg)]);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {[lo + 1, (lo + hi) / 2, hi - 1].map((v, i) => (
          <g key={i}><line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke={K.line} strokeWidth={1} /><text x={pl - 6} y={Y(v) + 4} fontSize={10} textAnchor="end" fill={K.t3}>{r1(v).toLocaleString("it-IT")}</text></g>
        ))}
        <path d={smooth(pts)} fill="none" stroke={K.violet} strokeWidth={2.5} strokeLinecap="round" />
        {WEIGHTS.map((w, i) => {
          const p = parts(w.date);
          return (
            <g key={w.date}>
              <circle cx={pts[i][0]} cy={pts[i][1]} r={4} fill={K.bg} stroke={K.violet} strokeWidth={2.5} />
              <text x={pts[i][0]} y={pts[i][1] - 9} fontSize={11} fontWeight={700} textAnchor={i === 0 ? "start" : i === WEIGHTS.length - 1 ? "end" : "middle"} fill={K.t1} fontFamily={NUM}>{fmt(w.kg)} kg</text>
              <text x={pts[i][0]} y={H - 6} fontSize={10} textAnchor={i === 0 ? "start" : i === WEIGHTS.length - 1 ? "end" : "middle"} fill={K.t3}>{p.dd} {MO[p.m - 1].slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
    );
  })();
  // ---------- Medico (dati nella costante MEDICO, fuori dal blocco DATA) ----------
  const medCol: Record<MedStatus, string> = { "in corso": K.strain, "in attesa": K.recMid, "da fare": K.warn, "proposto": K.t2, "facoltativo": K.t3, "da decidere": K.violet };
  const medBadge = (s: MedStatus) => {
    const c = medCol[s];
    return <span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: c, background: `${c}1F`, border: `1px solid ${c}59`, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap", flex: "0 0 auto" }}>{s}</span>;
  };
  const medRow = (m: MedLab, last: boolean) => {
    const col = m.status === "limite" ? K.recMid : K.up;
    const b = m.bar;
    const pos = (x: number) => (b ? clamp(((x - b.min) / (b.max - b.min)) * 100, 0, 100) : 0);
    const a = b ? pos(b.lo ?? b.min) : 0, z = b ? pos(b.hi ?? b.max) : 0;
    return (
      <div key={m.name} style={{ ...st(8), padding: "12px 0", borderBottom: last ? "none" : `1px solid ${K.line}` }}>
        <div style={{ ...row, justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{m.name}</span>
          {m.long ? null : <span style={{ ...numStyle(18), flex: "0 0 auto" }}>{m.value}{m.unit ? <span style={{ ...lbl, fontFamily: FONT, fontWeight: 400, marginLeft: 4 }}>{m.unit}</span> : null}</span>}
        </div>
        {m.long ? <span style={txt}>{m.value}</span> : null}
        {b ? (
          <div style={{ position: "relative", height: 8, borderRadius: 4, background: K.track }}>
            <div style={{ position: "absolute", left: `${a}%`, width: `${Math.max(0, z - a)}%`, top: 0, bottom: 0, borderRadius: 4, background: K.okBand }} />
            <div style={{ position: "absolute", left: `calc(${pos(b.v)}% - 7px)`, top: -3, width: 14, height: 14, borderRadius: 7, background: col, border: `2px solid ${K.bg}`, boxSizing: "border-box" }} />
          </div>
        ) : null}
        <div style={{ ...row, justifyContent: "space-between" }}>
          <span style={lbl}>{m.long ? m.ref : `Riferimento ${m.ref}`}</span>
          <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: col, whiteSpace: "nowrap", flex: "0 0 auto" }}>{m.status === "limite" ? "vicino al limite" : "nella norma"}</span>
        </div>
      </div>
    );
  };
  const medEmpty = (t: string) => <div style={{ ...card, ...row, gap: 10 }}>{ic("info", K.t3, 16, 1.8)}<span style={{ ...txt, flex: 1 }}>{t}</span></div>;
  const medChecks = [...MEDICO.checks].sort((p: MedCheck, q: MedCheck) => (p.due === q.due ? 0 : p.due === null ? 1 : q.due === null ? -1 : p.due < q.due ? -1 : 1));
  const medNear = MEDICO.groups.reduce((n, g) => n + g.items.filter((m: MedLab) => m.status === "limite").length, 0);
  // ---------- Medico: schede che aprono una sottopagina (Capelli, Pillole, Controlli, Farmaci e integratori, Storia di famiglia, Visite fatte) ----------
  // Essenziale: una riga per voce, niente testi lunghi. Solo le primitive di questa pagina (card, listCard/listRow, chip, backBar).
  // Pillole: una sola scelta al giorno (prese stamattina / stasera / saltate), dal registro MEDICO.pills.log unito ai tocchi del telefono (localStorage).
  // Foto capelli: HAIR_PHOTOS (solo nella build cifrata; la serie fissata, pinned, è il punto di partenza), altrimenti segnaposto.
  const HAIR = MEDICO.hair ?? null;
  const PILLS = MEDICO.pills ?? null;
  const FAM = MEDICO.familyHistory ?? null;
  const HAIR_KEY = "salute.capelli.aderenza.v1";
  // Pillole giorno per giorno: il registro del grafo (MEDICO.pills.log) unito ai tocchi di questo telefono (localStorage, stessa chiave di prima).
  // p = "am" prese la mattina, "pm" prese la sera, "no" saltate; voce senza p = tolta a mano; nessuna voce = nessun dato (mai inventato).
  // Per lo stesso giorno il tocco del telefono vince sul grafo, così niente si perde offline.
  type PillDay = { p?: "am" | "pm" | "no"; t?: string };
  const pillLoad = (): Record<string, PillDay> => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(HAIR_KEY) : null;
      const v: unknown = raw ? JSON.parse(raw) : null;
      if (!v || typeof v !== "object") return {};
      const out: Record<string, PillDay> = {};
      // formato precedente (fin / pa / pp): diventa una sola scelta al giorno
      Object.entries(v as Record<string, { p?: string; t?: string; fin?: boolean; pa?: boolean; pp?: boolean }>).forEach(([k, x]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !x || typeof x !== "object") return;
        const p: "am" | "pm" | "no" | undefined = x.p === "am" || x.p === "pm" || x.p === "no" ? x.p : x.pa || x.fin ? "am" : x.pp ? "pm" : undefined;
        out[k] = p ? { p, ...(x.t ? { t: x.t } : {}) } : x.t ? { t: x.t } : {};
      });
      return out;
    } catch { return {}; }
  };
  const [pillLog, setPillLog] = useState<Record<string, PillDay>>(pillLoad());
  // i vecchi segni restano sotto la stessa chiave, riscritti una volta nel formato nuovo
  useEffect(() => { try { localStorage.setItem(HAIR_KEY, JSON.stringify(pillLog)); } catch { /* visualizzatore della Page */ } }, []);
  const PILL_GRAPH: Record<string, PillDay> = {};
  ((PILLS && PILLS.log) || []).forEach((r: PillLogRow) => {
    if (!r || !r.date) return;
    PILL_GRAPH[r.date] = r.status === "taken" ? { p: r.slot === "sera" ? "pm" : "am" } : r.status === "missed" ? { p: "no" } : {};
  });
  const [pDay, setPDay] = useState<string>(now.date);
  const [cmpSlot, setCmpSlot] = useState<number>(0);
  const [hairZoom, setHairZoom] = useState<{ src: string; label: string } | null>(null);
  const [hairGuide, setHairGuide] = useState<boolean>(false);
  const [ckOpen, setCkOpen] = useState<string | null>(null);
  const hToday = now.date;
  // un secondo tocco sulla stessa scelta la toglie
  const pillAt = (dt: string): "am" | "pm" | "no" | null => (pillLog[dt] ?? PILL_GRAPH[dt])?.p ?? null;
  const pillDay = pDay > hToday ? hToday : pDay;
  const pillSet = (p: "am" | "pm" | "no") => {
    const t = new Date().toISOString();
    const nx: Record<string, PillDay> = { ...pillLog, [pillDay]: pillAt(pillDay) === p ? { t } : { p, t } };
    setPillLog(nx);
    try { localStorage.setItem(HAIR_KEY, JSON.stringify(nx)); } catch { /* visualizzatore della Page: niente salvataggio */ }
  };
  const pNow: "am" | "pm" | "no" | null = pillAt(hToday);
  const pSel = pillAt(pillDay);
  const pTaken = (x: string | null) => x === "am" || x === "pm";
  // serie: giorni di fila con le pillole prese; oggi ancora da segnare non la interrompe
  const pStreak = (() => {
    if (pNow === "no") return 0;
    let dt = pTaken(pNow) ? hToday : addDays(hToday, -1), n = 0;
    while (pTaken(pillAt(dt)) && n < 3650) { n++; dt = addDays(dt, -1); }
    return n;
  })();
  const hShort = (dt: string) => { const p = parts(dt); return `${p.dd} ${MO[p.m - 1].slice(0, 3)}`; };
  const hYear = (dt: string) => `${hShort(dt)} ${parts(dt).y}`;
  const HICONS: Record<string, string> = {
    pill: "M7.5 16.5a3.5 3.5 0 0 1 0-5l4-4a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0zM9.5 9.5l5 5",
    drop: "M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z",
    moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
    sun: "M12 8.5a3.5 3.5 0 1 0 .01 0M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
    phone: "M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2",
    noprod: "M12 3a9 9 0 1 0 .01 0M5.6 5.6l12.8 12.8M10 7h4v2.5l1 1.5v6h-6v-6l1-1.5z",
    camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 10.5a3 3 0 1 0 .01 0",
    pin: "M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 .01 0",
    doc: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 15.5h6",
    box: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
    user: "M12 4a3.5 3.5 0 1 0 .01 0M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6",
    euro: "M17 6.5A6.5 6.5 0 1 0 17 17.5M5 10.5h8M5 13.5h8",
    lens: "M10.5 4a6.5 6.5 0 1 0 .01 0M15.5 15.5 20 20",
  };
  const hIc = (name: string, color: string = K.t2, size = 18, sw = 1.7) => (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flex: "0 0 auto" }} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{name === "clock" || name === "info" ? <circle cx={12} cy={12} r={9} /> : null}<path d={HICONS[name] ?? ICONS[name] ?? ICONS.info} /></svg>
  );
  // pittogramma della testa con la zona da fotografare evidenziata
  const headPic = (key: string, size = 44, color: string = K.t1) => {
    const zone: Record<string, ReactNode> = {
      front: <><circle cx={24} cy={27} r={12} stroke={K.t3} /><path d="M12.5 24C13 15 18 11 24 11s11 4 11.5 13" stroke={color} strokeWidth={3} /><path d="M20 28.5h.01M28 28.5h.01" stroke={K.t3} strokeWidth={2.4} /></>,
      "left-temple": <><circle cx={24} cy={26} r={12} stroke={K.t3} /><path d="M12.2 26C12 19 15 14 20 12" stroke={color} strokeWidth={3.4} /><path d="M24 14c5 0 10 3 11.5 9" stroke={K.t3} /></>,
      "right-temple": <><circle cx={24} cy={26} r={12} stroke={K.t3} /><path d="M35.8 26C36 19 33 14 28 12" stroke={color} strokeWidth={3.4} /><path d="M24 14c-5 0-10 3-11.5 9" stroke={K.t3} /></>,
      top: <><circle cx={24} cy={24} r={14} stroke={K.t3} /><circle cx={24} cy={22} r={7} fill={`${color}40`} stroke={color} strokeWidth={2} /><path d="M24 38.5v3" stroke={K.t3} /></>,
      crown: <><circle cx={24} cy={25} r={13} stroke={K.t3} /><path d="M24 17.5a4.5 4.5 0 1 1-4.5 4.5 2.6 2.6 0 0 1 2.6-2.6 1.6 1.6 0 0 1 1.6 1.6" stroke={color} strokeWidth={2.4} /><path d="M18 38c2 1.5 10 1.5 12 0" stroke={K.t3} /></>,
    };
    return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" strokeWidth={1.6} strokeLinecap="round" style={{ display: "block", flex: "0 0 auto" }}>{zone[key] ?? <circle cx={24} cy={24} r={12} stroke={K.t3} />}</svg>;
  };
  // riga di una lista: testo a sinistra, valore breve a destra, una sola riga
  const line = (key: string, left: ReactNode, right: ReactNode, last: boolean, onClick?: () => void) => {
    const inner = (
      <div style={{ ...row, justifyContent: "space-between", gap: 10, padding: "13px 0", borderBottom: last ? "none" : `1px solid ${K.line}`, width: "100%" }}>
        <span style={{ ...ell, flex: 1, fontSize: 15, lineHeight: "20px", color: K.t1 }}>{left}</span>
        <span style={{ ...lbl, color: K.t2, flex: "0 0 auto", whiteSpace: "nowrap" }}>{right}</span>
      </div>
    );
    return onClick ? <button key={key} onClick={onClick} style={{ ...btn, display: "block", width: "100%" }}>{inner}</button> : <div key={key}>{inner}</div>;
  };
  const plain = (title: string, rows: ReactNode) => <div style={{ ...card, padding: "14px 16px 2px" }}><span style={capLbl(12)}>{title}</span><div style={{ ...st(0), marginTop: 2 }}>{rows}</div></div>;
  // pulsante della scelta di oggi: card normale, bordo e spunta verdi quando segnato
  const pillBtn = (p: "am" | "pm", label: string, icon: string) => {
    const on = pSel === p;
    return (
      <button key={p} onClick={() => pillSet(p)} aria-pressed={on} aria-label={label} style={{ ...btn, ...card, ...row, justifyContent: "center", gap: 10, padding: "16px 10px", border: `1px solid ${on ? K.up : K.line}` }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, boxSizing: "border-box", flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: on ? K.up : "transparent", border: `2px solid ${on ? K.up : K.track}` }}>{on ? ic("check", K.bg, 16, 2.6) : hIc(icon, K.t2, 15)}</div>
        <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{label}</span>
      </button>
    );
  };
  const pIsToday = pillDay === hToday;
  const pillToday = <div style={two}>{pillBtn("am", pIsToday ? "Prese stamattina" : "Prese di mattina", "sun")}{pillBtn("pm", pIsToday ? "Prese stasera" : "Prese di sera", "moon")}</div>;
  const pDayName = (dt: string) => { const p = parts(dt); return dt === hToday ? "Oggi" : dt === addDays(hToday, -1) ? "Ieri" : `${WD[p.w]} ${p.dd} ${MO[p.m - 1].slice(0, 3)}`; };
  const pMinDay = addDays(hToday, -60);
  const pArrow = (dir: -1 | 1) => {
    const dis = dir < 0 ? pillDay <= pMinDay : pillDay >= hToday;
    return <button onClick={() => setPDay(addDays(pillDay, dir))} disabled={dis} aria-label={dir < 0 ? "Giorno prima" : "Giorno dopo"} style={{ ...btn, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", opacity: dis ? 0.3 : 1 }}>{ic(dir < 0 ? "left" : "right", K.t1, 18, 2.2)}</button>;
  };
  const pDot = (x: "am" | "pm" | "no" | null) => (x === "am" || x === "pm" ? K.up : x === "no" ? K.recLo : "transparent");
  const pWeek = Array.from({ length: 7 }, (_, i) => addDays(hToday, i - 6));
  const pillDays = (
    <div style={{ ...card, padding: "12px 14px 14px" }}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>{`Serie: ${pStreak} ${pStreak === 1 ? "giorno" : "giorni"} di fila`}</span>
        <div style={{ ...row, gap: 2, background: K.card2, border: `1px solid ${K.line}`, borderRadius: 999, padding: "0 4px", flex: "0 0 auto" }}>
          {pArrow(-1)}
          <button onClick={() => setPDay(hToday)} style={{ ...btn, ...caps, fontSize: 12, padding: "6px 4px", color: K.t1, minWidth: 64, textAlign: "center" }}>{pDayName(pillDay)}</button>
          {pArrow(1)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 2, marginTop: 12 }}>
        {pWeek.map((dt) => {
          const x = pillAt(dt), on = dt === pillDay;
          return (
            <button key={dt} onClick={() => setPDay(dt)} aria-label={`${pDayName(dt)}: ${pTaken(x) ? "presa" : x === "no" ? "saltata" : "nessun dato"}`} style={{ ...btn, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "6px 0", borderRadius: 10, background: on ? K.navOn : "transparent" }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, boxSizing: "border-box", background: pDot(x), border: `2px solid ${x ? pDot(x) : K.track}` }} />
              <span style={{ fontSize: 10, lineHeight: "12px", fontWeight: on ? 700 : 500, color: on ? K.t1 : K.t3 }}>{dt === hToday ? "Oggi" : WD[parts(dt).w]}</span>
            </button>
          );
        })}
      </div>
      <div style={{ ...row, justifyContent: "center", gap: 14, marginTop: 8 }}>
        {([["presa", K.up, K.up], ["saltata", K.recLo, K.recLo], ["nessun dato", "transparent", K.track]] as const).map(([l, bg, bd]) => (
          <span key={l} style={{ ...row, gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 4, boxSizing: "border-box", background: bg, border: `1.5px solid ${bd}` }} /><span style={lbl}>{l}</span></span>
        ))}
      </div>
    </div>
  );
  const pillSkip = (
    <button onClick={() => pillSet("no")} aria-pressed={pSel === "no"} style={{ ...btn, alignSelf: "center", padding: "2px 10px", fontSize: 14, lineHeight: "20px", color: pSel === "no" ? K.recLo : K.t3 }}>
      {pSel === "no" ? (pIsToday ? "Oggi saltate · tocca per togliere" : "Saltate · tocca per togliere") : pIsToday ? "Oggi non le ho prese" : "Quel giorno non le ho prese"}
    </button>
  );
  // scorta di un farmaco (giorni rimasti calcolati da oggi)
  const PS = PILLS && PILLS.stock ? PILLS.stock : null;
  const psOut = PS ? addDays(PS.countDate, Math.floor(PS.count / Math.max(1, PS.perDay))) : null;
  const psDays = psOut ? daysBetween(hToday, psOut) : null;
  const psText = psDays === null ? "" : psDays > 1 ? `finisce tra ${psDays} giorni` : psDays === 1 ? "finisce domani" : psDays === 0 ? "finisce oggi" : "finita";
  const pMoments = PILLS ? PILLS.moments : [];

  // Capelli (MEDICO.hair, all names and doses from medico.json; photos only through the build hook life_app.hooks.hair_photos)
  // =================== CAPELLI ===================
  // foto per data: una griglia per giorno; confronto = punto di partenza (serie fissata o la più vecchia) contro l'ultima
  const hDates = Array.from(new Set(HAIR_PHOTOS.map((x: HairPhoto) => x.date))).sort();
  const hBase = HAIR_PHOTOS.find((x: HairPhoto) => x.pinned)?.date ?? hDates[0] ?? null;
  const hLast = hDates.length ? hDates[hDates.length - 1] : null;
  const hOf = (date: string | null) => (date ? HAIR_PHOTOS.filter((x: HairPhoto) => x.date === date).sort((a: HairPhoto, b: HairPhoto) => (a.n ?? 1) - (b.n ?? 1)) : []);
  const hName = (date: string, n: number) => { const set = HAIR ? HAIR.photoSets.find((s: HairSet) => s.date === date) : null; return set?.slots[n - 1]?.label ?? HAIR?.photoProtocol.angles[n - 1]?.label ?? `Foto ${n}`; };
  const thumb = (x: HairPhoto | undefined, date: string | null, big = false) => x ? (
    <button key={`${x.date}-${x.n ?? 1}`} onClick={() => setHairZoom({ src: x.dataUrl, label: `${hName(x.date, x.n ?? 1)} · ${hYear(x.date)}` })} aria-label={`Foto ${x.n ?? 1}, ${hYear(x.date)}`} style={{ ...btn, display: "block", width: "100%", aspectRatio: big ? "3 / 4" : "1 / 1", borderRadius: 10, overflow: "hidden", border: `1px solid ${K.line}`, background: K.mid }}>
      <img src={x.dataUrl} alt={`Capelli ${x.date}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </button>
  ) : (
    <div style={{ width: "100%", boxSizing: "border-box", aspectRatio: big ? "3 / 4" : "1 / 1", borderRadius: 10, border: `1px dashed ${K.track}`, background: K.mid, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 8 }}>
      <span style={lbl}>{date ? `Foto del ${hShort(date)}` : "Nessuna foto"}</span>
    </div>
  );
  const hairScreen = HAIR ? (() => {
    // the supply to reorder: the first one that is not the counted prescription stock (PILLS.stock)
    const fol = HAIR.supply.find((s) => !PS || s.name !== PS.name);
    const next = HAIR.photoProtocol.next;
    const baseSet = hOf(hBase), lastSet = hLast && hLast !== hBase ? hOf(hLast) : [];
    const slots = Math.max(1, baseSet.length, lastSet.length);
    const sI = Math.min(cmpSlot, slots - 1);
    return (
      <div style={st(14)}>
        {backBar("Capelli")}
        {plain("Terapia", <>
          {HAIR.therapy.map((t, i) => line(t.key, t.name, (t.when ?? "").toLowerCase(), i === HAIR.therapy.length - 1))}
        </>)}
        {plain("Prossime cose", <>
          {PS ? line("ricetta", `Ricetta ${PS.name}`, psOut ? `finisce il ${hShort(psOut)}` : psText, false) : null}
          {line("foto", "Foto dei capelli", hShort(next), !fol)}
          {fol && fol.next ? line("fol", `Riordino ${fol.name}`, `verso il ${hShort(fol.next)}`, true) : null}
        </>)}
        <div style={{ ...card, ...st(12) }}>
          <span style={capLbl(12)}>Confronto</span>
          <div style={{ ...two, gap: 10 }}>
            <div style={st(6)}>{thumb(baseSet[sI], hBase, true)}<span style={{ ...lbl, color: K.t2 }}>Prima · {hBase ? hYear(hBase) : "-"}</span></div>
            <div style={st(6)}>{thumb(lastSet[sI], lastSet.length ? hLast : next, true)}<span style={{ ...lbl, color: K.t2 }}>Ultima · {lastSet.length && hLast ? hYear(hLast) : `da fare il ${hShort(next)}`}</span></div>
          </div>
          {slots > 1 ? chips(Array.from({ length: slots }, (_: unknown, i: number) => chip(String(i + 1), i === sI, () => setCmpSlot(i), `s${i}`))) : null}
        </div>
        {[...hDates].reverse().map((dt: string) => (
          <div key={dt} style={{ ...card, ...st(10) }}>
            <span style={capLbl(12)}>{hYear(dt)}</span>
            <div style={three}>{hOf(dt).map((x: HairPhoto) => thumb(x, dt))}</div>
          </div>
        ))}
        {hDates.length ? null : <div style={{ ...card }}><span style={lbl}>Nessuna foto in questa versione dell'app</span></div>}
        <button onClick={() => setHairGuide(!hairGuide)} aria-expanded={hairGuide} style={{ ...btn, ...caps, fontSize: 12, color: K.link, alignSelf: "flex-start" }}>{hairGuide ? "Chiudi" : "Come fare le foto"}</button>
        {hairGuide ? plain("Come fare le foto", HAIR.photoProtocol.angles.map((a, i) => line(a.key, `${i + 1}. ${a.label}`, "", i === HAIR.photoProtocol.angles.length - 1))) : null}
        {hairZoom ? (
          <button onClick={() => setHairZoom(null)} aria-label="Chiudi foto" style={{ ...btn, position: "fixed", inset: 0, zIndex: 50, background: `${K.bg}F2`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
            <img src={hairZoom.src} alt={hairZoom.label} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, display: "block" }} />
            <span style={{ ...lbl, color: K.t2 }}>{hairZoom.label}</span>
          </button>
        ) : null}
      </div>
    );
  })() : backBar("Capelli");

  // =================== PILLOLE (con farmaci e integratori: ogni voce una sola volta) ===================
  // therapies that are not a pill already listed in a moment above (e.g. a lotion): shown once, with their own timing
  const pOther = HAIR ? HAIR.therapy.filter((t) => !pMoments.some((m: PillMoment) => m.items.some((it) => it.link === t.key))) : [];
  const pillsScreen = (
    <div style={st(14)}>
      {backBar("Pillole")}
      {pillDays}
      {pillToday}
      {pillSkip}
      {pMoments.map((m: PillMoment) => <div key={m.key}>{plain(m.label, m.items.map((it, i) => line(it.name, it.name, it.dose, i === m.items.length - 1)))}</div>)}
      {pOther.length ? plain("Sui capelli", pOther.map((t, i) => line(t.key, t.name, (("when" in t ? t.when : "") ?? "").toLowerCase(), i === pOther.length - 1))) : null}
      {PILLS && PILLS.hold.length ? plain("Da chiedere al medico di base", PILLS.hold.map((h, i) => line(h.name, h.name, "in pausa", i === PILLS.hold.length - 1))) : null}
    </div>
  );

  // =================== CONTROLLI E SCREENING ===================
  const ckTodo = medChecks.filter((c: MedCheck) => c.status !== "facoltativo");
  const ckNext = ckTodo.find((c: MedCheck) => c.due !== null) ?? null;
  const checksScreen = (
    <div style={st(14)}>
      {backBar("Controlli e screening")}
      <div style={{ ...card, padding: "4px 16px" }}>
        {medChecks.map((c: MedCheck, i: number) => (
          <div key={c.title}>
            {line(c.title, c.title, <><span style={{ color: medCol[c.status] }}>{c.status}</span>{c.dueText ? ` · ${c.dueText.replace(/^entro /, "")}` : ""}</>, i === medChecks.length - 1 && ckOpen !== c.title, () => setCkOpen(ckOpen === c.title ? null : c.title))}
            {ckOpen === c.title ? <div style={{ padding: "0 0 12px", borderBottom: i < medChecks.length - 1 ? `1px solid ${K.line}` : "none" }}><span style={txt}>{c.sub}</span></div> : null}
          </div>
        ))}
      </div>
    </div>
  );

  // =================== VISITE FATTE ===================
  const visitsSorted = [...MEDICO.visits].sort((a, b) => b.date.localeCompare(a.date));
  const visitsScreen = (
    <div style={st(14)}>
      {backBar("Visite fatte")}
      <div style={{ ...card, padding: "4px 16px" }}>
        {visitsSorted.map((v, i) => line(v.date + v.title, v.title.split(/[:(]/)[0].trim(), hYear(v.date), i === visitsSorted.length - 1))}
      </div>
    </div>
  );

  // =================== STORIA DI FAMIGLIA (MEDICO.familyHistory, da data/health/family-history.md) ===================
  const famWith = FAM ? FAM.groups.filter((g: FamGroup) => g.items.length > 0) : [];
  const famScreen = (
    <div style={st(14)}>
      {backBar("Storia di famiglia")}
      {FAM ? famWith.map((g: FamGroup) => <div key={g.key}>{plain(g.label, g.items.map((it, i) => line(it.name, it.name, it.age ? `a ${it.age.replace(/ anni$/, "")} anni` : it.year ?? "", i === g.items.length - 1)))}</div>)
        : <div style={card}><span style={txt}>{MEDICO.family}</span></div>}
    </div>
  );

  // =================== PRELIEVI (MEDICO.lab, MEDICO.groups, MEDICO.watch; da data/body/labs) ===================
  // Tutto quello che riguarda gli esami del sangue sta qui: ultimo prelievo in alto, i valori vicino al limite in giallo, poi l'elenco dei prelievi.
  const labsScreen = (
    <div style={st(14)}>
      {backBar("Prelievi")}
      <div style={{ ...card, ...row, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ ...st(2), flex: 1 }}>
          <span style={{ ...caps, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{MEDICO.lab.name}, {MEDICO.lab.site}</span>
          <span style={lbl}>Referto del {longDate(MEDICO.lab.date)}</span>
        </div>
        <div style={{ ...st(2), alignItems: "flex-end", flex: "0 0 auto" }}>
          <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: MEDICO.lab.outOfRange ? K.warn : K.up }}>{MEDICO.lab.outOfRange ? `${MEDICO.lab.outOfRange} fuori norma` : "0 fuori norma"}</span>
          {medNear ? <span style={{ ...caps, fontSize: 11, lineHeight: "14px", color: K.recMid }}>{medNear} vicino al limite</span> : null}
        </div>
      </div>
      {insight(MEDICO.watch)}
      {MEDICO.groups.map((g) => (
        <div key={g.title} style={{ ...card, padding: "14px 16px 2px" }}>
          <span style={{ ...caps, fontSize: 10, lineHeight: "14px", color: K.t3 }}>{g.title}</span>
          {g.items.map((m: MedLab, i: number) => medRow(m, i === g.items.length - 1))}
        </div>
      ))}
      {legend([{ label: "Riferimento del laboratorio", color: K.okBand }, { label: "Nella norma", color: K.up }, { label: "Vicino al limite", color: K.recMid }])}
      {plain("Tutti i prelievi", [
        line("last", longDate(MEDICO.lab.date), "ultimo", false),
        line("next", "Prossimo prelievo", `entro il ${longDate(MEDICO.nextLabs)}`, true),
      ])}
    </div>
  );

  // =================== SCHEDE DEL MEDICO (in Biologia > Medico) ===================
  const navIco = (node: ReactNode) => <div style={{ width: 54, height: 44, borderRadius: 10, border: `1px solid ${K.line}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{node}</div>;
  const lastVisit = visitsSorted[0] ?? null;
  const medRows: { key: string; icon: ReactNode; title: string; sub: string; s: Screen; show: boolean }[] = [
    { key: "hair", icon: headPic("front", 30, K.t2), title: "Capelli", sub: `Foto il ${HAIR ? hShort(HAIR.photoProtocol.next) : "-"}${psOut ? ` · ricetta entro il ${hShort(psOut)}` : ""}`, s: { kind: "hair" }, show: !!HAIR },
    { key: "pills", icon: hIc("pill", K.t2, 22), title: "Pillole", sub: (pNow === "am" ? "Oggi: prese stamattina" : pNow === "pm" ? "Oggi: prese stasera" : pNow === "no" ? "Oggi: saltate" : "Oggi: da segnare") + (pStreak > 1 ? ` · ${pStreak} giorni di fila` : ""), s: { kind: "pills" }, show: !!PILLS },
    { key: "labs", icon: ic("pulse", K.t2, 22), title: "Prelievi", sub: `Ultimo: ${hYear(MEDICO.lab.date)} · prossimo ${hShort(MEDICO.nextLabs)}`, s: { kind: "labs" }, show: true },
    { key: "checks", icon: ic("cal", K.t2, 22), title: "Controlli e screening", sub: ckNext ? `Prossimo: ${ckNext.title}` : `${medChecks.length} controlli`, s: { kind: "checks" }, show: true },
    { key: "fam", icon: ic("heart", K.t2, 22), title: "Storia di famiglia", sub: famWith.length ? `${famWith.length} parenti` : "Da completare", s: { kind: "fam" }, show: true },
    { key: "visits", icon: hIc("doc", K.t2, 22), title: "Visite fatte", sub: lastVisit ? `Ultima: ${hYear(lastVisit.date)}` : "Nessuna", s: { kind: "visits" }, show: true },
  ];
  const medShown = medRows.filter((r) => r.show);
  const medNav = <div style={{ ...card, padding: "4px 16px" }}>{medShown.map((r, i) => listRow(r.key, navIco(r.icon), r.title, r.sub, () => open(r.s), i === medShown.length - 1))}</div>;
  const medico = (
    <>
      {sectionTitle("Medico", <span style={lbl}>aggiornato {parts(MEDICO.updated).dd} {MO[parts(MEDICO.updated).m - 1].slice(0, 3)}</span>)}
      {medNav}
    </>
  );
  const rhrs = nums(days.map((x: Day) => x.rhr)), hrvs = nums(days.map((x: Day) => x.hrvMs));
  const biologia = (
    <div style={st(14)}>
      <div style={{ ...st(2), paddingTop: 6 }}>
        <span style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: K.t1 }}>Biologia</span>
        <span style={lbl}>Monitor salute, età biologica, corpo, esami del sangue e cuore a riposo</span>
      </div>
      {monitorFull}

      <button onClick={() => open({ kind: "bio" })} style={{ ...btn, ...card, ...st(14), alignItems: "center", padding: "20px 16px" }}>
        {orb(270)}
        <div style={{ ...three, width: "100%" }}>
          {stat("Biologica", bioAge === null ? "—" : bioAge.toLocaleString("it-IT"), "anni")}
          {stat("Anagrafica", chrono === null ? "—" : String(chrono), "anni")}
          {stat("Differenza", bioDiff === null ? "—" : `${bioDiff > 0 ? "+" : bioDiff < 0 ? "−" : ""}${Math.abs(bioDiff).toLocaleString("it-IT")}`, "anni")}
        </div>
        <span style={{ ...lbl, textAlign: "center" }}>Tocca per il dettaglio</span>
      </button>

      {drivers.length ? (
        <div style={{ ...card, padding: "4px 16px" }}>
          {drivers.slice(0, 5).map((f, i, arr) => (
            <div key={f.name} style={{ ...row, padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${K.line}` : "none" }}>
              <div style={{ ...st(2), flex: 1 }}>
                <span style={{ ...caps, ...ell, fontSize: 12, lineHeight: "16px", color: K.t1 }}>{f.name}</span>
                <span style={{ ...lbl, ...ell }}>{f.value}</span>
              </div>
              <span style={{ ...numStyle(16, (f.years ?? 0) > 0 ? K.warn : K.up), flex: "0 0 auto" }}>{yrs(f.years ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {missing.length ? (
        <div style={{ ...card, ...st(8) }}>
          <span style={capLbl(12)}>Dati mancanti</span>
          {missing.map((m) => <div key={m} style={{ ...row, gap: 10, alignItems: "flex-start" }}>{ic("info", K.t3, 16, 1.8)}<span style={{ ...txt, flex: 1 }}>{m}</span></div>)}
        </div>
      ) : null}

      {medico}

      {sectionTitle("Corpo", lastWeigh ? <span style={lbl}>pesata {parts(lastWeigh).dd} {MO[parts(lastWeigh).m - 1].slice(0, 3)}</span> : null)}
      <div style={three}>
        {stat("Altezza", curH === null ? "—" : String(curH), "cm")}
        {stat("Peso", fmt(curKg), "kg")}
        {stat("BMI", bmiNow === null ? "—" : r1(bmiNow).toLocaleString("it-IT"), bmiNow === null ? "" : bmiNow < 25 ? "normopeso" : bmiNow < 30 ? "sovrappeso" : "obesità")}
      </div>
      {weightChart ? (
        <div style={{ ...card, ...st(8) }}>
          <span style={capLbl(12)}>Andamento peso</span>
          {weightChart}
          {wFirst && wLast ? <span style={txt}>{wLast.kg < wFirst.kg ? `−${r1(wFirst.kg - wLast.kg).toLocaleString("it-IT")} kg` : `+${r1(wLast.kg - wFirst.kg).toLocaleString("it-IT")} kg`} in {daysBetween(wFirst.date, wLast.date)} giorni ({WEIGHTS.length} pesate). Ultima pesata il {longDate(wLast.date)}, {daysBetween(wLast.date, DATA.today)} giorni fa.</span> : null}
        </div>
      ) : null}

      {labs ? (
        <button onClick={() => {
          const s = scroller.current; if (!s) return;
          const el = Array.from(s.querySelectorAll("span")).find((e) => (e.textContent ?? "").trim() === "Medico");
          if (el) s.scrollTo({ top: s.scrollTop + el.getBoundingClientRect().top - s.getBoundingClientRect().top - 96, behavior: "smooth" });
        }} style={{ ...btn, ...card, ...row, padding: "14px 16px" }}>
          {ic("pulse", K.t2, 20)}
          <div style={{ ...st(2), flex: 1 }}>
            <span style={{ fontSize: 15, lineHeight: "20px", fontWeight: 600, color: K.t1 }}>Esami del sangue</span>
            <span style={{ ...lbl, ...ell }}>{`Valori e riferimenti in Medico${bio?.labsDate ? ` · ${longDate(bio.labsDate)}` : ""}`}</span>
          </div>
          {chev(K.t1)}
        </button>
      ) : null}

      {sectionTitle("Cuore a riposo", <span style={lbl}>media {days.length} giorni</span>)}
      <div style={two}>
        {stat("FC a riposo", fmt(wkRhr), rhrs.length ? `bpm · ${Math.min(...rhrs)}–${Math.max(...rhrs)}` : "bpm")}
        {stat("HRV", fmt(wkHrv), hrvs.length ? `ms · ${fmt(Math.min(...hrvs))}–${fmt(Math.max(...hrvs))}` : "ms")}
      </div>
      {weekTitle("FC a riposo (bpm) · linea = tua media")}
      <div style={card}>{lines([{ name: "FC riposo", color: K.recLo, values: days.map((x: Day) => x.rhr) }], wkRhr ?? undefined)}</div>
      {weekTitle("HRV (ms) · linea = tua media")}
      <div style={card}>{lines([{ name: "HRV", color: K.violet, values: days.map((x: Day) => x.hrvMs) }], wkHrv ?? undefined)}</div>
    </div>
  );

  // =================== NAVIGAZIONE ===================
  // barra stile app di recupero: pillola scura opaca con 6 voci uguali; "Allenamento" (manubrio) apre la vista del coach.
  // Colori pieni e opachi, niente backdrop-filter né alpha: il CSS qui sotto li blinda con !important.
  const healthTabs: { id: Tab; label: string }[] = [{ id: "sonno", label: "Sonno" }, { id: "recupero", label: "Recupero" }, { id: "sforzo", label: "Sforzo" }];
  const isHealth = tab === "sonno" || tab === "recupero" || tab === "sforzo";
  const tabs: { id: string; label: string; to: Tab; on: boolean }[] = [
    { id: "home", label: "Home", to: "home", on: tab === "home" },
    { id: "salute", label: "Salute", to: isHealth ? tab : "recupero", on: isHealth },
    { id: "biologia", label: "Biologia", to: "biologia", on: tab === "biologia" },
    { id: "nutrizione", label: "Nutrizione", to: "nutrizione", on: tab === "nutrizione" },
    { id: "allenamento", label: "Allenamento", to: "fitness", on: tab === "fitness" },
    { id: "altro", label: "Altro", to: "altro", on: tab === "altro" },
  ];
  const navIcon = (id: string, color: string) => (
    <svg className="wb-ico" width={24} height={24} viewBox="0 0 26 26" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flex: "0 0 auto", stroke: color, fill: "none" }}>
      {id === "home" ? <path stroke={color} fill="none" d="M4.5 11.2 13 4.3l8.5 6.9v9.6a1.2 1.2 0 0 1-1.2 1.2h-4.6v-6.4h-5.4V22H5.7a1.2 1.2 0 0 1-1.2-1.2z" /> : null}
      {id === "salute" ? <><path stroke={color} fill="none" d="M13 21.6s-8.6-4.9-8.6-11.1A4.7 4.7 0 0 1 13 7.6a4.7 4.7 0 0 1 8.6 2.9c0 6.2-8.6 11.1-8.6 11.1z" /><path stroke={color} fill="none" d="M6.2 13.6h3.6l1.5-2.6 2.6 5 1.5-2.4h4.4" /></> : null}
      {id === "biologia" ? <><path stroke={color} fill="none" d="M8 3c0 5 10 5 10 10s-10 5-10 10" /><path stroke={color} fill="none" d="M18 3c0 5-10 5-10 10s10 5 10 10" /><path stroke={color} fill="none" d="M9.2 5.2h7.6M9.4 13h7.2M9.2 20.8h7.6" /></> : null}
      {id === "nutrizione" ? <><path stroke={color} fill="none" d="M7.5 4.2v6.3a2.5 2.5 0 0 0 5 0V4.2" /><path stroke={color} fill="none" d="M10 4.2v17.6" /><path stroke={color} fill="none" d="M18.5 21.8V4.2c-2.3 1.3-3.4 3.8-3.4 7v3.4h3.4" /></> : null}
      {id === "allenamento" ? <><path stroke={color} fill="none" d="M9 13h8" /><rect x={5.6} y={8.4} width={3.4} height={9.2} rx={1.1} stroke={color} fill="none" /><rect x={17} y={8.4} width={3.4} height={9.2} rx={1.1} stroke={color} fill="none" /><path stroke={color} fill="none" d="M3.6 11v4M22.4 11v4" /></> : null}
      {id === "altro" ? <path stroke={color} fill="none" d="M4.8 7.8h16.4M4.8 13h16.4M4.8 18.2h16.4" /> : null}
    </svg>
  );
  const healthSwitch = (
    <div style={{ ...frostIn, marginBottom: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: 14, background: K.card, border: `1px solid ${K.line}` }}>
        {healthTabs.map((h) => {
          const on = tab === h.id;
          return <button key={h.id} onClick={() => goTab(h.id)} style={{ ...btn, ...caps, flex: "1 1 0", minWidth: 0, height: 36, borderRadius: 10, textAlign: "center", fontSize: 12, color: on ? K.t1 : K.t3, background: on ? K.card2 : "transparent" }}>{h.label}</button>;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>{datePill}</div>
      {calendar ? <div style={{ marginTop: 10 }}>{calendar}</div> : null}
    </div>
  );
  let content: ReactNode;
  if (screen) {
    content = screen.kind === "dial" ? (screen.id === "sonno" ? sleepDetail(true) : screen.id === "recupero" ? recDetail(true) : strDetail(true))
      : screen.kind === "act" ? actScreen(screen.key) : screen.kind === "meal" ? mealScreen(screen.key) : screen.kind === "bio" ? bioScreen : screen.kind === "match" ? matchScreen(screen.key) : screen.kind === "hr" ? (hrScreen() ?? coachScreen) : screen.kind === "hair" ? hairScreen : screen.kind === "pills" ? pillsScreen : screen.kind === "fam" ? famScreen : screen.kind === "checks" ? checksScreen : screen.kind === "labs" ? labsScreen : screen.kind === "visits" ? visitsScreen : coachScreen;
  } else {
    content = tab === "home" ? home : tab === "sonno" ? <>{healthSwitch}{sleepDetail(false)}</> : tab === "recupero" ? <>{healthSwitch}{recDetail(false)}</> : tab === "sforzo" ? <>{healthSwitch}{strDetail(false)}</> : tab === "biologia" ? biologia : tab === "nutrizione" ? nutrizione : tab === "fitness" ? fitness : altro;
  }
  const showHeader = !screen && (tab === "home" || tab === "biologia" || tab === "nutrizione" || tab === "altro" || tab === "fitness");
  const col: CSSProperties = { boxSizing: "border-box", width: "100%", maxWidth: 440, margin: "0 auto", paddingLeft: 16, paddingRight: 16 };

  // tema scuro forzato su tutto il documento: nessun tema chiaro dell'host o del sistema può sovrascriverlo
  const css = `html,body{background:${K.bg} !important;background-color:${K.bg} !important;color-scheme:dark !important;margin:0}
:root{color-scheme:dark !important}
.wb-root{color-scheme:dark !important;background-color:${K.bg} !important}
.wb-pill{background:${K.navPill} !important;background-color:${K.navPill} !important;border:1px solid ${K.navEdge} !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important;color:${K.navOff} !important;opacity:1 !important;filter:none !important}
.wb-tab{background:transparent !important;-webkit-appearance:none !important;appearance:none !important;border:0 !important;box-shadow:none !important;outline:none}
.wb-lbl{color:${K.navOff} !important;-webkit-text-fill-color:${K.navOff} !important}
.wb-on .wb-lbl{color:${K.t1} !important;-webkit-text-fill-color:${K.t1} !important}
.wb-ico,.wb-ico *{stroke:${K.navOff} !important;fill:none !important}
.wb-on .wb-ico,.wb-on .wb-ico *{stroke:${K.t1} !important}
@keyframes wb-view{from{transform:translateY(6px)}}
@keyframes wb-fill{from{stroke-dashoffset:var(--wb-c)}}
@keyframes wb-glow{from{opacity:0;transform:scale(.96)}}
@keyframes wb-beat{0%,100%{transform:scale(1)}14%{transform:scale(1.22)}28%{transform:scale(1)}42%{transform:scale(1.12)}60%{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.wb-beat{animation:none!important}}
.wb-view{animation:wb-view 280ms cubic-bezier(.22,.61,.36,1) backwards}
.wb-fill{animation:wb-fill 900ms cubic-bezier(.22,.61,.36,1) backwards;transition:stroke-dashoffset 900ms cubic-bezier(.22,.61,.36,1)}
.wb-glow{animation:wb-glow 900ms cubic-bezier(.22,.61,.36,1) backwards}
@media (prefers-reduced-motion: reduce){.wb-view,.wb-fill,.wb-glow{animation:none !important;transition:none !important}}`;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const de = document.documentElement, b = document.body;
    de.style.setProperty("background-color", K.bg, "important");
    de.style.setProperty("color-scheme", "dark", "important");
    if (b) { b.style.setProperty("background-color", K.bg, "important"); b.style.setProperty("color-scheme", "dark", "important"); }
  }, []);

  return (
    <div className="wb-root" style={{ boxSizing: "border-box", height: vh, maxHeight: "100dvh", width: "100%", maxWidth: 440, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", backgroundColor: K.bg, background: `linear-gradient(180deg, ${K.top} 0px, ${K.mid} 320px, ${K.bg} 100%)`, colorScheme: "dark", fontFamily: FONT, color: K.t1 } as CSSProperties}>
      <style>{css}</style>
      <div ref={scroller}
        onTouchStart={(e: { touches: ArrayLike<{ clientX: number; clientY: number }> }) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e: { changedTouches: ArrayLike<{ clientX: number; clientY: number }> }) => { const t0 = touch.current; touch.current = null; const t = e.changedTouches[0]; if (!t0 || !t) return; const dx = t.clientX - t0.x, dy = t.clientY - t0.y; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && (!screen || screen.kind === "dial")) shift(dx < 0 ? 1 : -1); }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" } as CSSProperties}>
        {showHeader ? <div style={{ ...frost, padding: `calc(${safeTop} + 16px) 0 14px` }}><div style={col}>{header}</div></div> : null}
        <div key={screen ? JSON.stringify(screen) : tab} className="wb-view" style={{ ...col, paddingTop: 14, paddingBottom: screen ? 28 : "calc(100px + env(safe-area-inset-bottom))" }}>{content}</div>
      </div>
      {!screen ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 12px max(12px, env(safe-area-inset-bottom))", pointerEvents: "none" }}>
          <div style={{ maxWidth: 416, margin: "0 auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div className="wb-pill" style={{ pointerEvents: "auto", position: "relative", flex: "1 1 auto", minWidth: 0, height: 62, boxSizing: "border-box", display: "flex", alignItems: "stretch", justifyContent: "space-between", padding: "0 6px", borderRadius: 24, backgroundColor: K.navPill, border: `1px solid ${K.navEdge}`, boxShadow: `0 8px 22px ${K.navShadow}`, overflow: "hidden" }}>
              <svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}>
                <rect x={0} y={0} width="100%" height="100%" rx={23} ry={23} fill={K.navPill} style={{ fill: K.navPill }} />
              </svg>
              {tabs.map((t) => (
                <button key={t.id} className={t.on ? "wb-tab wb-on" : "wb-tab"} onClick={() => goTab(t.to)} aria-label={t.label} style={{ ...btn, position: "relative", flex: "1 1 auto", minWidth: 0, height: "100%", padding: "0 1px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", backgroundColor: "transparent" }}>
                  {navIcon(t.id, t.on ? K.t1 : K.navOff)}
                  <span className="wb-lbl" style={{ fontSize: 11, lineHeight: "14px", fontWeight: t.on ? 600 : 500, whiteSpace: "nowrap", color: t.on ? K.t1 : K.navOff, WebkitTextFillColor: t.on ? K.t1 : K.navOff } as CSSProperties}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
