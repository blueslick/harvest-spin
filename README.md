# Harvest Spin

A food-themed, slot-style game for a school charity booth supporting **UN SDG 2: Zero Hunger**. Players answer a quiz on paper, then an operator gives them spins on a laptop. It is a prize game, not gambling: nobody pays to play.

Plain HTML + CSS + vanilla JavaScript. No frameworks, no build step, no server, no installs. **Double-click `index.html` to play.**

> Status: working mechanics with a deliberately plain UI. A designer will restyle it later (see [For the designer](#for-the-designer)).

---

## Contents

1. [Run it](#run-it)
2. [Files](#files)
3. [Running the booth](#running-the-booth)
4. [Editing `config.js`](#editing-configjs)
5. [How the odds work](#how-the-odds-work)
6. [Admin panel](#admin-panel)
7. [Saved data and CSV export](#saved-data-and-csv-export)
8. [Tests](#tests)
9. [Working together with git](#working-together-with-git)
10. [For the designer](#for-the-designer)

---

## Run it

- **Play:** double-click `index.html` (works from your file system in Chrome, Edge, Firefox, Safari).
- **Check everything is healthy:** double-click `test.html`. It should say *"All N tests passed"* in green.
- **Optional (terminal):** `node tests.js` runs the same tests. Node is only needed for this; the game itself never needs it.

## Files

| File | What it is | Who edits it |
|---|---|---|
| `config.js` | Every tunable value: symbols, tiers, odds, prizes, stock, rising odds, launch bonus, spins per player | Anyone (heavily commented) |
| `engine.js` | Pure game logic: outcome generation, odds, stock, simulation, CSV. **No DOM code.** | Developer |
| `ui.js` | DOM, reel animation, buttons, admin panel, saving to the browser | Developer |
| `index.html`, `style.css` | Page structure and look | Designer |
| `tests.js`, `test.html` | Automated checks (same tests, two ways to run them) | Developer |

The logic/presentation split is strict: `engine.js` knows nothing about the page, and `ui.js` never makes a game decision. It asks the engine and draws the answer.

## Running the booth

1. Open `index.html`. Press **New Player** (gives the player their spins, 3 by default).
2. Press **Harvest!**. The three reels spin and stop one by one, left to right.
3. The result appears: the tier and prize name. **Everyone wins something**: spins that win nothing else get the Tier 6 Thank-You Gift. Hand over the prize.
4. When the player has no spins left, press **New Player** for the next one.

The **Harvest Meter** fills as the machine's total spin count approaches the "ramp start" spin, then glows once the grand prize odds are rising. The **Launch Bonus** banner shows while boosted spins remain.

**Before the event:** test as much as you like, then open the Admin panel and use **Full reset** so the event starts at spin 0 with full stock.

**After the event:** click **Export CSV** (bottom of the page, or in the Admin panel).

## Editing `config.js`

Open `config.js` in any text editor (Notepad, VS Code...). It is written for non-coders:

- Change the value after a colon. Keep the commas and the "quotes".
- Chances are decimals: `0.03` = 3%, `0.001` = 0.1%.
- Save, then refresh the game page. Open `test.html` to confirm nothing broke; the game also shows a red banner and disables itself if `config.js` has an error.

What's in it:

| Section | Controls |
|---|---|
| `spinsPerPlayer` | Spins each player gets |
| `symbols` | The six reel symbols (id, emoji, name) |
| `grandPrize` | Rising-odds schedule: `baseChance`, `rampStartSpin`, `rampStep`, `guaranteedBySpin` |
| `launchBonus` | `enabled`, `spins`, `multiplier` |
| `outOfStock` | `"noPrize"` or `"nextLowerTier"` (see below) |
| `tiers` | For each tier: `name`, `rule`, `chance`, `prizeName`, `prizeCostRM`, `startingStock`. The last tier is the Thank-You Gift (no `chance`: it gets whatever is left) |
| `lowStockWarning` | Show a warning when the Thank-You Gift is down to this many |
| `simulation`, `animation` | Simulation defaults and reel timing |

> **Admin overrides beat `config.js`.** Anything you change in the Admin panel is saved in the browser and takes priority over the file *for that field only* (highlighted yellow in the panel). If you edit `config.js` and a value doesn't change, check the Admin panel and press **Reset odds & settings to config.js defaults**.

## How the odds work

### Outcome first

The reels are **not** spun independently and read off afterwards. Each spin does this:

1. **Roll the tier** using the exact probabilities (below).
2. **Pick a combination** uniformly at random from *all* valid 3-symbol combinations for that tier.
3. **Animate** the reels so they stop, left to right, on those symbols.

The Thank-You Gift works the same way: it picks randomly from **all combinations that win nothing else**. There is no near-miss logic.

The spin is recorded and saved *before* the animation starts, so refreshing the page mid-spin can't be used to re-roll.

### The tiers

There are 6 symbols, so 6 × 6 × 6 = **216** possible combinations. Each belongs to **at most one** tier (`test.html` verifies this, and so does the game at startup):

| Tier | Rule | Combos | Default chance |
|---|---|---:|---|
| 1 Grand Harvest | 🍽️🍽️🍽️ | 1 | rising schedule (below) |
| 2 Triple Harvest | three of a kind, any symbol except 🍽️ | 5 | 3% |
| 3 Balanced Plate | 🍚🥦🍗 in any order | 6 | 8% |
| 4 Lucky Pair | exactly two the same, not 🍽️🍽️ | 75 | 18% |
| 5 Single Plate | exactly one 🍽️, no pair | 60 | 25% |
| 6 Thank-You Gift | everything else (wins nothing above) | 69 | the remainder |

Things worth knowing about these rules:

- 🍚🍚🍽️ counts as a **pair** (tier 4), not a single plate: tier 5 requires "no pair".
- 🍽️🍽️ + any other symbol matches none of tiers 1–5, so it lands in the Thank-You Gift pool. Because that pool is uniform over its 69 combos, 15 of them (about 22% of thank-you spins) show two plates. This is not deliberate near-miss logic. To change it, change the tier rules in `config.js`.
- A sold-out tier's combinations are never shown, not even as a Thank-You Gift, so a winning-looking combo never appears without its prize.
- **Nobody leaves empty-handed, as long as Thank-You Gifts are in stock.** If they run out, the spin shows "out of gifts" and the game warns the operator (bottom of the screen) when stock is low. With the default odds, about 46% of spins are Thank-You Gifts (about 64 in a 150-spin event), so stock roughly **half as many gifts as the total spins you expect**.

### Rising odds for the grand prize

```
before rampStartSpin :  baseChance
from rampStartSpin on:  baseChance + rampStep × (spinNumber − rampStartSpin + 1)
from guaranteedBySpin:  100%
```

`spinNumber` counts **every spin on this machine since the event started**, across all players. With the defaults (0.1% base, ramp at 90, +2% per spin, guaranteed at 130):

| Spin | 1–89 | 90 | 95 | 100 | 110 | 120 | 129 | 130+ |
|---|---|---|---|---|---|---|---|---|
| Grand chance | 0.1% | 2.1% | 12.1% | 22.1% | 42.1% | 62.1% | 80.1% | 100% |

Once the grand prize is won (stock 0) it is switched off for the rest of the event.

### Launch bonus

For the first `spins` spins of the event (default 10), the odds of tiers 2–5 are multiplied by `multiplier` (default 2×). It never touches the grand prize.

The total probability can never exceed 100%. If the boosted tiers would exceed the room left after the grand prize's share, they are **scaled down proportionally** (their relative odds stay the same). With the default numbers, tiers 2–5 add up to 54%, so 2× would be 108%: the cap kicks in, the effective boost is about 1.85×, and the Thank-You Gift chance drops to 0% for those spins, so all 10 boosted spins win a real prize from tiers 1–5. Use a multiplier of 1.5 or lower if you want boosted spins to still sometimes give just a Thank-You Gift.

### Stock

A tier with no stock left is never awarded. Its chance goes to:

- `"noPrize"` (default): falls through to the Thank-You Gift.
- `"nextLowerTier"`: goes to the next tier down that still has stock (Tier 3 → 4 → 5 → Thank-You Gift).

The grand prize's chance **always** falls through to the Thank-You Gift when it is won; it never cascades into tier 2, because its ramp-up chance is too large to hand down.

### Order of calculation for each spin

1. Grand chance from the schedule (0 if out of stock).
2. Sold-out tiers hand their chance on (per `outOfStock`).
3. Launch bonus multiplies the remaining tiers 2–5.
4. Tiers 2–5 are scaled down if they exceed 100% minus the grand's share.
5. The Thank-You Gift gets whatever is left. (If it has no stock, that share becomes "out of gifts".)

## Admin panel

Open with **Ctrl+Shift+A** (Esc closes it). If your browser keeps that shortcut for itself, add `#admin` to the end of the page address instead (`.../index.html#admin`).

- **Live stats:** total spins, players, current grand chance, prizes given, stock, cost given, and each outcome's chance on the next spin.
- **Odds, stock and prizes:** edit chances, prize names and costs, stock remaining, the grand prize schedule, the launch bonus (on/off, spins, multiplier), spins per player, and the out-of-stock rule. Changes save instantly and invalid values are rejected with a message (for example, tier chances totalling more than 100%). **Reset odds & settings to config.js defaults** clears all admin edits (it keeps the log and prizes already given).
- **Budget calculator:** expected cost of the next spin (Σ chance × prize cost), projected total for any number of spins, and the cost of prizes given so far. The projection includes the launch bonus and grand ramp but ignores tier 2–5 stock limits.
- **Simulation:** runs 10,000 pretend events of 150 spins with the current settings and starting stock, and shows when the grand prize is typically won (median, 10th and 90th percentile) and the average cost per event. It uses a private copy of everything and **never touches the real log or state**. With the default config, the grand prize is typically won around spin 97 (10th–90th percentile: spins 90–103) at an average prize cost of roughly RM 288 per event (placeholder costs).
- **Full reset:** erases spins, players, the log and prizes given, for the start of the event. It needs you to type `RESET`, and it keeps your odds and settings.

## Saved data and CSV export

Everything (spin count, prizes given, current player, the log, whether the grand prize was won, admin settings) is saved in the browser's **localStorage**, so refreshing the page loses nothing.

- It is stored per browser on that laptop. **Use the same browser, open the game from the same file location, and don't clear browsing data** during the event. Another browser, or a moved folder, starts empty.
- If the browser can't save (private window, blocked storage), a warning banner says so.
- **Export CSV** downloads the full log: timestamp, spin number, player number, the player's spin number, outcome tier, tier name, prize, prize cost, symbols, and whether the launch bonus was active. It opens in Excel or Google Sheets.
- Game data is **not** part of the repository, and `*.csv` files are git-ignored so event data isn't published by accident.

## Backups: keeping the data safe

Game data lives in the browser's localStorage, which survives refreshes but **not** clearing browsing data, switching browsers or a new Chrome profile. Three safety nets:

1. **Auto-backup file (Chrome or Edge):** press **Set up auto-backup** at the bottom of the page once and choose a file (put it on a USB stick, or in a Google Drive / OneDrive / Dropbox folder to get it off the laptop). The full game data is rewritten to that file after every spin; the status line shows the time of the last save. You must pick the file again after reloading the page. (Browsers don't allow pages to write to disk without you choosing the file.)
2. **Download backup** (any browser): saves a `.json` copy of everything. Use it at breaks.
3. **Restore:** Admin panel → *Backup & restore* → choose a backup file. It replaces everything (spins, log, stock, settings) after a confirmation, and refuses files that aren't Harvest Spin backups.

Also **Export CSV** regularly for the human-readable log. If you want the log in a Google Sheet automatically, that needs an internet connection at the booth and a small Google Apps Script. It is not built in yet.

## Tests

`test.html` (or `node tests.js`) checks the engine against the **current** `config.js`, including:

- every one of the 216 combinations maps to exactly one outcome, and the tier rules are mutually exclusive;
- the pool sizes (1 / 5 / 6 / 75 / 60 / 69), and that every spin gets a prize while Thank-You Gifts are in stock, plus spot-checks of specific combos (e.g. 🍚🍚🍽️ is a pair; 🍽️🍽️🍚 is a Thank-You Gift);
- generated combos always belong to the rolled tier, and every valid combo is reachable;
- measured tier frequencies over 100,000 spins match the configured odds;
- the rising-odds schedule, the guarantee, and that a won grand prize is disabled;
- the launch bonus: multiplies tiers 2–5 only, never exceeds 100%, lasts exactly N spins;
- stock handling in both modes, and that nothing out of stock is ever awarded;
- logging, player flow, saving and loading, full reset;
- the simulation leaves its (frozen) inputs untouched, and agrees with the budget projection;
- CSV escaping.

**Run them after every change to `config.js` or the engine, and before pushing.**

## Working together with git

Two people, one repo, so a few simple habits avoid nearly all conflicts.

### First time (the other person)

```bash
git clone https://github.com/blueslick/harvest-spin.git
cd harvest-spin
```

(Or use GitHub Desktop / VS Code's Git panel if you prefer clicking.)

### GitHub website vs GitHub Desktop

Same repository, same history; it's only a different way to run the same git commands, and you can mix them freely.

- **Website editor:** each "Commit changes" creates a commit straight on GitHub. Nothing is on your laptop until you pull it.
- **GitHub Desktop:** works on a copy on your laptop. Press **Fetch origin / Pull** before you start (this picks up anything done on the website), then **Commit** and **Push origin** when done. The booth laptop needs a local copy (clone it with Desktop, or *Code → Download ZIP*), and it needs a fresh pull after any website edit.
- The one rule when mixing: **pull before you edit** anywhere, so you never edit an old copy.

Game data is not part of the repo, so none of this ever affects a game in progress. It only changes the code.

### Every working session

1. **Pull before you start:** `git pull`
2. Make your changes, then check: open `test.html` (or `node tests.js`) and look at the game.
3. **Commit often**, in small pieces with clear messages:
   ```bash
   git status                      # see what changed
   git add config.js               # or: git add -A
   git commit -m "Set real prize names and costs"
   ```
4. **Push** when you're done (or at least at the end of the session): `git push`
5. If `git push` is rejected, someone pushed first: `git pull`, then `git push` again.

### Avoiding conflicts

- **Split by file.** Designer: `style.css` and `index.html`. Developer: `engine.js`, `ui.js`, `tests.js`. `config.js` is shared. Tell each other before editing it, and commit it in its own small commit.
- Pull before you start, push before you stop, and don't leave work uncommitted overnight.
- If git reports a **merge conflict**, it marks the clashing lines with `<<<<<<<`, `=======`, `>>>>>>>`. Keep the right version, delete the markers, then `git add` the file and `git commit`. If you're unsure, ask before pushing.

### Larger or risky changes (optional)

Work on a branch and merge it through a pull request on GitHub so the other person can look first:

```bash
git checkout -b restyle-reels
# ...commit as usual...
git push -u origin restyle-reels      # then open a Pull Request on GitHub
```

### Event data stays out of git

`.gitignore` excludes `*.csv` and `exports/`. Don't commit the exported log, and don't commit real prize-sponsor details you want kept private.

## For the designer

You can restyle freely in `style.css`, and restructure `index.html` as long as you keep the IDs. `ui.js` never sets colours or sizes. It only toggles these hooks:

| Hook | Meaning |
|---|---|
| `#meter.is-ramping` | Harvest Meter is full and the grand prize odds are rising (glow state) |
| `#meter.is-claimed` | Grand prize has been won |
| `#meter` CSS variable `--fill` | Meter fill, e.g. `42.5%`; `#meter-fill` uses it as its width |
| `.reel.is-spinning` / `.reel.is-stopped` | A reel is spinning / has just landed (use for animation) |
| `#result.is-win` / `#result.is-none` | Result panel for a prize / "out of gifts" (rare) |
| `#stock-warning` | Operator warning when Thank-You Gifts are low (shown/hidden via `hidden`) |
| `#launch-banner` | Launch bonus banner (shown or hidden via the `hidden` attribute) |
| `#spin-btn:disabled` | While spinning or when the player has no spins |

Reel timing is in `config.js` (`animation.reelStopTimesMs`); the spin/flicker visuals are yours. The admin panel is functional only; there's no need to style it.
