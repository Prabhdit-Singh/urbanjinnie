/* Sanity checks on engine event books — verifies the contract the renderer
 * relies on: grid shapes, tumble refill consistency, win accounting, caps,
 * and free-spin event ordering. Usage: node tools/verify_book.js [rounds] */
'use strict';

require('../js/config.js');
require('../js/engine.js');

var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;
var eng = new Engine(777);
var rounds = parseInt(process.argv[2], 10) || 20000;
var fails = 0;

function assert(cond, msg, ctx) {
  if (!cond) {
    fails++;
    console.error('FAIL:', msg, ctx || '');
    if (fails > 10) process.exit(1);
  }
}

function checkGrid(grid) {
  assert(grid.length === CFG.grid.cols, 'grid cols');
  for (var c = 0; c < grid.length; c++) {
    assert(grid[c].length === CFG.grid.rows, 'grid rows');
    for (var r = 0; r < grid[c].length; r++)
      assert(typeof grid[c][r] === 'string', 'cell symbol');
  }
}

/* The renderer reconstructs tumbles as: per column, surviving symbols keep
 * their order and settle to the bottom; new symbols fill from the top.
 * Verify the engine's post-tumble grid actually matches that contract. */
function checkTumbleConsistency(prevGrid, winCells, newGrid) {
  var removed = {};
  winCells.forEach(function (p) { removed[p[0] + ',' + p[1]] = true; });
  for (var c = 0; c < CFG.grid.cols; c++) {
    var kept = [];
    for (var r = 0; r < CFG.grid.rows; r++)
      if (!removed[c + ',' + r]) kept.push(prevGrid[c][r]);
    for (var k = 0; k < kept.length; k++) {
      var target = CFG.grid.rows - kept.length + k;
      assert(newGrid[c][target] === kept[k], 'tumble survivor order', { col: c });
    }
  }
}

var modes = ['base', 'ante', 'buy', 'superbuy'];
var counts = { reveal: 0, win: 0, tumble: 0, fsTrigger: 0, fsRetrigger: 0, maxWin: 0, seedSpots: 0 };

for (var i = 0; i < rounds; i++) {
  var mode = modes[i % modes.length];
  var res = eng.playRound(mode);
  var evs = res.events;
  assert(evs[evs.length - 1].type === 'roundEnd', 'book ends with roundEnd');
  assert(res.totalWinX <= CFG.maxWinX + 1e-9, 'win <= cap', res.totalWinX);
  assert(evs[evs.length - 1].totalWin === res.totalWinX, 'roundEnd total matches');

  var prevGrid = null, lastWinCells = null, sumWins = 0, inFs = false, fsSeen = false;
  for (var e = 0; e < evs.length; e++) {
    var ev = evs[e];
    if (counts[ev.type] !== undefined) counts[ev.type]++;
    switch (ev.type) {
      case 'reveal':
        checkGrid(ev.grid);
        prevGrid = ev.grid;
        if (inFs) assert(fsSeen, 'reveal inside FS preceded by fsSpin');
        break;
      case 'win':
        assert(ev.clusters.length > 0, 'win has clusters');
        lastWinCells = [];
        ev.clusters.forEach(function (cl) {
          assert(cl.size >= CFG.minClusterSize, 'cluster size >= min');
          assert(cl.pay > 0, 'cluster pays');
          cl.cells.forEach(function (p) {
            assert(prevGrid[p[0]][p[1]] === cl.symbol, 'cluster symbol matches grid');
            lastWinCells.push(p);
          });
        });
        break;
      case 'tumble':
        checkGrid(ev.grid);
        checkTumbleConsistency(prevGrid, lastWinCells, ev.grid);
        prevGrid = ev.grid;
        break;
      case 'fsTrigger':
        assert(ev.spins >= 10, 'fs award >= 10');
        inFs = true;
        break;
      case 'fsSpin': fsSeen = true; break;
      case 'scatterPay': sumWins += ev.pay; break;
    }
  }
}

console.log('Verified %d rounds across modes. Event counts: %j', rounds, counts);
console.log(fails === 0 ? 'ALL CHECKS PASSED' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
