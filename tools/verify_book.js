/* Sanity checks on engine event books — verifies the contract the renderer
 * relies on: grid shapes, tumble refill consistency, pay-anywhere win
 * accounting, caps, orb collection and free-spin event ordering.
 * Usage: node tools/verify_book.js [rounds] */
'use strict';

require('../js/config.js');
require('../js/engine.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;
var eng = new Engine(777);
var rounds = parseInt(process.argv[2], 10) || 20000;
var fails = 0;

function assert(cond, msg, ctx) {
  if (!cond) { fails++; console.error('FAIL:', msg, ctx != null ? JSON.stringify(ctx) : ''); if (fails > 12) process.exit(1); }
}

function checkGrid(grid) {
  assert(grid.length === CFG.grid.cols, 'grid cols', grid.length);
  for (var c = 0; c < grid.length; c++) {
    assert(grid[c].length === CFG.grid.rows, 'grid rows', grid[c].length);
    for (var r = 0; r < grid[c].length; r++) {
      var cell = grid[c][r];
      assert(cell && typeof cell.sym === 'string', 'cell has sym');
      if (cell.sym === 'orb') assert(cell.mult > 0, 'orb has mult');
    }
  }
}

/* renderer reconstructs tumbles as: per column, survivors keep order and
 * settle to the bottom; new symbols fill from the top. */
function checkTumble(prev, removeCells, next) {
  var removed = {}; removeCells.forEach(function (p) { removed[p[0] + ',' + p[1]] = true; });
  for (var c = 0; c < CFG.grid.cols; c++) {
    var kept = [];
    for (var r = 0; r < CFG.grid.rows; r++) if (!removed[c + ',' + r]) kept.push(prev[c][r].sym);
    for (var k = 0; k < kept.length; k++) {
      var target = CFG.grid.rows - kept.length + k;
      assert(next[c][target].sym === kept[k], 'tumble survivor order', { col: c, k: k });
    }
  }
}

var modes = ['base', 'buy', 'scanner', 'outbreak', 'virusking'];
var counts = { reveal: 0, win: 0, tumble: 0, orbCollect: 0, scannerBeam: 0, meter: 0,
               fsTrigger: 0, fsRetrigger: 0, maxWin: 0, scatterPay: 0 };

for (var i = 0; i < rounds; i++) {
  var mode = modes[i % modes.length];
  var res = eng.playRound(mode);
  var evs = res.events;
  assert(evs.length > 0, 'has events');
  assert(evs[evs.length - 1].type === 'roundEnd', 'ends with roundEnd', evs[evs.length - 1].type);
  assert(res.totalWinX <= CFG.maxWinX + 1e-6, 'win <= cap', res.totalWinX);
  assert(Math.abs(evs[evs.length - 1].totalWin - res.totalWinX) < 1e-6, 'roundEnd total matches');

  var prevGrid = null, lastRemove = null, inFs = false, fsSeen = false;
  for (var e = 0; e < evs.length; e++) {
    var ev = evs[e];
    if (counts[ev.type] !== undefined) counts[ev.type]++;
    switch (ev.type) {
      case 'reveal':
        checkGrid(ev.grid); prevGrid = ev.grid;
        if (inFs) assert(fsSeen, 'reveal inside FS preceded by fsSpin');
        break;
      case 'win':
        assert(ev.wins.length > 0, 'win has entries');
        lastRemove = [];
        ev.wins.forEach(function (wn) {
          assert(wn.count >= CFG.minPay, 'count >= minPay', wn.count);
          assert(wn.pay > 0, 'pays > 0');
          wn.cells.forEach(function (p) {
            var sym = prevGrid[p[0]][p[1]].sym;
            assert(sym === wn.symbol || sym === 'wild', 'win cell matches symbol or wild', { sym: sym, want: wn.symbol });
            lastRemove.push(p);
          });
        });
        assert(Math.abs(ev.stepWin - ev.stepBase * ev.mult) < 1e-6, 'stepWin = base*mult');
        break;
      case 'tumble':
        checkGrid(ev.grid); checkTumble(prevGrid, lastRemove, ev.grid); prevGrid = ev.grid;
        break;
      case 'scannerBeam':
        checkGrid(ev.grid); prevGrid = ev.grid; break;
      case 'orbCollect':
        assert(inFs, 'orbCollect only in FS');
        assert(ev.fsMult >= ev.fsMultBefore, 'fsMult grows');
        assert(ev.fsMult <= 300 + 1e-6, 'fsMult within cap range', ev.fsMult);
        break;
      case 'fsTrigger': assert(ev.spins >= 10, 'fs award >= 10'); inFs = true; break;
      case 'fsSpin': fsSeen = true; break;
    }
  }
}

console.log('Verified %d rounds across modes. Event counts: %j', rounds, counts);
console.log(fails === 0 ? 'ALL CHECKS PASSED' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
