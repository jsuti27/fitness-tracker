# Health Tracker

A phone-first PWA for tracking daily **steps**, **weight**, **macros**, and a **Push/Pull/Legs workout program** — with a live weight-loss projection. All data lives on-device (your phone's browser). No backend, no account, no API, works offline.

Built around a coach-written Push/Pull/Legs program: log each set, and the app applies the program's own progression rule to suggest next session's weight.

---

## Screens

| Tab | What it does |
|---|---|
| **Today** | Log steps, weight, and macros. Live progress: protein hero bar, steps ring, calories, weight→goal, macro minis, step streak. |
| **Train** | Pick Push/Pull/Legs → the whole day on one screen. Weight boxes open pre-filled with the next weight your coach's rule calls for, badged `↑ go up` or `= hold`, with last session's numbers and note above them. Autosaves as you type. Weekly volume chart + per-lift progression + recent sessions. |
| **Plan** | Commit to the week's gym days (Mon–Sun). Tap **＋ Gym** and the next workout in your split fills in; **🔒 Lock in** to commit. Whether you went is read off what you log on Train — ✅ done, ❌ missed (pick a reason: Work, Tired, Sick, Social, Travel, Sore, Other, plus a note), ⭐ bonus. Shows % of planned days hit, a weeks-on-plan streak, the last 8 weeks and your top miss reasons. Below that, a **gym-days heatmap** of the last 26 weeks, coloured by Push / Pull / Legs, with missed planned days outlined — plus sessions per week and your longest gap. Syncs to a **Plan** tab in the Google Sheet. |
| **Program** | Your exercise list, editable. Add, rename, reorder, delete per day; set target sets, rep range, and the weight increment for each lift. Program start date lives here too. |
| **Settings** | Edit all targets, set up Google Sheet sync, **export/import** a backup file, erase all data. |

---

## Run it locally

You need [Node](https://nodejs.org) installed (used only for the dev server + tests).

```bash
cd builds/health-tracker
npm run serve      # starts http://localhost:8080
npm test           # runs the 72-test suite
```

Open `http://localhost:8080` in a browser. (A plain server is required because service workers don't run from `file://`.)

> On this machine, if `node` isn't found in your shell, use the full path:
> `"C:\Program Files\nodejs\node.exe" serve.mjs`

---

## Put it on your Android phone

1. Create a **public** GitHub repo (e.g. `health-tracker`) and push the contents of this folder to it.
2. Repo **Settings → Pages** → Source = `main` branch, `/ (root)` → Save.
3. After ~1 min you get a URL like `https://<username>.github.io/health-tracker/`.
4. On your phone, open that URL in **Chrome** → tap the **Install** prompt (or ⋮ menu → *Add to Home Screen*).
5. The "H" icon appears on your home screen. It runs full-screen and offline. Your data stays on the phone.

---

## How the progression rule works

Straight from the coach's program notes:

> If all sets do not meet the range, stay with this weight next week. If you achieve all sets
> within the range or exceed it, go up in weight next week.

The app applies that for you. Log a session, and next time you open that day:

- **`↑ go up`** — your **heaviest** set reached the **top** of the rep range, every other set
  cleared the bottom, and you did at least the target number of sets. The weight box is
  pre-filled with last time's weight plus that exercise's increment.
- **`↗ building`** — same weight as the session before, but **more total reps**. You're
  overloading without adding load, which is exactly how you earn the next jump. The box holds
  last time's weight.
- **`= hold`** — no rep improvement and the range wasn't met. Same weight again.
- **no badge** — no history for this lift yet, so no suggestion.

Beating the top of the range still counts as hitting it. Suggestions anchor on the *heaviest*
set of the last session, so a lighter drop-off set doesn't walk the weight down over time.
Every suggestion is just a starting value — type over it whenever you want.

### Why the top of the range matters

Requiring only the *bottom* of the range promotes you the moment you scrape the minimum, so
you land below the range at the new weight and grind back. Requiring the heaviest set to reach
the top means you bank the reps first. The other sets only have to clear the bottom, because
demanding the top on every set stalls on ordinary within-session fatigue.

This is also why rep ranges should be **wider where the weight jump is coarser**. A 5kg plate
is a rounding error on a leg press and a doubling on a 2.5kg lateral raise — so the lateral
raise gets `12-20` and buys its runway in reps, while the leg press can sit at `8-15`. Set each
exercise's increment to what your gym actually stocks (usually 5kg on machines and cable
stacks, 2.5kg on dumbbells), or the app will suggest weights you can't load.

---

## Review it on your computer (Google Sheet sync)

Sessions can push to a Google Sheet in your Drive, one row per set:

`Date | Week | Day | Exercise | Set | Kg | Reps | In range? | Note`

Set it up once — the steps are in **[`apps-script/README.md`](apps-script/README.md)**. After
that it's automatic. Logging works with no signal at the gym; anything unsent goes up the next
time the app has a connection. Rows are keyed on date + day + exercise + set, so retries and
later edits correct the sheet instead of duplicating rows.

---

## Stalled lifts

A lift is **stalled** when its last 3 sessions all failed to beat the best set before them. "Best" is the
estimated one-rep max of the session's best set (weight × (1 + reps ÷ 30)), so adding weight and adding
reps both count as progress. Stalled lifts get a card on the Train tab and a `⛔ stalled` badge while you
log, each with one next step chosen from the pattern in your log:

- **Earned the jump but never took it** → the weight to go up to.
- **The weight jump is over 25% of the load** → widen the rep range or use smaller plates.
- **Reps falling at the same weight** → a ~10% deload for one session.
- **Trained less than every 10 days** → frequency is the fix.
- Otherwise → change one variable for 3–4 weeks.

## Upper / Lower / Push / Pull / Legs

**Program → Load Upper/Lower/PPL (shoulder focus)** swaps in a 5-day split with shoulder work on every
upper-body day (~22 direct delt sets a week, shoulders first on Upper and Push). Lifts you already do
keep their id, so their history and next-weight suggestions carry straight over, and Push / Pull / Legs
keep their logged sessions. Everything is editable on the Program tab afterwards.

## Back up your data

Because everything is stored only on your device, use **Settings → Export data to file** every so often (saves a `.json`). To restore (new phone, cleared browser), use **Import data from file**.

---

## Project structure

```
health-tracker/
├── index.html            App shell — four tab sections (Today, Train, Program, Settings)
├── css/style.css         All styling (mobile-first, dark)
├── js/
│   ├── app.js            Today + Train screens, sync settings, nav wiring
│   ├── program-screen.js The Program editor screen
│   ├── dom.js            Shared DOM helpers ($, flash, escaping, theme colours)
│   ├── storage.js        Persistence (localStorage injected) + export/import
│   ├── calculations.js   Pure math: calories, weight projection, volume, workout stats
│   ├── plan.js           Weekly planner logic: week dates, done/missed status, score, streak
│   ├── plan-screen.js    The Plan screen
│   ├── stalls.js         Stalled-lift detection and the next-step tip for each
│   ├── progression.js    The coach's go-up / hold rule
│   ├── sync.js           Session → sheet rows, offline queue, POST to Apps Script
│   ├── charts.js         Hand-rolled SVG line/bar charts (zero dependencies)
│   └── program.js        Seed Push/Pull/Legs templates + rep-range parsing
├── apps-script/          The Google Sheet script + its setup guide
├── manifest.webmanifest  PWA metadata
├── service-worker.js     Offline caching
├── icons/                App icons (192/512)
├── serve.mjs             Tiny local dev server
├── make-icons.mjs        One-off icon generator
└── tests/                node --test suites (72 tests)
```

## Design notes

- **No dependencies.** Charts are SVG generated in `charts.js`, so the app installs and runs fully offline with nothing to `npm install`.
- **Testable logic.** `storage.js` takes its backend (localStorage / a fake) by injection, so all logic is unit-tested in `node --test`.
- **Data model** (all in `localStorage`): `ht.targets`, `ht.days`, `ht.program`, `ht.sessions`, `ht.workoutStart`, `ht.syncSettings`, `ht.syncQueue`, `ht.plan`, `ht.planLocks`.
- **Stable exercise ids.** Sessions record an `exerciseId`, so renaming a lift keeps its history, charts, and progression suggestions. Name-matching survives only as a fallback for older sessions.
