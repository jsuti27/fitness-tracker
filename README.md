# Health Tracker

A phone-first PWA for tracking daily **steps**, **weight**, **macros**, and a **Push/Pull/Legs workout program** — with a live weight-loss projection. All data lives on-device (your phone's browser). No backend, no account, no API, works offline.

Built around a coach-written Push/Pull/Legs program: log each set, and the app applies the program's own progression rule to suggest next session's weight.

---

## Screens

| Tab | What it does |
|---|---|
| **Today** | Log steps, weight, and macros. Live progress: protein hero bar, steps ring, calories, weight→goal, macro minis, step streak. |
| **Train** | Pick Push/Pull/Legs → the whole day on one screen. Weight boxes open pre-filled with the next weight your coach's rule calls for, badged `↑ go up` or `= hold`, with last session's numbers and note above them. Autosaves as you type. Weekly volume chart + per-lift progression + recent sessions. |
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
- **Data model** (all in `localStorage`): `ht.targets`, `ht.days`, `ht.program`, `ht.sessions`, `ht.workoutStart`, `ht.syncSettings`, `ht.syncQueue`.
- **Stable exercise ids.** Sessions record an `exerciseId`, so renaming a lift keeps its history, charts, and progression suggestions. Name-matching survives only as a fallback for older sessions.
