/* =========================================================================
 * APEX LIMBO — FRONT END (presentation only)
 *
 * Everything in this file only plays back or collects input — it never
 * decides a bet's outcome or payout (that's js/math.js). Loaded after
 * js/math.js, in this order:
 *
 *   1. loading screen   — video-driven progress bar
 *   2. AudioFx          — WebAudio-synthesized SFX
 *   3. Renderer         — canvas playback of a result already computed by GameEngine
 *   4. UI               — casino shell: wallet, bet panel, autoplay, bonus buy modal, fairness panel
 *   5. bootstrap         — wires GameEngine + Renderer + UI together
 * ========================================================================= */

/* =========================================================================
 * APEX LIMBO — loading screen
 *
 * The progress bar is driven directly by the loading video's own playback
 * position (currentTime / duration), so the bar and the video are literally
 * the same timeline. Falls back to a fixed timed progress if the video
 * can't play at all (autoplay blocked, unsupported format, network error),
 * and a hard ceiling timeout guarantees the loading screen always dismisses
 * — a decorative loading screen must never be able to trap the player.
 * ========================================================================= */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var overlay = $('loadingScreen');
  var video = overlay ? overlay.querySelector('.loading-video') : null;
  var fill = $('loadingBarFill');
  var pct = $('loadingPct');
  if (!overlay || !video || !fill || !pct) return;

  var done = false;
  var fallbackRaf = null;

  function setProgress(p) {
    p = Math.max(0, Math.min(100, p));
    fill.style.width = p + '%';
    pct.textContent = Math.round(p) + '%';
  }

  function dismiss() {
    if (done) return;
    done = true;
    if (fallbackRaf) cancelAnimationFrame(fallbackRaf);
    setProgress(100);
    overlay.classList.add('loading-done');
    setTimeout(function () { overlay.style.display = 'none'; }, 500);
  }

  function fallbackTimedProgress() {
    if (done || fallbackRaf) return;
    var start = performance.now(), fallbackDuration = 2500;
    function step(now) {
      if (done) return;
      var p = ((now - start) / fallbackDuration) * 100;
      setProgress(p);
      if (p >= 100) { dismiss(); return; }
      fallbackRaf = requestAnimationFrame(step);
    }
    fallbackRaf = requestAnimationFrame(step);
  }

  video.addEventListener('timeupdate', function () {
    if (done || fallbackRaf || !video.duration || isNaN(video.duration)) return;
    setProgress((video.currentTime / video.duration) * 100);
  });
  video.addEventListener('ended', dismiss);
  video.addEventListener('error', fallbackTimedProgress);
  video.addEventListener('stalled', fallbackTimedProgress);

  var playPromise = video.play();
  if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(fallbackTimedProgress);

  // Absolute ceiling — whatever went wrong, never leave the player stuck.
  setTimeout(function () { if (!done) dismiss(); }, 12000);
})();


/* =========================================================================
 * APEX LIMBO — Audio (WebAudio synthesis, no audio assets)
 * ========================================================================= */
(function (g) {
  'use strict';

  function AudioFx() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  var P = AudioFx.prototype;

  P.ensure = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  };

  P.setEnabled = function (on) { this.enabled = on; };

  P.tone = function (opts) {
    if (!this.enabled || !this.ctx) return;
    var c = this.ctx, t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + (opts.dur || 0.15));
    var vol = opts.vol == null ? 0.5 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.15));
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + (opts.dur || 0.15) + 0.05);
  };

  P.noise = function (opts) {
    if (!this.enabled || !this.ctx) return;
    var c = this.ctx, t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.2;
    var buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.slide) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slide), t0 + dur);
    var gain = c.createGain();
    var vol = opts.vol == null ? 0.3 : opts.vol;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start(t0);
  };

  /* ---- game events ------------------------------------------------------ */
  P.click = function () { this.tone({ type: 'triangle', freq: 660, dur: 0.06, vol: 0.25 }); };

  // Rising tick while the counter climbs — pitch tracks progress (0..1).
  P.tick = function (progress) {
    var f = 480 + progress * 900;
    this.tone({ type: 'square', freq: f, dur: 0.035, vol: 0.08 });
  };

  P.win = function (payoutX) {
    var base = 523.25 * Math.pow(1.05, Math.min(Math.log2(Math.max(payoutX, 1)) * 3, 16));
    var steps = [1, 1.25, 1.5, 2];
    for (var i = 0; i < steps.length; i++)
      this.tone({ type: 'triangle', freq: base * steps[i], dur: 0.2, vol: 0.22, delay: i * 0.05 });
    if (payoutX >= CFGApexWinFactor()) {
      this.noise({ freq: 2500, slide: 6000, dur: 0.5, vol: 0.1, filter: 'highpass' });
    }
  };

  function CFGApexWinFactor() {
    return (g.GameConfig && g.GameConfig.apexWinFactor) || 5;
  }

  P.bust = function () {
    this.tone({ type: 'sawtooth', freq: 220, slide: 60, dur: 0.28, vol: 0.2 });
    this.noise({ freq: 400, slide: 90, dur: 0.25, vol: 0.15, filter: 'lowpass' });
  };

  P.autoToggle = function (on) {
    this.tone({ type: 'sine', freq: on ? 880 : 440, dur: 0.1, vol: 0.2 });
  };

  g.AudioFx = AudioFx;
})(typeof window !== 'undefined' ? window : globalThis);


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

  /* ---- TRIPLE SHOT: ONE flight, THREE escalating gates on one track ----
   * The result is already fixed (rec.result / rec.gates / rec.crossed all
   * came from the engine); this only reveals it — the count-up crossing a
   * gate in real time is what the result already determined, not a fake
   * near-miss the renderer is manufacturing. */
  P.playTripleShot = function (rec, opts) {
    opts = opts || {};
    var self = this;
    var turbo = !!opts.turbo;
    var axisMax = Math.max(rec.gates[2] * 10, rec.result * 1.05, 10);
    var animTarget = Math.min(Math.max(rec.result, 1), axisMax);
    var span = Math.log10(Math.max(animTarget, 1.01));
    var duration = Math.max(900, Math.min(3200, 700 + span * 340)) * (turbo ? 0.4 : 1);
    var start = performance.now();

    this.bonus = {
      mode: 'tripleShot', gates: rec.gates, axisMax: axisMax,
      display: 1, crossedNow: [false, false, false], crossFlash: [0, 0, 0],
      settled: false
    };
    this.phase = 'counting';
    this.lastTickValue = 1;

    return new Promise(function (resolve) {
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var e = easeOutQuad(t);
        var b = self.bonus;
        b.display = Math.pow(animTarget, e);
        rec.gates.forEach(function (g, i) {
          if (!b.crossedNow[i] && b.display >= g) { b.crossedNow[i] = true; b.crossFlash[i] = 1; if (self.sfx) self.sfx.win(g); }
        });
        b.crossFlash = b.crossFlash.map(function (v) { return Math.max(0, v - 0.022); });
        if (b.display - self.lastTickValue > 0.2 || t >= 1) {
          self.lastTickValue = b.display;
          if (self.sfx) self.sfx.tick(t);
        }
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          b.display = rec.result;
          b.crossedNow = rec.crossed.slice();
          b.settled = true;
          self.phase = 'settled';
          self.history.unshift({ value: rec.result, win: rec.hits > 0 });
          if (self.history.length > CFG.history.size) self.history.length = CFG.history.size;
          if (self.sfx) { if (rec.hits > 0) self.sfx.win(rec.totalPayoutX); else self.sfx.bust(); }
          if (rec.hits === 3) self.burst(true); else if (rec.hits > 0) self.burst(false);
          setTimeout(function () { self.bonus = null; resolve(); }, turbo ? 500 : 1300);
        }
      }
      requestAnimationFrame(frame);
    });
  };

  P.drawTripleShot = function () {
    var ctx = this.ctx, w = this.w, h = this.h, self = this;
    var b = this.bonus, gates = b.gates;

    var barX = 40, barW = w - 80, barY = h * 0.24, barH = 6;
    var lo = 0, hi = Math.log10(b.axisMax);
    function xFor(v) {
      var frac = (Math.log10(Math.max(v, 1)) - lo) / (hi - lo);
      return barX + Math.max(0, Math.min(1, frac)) * barW;
    }

    ctx.textAlign = 'center';
    ctx.font = '700 12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#7f8da0';
    ctx.fillText('TRIPLE SHOT', w / 2, h * 0.1);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(barX, barY, barW, barH);
    var fillX = xFor(b.display);
    var trackGrad = ctx.createLinearGradient(barX, 0, Math.max(fillX, barX + 1), 0);
    trackGrad.addColorStop(0, '#00e701');
    trackGrad.addColorStop(1, '#ffc83d');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(barX, barY, Math.max(0, fillX - barX), barH);

    var gateLabels = ['SHOT I', 'SHOT II', 'SHOT III'];
    gates.forEach(function (g, i) {
      var x = xFor(g);
      var crossed = b.crossedNow[i];
      ctx.strokeStyle = crossed ? '#ffc83d' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, barY - 6); ctx.lineTo(x, barY + barH + 6); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '700 9px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = crossed ? '#ffc83d' : '#7f8da0';
      ctx.fillText(gateLabels[i] + ' · ' + self.fmtMult(g), x, barY - 16);

      if (b.crossFlash[i] > 0) {
        ctx.globalAlpha = b.crossFlash[i];
        ctx.font = '800 12px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillStyle = '#ffc83d';
        ctx.fillText('+' + self.fmtMult(g) + ' BANKED', x, barY - 32);
        ctx.globalAlpha = 1;
      }
    });

    var mx = xFor(b.display);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(mx, barY + barH / 2, 6, 0, Math.PI * 2); ctx.fill();

    var runningTotal = gates.reduce(function (sum, g, i) { return sum + (b.crossedNow[i] ? g : 0); }, 0);

    var cy = h * 0.55;
    var color = b.settled ? (b.crossedNow[2] ? '#ffc83d' : (runningTotal > 0 ? '#00e701' : '#ff4d4d')) : '#ffffff';
    var fontSize = Math.max(26, Math.min(56, w * 0.09));
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + fontSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.shadowColor = color; ctx.shadowBlur = b.settled ? 24 : 10;
    ctx.fillStyle = color;
    ctx.fillText(this.fmtMult(b.display), w / 2, cy);
    ctx.shadowBlur = 0;

    ctx.font = '700 13px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText('TOTAL ' + this.fmtMult(runningTotal), w / 2, cy + fontSize * 0.62 + 16);

    if (b.settled && b.crossedNow[2]) {
      ctx.font = '800 17px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = '#ffc83d';
      ctx.fillText('★ TRIPLE HIT ★', w / 2, cy + fontSize * 0.62 + 42);
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


/* =========================================================================
 * APEX LIMBO — UI layer
 *
 * Casino-shell controls: demo wallet, bet panel (manual/auto with bet
 * adjustment + stop conditions), target/chance linkage, provably-fair panel,
 * info modal, turbo & sound. Talks to main.js through callbacks; never
 * touches game math directly (it only reads GameEngine.computeResult for
 * the independent "Verify" tool, which is the whole point of that tool).
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;

  function $(id) { return document.getElementById(id); }

  function UI(opts) {
    this.onBet = opts.onBet;          // function(target, clientSeed) -> Promise<payoutAmount>
    this.onBonus = opts.onBonus;      // function(mode, target, clientSeed, turbo) -> Promise<{payout, summary}>
    this.engine = opts.engine;
    this.sfx = opts.sfx;

    this.balance = parseFloat(localStorage.getItem('apex_limbo_balance'));
    if (!(this.balance > 0)) this.balance = CFG.startBalance;

    this.bet = CFG.bet.default;
    this.target = CFG.target.default;
    this.tripleTarget = CFG.bonusModes.tripleShot.startTarget.default;
    this.turbo = false;
    this.sound = true;
    this.busy = false;

    this.clientSeed = localStorage.getItem('apex_limbo_clientseed') || this.engine.suggestClientSeed();
    localStorage.setItem('apex_limbo_clientseed', this.clientSeed);

    // Restore the live (unrevealed) server seed + nonce across a reload —
    // without this, a page refresh silently strands whatever seed was
    // committed-but-not-yet-rotated, making every bet placed under it
    // permanently unverifiable (its hash was shown, but the seed itself
    // is gone). engine.serverSeed/nonce are plain public fields, so this
    // is just a restore, not an API change to GameEngine.
    var savedServerSeed = localStorage.getItem('apex_limbo_serverseed');
    if (savedServerSeed) {
      this.engine.serverSeed = savedServerSeed;
      this.engine.nonce = parseInt(localStorage.getItem('apex_limbo_nonce'), 10) || 0;
    }

    this.auto = {
      active: false, remaining: 0, count: CFG.auto.defaultCount,
      onWinMode: 'reset', onWinPct: 0, onLossMode: 'reset', onLossPct: 0,
      stopProfit: 0, stopLoss: 0, baseBet: CFG.bet.default, sessionPL: 0
    };

    this.buildQuickTargets();
    this.buildTripleStartPresets();
    this.bind();
    this.renderBalance();
    this.renderBet();
    this.renderTarget();
    this.renderFairness();
  }

  var P = UI.prototype;

  P.fmt = function (v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  P.renderBalance = function () {
    $('balance').textContent = this.fmt(this.balance);
    localStorage.setItem('apex_limbo_balance', String(this.balance));
  };

  P.renderBet = function () {
    $('betInput').value = this.bet.toFixed(2);
    this.renderPayout();
  };

  P.setBet = function (v) {
    if (isNaN(v)) v = CFG.bet.default;
    v = Math.min(CFG.bet.max, Math.max(CFG.bet.min, v));
    this.bet = Math.round(v * 100) / 100;
    this.renderBet();
  };

  P.renderPayout = function () {
    $('payoutOut').textContent = this.fmt(this.bet * this.target);
  };

  P.renderTarget = function () {
    $('targetInput').value = this.target.toFixed(2);
    // Significant-figure formatting (not a fixed decimal count) so the
    // value round-trips losslessly back to the same 0.01-stepped target if
    // the player re-commits exactly what's shown, across the whole 5+
    // order-of-magnitude chance range — a fixed .toFixed(4) was far too
    // coarse at high targets (e.g. 1,000,000x displayed as "0.0001"
    // round-tripped to 990,000x when re-entered; toPrecision(9) verified
    // to round-trip exactly across the full [1.01, 1000000] target range).
    $('chanceInput').value = CFG.chanceForTarget(this.target).toPrecision(9)
      .replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    this.renderPayout();
    if (this.renderer) this.renderer.setTarget(this.target);
  };

  P.setTarget = function (v) {
    if (isNaN(v)) v = CFG.target.default;
    v = Math.min(CFG.target.max, Math.max(CFG.target.min, v));
    this.target = Math.round(v * 100) / 100;
    this.renderTarget();
  };

  P.setChance = function (pct) {
    if (isNaN(pct) || pct <= 0) pct = CFG.chanceForTarget(CFG.target.default);
    var maxChance = CFG.chanceForTarget(CFG.target.min);
    var minChance = CFG.chanceForTarget(CFG.target.max);
    pct = Math.min(maxChance, Math.max(minChance, pct));
    this.setTarget(CFG.targetForChance(pct));
  };

  P.buildQuickTargets = function () {
    var host = $('quickTargets');
    var self = this;
    CFG.quickTargets.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'mini-btn wide';
      b.textContent = t + '×';
      b.addEventListener('click', function () { self.sfx.click(); self.setTarget(t); });
      host.appendChild(b);
    });
  };

  P.buildTripleStartPresets = function () {
    var host = $('tripleStartPresets');
    var self = this;
    CFG.bonusModes.tripleShot.startPresets.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'mini-btn wide';
      b.textContent = t + '×';
      b.addEventListener('click', function () { self.sfx.click(); self.setTripleTarget(t); });
      host.appendChild(b);
    });
  };

  P.setTripleTarget = function (v) {
    var st = CFG.bonusModes.tripleShot.startTarget;
    if (isNaN(v)) v = st.default;
    v = Math.min(st.max, Math.max(st.min, v));
    this.tripleTarget = Math.round(v * 100) / 100;
    $('tripleStartInput').value = this.tripleTarget.toFixed(2);
    this.renderBonusModal();
  };

  P.setBusy = function (b) {
    this.busy = b;
    $('btnBet').disabled = b && !this.auto.active;
    $('betInput').disabled = b;
    $('targetInput').disabled = b;
    $('chanceInput').disabled = b;
    $('btnBonus').disabled = b || this.auto.active;
    document.body.classList.toggle('busy', b);
  };

  P.win = function (amount) {
    $('lastWin').textContent = amount > 0 ? this.fmt(amount) : '—';
  };

  P.message = function (text) { $('statusLine').textContent = text; };

  /* ---- wiring ------------------------------------------------------------ */
  P.bind = function () {
    var self = this;

    function click(id, fn) {
      $(id).addEventListener('click', function (e) { self.sfx.ensure(); self.sfx.click(); fn(e); });
    }

    click('tabManual', function () { self.setTab(false); });
    click('tabAuto', function () { self.setTab(true); });

    click('betHalf', function () { self.setBet(self.bet / 2); });
    click('betDouble', function () { self.setBet(self.bet * 2); });
    click('betMin', function () { self.setBet(CFG.bet.min); });
    click('betMax', function () { self.setBet(CFG.bet.max); });
    $('betInput').addEventListener('change', function () {
      self.setBet(parseFloat($('betInput').value));
    });

    $('targetInput').addEventListener('change', function () {
      self.setTarget(parseFloat($('targetInput').value));
    });
    $('chanceInput').addEventListener('change', function () {
      self.setChance(parseFloat($('chanceInput').value));
    });

    click('btnBet', function () { self.bet_(); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!self.busy && !self.modalOpen() && !self.auto.active) {
          self.sfx.ensure();
          self.bet_();
        }
      }
    });

    // autoplay bet count
    var autoButtons = document.querySelectorAll('[data-auto]');
    autoButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        autoButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.auto.count = btn.dataset.auto === 'inf' ? Infinity : parseInt(btn.dataset.auto, 10);
      });
    });

    // on win / on loss segmented controls
    function bindSeg(attr, modeKey, pctInputId) {
      var buttons = document.querySelectorAll('[data-' + attr + ']');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          buttons.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.auto[modeKey] = btn.dataset[attr];
          $(pctInputId).disabled = btn.dataset[attr] !== 'increase';
        });
      });
      $(pctInputId).addEventListener('change', function () {
        var v = Math.max(0, Math.min(CFG.auto.maxAdjustPct, parseFloat(this.value) || 0));
        this.value = v;
      });
    }
    bindSeg('onwin', 'onWinMode', 'onWinPct');
    bindSeg('onloss', 'onLossMode', 'onLossPct');

    click('btnAutoStart', function () {
      if (self.auto.active) { self.stopAuto('Stopped.'); return; }
      self.startAuto();
    });

    // bonus buy modal
    click('btnBonus', function () { self.renderBonusModal(); self.openModal('bonusModal'); });
    click('bonusClose', function () { self.closeModal('bonusModal'); });
    $('tripleStartInput').addEventListener('change', function () {
      self.setTripleTarget(parseFloat($('tripleStartInput').value));
    });
    click('rushConfirm', function () { self.closeModal('bonusModal'); self.bonus_('rush'); });
    click('tripleConfirm', function () { self.closeModal('bonusModal'); self.bonus_('tripleShot'); });
    click('jackpotConfirm', function () { self.closeModal('bonusModal'); self.bonus_('jackpot'); });

    // fairness modal
    click('btnFair', function () { self.renderFairness(); self.openModal('fairModal'); });
    click('fairClose', function () { self.closeModal('fairModal'); });
    click('fairNewClient', function () {
      self.clientSeed = self.engine.suggestClientSeed();
      localStorage.setItem('apex_limbo_clientseed', self.clientSeed);
      self.renderFairness();
    });
    $('fairClientSeed').addEventListener('change', function () {
      self.clientSeed = this.value.trim() || self.engine.suggestClientSeed();
      localStorage.setItem('apex_limbo_clientseed', self.clientSeed);
      self.renderFairness();
    });
    click('fairRotate', function () {
      var revealed = self.engine.rotateServerSeed();
      $('fairRevealed').style.display = '';
      $('fairRevealedSeed').textContent = revealed;
      self.renderFairness();
    });
    click('verifyRun', function () {
      var srv = $('verifyServer').value.trim();
      var cli = $('verifyClient').value.trim();
      var nonce = parseInt($('verifyNonce').value, 10) || 0;
      if (!srv) { self.message('Paste a revealed server seed to verify.'); return; }
      var result = g.GameEngine.computeResult(srv, cli, nonce, CFG.houseEdge, CFG.target.max);
      $('verifyOut').style.display = '';
      $('verifyOut').innerHTML = '<b>Result:</b> ' + result.toFixed(2) + '×';
    });

    // info modal
    click('btnInfo', function () { self.openModal('infoModal'); });
    click('infoClose', function () { self.closeModal('infoModal'); });

    click('btnTurbo', function () {
      self.turbo = !self.turbo;
      $('btnTurbo').classList.toggle('on', self.turbo);
    });
    click('btnSound', function () {
      self.sound = !self.sound;
      self.sfx.setEnabled(self.sound);
      $('btnSound').classList.toggle('on', !self.sound);
      $('btnSound').textContent = self.sound ? '🔊' : '🔇';
    });

    click('btnReset', function () {
      self.balance = CFG.startBalance;
      self.renderBalance();
      self.message('Demo balance reset.');
    });

    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
    });
  };

  P.setTab = function (auto) {
    $('tabManual').classList.toggle('active', !auto);
    $('tabAuto').classList.toggle('active', auto);
    $('manualPane').style.display = auto ? 'none' : '';
    $('autoPane').style.display = auto ? '' : 'none';
  };

  P.modalOpen = function () { return !!document.querySelector('.modal.open'); };
  P.openModal = function (id) { $(id).classList.add('open'); };
  P.closeModal = function (id) { $(id).classList.remove('open'); };

  P.renderFairness = function () {
    $('fairServerHash').value = this.engine.serverSeedHash();
    $('fairClientSeed').value = this.clientSeed;
    $('fairNonce').value = String(this.engine.nonce);
    // Called after every bet/bonus and right after a seed rotation, so this
    // is also the natural place to keep the live seed+nonce persisted —
    // see the restore in the constructor above.
    localStorage.setItem('apex_limbo_serverseed', this.engine.serverSeed);
    localStorage.setItem('apex_limbo_nonce', String(this.engine.nonce));
  };

  /* ---- bonus buy ------------------------------------------------------------ */
  P.costMultiplierFor = function (mode) {
    if (mode === 'rush') return CFG.rushCost();
    if (mode === 'tripleShot') return CFG.tripleShotCost();
    if (mode === 'jackpot') return CFG.bonusModes.jackpot.costMultiplier;
    return 0;
  };

  P.renderBonusModal = function () {
    var jackpot = CFG.bonusModes.jackpot;

    $('rushDesc').textContent = CFG.bonusModes.rush.shots + ' rapid-fire shots at your Target Multiplier (' +
      this.target.toFixed(2) + '×).';
    $('rushCost').textContent = this.fmt(this.costMultiplierFor('rush') * this.bet);

    $('tripleStartInput').value = this.tripleTarget.toFixed(2);
    var gates = CFG.tripleShotGates(this.tripleTarget);
    $('tripleDesc').textContent = 'Gates: ' + gates.map(function (g) { return g.toFixed(2) + '×'; }).join(' / ') +
      '  ·  max total ' + (gates[0] + gates[1] + gates[2]).toFixed(2) + '×';
    $('tripleCost').textContent = this.fmt(this.costMultiplierFor('tripleShot') * this.bet);

    $('jackpotDesc').textContent = 'MIN WIN ' + jackpot.minWin + '× · MAX WIN ' +
      jackpot.maxWin.toLocaleString() + '× — one draw, no wheel.';
    $('jackpotCost').textContent = this.fmt(this.costMultiplierFor('jackpot') * this.bet);
  };

  P.bonus_ = function (mode) {
    var self = this;
    if (this.busy) return Promise.resolve(false);
    var cost = this.costMultiplierFor(mode) * this.bet;
    if (isNaN(cost) || cost > this.balance + 1e-9) {
      this.message(isNaN(cost) ? 'Invalid bet amount.' : 'Insufficient demo balance for this bonus — press ↺ to reset.');
      return Promise.resolve(false);
    }
    this.balance -= cost;
    this.renderBalance();
    this.win(0);
    this.message(CFG.bonusModes[mode].label + ' — good luck!');
    this.setBusy(true);

    var modeTarget = mode === 'tripleShot' ? this.tripleTarget : this.target;
    return this.onBonus(mode, modeTarget, this.clientSeed, this.turbo).then(function (result) {
      self.balance += result.payout;
      self.renderBalance();
      self.renderFairness();
      self.win(result.payout);
      self.message(result.summary);
      self.setBusy(false);
      return { win: result.payout > 0, profit: result.payout - cost };
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
      return { win: false, profit: -cost };
    });
  };

  /* ---- bet orchestration -------------------------------------------------- */
  P.bet_ = function () {
    var self = this;
    if (this.busy) return Promise.resolve(false);
    if (isNaN(this.bet) || this.bet > this.balance + 1e-9) {
      this.message(isNaN(this.bet) ? 'Invalid bet amount.' : 'Insufficient demo balance — press ↺ to reset.');
      this.stopAuto();
      return Promise.resolve(false);
    }
    this.balance -= this.bet;
    this.renderBalance();
    this.win(0);
    this.message('Rolling…');
    this.setBusy(true);

    var stake = this.bet;
    return this.onBet(this.target, this.clientSeed, this.turbo).then(function (result) {
      self.balance += result.payout;
      self.renderBalance();
      self.renderFairness();
      self.message(result.win
        ? 'Rolled ' + result.result.toFixed(2) + '× — you won ' + self.fmt(result.payout) + '!'
        : 'Rolled ' + result.result.toFixed(2) + '× — bust, try again.');
      self.setBusy(false);
      return { win: result.win, profit: result.payout - stake };
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
      return { win: false, profit: -stake };
    });
  };

  /* ---- autoplay ------------------------------------------------------------ */
  P.startAuto = function () {
    this.auto.active = true;
    this.auto.remaining = this.auto.count;
    this.auto.baseBet = this.bet;
    this.auto.sessionPL = 0;
    $('btnAutoStart').textContent = 'Stop Autoplay';
    $('btnAutoStart').classList.add('stop');
    // Bonus Buy shares the same round-orchestration path as a normal bet
    // (busy guard, balance debit/credit) but autoLoop doesn't know how to
    // account for a bonus round — keep it out of reach for the whole
    // autoplay session, not just mid-round, so it can never eat an
    // autoplay "turn" with no bet placed.
    $('btnBonus').disabled = true;
    this.sfx.autoToggle(true);
    this.autoLoop();
  };

  P.stopAuto = function (msg) {
    this.auto.active = false;
    $('btnAutoStart').textContent = 'Start Autoplay';
    $('btnAutoStart').classList.remove('stop');
    if (!this.busy) $('btnBonus').disabled = false;
    this.sfx.autoToggle(false);
    if (msg) this.message(msg);
  };

  P.autoLoop = function () {
    var self = this;
    if (!this.auto.active || this.auto.remaining <= 0) {
      this.stopAuto(this.auto.active ? 'Autoplay complete.' : undefined);
      return;
    }
    this.auto.remaining--;
    $('btnAutoStart').textContent = 'Stop (' +
      (this.auto.remaining === Infinity ? '∞' : this.auto.remaining) + ')';

    this.bet_().then(function (outcome) {
      if (!self.auto.active) return;
      if (!outcome) { self.stopAuto('Autoplay stopped — the last bet could not be placed.'); return; }
      self.auto.sessionPL += outcome.profit;

      var mode = outcome.win ? self.auto.onWinMode : self.auto.onLossMode;
      var pct = outcome.win ? parseFloat($('onWinPct').value) || 0 : parseFloat($('onLossPct').value) || 0;
      self.setBet(mode === 'increase' ? self.bet * (1 + pct / 100) : self.auto.baseBet);

      var stopProfit = parseFloat($('stopProfit').value) || 0;
      var stopLoss = parseFloat($('stopLoss').value) || 0;
      if (stopProfit > 0 && self.auto.sessionPL >= stopProfit) {
        self.stopAuto('Autoplay stopped — profit target reached (' + self.fmt(self.auto.sessionPL) + ').');
        return;
      }
      if (stopLoss > 0 && -self.auto.sessionPL >= stopLoss) {
        self.stopAuto('Autoplay stopped — loss limit reached (' + self.fmt(-self.auto.sessionPL) + ').');
        return;
      }
      if (self.auto.active) {
        setTimeout(function () { self.autoLoop(); }, self.turbo ? CFG.auto.delayMs * 0.4 : CFG.auto.delayMs);
      }
    });
  };

  g.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);


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
        var tripleRec = engine.playTripleShot(clientSeed, target);
        return renderer.playTripleShot(tripleRec, { turbo: turbo }).then(function () {
          var payout = tripleRec.totalPayoutX * ui.bet;
          return {
            payout: payout,
            summary: tripleRec.hits === 3
              ? 'TRIPLE HIT! ' + tripleRec.result.toFixed(2) + '× cleared all 3 gates — won ' + ui.fmt(payout) + '!'
              : payout > 0
                ? tripleRec.hits + ' gate(s) cleared — won ' + ui.fmt(payout) + '!'
                : 'Missed the first gate — try again.'
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

