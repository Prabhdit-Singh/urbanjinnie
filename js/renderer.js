/* =========================================================================
 * CANDY SURGE 1000 — Renderer
 *
 * Pure playback layer: receives event "books" from the engine and animates
 * them on a single canvas. Never computes game outcomes (Stake Engine
 * web-sdk role). Candy-land scene, tumble physics, multiplier badges,
 * free-spins HUD, win splashes and particles are all drawn here.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var ART = g.SymbolArt;

  var EASE = {
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outBack: function (t) { var s = 1.4; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
    outBounce: function (t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
      if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
      t -= 2.625 / d1; return n1 * t * t + 0.984375;
    },
    inCubic: function (t) { return t * t * t; }
  };

  function Renderer(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.cols = CFG.grid.cols;
    this.rows = CFG.grid.rows;

    this.cells = [];          // [c][r] -> {sym, dy, scale, alpha, glow} | null
    this.spots = [];          // [{c,r,hits,value}]
    this.particles = [];
    this.floaters = [];       // floating pay texts
    this.banner = null;       // transient center banner
    this.fsHud = null;        // {index,total,win}
    this.winBar = null;       // {amount, tumbles}
    this.anticipate = false;
    this.speed = 1;
    this.bet = 1;
    this.currency = '$';
    this.time = 0;
    this.skipRequested = false;

    this.bokeh = [];
    for (var i = 0; i < 26; i++) {
      this.bokeh.push({ x: Math.random(), y: Math.random(), r: 0.02 + Math.random() * 0.05,
                        sp: 0.2 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2,
                        hue: [305, 270, 195, 45][i % 4] });
    }

    this.initIdleGrid();
    this.resize();

    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    canvas.addEventListener('pointerdown', function () { self.skipRequested = true; });

    var loop = function (t) {
      self.time = t / 1000;
      self.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  var P = Renderer.prototype;

  P.initIdleGrid = function () {
    var ids = CFG.symbols.map(function (s) { return s.id; });
    for (var c = 0; c < this.cols; c++) {
      this.cells[c] = [];
      for (var r = 0; r < this.rows; r++)
        this.cells[c][r] = this.mkCell(ids[(Math.random() * ids.length) | 0]);
    }
  };

  P.mkCell = function (sym) { return { sym: sym, dy: 0, scale: 1, alpha: 1, glow: 0 }; };

  /* ---- layout ----------------------------------------------------------- */
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

    var headerH = Math.max(54, this.h * 0.12);
    var footerH = Math.max(40, this.h * 0.1);
    var availH = this.h - headerH - footerH - 16;
    var availW = this.w - 24;
    this.cell = Math.floor(Math.min(availW / this.cols, availH / this.rows));
    this.boardW = this.cell * this.cols;
    this.boardH = this.cell * this.rows;
    this.boardX = (this.w - this.boardW) / 2;
    this.boardY = headerH + (availH - this.boardH) / 2 + 8;
  };

  P.cellXY = function (c, r) {
    return { x: this.boardX + c * this.cell, y: this.boardY + r * this.cell };
  };

  /* ---- timing helpers ---------------------------------------------------- */
  P.wait = function (ms) {
    var self = this;
    return new Promise(function (res) { setTimeout(res, ms / self.speed); });
  };

  P.tween = function (obj, prop, to, ms, ease) {
    var self = this, from = obj[prop], t0 = performance.now(), dur = ms / self.speed;
    ease = ease || EASE.outCubic;
    return new Promise(function (res) {
      function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        obj[prop] = from + (to - from) * ease(k);
        if (k < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
  };

  P.fmt = function (x) {
    var v = x * this.bet;
    return this.currency + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ======================================================================
   * BOOK PLAYBACK
   * ==================================================================== */
  P.playBook = function (book, opts) {
    var self = this;
    this.bet = opts.bet;
    this.speed = opts.turbo ? 2.4 : 1;
    this.skipRequested = false;
    var onWin = opts.onWin || function () {};

    return (async function () {
      var inFs = false, fsWinSoFar = 0, spinWinBase = 0;

      for (var i = 0; i < book.events.length; i++) {
        var ev = book.events[i];
        switch (ev.type) {
          case 'reveal':
            self.spots = ev.spots;
            await self.animReveal(ev.grid);
            break;

          case 'win':
            await self.animWin(ev);
            var totalNow = inFs ? fsWinSoFar + ev.spinWin : ev.spinWin;
            self.winBar = { amount: totalNow, tumbles: ev.tumbleIndex + 1 };
            if (self.fsHud) self.fsHud.win = fsWinSoFar + ev.spinWin;
            spinWinBase = ev.spinWin;
            onWin(totalNow);
            break;

          case 'tumble':
            await self.animTumble(ev.grid);
            self.spots = ev.spots;
            break;

          case 'scatterPay':
            self.sfx.scatter();
            self.floatText('SCATTER PAYS ' + self.fmt(ev.pay), self.w / 2, self.boardY - 14, '#ffd24a');
            await self.wait(700);
            break;

          case 'fsTrigger':
            self.sfx.bonus();
            await self.splash('FREE SPINS!', ev.spins + ' FREE SPINS — MULTIPLIER SPOTS STICK', 2200, '#ff7ad9');
            inFs = true;
            fsWinSoFar = 0;
            self.fsHud = { index: 0, total: ev.spins, win: 0 };
            break;

          case 'fsSpin':
            self.fsHud.index = ev.index;
            self.fsHud.total = ev.total;
            fsWinSoFar = self.fsHud.win;
            spinWinBase = 0;
            self.winBar = null;
            await self.wait(350);
            break;

          case 'fsRetrigger':
            self.sfx.bonus();
            self.fsHud.total = ev.total;
            self.floatText('+' + ev.extraSpins + ' FREE SPINS!', self.w / 2, self.boardY - 14, '#5ee06a');
            await self.wait(900);
            break;

          case 'seedSpots':
            self.spots = ev.spots;
            self.sfx.multiplier();
            self.floatText('SUPER MULTIPLIERS PLACED!', self.w / 2, self.boardY - 14, '#ffd24a');
            await self.wait(900);
            break;

          case 'fsEnd':
            await self.wait(300);
            await self.splash('BONUS COMPLETE', 'TOTAL WIN ' + self.fmt(ev.totalWin), 2200, '#ffd24a');
            self.fsHud = null;
            inFs = false;
            break;

          case 'maxWin':
            self.sfx.maxWin();
            await self.splash('MAX WIN!', CFG.maxWinX.toLocaleString() + '× — ' + self.fmt(ev.totalWin), 3000, '#ff4d6d');
            break;

          case 'roundEnd':
            if (ev.totalWin > 0) {
              self.winBar = { amount: ev.totalWin, tumbles: 0 };
              onWin(ev.totalWin);
              var x = ev.totalWin; // in bet multiples
              if (x >= 20 && x < CFG.maxWinX) await self.bigWinSplash(x);
            }
            break;
        }
      }
    })();
  };

  /* ---- reveal: columns drop in ------------------------------------------ */
  P.animReveal = function (grid) {
    var self = this;
    this.winBar = null;
    this.sfx.spin();
    var jobs = [];
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var cell = this.mkCell(grid[c][r]);
        cell.dy = -(this.rows - r + 2) * this.cell - this.boardY;
        this.cells[c][r] = cell;
        var delay = c * 40 + (this.rows - r) * 18;
        jobs.push(this.dropCell(cell, delay, 430));
        if (grid[c][r] === 'scatter') {
          (function (cc) { setTimeout(function () { self.sfx.scatter(); }, (cc * 40 + 360) / self.speed); })(c);
        }
      }
      (function (cc) { setTimeout(function () { self.sfx.land(cc); }, (cc * 40 + 320) / self.speed); })(c);
    }
    return Promise.all(jobs);
  };

  P.dropCell = function (cell, delayMs, durMs) {
    var self = this;
    return self.wait(delayMs).then(function () {
      return self.tween(cell, 'dy', 0, durMs, EASE.outBounce);
    });
  };

  /* ---- win: highlight clusters, pay, explode ----------------------------- */
  P.animWin = function (ev) {
    var self = this;
    return (async function () {
      var k, i, cl;
      // highlight
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        for (i = 0; i < cl.cells.length; i++) {
          var cc = self.cells[cl.cells[i][0]][cl.cells[i][1]];
          if (cc) cc.glow = 1;
        }
      }
      self.sfx.winChime(ev.tumbleIndex);
      await self.wait(120);

      // floating pay text per cluster
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        var cx = 0, cy = 0;
        for (i = 0; i < cl.cells.length; i++) {
          var p = self.cellXY(cl.cells[i][0], cl.cells[i][1]);
          cx += p.x + self.cell / 2; cy += p.y + self.cell / 2;
        }
        cx /= cl.cells.length; cy /= cl.cells.length;
        var label = self.fmt(cl.pay) + (cl.multSum > 0 ? '  (x' + cl.multSum + ')' : '');
        self.floatText(label, cx, cy, cl.multSum > 0 ? '#ffd24a' : '#ffffff');
        if (cl.multSum > 0) self.sfx.multiplier();
      }
      await self.wait(460);

      // explode
      self.sfx.pop(ev.tumbleIndex);
      var jobs = [];
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        for (i = 0; i < cl.cells.length; i++) {
          var c0 = cl.cells[i][0], r0 = cl.cells[i][1];
          var cell = self.cells[c0][r0];
          if (!cell) continue;
          self.burst(c0, r0, cell.sym);
          jobs.push(self.tween(cell, 'scale', 0, 200, EASE.inCubic));
        }
      }
      await Promise.all(jobs);
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        for (i = 0; i < cl.cells.length; i++)
          self.cells[cl.cells[i][0]][cl.cells[i][1]] = null;
      }
      // updated multiplier spots appear right after the explosion
      self.spots = ev.spots;
      await self.wait(120);
    })();
  };

  /* ---- tumble: settle survivors, drop refills ----------------------------- */
  P.animTumble = function (newGrid) {
    var self = this;
    var jobs = [];
    for (var c = 0; c < this.cols; c++) {
      var kept = [];
      for (var r = 0; r < this.rows; r++) if (this.cells[c][r]) kept.push(this.cells[c][r]);
      var newCount = this.rows - kept.length;
      var col = [];
      for (var n = 0; n < newCount; n++) {
        var cell = this.mkCell(newGrid[c][n]);
        cell.dy = -(newCount - n + 1) * this.cell - 20;
        col.push(cell);
      }
      for (var kp = 0; kp < kept.length; kp++) {
        var target = newCount + kp;
        // dy measured against the new row position
        var oldRow = this.findRowOf(c, kept[kp]);
        kept[kp].dy = (oldRow - target) * this.cell;
        col.push(kept[kp]);
      }
      for (var r2 = 0; r2 < this.rows; r2++) {
        this.cells[c][r2] = col[r2];
        if (col[r2].dy !== 0)
          jobs.push(this.dropCell(col[r2], c * 18, 380));
        if (col[r2].sym === 'scatter' && r2 < newCount) {
          (function () { setTimeout(function () { self.sfx.scatter(); }, 320 / self.speed); })();
        }
      }
    }
    return Promise.all(jobs).then(function () { return self.wait(90); });
  };

  P.findRowOf = function (c, cell) {
    for (var r = 0; r < this.rows; r++) if (this.cells[c][r] === cell) return r;
    return 0;
  };

  /* ---- particles & texts -------------------------------------------------- */
  P.burst = function (c, r, sym) {
    var p = this.cellXY(c, r), color = '#fff';
    for (var i = 0; i < CFG.symbols.length; i++)
      if (CFG.symbols[i].id === sym) color = CFG.symbols[i].color;
    if (sym === 'scatter') color = '#ffd24a';
    for (var n = 0; n < 14; n++) {
      var a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random()) * this.cell * 5;
      this.particles.push({
        x: p.x + this.cell / 2, y: p.y + this.cell / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cell * 2,
        r: 2 + Math.random() * (this.cell * 0.09),
        color: color, life: 1, decay: 1.6 + Math.random()
      });
    }
  };

  P.floatText = function (text, x, y, color) {
    this.floaters.push({ text: text, x: x, y: y, color: color || '#fff', life: 1.6 });
  };

  /* ---- splashes ------------------------------------------------------------ */
  P.splash = function (title, sub, ms, color) {
    var self = this;
    this.banner = { title: title, sub: sub, color: color, born: this.time };
    for (var n = 0; n < 50; n++) {
      this.particles.push({
        x: this.w / 2 + (Math.random() - 0.5) * this.w * 0.4,
        y: this.h / 2 + (Math.random() - 0.5) * this.h * 0.2,
        vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 400,
        r: 3 + Math.random() * 5,
        color: ['#ff7ad9', '#ffd24a', '#5ee06a', '#4fc3ff'][n % 4],
        life: 1.4, decay: 0.8
      });
    }
    return this.wait(ms).then(function () { self.banner = null; });
  };

  P.bigWinSplash = function (x) {
    var self = this;
    var tier = x >= 500 ? 'EPIC WIN' : x >= 100 ? 'MEGA WIN' : x >= 40 ? 'SUPER WIN' : 'BIG WIN';
    self.sfx.bigWin();
    self.skipRequested = false;
    var counter = { v: 0 };
    self.banner = { title: tier, sub: self.fmt(0), color: '#ffd24a', born: self.time, counter: true };
    var dur = Math.min(2600, 900 + x * 8);
    var t0 = performance.now();
    return new Promise(function (res) {
      var lastTick = 0;
      function step(t) {
        var k = Math.min(1, (t - t0) / (dur / self.speed));
        if (self.skipRequested) k = 1;
        counter.v = x * EASE.outCubic(k);
        if (self.banner) self.banner.sub = self.fmt(counter.v);
        if (t - lastTick > 60) { self.sfx.tick(); lastTick = t; }
        if (k < 1) requestAnimationFrame(step);
        else setTimeout(function () { self.banner = null; res(); }, 700 / self.speed);
      }
      requestAnimationFrame(step);
    });
  };

  /* ======================================================================
   * DRAW LOOP
   * ==================================================================== */
  P.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, t = this.time;
    var dt = Math.min(0.05, t - (this.lastT || t)); this.lastT = t;

    /* background: candy dusk sky */
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b1055');
    sky.addColorStop(0.55, '#5b2a86');
    sky.addColorStop(1, '#b0447c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // bokeh sparkles
    for (var i = 0; i < this.bokeh.length; i++) {
      var b = this.bokeh[i];
      var bx = b.x * w, by = (b.y + Math.sin(t * b.sp + b.ph) * 0.02) * h;
      var br = b.r * Math.min(w, h) * (1 + 0.15 * Math.sin(t * 1.3 + b.ph));
      ctx.fillStyle = 'hsla(' + b.hue + ',90%,75%,0.10)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }

    // rolling candy hills at the bottom
    ctx.fillStyle = 'rgba(255,122,217,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var hx = 0; hx <= w; hx += 8)
      ctx.lineTo(hx, h - 30 - Math.sin(hx / 140 + 1) * 18);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    this.drawLogo(ctx);
    this.drawBoard(ctx, dt);
    this.drawHud(ctx);
    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
    if (this.banner) this.drawBanner(ctx);
    this.drawPublisherPlaceholder(ctx);
  };

  P.drawLogo = function (ctx) {
    var cx = this.w / 2, y = Math.max(30, this.boardY * 0.42);
    ctx.save();
    ctx.textAlign = 'center';
    var size = Math.max(20, Math.min(34, this.w * 0.034));
    ctx.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = size * 0.22;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b1a4d';
    ctx.strokeText('CANDY SURGE', cx, y);
    var grad = ctx.createLinearGradient(0, y - size, 0, y);
    grad.addColorStop(0, '#ffe9f7'); grad.addColorStop(0.5, '#ff7ad9'); grad.addColorStop(1, '#ff3fa0');
    ctx.fillStyle = grad;
    ctx.fillText('CANDY SURGE', cx, y);
    // 1000 burst
    ctx.font = '900 ' + size * 0.72 + 'px "Arial Black", Arial, sans-serif';
    ctx.strokeStyle = '#7a3c00';
    ctx.strokeText('1000', cx + size * 5.2, y - size * 0.1);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('1000', cx + size * 5.2, y - size * 0.1);
    ctx.font = '700 ' + Math.max(9, size * 0.34) + 'px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WIN UP TO ' + CFG.maxWinX.toLocaleString() + '×', cx, y + size * 0.62);
    ctx.restore();
  };

  P.drawBoard = function (ctx, dt) {
    var bx = this.boardX, by = this.boardY, bw = this.boardW, bh = this.boardH, cs = this.cell;

    // frame
    ctx.save();
    ART.roundRectPath(ctx, bx - 10, by - 10, bw + 20, bh + 20, 18);
    ctx.fillStyle = 'rgba(20,6,40,0.55)';
    ctx.shadowColor = 'rgba(255,122,217,0.55)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,160,225,0.8)';
    ctx.stroke();
    ctx.restore();

    // cells (checker tint)
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var p = this.cellXY(c, r);
        ctx.fillStyle = (c + r) % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.085)';
        ART.roundRectPath(ctx, p.x + 1.5, p.y + 1.5, cs - 3, cs - 3, cs * 0.16);
        ctx.fill();
      }
    }

    // multiplier spot underlays (so symbols sit on top)
    for (var s = 0; s < this.spots.length; s++) {
      var sp = this.spots[s];
      var pp = this.cellXY(sp.c, sp.r);
      if (sp.value >= 2) {
        var pulse = 1 + 0.06 * Math.sin(this.time * 5 + sp.c + sp.r);
        ctx.save();
        ART.roundRectPath(ctx, pp.x + 2, pp.y + 2, cs - 4, cs - 4, cs * 0.16);
        ctx.fillStyle = 'rgba(255,210,74,0.20)';
        ctx.fill();
        ctx.lineWidth = 2 * pulse;
        ctx.strokeStyle = 'rgba(255,210,74,0.9)';
        ctx.stroke();
        ctx.restore();
      } else if (sp.hits >= 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(pp.x + cs * 0.84, pp.y + cs * 0.16, cs * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // symbols (clip to the board so drops appear from under the frame)
    ctx.save();
    ART.roundRectPath(ctx, bx - 4, by - 4, bw + 8, bh + 8, 14);
    ctx.clip();
    for (var c2 = 0; c2 < this.cols; c2++) {
      for (var r2 = 0; r2 < this.rows; r2++) {
        var cell = this.cells[c2][r2];
        if (!cell || cell.alpha <= 0 || cell.scale <= 0) continue;
        var q = this.cellXY(c2, r2);
        var size = cs * 0.94 * cell.scale;
        var ox = q.x + (cs - size) / 2;
        var oy = q.y + (cs - size) / 2 + cell.dy;
        ctx.globalAlpha = cell.alpha;
        if (cell.glow > 0) {
          ctx.save();
          ctx.shadowColor = 'rgba(255,255,255,0.95)';
          ctx.shadowBlur = cs * 0.35 * (0.7 + 0.3 * Math.sin(this.time * 9));
          ART.draw(ctx, cell.sym, ox, oy, size);
          ctx.restore();
        } else {
          if (cell.sym === 'scatter') {
            var wob = 1 + 0.04 * Math.sin(this.time * 4 + c2 * 1.7 + r2);
            var s2 = size * wob;
            ART.draw(ctx, cell.sym, q.x + (cs - s2) / 2, q.y + (cs - s2) / 2 + cell.dy, s2);
          } else {
            ART.draw(ctx, cell.sym, ox, oy, size);
          }
        }
        ctx.globalAlpha = 1;
        cell.glow = Math.max(0, cell.glow - dt * 0.4);
      }
    }
    ctx.restore();

    // multiplier value badges (over symbols)
    for (var s2 = 0; s2 < this.spots.length; s2++) {
      var sp2 = this.spots[s2];
      if (sp2.value < 2) continue;
      var pq = this.cellXY(sp2.c, sp2.r);
      this.drawMultBadge(ctx, pq.x + cs / 2, pq.y + cs - cs * 0.16, cs, sp2.value);
    }
  };

  P.drawMultBadge = function (ctx, cx, cy, cs, value) {
    var label = 'x' + value;
    var fs = Math.max(10, cs * (label.length > 4 ? 0.2 : 0.26));
    ctx.save();
    ctx.font = '900 ' + fs + 'px Arial, sans-serif';
    var tw = ctx.measureText(label).width;
    var pw = tw + fs * 0.9, ph = fs * 1.45;
    var grd = ctx.createLinearGradient(cx, cy - ph / 2, cx, cy + ph / 2);
    grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffc83d'); grd.addColorStop(1, '#e08a00');
    ART.roundRectPath(ctx, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
    ctx.fillStyle = grd;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#8a5200';
    ctx.stroke();
    ctx.fillStyle = '#4d2c00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + fs * 0.06);
    ctx.restore();
  };

  P.drawHud = function (ctx) {
    var cs = this.cell;
    // free spins HUD
    if (this.fsHud) {
      var y = this.boardY - Math.max(26, cs * 0.42);
      ctx.save();
      ctx.textAlign = 'center';
      var fs = Math.max(12, cs * 0.3);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      var txt = 'FREE SPINS ' + this.fsHud.index + ' / ' + this.fsHud.total;
      var tw = ctx.measureText(txt).width + fs * 2;
      ART.roundRectPath(ctx, this.w / 2 - tw / 2, y - fs, tw, fs * 2, fs);
      ctx.fillStyle = 'rgba(91,26,77,0.9)';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ff7ad9'; ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, this.w / 2, y + 1);
      ctx.restore();
    }
    // win bar
    if (this.winBar && this.winBar.amount > 0) {
      var by = this.boardY + this.boardH + Math.max(22, cs * 0.4);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var f2 = Math.max(13, cs * 0.32);
      ctx.font = '900 ' + f2 + 'px Arial, sans-serif';
      var label = 'WIN ' + this.fmt(this.winBar.amount) +
        (this.winBar.tumbles > 1 ? '   •   TUMBLE ×' + this.winBar.tumbles : '');
      ctx.lineWidth = f2 * 0.18; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(40,8,40,0.85)';
      ctx.strokeText(label, this.w / 2, by);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(label, this.w / 2, by);
      ctx.restore();
    }
  };

  P.drawParticles = function (ctx, dt) {
    var alive = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.life -= dt * p.decay;
      if (p.life <= 0) continue;
      p.vy += 900 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = alive;
  };

  P.drawFloaters = function (ctx, dt) {
    var alive = [];
    for (var i = 0; i < this.floaters.length; i++) {
      var f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 26 * dt;
      var fs = Math.max(13, this.cell * 0.3);
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 1.4);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = fs * 0.2; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(40,8,40,0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
      alive.push(f);
    }
    this.floaters = alive;
  };

  P.drawBanner = function (ctx) {
    var b = this.banner;
    var age = this.time - b.born;
    var pop = EASE.outBack(Math.min(1, age * 3.5));
    ctx.save();
    ctx.fillStyle = 'rgba(15,5,30,0.62)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(pop, pop);
    var fs = Math.max(30, Math.min(64, this.w * 0.065));
    ctx.textAlign = 'center';
    ctx.font = '900 ' + fs + 'px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = fs * 0.18; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b1a4d';
    ctx.strokeText(b.title, 0, -fs * 0.2);
    var grd = ctx.createLinearGradient(0, -fs, 0, fs * 0.4);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(1, b.color || '#ffd24a');
    ctx.fillStyle = grd;
    ctx.fillText(b.title, 0, -fs * 0.2);
    if (b.sub) {
      ctx.font = '900 ' + fs * 0.5 + 'px Arial, sans-serif';
      ctx.lineWidth = fs * 0.1;
      ctx.strokeText(b.sub, 0, fs * 0.75);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(b.sub, 0, fs * 0.75);
    }
    ctx.restore();
  };

  P.drawPublisherPlaceholder = function (ctx) {
    var w = 92, h = 26, x = 12, y = this.h - h - 10;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ART.roundRectPath(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('PUBLISHER LOGO', x + w / 2, y + h / 2);
    ctx.restore();
  };

  g.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
