/* =========================================================================
 * APEX LIMBO — bootstrap
 *
 * Flow per bet:
 *   1. UI debits the wallet
 *   2. Engine derives the provably-fair result (server-side role)
 *   3. Renderer animates the count-up to that result (client presentation)
 *   4. UI credits the payout (settlement)
 * ========================================================================= */
(function () {
  'use strict';

  var engine = new window.GameEngine();
  var sfx = new window.AudioFx();
  var renderer = new window.Renderer(document.getElementById('game'), sfx);

  var ui = new window.UI({
    sfx: sfx,
    engine: engine,
    onBet: function (target, clientSeed, turbo) {
      var rec = engine.playBet(clientSeed, target);
      return renderer.playResult(rec, { turbo: turbo }).then(function () {
        return { win: rec.win, result: rec.result, payout: rec.win ? ui.bet * rec.target : 0 };
      });
    }
  });
  renderer.setTarget(ui.target);
  ui.renderer = renderer;

  document.addEventListener('pointerdown', function once() {
    sfx.ensure();
    document.removeEventListener('pointerdown', once);
  });

  ui.message('Set a target and press Bet — or hit SPACE.');
})();
