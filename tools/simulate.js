/* =========================================================================
 * RTP verification — runs the exact engine code the browser uses.
 *
 * 1) Random targets (log-uniform 1.01x .. 1000x): overall RTP should track
 *    the configured (1 - houseEdge) regardless of target choice.
 * 2) Fixed targets: empirical win rate should track chanceForTarget(target).
 *
 * Usage: node tools/simulate.js [rounds] [seed]
 * ========================================================================= */
'use strict';

require('../js/math.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;

var rounds = parseInt(process.argv[2], 10) || 300000;
var seed = parseInt(process.argv[3], 10) || 12345;

function randomTargets(eng, n) {
  var totalCost = 0, totalWin = 0, hits = 0, best = 0;
  var buckets = { '<2x': 0, '2-10x': 0, '10-100x': 0, '100-1000x': 0, '1000x+': 0 };
  for (var i = 0; i < n; i++) {
    // log-uniform between min and 1000x keeps the sim from spending all its
    // draws on astronomically rare targets
    var target = Math.pow(10, Math.log10(CFG.target.min) +
      eng.rng() * (Math.log10(1000) - Math.log10(CFG.target.min)));
    var rec = eng.playBet('sim', target);
    totalCost += 1;
    totalWin += rec.payoutX;
    if (rec.win) hits++;
    if (rec.result > best) best = rec.result;
    if (target < 2) buckets['<2x']++;
    else if (target < 10) buckets['2-10x']++;
    else if (target < 100) buckets['10-100x']++;
    else if (target < 1000) buckets['100-1000x']++;
    else buckets['1000x+']++;
  }
  console.log('--- random targets (%d bets) ---', n);
  console.log('RTP:      %s%% (target %s%%)', (100 * totalWin / totalCost).toFixed(2), (CFG.rtp * 100).toFixed(2));
  console.log('Hit rate: %s%%', (100 * hits / n).toFixed(2));
  console.log('Best result seen: %sx', best.toFixed(2));
  console.log('Target distribution:', JSON.stringify(buckets));
  console.log('');
}

function fixedTarget(eng, target, n) {
  var wins = 0, totalWin = 0;
  for (var i = 0; i < n; i++) {
    var rec = eng.playBet('sim', target);
    if (rec.win) wins++;
    totalWin += rec.payoutX;
  }
  var empirical = 100 * wins / n;
  var theoretical = CFG.chanceForTarget(target);
  console.log('target %sx: win rate %s%% (theoretical %s%%), RTP %s%%',
    target, empirical.toFixed(3), theoretical.toFixed(3), (100 * totalWin / n).toFixed(2));
}

console.log('APEX LIMBO math verification — target RTP %s%%\n', (CFG.rtp * 100).toFixed(1));

var eng = new Engine(seed);
randomTargets(eng, rounds);

console.log('--- fixed-target win rates (%d bets each) ---', Math.floor(rounds / 10));
[1.5, 2, 5, 10, 50, 100, 1000].forEach(function (t) {
  fixedTarget(new Engine(seed + Math.round(t * 7)), t, Math.floor(rounds / 10));
});
