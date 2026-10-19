# Harvest Spin: sizing for a 1-spin-per-player event

*Written 2026-10-19. Nothing in `config.js` has been changed. This file is the options and a recommendation; you pick.*

**Setup:** every number below comes from the engine's own probability code (`computeProbabilities` and `rollTier`), run headless in Node, 20,000 pretend events per cell. Nothing touched real state. With 1 spin per player, **spin number = player number**, so "turnout" below means players = spins. Prize costs are still the placeholders (Grand RM 50, T2 10, T3 5, T4 2, T5 1, Thank-You 0.50), so treat the RM figures as relative, not real.

## Update 2026-10-19: decisions made and applied to `config.js`

Everything below this box is the original analysis (it compared options with the launch bonus off). The decisions that were then made differ from the recommendation, so **this box is the current truth** and the stock table here replaces the one in section 3.

**Decided:** 70 players, 1 spin each; grand `baseChance 0.001`, `rampStartSpin 60`, `rampStep 0.09`, `guaranteedBySpin 70`; launch bonus **on** (10 spins x2, deliberately); Harvest Meter stays visible; `simulation.spinsPerEvent` 70.

### Does the grand schedule do what was asked?

Yes. Exact calculation, cross-checked by simulation:

| Result at 70 players | Value |
|---|---|
| Won before spin 60 (a lucky early win, from the 0.1% base chance) | 5.7% |
| Won in the 60-70 window | **94.3%** |
| Median spin it is won | 63 |
| Not won at all by spin 70 | 0% (spin 70 is a certainty) |

Cumulative chance it has been won by spin: 59: 5.7%, 60: 14.3%, 61: 29.8%, 62: 48.8%, 63: 67.3%, 64: 82.1%, 65: 91.8%, 66: 97.0%, 67: 99.2%, 68: 99.8%, 69: 100.0%.

### Does the grand's rising chance interact badly with the launch bonus cap?

No. The bonus is over after spin 10, so it never overlaps the ramp. In every spin I checked (1, 6, 10, 11 and 59-70) the probabilities add up to exactly 100%. What does happen from spin 60 is that the normal 100% cap makes tiers 2-5 shrink **proportionally** (they keep their relative odds) to make room for the grand's share:

| Next spin | 59 | 60 | 62 | 64 | 65 | 66 | 68 | 69 | 70 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Grand | 0.1% | 9.1% | 27.1% | 45.1% | 54.1% | 63.1% | 81.1% | 90.1% | 100% |
| Tier 2 | 3.0% | 3.0% | 3.0% | 3.0% | 2.5% | 2.0% | 1.1% | 0.6% | 0% |
| Tier 3 | 8.0% | 8.0% | 8.0% | 8.0% | 6.8% | 5.5% | 2.8% | 1.5% | 0% |
| Tier 4 | 18.0% | 18.0% | 18.0% | 18.0% | 15.3% | 12.3% | 6.3% | 3.3% | 0% |
| Tier 5 | 25.0% | 25.0% | 25.0% | 25.0% | 21.2% | 17.1% | 8.8% | 4.6% | 0% |
| Thank-You | 45.9% | 36.9% | 27.9% | 0.9% | 0% | 0% | 0% | 0% | 0% |

Tiers 2-5 add up to 54%, so they only start shrinking once the grand takes more than 46%, which happens from spin 65.

Things to know (none of them is a bug):
- From spin 65 until the grand is won there is **no Thank-You chance**: each of those players gets the grand or a real prize from tiers 2-5. It is the same effect the launch bonus has, at the other end of the event.
- Once the grand is won, everything snaps back to the normal 3 / 8 / 18 / 25 / 46% split (checked at spin 65 with the grand already gone).
- The last players of a busy event therefore draw tiers 2-5 slightly harder than usual. That is already included in the stock numbers below.

### Revised stock (95th percentile; 70 spins; launch bonus on; this grand schedule)

Units the game hands out per 70-spin event, from 40,000 simulated events with unlimited stock:

| Tier | Average used | 90th percentile | **95th percentile (new `startingStock`)** | 99th percentile | Old stock |
|---|---:|---:|---:|---:|---:|
| Grand | 1.0 | 1 | **1** | 1 | 1 |
| T2 Triple Harvest | 2.4 | 4 | **5** | 6 | 8 |
| T3 Balanced Plate | 6.3 | 9 | **10** | 12 | 18 |
| T4 Lucky Pair | 14.1 | 18 | **20** | 22 | 40 |
| T5 Single Plate | 19.6 | 24 | **26** | 28 | 60 |
| T6 Thank-You | 26.7 | 32 | **33** | 36 | 100 |

Compared with the launch-bonus-off numbers: tiers 4 and 5 need about 2 more units each, T2 and T3 are about the same, and Thank-You needs about 5 fewer (33 instead of 38), because the bonus takes 10 players out of the Thank-You pool.

How these stock levels hold up (share of events in which a tier's stock hits zero before the event ends; this counts giving out the very last unit). Average cost per event is at the placeholder prize costs:

| Turnout | T2 | T3 | T4 | T5 | Thank-You | Avg spins with "out of gifts" | Avg cost |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 55 | 3.8% | 2.8% | 0.5% | 0.3% | 0.0% | 0 | RM 96 |
| 60 | 5.4% | 4.2% | 1.4% | 0.8% | 0.3% | 0 | RM 108 |
| 65 | 7.0% | 6.5% | 3.1% | 2.7% | 1.5% | 0.01 | RM 154 |
| **70** | **8.5%** | **9.2%** | **5.7%** | **5.8%** | **7.2%** | **0.09** | **RM 165** |
| 75 | 10.4% | 12.7% | 10.1% | 10.8% | 20.1% | 0.35 | RM 172 |
| 80 | 12.4% | 16.6% | 15.3% | 18.9% | 44.3% | 1.07 | RM 179 |

So at 70 players each tier hits zero in roughly 1 event in 12 to 1 in 20. A tier running out only means that player gets the next outcome down, not a crash. **The Thank-You Gift is the one to watch above 70 players:** at 80 players it runs out in 44% of events. It is the cheapest tier, so if you want more safety, 36 (the 99th percentile) costs little. The warning at `lowStockWarning: 10` shows on the operator screen.

---

## 1. Checking the reading of the current config

| Claim | Verdict |
|---|---|
| `rampStartSpin` is 90, so at 50-70 spins the ramp never starts and the grand stays at 0.1% all event | **Correct.** |
| Roughly 6% chance the grand is won at all | **Correct at 60 players.** It is 4.9% at 50, 6.0% at 60, 6.8% at 70 (3.4% at 35, 8.3% at 85). |
| Thank-You stock of 100 is far more than the ~25-35 needed | **Right conclusion, range slightly high.** With the launch bonus on, the Thank-You Gift averages 18 / 23 / 28 at 50 / 60 / 70 spins (the bonus drives it to 0% for the first 10 spins). With the bonus off it is 22 / 27 / 31. Stock 100 is 3-5x too many either way. Tiers 4 and 5 are overstocked too (40 and 60 in stock vs. about 10-14 and 15-20 used). |
| Launch bonus of 10 spins is ~1/6 of the event | **Correct** (1/5 at 50, 1/7 at 70). It is worse than it sounds: tiers 2-5 add up to 54%, so x2 hits the 100% cap and the **Thank-You chance is 0% for those 10 spins**. Those 10 players get a real prize every time. With 1 spin each, that is a pure first-come advantage for the first 10 people in the queue. |

So the problem is confirmed: at the new size the current config gives away the grand prize in roughly 1 event in 16 (and then at a random moment, not as a climax).

## 2. The options

All options use the same tier chances (3 / 8 / 18 / 25%, remainder to the Thank-You Gift); only the grand schedule and the launch bonus differ. "First third" means the grand was won in the first third of that event's spins (about the first 11 players of 35, 16 of 50, 23 of 70, 28 of 85).

### A. Current config, unchanged (the baseline)
`base 0.1%, start 90, step 2%, guaranteed 130, launch bonus 10 spins x2`

| Turnout | Grand won at all | Won at spin: median (10th-90th) | Won in first third | Avg total prize cost |
|---:|---:|---|---:|---:|
| 35 | 3.4% | 17 (4-31) | 1.1% | RM 64 |
| 50 | 4.9% | 26 (6-45) | 1.5% | RM 88 |
| 60 | 6.0% | 32 (7-56) | 1.8% | RM 104 |
| 70 | 6.8% | 36 (8-64) | 2.1% | RM 120 |
| 85 | 8.3% | 41 (9-76) | 2.7% | RM 144 |

The grand is almost never won, and when it is, the winner is spread randomly across the whole event (the 10th-90th range is just "some random moment").

### B. Rescaled for about 60 players
`base 0.1%, start 30, step 5%, guaranteed 49, bonus off`

| Turnout | Grand won at all | Won at spin: median (10th-90th) | Won in first third | Avg total prize cost |
|---:|---:|---|---:|---:|
| 35 | 70.6% | 33 (30-35) | 1.1% | RM 89 |
| 50 | 100.0% | 34 (31-38) | 1.5% | RM 126 |
| 60 | 100.0% | 34 (31-38) | 1.8% | RM 142 |
| 70 | 100.0% | 34 (31-38) | 2.1% | RM 157 |
| 85 | 100.0% | 34 (31-38) | 2.7% | RM 180 |

Reliable at 50-85 and the win lands in a tight window around spins 31-38. It is only "early" through the 0.1% base chance (about 2%). **Fails on a quiet day:** at 35 players the guarantee never arrives and the grand is won only 71% of the time.

### C. Robust at both 50 and 70 (guarantee lands well before a 50-player event ends)
`base 0.1%, start 24, step 6%, guaranteed 40, bonus off`

| Turnout | Grand won at all | Won at spin: median (10th-90th) | Won in first third | Avg total prize cost |
|---:|---:|---|---:|---:|
| 35 | 99.9% | 27 (25-31) | 1.1% | RM 103 |
| 50 | 100.0% | 28 (25-31) | 1.5% | RM 126 |
| 60 | 100.0% | 28 (25-31) | 1.8% | RM 142 |
| 70 | 100.0% | 28 (25-31) | 2.1% | RM 157 |
| 85 | 100.0% | 28 (25-31) | 64.3% | RM 180 |

Fires around spins 25-31, so it is won at 35, 50 and 70 alike. **The trade-off:** one guarantee number cannot be perfect for both ends. Earlier is safer for a small turnout but, on a big day, it lands early: it clears the first third at 70 (which ends at spin 23), but at 85 (first third ends at spin 28) it lands inside it in 64% of events.

### D. Same idea with a late floor (my own variant)
`base 0%, start 25, step 4%, guaranteed 49, bonus off`

| Turnout | Grand won at all | Won at spin: median (10th-90th) | Won in first third | Avg total prize cost |
|---:|---:|---|---:|---:|
| 35 | 95.9% | 30 (26-33) | 0.0% | RM 101 |
| 50 | 100.0% | 30 (26-34) | 0.0% | RM 126 |
| 60 | 100.0% | 30 (26-34) | 0.0% | RM 142 |
| 70 | 100.0% | 30 (26-34) | 0.0% | RM 157 |
| 85 | 100.0% | 30 (26-34) | 34.5% | RM 180 |

Setting `baseChance` to 0 removes the 0.1% per-spin chance of a freak early win (about 2-3% of events in B and C) and makes "not in the first third" a hard fact up to 70 players. The ramp is gentler (4% a spin), so the win is spread over spins 26-34 instead of 25-31.

### E. Turnout-robust (35 / 50 / 70 / 85)
`base 0%, start 28, step 8%, guaranteed 40, bonus off`

| Turnout | Grand won at all | Won at spin: median (10th-90th) | Won in first third | Avg total prize cost |
|---:|---:|---|---:|---:|
| 35 | 98.3% | 31 (29-34) | 0.0% | RM 102 |
| 50 | 100.0% | 31 (29-34) | 0.0% | RM 126 |
| 60 | 100.0% | 31 (29-34) | 0.0% | RM 142 |
| 70 | 100.0% | 31 (29-34) | 0.0% | RM 157 |
| 85 | 100.0% | 31 (29-34) | 7.8% | RM 180 |

**Why this shape:** a fixed number cannot track turnout, but a *late, steep* ramp fits a wide range of it. It never fires before spin 29 and always fires by spin 40. That window is after the first third for any event up to about 85 players and before the end for any event of about 40 or more. How it degrades:

| Turnout | What happens |
|---|---|
| under 29 | Never fires at all. |
| 35 | Won in 98% of events (spins 29-34). |
| 50 | Always won, at about the 60% point of the event. |
| 70 | Always won, at about the 45% point. Never in the first third. |
| 85 | Always won; in the first third in about 8% of events, otherwise around the 37% point. |
| 100+ | Still won at about spin 31, so it lands early in a big event, but it is never lost. |

The cost of this robustness is **predictability**: the winner is almost always the 29th-34th player. If anyone can see the count (the Harvest Meter does show it, see section 4) they can work it out. That is a fairness-versus-reliability trade and it is yours to decide.

**Live adjustment (no code change):** the Admin panel's overrides are read when the next spin's odds are worked out. If the day turns out different from the guess, a rule of thumb is: *set the ramp start to about half, and the guarantee to about two-thirds, of the turnout you now expect.* (E is exactly that for 60 players: 28 and 40.) I have not tested editing this mid-event on the real laptop, so rehearse it once.

### Side by side

| Option | 35 won | 50 won | 60 won | 70 won | Median spin (60) | First third at 70 | First third at 85 | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| A current | 3.4% | 4.9% | 6.0% | 6.8% | 32 | 2.1% | 2.7% | grand rarely won |
| B ~60 | 70.6% | 100.0% | 100.0% | 100.0% | 34 | 2.1% | 2.7% | great at 50-85, fails at 35 |
| C 50 and 70 | 99.9% | 100.0% | 100.0% | 100.0% | 28 | 2.1% | 64.3% | early on a big day |
| D | 95.9% | 100.0% | 100.0% | 100.0% | 30 | 0.0% | 34.5% | good middle, less predictable |
| **E** | 98.3% | 100.0% | 100.0% | 100.0% | 31 | 0.0% | 7.8% | best spread, most predictable |

Average total prize cost is almost identical for B-E (about RM 126 / 142 / 157 at 50 / 60 / 70 spins). It is RM 38-40 *higher* than A only because the RM 50 grand now actually gets given away. With the launch bonus on, add roughly RM 9 at 60 spins.

## 3. Launch bonus and stock

### Launch bonus: recommend turning it off
- At this size 10 boosted spins is 1/6 of the event, and with one spin each it only decides *which* players get lucky: the first 10 in the queue.
- Smaller versions are possible but gain little: **5 spins x 1.5** raises the average cost from RM 141.8 to RM 144.4 at 60 spins and still favours the first 5 players.
- Set `launchBonus.enabled: false` and leave `spins` and `multiplier` as they are, so it can be turned back on.

### Prize stock (SUPERSEDED: this assumed the launch bonus was off; use the table in the update box at the top)
Units the game *hands out* per event (average / 95th percentile), bonus off. The 95th percentile is the level that would have been enough in 19 events out of 20.

| Tier | Current stock | 50 spins | 60 spins | 70 spins | 85 spins |
|---|---:|---:|---:|---:|---:|
| T2 Triple Harvest | 8 | 1.5 / 4 | 1.8 / 4 | 2.1 / 5 | 2.6 / 5 |
| T3 Balanced Plate | 18 | 4.0 / 7 | 4.8 / 8 | 5.6 / 10 | 6.8 / 11 |
| T4 Lucky Pair | 40 | 9.0 / 14 | 10.8 / 16 | 12.6 / 18 | 15.3 / 21 |
| T5 Single Plate | 60 | 12.5 / 18 | 15.0 / 21 | 17.5 / 24 | 21.2 / 28 |
| T6 Thank-You | 100 | 22.0 / 28 | 26.6 / 33 | 31.2 / 38 | 38.2 / 46 |

The 20% rule you asked for (average at 70 spins x 1.2) gives 3 / 7 / 16 / 21 / 38 for T2 to Thank-You. I would not use it for the small tiers: at those levels Tier 3 runs out in 32% of 70-player events. Counts this small are lumpy, so I sized to the 95th percentile at 70 spins instead:

| Tier | Recommended `startingStock` | Current | Why |
|---|---:|---:|---|
| Grand | 1 | 1 | one winner |
| T2 Triple Harvest | 5 | 8 | 95th percentile at 70 is 5 |
| T3 Balanced Plate | 10 | 18 | 95th percentile at 70 is 10 |
| T4 Lucky Pair | 18 | 40 | 95th percentile at 70 is 18 |
| T5 Single Plate | 24 | 60 | 95th percentile at 70 is 24 |
| T6 Thank-You | 45 | 100 | 38 covers 70 players at the 95th percentile; 45 also covers about 85, and it is the cheapest tier to over-buy |

How it holds up (share of events in which a tier runs out before the event ends; E schedule, bonus off):

| Turnout | T2 | T3 | T4 | T5 | Thank-You | Avg spins with no gift |
|---:|---:|---:|---:|---:|---:|---:|
| 35 | 0.4% | 0.0% | 0.0% | 0.0% | 0.0% | 0 |
| 50 | 1.7% | 0.5% | 0.2% | 0.0% | 0.0% | 0 |
| 60 | 3.4% | 1.9% | 1.6% | 0.7% | 0.0% | 0 |
| 70 | 6.0% | 4.9% | 6.6% | 5.2% | 0.1% | 0 |
| 85 | 10.8% | 14.1% | 26.4% | 28.1% | 9.6% | 0.15 |
| 100 | 18.5% | 28.1% | 53.7% | 62.6% | 94.0% | 4.4 |

When a tier runs out its chance falls to the Thank-You Gift (`outOfStock: "noPrize"`), so a sold-out tier means a smaller prize for that player, never a crash. Run-outs happen late (typically spin 55-70 of a 70-player event). Tier 2 runs out most often because its demand is small and lumpy (mean about 2): if the real Tier 2 prize is cheap, buy a couple extra. At the placeholder costs this stock costs about RM 232 to buy, including the RM 50 grand, against an expected hand-out of about RM 142 at 60 players. The rest is leftover stock.

**For comparison:** with the current stock nothing meaningful runs out at 50-70 spins. The current problem is over-buying, not shortage.

## 4. Anything else that `spinsPerPlayer: 1` changes

1. **The Harvest Meter gives the game away.** It fills toward `rampStartSpin` and glows once the ramp is active. With E, "the meter is glowing" means "the winner is within the next dozen players", and everyone queuing can see it. With 1 spin each, a player can choose to join the line right behind the glow. This is a what-players-see decision, so I haven't touched it. Options: hide the meter, or keep it as a show piece.
2. **Winning is positional.** With rising odds the grand always goes to "whoever happens to be spin ~30". With 1 spin each that is one person's single try, so there is no making up for it on spin 2 or 3. That is the nature of the mechanic, but it is more visible at 1 spin. Not announcing that the prize is "due" keeps it feeling like luck.
3. **One draw per person.** At 3 spins a player had a decent chance of at least one prize above the Thank-You. At 1 spin, 46% of players get only the Thank-You Gift and only about 3% get a Tier 2 (about two prizes per event). That's fine if it's intended ("everyone wins something"), but each player's experience is flatter.
4. **Operator workload.** Each player needs a New Player click and a Harvest click, and the log's "Player's spin" column will always be 1. I have not checked the on-screen wording for things like "spin 1 of 1", so look at the screens when you rehearse.
5. **Admin simulation default is still 150 spins** (`simulation.spinsPerEvent`). The simulation and budget panels would answer for the wrong size until it is changed to about 60. This is a config-only change.
6. **A fixed schedule can't see turnout.** The game counts spins, not time or the queue. If the event ends early the grand can go unawarded (below 29 players it never fires). The live adjustment above is the only fix without changing the engine. A turnout-aware version (for example an "expected spins left" setting, or a time-based schedule) would be a design change needing code; I have not built it.
7. **`baseChance: 0`** is accepted by the config validator, but I haven't edited `config.js`, so run `node tests.js` after you apply it to confirm nothing assumes a non-zero base.

## 5. Recommendation: Option E

The grand is won in 100% of 50-70-player events and never in the first third up to 70 players. It still works at 35 (98% won) and is sensible at 85. B and D are equally good in the 50-70 range but less forgiving at the edges (B misses the quiet day, D is slightly worse at 35 and better at 85). Choose D if you would rather keep the winner less predictable (spread over spins 26-34) and accept 96% instead of 98% at 35.

Exact `config.js` values for Option E as originally recommended (**not** what was applied; see the update box at the top for what is in `config.js` now):

```js
spinsPerPlayer: 1,

grandPrize: {
  baseChance: 0,
  rampStartSpin: 28,
  rampStep: 0.08,
  guaranteedBySpin: 40,
},

launchBonus: {
  enabled: false,
  spins: 10,
  multiplier: 2,
},

// startingStock per tier
//   grand: 1   tier2: 5   tier3: 10   tier4: 18   tier5: 24   thanks: 45

simulation: {
  events: 10000,
  spinsPerEvent: 60,
},
```

Leave `lowStockWarning: 10` as it is. The decisions that are yours: the schedule (E vs D vs B or C), the launch bonus (off), the meter, and the prize costs once they're real.

## How this was produced

Scratch scripts outside the repo called `HarvestEngine.computeProbabilities` and `rollTier` in a loop (the same path as `simulateEvent`, with extra counters for stock run-out and units used per tier), seeded with `mulberry32`, 20,000 events per cell. Demand figures use unlimited stock on tiers 2-6, so they show what the game wants to give out; run-out figures use the real stock levels. The grand-prize timing figures were cross-checked against the exact closed-form probability.

## If turnout is low (operator instructions)

**The problem.** The grand prize only starts climbing at spin 60 and is only *certain* at spin 70. If fewer than 60 players come it is mostly never won: at 55 players it is won only 5.4% of the time (4.9% at 50). The fix is a two-box edit in the Admin panel, done before the event ends.

**The rule.**

1. Work out **L**, the spin number of the last player you are confident will play. (Example: you are on spin 38 and 12 more people are queued or committed, so L = 50.) Spin number = player number, because each player has one spin.
2. Set **Ramp starts at spin** to **L - 10**. If that is already behind you, use the next spin number instead (the live stats show it as "(spin N)").
3. Set **Guaranteed by spin** to **L**.
4. Do it **when about 10 players are still to come, or sooner**. The earlier the better: a late edit still guarantees the grand by spin L, but with less build-up.

This is the same shape as the planned 60/70 schedule, moved earlier: the grand is certain by spin L, and it falls in the final 11 spins about 94% of the time when done early enough.

| If the last player will be (L) | Ramp starts at | Guaranteed by |
|---:|---:|---:|
| 65 | 55 | 65 |
| 60 | 50 | 60 |
| 55 | 45 | 55 |
| 50 | 40 | 50 |
| 45 | 35 | 45 |
| 40 | 30 | 40 |

**The exact clicks.**

1. Press **Ctrl+Shift+A** (or add `#admin` to the page address) and enter the PIN.
2. In the **Odds, stock and prizes** part, find the box titled **Grand prize rising odds**. The **Live stats** at the top show *Total spins* and *Grand prize chance (next spin) ... (spin N)*, where N is the number of the next spin.
3. Click in **Ramp starts at spin**, type the new number, then press **Enter** (or **Tab**). The message *Saved.* should appear and the box is highlighted as changed.
4. Click in **Guaranteed by spin**, type L, press **Enter**. Look for *Saved.* again.
5. Check *Grand prize chance (next spin)* in the live stats. Press **Esc** to close the panel.

**Do them in that order** (ramp start first, then guaranteed). The game refuses a guaranteed-by spin that is earlier than the ramp start and shows a red *Not saved* message instead. If you see that, do the ramp-start box first.

**Notes.**
- The Harvest Meter will jump when you change the ramp start, because it fills toward that number. That is expected.
- If the grand has already been won, none of this matters.
- If far more people turn up than planned, do the opposite: raise the two numbers, keeping the ramp start 10 below the guarantee.
- To undo, put the boxes back to 60 and 70, or press **Reset odds & settings to config.js defaults**. That also undoes every other admin edit (stock, costs), though it keeps the spin log and the prizes already given.
- I checked these rules against the game's own validation code and probabilities, but I have **not** driven the real Admin panel in a browser. Try it once at the rehearsal, then do a **Full reset**.
