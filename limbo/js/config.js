/* =========================================================================
 * APEX LIMBO — Game Configuration ("math config")
 *
 * Same separation-of-concerns idea as the Candy Surge demo: every tunable
 * number that defines the game's math lives here, apart from presentation.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'apex_limbo',
    gameName: 'APEX LIMBO',
    providerName: 'YOUR STUDIO',   // publisher logo / name placeholder
    version: '1.0.0',

    houseEdge: 0.01,               // 1% house edge -> 99% theoretical RTP at any target
    rtp: 0.99,

    target: { min: 1.01, max: 1000000, default: 2.00, step: 0.01 },

    bet: { min: 0.10, max: 100, default: 1.00, steps: [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100] },
    startBalance: 1000,

    quickTargets: [1.5, 2, 5, 10, 50, 100],

    auto: {
      counts: [10, 25, 50, 100, 'inf'],
      defaultCount: 25,
      maxAdjustPct: 1000,          // cap on-win/on-loss bet-change percentage
      delayMs: 550                 // pause between auto-bets (turbo halves it)
    },

    history: { size: 20 },

    // cosmetic-only "APEX" celebration threshold: fires when a win clears
    // the target by at least this factor. Purely presentational — has no
    // effect on the result or payout.
    apexWinFactor: 5
  };

  // Win chance (%) for a given target multiplier, and the inverse.
  CONFIG.chanceForTarget = function (target) {
    return (100 * (1 - CONFIG.houseEdge)) / target;
  };
  CONFIG.targetForChance = function (chancePct) {
    return (100 * (1 - CONFIG.houseEdge)) / chancePct;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
