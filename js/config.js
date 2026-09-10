/* =========================================================================
 * APEX LIMBO — Game Configuration ("math config")
 *
 * Every tunable number that defines the game's math lives here, apart
 * from presentation.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'apex_limbo',
    gameName: 'APEX LIMBO',
    providerName: 'Urban Games',
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

      // TRIPLE SHOT — "premium": ONE draw, THREE escalating prize gates at
      // startTarget x [1, 10, 100]. Crossing a gate doesn't replace the
      // previous prize, it adds to it — payout = sum of every gate the one
      // result cleared. Because payout(result) = sum_j gate_j * 1[result >=
      // gate_j], linearity of expectation gives E[payout] = sum_j gate_j *
      // P(result>=gate_j) = sum_j gate_j*(houseEdge-complement/gate_j) =
      // 3*(1-houseEdge) -- the gate_j values cancel out completely, so RTP
      // is EXACTLY (1-houseEdge) for every possible startTarget, no
      // calibration needed (see tools/simulate_bonus.js for the empirical
      // check). The player's startTarget choice is the volatility control.
      tripleShot: {
        id: 'tripleShot',
        label: 'Triple Shot',
        tagline: 'One flight, three escalating gates',
        volatility: 'High',
        gateRatios: [1, 10, 100],
        startTarget: { min: 2, max: 900, default: 10, step: 0.01 },
        startPresets: [2, 5, 10, 25, 50, 100, 250, 500, 900]
        // cost = 3 x bet, ALWAYS (see UI.tripleShotCost) — independent of startTarget
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
        // cost = 1 + ln(maxWin/minWin) = 1 + ln(100000/25) = 9.2938...,
        // confirmed by direct numerical integration (not Monte Carlo —
        // a single maxWin hit is ~1-in-101,010, so naive simulation needs
        // tens of millions of rounds to converge; see tools/jackpot_integral.js).
        // 9.2938 rounds to the nearest cent as 9.29 (a prior pass here
        // mistakenly used 9.30, which understates RTP by ~0.1pp).
        costMultiplier: 9.29

      }
    }
  };

  CONFIG.rushCost = function () { return CONFIG.bonusModes.rush.shots; };

  // The three escalating gate values for a chosen starting target.
  CONFIG.tripleShotGates = function (startTarget) {
    var m = CONFIG.bonusModes.tripleShot;
    startTarget = Math.max(m.startTarget.min, Math.min(m.startTarget.max, startTarget));
    return m.gateRatios.map(function (r) { return Math.round(startTarget * r * 100) / 100; });
  };
  CONFIG.tripleShotCost = function () { return CONFIG.bonusModes.tripleShot.gateRatios.length; };

  // Win chance (%) for a given target multiplier, and the inverse.
  CONFIG.chanceForTarget = function (target) {
    return (100 * (1 - CONFIG.houseEdge)) / target;
  };
  CONFIG.targetForChance = function (chancePct) {
    return (100 * (1 - CONFIG.houseEdge)) / chancePct;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
