/* =========================================================================
   HARVEST SPIN - TESTS
   =========================================================================
   Run either way:
     * double-click test.html           (shows a green/red list in the browser)
     * node tests.js                    (prints to the terminal, exit code 1 on failure)

   These check the engine against the CURRENT config.js, so run them after
   editing the config. They never touch localStorage or the real game state.
   ========================================================================= */

(function () {
  "use strict";

  const Config = typeof HARVEST_CONFIG !== "undefined" ? HARVEST_CONFIG : require("./config.js");
  const E = typeof HarvestEngine !== "undefined" ? HarvestEngine : require("./engine.js");

  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  // ---- tiny assertion helpers ----
  function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "not equal") + ": expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
  function near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new Error((msg || "not close") + ": expected " + b + " +/- " + tol + ", got " + a); }
  function deepFreeze(o) { Object.values(o).forEach((v) => { if (v && typeof v === "object") deepFreeze(v); }); return Object.freeze(o); }

  // ---- shared fixtures ----
  const ids = Config.symbols.map((s) => s.id);
  const ALL = E.enumerateCombos(ids);
  const tierIds = Config.tiers.map((t) => t.id);
  const thanks = Config.tiers.find((t) => t.remainder).id;      // the thank-you (catch-all) tier
  const fixedTiers = Config.tiers.filter((t) => !t.remainder);   // tiers with an explicit rule
  const cfg = () => E.clone(Config);                               // a private copy to break on purpose
  const settingsFor = (overrides) => E.resolveSettings(Config, overrides || {});
  const stateAt = (totalSpins, awarded) => Object.assign(E.createInitialState(), { totalSpins, awarded: awarded || {} });
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const NO_BONUS = { "launchBonus.enabled": false };
  const SEED = 12345;

  // =======================================================================
  // CONFIG
  // =======================================================================
  test("config.js passes validation (no overlaps, sane numbers)", () => {
    const problems = E.validateConfig(Config);
    eq(problems.length, 0, "config problems: " + problems.join(" | "));
  });

  test("validation catches overlapping tiers", () => {
    const bad = cfg();
    bad.tiers.find((t) => t.id === "tier2").rule = { type: "threeOfAKind" }; // now also matches 3 plates = grand
    assert(E.validateConfig(bad).some((p) => /overlap/i.test(p)), "overlap not detected");
  });

  test("validation catches unknown rule types and unknown symbols", () => {
    const a = cfg(); a.tiers[1].rule = { type: "banana" };
    assert(E.validateConfig(a).some((p) => /unknown rule/i.test(p)));
    const b = cfg(); b.tiers[0].rule = { type: "exactly", symbol: "pizza" };
    assert(E.validateConfig(b).some((p) => /unknown symbol/i.test(p)));
  });

  test("validation catches tier chances adding to more than 100%", () => {
    const bad = cfg(); bad.tiers[1].chance = 0.9;
    assert(E.validateConfig(bad).some((p) => /more than 100%/.test(p)));
  });

  test("validation catches a tier that can never be won", () => {
    const bad = cfg(); bad.tiers[4].rule = { type: "anyOrder", symbols: ["rice", "rice", "rice"] };
    assert(E.validateConfig(bad).some((p) => /never be won|overlap/i.test(p)));
  });

  // =======================================================================
  // COMBINATION RULES
  // =======================================================================
  test("there are 6^3 = 216 combinations", () => eq(ALL.length, Math.pow(ids.length, 3)));

  test("every combo maps to exactly one outcome (a tier, including the thank-you tier)", () => {
    ALL.forEach((combo) => {
      const hits = Config.tiers.filter((t) => E.classify(combo, Config) === t.id);
      assert(hits.length <= 1, combo.join() + " matches several tiers");
      const outcome = E.classify(combo, Config);
      assert(tierIds.includes(outcome), "unexpected outcome " + outcome);
    });
  });

  test("tier rules are mutually exclusive (checked rule by rule, not via classify)", () => {
    // Re-evaluate the raw rules independently of classify() to make sure no combo is claimed twice.
    const raw = {
      exactly: (c, r) => c.every((s) => s === r.symbol),
      threeOfAKind: (c, r) => new Set(c).size === 1 && c[0] !== r.except,
      anyOrder: (c, r) => new Set(c).size === 3 && r.symbols.every((s) => c.includes(s)),
      pair: (c, r) => new Set(c).size === 2 && c.find((s) => c.filter((x) => x === s).length === 2) !== r.except,
      exactlyOne: (c, r) => c.filter((s) => s === r.symbol).length === 1 && new Set(c).size === 3,
    };
    ALL.forEach((combo) => {
      const hits = fixedTiers.filter((t) => raw[t.rule.type](combo, t.rule));
      assert(hits.length <= 1, combo.join() + " claimed by " + hits.map((t) => t.id).join(" & "));
    });
  });

  test("with the default config, pool sizes are 1 / 5 / 6 / 75 / 60 / 69 thank-you (sum 216)", () => {
    const t = E.comboTable(Config);
    const sizes = tierIds.map((id) => t[id].length);
    eq(sizes.join("/"), "1/5/6/75/60/69", "tier pool sizes");
    eq(sizes.reduce((a, b) => a + b, 0), 216);
  });

  test("known combos land in the right tier", () => {
    const c = (...x) => E.classify(x, Config);
    eq(c("plate", "plate", "plate"), "grand");
    eq(c("rice", "rice", "rice"), "tier2");
    eq(c("water", "water", "water"), "tier2");
    ["rice,veg,protein", "rice,protein,veg", "veg,rice,protein", "veg,protein,rice", "protein,rice,veg", "protein,veg,rice"]
      .forEach((s) => eq(c.apply(null, s.split(",")), "tier3", s));
    eq(c("rice", "rice", "veg"), "tier4");
    eq(c("rice", "veg", "rice"), "tier4");
    eq(c("veg", "rice", "rice"), "tier4");
    eq(c("rice", "rice", "plate"), "tier4", "pair + a plate is a pair, not a single plate");
    eq(c("plate", "rice", "veg"), "tier5");
    eq(c("rice", "plate", "veg"), "tier5");
    eq(c("rice", "veg", "plate"), "tier5");
    eq(c("plate", "plate", "rice"), thanks, "two plates are not a tier-4 pair");
    eq(c("rice", "plate", "plate"), thanks);
    eq(c("rice", "veg", "water"), thanks);
    eq(c("bread", "water", "rice"), thanks);
    eq(c("rice", "veg", "bread"), thanks, "no protein -> not a balanced plate");
  });

  // =======================================================================
  // OUTCOME GENERATION
  // =======================================================================
  test("generateCombo only returns combos of the requested tier, and can reach every one", () => {
    ["none"].concat(tierIds).forEach((tier) => {
      const pool = E.comboTable(Config)[tier];
      const expectedTier = tier === "none" ? thanks : tier;   // "none" (thank-you out of stock) reuses the thank-you pool
      const seen = new Set();
      // sweep the random range evenly so each pool entry is hit
      for (let i = 0; i < pool.length; i++) {
        const combo = E.generateCombo(tier, Config, () => (i + 0.5) / pool.length);
        eq(E.classify(combo, Config), expectedTier, tier + " produced a combo from another outcome");
        seen.add(combo.join());
      }
      eq(seen.size, pool.length, tier + " pool not fully reachable");
    });
  });

  test("thank-you combos are uniform over all non-winning combos (no deliberate near-misses)", () => {
    const rng = E.mulberry32(SEED);
    const pool = E.comboTable(Config)[thanks];
    const counts = {};
    const N = 69000;
    for (let i = 0; i < N; i++) { const k = E.generateCombo(thanks, Config, rng).join(); counts[k] = (counts[k] || 0) + 1; }
    eq(Object.keys(counts).length, pool.length, "every no-prize combo should appear");
    const expected = N / pool.length;
    const sigma = Math.sqrt(N * (1 / pool.length) * (1 - 1 / pool.length));
    Object.keys(counts).forEach((k) => near(counts[k], expected, 5 * sigma, "combo " + k));
  });

  test("a spin's symbols always agree with its tier (500 spins, whole flow)", () => {
    const rng = E.mulberry32(SEED);
    const state = E.createInitialState();
    for (let i = 0; i < 500; i++) {
      if (!E.canSpin(state)) E.startNewPlayer(state, settingsFor(state.overrides));
      const r = E.resolveSpin(state, Config, rng);
      eq(E.classify(r.symbols, Config), r.tier === "none" ? thanks : r.tier, "symbols do not match tier at spin " + r.spinNumber);
      E.commitSpin(state, r);
    }
  });

  // =======================================================================
  // GRAND PRIZE SCHEDULE
  // =======================================================================
  test("grand chance follows the rising-odds schedule", () => {
    const g = Config.grandPrize;
    near(E.grandChance(1, g), g.baseChance, 1e-12, "spin 1");
    near(E.grandChance(g.rampStartSpin - 1, g), g.baseChance, 1e-12, "last spin before ramp");
    near(E.grandChance(g.rampStartSpin, g), g.baseChance + g.rampStep, 1e-12, "first ramp spin");
    near(E.grandChance(g.rampStartSpin + 9, g), g.baseChance + g.rampStep * 10, 1e-12, "10th ramp spin");
    eq(E.grandChance(g.guaranteedBySpin, g), 1, "guaranteed spin");
    eq(E.grandChance(g.guaranteedBySpin + 50, g), 1, "after guaranteed spin");
    let prev = 0;
    for (let n = g.rampStartSpin; n <= g.guaranteedBySpin; n++) { const c = E.grandChance(n, g); assert(c >= prev && c <= 1, "must not decrease or exceed 100%"); prev = c; }
  });

  test("grand is certain at the guaranteed spin, and tiers 2-5 get nothing then", () => {
    const s = settingsFor();
    const info = E.computeProbabilities(stateAt(s.grand.guaranteedBySpin - 1), s);
    eq(info.probs.grand, 1);
    tierIds.slice(1).forEach((id) => eq(info.probs[id], 0, id));
    eq(info.probs.none + info.probs[thanks], 0, "nothing left for the thank-you tier");
    const rng = E.mulberry32(SEED);
    for (let i = 0; i < 200; i++) eq(E.rollTier(info.probs, info.order, rng), "grand");
  });

  test("once the grand prize is won it is disabled", () => {
    const s = settingsFor(NO_BONUS);
    const won = stateAt(s.grand.rampStartSpin + 5, { grand: 1 });
    const info = E.computeProbabilities(won, s);
    eq(info.probs.grand, 0);
    eq(info.grandChance, 0);
    near(sum(info.probs), 1, 1e-9);
    const rng = E.mulberry32(SEED);
    for (let i = 0; i < 5000; i++) assert(E.rollTier(info.probs, info.order, rng) !== "grand", "grand awarded after being won");
  });

  test("harvest meter: fills towards the ramp start, then becomes active", () => {
    const s = settingsFor();
    const r = s.grand.rampStartSpin;
    let m = E.harvestMeter(stateAt(0), s);
    eq(m.fill, 0); eq(m.active, false); eq(m.available, true);
    m = E.harvestMeter(stateAt(Math.floor((r - 1) / 2)), s);
    assert(m.fill > 0.4 && m.fill < 0.6 && !m.active, "halfway");
    m = E.harvestMeter(stateAt(r - 2), s);
    eq(m.active, false, "next spin is still before the ramp");
    m = E.harvestMeter(stateAt(r - 1), s);
    eq(m.fill, 1); eq(m.active, true, "next spin is the first ramp spin");
    m = E.harvestMeter(stateAt(r + 20, { grand: 1 }), s);
    eq(m.active, false, "ramp is off once the grand is claimed"); eq(m.available, false);
  });

  // =======================================================================
  // PROBABILITIES
  // =======================================================================
  test("normal spin: exact odds from config, remainder is the thank-you gift", () => {
    const s = settingsFor(NO_BONUS);
    const p = E.computeProbabilities(stateAt(40), s).probs;
    near(p.grand, 0.001, 1e-12); near(p.tier2, 0.03, 1e-12); near(p.tier3, 0.08, 1e-12);
    near(p.tier4, 0.18, 1e-12); near(p.tier5, 0.25, 1e-12);
    near(p[thanks], 1 - 0.001 - 0.54, 1e-12); eq(p.none, 0, "nobody is left empty-handed");
    near(sum(p), 1, 1e-12);
  });

  test("probabilities always sum to 1 across many spin numbers and stock levels", () => {
    [{}, NO_BONUS, { "launchBonus.multiplier": 5 }, { outOfStock: "nextLowerTier" }].forEach((ov) => {
      const s = settingsFor(ov);
      for (let n = 0; n < 160; n += 3) {
        [{}, { tier3: 99 }, { tier3: 99, tier4: 99 }, { tier2: 99, tier3: 99, tier4: 99, tier5: 99 }, { grand: 1 }].forEach((aw) => {
          const p = E.computeProbabilities(stateAt(n, aw), s).probs;
          near(sum(p), 1, 1e-9, "sum at spin " + (n + 1));
          Object.values(p).forEach((v) => assert(v >= 0 && v <= 1 + 1e-12, "probability out of range"));
        });
      }
    });
  });

  test("measured tier frequencies match the configured odds (100,000 full spins)", () => {
    const s = settingsFor(NO_BONUS);
    const state = stateAt(40);                       // fixed spin number so odds stay constant
    state.overrides = Object.assign({}, NO_BONUS, { "tiers.tier2.startingStock": 1e9, "tiers.tier3.startingStock": 1e9, "tiers.tier4.startingStock": 1e9, "tiers.tier5.startingStock": 1e9 });
    const probs = E.computeProbabilities(state, E.resolveSettings(Config, state.overrides)).probs;
    const rng = E.mulberry32(SEED);
    const N = 100000, counts = {};
    for (let i = 0; i < N; i++) { const t = E.resolveSpin(state, Config, rng).tier; counts[t] = (counts[t] || 0) + 1; }
    Object.keys(probs).forEach((id) => {
      const p = probs[id], sigma = Math.sqrt(N * p * (1 - p));
      near(counts[id] || 0, N * p, 5 * sigma + 1, id + " frequency");
    });
    assert(s, "settings");
  });

  // ---- launch bonus ----
  test("launch bonus: multiplies tiers 2-5 only, never the grand", () => {
    const s = settingsFor({ "launchBonus.multiplier": 1.5 });
    const info = E.computeProbabilities(stateAt(0), s);
    eq(info.bonusActive, true);
    near(info.probs.grand, 0.001, 1e-12, "grand unchanged");
    near(info.probs.tier2, 0.045, 1e-12); near(info.probs.tier3, 0.12, 1e-12);
    near(info.probs.tier4, 0.27, 1e-12); near(info.probs.tier5, 0.375, 1e-12);
    near(info.probs[thanks], 1 - 0.001 - 0.81, 1e-12);
  });

  test("launch bonus: total never exceeds 100% (default 2x on 54% is capped; ratios preserved; grand untouched)", () => {
    const s = settingsFor();                          // default multiplier 2 -> 108% before cap
    const p = E.computeProbabilities(stateAt(0), s).probs;
    near(sum(p), 1, 1e-12, "total");
    near(p.grand, 0.001, 1e-12, "grand unchanged");
    near(p[thanks], 0, 1e-12, "no room left for the thank-you gift");
    near(p.tier2 / p.tier5, 0.03 / 0.25, 1e-9, "relative odds preserved");
    assert(p.tier2 > 0.03 && p.tier2 < 0.06, "boosted but capped");
    const huge = E.computeProbabilities(stateAt(0), settingsFor({ "launchBonus.multiplier": 100 })).probs;
    near(sum(huge), 1, 1e-12);
  });

  test("launch bonus: lasts exactly N spins, can be switched off, and counts down", () => {
    const s = settingsFor();
    const n = s.launchBonus.spins;
    eq(E.computeProbabilities(stateAt(n - 1), s).bonusActive, true, "last boosted spin");
    eq(E.computeProbabilities(stateAt(n), s).bonusActive, false, "first normal spin");
    eq(E.launchBonusStatus(stateAt(0), s).spinsLeft, n);
    eq(E.launchBonusStatus(stateAt(3), s).spinsLeft, n - 3);
    eq(E.launchBonusStatus(stateAt(n + 5), s).spinsLeft, 0);
    eq(E.launchBonusStatus(stateAt(0), settingsFor(NO_BONUS)).active, false);
    eq(E.computeProbabilities(stateAt(0), settingsFor(NO_BONUS)).bonusActive, false);
  });

  test("launch bonus does not leak into the grand schedule", () => {
    const withBonus = E.computeProbabilities(stateAt(3), settingsFor()).probs.grand;
    const without = E.computeProbabilities(stateAt(3), settingsFor(NO_BONUS)).probs.grand;
    eq(withBonus, without);
  });

  // ---- stock ----
  test("out of stock (noPrize mode): chance falls through to the thank-you gift", () => {
    const s = settingsFor(NO_BONUS);
    const p = E.computeProbabilities(stateAt(40, { tier3: s.tiers[2].startingStock }), s).probs;
    eq(p.tier3, 0);
    near(p[thanks], 1 - 0.001 - 0.46, 1e-12);
    near(p.tier4, 0.18, 1e-12, "other tiers untouched");
  });

  test("out of stock (nextLowerTier mode): chance cascades down, skipping empty tiers", () => {
    const s = settingsFor(Object.assign({ outOfStock: "nextLowerTier" }, NO_BONUS));
    const full = (id) => s.tiers.find((t) => t.id === id).startingStock;
    let p = E.computeProbabilities(stateAt(40, { tier3: full("tier3") }), s).probs;
    near(p.tier3, 0, 1e-12); near(p.tier4, 0.26, 1e-12, "tier3's 8% moved to tier4");
    p = E.computeProbabilities(stateAt(40, { tier3: full("tier3"), tier4: full("tier4") }), s).probs;
    near(p.tier4, 0, 1e-12); near(p.tier5, 0.51, 1e-12, "cascaded through tier4 into tier5");
    p = E.computeProbabilities(stateAt(40, { tier3: full("tier3"), tier4: full("tier4"), tier5: full("tier5") }), s).probs;
    near(p.tier5, 0, 1e-12); near(p[thanks], 1 - 0.001 - 0.03, 1e-12, "bottom tier's chance falls to the thank-you gift");
    p = E.computeProbabilities(stateAt(40, { tier2: full("tier2") }), s).probs;
    near(p.tier3, 0.11, 1e-12, "tier2's 3% moved to tier3");
  });

  test("grand never cascades into tier 2 when it is won, even in nextLowerTier mode at high ramp odds", () => {
    const s = settingsFor({ outOfStock: "nextLowerTier", "launchBonus.enabled": false });
    const p = E.computeProbabilities(stateAt(100, { grand: 1 }), s).probs;
    eq(p.grand, 0); near(p.tier2, 0.03, 1e-12);
  });

  test("a depleted tier doesn't use up the launch-bonus cap", () => {
    const s = settingsFor({ "launchBonus.multiplier": 1.8 });
    const p = E.computeProbabilities(stateAt(0, { tier5: 60 }), s).probs;   // tier5 sold out
    near(p.tier4, 0.18 * 1.8, 1e-12, "not scaled down: 29% x 1.8 fits in 100%");
  });

  test("never awards a prize that is out of stock (real flow, tiny stock)", () => {
    const stock = { "tiers.grand.startingStock": 1, "tiers.tier2.startingStock": 2, "tiers.tier3.startingStock": 3, "tiers.tier4.startingStock": 4, "tiers.tier5.startingStock": 5 };
    ["noPrize", "nextLowerTier"].forEach((mode) => {
      const rng = E.mulberry32(SEED);
      const state = E.createInitialState();
      state.overrides = Object.assign({ outOfStock: mode }, stock);
      for (let i = 0; i < 400; i++) {
        if (!E.canSpin(state)) E.startNewPlayer(state, E.resolveSettings(Config, state.overrides));
        E.commitSpin(state, E.resolveSpin(state, Config, rng));
      }
      const s = E.resolveSettings(Config, state.overrides);
      s.tiers.forEach((t) => assert((state.awarded[t.id] || 0) <= t.startingStock, mode + ": " + t.id + " over-awarded"));
      assert(state.awarded.grand === 1, mode + ": grand should have been won by spin 400");
      assert(E.stockOf(state, s, "tier2") === 0 || (state.awarded.tier2 || 0) < 2);
      // prize rows in the log match the counters
      const logged = {};
      state.log.forEach((e) => { if (e.tier !== "none") logged[e.tier] = (logged[e.tier] || 0) + 1; });
      eq(JSON.stringify(logged, Object.keys(logged).sort()), JSON.stringify(state.awarded, Object.keys(state.awarded).sort()));
    });
  });

  test("a sold-out tier's combos are never shown (not even as the thank-you gift)", () => {
    const rng = E.mulberry32(SEED);
    const state = E.createInitialState();
    state.overrides = { "tiers.tier3.startingStock": 0 };
    state.awarded = {};
    for (let i = 0; i < 3000; i++) {
      const r = E.resolveSpin(state, Config, rng);
      assert(r.tier !== "tier3", "tier3 awarded with 0 stock");
      assert(E.classify(r.symbols, Config) === r.tier, "showed " + r.symbols + " for outcome " + r.tier);
    }
  });

  // =======================================================================
  // STATE, PLAYERS, LOG
  // =======================================================================
  test("players: New Player gives spins, spins run out, spins are counted", () => {
    const state = E.createInitialState();
    const s = settingsFor();
    eq(E.canSpin(state), false, "no player yet");
    E.startNewPlayer(state, s);
    eq(state.currentPlayer.number, 1); eq(state.currentPlayer.spinsLeft, s.spinsPerPlayer);
    const rng = E.mulberry32(SEED);
    for (let i = 0; i < s.spinsPerPlayer; i++) { assert(E.canSpin(state)); E.commitSpin(state, E.resolveSpin(state, Config, rng)); }
    eq(E.canSpin(state), false, "out of spins");
    eq(state.totalSpins, s.spinsPerPlayer);
    let threw = false;
    try { E.commitSpin(state, E.resolveSpin(state, Config, rng)); } catch (e) { threw = true; }
    assert(threw, "spinning with 0 spins left must be rejected");
    E.startNewPlayer(state, s);
    eq(state.currentPlayer.number, 2); eq(state.playerCount, 2);
  });

  test("spins-per-player override applies to the next new player", () => {
    const state = E.createInitialState();
    const r = E.tryOverride(state.overrides, "spinsPerPlayer", 5, Config);
    assert(r.ok); state.overrides = r.overrides;
    E.startNewPlayer(state, E.resolveSettings(Config, state.overrides));
    eq(state.currentPlayer.spinsLeft, 5);
  });

  test("each spin is logged with timestamp, spin number, player, tier, symbols and bonus flag", () => {
    const state = E.createInitialState();
    E.startNewPlayer(state, settingsFor());
    const when = new Date("2026-01-02T03:04:05Z");
    const r = E.resolveSpin(state, Config, E.mulberry32(SEED));
    E.commitSpin(state, r, when);
    eq(state.log.length, 1);
    const e = state.log[0];
    eq(e.timestamp, "2026-01-02T03:04:05.000Z"); eq(e.spinNumber, 1); eq(e.player, 1); eq(e.playerSpin, 1);
    eq(e.tier, r.tier); eq(e.symbols.join(), r.symbols.join()); eq(e.launchBonus, true, "spin 1 is a bonus spin");
    assert(typeof e.emoji === "string" && e.emoji.length > 0);
  });

  test("a stale spin result can't be committed twice", () => {
    const state = E.createInitialState();
    E.startNewPlayer(state, settingsFor());
    const r = E.resolveSpin(state, Config, E.mulberry32(SEED));
    E.commitSpin(state, r);
    let threw = false;
    try { E.commitSpin(state, r); } catch (e) { threw = true; }
    assert(threw);
    eq(state.totalSpins, 1);
  });

  test("grand win is recorded (flag + spin number)", () => {
    const state = E.createInitialState();
    state.totalSpins = Config.grandPrize.guaranteedBySpin - 1;
    E.startNewPlayer(state, settingsFor());
    const r = E.resolveSpin(state, Config, E.mulberry32(SEED));
    eq(r.tier, "grand"); eq(r.isGrand, true);
    E.commitSpin(state, r);
    eq(state.grandPrizeWon, true); eq(state.grandWonAtSpin, Config.grandPrize.guaranteedBySpin);
  });

  // =======================================================================
  // THANK-YOU TIER (nobody leaves empty-handed)
  // =======================================================================
  test("thank-you tier: every spin gets a prize while it is in stock (3000 spins, no 'none' outcomes)", () => {
    const rng = E.mulberry32(SEED);
    const state = E.createInitialState();
    state.overrides = { "tiers.thanks.startingStock": 1e9, "tiers.tier5.startingStock": 1e9, "tiers.tier4.startingStock": 1e9 };
    const t = Config.tiers.find((x) => x.remainder);
    let thankYous = 0;
    for (let i = 0; i < 3000; i++) {
      if (!E.canSpin(state)) E.startNewPlayer(state, E.resolveSettings(Config, state.overrides));
      const r = E.resolveSpin(state, Config, rng);
      assert(r.isWin && r.tier !== "none", "empty-handed spin at " + r.spinNumber);
      assert(r.prizeName && r.prizeName.length > 0, "prize has a name");
      if (r.tier === thanks) { thankYous++; eq(r.costRM, t.prizeCostRM); eq(r.isThankYou, true); }
      E.commitSpin(state, r);
    }
    assert(thankYous > 500, "thank-you gift should be common, got " + thankYous);
    eq(state.log.filter((e) => e.tier === "none").length, 0);
  });

  test("thank-you tier: its chance is the remainder and can't be edited as a fixed chance", () => {
    assert(!E.tryOverride({}, "tiers." + thanks + ".chance", 0.5, Config).ok, "no such editable setting");
    const s = settingsFor({ "launchBonus.enabled": false });
    eq(s.tiers.find((t) => t.id === thanks).chance, null);
  });

  test("thank-you tier out of stock: spins still resolve, shown as 'none' with non-winning symbols, with a clear name", () => {
    const state = E.createInitialState();
    state.overrides = { "tiers.thanks.startingStock": 0, "launchBonus.enabled": false };
    const rng = E.mulberry32(SEED);
    let nones = 0;
    for (let i = 0; i < 2000; i++) {
      const r = E.resolveSpin(state, Config, rng);
      if (r.tier === "none") {
        nones++;
        eq(r.isWin, false); eq(r.tierName, "Out of gifts");
        eq(E.classify(r.symbols, Config), thanks, "symbols are non-winning");
      }
    }
    assert(nones > 500, "should hit the 'none' fallback a lot with no stock, got " + nones);
  });

  test("thank-you tier: nextLowerTier mode gives the same result (everything lands on the thank-you tier)", () => {
    const a = E.computeProbabilities(stateAt(40, { tier3: 99 }), settingsFor({ "launchBonus.enabled": false, outOfStock: "nextLowerTier" })).probs;
    near(a.tier4, 0.26, 1e-12); near(a[thanks] + a.tier4 + a.tier5 + a.tier2 + a.grand, 1, 1e-12);
  });

  test("validation: thank-you tier is allowed once, and fixed tiers still can't overlap", () => {
    const two = cfg(); two.tiers[4].remainder = true;
    assert(E.validateConfig(two).some((p) => /only one tier can have remainder/i.test(p)));
    const noThanks = cfg(); noThanks.tiers = noThanks.tiers.filter((t) => !t.remainder);
    eq(E.validateConfig(noThanks).length, 0, "game still valid without a thank-you tier");
  });

  test("state survives a JSON round trip (what localStorage does); corrupt data is rejected", () => {
    const state = E.createInitialState();
    E.startNewPlayer(state, settingsFor());
    E.commitSpin(state, E.resolveSpin(state, Config, E.mulberry32(SEED)));
    const back = E.normalizeState(JSON.parse(JSON.stringify(state)));
    eq(JSON.stringify(back), JSON.stringify(state));
    eq(E.normalizeState(null), null); eq(E.normalizeState({ totalSpins: -3 }), null); eq(E.normalizeState({ log: "x" }), null);
    eq(E.normalizeState({ nope: 1 }, true), null, "a random JSON file is not a backup");
    eq(E.normalizeState({ totalSpins: 5 }, true), null, "partial data is not a backup");
    eq(JSON.stringify(E.normalizeState(JSON.parse(JSON.stringify(state)), true)), JSON.stringify(state), "a real backup restores exactly");
  });

  test("full reset wipes event data but keeps admin overrides", () => {
    const state = E.createInitialState();
    state.overrides = { spinsPerPlayer: 4 };
    E.startNewPlayer(state, settingsFor(state.overrides));
    E.commitSpin(state, E.resolveSpin(state, Config, E.mulberry32(SEED)));
    const fresh = E.fullReset(state);
    eq(fresh.totalSpins, 0); eq(fresh.playerCount, 0); eq(fresh.log.length, 0); eq(fresh.grandPrizeWon, false);
    eq(JSON.stringify(fresh.awarded), "{}"); eq(fresh.currentPlayer, null);
    eq(fresh.overrides.spinsPerPlayer, 4);
  });

  // =======================================================================
  // ADMIN OVERRIDES
  // =======================================================================
  test("overrides: accepted, validated, and removed when equal to config.js", () => {
    let r = E.tryOverride({}, "tiers.tier2.chance", 0.05, Config);
    assert(r.ok); eq(r.overrides["tiers.tier2.chance"], 0.05);
    eq(E.resolveSettings(Config, r.overrides).tiers[1].chance, 0.05);
    r = E.tryOverride(r.overrides, "tiers.tier2.chance", Config.tiers[1].chance, Config);
    assert(r.ok); eq(Object.keys(r.overrides).length, 0, "back to default removes the override");
    assert(!E.tryOverride({}, "tiers.tier2.chance", 1.5, Config).ok, ">100% rejected");
    assert(!E.tryOverride({}, "tiers.tier2.chance", -0.1, Config).ok, "negative rejected");
    assert(!E.tryOverride({}, "tiers.tier2.chance", 0.9, Config).ok, "tiers summing over 100% rejected");
    assert(!E.tryOverride({}, "tiers.tier2.startingStock", 2.5, Config).ok, "fractional stock rejected");
    assert(!E.tryOverride({}, "grand.guaranteedBySpin", 50, Config).ok, "guarantee before ramp start rejected");
    assert(!E.tryOverride({}, "nonsense.key", 1, Config).ok, "unknown key rejected");
    assert(!E.tryOverride({}, "launchBonus.enabled", "yes", Config).ok, "non-boolean rejected");
  });

  test("config edits keep flowing through for fields that were not overridden", () => {
    const edited = cfg(); edited.tiers[2].chance = 0.1;
    const s = E.resolveSettings(edited, { "tiers.tier2.chance": 0.05 });
    eq(s.tiers[2].chance, 0.1, "tier3 follows the edited config"); eq(s.tiers[1].chance, 0.05, "tier2 uses the admin override");
  });

  test("overrides change real odds, stock and grand schedule", () => {
    const s = settingsFor({ "tiers.tier4.chance": 0.5, "grand.rampStartSpin": 10, "grand.guaranteedBySpin": 20, "tiers.tier5.startingStock": 3, "launchBonus.enabled": false });
    near(E.computeProbabilities(stateAt(5), s).probs.tier4, 0.5, 1e-12, "tier4 override (before the new ramp start)");
    eq(E.computeProbabilities(stateAt(19), s).probs.grand, 1, "new guaranteed-by spin");
    eq(E.stockOf(stateAt(0, { tier5: 1 }), s, "tier5"), 2);
  });

  // =======================================================================
  // BUDGET & SIMULATION
  // =======================================================================
  test("expected cost per spin = sum(chance x prize cost)", () => {
    const s = settingsFor(NO_BONUS);
    const tc = Config.tiers.find((t) => t.remainder).prizeCostRM;
    const expected = 0.001 * 50 + 0.03 * 10 + 0.08 * 5 + 0.18 * 2 + 0.25 * 1 + (1 - 0.001 - 0.54) * tc;
    near(E.expectedCostNextSpin(stateAt(40), s), expected, 1e-9);
  });

  test("simulation never touches the real state, log, or settings (inputs are deep-frozen)", () => {
    const state = E.createInitialState();
    E.startNewPlayer(state, settingsFor());
    E.commitSpin(state, E.resolveSpin(state, Config, E.mulberry32(SEED)));
    const before = JSON.stringify(state);
    const frozenState = deepFreeze(E.clone(state));
    const frozenSettings = deepFreeze(E.resolveSettings(Config, frozenState.overrides));
    const summary = E.runSimulation(frozenSettings, 200, 150, E.mulberry32(SEED));   // would throw on any write
    eq(summary.events, 200);
    eq(JSON.stringify(state), before, "state changed");
  });

  test("simulation: grand is always won by the guaranteed spin; stock limits are respected", () => {
    const s = settingsFor();
    const rng = E.mulberry32(SEED);
    for (let i = 0; i < 300; i++) {
      const r = E.simulateEvent(s, 150, rng);
      assert(r.grandWonSpin !== null && r.grandWonSpin <= s.grand.guaranteedBySpin, "grand not won by guarantee");
      s.tiers.forEach((t) => assert((r.awarded[t.id] || 0) <= t.startingStock, t.id + " over stock in simulation"));
    }
  });

  test("simulation summary: percentiles are ordered and plausible", () => {
    const sm = E.runSimulation(settingsFor(), 3000, 150, E.mulberry32(SEED));
    assert(sm.grandP10 <= sm.grandMedian && sm.grandMedian <= sm.grandP90, "percentile order");
    assert(sm.grandP90 <= Config.grandPrize.guaranteedBySpin);
    eq(sm.grandWonShare, 1);
    assert(sm.avgCost > 0 && sm.costP10 <= sm.avgCost && sm.avgCost <= sm.costP90 + 1e-9);
    assert(sm.grandMedian >= 1);
  });

  test("simulation with the grand disabled never reports a grand win", () => {
    const s = settingsFor({ "tiers.grand.startingStock": 0 });
    const sm = E.runSimulation(s, 200, 150, E.mulberry32(SEED));
    eq(sm.grandWonCount, 0); eq(sm.grandMedian, null);
  });

  test("projected event cost agrees with simulation (stock made unlimited to compare like with like)", () => {
    const big = { "tiers.tier2.startingStock": 1e6, "tiers.tier3.startingStock": 1e6, "tiers.tier4.startingStock": 1e6, "tiers.tier5.startingStock": 1e6, "tiers.thanks.startingStock": 1e6 };
    const s = settingsFor(big);
    const proj = E.projectEventCost(s, 150);
    const sim = E.runSimulation(s, 8000, 150, E.mulberry32(SEED));
    near(proj.total, sim.avgCost, sim.avgCost * 0.02, "projection vs simulation");
    near(proj.perSpin * 150, proj.total, 1e-9);
    assert(proj.grandWinChance > 0.999, "grand is certain within 150 spins by default");
  });

  test("projected cost with the grand already claimed excludes the grand", () => {
    const s = settingsFor(Object.assign({ "tiers.grand.startingStock": 0 }, NO_BONUS));
    const proj = E.projectEventCost(s, 100);
    const tc = Config.tiers.find((t) => t.remainder).prizeCostRM;
    near(proj.total, 100 * (0.03 * 10 + 0.08 * 5 + 0.18 * 2 + 0.25 * 1 + 0.46 * tc), 1e-6);
  });

  // =======================================================================
  // CSV
  // =======================================================================
  test("CSV export: header, one row per spin, proper quoting", () => {
    const state = E.createInitialState();
    state.overrides = { "tiers.tier5.prizeName": 'Rice, "premium" pack' };
    E.startNewPlayer(state, settingsFor(state.overrides));
    const rng = E.mulberry32(SEED);
    for (let i = 0; i < 3; i++) E.commitSpin(state, E.resolveSpin(state, Config, rng));
    state.log.push(Object.assign({}, state.log[0], { tier: "tier5", prize: 'Rice, "premium" pack' }));
    const lines = E.logToCsv(state.log).trim().split("\r\n");
    eq(lines.length, 5, "header + 4 rows");
    eq(lines[0], "timestamp,spin_number,player_number,player_spin,outcome_tier,tier_name,prize,prize_cost_rm,symbols,launch_bonus_active");
    assert(lines[4].includes('"Rice, ""premium"" pack"'), "quotes and commas escaped: " + lines[4]);
  });

  // =======================================================================
  // RUNNER
  // =======================================================================
  function runAll() {
    return tests.map((t) => {
      try { t.fn(); return { name: t.name, ok: true }; }
      catch (e) { return { name: t.name, ok: false, error: e && e.message ? e.message : String(e) }; }
    });
  }

  if (typeof window !== "undefined") {
    window.HarvestTests = { runAll };
  } else {
    const t0 = Date.now();
    const results = runAll();
    results.forEach((r) => console.log((r.ok ? "  PASS  " : "  FAIL  ") + r.name + (r.ok ? "" : "\n          -> " + r.error)));
    const failed = results.filter((r) => !r.ok).length;
    console.log("\n" + (results.length - failed) + " passed, " + failed + " failed (" + (Date.now() - t0) + " ms)");
    process.exit(failed ? 1 : 0);
  }
})();
