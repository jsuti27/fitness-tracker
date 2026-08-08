# Sending your gym log to a Google Sheet

Do this once. Afterwards, every session you log on your phone lands in a Sheet in
your Drive — one row per set — that you can open and pivot on your computer.

Takes about five minutes.

---

## What you're building

The app on your phone stores everything locally. This setup adds a small script
that sits *inside a Google Sheet* and listens for the app sending it data. The
script is yours, in your Drive, running under your account. Nothing goes through
anyone else's server.

---

## Step 1 — Make the Sheet

1. Go to <https://sheets.google.com> and create a blank spreadsheet.
2. Name it something you'll recognise, e.g. **Gym Log**.

You don't need to add any headers — the script creates a tab called `Sets` with
the right columns the first time it receives data.

## Step 2 — Open the script editor

In the Sheet, click **Extensions → Apps Script**. A code editor opens in a new
tab with a file called `Code.gs` containing an empty `myFunction()`.

## Step 3 — Paste the script

1. Select everything in that editor and delete it.
2. Open `Code.gs` from this folder, copy the whole file, and paste it in.
3. Find this line near the top:

   ```js
   var SECRET = 'change-me';
   ```

   Replace `change-me` with any random string — `gymlog-7f3k9x` is fine. Write it
   down; you'll paste the same string into the app in Step 6.

4. Click the save icon (💾).

## Step 4 — Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** anything, e.g. "Gym log endpoint"
   - **Execute as:** *Me (your email)*
   - **Who has access:** *Anyone*
4. Click **Deploy**.

> **"Who has access: Anyone" — is that safe?**
> It means anyone who has the URL can send data to it. The URL is long and random
> and nobody else has it. The `SECRET` adds a second check: a request without the
> right secret is rejected. Nobody can *read* your sheet through this — the
> script only writes. Treat the URL like a password and don't paste it anywhere
> public. That's the honest picture: it's a locked door, not a bank vault.

## Step 5 — Authorise it

Google will ask you to authorise the script the first time.

1. Click **Authorize access**, pick your Google account.
2. You'll see **"Google hasn't verified this app"** — that's expected, because
   *you* just wrote it and never submitted it to Google for review.
3. Click **Advanced → Go to (your project name) (unsafe)**, then **Allow**.

When it finishes you get a **Web app URL** ending in `/exec`. Copy it.

Quick check: paste that URL into a browser tab. You should see
`{"ok":true,"message":"Gym log endpoint is running."}`.

## Step 6 — Point the app at it

1. Open the Macros & Gym app → **Settings** → **Google Sheet sync**.
2. Paste the **Web app URL** into the URL box.
3. Type the same **SECRET** you set in Step 3 into the Secret box.
4. Tap **Save sync settings**.
5. Tap **Sync now** to push everything you've already logged.

Go back to your Sheet — a `Sets` tab should have appeared with your sessions in it.

---

## How it behaves day to day

- **You don't have to do anything.** Every set you log syncs automatically.
- **No signal at the gym is fine.** Sessions save on the phone and go up the next
  time the app has a connection. Settings shows how many are waiting.
- **Editing a set fixes the Sheet too.** Rows are matched on
  date + day + exercise + set number and updated in place, so nothing duplicates.
- **Sync now** re-sends every session you've ever logged. Use it if the Sheet
  ever looks out of step, or after restoring a backup on a new phone.

## If something breaks

| What you see | What to do |
|---|---|
| `0 sent, 1 failed` in Settings | Check the URL ends in `/exec`, and that the secret matches Step 3 exactly |
| Browser check returns HTML, not `{"ok":true...}` | The deployment isn't public — redo Step 4 with *Who has access: Anyone* |
| Nothing appears in the Sheet | Make sure you deployed from the script *inside that Sheet*, not a standalone project |
| Changed the script since deploying | **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Editing the code alone doesn't update the live URL |

---

## The Program tab

Once you're on this version of the script, the app writes a second tab called
**Program** alongside `Sets`. You don't set it up — it appears the first time
the app sends a program change.

| Column | What it is |
|---|---|
| Day | Which day type the exercise belongs to (Push, Pull, Legs, …) |
| Order | Position within that day, starting at 1 |
| Exercise | Name as it appears in the app |
| Target Sets | How many sets the program calls for |
| Rep Range | e.g. `8-12`, or a single number like `10` |
| Increment | The weight jump the app suggests when you earn one |
| Exercise ID | The app's internal id for this exercise |

**Why it matters.** Your logged sets are in the `Sets` tab, but the *program* —
exercises, rep ranges, increments — lives only in your phone's browser storage.
Clear your site data or lose the phone and it's gone. This tab is its only
backup.

**It is overwritten, not merged.** Every program change in the app replaces the
whole tab. Anything you type into it by hand will be lost. Edit the program in
the app, not here.

**Don't change the Exercise ID column.** All your training history is keyed on
it. If you ever rebuild your program from this tab, keeping the ids identical is
what keeps each exercise attached to its past sessions — change one and that
exercise's history is orphaned.
