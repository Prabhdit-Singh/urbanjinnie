/* =========================================================================
 * APEX LIMBO — Renderer
 *
 * Pure playback layer: given a bet result from the engine, animates the
 * multiplier counting up from 1.00x to the result and reports back whether
 * it cleared the player's target. Never computes outcomes.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;

  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

  function chipColor(m) {
    if (m >= 100) return '#ffc83d';
    if (m >= 10) return '#ff7ad9';
    if (m >= 2) return '#00e701';
    return '#8aa1b8';
  }

  function Renderer(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;

    this.history = [];         // newest first: {value, win}
    this.particles = [];
    this.phase = 'idle';       // idle | counting | settled
    this.display = 1;
    this.target = CFG.target.default;
    this.finalValue = 1;
    this.win = false;
    this.flash = 0;            // 0..1 win/bust flash intensity
    this.flashColor = '#00e701';
    this.apex = false;
    this.time = 0;
    this.lastTickValue = 1;

    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });

    var loop = function (t) {
      self.time = t / 1000;
      self.step();
      self.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  var P = Renderer.prototype;

  P.resize = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, rect.width);
    this.h = Math.max(280, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  P.setTarget = function (t) { this.target = t; };

  /* ---- play one bet's animation, resolve with nothing meaningful; the --
   * caller already knows win/payout from the engine result. */
  P.playResult = function (rec, opts) {
    opts = opts || {};
    var self = this;
    this.phase = 'counting';
    this.win = rec.win;
    this.target = rec.target;
    this.finalValue = rec.result;
    this.display = 1;
    this.lastTickValue = 1;
    this.apex = rec.win && rec.result >= rec.target * CFG.apexWinFactor;

    var turbo = !!opts.turbo;
    var span = Math.log10(Math.max(rec.result, 1.01));
    var duration = Math.max(260, Math.min(1500, 320 + span * 260)) * (turbo ? 0.4 : 1);
    var start = performance.now();

    return new Promise(function (resolve) {
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var e = easeOutQuad(t);
        // exponential interpolation: 1 * finalValue^e feels natural for a
        // multiplier that can range from 1.01x to 1,000,000x
        self.display = Math.pow(rec.result, e);
        if (self.display - self.lastTickValue > 0.15 || t >= 1) {
          self.lastTickValue = self.display;
          if (self.sfx) self.sfx.tick(t);
        }
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          self.display = rec.result;
          self.phase = 'settled';
          self.flash = 1;
          self.flashColor = rec.win ? '#00e701' : '#ff4d4d';
          self.history.unshift({ value: rec.result, win: rec.win });
          if (self.history.length > CFG.history.size) self.history.length = CFG.history.size;
          if (self.sfx) rec.win ? self.sfx.win(rec.result) : self.sfx.bust();
          if (rec.win) self.burst(self.apex);
          setTimeout(resolve, turbo ? 120 : 320);
        }
      }
      requestAnimationFrame(frame);
    });
  };

  P.burst = function (big) {
    var n = big ? 60 : 26;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var sp = (big ? 2.2 : 1.3) + Math.random() * (big ? 3.5 : 2);
      this.particles.push({
        x: this.w / 2, y: this.h * 0.42,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 1, hue: big ? (30 + Math.random() * 30) : (100 + Math.random() * 60)
      });
    }
  };

  P.step = function () {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.02);
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life -= 0.018;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  };

  /* ---- drawing ------------------------------------------------------------ */
  P.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h;
    ctx.clearRect(0, 0, w, h);

    // background wash
    var g0 = ctx.createLinearGradient(0, 0, 0, h);
    g0.addColorStop(0, '#0f212e');
    g0.addColorStop(1, '#0a161f');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, w, h);

    // slow radiating "apex" chevrons behind the readout
    ctx.save();
    ctx.translate(w / 2, h * 0.42);
    ctx.globalAlpha = 0.05;
    for (var i = 0; i < 5; i++) {
      var r = ((this.time * 40 + i * 90) % 450);
      ctx.strokeStyle = this.win === false && this.phase === 'settled' ? '#ff4d4d' : '#00e701';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * 0.55);
      ctx.lineTo(0, r * 0.15);
      ctx.lineTo(r * 0.6, r * 0.55);
      ctx.stroke();
    }
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flash * 0.12;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    this.drawHistory();
    this.drawReadout();
    this.drawParticles();

    if (this.apex && this.phase === 'settled') this.drawApexBadge();
  };

  P.drawHistory = function () {
    var ctx = this.ctx, pad = 12, chipW = 64, chipH = 26, gap = 8;
    var n = Math.min(this.history.length, Math.floor((this.w - pad * 2) / (chipW + gap)));
    for (var i = 0; i < n; i++) {
      var item = this.history[i];
      var x = this.w - pad - (i + 1) * (chipW + gap) + gap;
      var y = pad;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, chipW, chipH, 6) : ctx.rect(x, y, chipW, chipH);
      ctx.fill();
      ctx.fillStyle = chipColor(item.value);
      ctx.font = '700 12px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var label = item.value >= 1000 ? Math.round(item.value) + 'x' : item.value.toFixed(2) + 'x';
      ctx.fillText(label, x + chipW / 2, y + chipH / 2 + 1);
    }
  };

  P.fmtMult = function (v) {
    if (v >= 100000) return (v / 1000).toFixed(0) + 'k×';
    if (v >= 1000) return v.toFixed(0) + '×';
    return v.toFixed(2) + '×';
  };

  P.drawReadout = function () {
    var ctx = this.ctx, cx = this.w / 2, cy = this.h * 0.42;

    var color = this.phase === 'settled' ? (this.win ? '#00e701' : '#ff4d4d') : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var fontSize = Math.max(34, Math.min(76, this.w * 0.11));
    ctx.font = '800 ' + fontSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.shadowColor = color;
    ctx.shadowBlur = this.phase === 'settled' ? 24 : 10;
    ctx.fillStyle = color;
    ctx.fillText(this.fmtMult(this.display), cx, cy);
    ctx.shadowBlur = 0;

    ctx.font = '600 13px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#7f8da0';
    var sub = this.phase === 'settled'
      ? (this.win ? 'WIN · target was ' + this.fmtMult(this.target) : 'BUST · target was ' + this.fmtMult(this.target))
      : 'Target ' + this.fmtMult(this.target);
    ctx.fillText(sub, cx, cy + fontSize * 0.62 + 14);
  };

  P.drawParticles = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = 'hsl(' + p.hue + ', 90%, 60%)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  P.drawApexBadge = function () {
    var ctx = this.ctx, cx = this.w / 2, y = this.h * 0.42 - 70;
    ctx.font = '800 15px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#ffc83d';
    ctx.textAlign = 'center';
    ctx.fillText('★ APEX WIN ★', cx, y);
  };

  g.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
