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
    apexWinFactor: 5,

    /* ---- Bonus Buy modes ---------------------------------------------
     * All three reuse the exact same provably-fair draw (computeResult in
     * engine.js) that a normal bet uses — they differ only in how many
     * draws are taken and how the draw(s) are turned into a payout. None
     * of them touch houseEdge; each mode's cost is derived from the SAME
     * math that prices a normal bet, so RTP stays honest and is checked
     * by tools/simulate_bonus.js rather than just asserted here. */
    bonusModes: {
      // RUSH MODE — "accessible": fires `shots` independent bets at the
      // player's current Target Multiplier, back to back, fast. This is
      // literally N normal bets (cost = N x bet, RTP = base RTP) wearing
      // a rapid-fire presentation — no separate math to balance.
      rush: {
        id: 'rush',
        label: 'Rush Mode',
        tagline: 'Speed & accumulation',
        volatility: 'Medium-High',
        shots: 10,
        shotIntervalMs: 170
        // cost = shots x bet (see UI.rushCost)
      },

      // TRIPLE SHOT — "premium": three independent, simultaneous lanes at
      // fixed targets. Config drives the targets (not the player) so the
      // bundle can be balanced as a whole; several presets are kept here
      // for future tuning, but only `activePreset` is exposed in the UI.
      tripleShot: {
        id: 'tripleShot',
        label: 'Triple Shot',
        tagline: 'Three simultaneous chances',
        volatility: 'High',
        activePreset: 'balanced',
        presets: {
          balanced: [3, 10, 50],
          highRisk: [5, 25, 250],
          extreme: [10, 100, 1000]
        }
        // cost = sum of the active preset's lane count x bet (see UI.tripleShotCost)
      },

      // JACKPOT SHOT — "extreme": one draw. Below minWin it's a plain
      // miss (payout 0); at or above minWin the draw has already "entered
      // the zone" and its OWN value (clamped to maxWin) becomes the
      // payout — no separate prize table, no wheel. Because the base
      // result distribution is already heavy-tailed, awards land far more
      // often near minWin than near maxWin with no extra weighting logic.
      jackpot: {
        id: 'jackpot',
        label: 'Jackpot Shot',
        tagline: 'One shot at something enormous',
        volatility: 'Extreme',
        minWin: 25,
        maxWin: 100000,
        // Closed form for this payout shape: E[payout] = (1-houseEdge) *
        // (1 + ln(maxWin/minWin)); cost = E[payout] / targetRTP. With
        // targetRTP == (1-houseEdge) the (1-houseEdge) factor cancels, so
        // cost = 1 + ln(maxWin/minWin) = 1 + ln(100000/25) ~= 9.294,
        // confirmed by direct numerical integration (not Monte Carlo —
        // a single maxWin hit is ~1-in-101,010, so naive simulation needs
        // tens of millions of rounds to converge; see tools/simulate_bonus.js).
        costMultiplier: 9.30

      }
    }
  };

  CONFIG.rushCost = function () { return CONFIG.bonusModes.rush.shots; };
  CONFIG.tripleShotLanes = function () {
    var m = CONFIG.bonusModes.tripleShot;
    return m.presets[m.activePreset];
  };
  CONFIG.tripleShotCost = function () { return CONFIG.tripleShotLanes().length; };

  // Win chance (%) for a given target multiplier, and the inverse.
  CONFIG.chanceForTarget = function (target) {
    return (100 * (1 - CONFIG.houseEdge)) / target;
  };
  CONFIG.targetForChance = function (chancePct) {
    return (100 * (1 - CONFIG.houseEdge)) / chancePct;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
