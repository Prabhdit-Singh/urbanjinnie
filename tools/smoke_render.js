/* Headless smoke test: stubs the DOM/canvas APIs and replays real engine
 * books through the renderer to catch runtime errors in playback paths.
 * Usage: node tools/smoke_render.js */
'use strict';

/* ---- minimal browser stubs -------------------------------------------- */
function fakeGradient() { return { addColorStop: function () {} }; }

function fakeCtx() {
  return new Proxy({}, {
    get: function (t, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
        return fakeGradient;
      if (prop === 'measureText') return function () { return { width: 42 }; };
      if (prop === 'canvas') return {};
      if (typeof t[prop] !== 'undefined') return t[prop];
      return function () {};
    },
    set: function (t, prop, v) { t[prop] = v; return true; }
  });
}

function fakeCanvas() {
  return {
    width: 0, height: 0, style: {},
    getContext: function () { return fakeCtx(); },
    addEventListener: function () {},
    parentElement: { getBoundingClientRect: function () { return { width: 900, height: 600 }; } }
  };
}

globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.document = {
  createElement: function () { return fakeCanvas(); },
  getElementById: function () { return fakeCanvas(); },
  addEventListener: function () {},
  removeEventListener: function () {},
  querySelectorAll: function () { return []; },
  querySelector: function () { return null; },
  body: { classList: { toggle: function () {} } }
};
globalThis.addEventListener = function () {};
globalThis.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 4); };

require('../js/config.js');
require('../js/engine.js');
require('../js/symbols.js');
require('../js/audio.js');
require('../js/renderer.js');

var engine = new globalThis.GameEngine(424242);
var sfx = new globalThis.AudioFx();
sfx.enabled = false;

var renderer = new globalThis.Renderer(document.getElementById('game'), sfx);

// Make all animation primitives instant so books replay fast
renderer.instant = true;   // physics falls complete immediately
renderer.wait = function () { return Promise.resolve(); };
renderer.bigWinSplash = function () { return Promise.resolve(); };

var modes = ['base', 'base', 'ante', 'buy', 'superbuy'];

(async function () {
  var played = 0, withFs = 0;
  for (var i = 0; i < 400; i++) {
    var mode = modes[i % modes.length];
    var book = engine.playRound(mode);
    if (book.events.some(function (e) { return e.type === 'fsTrigger'; })) withFs++;
    await renderer.playBook(book, { bet: 1, turbo: true, onWin: function () {} });
    played++;
  }
  // let a few draw frames run with live state
  await new Promise(function (r) { setTimeout(r, 120); });
  console.log('Replayed %d books (%d with free spins) through the renderer — no errors.', played, withFs);
  process.exit(0);
})().catch(function (err) {
  console.error('SMOKE TEST FAILED:', err);
  process.exit(1);
});
