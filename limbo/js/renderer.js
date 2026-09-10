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

    // bonus-mode overlay state. When set, draw() renders the bonus scene
    // instead of the normal single readout; cleared when a bonus finishes.
    this.bonus = null;         // null | { mode, ...mode-specific fields }

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

    if (this.bonus && this.bonus.mode === 'tripleShot') this.drawTripleShot();
    else if (this.bonus && this.bonus.mode === 'rush') this.drawRush();
    else if (this.bonus && this.bonus.mode === 'jackpot') this.drawJackpot();
    else this.drawReadout();

    this.drawParticles();

    if (this.apex && this.phase === 'settled' && !this.bonus) this.drawApexBadge();
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

  /* =========================================================================
   * Bonus Buy playback — three distinct scenes over the SAME underlying
   * draws the engine already made (rec is a fully-resolved result; these
   * methods only decide how it's revealed on screen over time).
   * ========================================================================= */

  /* ---- TRIPLE SHOT: three lanes counting up side by side, simultaneously */
  P.playTripleShot = function (rec, opts) {
    opts = opts || {};
    var self = this;
    var turbo = !!opts.turbo;
    var maxResult = Math.max.apply(null, rec.shots.map(function (s) { return s.result; }));
    var span = Math.log10(Math.max(maxResult, 1.01));
    var duration = Math.max(500, Math.min(1800, 420 + span * 260)) * (turbo ? 0.45 : 1);
    var start = performance.now();

    this.bonus = {
      mode: 'tripleShot',
      lanes: rec.shots.map(function (s) { return { target: s.target, result: s.result, win: s.win, display: 1 }; }),
      hitsLabel: null,
      settled: false
    };
    this.phase = 'counting';

    return new Promise(function (resolve) {
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var e = easeOutQuad(t);
        self.bonus.lanes.forEach(function (lane) { lane.display = Math.pow(Math.max(lane.result, 1), e); });
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          self.bonus.lanes.forEach(function (lane) { lane.display = lane.result; });
          self.bonus.settled = true;
          self.phase = 'settled';
          var hits = rec.hits;
          self.bonus.hitsLabel = hits === 3 ? 'TRIPLE HIT' : hits === 2 ? 'DOUBLE HIT' : hits === 1 ? 'ONE HIT' : 'NO HITS';
          self.history.unshift({ value: maxResult, win: hits > 0 });
          if (self.history.length > CFG.history.size) self.history.length = CFG.history.size;
          if (self.sfx) { if (hits > 0) self.sfx.win(rec.totalPayoutX); else self.sfx.bust(); }
          if (hits > 0) self.burst(hits === 3);
          setTimeout(function () { self.bonus = null; resolve(); }, turbo ? 500 : 1100);
        }
      }
      requestAnimationFrame(frame);
    });
  };

  P.drawTripleShot = function () {
    var ctx = this.ctx, w = this.w, h = this.h, self = this;
    var b = this.bonus, lanes = b.lanes;
    var colW = w / lanes.length;
    var cy = h * 0.42;

    ctx.textAlign = 'center';
    ctx.font = '700 12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#7f8da0';
    ctx.fillText('TRIPLE SHOT', w / 2, h * 0.16 - 18);

    lanes.forEach(function (lane, i) {
      var cx = colW * i + colW / 2;
      var dim = b.settled && !lane.win;
      var color = b.settled ? (lane.win ? '#00e701' : '#ff4d4d') : '#ffffff';
      ctx.globalAlpha = dim ? 0.35 : 1;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 11px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = '#7f8da0';
      ctx.fillText('SHOT ' + (i + 1) + ' · target ' + self.fmtMult(lane.target), cx, cy - 56);

      var fontSize = Math.max(20, Math.min(38, colW * 0.16));
      ctx.font = '800 ' + fontSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.shadowColor = color;
      ctx.shadowBlur = b.settled ? 16 : 6;
      ctx.fillStyle = color;
      ctx.fillText(self.fmtMult(lane.display), cx, cy);
      ctx.shadowBlur = 0;

      if (b.settled) {
        ctx.font = '700 11px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(lane.win ? 'HIT' : 'MISS', cx, cy + fontSize * 0.6 + 14);
      }
      ctx.globalAlpha = 1;

      if (i > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.moveTo(colW * i, h * 0.16);
        ctx.lineTo(colW * i, h * 0.72);
        ctx.stroke();
      }
    });

    if (b.settled && b.hitsLabel) {
      ctx.textAlign = 'center';
      ctx.font = '800 17px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = '#ffc83d';
      ctx.fillText('★ ' + b.hitsLabel + ' ★', w / 2, h * 0.72);
    }
  };

  /* ---- RUSH MODE: a rapid-fire ticker of shots at one shared target ---- */
  P.playRush = function (rec, opts) {
    opts = opts || {};
    var self = this;
    var turbo = !!opts.turbo;
    var interval = (CFG.bonusModes.rush.shotIntervalMs || 170) * (turbo ? 0.4 : 1);

    this.bonus = {
      mode: 'rush',
      target: rec.shots.length ? rec.shots[0].target : 0,
      total: rec.shots.length,
      revealed: [],
      hits: 0,
      winX: 0,
      complete: false
    };
    this.phase = 'counting';

    return new Promise(function (resolve) {
      var i = 0;
      function revealNext() {
        if (i >= rec.shots.length) {
          self.bonus.complete = true;
          self.phase = 'settled';
          self.history.unshift({ value: self.bonus.target, win: self.bonus.hits > 0 });
          if (self.history.length > CFG.history.size) self.history.length = CFG.history.size;
          if (self.sfx) { if (self.bonus.hits > 0) self.sfx.win(rec.totalPayoutX); else self.sfx.bust(); }
          if (self.bonus.hits > 0) self.burst(self.bonus.hits >= rec.shots.length * 0.6);
          setTimeout(function () { self.bonus = null; resolve(); }, turbo ? 500 : 1000);
          return;
        }
        var shot = rec.shots[i];
        self.bonus.revealed.push(shot);
        if (shot.win) { self.bonus.hits++; self.bonus.winX += shot.payoutX; }
        if (self.sfx) self.sfx.tick(i / rec.shots.length);
        i++;
        setTimeout(revealNext, interval);
      }
      revealNext();
    });
  };

  P.drawRush = function () {
    var ctx = this.ctx, w = this.w, h = this.h, self = this;
    var b = this.bonus;
    ctx.textAlign = 'center';

    ctx.font = '700 12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#7f8da0';
    ctx.fillText('RUSH MODE · target ' + this.fmtMult(b.target), w / 2, h * 0.16);

    var rows = b.revealed.slice(-8);
    var rowW = Math.min(72, (w - 40) / Math.max(rows.length, 1));
    var startX = w / 2 - (rows.length * rowW) / 2 + rowW / 2;
    var cy = h * 0.4;
    rows.forEach(function (shot, i) {
      var x = startX + i * rowW;
      var isLast = i === rows.length - 1;
      var color = shot.win ? '#00e701' : '#ff4d4d';
      ctx.globalAlpha = isLast ? 1 : 0.5;
      ctx.font = (isLast ? '800 22px' : '700 14px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(self.fmtMult(shot.result), x, cy);
      ctx.globalAlpha = 1;
    });

    ctx.font = '700 13px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#b1bad3';
    ctx.fillText('SHOT ' + b.revealed.length + '/' + b.total + '   ·   HITS ' + b.hits +
      '   ·   WIN ' + this.fmtMult(b.winX), w / 2, cy + 44);

    if (b.complete) {
      ctx.font = '800 19px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = b.hits > 0 ? '#00e701' : '#ff4d4d';
      ctx.fillText('RUSH COMPLETE', w / 2, cy + 86);
      ctx.font = '700 12px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = '#7f8da0';
      ctx.fillText(b.total + ' shots · ' + b.hits + ' hits · total win ' + this.fmtMult(b.winX), w / 2, cy + 108);
    }
  };

  /* ---- JACKPOT SHOT: one draw, played out as a zone crawl ------------- */
  P.playJackpot = function (rec, opts) {
    opts = opts || {};
    var self = this;
    var turbo = !!opts.turbo;
    var m = CFG.bonusModes.jackpot;
    var animTarget = Math.min(rec.result, m.maxWin);
    var span = Math.log10(Math.max(animTarget, 1.01));
    var duration = Math.max(900, Math.min(3200, 700 + span * 420)) * (turbo ? 0.4 : 1);
    var start = performance.now();

    this.bonus = { mode: 'jackpot', minWin: m.minWin, maxWin: m.maxWin, display: 1, entered: false, settled: false };
    this.phase = 'counting';
    this.lastTickValue = 1;

    return new Promise(function (resolve) {
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var e = easeOutQuad(t);
        self.bonus.display = Math.pow(animTarget, e);
        if (!self.bonus.entered && self.bonus.display >= m.minWin) self.bonus.entered = true;
        if (self.bonus.display - self.lastTickValue > 0.2 || t >= 1) {
          self.lastTickValue = self.bonus.display;
          if (self.sfx) self.sfx.tick(t);
        }
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          self.bonus.display = animTarget;
          self.bonus.settled = true;
          self.bonus.hit = rec.hit;
          self.phase = 'settled';
          self.history.unshift({ value: rec.result, win: rec.hit });
          if (self.history.length > CFG.history.size) self.history.length = CFG.history.size;
          if (self.sfx) { if (rec.hit) self.sfx.win(rec.payoutX); else self.sfx.bust(); }
          if (rec.hit) self.burst(rec.payoutX >= m.maxWin * 0.1);
          setTimeout(function () { self.bonus = null; resolve(); }, turbo ? 500 : 1200);
        }
      }
      requestAnimationFrame(frame);
    });
  };

  P.drawJackpot = function () {
    var ctx = this.ctx, w = this.w, h = this.h, self = this;
    var b = this.bonus;

    var barX = 40, barW = w - 80, barY = h * 0.22, barH = 8;
    var lo = 0, hi = Math.log10(b.maxWin);
    function xFor(v) {
      var frac = (Math.log10(Math.max(v, 1)) - lo) / (hi - lo);
      return barX + Math.max(0, Math.min(1, frac)) * barW;
    }
    var boundaryX = xFor(b.minWin);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(barX, barY, boundaryX - barX, barH);
    var jg = ctx.createLinearGradient(boundaryX, 0, barX + barW, 0);
    jg.addColorStop(0, '#ffc83d');
    jg.addColorStop(1, '#ff7ad9');
    ctx.fillStyle = jg;
    ctx.fillRect(boundaryX, barY, barX + barW - boundaryX, barH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boundaryX, barY - 4); ctx.lineTo(boundaryX, barY + barH + 4);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = '700 10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#7f8da0';
    ctx.fillText('MISS ZONE', barX + (boundaryX - barX) / 2, barY - 12);
    ctx.fillStyle = '#ffc83d';
    ctx.fillText('JACKPOT ZONE', boundaryX + (barX + barW - boundaryX) / 2, barY - 12);

    var ticks = [b.minWin, 100, 1000, 10000, b.maxWin].filter(function (v, idx, arr) {
      return v >= b.minWin && v <= b.maxWin && arr.indexOf(v) === idx;
    });
    ticks.forEach(function (v) {
      var x = xFor(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(x, barY + barH); ctx.lineTo(x, barY + barH + 5); ctx.stroke();
      ctx.font = '600 9px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = '#7f8da0';
      ctx.fillText(self.fmtMult(v), x, barY + barH + 16);
    });

    var mx = xFor(b.display);
    ctx.fillStyle = b.entered ? '#ffc83d' : '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, barY + barH / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    var cy = h * 0.52;
    var color = b.settled ? (b.hit ? '#ffc83d' : '#ff4d4d') : (b.entered ? '#ffc83d' : '#ffffff');
    var fontSize = Math.max(28, Math.min(60, w * 0.1));
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + fontSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.shadowColor = color; ctx.shadowBlur = b.settled ? 26 : 10;
    ctx.fillStyle = color;
    ctx.fillText(this.fmtMult(b.display), w / 2, cy);
    ctx.shadowBlur = 0;

    ctx.font = '700 13px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;
    var label = b.settled
      ? (b.hit ? this.fmtMult(b.display) + ' JACKPOT SHOT' : 'JACKPOT MISSED')
      : (b.entered ? 'JACKPOT ZONE ENTERED' : 'approaching…');
    ctx.fillText(label, w / 2, cy + fontSize * 0.62 + 16);
  };

  g.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
