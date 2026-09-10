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

/* ---- Triple Shot ----------------------------------------------------------
 * ONE draw, THREE escalating gates (startTarget x 1/10/100). Because
 * payout(result) = sum_j gate_j * 1[result >= gate_j], linearity of
 * expectation gives E[payout] = sum_j gate_j * P(result>=gate_j) =
 * sum_j gate_j*(houseEdge-complement/gate_j) = 3*(1-houseEdge) EXACTLY —
 * the gate_j values cancel out, so RTP should read ~99% at every starting
 * target below (still Monte Carlo noise at the tails of each sweep, worse
 * for higher starting targets since their top gate is rarer — same shape
 * of variance as Jackpot Shot, just far less extreme). */
(function () {
  var cost = CFG.tripleShotCost();
  var totalCost = 0, totalWin = 0;
  CFG.bonusModes.tripleShot.startPresets.forEach(function (T) {
    var eng = new Engine(seed + 2 + Math.round(T * 3));
    var tc = 0, tw = 0;
    var hitDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (var i = 0; i < rounds; i++) {
      var res = eng.playTripleShot('bonus-sim', T);
      tc += cost; tw += res.totalPayoutX;
      hitDist[res.hits]++;
    }
    totalCost += tc; totalWin += tw;
    var gates = CFG.tripleShotGates(T);
    console.log('  Triple Shot @ start %sx [gates %sx]: RTP %s%%  (hits 0/1/2/3 = %s%% / %s%% / %s%% / %s%%)',
      T, gates.join('/'), (100 * tw / tc).toFixed(2),
      (100 * hitDist[0] / rounds).toFixed(2), (100 * hitDist[1] / rounds).toFixed(2),
      (100 * hitDist[2] / rounds).toFixed(3), (100 * hitDist[3] / rounds).toFixed(4));
  });
  rtpLine('Triple Shot (all starting targets combined)', cost, totalCost, totalWin);
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
