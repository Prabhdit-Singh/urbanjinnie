/* =========================================================================
 * MEDBOT INVASION 1000 — RTP / volatility simulator (Stake Engine math-sdk
 * style verification). Runs the exact same engine the browser uses and
 * reports per bet mode: RTP, hit rate, bonus frequency, max-win hits and the
 * win distribution.
 *
 * Usage: node tools/simulate.js [rounds] [seed]
 * ========================================================================= */
'use strict';

require('../js/config.js');
require('../js/engine.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;

var rounds = parseInt(process.argv[2], 10) || 200000;
var seed = parseInt(process.argv[3], 10) || 12345;

function simulate(mode, n, seedOffset) {
  var eng = new Engine(seed + seedOffset);
  var cost = CFG.betModes[mode].cost;
  var totalCost = 0, totalWin = 0, hits = 0, bonuses = 0, maxWins = 0, best = 0;
  var buckets = { '0': 0, '0-1x': 0, '1-5x': 0, '5-20x': 0, '20-100x': 0, '100-1000x': 0, '1000x+': 0 };

  for (var i = 0; i < n; i++) {
    var res = eng.playRound(mode);
    totalCost += cost;
    totalWin += res.totalWinX;
    if (res.totalWinX > 0) hits++;
    if (res.totalWinX > best) best = res.totalWinX;
    if (res.totalWinX >= CFG.maxWinX) maxWins++;
    for (var e = 0; e < res.events.length; e++)
      if (res.events[e].type === 'fsTrigger') { bonuses++; break; }

    var x = res.totalWinX / cost;
    if (x === 0) buckets['0']++;
    else if (x < 1) buckets['0-1x']++;
    else if (x < 5) buckets['1-5x']++;
    else if (x < 20) buckets['5-20x']++;
    else if (x < 100) buckets['20-100x']++;
    else if (x < 1000) buckets['100-1000x']++;
    else buckets['1000x+']++;
  }

  console.log('--- mode: %s (cost %sx, %d rounds) ---', mode, cost, n);
  console.log('RTP:        %s%%', (100 * totalWin / totalCost).toFixed(2));
  console.log('Hit rate:   %s%%', (100 * hits / n).toFixed(2));
  console.log('Bonus freq: 1 in %s', bonuses ? (n / bonuses).toFixed(1) : 'n/a');
  console.log('Best win:   %sx bet (cap %sx) | cap hits: %d', best.toFixed(0), CFG.maxWinX, maxWins);
  console.log('Distribution:', JSON.stringify(buckets));
  console.log('');
}

console.log('MEDBOT INVASION 1000 math verification — target RTP %s%%\n', (CFG.rtp * 100).toFixed(1));
simulate('base', rounds, 0);
simulate('buy', Math.max(2000, Math.floor(rounds / 20)), 2);
simulate('scanner', Math.max(2000, Math.floor(rounds / 20)), 3);
simulate('outbreak', Math.max(2000, Math.floor(rounds / 20)), 4);
simulate('virusking', Math.max(2000, Math.floor(rounds / 20)), 5);
