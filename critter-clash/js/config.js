/* =========================================================================
 * CRITTER CLASH 1000 — Game Configuration ("math config")
 *
 * Every tunable number that defines the game's math model lives here,
 * separate from presentation. The engine (engine.js) consumes this config
 * and produces a deterministic event book; the frontend only replays it.
 *
 * Win evaluation type: "scatter" (pays anywhere on the 6×5 grid), plus the
 * original Column Creature Battle feature: when 2+ creatures land in the
 * same column they battle, the strongest hidden multiplier wins the column,
 * and all winning column multipliers are SUMMED into one spin multiplier
 * applied to the total symbol win.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'critter_clash_1000',
    gameName: 'CRITTER CLASH 1000',
    providerName: 'YOUR STUDIO',
    version: '1.0.0',
    rtp: 0.962,                  // simulated RTP (tuned via tools/simulate.js)
    maxWinX: 10000,              // max win cap in bet multiples (round ends at cap)
    winType: 'scatter',          // pays-anywhere evaluation

    grid: { cols: 6, rows: 5 },

    /* ---- Low symbols (card royals) ------------------------------------ */
    lows: [
      { id: 'a',   name: 'Ace',   label: 'A',  color: '#ff5d5d', color2: '#b31e1e' },
      { id: 'k',   name: 'King',  label: 'K',  color: '#b06cff', color2: '#6f2dc9' },
      { id: 'q',   name: 'Queen', label: 'Q',  color: '#4fc3ff', color2: '#1671d9' },
      { id: 'j',   name: 'Jack',  label: 'J',  color: '#5ee06a', color2: '#1da53a' },
      { id: 'ten', name: 'Ten',   label: '10', color: '#ffb637', color2: '#e07c0a' }
    ],

    /* ---- Creature symbols ----------------------------------------------
     * Each creature LANDS with a hidden battle multiplier drawn from its
     * weighted `mults` table (its "Multiplier Range"). Rarer creatures roll
     * bigger multipliers. Goldhorn is the legendary golden beast: when it
     * appears in a battle column, the column's winning multiplier DOUBLES. */
    creatures: [
      { id: 'blazepup',  name: 'Blazepup',  elem: 'fire',     color: '#ff7a3c', color2: '#c93a0a',
        mults: { 2: 50, 3: 20, 4: 12, 5: 9, 6: 5, 8: 3, 10: 1 } },
      { id: 'aquash',    name: 'Aquash',    elem: 'water',    color: '#4fc3ff', color2: '#1264c9',
        mults: { 2: 46, 3: 20, 4: 12, 5: 9, 6: 6, 8: 4, 10: 2, 12: 1 } },
      { id: 'leafling',  name: 'Leafling',  elem: 'grass',    color: '#5ee06a', color2: '#168a30',
        mults: { 2: 55, 3: 22, 4: 12, 5: 7, 6: 3, 8: 1 } },
      { id: 'voltoroo',  name: 'Voltoroo',  elem: 'electric', color: '#ffd24a', color2: '#cf8a00',
        mults: { 3: 48, 4: 18, 5: 12, 6: 9, 8: 7, 10: 3, 12: 2, 15: 1 } },
      { id: 'frostfin',  name: 'Frostfin',  elem: 'ice',      color: '#9fe8ff', color2: '#2a8ec9',
        mults: { 3: 46, 4: 18, 5: 12, 6: 9, 8: 7, 10: 4, 15: 3, 20: 1 } },
      { id: 'nightfang', name: 'Nightfang', elem: 'shadow',   color: '#a86cff', color2: '#4d1d99',
        mults: { 5: 45, 6: 20, 8: 14, 10: 10, 12: 6, 15: 3, 20: 1.5, 25: 0.5 } },
      { id: 'goldhorn',  name: 'Goldhorn',  elem: 'legend',   color: '#ffd24a', color2: '#b8741a',
        mults: { 10: 40, 15: 20, 20: 14, 25: 10, 30: 7, 50: 5, 75: 3, 100: 1 } }
    ],

    wild:    { id: 'wild',    name: 'Golden Egg' },          // +x2 battle boost per wild in a battle column
    scatter: { id: 'scatter', name: 'Battle Arena Ticket' }, // 3+ trigger free spins

    /* ---- Reel weights (per-cell weighted draw) ------------------------ */
    weights: {
      base: {
        a: 13, k: 14.5, q: 16, j: 17.5, ten: 19,
        blazepup: 1.30, aquash: 1.15, leafling: 1.45, voltoroo: 0.90,
        frostfin: 0.70, nightfang: 0.55, goldhorn: 0.13,
        wild: 0.70, scatter: 0.80
      },
      // Free spins: creature battles happen more often
      fsCreatureMult: 1.40,
      // Scatter weight inside free spins (retrigger chance)
      fsScatterMult: 0.55,
      // Free spins: creature multipliers roll hotter. Each creature's
      // weight table is flattened with weight^fsMultExp, shifting odds
      // toward the top of its multiplier range.
      fsMultExp: 0.735,
      // SUPER free spins (Super Bonus Buy): battles nearly every spin and
      // the hottest multiplier rolls.
      superCreatureMult: 2.00,
      superMultExp: 0.69
    },

    /* ---- Paytable (bet multiples, pays anywhere) -----------------------
     * Lows pay with 8+ matching symbols anywhere (tiers 8-9 / 10-11 / 12+).
     * Creatures are premium: 3+ anywhere pays (tiers 3 / 4 / 5+).
     * The Golden Egg wild substitutes for LOW symbols only. */
    lowTiers: [9, 11, 13],
    creatureTiers: [3, 4, 5],
    paytable: {
      a:   [0.60, 1.80, 4.75],
      k:   [0.48, 1.40, 3.55],
      q:   [0.37, 1.15, 2.90],
      j:   [0.29, 0.92, 2.40],
      ten: [0.23, 0.73, 1.80],
      blazepup:  [0.48, 1.80, 6.75],
      aquash:    [0.57, 2.05, 7.85],
      leafling:  [0.41, 1.40, 5.65],
      voltoroo:  [0.68, 2.85, 10.3],
      frostfin:  [0.94, 3.45, 13.5],
      nightfang: [1.15, 4.60, 18.5],
      goldhorn:  [3.45, 13.5, 57.0]
    },
    // Scatter pays (count: 3..6+), paid once on trigger evaluation
    scatterPays: { 3: 1.5, 4: 3, 5: 10, 6: 50 },

    /* ---- Column Creature Battle ---------------------------------------- */
    battle: {
      minFighters: 2,    // 2+ creatures in one column start a battle
      wildBoost: 2,      // each Golden Egg in a battle column adds +x2
      goldhornDoubles: true // Goldhorn in a battle column doubles the column winner
    },

    /* ---- Free spins ----------------------------------------------------- */
    freeSpins: {
      trigger: 3,                            // min Battle Arena Tickets
      awards: { 3: 10, 4: 12, 5: 15, 6: 15 },
      retriggerSpins: 5,                     // 3+ tickets during a free spin
      battleBonus: { battles: 3, spins: 2 }  // 3+ battles in one free spin: +2 spins
    },

    /* ---- Bet modes ------------------------------------------------------ */
    betModes: {
      base:     { cost: 1.0, label: 'Base Game' },
      buy:      { cost: 80,  label: 'Bonus Buy', forcedScatters: { 3: 90, 4: 8, 5: 2 } },
      // SUPER free spins: creature battles nearly every spin, hottest rolls
      superbuy: { cost: 200, label: 'Super Bonus Buy', forcedScatters: { 3: 85, 4: 11, 5: 4 },
                  superFs: true }
    },

    /* ---- Bet limits (demo wallet) --------------------------------------- */
    bet: { min: 0.10, max: 100, default: 1.00, steps: [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100] },
    startBalance: 1000
  };

  /* ---- helpers consumed by engine + UI ---------------------------------- */
  CONFIG.creatureIds = {};
  CONFIG.creatures.forEach(function (c) { CONFIG.creatureIds[c.id] = c; });
  CONFIG.lowIds = {};
  CONFIG.lows.forEach(function (s) { CONFIG.lowIds[s.id] = s; });

  CONFIG.isCreature = function (id) { return !!CONFIG.creatureIds[id]; };
  CONFIG.isLow = function (id) { return !!CONFIG.lowIds[id]; };

  CONFIG.tierFor = function (id, count) {
    var tiers = CONFIG.isCreature(id) ? CONFIG.creatureTiers : CONFIG.lowTiers;
    var idx = -1;
    for (var i = 0; i < tiers.length; i++) if (count >= tiers[i]) idx = i;
    return idx; // -1 = below the paying threshold
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
