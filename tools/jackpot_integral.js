/* =========================================================================
 * Jackpot Shot — exact (deterministic) cost calibration.
 *
 * Jackpot Shot's payout distribution is fat-tailed enough (a maxWin hit is
 * roughly 1-in-100,000+) that Monte Carlo sampling (tools/simulate_bonus.js)
 * needs tens of millions of rounds before its RTP estimate stops swinging
 * ~50% run to run. Numerical integration over the RNG's uniform input `r`
 * sidesteps that entirely: it sums payout(r) on a fine deterministic grid
 * instead of sampling r randomly, so it converges to the true expected
 * payout with no variance at all — this is the number js/math.js's
 * `GameConfig.bonusModes.jackpot.costMultiplier` is actually calibrated
 * against.
 *
 * Usage: node tools/jackpot_integral.js [gridSize]
 * ========================================================================= */
'use strict';

require('../js/math.js');

var CFG = globalThis.GameConfig;
var m = CFG.bonusModes.jackpot;
var k = 1 - CFG.houseEdge;
var globalCap = CFG.target.max;

var N = parseInt(process.argv[2], 10) || 100000000;
var sum = 0;
for (var i = 0; i < N; i++) {
  var r = (i + 0.5) / N;                    // midpoint rule
  var raw = k / (1 - r);
  var mult = Math.floor(raw * 100) / 100;    // same discretization as computeResult()
  if (mult < 1) mult = 1;
  if (mult > globalCap) mult = globalCap;
  sum += mult >= m.minWin ? Math.min(mult, m.maxWin) : 0;
}
var E = sum / N;
var closedForm = k * (1 + Math.log(m.maxWin / m.minWin));
var breakEvenCost = E / k; // targeting RTP == k, same edge as every other mode

console.log('Jackpot Shot [min %sx, max %sx], house edge %s%%\n', m.minWin, m.maxWin.toLocaleString(), (CFG.houseEdge * 100).toFixed(1));
console.log('E[payout] (numerical integration, grid=%s) = %sx', N.toLocaleString(), E.toFixed(6));
console.log('E[payout] (closed form)                     = %sx', closedForm.toFixed(6));
console.log('Break-even cost for RTP = %s%%                = %sx bet', (k * 100).toFixed(0), breakEvenCost.toFixed(4));
console.log('');
console.log('Configured costMultiplier = %sx  ->  simulated-exact RTP = %s%%',
  m.costMultiplier, (100 * E / m.costMultiplier).toFixed(3));
