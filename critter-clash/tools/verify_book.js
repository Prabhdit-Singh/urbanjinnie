/* =========================================================================
 * Event-book invariant checker — replays thousands of rounds and asserts
 * the book is internally consistent, i.e. a frontend replaying it would
 * always show the same totals the engine settled.
 *
 * Usage: node tools/verify_book.js [rounds] [seed]
 * ========================================================================= */
'use strict';

require('../js/config.js');
require('../js/engine.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;

var rounds = parseInt(process.argv[2], 10) || 20000;
var seed = parseInt(process.argv[3], 10) || 777;
var eng = new Engine(seed);

function fail(msg, round, i, ev) {
  console.error('FAIL @ round %d event %d: %s', round, i, msg);
  console.error(JSON.stringify(ev, null, 2));
  process.exit(1);
}

function near(a, b) { return Math.abs(a - b) < 1e-9; }

var checked = 0;
for (var n = 0; n < rounds; n++) {
  var mode = n % 10 === 0 ? 'buy' : (n % 10 === 5 ? 'superbuy' : 'base');
  var res = eng.playRound(mode);
  var sumSpinWins = 0, lastBaseWin = 0, lastBattleMult = 0, carry = 0, inFs = false;

  for (var i = 0; i < res.events.length; i++) {
    var ev = res.events[i];
    switch (ev.type) {
      case 'reveal':
        if (ev.grid.length !== CFG.grid.cols || ev.grid[0].length !== CFG.grid.rows)
          fail('bad grid shape', n, i, ev);
        for (var c = 0; c < CFG.grid.cols; c++)
          for (var r = 0; r < CFG.grid.rows; r++) {
            var id = ev.grid[c][r];
            var isC = CFG.isCreature(id);
            if (isC && ev.mults[c][r] < 2) fail('creature without multiplier', n, i, ev);
            if (!isC && ev.mults[c][r] !== 0) fail('non-creature with multiplier', n, i, ev);
          }
        lastBaseWin = 0; lastBattleMult = 0;
        break;

      case 'win':
        var t = 0;
        for (var w = 0; w < ev.wins.length; w++) t += ev.wins[w].pay;
        if (!near(t, ev.baseWin)) fail('win pays do not sum to baseWin', n, i, ev);
        lastBaseWin = ev.baseWin;
        break;

      case 'battles':
        var tm = 0;
        for (var b = 0; b < ev.battles.length; b++) {
          var bt = ev.battles[b];
          if (bt.fighters.length < CFG.battle.minFighters) fail('battle with too few fighters', n, i, ev);
          var best = 0;
          bt.fighters.forEach(function (f) { best = Math.max(best, f.mult); });
          var expect = 0;
          bt.fighters.forEach(function (f) { if (f.mult === best) expect += best; });
          expect += bt.wildBoost;
          if (bt.goldDoubled) expect *= 2;
          if (expect !== bt.result) fail('battle result mismatch', n, i, ev);
          tm += bt.result;
        }
        if (tm !== ev.totalMult) fail('battles totalMult mismatch', n, i, ev);
        lastBattleMult = ev.totalMult;
        break;

      case 'carryUpdate':
        carry += ev.added;
        if (carry !== ev.carry) fail('carry mismatch', n, i, ev);
        break;

      case 'multApply':
        var effMult = inFs ? carry : lastBattleMult;
        if (ev.mult !== effMult) fail('applied mult mismatch', n, i, ev);
        if (!near(ev.baseWin * ev.mult, ev.finalWin)) fail('multApply arithmetic wrong', n, i, ev);
        if (!near(ev.baseWin, lastBaseWin)) fail('multApply baseWin mismatch', n, i, ev);
        break;

      case 'spinWin':
        sumSpinWins += ev.win;
        break;

      case 'scatterPay':
        sumSpinWins += ev.pay;
        break;

      case 'fsTrigger':
        inFs = true; carry = 0;
        break;

      case 'roundEnd':
        if (!near(ev.totalWin, res.totalWinX)) fail('roundEnd != totalWinX', n, i, ev);
        if (!near(sumSpinWins, res.totalWinX)) fail('event wins do not sum to totalWinX', n, i, ev);
        if (res.totalWinX > CFG.maxWinX + 1e-9) fail('total exceeds max win cap', n, i, ev);
        break;
    }
    checked++;
  }
}

console.log('OK — %d rounds, %d events verified, no invariant violations.', rounds, checked);
