/* =========================================================================
 * Bonus Buy math verification — Rush Mode, Triple Shot, Jackpot Shot.
 *
 * Runs the exact GameEngine code the browser uses. Rush and Triple Shot
 * have no free parameters to calibrate (their cost is just "sum of the
 * independent stakes", which is RTP-neutral by construction — this script
 * confirms that empirically). Jackpot Shot's cost multiplier is genuinely
 * calibrated here: it's set in config.js and this script reports the
 * resulting simulated RTP so the number in config.js stays honest.
 *
 * Usage: node tools/simulate_bonus.js [rounds] [seed]
 * ========================================================================= */
'use strict';

require('../js/sha256.js');
require('../js/config.js');
require('../js/engine.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;

var rounds = parseInt(process.argv[2], 10) || 200000;
var seed = parseInt(process.argv[3], 10) || 424242;

function rtpLine(label, cost, totalCost, totalWin) {
  console.log('%s: RTP %s%%  (cost %sx bet, %d rounds)',
    label, (100 * totalWin / totalCost).toFixed(2), cost, rounds);
}

console.log('APEX LIMBO — Bonus Buy math verification\n');

/* ---- Rush Mode --------------------------------------------------------- */
(function () {
  var eng = new Engine(seed + 1);
  var m = CFG.bonusModes.rush;
  var cost = CFG.rushCost();
  var totalCost = 0, totalWin = 0, hitCounts = {};
  var targets = [2, 5, 10, 50]; // sweep a few targets — RTP should hold at every one
  targets.forEach(function (target) {
    var tc = 0, tw = 0;
    for (var i = 0; i < rounds; i++) {
      var res = eng.playRush('bonus-sim', target, m.shots);
      tc += cost; tw += res.totalPayoutX;
      hitCounts[res.hits] = (hitCounts[res.hits] || 0) + 1;
    }
    totalCost += tc; totalWin += tw;
    console.log('  Rush @ target %sx: RTP %s%%', target, (100 * tw / tc).toFixed(2));
  });
  rtpLine('Rush Mode (all targets combined)', cost, totalCost, totalWin);
  console.log('  hit-count distribution (last target only):', JSON.stringify(hitCounts));
  console.log('');
})();

/* ---- Triple Shot -------------------------------------------------------- */
(function () {
  var eng = new Engine(seed + 2);
  var lanes = CFG.tripleShotLanes();
  var cost = CFG.tripleShotCost();
  var totalCost = 0, totalWin = 0;
  var hitDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (var i = 0; i < rounds; i++) {
    var res = eng.playTripleShot('bonus-sim', lanes);
    totalCost += cost; totalWin += res.totalPayoutX;
    hitDist[res.hits]++;
  }
  rtpLine('Triple Shot [' + lanes.join('x, ') + 'x]', cost, totalCost, totalWin);
  console.log('  hit distribution: 0=%s%%  1=%s%%  2=%s%%  3=%s%% (TRIPLE HIT)',
    (100 * hitDist[0] / rounds).toFixed(3), (100 * hitDist[1] / rounds).toFixed(3),
    (100 * hitDist[2] / rounds).toFixed(3), (100 * hitDist[3] / rounds).toFixed(4));
  console.log('');
})();

/* ---- Jackpot Shot -------------------------------------------------------- */
(function () {
  var m = CFG.bonusModes.jackpot;
  var theoreticalE = (1 - CFG.houseEdge) * (1 + Math.log(m.maxWin / m.minWin));
  console.log('Jackpot Shot: a maxWin hit is ~1 in %s — Monte Carlo RTP below will swing hard',
    Math.round(m.maxWin / (1 - CFG.houseEdge)));
  console.log('  around the true value until N is in the tens of millions; the cost multiplier');
  console.log('  is calibrated analytically instead (theoretical E[payout] = %sx, see config.js).', theoreticalE.toFixed(4));
  var eng = new Engine(seed + 3);
  var cost = m.costMultiplier;
  var totalCost = 0, totalWin = 0, hits = 0, best = 0;
  var buckets = { 'miss': 0, '25-100x': 0, '100-1000x': 0, '1000-10000x': 0, '10000-100000x': 0, 'maxWin': 0 };
  for (var i = 0; i < rounds; i++) {
    var res = eng.playJackpot('bonus-sim', m.minWin, m.maxWin);
    totalCost += cost; totalWin += res.payoutX;
    if (res.hit) hits++;
    if (res.payoutX > best) best = res.payoutX;
    if (!res.hit) buckets['miss']++;
    else if (res.payoutX >= m.maxWin) buckets['maxWin']++;
    else if (res.payoutX < 100) buckets['25-100x']++;
    else if (res.payoutX < 1000) buckets['100-1000x']++;
    else if (res.payoutX < 10000) buckets['1000-10000x']++;
    else buckets['10000-100000x']++;
  }
  rtpLine('Jackpot Shot [min ' + m.minWin + 'x, max ' + m.maxWin.toLocaleString() + 'x]', cost, totalCost, totalWin);
  console.log('  hit rate: %s%%  (theoretical ~%s%%)', (100 * hits / rounds).toFixed(3), CFG.chanceForTarget(m.minWin).toFixed(3));
  console.log('  best payout seen: %sx', best.toFixed(2));
  console.log('  payout distribution:', JSON.stringify(buckets));
  console.log('');
  console.log('  (RTP here is a noisy sample of a fat-tailed payout, not a precise reading —');
  console.log('   see tools/jackpot_integral.js for the exact, deterministic calibration.)');
})();
