# data/happiness/: the Life App data model

One JSON file per area, written by the agent that owns it (see `agents/README.md`, rule 8). The app never reads anything
else. `python3 tools/happiness.py validate` checks every file against the schema below (it lives in `tools/happiness.py`,
`SCHEMA`; this page is generated from it). `python3 tools/happiness.py init` creates the folder from `sample-data/`.

Notation: `key?` optional; `date` = `YYYY-MM-DD`; `datetime` = `YYYY-MM-DDTHH:MM` local time; `num`/`int`/`str`/`bool`;
`N(x)` = x or null; `E(a, b)` = one of those values; `…` = extra keys allowed and ignored by the validator.

| file | owner (default role) | stale after |
| --- | --- | --- |
| `corpo.json` | fitness-coach | 36 h |
| `medico.json` | health-advisor | 120 days |
| `mente.json` | psychologist | 21 days |
| `lavoro.json` | founder-assistant | 14 days |
| `finanze.json` | accountant | 35 days |
| `relazioni.json` | best-friend | 35 days |
| `crescita.json` | best-friend | 35 days |
| `vita.json` | best-friend | 35 days |
| `weekly-summary.json` | whoever writes the Monday recap | 8 days |

Also read when present: `corpo-history.json` (long-run body history), `life-health-history.json` (one score per day,
appended by the build). Generated next to them: `*.md` recaps (`happiness.py recap`), never edited by hand.

## `corpo.json`

```
updatedAt: datetime
today: date
proteinTarget: num
stepsGoal?: num
days:
  - (list of)
    date: date
    meals:
      [ any, … ]
    workouts:
      [ any, … ]
    …
upcoming?: (or null)
  - (list of)
    date: date
    time: str
    name: str
    …
hrNow?: (or null)
  bpm: num
  at: datetime
  last60:
    [ num, … ]
  h24?:
    [ num, … ]
bioAge?: (or null)
  …
coach?: (or null)
  updatedAt?: datetime | null
  headline?: str | null
  verdict?: str | null
  actions?: (or null)
    [ str, … ]
skippedPlans?: (or null)
  - (list of)
    date: date
    name: str
    kind?: str | null
    time?: str | null
    said?: str | null
    …
…
```

## `medico.json`

```
updated: date
lab:
  name: str
  site: str
  date: date
  reports: int
  outOfRange: int
nextLabs: str
groups:
  - (list of)
    title: str
    items:
      - (list of)
        name: str
        value: str
        unit: str
        ref: str
        status: one of: "limite", "ok"
        long?: bool
        bar?:
          v: num
          lo: num | null
          hi: num | null
          min: num
          max: num
watch: str
checks:
  - (list of)
    title: str
    sub: str
    due: date | null
    dueText: str
    status: one of: "da decidere", "da fare", "facoltativo", "in attesa", "in corso", "proposto"
meds:
  - (list of)
    name: str
    dose: str
visits:
  - (list of)
    date: date
    title: str
family: str
familyHistory?: (or null)
  updated: date
  source: str
  groups:
    - (list of)
      key: str
      label: str
      who: str
      side: str
      items:
        - (list of)
          name: str
          age: str | null
          year: str | null
          note: str
          source: str
  timeline:
    - (list of)
      date: str
      label: str
      who: str
      text: str
  …
pills?: (or null)
  updated: date
  rule: str
  moments:
    - (list of)
      key: str
      label: str
      when: str
      items:
        - (list of)
          name: str
          dose: str
          note: str
          link?: str | null
  stock?: (or null)
    name: str
    count: num
    countDate: date
    perDay: num
    note: str
    reminder: date | null
    reminderText: str
  log?:
    - (list of)
      date: date
      status: one of: "cleared", "missed", "taken"
      slot?: one of: "mattina", "sera" | null
      at?: str | null
      by?: str
      note?: str
  …
```

## `mente.json`

```
updated: date
status: one of: "bene", "critico", "da seguire"
line: str
tip?: str | null   (or null)
```

## `vita.json`

```
updated: date
status: one of: "bene", "critico", "da seguire"
line: str
tip?: str | null
source?: str
sfere?:
  - (list of)
    key: str
    name: str
    status: one of: "bene", "critico", "da seguire"
    score?: num
    line: str
    steps:
      [ str, … ]
todo?:
  - (list of)
    titolo: str
    quando: str | null
    data?: date | null
    priorita: one of: "alta", "bassa", "media" | null
    fonte: one of: "open-loops", "personal-tasks"   (or null)
```

## `crescita.json`

```
updated: date
status: one of: "bene", "critico", "da seguire"
line: str
tip?: str | null
source?: str
sfere?:
  - (list of)
    key: str
    name: str
    status: one of: "bene", "critico", "da seguire"
    score?: num
    line: str
    steps:
      [ str, … ]
goals?:
  - (list of)
    name: str
    progress: num   (or null)
```

## `lavoro.json`

```
updated: date
priorita: (or null)
  status: one of: "bene", "critico", "da seguire"
  line: str
  steps:
    [ str, … ]
  source: str
tip?: str | null
source?: str
priorities?:
  - (list of)
    rank: int
    titolo: str
    status: one of: "bene", "critico", "da seguire"
    line: str
    q4: str | null
    next: str | null
    quando: date | null
    source: str
sfere?:
  - (list of)
    key: str
    name: str
    status: one of: "bene", "critico", "da seguire"
    score?: num
    line: str
    steps:
      [ str, … ]
wins?:
  - (list of)
    titolo: str
    data: date | null
    source: str
soddisfazione: (or null)
  status: one of: "bene", "critico", "da seguire"
  line: str
linkedin: (or null)
  week: date
  followers: int
  profileViews90d: int
  impressions7d: int
  searchAppearances: int
  bestPost: str
openLoops:
  [ str, … ]
events:
  - (list of)
    date: date
    end?: date | null
    time?: str | null
    name: str
```

## `finanze.json`

```
updated: date
spese: (or null)
  updated: date
  monthlyCost: num
  monthlyIn: num
margine: (or null)
  updated: date
  months: num
verdict: (or null)
  status: one of: "bene", "critico", "da seguire"
  line: str
  steps:
    [ str, … ]
```

## `relazioni.json`

```
updated: date
source: str
sfere:
  - (list of)
    key: str
    name: str
    status: one of: "bene", "critico", "da seguire"
    score?: num
    line: str
    steps:
      [ str, … ]
```

## `corpo-history.json`

```
- (list of)
  date: date
  source: one of: "body", "data"
  sonno: num | null
  recupero: num | null
  sforzo: num | null
  nutrizione: num | null
  allenamento: num | null
  oggi: num | null
  n: int
  …
```

## `life-health-history.json`

```
- (list of)
  date: date
  total: num | null
  source: one of: "build", "recap"
  …
```
