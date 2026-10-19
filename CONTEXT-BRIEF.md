# Harvest Spin: context brief for Claude Code

*Handover brief, written 2026-10-19. `README.md` is the user manual; this file is the project's backstory, current state and working rules, written for a Claude Code session picking up the project.*

**How to use it:** open Claude Code on this repo and say:

> Read `CONTEXT-BRIEF.md` and follow it.

**Before that, for the human:**

1. **Get access.** The owner adds you under the repo's *Settings → Collaborators*. Accept the email invite.
2. **Fix a failed push.** If Claude gets a 403 when it pushes, connect your GitHub account in Claude's settings.
3. **Play the game.** On the repo page click *Code → Download ZIP*, unzip it, and double-click `index.html` in the unzipped folder. Clicking it on github.com only shows code.
4. **Open the admin panel.** Press Ctrl+Shift+A, then enter the PIN (`adminPin` in `config.js`).

---

You're picking up **Harvest Spin**, a food-themed, slot-style prize game for a school charity booth supporting UN SDG 2 (Zero Hunger).

- **Repo:** https://github.com/blueslick/harvest-spin (owner: blueslick).
- **Who you're working with:** the person who asked you to read this is the owner's friend and co-developer.
- Read this whole brief, then follow [Your first steps](#your-first-steps) at the end.

## What the game is

It runs in a browser on one laptop at the booth. An operator (the owner or the friend) drives it:

1. A player answers a quiz on paper.
2. The operator presses **New Player** (1 spin per player for this event; `spinsPerPlayer` in `config.js`).
3. The player presses **Harvest!**. Three reels spin and stop left to right.
4. The screen shows the prize to hand over.

It's a prize game, not gambling: nobody pays to play, and everyone wins something.

## Hard constraints (don't break these)

- Plain HTML + CSS + vanilla JavaScript. No frameworks, no npm dependencies, no build step, no server.
- It must work by double-clicking `index.html` from a local folder (a `file://` page). So:
  - classic `<script>` tags with globals (`HARVEST_CONFIG`, `HarvestEngine`);
  - no ES modules;
  - no fetching local files.
- `engine.js` is pure logic: no DOM, no storage, no timers.
- `ui.js` only draws, animates, wires buttons and saves.
  - It never makes game decisions.
  - It never sets inline colours or sizes. It only toggles classes and the `--fill` CSS variable, because a designer will restyle `style.css` and `index.html` later.
- Every tunable value lives in `config.js`, heavily commented so non-coders can edit it.

## Files

- **`config.js`:**
  - symbols and tiers (rules, chances, prize names, costs in RM, starting stock);
  - the grand prize's rising-odds schedule, the launch bonus and the out-of-stock rule;
  - spins per player, `adminPin` and the low-stock warning;
  - simulation defaults and reel timing.
- **`engine.js`:**
  - tier rules and combo classification;
  - the probability table and outcome generation;
  - stock, player flow and logging;
  - the budget projection and simulation;
  - CSV and sheet rows, the PIN check and config validation.
- **`ui.js`:** the main screen, reel animation, admin panel, localStorage, backups, Google Sheets sync and the PIN prompt.
- **`index.html`, `style.css`:** structure and a deliberately plain look.
- **`tests.js` + `test.html`:** 55 unit tests. Run `node tests.js` or open `test.html`.
- **`apps-script/Code.gs`:** the Google Sheets receiver.
- **`apps-script/test.js`:** tests `Code.gs` against a fake Google (`node apps-script/test.js`).
- **`README.md`:** full docs. Read it first. It covers:
  - how to run the game and edit the config;
  - how the odds work and what the admin panel does;
  - backups and the Sheets setup;
  - the git workflow and the designer's class hooks.

## How the mechanics work

### Outcome first

Each spin:

1. Rolls the tier from a probability table.
2. Picks a 3-symbol combo uniformly at random from all combos for that tier.
3. Animates the reels onto those symbols.

The spin is committed and saved before the animation, so refreshing mid-spin can't re-roll it. There's no near-miss logic anywhere.

### Symbols and tiers

The six symbols are 🍽️ Full Plate, 🍚 Rice, 🥦 Vegetables, 🍗 Protein, 🍞 Bread and 💧 Water. That gives 216 combos. Each combo belongs to exactly one tier; this is checked at startup and in the tests.

Default tiers:

| Tier | Combination | Combos | Chance |
|---|---|---:|---|
| 1 Grand | 🍽️🍽️🍽️ | 1 | rising odds (below) |
| 2 | three of a kind, except 🍽️ | 5 | 3% |
| 3 Balanced Plate | 🍚🥦🍗 in any order | 6 | 8% |
| 4 | exactly one pair, not 🍽️🍽️ | 75 | 18% |
| 5 | exactly one 🍽️ and no pair | 60 | 25% |
| 6 Thank-You Gift | everything else | 69 | whatever is left (`remainder: true`) |

### Grand prize rising odds

- **Schedule:** 0.1% per spin until machine spin 60, then +9% per spin, reaching 100% at spin 70 (sized for about 70 players).
- **Spin number** counts every spin on the machine since the event started.
- The grand prize is disabled once it's won.
- **Simulation:** it's won between spin 60 and 70 about 94% of the time (median spin 63) and earlier about 6% of the time. With under 60 players it is not guaranteed (about 5% at 55): `EVENT-SIZING.md` has the operator's low-turnout steps.
- **Harvest Meter:** the on-screen meter fills toward spin 60 and glows once the ramp is active. Kept visible on purpose (crowd-puller).

### Launch bonus

- For the first 10 spins, tiers 2–5 are multiplied by 2. Kept on deliberately for this event (early buzz): the first 10 players are guaranteed a real prize.
- They're capped so the total stays at or under 100% (scaled down proportionally).
- It never touches the grand prize.
- **Known side effect, kept so far:** with the default odds the cap kicks in, so the Thank-You Gift is 0% during boosted spins.

### Stock

- A tier with 0 stock is never awarded.
- Its chance falls through to the Thank-You Gift (`outOfStock: "noPrize"`) or to the next tier down (`"nextLowerTier"`).
- The grand prize never cascades down.
- A sold-out tier's combos are never shown.
- If the Thank-You Gift itself runs out, the spin shows "out of gifts" and the operator gets a warning.

### Order of calculation per spin

1. Grand prize chance from the schedule.
2. Stock fall-through.
3. Launch bonus.
4. Cap at 100%.
5. Remainder to the Thank-You Gift.

## Operator features

### Persistence

- All state is stored in localStorage under `harvestSpin.state.v1`.
- That includes the log: timestamp, spin number, player, player's spin, tier, prize, cost, symbols and bonus flag.
- **Export CSV** is at the bottom of the screen.

### Backups

- **Auto-backup file** (File System Access API, Chrome or Edge only): pick a file once per page load, and it's rewritten after every spin.
- **Download backup:** saves a JSON copy, in any browser.
- **Restore:** in the admin panel. It only accepts real backup files.

### Hidden admin panel

- **Opening it:** Ctrl+Shift+A, or add `#admin` to the URL. Then enter the PIN (`adminPin` in `config.js`).
- **The PIN is only a deterrent,** because the repo is readable. Five wrong tries lock the prompt for 30 seconds.
- **What it has:**
  - Live stats.
  - Editing of odds, prize names, costs, stock, the grand schedule, the launch bonus, spins per player and the out-of-stock rule. Edits are saved as overrides on top of `config.js` and highlighted, with a button to reset to the `config.js` defaults.
  - A budget calculator.
  - A simulation: 10,000 events × 70 spins (`simulation.spinsPerEvent`), run on a private copy.
  - Sheets sync settings and backup/restore.
  - A Full reset that needs you to type RESET.

### Google Sheets sync

- Each spin is sent to an Apps Script web app.
- Spins queue while offline and retry.
- The script skips duplicates (by timestamp + spin number), so "Resend all" is always safe.
- The URL and secret token are stored only in the browser (`harvestSpin.sync.v1`). They're never in git or backups.
- **Not yet deployed for real.** It has been tested against a local mock server and a fake Google, but not a real Google account. The owner sets it up using the steps in the README, then presses **Send test row**.

## History: what changed from the original spec

- **No more "no prize":** originally, "no prize" was an outcome that showed a random SDG 2 fact. The owner didn't want anyone leaving empty-handed, so it became Tier 6 Thank-You Gift and the facts were removed.
- **Added after the first build:**
  - backups and Google Sheets sync;
  - the admin PIN and the low-stock warning;
  - README instructions for running from a downloaded copy.
- **How the rules fall:** 🍽️🍽️ + any other symbol lands in the Thank-You pool, so about 22% of thank-you spins show two plates. That isn't deliberate near-miss logic.

## Current state (2026-10-19)

- **Event plan (decided):** about 70 players, **1 spin each**, so about 70 spins. Launch bonus stays on (10 spins x2) and the Harvest Meter stays visible. `config.js` is sized for this; the reasoning and numbers are in `EVENT-SIZING.md` (read its "If turnout is low" section too).
- **Tests:** all 55 unit tests and the Apps Script tests pass.
- **Branch:** everything is merged into `main`. The working branch `claude/practical-bohr-1bcvkm` is the same as `main` and can be ignored.
- **Placeholders still to replace:**
  - **Prize costs:** Grand RM 50, T2 RM 10, T3 RM 5, T4 RM 2, T5 RM 1, Thank-You RM 0.50. Prize names are placeholders too.
  - **Stock (sized for 70 spins, launch bonus on, 95th percentile):** Grand 1, T2 5, T3 10, T4 20, T5 26, Thank-You 33. Re-size it if the real prizes or the turnout estimate change; re-run the simulation described in `EVENT-SIZING.md`.
  - **Thank-You Gift stock:** about 27 are handed out on average in a 70-spin event (fewer than the 46% rule of thumb, because the launch bonus and the grand's late climb squeeze it out).

## Open to-do list (none of this has been started)

1. **Real prizes.** Put real prize names, costs and stock in `config.js`, then check the budget with the admin simulation.
2. **Visual design:**
   - Design in Figma (or Canva), then restyle `style.css` and `index.html`, keeping the IDs and class hooks listed in the README.
   - Optionally, use custom icons instead of emoji (add an image option to `symbols`).
3. **Google Sheets.** Deploy the receiver for real and confirm it with **Send test row**.
4. **Rehearsal** on the actual booth laptop and browser:
   - Try the real auto-backup in Chrome. So far it has only been tested with a stub.
   - Before the event, clear the sheet's Spins tab, then do a Full reset.
5. **Small gaps:**
   - Backup files (`harvest-spin-backup*.json`) aren't in `.gitignore` yet.
   - No CI (for example, GitHub Actions) runs the tests on push.

## How to work on this

- **Before changing code:** read `README.md`, then `config.js`, `engine.js` and `ui.js`.
- **Testing:**
  - Any change to game rules or odds goes in `engine.js`, with a test in `tests.js`.
  - Run `node tests.js` before every commit. If you touch `Code.gs`, run `node apps-script/test.js` too. Everything must pass.
  - For UI changes, open `index.html` in a real browser (or drive it with Playwright over `file://`) and check there are no console errors.
- **Game math must stay safe:**
  - tiers stay mutually exclusive;
  - probabilities sum to 1;
  - nothing out of stock is ever awarded;
  - simulations never touch real state.
- **Secrets and event data:** never commit the Sheets URL or token, CSV exports or backup files.
- **Git:**
  - Run `git pull` before starting. Make small commits with clear messages, and push when done.
  - Use a branch and pull request for anything big or risky.
  - Ask the owner before merging to `main` or making design-level changes (rules, odds, what players see).
  - The owner sometimes edits directly on github.com, so always pull first.
- **Explaining:** use plain language. They're students running a charity booth, not professional developers. Point out trade-offs and anything that affects fairness, prize cost or the booth on the day.
- **Keeping this brief current:** update this file when something here stops being true (state, to-dos, decisions).

## Your first steps

1. Pull the latest code and run both test suites.
2. In a few lines, summarise the state of the project and anything that looks off.
3. Then ask what to work on. Don't change any code until you're told to.
