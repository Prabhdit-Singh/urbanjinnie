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
  var CFG = window.GameConfig;

  var ui = new window.UI({
    sfx: sfx,
    engine: engine,
    onBet: function (target, clientSeed, turbo) {
      var rec = engine.playBet(clientSeed, target);
      return renderer.playResult(rec, { turbo: turbo }).then(function () {
        return { win: rec.win, result: rec.result, payout: rec.win ? ui.bet * rec.target : 0 };
      });
    },
    onBonus: function (mode, target, clientSeed, turbo) {
      if (mode === 'rush') {
        var rushCfg = CFG.bonusModes.rush;
        var rushRec = engine.playRush(clientSeed, target, rushCfg.shots);
        return renderer.playRush(rushRec, { turbo: turbo }).then(function () {
          var payout = rushRec.totalPayoutX * ui.bet;
          return {
            payout: payout,
            summary: 'Rush complete — ' + rushRec.hits + '/' + rushRec.shots.length +
              ' hits, ' + (payout > 0 ? 'won ' + ui.fmt(payout) + '!' : 'no hits, try again.')
          };
        });
      }
      if (mode === 'tripleShot') {
        var lanes = CFG.tripleShotLanes();
        var tripleRec = engine.playTripleShot(clientSeed, lanes);
        return renderer.playTripleShot(tripleRec, { turbo: turbo }).then(function () {
          var payout = tripleRec.totalPayoutX * ui.bet;
          return {
            payout: payout,
            summary: 'Triple Shot — ' + tripleRec.hits + ' hit(s), ' +
              (payout > 0 ? 'won ' + ui.fmt(payout) + '!' : 'no hits, try again.')
          };
        });
      }
      if (mode === 'jackpot') {
        var jCfg = CFG.bonusModes.jackpot;
        var jackpotRec = engine.playJackpot(clientSeed, jCfg.minWin, jCfg.maxWin);
        return renderer.playJackpot(jackpotRec, { turbo: turbo }).then(function () {
          var payout = jackpotRec.payoutX * ui.bet;
          return {
            payout: payout,
            summary: jackpotRec.hit
              ? 'JACKPOT! ' + jackpotRec.result.toFixed(2) + '× — won ' + ui.fmt(payout) + '!'
              : 'Jackpot missed — the draw never entered the zone.'
          };
        });
      }
      return Promise.resolve({ payout: 0, summary: 'Unknown bonus mode.' });
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
