/* =========================================================================
   HARVEST SPIN - CONFIGURATION
   =========================================================================
   This is the ONLY file you need to edit to change the game's numbers.

   HOW TO EDIT (no coding needed):
     * Change the value after a colon, e.g.  startingStock: 8  ->  startingStock: 12
     * Keep the commas at the end of lines, and keep "quotes" around text.
     * Chances are written as decimals:  0.03 means 3%,  0.001 means 0.1%.
       (Move the decimal point two places: 3% -> 0.03, 25% -> 0.25.)
     * After saving this file, refresh the game page in the browser.
     * Open test.html afterwards - it will tell you if something is broken.

   IMPORTANT: if you already played on this laptop, the browser remembers the
   old game state. Values you changed in the hidden Admin panel win over this
   file. To start clean, open the Admin panel (Ctrl+Shift+A) and use
   "Reset odds & settings" and/or "Full reset".
   ========================================================================= */

const HARVEST_CONFIG = {

  // ---------------------------------------------------------------------
  // GENERAL
  // ---------------------------------------------------------------------
  eventName: "Harvest Spin",
  tagline: "Play for Zero Hunger - UN SDG 2",
  currency: "RM",

  // How many spins one player gets when you press "New Player".
  // This event: ONE spin each (about 70 players expected = about 70 spins).
  // The grand prize schedule and the prize stock below are sized for that.
  spinsPerPlayer: 1,

  // PIN needed to open the hidden Admin panel (Ctrl+Shift+A). Keep the quotes.
  // Use "" for no PIN. NOTE: this file is visible to anyone who can see the
  // GitHub repo, so this only keeps curious visitors out of the admin panel;
  // it is not real security. Don't reuse this PIN anywhere else.
  adminPin: "140311",

  // ---------------------------------------------------------------------
  // SYMBOLS (the 3 reels all use these)
  // "id" is used internally by the tier rules below - don't rename an id
  // unless you also update every rule that mentions it.
  // ---------------------------------------------------------------------
  symbols: [
    { id: "plate",   emoji: "🍽️", name: "Full Plate" },
    { id: "rice",    emoji: "🍚", name: "Rice" },
    { id: "veg",     emoji: "🥦", name: "Vegetables" },
    { id: "protein", emoji: "🍗", name: "Protein" },
    { id: "bread",   emoji: "🍞", name: "Bread" },
    { id: "water",   emoji: "💧", name: "Water" },
  ],

  // ---------------------------------------------------------------------
  // GRAND PRIZE: RISING ODDS
  // The grand prize (Tier 1) does not have a fixed %. Its chance per spin is:
  //
  //   before rampStartSpin :  baseChance
  //   from rampStartSpin on:  baseChance + rampStep x (spinNumber - rampStartSpin + 1)
  //   from guaranteedBySpin:  100%  (certain win)
  //
  // "spinNumber" = total spins on this machine since the event started
  // (all players together, not per player).
  // Once the grand prize has been won (its stock reaches 0) it is switched off.
  // ---------------------------------------------------------------------
  grandPrize: {
    baseChance: 0.001,       // 0.1% per spin at the start (a small chance of a lucky early win)
    rampStartSpin: 60,       // the Harvest Meter is full and odds start rising here
    rampStep: 0.09,          // +9% for every spin after that
    guaranteedBySpin: 70,    // by this spin the chance is 100% (the 70th player at the latest)
    // In plain English: with about 70 players, the grand prize is won between
    // spin 60 and spin 70 about 94% of the time, and before spin 60 about 6%.
    // If fewer than 60 players turn up it is NOT guaranteed - see
    // EVENT-SIZING.md ("If turnout is low") for what the operator does.
  },

  // ---------------------------------------------------------------------
  // LAUNCH BONUS
  // For the first `spins` spins of the event, the odds of Tiers 2-5 are
  // multiplied by `multiplier`. It never affects the grand prize, and the
  // total chance is capped at 100% (see README: "How the odds work"). Because
  // the Thank-You Gift takes what's left, a big multiplier just shrinks it.
  // This event: ON, on purpose. The first 10 players are guaranteed a real
  // prize (Tier 2-5, never a Thank-You Gift) to build early buzz.
  // Set enabled to false to turn it off.
  // ---------------------------------------------------------------------
  launchBonus: {
    enabled: true,
    spins: 10,
    multiplier: 2,
  },

  // ---------------------------------------------------------------------
  // WHEN A PRIZE RUNS OUT OF STOCK
  // A prize with 0 stock is never awarded. What happens to its chance?
  //   "noPrize"       -> it falls through to the Thank-You Gift (default)
  //   "nextLowerTier" -> it is added to the next tier down that still has
  //                      stock (Tier 3 -> Tier 4 -> Tier 5 -> Thank-You Gift)
  // The grand prize always falls through to the Thank-You Gift when it is won.
  // ---------------------------------------------------------------------
  outOfStock: "noPrize",

  // ---------------------------------------------------------------------
  // TIERS - listed from best (top) to lowest (bottom).
  //
  //   id            short internal name (letters/numbers, no spaces)
  //   name          shown to the player
  //   description   shown in the admin panel / README
  //   rule          which reel combinations count as this tier (see below)
  //   chance        probability per spin: 0.03 = 3%   (not used for the grand or Tier 6)
  //   prizeName     PLACEHOLDER - replace with the real prize
  //   prizeCostRM   PLACEHOLDER - what one prize costs you, in RM
  //   startingStock how many of this prize you have at the start
  //                 (the numbers below are sized so that, with about 70 players
  //                 and the launch bonus on, each prize runs out in only about
  //                 1 event in 20 - see EVENT-SIZING.md)
  //
  // RULES (each combination of 3 symbols must match AT MOST ONE tier -
  // test.html checks this for you):
  //   { type: "exactly",      symbol: "plate" }            all 3 are that symbol
  //   { type: "threeOfAKind", except: "plate" }            3 identical, but not this symbol
  //   { type: "anyOrder",     symbols: ["rice","veg","protein"] }  exactly these 3, any order
  //   { type: "pair",         except: "plate" }            exactly 2 identical (+1 different),
  //                                                        but not a pair of this symbol
  //   { type: "exactlyOne",   symbol: "plate" }            exactly one of this symbol,
  //                                                        and the other two all different
  //   { type: "anyOther" }                                 (last tier only) every combination
  //                                                        that none of the tiers above wants
  // ---------------------------------------------------------------------
  tiers: [
    {
      id: "grand",
      name: "Tier 1 - Grand Harvest",
      description: "Three Full Plates. Uses the rising-odds schedule above.",
      rule: { type: "exactly", symbol: "plate" },
      risingOdds: true,                 // marks this as the grand prize tier
      prizeName: "Grand prize (placeholder)",
      prizeCostRM: 50,
      startingStock: 1,
    },
    {
      id: "tier2",
      name: "Tier 2 - Triple Harvest",
      description: "Three of a kind of any symbol except the Full Plate.",
      rule: { type: "threeOfAKind", except: "plate" },
      chance: 0.03,                     // 3%
      prizeName: "Prize B (placeholder)",
      prizeCostRM: 10,
      startingStock: 5,
    },
    {
      id: "tier3",
      name: "Tier 3 - Balanced Plate",
      description: "Rice + Vegetables + Protein, in any order.",
      rule: { type: "anyOrder", symbols: ["rice", "veg", "protein"] },
      chance: 0.08,                     // 8%
      prizeName: "Prize C (placeholder)",
      prizeCostRM: 5,
      startingStock: 10,
    },
    {
      id: "tier4",
      name: "Tier 4 - Lucky Pair",
      description: "Any pair (exactly two the same), except two Full Plates.",
      rule: { type: "pair", except: "plate" },
      chance: 0.18,                     // 18%
      prizeName: "Prize D (placeholder)",
      prizeCostRM: 2,
      startingStock: 20,
    },
    {
      id: "tier5",
      name: "Tier 5 - Single Plate",
      description: "Exactly one Full Plate and no pair.",
      rule: { type: "exactlyOne", symbol: "plate" },
      chance: 0.25,                     // 25%
      prizeName: "Prize E (placeholder)",
      prizeCostRM: 1,
      startingStock: 26,
    },
    {
      // Nobody leaves empty-handed: this tier catches every spin that wins nothing above.
      // It has no "chance" - its chance is whatever is left over (100% minus the tiers above).
      // Keep an eye on its stock: if it runs out, spins that would land here show
      // "out of gifts" (the game warns the operator when it is running low).
      id: "thanks",
      name: "Tier 6 - Thank-You Gift",
      description: "Every spin that wins nothing above. Chance = whatever is left over.",
      rule: { type: "anyOther" },
      remainder: true,                  // marks this as the catch-all tier
      prizeName: "Thank-you gift (placeholder)",
      prizeCostRM: 0.5,
      startingStock: 33,
    },
  ],

  // ---------------------------------------------------------------------
  // LOW STOCK WARNING
  // When the Thank-You Gift stock drops to this number or lower, a warning
  // appears at the bottom of the screen (operator only).
  // ---------------------------------------------------------------------
  lowStockWarning: 10,

  // ---------------------------------------------------------------------
  // ADMIN SIMULATION defaults (can also be changed inside the Admin panel)
  // ---------------------------------------------------------------------
  simulation: {
    events: 10000,        // how many pretend events to run
    spinsPerEvent: 70,    // spins in each pretend event (= players, at 1 spin each)
  },

  // ---------------------------------------------------------------------
  // REEL ANIMATION (milliseconds after pressing Harvest!)
  // The reels stop one by one, left to right, at these times.
  // ---------------------------------------------------------------------
  animation: {
    reelStopTimesMs: [1300, 2000, 2700],
    symbolSwapMs: 70,     // how fast symbols flicker while spinning
  },
};

// Lets the Node test runner (`node tests.js`) load this file. Harmless in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = HARVEST_CONFIG;
}
