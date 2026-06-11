/* =========================================================================
 * CANDY SURGE 1000 — bootstrap
 *
 * Flow per round (mirrors an RGS round lifecycle):
 *   1. UI debits the wallet (bet authorization)
 *   2. Engine produces the complete result book (server-side role)
 *   3. Renderer replays the book (client presentation)
 *   4. UI credits the win (settlement / end round)
 * ========================================================================= */
(function () {
  'use strict';

  var engine = new window.GameEngine();
  var sfx = new window.AudioFx();
  var renderer = new window.Renderer(document.getElementById('game'), sfx);

  var ui = new window.UI({
    sfx: sfx,
    onSpin: function (mode) {
      var book = engine.playRound(mode);
      return renderer
        .playBook(book, {
          bet: ui.bet,
          turbo: ui.turbo,
          onWin: function (winX) { ui.win(winX * ui.bet); }
        })
        .then(function () { return book.totalWinX * ui.bet; });
    }
  });

  // First user interaction unlocks audio (browser autoplay policy)
  document.addEventListener('pointerdown', function once() {
    sfx.ensure();
    document.removeEventListener('pointerdown', once);
  });

  ui.message('Place your bet — press SPACE or hit Bet.');
})();
