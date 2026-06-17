/* =========================================================================
 * MEDBOT INVASION 1000 — bootstrap
 *
 * Round lifecycle (mirrors an RGS round):
 *   1. UI debits the wallet (bet authorization)
 *   2. Engine produces the complete result book (server-side role)
 *   3. Renderer replays the book with screen hooks (client presentation)
 *   4. UI credits the win (settlement / end round)
 * ========================================================================= */
(function () {
  'use strict';

  var CFG = window.GameConfig;
  var engine = new window.GameEngine();
  var sfx = new window.AudioFx();
  var renderer = new window.Renderer(document.getElementById('game'), sfx);

  var ui; // forward ref for turbo lookup
  var screens = new window.Screens({
    sfx: sfx,
    turbo: function () { return ui ? ui.turbo : false; },
    fmt: function (xBet) {
      // banner amounts arrive in bet multiples → convert to currency
      var v = xBet * (ui ? ui.bet : 1);
      return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  });

  function featureLabel(book) {
    var fs = false, scan = false;
    for (var i = 0; i < book.events.length; i++) {
      if (book.events[i].type === 'fsTrigger') fs = true;
      if (book.events[i].type === 'scannerBeam') scan = true;
    }
    if (book.mode !== 'base') return CFG.betModes[book.mode].label;
    if (fs) return 'Free Spins';
    if (scan) return 'Scanner Beam';
    return 'Base Game';
  }

  ui = new window.UI({
    sfx: sfx,
    screens: screens,
    onSpin: function (mode) {
      var book = engine.playRound(mode);
      return renderer.playBook(book, {
        bet: ui.bet,
        turbo: ui.turbo,
        currency: '$',
        hooks: screens.hooks(),
        onWin: function (winX) { ui.win(winX * ui.bet); }
      }).then(function () {
        return { win: book.totalWinX * ui.bet, feature: featureLabel(book) };
      });
    }
  });

  // lobby → loading → game
  document.getElementById('lobbyPlay').addEventListener('click', function () {
    sfx.ensure(); sfx.click();
    screens.runLoading(function () {
      ui.message('Place your bet — press SPACE or hit SPIN.');
    });
  });

  // first interaction unlocks audio (browser autoplay policy)
  document.addEventListener('pointerdown', function once() {
    sfx.ensure(); document.removeEventListener('pointerdown', once);
  });

  screens.show('lobby');

  // debug/test handles (used by tools/browser_test.js)
  window.__mb = { engine: engine, renderer: renderer, screens: screens, ui: ui };
  window.__mb_screens = screens;
  window.__mb_ui = ui;
})();
