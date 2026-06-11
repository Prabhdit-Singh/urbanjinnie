/* =========================================================================
 * CANDY SURGE 1000 — Game Configuration ("math config")
 *
 * Mirrors the Stake Engine math-sdk configuration concept: every tunable
 * number that defines the game's math model lives here, separate from
 * presentation. The engine (engine.js) consumes this config and produces
 * a deterministic event book; the frontend only replays it.
 *
 * Win evaluation type: "cluster" (one of the four supported by Stake
 * Engine: lines | ways | cluster | scatter).
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'candy_surge_1000',
    gameName: 'CANDY SURGE 1000',
    providerName: 'YOUR STUDIO',       // publisher logo / name placeholder
    version: '1.0.0',
    rtp: 0.965,                        // target RTP (declared, tuned via tools/simulate.js)
    maxWinX: 25000,                    // max win cap, in bet multiples (round ends at cap)
    winType: 'cluster',

    grid: { cols: 7, rows: 7 },
    minClusterSize: 5,

    /* ---- Symbols ------------------------------------------------------ */
    // id: engine identifier | name/colors are used by the procedural artist
    symbols: [
      { id: 'star',  name: 'Star Pop',    color: '#ff4d6d', color2: '#b3123a' },
      { id: 'heart', name: 'Heart Jelly', color: '#ff7ad9', color2: '#d630a8' },
      { id: 'gem',   name: 'Berry Gem',   color: '#b06cff', color2: '#6f2dc9' },
      { id: 'ring',  name: 'Ring Candy',  color: '#4fc3ff', color2: '#1671d9' },
      { id: 'bean',  name: 'Sour Bean',   color: '#5ee06a', color2: '#1da53a' },
      { id: 'drop',  name: 'Citrus Drop', color: '#ffb637', color2: '#e07c0a' },
      { id: 'swirl', name: 'Mint Swirl',  color: '#3fe0c5', color2: '#0f9e8a' }
    ],
    scatter: { id: 'scatter', name: 'Crystal Cube' },

    /* ---- Reel weights (per-cell weighted draw) ------------------------ */
    // Identical pool for initial reveal and tumble refills.
    weights: {
      base: { star: 2.5, heart: 3, gem: 4, ring: 5.5, bean: 7.5, drop: 9.5, swirl: 12, scatter: 0.24 },
      // Free spins use a slightly hotter reel set (more clusters -> spots grow)
      fs:   { star: 2.32, heart: 2.83, gem: 3.83, ring: 5.32, bean: 7.85, drop: 10.32, swirl: 13.05 },
      // "Double Chance" ante: +25% bet cost, ~doubles the free spins trigger
      // frequency (P(>=3 scatters) scales ~cubically in the per-cell rate,
      // so the weight multiplier is 2^(1/3) ~= 1.26). Base game only.
      anteScatterMult: 1.20,
      // Scatter weight inside free spins (retrigger chance)
      fsScatterMult: 0.5
    },

    /* ---- Paytable (bet multiples, per cluster size tier) --------------- */
    // Tiers by cluster size: 5 / 6 / 7 / 8-9 / 10-11 / 12-14 / 15+
    clusterTiers: [5, 6, 7, 8, 10, 12, 15],
    paytable: {
      star:  [0.80, 1.25, 2.40, 5.00, 12.0, 50.0, 250.0],
      heart: [0.60, 1.00, 2.00, 4.00, 10.0, 30.0, 150.0],
      gem:   [0.50, 0.80, 1.50, 3.00, 8.00, 20.0, 100.0],
      ring:  [0.40, 0.60, 1.20, 2.50, 5.50, 12.0, 60.0],
      bean:  [0.30, 0.50, 1.00, 1.50, 4.00, 8.00, 40.0],
      drop:  [0.25, 0.40, 0.80, 1.20, 3.00, 6.00, 25.0],
      swirl: [0.15, 0.30, 0.60, 1.00, 2.50, 5.00, 15.0]
    },
    // Scatter pays (count: 3..7+), paid once per round on trigger evaluation
    scatterPays: { 3: 2, 4: 4, 5: 10, 6: 50, 7: 200 },

    /* ---- Multiplier spots ---------------------------------------------- */
    // A win marks each cell of the cluster. The 2nd hit turns the mark into
    // x2; every following hit doubles it, up to the cap. A cluster's win is
    // multiplied by the SUM of multiplier values (>= x2) under it, applied
    // BEFORE the marks from that same win are added.
    multiplier: { startHits: 2, base: 2, cap: 1024 },
    // Base game: marks reset every paid spin. Free spins: persist all bonus.

    /* ---- Free spins ----------------------------------------------------- */
    freeSpins: {
      trigger: 3,            // min scatters to trigger
      awards: { 3: 10, 4: 12, 5: 14, 6: 16, 7: 18 },
      retriggerSpins: 10     // 3+ scatters during a free spin
    },

    /* ---- Bet modes ------------------------------------------------------ */
    betModes: {
      base:     { cost: 1.0,  label: 'Base Game' },
      ante:     { cost: 1.25, label: 'Double Chance' },
      buy:      { cost: 100,  label: 'Bonus Buy',       forcedScatters: { 3: 88, 4: 10, 5: 2 } },
      superbuy: { cost: 500,  label: 'Super Bonus Buy', forcedScatters: { 3: 80, 4: 14, 5: 6 },
                  // SUPER free spins: every mark becomes x2 on its FIRST hit
                  // (instead of the second), and random spots are pre-placed.
                  superSpots: true,
                  seedSpots: { min: 6, max: 9, values: { 2: 32, 4: 28, 8: 20, 16: 12, 32: 8 } } }
    },

    /* ---- Bet limits (demo wallet) --------------------------------------- */
    bet: { min: 0.10, max: 100, default: 1.00, steps: [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100] },
    startBalance: 1000
  };

  CONFIG.tierForSize = function (size) {
    var tiers = CONFIG.clusterTiers, idx = 0;
    for (var i = 0; i < tiers.length; i++) if (size >= tiers[i]) idx = i;
    return idx;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
