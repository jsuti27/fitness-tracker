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

- **`↑ go up`** — every working set landed at or above the bottom of the rep range, and you
  did at least the target number of sets. The weight box is pre-filled with last time's
  weight plus that exercise's increment.
- **`= hold`** — you came up short on at least one set. The box is pre-filled with the same
  weight as last time.
- **no badge** — no history for this lift yet, so no suggestion.

Beating the top of the range still counts as hitting it. Suggestions anchor on the *heaviest*
set of the last session, so a lighter drop-off set doesn't walk the weight down over time.
Every suggestion is just a starting value — type over it whenever you want.

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
