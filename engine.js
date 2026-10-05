/* =========================================================================
   HARVEST SPIN - ENGINE (pure game logic)
   =========================================================================
   No DOM, no localStorage, no timers in this file. Everything here is a
   plain function of its inputs, so it can be tested in Node and reused by
   the simulation. The UI (ui.js) only calls these functions and draws.

   Vocabulary
     config    the HARVEST_CONFIG object from config.js (never modified)
     overrides values changed in the Admin panel, stored as {"dotted.key": value}
     settings  config + overrides merged = what the game actually uses
     state     everything that changes while playing (saved to localStorage)
     combo     array of 3 symbol ids, e.g. ["plate", "rice", "water"]
   ========================================================================= */

const HarvestEngine = (function () {
  "use strict";

  // -----------------------------------------------------------------------
  // Small helpers
  // -----------------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const isInt = (v) => Number.isInteger(v);

  /** Seeded random generator (used by tests so results are repeatable). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -----------------------------------------------------------------------
  // 1. TIER RULES: which combos belong to which tier
  // -----------------------------------------------------------------------
  const RULES = {
    // all three reels show `symbol`
    exactly: (c, r) => c[0] === r.symbol && c[1] === r.symbol && c[2] === r.symbol,

    // three identical symbols, but not `except`
    threeOfAKind: (c, r) => c[0] === c[1] && c[1] === c[2] && c[0] !== r.except,

    // exactly the listed symbols, once each, in any order
    anyOrder: (c, r) => c.slice().sort().join("|") === r.symbols.slice().sort().join("|"),

    // exactly two identical + one different, and the pair is not `except`
    pair: (c, r) => {
      if (new Set(c).size !== 2) return false;
      const matched = c[0] === c[1] || c[0] === c[2] ? c[0] : c[1];
      return matched !== r.except;
    },

    // exactly one `symbol`, and the other two differ from each other (no pair)
    exactlyOne: (c, r) => c.filter((s) => s === r.symbol).length === 1 && new Set(c).size === 3,
  };

  function ruleMatches(combo, rule) {
    const fn = RULES[rule && rule.type];
    if (!fn) throw new Error('Unknown rule type "' + (rule && rule.type) + '"');
    return fn(combo, rule);
  }

  /** All symbols^3 ordered combos (6 symbols -> 216). */
  function enumerateCombos(symbolIds) {
    const out = [];
    for (const a of symbolIds) for (const b of symbolIds) for (const c of symbolIds) out.push([a, b, c]);
    return out;
  }

  /**
   * Which tier does this combo belong to? Returns a tier id, or "none"
   * (only possible when the config has no thank-you/remainder tier).
   * Throws if the config is broken and the combo matches several tiers.
   */
  function classify(combo, config) {
    let found = null;
    let remainder = null;
    for (const t of config.tiers) {
      if (t.remainder) { remainder = t; continue; }   // the thank-you tier: takes every combo no other tier wants
      if (ruleMatches(combo, t.rule)) {
        if (found) throw new Error("Combo " + combo.join(",") + " matches both " + found + " and " + t.id);
        found = t.id;
      }
    }
    return found || (remainder ? remainder.id : "none");
  }

  // Pool of every combo for every outcome, built once per config object.
  const tableCache = new WeakMap();
  function comboTable(config) {
    let table = tableCache.get(config);
    if (!table) {
      table = { none: [] };
      config.tiers.forEach((t) => (table[t.id] = []));
      for (const combo of enumerateCombos(config.symbols.map((s) => s.id))) {
        table[classify(combo, config)].push(combo);
      }
      // "none" only happens if the thank-you tier is out of stock; show that tier's (non-winning) combos then.
      const rem = config.tiers.find((t) => t.remainder);
      if (rem && table.none.length === 0) table.none = table[rem.id].slice();
      tableCache.set(config, table);
    }
    return table;
  }

  /**
   * OUTCOME-FIRST STEP 2: given the tier that was rolled, pick a combo
   * uniformly at random from ALL valid combos for that tier. The thank-you tier's
   * pool is every combo that matches no winning tier (no near-miss logic).
   * A tier that is out of stock can never be rolled, and its combos are NOT
   * in the thank-you pool, so a winning-looking combo is never shown without a prize.
   */
  function generateCombo(tierId, config, rng) {
    const pool = comboTable(config)[tierId];
    if (!pool || pool.length === 0) throw new Error('No valid combinations for outcome "' + tierId + '"');
    return pool[Math.floor(rng() * pool.length)].slice();
  }

  // -----------------------------------------------------------------------
  // 2. SETTINGS = config + admin overrides
  // -----------------------------------------------------------------------
  const GRAND_FIELDS = ["baseChance", "rampStartSpin", "rampStep", "guaranteedBySpin"];
  const BONUS_FIELDS = ["enabled", "spins", "multiplier"];
  const TIER_FIELDS = ["chance", "prizeCostRM", "startingStock", "prizeName"];

  function baseSettings(config) {
    return {
      spinsPerPlayer: config.spinsPerPlayer,
      outOfStock: config.outOfStock,
      grand: clone(config.grandPrize),
      launchBonus: clone(config.launchBonus),
      tiers: config.tiers.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        rule: t.rule,
        risingOdds: !!t.risingOdds,
        remainder: !!t.remainder,
        chance: t.risingOdds || t.remainder ? null : t.chance,
        prizeName: t.prizeName,
        prizeCostRM: t.prizeCostRM,
        startingStock: t.startingStock,
      })),
    };
  }

  /** Apply one dotted override key to a settings object. Unknown keys are ignored. */
  function applyOverride(s, key, value) {
    const p = key.split(".");
    if (p.length === 1 && (p[0] === "spinsPerPlayer" || p[0] === "outOfStock")) s[p[0]] = value;
    else if (p.length === 2 && p[0] === "grand" && GRAND_FIELDS.includes(p[1])) s.grand[p[1]] = value;
    else if (p.length === 2 && p[0] === "launchBonus" && BONUS_FIELDS.includes(p[1])) s.launchBonus[p[1]] = value;
    else if (p.length === 3 && p[0] === "tiers" && TIER_FIELDS.includes(p[2])) {
      const t = s.tiers.find((x) => x.id === p[1]);
      if (t && !((t.risingOdds || t.remainder) && p[2] === "chance")) t[p[2]] = value;
    }
  }

  function resolveSettings(config, overrides) {
    const s = baseSettings(config);
    Object.keys(overrides || {}).forEach((k) => applyOverride(s, k, overrides[k]));
    return s;
  }

  /** Read a value by dotted key from a settings object (used to detect "same as config.js"). */
  function readSetting(s, key) {
    const p = key.split(".");
    if (p.length === 1) return s[p[0]];
    if (p.length === 2) return s[p[0]] && typeof s[p[0]] === "object" ? s[p[0]][p[1]] : undefined;
    const t = p[0] === "tiers" ? s.tiers.find((x) => x.id === p[1]) : null;
    return t ? t[p[2]] : undefined;
  }

  /**
   * Try to change one override. Returns {ok, overrides, problems}.
   * Nothing is modified; the caller stores `overrides` if ok. Setting a value
   * equal to the config.js value removes the override, so later edits to
   * config.js keep taking effect for that field.
   */
  function tryOverride(current, key, value, config) {
    const next = Object.assign({}, current);
    const def = readSetting(baseSettings(config), key);
    if (def === undefined || def === null) return { ok: false, overrides: current, problems: ["Not an editable setting: " + key] };
    if (value === def) delete next[key];
    else next[key] = value;
    const problems = validateSettings(resolveSettings(config, next));
    return problems.length ? { ok: false, overrides: current, problems } : { ok: true, overrides: next, problems: [] };
  }

  // -----------------------------------------------------------------------
  // 3. VALIDATION
  // -----------------------------------------------------------------------
  /** Checks the numbers in a settings object. Returns a list of problem strings. */
  function validateSettings(s) {
    const p = [];
    if (!(isInt(s.spinsPerPlayer) && s.spinsPerPlayer >= 1)) p.push("Spins per player must be a whole number, 1 or more.");
    if (s.outOfStock !== "noPrize" && s.outOfStock !== "nextLowerTier") p.push('outOfStock must be "noPrize" or "nextLowerTier".');

    const g = s.grand;
    if (!(isNum(g.baseChance) && g.baseChance >= 0 && g.baseChance <= 1)) p.push("Grand base chance must be between 0% and 100%.");
    if (!(isInt(g.rampStartSpin) && g.rampStartSpin >= 1)) p.push("Grand ramp start spin must be a whole number, 1 or more.");
    if (!(isNum(g.rampStep) && g.rampStep >= 0 && g.rampStep <= 1)) p.push("Grand ramp step must be between 0% and 100%.");
    if (!(isInt(g.guaranteedBySpin) && g.guaranteedBySpin >= 1)) p.push("Guaranteed-by spin must be a whole number, 1 or more.");
    else if (isInt(g.rampStartSpin) && g.guaranteedBySpin < g.rampStartSpin) p.push("Guaranteed-by spin can't be earlier than the ramp start spin.");

    const lb = s.launchBonus;
    if (typeof lb.enabled !== "boolean") p.push("Launch bonus enabled must be true or false.");
    if (!(isInt(lb.spins) && lb.spins >= 0)) p.push("Launch bonus spins must be a whole number, 0 or more.");
    if (!(isNum(lb.multiplier) && lb.multiplier >= 0 && lb.multiplier <= 100)) p.push("Launch bonus multiplier must be a number from 0 to 100.");

    let sum = 0;
    s.tiers.forEach((t) => {
      if (!t.risingOdds && !t.remainder) {
        if (!(isNum(t.chance) && t.chance >= 0 && t.chance <= 1)) p.push(t.name + ": chance must be between 0% and 100%.");
        else sum += t.chance;
      }
      if (!(isNum(t.prizeCostRM) && t.prizeCostRM >= 0)) p.push(t.name + ": prize cost must be 0 or more.");
      if (!(isInt(t.startingStock) && t.startingStock >= 0)) p.push(t.name + ": stock must be a whole number, 0 or more.");
    });
    if (sum > 1 + 1e-9) p.push("Tier chances add up to more than 100% (" + (sum * 100).toFixed(1) + "%).");
    return p;
  }

  /** Checks config.js as a whole, including that every combo maps to at most one tier. */
  function validateConfig(config) {
    const p = [];
    const symbolIds = (config.symbols || []).map((s) => s.id);
    if (symbolIds.length < 1) p.push("config.symbols is empty.");
    if (new Set(symbolIds).size !== symbolIds.length) p.push("Two symbols share the same id.");
    (config.symbols || []).forEach((s) => { if (!s.emoji) p.push('Symbol "' + s.id + '" has no emoji.'); });

    const tiers = config.tiers || [];
    if (tiers.length < 1) p.push("config.tiers is empty.");
    if (new Set(tiers.map((t) => t.id)).size !== tiers.length) p.push("Two tiers share the same id.");
    if (tiers.filter((t) => t.risingOdds).length > 1) p.push("Only one tier can have risingOdds: true.");
    if (tiers.filter((t) => t.remainder).length > 1) p.push("Only one tier can have remainder: true.");
    if (tiers.some((t) => t.remainder && t.risingOdds)) p.push("A tier can't be both risingOdds and remainder.");
    const fixedTiers = tiers.filter((t) => !t.remainder);

    let rulesUsable = true;
    fixedTiers.forEach((t) => {
      const r = t.rule;
      if (!r || !RULES[r.type]) { p.push(t.id + ': unknown rule type "' + (r && r.type) + '".'); rulesUsable = false; return; }
      const refs = [].concat(r.symbol || [], r.except || [], r.symbols || []);
      refs.forEach((id) => { if (!symbolIds.includes(id)) { p.push(t.id + ': rule mentions unknown symbol "' + id + '".'); rulesUsable = false; } });
      if (r.type === "anyOrder" && !(Array.isArray(r.symbols) && r.symbols.length === 3)) { p.push(t.id + ": anyOrder needs exactly 3 symbols."); rulesUsable = false; }
    });

    // Every combo must match at most one tier, and every tier must be winnable.
    if (rulesUsable && symbolIds.length) {
      const counts = {};
      tiers.forEach((t) => (counts[t.id] = 0));
      const reported = new Set();
      for (const combo of enumerateCombos(symbolIds)) {
        const hits = fixedTiers.filter((t) => ruleMatches(combo, t.rule)).map((t) => t.id);
        hits.forEach((id) => counts[id]++);
        if (hits.length === 0) tiers.filter((t) => t.remainder).forEach((t) => counts[t.id]++);
        if (hits.length > 1) {
          const key = hits.join("+");
          if (!reported.has(key)) {
            reported.add(key);
            p.push("Tiers overlap: " + hits.join(" and ") + " both match " + combo.join(" ") + " (and maybe more).");
          }
        }
      }
      tiers.forEach((t) => { if (counts[t.id] === 0) p.push(t.id + " matches no symbol combination, so it can never be won."); });
    }

    p.push.apply(p, validateSettings(baseSettings(config)));

    const stops = config.animation && config.animation.reelStopTimesMs;
    if (!(Array.isArray(stops) && stops.length === 3 && stops.every((x, i) => isNum(x) && x > 0 && (i === 0 || x > stops[i - 1])))) {
      p.push("animation.reelStopTimesMs must be 3 increasing numbers, e.g. [1300, 2000, 2700].");
    }
    return p;
  }

  // -----------------------------------------------------------------------
  // 4. STATE
  // -----------------------------------------------------------------------
  function createInitialState(now) {
    return {
      version: 1,
      startedAt: (now || new Date()).toISOString(),
      totalSpins: 0,
      playerCount: 0,
      currentPlayer: null, // {number, spinsLeft, spinsTaken}
      awarded: {},         // prizes given per tier id
      grandPrizeWon: false,
      grandWonAtSpin: null,
      overrides: {},       // admin changes on top of config.js
      log: [],
      lastResult: null,
    };
  }

  /** Validates data loaded from storage (or, with strict=true, a backup file). Returns a clean state, or null if it's unusable. */
  function normalizeState(raw, strict) {
    if (!raw || typeof raw !== "object") return null;
    // strict (used when restoring a backup file): the file must really look like a saved game
    if (strict && !(raw.version === 1 && isInt(raw.totalSpins) && isInt(raw.playerCount) && Array.isArray(raw.log) &&
        raw.awarded && typeof raw.awarded === "object" && raw.overrides && typeof raw.overrides === "object")) return null;
    const s = Object.assign(createInitialState(), raw);
    if (!(isInt(s.totalSpins) && s.totalSpins >= 0)) return null;
    if (!(isInt(s.playerCount) && s.playerCount >= 0)) return null;
    if (!Array.isArray(s.log)) return null;
    if (!s.awarded || typeof s.awarded !== "object") return null;
    if (!s.overrides || typeof s.overrides !== "object") return null;
    return s;
  }

  /** Fresh event: wipes spins, players, log and prizes given. Keeps admin overrides. */
  function fullReset(state, now) {
    const fresh = createInitialState(now);
    fresh.overrides = clone(state.overrides);
    return fresh;
  }

  function stockOf(state, settings, tierId) {
    const t = settings.tiers.find((x) => x.id === tierId);
    return t ? Math.max(0, t.startingStock - (state.awarded[tierId] || 0)) : 0;
  }

  function startNewPlayer(state, settings) {
    state.playerCount += 1;
    state.currentPlayer = { number: state.playerCount, spinsLeft: settings.spinsPerPlayer, spinsTaken: 0 };
  }

  function canSpin(state) {
    return !!state.currentPlayer && state.currentPlayer.spinsLeft > 0;
  }

  // -----------------------------------------------------------------------
  // 5. PROBABILITIES
  // -----------------------------------------------------------------------
  /** Grand prize chance for a given spin number, from the rising-odds schedule. */
  function grandChance(spinNumber, g) {
    if (spinNumber >= g.guaranteedBySpin) return 1;
    if (spinNumber >= g.rampStartSpin) return Math.min(1, g.baseChance + g.rampStep * (spinNumber - g.rampStartSpin + 1));
    return g.baseChance;
  }

  function launchBonusStatus(state, settings) {
    const lb = settings.launchBonus;
    const left = lb.enabled ? Math.max(0, lb.spins - state.totalSpins) : 0;
    return { active: left > 0, spinsLeft: left };
  }

  /**
   * The probability table for the NEXT spin: { spinNumber, bonusActive, grandChance, probs, order }.
   * probs has one entry per tier id plus "none", and always sums to 1.
   *
   * Order of steps (see README, "How the odds work"):
   *   1. Grand chance from the schedule (0 if the grand is out of stock).
   *   2. Sold-out tiers 2+ give their chance to the leftover or the next tier down.
   *   3. Launch bonus multiplies the remaining tiers 2+ (never the grand).
   *   4. Tiers 2+ are scaled down proportionally if they would exceed 100% minus the grand's share.
   *   5. The thank-you tier gets whatever is left ("none" only if it has no stock).
   */
  function computeProbabilities(state, settings) {
    const spinNumber = state.totalSpins + 1;
    const bonus = launchBonusStatus(state, settings);
    const order = settings.tiers.map((t) => t.id);
    const probs = {};
    const fixed = (t) => !t.risingOdds && !t.remainder;   // tiers with a chance set in config
    const remainderTier = settings.tiers.find((t) => t.remainder);
    settings.tiers.forEach((t) => (probs[t.id] = 0));

    // 1. grand
    let pGrand = 0;
    let grandNow = 0;
    settings.tiers.forEach((t) => {
      if (t.risingOdds) {
        grandNow = stockOf(state, settings, t.id) > 0 ? grandChance(spinNumber, settings.grand) : 0;
        probs[t.id] = grandNow;
        pGrand += grandNow;
      }
    });

    // 2. stock
    let carry = 0;
    settings.tiers.forEach((t) => {
      if (!fixed(t)) return;
      const p = t.chance + carry;
      carry = 0;
      if (stockOf(state, settings, t.id) > 0) {
        probs[t.id] = p;
      } else {
        probs[t.id] = 0;
        if (settings.outOfStock === "nextLowerTier") carry = p;
      }
    });

    // 3. launch bonus
    if (bonus.active) {
      settings.tiers.forEach((t) => { if (fixed(t)) probs[t.id] *= settings.launchBonus.multiplier; });
    }

    // 4. cap
    let sum = 0;
    settings.tiers.forEach((t) => { if (fixed(t)) sum += probs[t.id]; });
    const room = Math.max(0, 1 - pGrand);
    if (sum > room) {
      const k = sum > 0 ? room / sum : 0;
      settings.tiers.forEach((t) => { if (fixed(t)) probs[t.id] *= k; });
      sum = room;
    }

    // 5. whatever is left goes to the thank-you tier (or to "none" if it's out of stock / not configured)
    const leftover = Math.max(0, 1 - pGrand - sum);
    const toThanks = remainderTier && stockOf(state, settings, remainderTier.id) > 0 ? leftover : 0;
    if (remainderTier) probs[remainderTier.id] = toThanks;
    probs.none = leftover - toThanks;
    return { spinNumber, bonusActive: bonus.active, grandChance: grandNow, probs, order };
  }

  /** OUTCOME-FIRST STEP 1: roll the tier with one random number. */
  function rollTier(probs, order, rng) {
    const r = rng();
    let acc = 0;
    for (const id of order) {
      acc += probs[id];
      if (r < acc) return id;
    }
    return "none";
  }

  // -----------------------------------------------------------------------
  // 6. PLAYING A SPIN
  // -----------------------------------------------------------------------
  /**
   * Decide the outcome of the next spin WITHOUT changing the state.
   * Returns the tier, the 3 symbols to show, and the prize.
   */
  function resolveSpin(state, config, rng) {
    const settings = resolveSettings(config, state.overrides);
    const info = computeProbabilities(state, settings);
    let tierId = rollTier(info.probs, info.order, rng);
    // Safety net: never award something that is out of stock.
    if (tierId !== "none" && stockOf(state, settings, tierId) <= 0) tierId = "none";

    const tier = settings.tiers.find((t) => t.id === tierId) || null;
    const symbols = generateCombo(tierId, config, rng);

    return {
      spinNumber: info.spinNumber,
      tier: tierId,
      tierName: tier ? tier.name : "Out of gifts",
      isWin: !!tier,
      isGrand: !!(tier && tier.risingOdds),
      isThankYou: !!(tier && tier.remainder),
      prizeName: tier ? tier.prizeName : null,
      costRM: tier ? tier.prizeCostRM : 0,
      symbols,
      emoji: symbols.map((id) => (config.symbols.find((s) => s.id === id) || {}).emoji).join(""),
      bonusActive: info.bonusActive,
    };
  }

  /** Record a resolved spin: counts it, uses up a prize, spends the player's spin, writes the log. */
  function commitSpin(state, result, now) {
    if (!canSpin(state)) throw new Error("No player with spins remaining.");
    if (result.spinNumber !== state.totalSpins + 1) throw new Error("This spin result is out of date.");
    const player = state.currentPlayer;
    state.totalSpins += 1;
    player.spinsLeft -= 1;
    player.spinsTaken += 1;
    if (result.isWin) {
      state.awarded[result.tier] = (state.awarded[result.tier] || 0) + 1;
      if (result.isGrand) {
        state.grandPrizeWon = true;
        state.grandWonAtSpin = result.spinNumber;
      }
    }
    state.log.push({
      timestamp: (now || new Date()).toISOString(),
      spinNumber: result.spinNumber,
      player: player.number,
      playerSpin: player.spinsTaken,
      tier: result.tier,
      tierName: result.tierName,
      prize: result.prizeName || "",
      costRM: result.costRM,
      symbols: result.symbols.slice(),
      emoji: result.emoji,
      launchBonus: result.bonusActive,
    });
    state.lastResult = Object.assign({}, result, { player: player.number });
  }

  // -----------------------------------------------------------------------
  // 7. HARVEST METER (display values)
  // -----------------------------------------------------------------------
  function harvestMeter(state, settings) {
    const g = settings.grand;
    const grandTier = settings.tiers.find((t) => t.risingOdds);
    const available = !!grandTier && stockOf(state, settings, grandTier.id) > 0;
    const nextSpin = state.totalSpins + 1;
    const active = available && nextSpin >= g.rampStartSpin;
    // fills as spins approach rampStartSpin; full once the next spin is on the ramp
    const fill = nextSpin >= g.rampStartSpin ? 1 : state.totalSpins / g.rampStartSpin;
    return { available, active, fill, nextSpin, rampStartSpin: g.rampStartSpin, guaranteedBySpin: g.guaranteedBySpin };
  }

  // -----------------------------------------------------------------------
  // 8. BUDGET
  // -----------------------------------------------------------------------
  function costMap(settings) {
    const m = {};
    settings.tiers.forEach((t) => (m[t.id] = t.prizeCostRM));
    return m;
  }

  function dot(probs, costs) {
    let total = 0;
    Object.keys(costs).forEach((id) => (total += (probs[id] || 0) * costs[id]));
    return total;
  }

  /** Expected cost of the next spin = sum(tier chance x prize cost), using the live odds. */
  function expectedCostNextSpin(state, settings) {
    return dot(computeProbabilities(state, settings).probs, costMap(settings));
  }

  /**
   * Expected total prize cost of a fresh event of `nSpins` spins (from spin 1,
   * with starting stock). Uses the same probability table as the real game, so
   * it includes the launch bonus and the grand prize ramp. It does NOT apply the
   * stock limits of tiers 2-5 (the simulation does) and assumes a single grand prize.
   * Returns {total, perSpin, grandWinChance}.
   */
  function projectEventCost(settings, nSpins) {
    const costs = costMap(settings);
    const grand = settings.tiers.find((t) => t.risingOdds);
    const decays = !!grand && grand.startingStock === 1;
    const goneAwarded = {};
    if (grand) goneAwarded[grand.id] = grand.startingStock;
    let alive = grand && grand.startingStock > 0 ? 1 : 0; // chance the grand is still available
    let total = 0;
    for (let k = 0; k < nSpins; k++) {
      const withGrand = computeProbabilities({ totalSpins: k, awarded: {} }, settings);
      if (alive > 0) total += alive * dot(withGrand.probs, costs);
      if (alive < 1) {
        const without = computeProbabilities({ totalSpins: k, awarded: goneAwarded }, settings);
        total += (1 - alive) * dot(without.probs, costs);
      }
      if (decays && alive > 0) alive *= 1 - withGrand.grandChance;
    }
    return { total, perSpin: nSpins > 0 ? total / nSpins : 0, grandWinChance: grand && grand.startingStock > 0 && decays ? 1 - alive : null };
  }

  // -----------------------------------------------------------------------
  // 9. SIMULATION (never touches the real state or log)
  // -----------------------------------------------------------------------
  /** One pretend event from spin 1 with full starting stock. Uses its own private state. */
  function simulateEvent(settings, spins, rng) {
    const order = settings.tiers.map((t) => t.id);
    const costs = costMap(settings);
    const grandIds = settings.tiers.filter((t) => t.risingOdds).map((t) => t.id);
    const state = { totalSpins: 0, awarded: {} };
    let cost = 0;
    let grandWonSpin = null;
    for (let i = 0; i < spins; i++) {
      const tier = rollTier(computeProbabilities(state, settings).probs, order, rng);
      state.totalSpins += 1;
      if (tier !== "none") {
        state.awarded[tier] = (state.awarded[tier] || 0) + 1;
        cost += costs[tier];
        if (grandWonSpin === null && grandIds.includes(tier)) grandWonSpin = state.totalSpins;
      }
    }
    return { grandWonSpin, cost, awarded: state.awarded };
  }

  /** Nearest-rank percentile of an ascending-sorted array. */
  function percentile(sorted, p) {
    if (!sorted.length) return null;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
  }

  function summarizeSimulation(results, settings) {
    const wins = results.filter((r) => r.grandWonSpin !== null).map((r) => r.grandWonSpin).sort((a, b) => a - b);
    const costs = results.map((r) => r.cost).sort((a, b) => a - b);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const prizesPerTier = {};
    settings.tiers.forEach((t) => {
      prizesPerTier[t.id] = avg(results.map((r) => r.awarded[t.id] || 0));
    });
    return {
      events: results.length,
      grandWonCount: wins.length,
      grandWonShare: results.length ? wins.length / results.length : 0,
      grandMedian: percentile(wins, 0.5),
      grandP10: percentile(wins, 0.1),
      grandP90: percentile(wins, 0.9),
      avgCost: avg(costs),
      costP10: percentile(costs, 0.1),
      costP90: percentile(costs, 0.9),
      prizesPerTier,
    };
  }

  /** Convenience for tests / Node: run a whole simulation synchronously. */
  function runSimulation(settings, events, spins, rng) {
    const results = [];
    for (let i = 0; i < events; i++) results.push(simulateEvent(settings, spins, rng));
    return summarizeSimulation(results, settings);
  }

  // -----------------------------------------------------------------------
  // 10. CSV EXPORT
  // -----------------------------------------------------------------------
  function csvCell(v) {
    const s = String(v === null || v === undefined ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function logToCsv(log) {
    const header = ["timestamp", "spin_number", "player_number", "player_spin", "outcome_tier", "tier_name", "prize", "prize_cost_rm", "symbols", "launch_bonus_active"];
    const rows = log.map((e) => [e.timestamp, e.spinNumber, e.player, e.playerSpin, e.tier, e.tierName, e.prize, e.costRM, e.emoji, e.launchBonus ? "yes" : "no"]);
    return [header].concat(rows).map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  // -----------------------------------------------------------------------
  return {
    // helpers
    mulberry32, clone,
    // combos & rules
    enumerateCombos, classify, comboTable, generateCombo,
    // settings & validation
    resolveSettings, tryOverride, validateSettings, validateConfig,
    // state
    createInitialState, normalizeState, fullReset, stockOf, startNewPlayer, canSpin,
    // odds
    grandChance, launchBonusStatus, computeProbabilities, rollTier,
    // spins
    resolveSpin, commitSpin, harvestMeter,
    // budget & simulation
    expectedCostNextSpin, projectEventCost, simulateEvent, summarizeSimulation, runSimulation,
    // export
    logToCsv,
  };
})();

// Lets the Node test runner (`node tests.js`) load this file. Harmless in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = HarvestEngine;
}
