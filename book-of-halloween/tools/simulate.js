/* Full RTP simulator for Book of Halloween (base game + free spins bonus).
 * Mirrors the payout accounting in game.js onAllStopped(), headless.
 * Usage: node book-of-halloween/tools/simulate.js [rounds]
 */
'use strict';

/* ---- DOM stubs so the page modules load in Node ---------------------- */
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
globalThis.performance = { now: function () { return 0; } };
globalThis.requestAnimationFrame = function () { return 0; };
function cl() { return { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }; }
function el() {
  return { style: {}, classList: cl(), value: '', textContent: '', innerHTML: '', disabled: false,
    getContext: function () { return new Proxy({}, { get: function (t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
      return typeof t[p] !== 'undefined' ? t[p] : function () {}; }, set: function (t, p, v) { t[p] = v; return true; } }); },
    appendChild: function () {}, addEventListener: function () {} };
}
var reg = {};
globalThis.document = { readyState: 'complete', createElement: el, getElementById: function (id) { return reg[id] || (reg[id] = el()); }, addEventListener: function () {} };

var base = __dirname + '/../js/';
require(base + 'config.js'); require(base + 'art.js'); require(base + 'audio.js');
globalThis.BOH_Audio.setEnabled(false);
require(base + 'game.js');

var CFG = globalThis.BOH_Config, G = globalThis.BOH_Game, S = G.state;
var COLS = CFG.grid.cols;

/* ---- optional tuning overrides (env) for fast sweeps ----------------- */
if (process.env.BOOKW) {
  CFG.weights.base.book = parseFloat(process.env.BOOKW);
  CFG.weights.fs.book = parseFloat(process.env.BOOKW) * 1.3;
}
if (process.env.PAYMULT) {
  var m = parseFloat(process.env.PAYMULT);
  for (var k in CFG.paytable) CFG.paytable[k] = CFG.paytable[k].map(function (v) { return v * m; });
}
if (process.env.SCATMULT) {
  var sm = parseFloat(process.env.SCATMULT);
  for (var bk in CFG.bookScatterPays) CFG.bookScatterPays[bk] *= sm;
}

function spinGrid(which) {
  var g = [];
  for (var c = 0; c < COLS; c++) g[c] = G.drawColumn(CFG.weights[which]);
  return g;
}

function playRound(bet, cap) {
  // base spin
  S.fs.active = false; S.fs.special = null;
  var g = spinGrid('base');
  var r = G.evaluate(g);
  var win = r.total;
  if (win > cap) return Math.min(win, cap);

  // free spins trigger
  if (r.bookCount >= CFG.freeSpins.trigger) {
    S.fs.active = true;
    S.fs.special = CFG.expandableIds[Math.floor(Math.random() * CFG.expandableIds.length)];
    var remaining = CFG.freeSpins.award;
    while (remaining > 0 && win < cap) {
      remaining--;
      var fg = spinGrid('fs');
      var fr = G.evaluate(fg);
      win += fr.total;
      if (CFG.freeSpins.retrigger && fr.bookCount >= CFG.freeSpins.trigger) remaining += CFG.freeSpins.award;
    }
    S.fs.active = false; S.fs.special = null;
  }
  return Math.min(win, cap);
}

var N = parseInt(process.argv[2], 10) || 200000;
S.betIndex = 3;
var bet = G.bet(), cap = CFG.maxWinX * bet;
var wager = 0, won = 0, triggers = 0, hits = 0, baseHits = 0, maxSeen = 0;

for (var i = 0; i < N; i++) {
  // peek trigger by replaying base separately would double-draw; instead track inside:
  S.fs.active = false; S.fs.special = null;
  var g = spinGrid('base');
  var r = G.evaluate(g);
  var w = r.total;
  if (r.total > 0) baseHits++;
  var triggered = r.bookCount >= CFG.freeSpins.trigger;
  if (triggered) {
    triggers++;
    S.fs.active = true;
    S.fs.special = CFG.expandableIds[Math.floor(Math.random() * CFG.expandableIds.length)];
    var remaining = CFG.freeSpins.award;
    while (remaining > 0 && w < cap) {
      remaining--;
      var fr = G.evaluate(spinGrid('fs'));
      w += fr.total;
      if (CFG.freeSpins.retrigger && fr.bookCount >= CFG.freeSpins.trigger) remaining += CFG.freeSpins.award;
    }
    S.fs.active = false; S.fs.special = null;
  }
  w = Math.min(w, cap);
  wager += bet; won += w;
  if (w > 0) hits++;
  if (w / bet > maxSeen) maxSeen = w / bet;
}

console.log('Book of Halloween — %d rounds @ %s bet', N, bet.toFixed(2));
console.log('  RTP                : %s%%', (100 * won / wager).toFixed(1));
console.log('  Hit rate (any win) : %s%%', (100 * hits / N).toFixed(1));
console.log('  Base-line hit rate : %s%%', (100 * baseHits / N).toFixed(1));
console.log('  Free spins trigger : 1 in %d', Math.round(N / triggers));
console.log('  Largest win seen   : %sx bet', maxSeen.toFixed(0));
