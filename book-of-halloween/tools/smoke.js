/* Headless smoke + logic test for Book of Halloween.
 * Stubs the DOM/canvas so the page modules load in Node, runs a few render
 * frames to catch playback errors, then unit-checks win evaluation.
 * Usage: node book-of-halloween/tools/smoke.js
 */
'use strict';

/* ---- minimal browser stubs ------------------------------------------- */
function fakeGradient() { return { addColorStop: function () {} }; }
function fakeCtx() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return fakeGradient;
      if (p === 'measureText') return function () { return { width: 40 }; };
      if (p === 'canvas') return {};
      if (typeof t[p] !== 'undefined') return t[p];
      return function () {};
    },
    set: function (t, p, v) { t[p] = v; return true; }
  });
}
function fakeClassList() { return { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }; }
function fakeEl() {
  return {
    style: {}, classList: fakeClassList(), value: '', textContent: '', innerHTML: '',
    width: 0, height: 0, disabled: false, onclick: null,
    getContext: function () { return fakeCtx(); },
    appendChild: function () {}, addEventListener: function () {}
  };
}
var registry = {};
function getEl(id) { return registry[id] || (registry[id] = fakeEl()); }

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
var clock = 0, frames = 0;
globalThis.performance = { now: function () { return clock; } };
globalThis.requestAnimationFrame = function (cb) {
  if (frames++ < 6) { clock += 16; setTimeout(function () { cb(clock); }, 0); }
  return frames;
};
globalThis.document = {
  readyState: 'complete',
  createElement: function () { return fakeEl(); },
  getElementById: getEl,
  addEventListener: function () {}
};

require('../js/config.js');
require('../js/art.js');
require('../js/audio.js');
globalThis.BOH_Audio.setEnabled(false);
require('../js/game.js');

var CFG = globalThis.BOH_Config;
var G = globalThis.BOH_Game;

/* ---- assertions ------------------------------------------------------ */
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  FAIL:', msg); } }
function approx(a, b) { return Math.abs(a - b) < 1e-6; }

function grid(rows) {
  // rows: array of 3 strings of 5 space-separated ids -> [col][row]
  var gcols = [[], [], [], [], []];
  rows.forEach(function (line, r) {
    line.trim().split(/\s+/).forEach(function (id, c) { gcols[c][r] = id; });
  });
  return gcols;
}

// helper: set bet to $1.00 (index 3) for predictable maths
G.state.betIndex = 3;
var bet = G.bet();                 // 1.00
var perLine = G.perLine();         // 0.10

/* 1) Five-of-a-kind pumpkin on the middle line (row 1). */
(function () {
  G.state.fs.active = false; G.state.fs.special = null;
  var gr = grid([
    'ten ten ten ten ten',
    'pumpkin pumpkin pumpkin pumpkin pumpkin',
    'ten ten ten ten ten'
  ]);
  var res = G.evaluate(gr);
  var line = res.wins.filter(function (w) { return w.type === 'line' && w.symbol === 'pumpkin'; })[0];
  ok(line && line.count === 5, '5x pumpkin line detected');
  ok(line && approx(line.amount, CFG.paytable.pumpkin[2] * perLine), '5x pumpkin pays 50x per-line bet');
})();

/* 2) Book acts as wild to extend a line. */
(function () {
  var gr = grid([
    'ten ten ten ten ten',
    'skull skull book skull ten',
    'ten ten ten ten ten'
  ]);
  var res = G.evaluate(gr);
  var line = res.wins.filter(function (w) { return w.type === 'line' && w.symbol === 'skull'; })[0];
  ok(line && line.count === 4, 'book wild extends skull to 4 of a kind');
})();

/* 3) Book scatter pays anywhere (3 books) and triggers free spins count. */
(function () {
  var gr = grid([
    'book ten ten book ten',
    'ten ten ten ten ten',
    'ten ten book ten ten'
  ]);
  var res = G.evaluate(gr);
  ok(res.bookCount === 3, '3 books counted anywhere');
  var sc = res.wins.filter(function (w) { return w.type === 'scatter'; })[0];
  ok(sc && approx(sc.amount, CFG.bookScatterPays[3] * bet), '3 books scatter pays 2x total bet');
})();

/* 4) Free Spins expanding symbol: special on 4 reels expands and pays x bet. */
(function () {
  G.state.fs.active = true; G.state.fs.special = 'pumpkin';
  var gr = grid([
    'pumpkin ten pumpkin pumpkin ten',
    'ten ten ten ten ten',
    'ten pumpkin ten ten pumpkin'
  ]); // pumpkin appears on reels 0,1,2,3,4 -> 5 reels actually
  var res = G.evaluate(gr);
  var ex = res.wins.filter(function (w) { return w.type === 'expand'; })[0];
  ok(ex && ex.count === 5, 'expanding pumpkin covers 5 reels');
  ok(ex && approx(ex.amount, CFG.paytable.pumpkin[2] * bet), 'expansion pays 5-of-a-kind x total bet');
  G.state.fs.active = false; G.state.fs.special = null;
})();

/* 5) No win on a dead board. */
(function () {
  var gr = grid([
    'ace king queen jack ten',
    'ace king queen jack ten',
    'ace king queen jack ten'
  ]); // each reel a single distinct symbol -> no 3-in-a-row from reel 1
  var res = G.evaluate(gr);
  ok(res.total === 0, 'distinct reels produce no line win');
})();

setTimeout(function () {
  console.log('Book of Halloween smoke test: %d passed, %d failed (%d render frames ran clean).',
    pass, fail, frames);
  process.exit(fail ? 1 : 0);
}, 60);
