/* =========================================================================
 * MEDBOT INVASION 1000 — Screen / state manager
 *
 * Owns navigation between the master-sheet screens (lobby → loading → game),
 * the modal overlays (bonus menu, confirm, info/paytable, settings, history,
 * exit, thanks) and the celebratory banners used during book playback
 * (Scatter Trigger, Free Spins start, Nice/Big/Mega win, bonus complete,
 * Max win, Scanner Beam). The renderer calls these as async hooks so the
 * full-screen moments pace the gameplay.
 * ========================================================================= */
(function (g) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }

  function Screens(opts) {
    this.sfx = opts.sfx;
    this.fmt = opts.fmt;                 // function(betMultiples) -> currency string (already × bet)
    this.turbo = function () { return opts.turbo(); };
    this.bindNav();
  }

  var P = Screens.prototype;

  /* ---- top-level screens ---- */
  P.show = function (name) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    this.current = name;
    if (name === 'game') {
      // the canvas was hidden (0x0) until now — recompute renderer layout
      requestAnimationFrame(function () {
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
      });
    }
  };

  P.openOverlay = function (id) { this.sfx.click(); $(id).classList.add('open'); };
  P.closeOverlay = function (id) { $(id).classList.remove('open'); };
  P.anyOverlayOpen = function () { return !!qs('.overlay.open') || $('banner').classList.contains('open'); };

  P.bindNav = function () {
    var self = this;
    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { self.closeOverlay(b.dataset.close); self.sfx.click(); });
    });
    document.querySelectorAll('.overlay').forEach(function (o) {
      o.addEventListener('click', function (e) { if (e.target === o) o.classList.remove('open'); });
    });
  };

  /* ---- loading sequence (screen 3) ---- */
  P.runLoading = function (onDone) {
    var self = this;
    this.show('loading');
    var pct = 0, fill = $('loadFill'), label = $('loadPct');
    var iv = setInterval(function () {
      pct += 4 + Math.random() * 11;
      if (pct >= 100) { pct = 100; clearInterval(iv); }
      fill.style.width = pct + '%';
      label.textContent = 'Loading… ' + Math.floor(pct) + '%';
      if (pct >= 100) setTimeout(function () { self.show('game'); onDone && onDone(); }, 350);
    }, 120);
  };

  /* ---- celebratory banner helper ---- */
  P.banner = function (kind, title, amount, sub, ms) {
    var self = this;
    var b = $('banner');
    b.className = 'banner open ' + kind;
    $('bannerTitle').textContent = title;
    $('bannerSub').textContent = sub || '';
    var amtEl = $('bannerAmt');
    var dur = ms / (this.turbo() ? 2.2 : 1);
    return new Promise(function (res) {
      if (amount == null) {
        amtEl.style.display = 'none';
        finish();
      } else {
        amtEl.style.display = '';
        // count up
        var t0 = performance.now(), countDur = Math.min(dur * 0.7, 2200);
        (function step(t) {
          var k = Math.min(1, (t - t0) / countDur);
          var v = amount * (1 - Math.pow(1 - k, 3));
          amtEl.textContent = self.fmt(v);
          if (k < 1) requestAnimationFrame(step); else { /* keep final */ }
        })(performance.now());
        finish();
      }
      function finish() {
        var skipped = false;
        function close() { if (skipped) return; skipped = true; b.classList.remove('open'); b.removeEventListener('click', close); res(); }
        b.addEventListener('click', close);
        setTimeout(close, dur);
      }
    });
  };

  /* ======================================================================
   * Playback hooks (called by renderer.playBook)
   * ==================================================================== */
  P.hooks = function () {
    var self = this;
    return {
      // Screen 14 — Scatter Trigger
      scatterTrigger: function (count, spins) {
        self.sfx.scatter();
        return self.banner('scatter', count + ' LAB PORTALS', null, 'TRIGGERS FREE SPINS!', 1800);
      },
      // Screen 15 — Free Spins start
      fsStart: function (spins, mode) {
        return self.banner('fsstart', 'YOU WON', null, spins + ' FREE SPINS — ALL WINS MULTIPLIED', 2200)
          .then(function () { $('bannerSub').textContent = ''; });
      },
      // Screens 11 / 17 / 18 — in-feature flashes
      feature: function (name) {
        if (name === 'scanner') {
          self.sfx.scanner();
          return self.banner('scatter', 'SCANNER BEAM', null, 'RANDOM SYMBOLS TURN WILD!', 1500);
        }
        return Promise.resolve();
      },
      // Screen 20 — bonus complete
      fsComplete: function (totalWinX, spins) {
        self.sfx.bigWin();
        return self.banner('fscomplete', 'BONUS COMPLETE', totalWinX, 'TOTAL WIN', 3200);
      },
      // Screens 13 / 19 / 20 — win tiers (after the round)
      winTier: function (x) {
        if (x < 5) return Promise.resolve();            // small wins: no banner
        var kind, title, sub;
        if (x >= 1000)      { kind = 'fscomplete'; title = 'EPIC WIN';  sub = 'MULTIPLIER ×' + Math.round(x); }
        else if (x >= 200)  { kind = 'mega';       title = 'MEGA WIN';  sub = 'MULTIPLIER ×' + Math.round(x); }
        else if (x >= 50)   { kind = 'big';        title = 'BIG WIN';   sub = 'MULTIPLIER ×' + Math.round(x); }
        else                { kind = 'nice';       title = 'NICE WIN';  sub = ''; }
        self.sfx.bigWin();
        return self.banner(kind, title, x, sub, x >= 200 ? 3400 : 2400);
      },
      // Max win cap
      maxWin: function (x) {
        return self.banner('mega', 'MAX WIN!', x, '5000× CAP REACHED', 3600);
      }
    };
  };

  g.Screens = Screens;
})(typeof window !== 'undefined' ? window : globalThis);
