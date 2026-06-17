/* =========================================================================
 * MEDBOT INVASION 1000 — Renderer
 *
 * Pure playback layer: receives event "books" from the engine and animates
 * them on a single canvas (Stake Engine web-sdk role). Never computes
 * outcomes. Draws the neon lab scene, the 6x5 grid, pay-anywhere wins, germ
 * explosions / tumbles, Serum Multiplier Orbs, the Scanner Beam, the
 * Invasion Meter and the Emergency Lab Spins HUD.
 *
 * Celebratory full-screen moments (Scatter Trigger, Free Spins start, Nice/
 * Big/Mega win, bonus complete) are delegated to DOM overlays via hooks so
 * they render crisply and match the master sheet screens.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var ART = g.SymbolArt;

  var EASE = {
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outBack: function (t) { var s = 1.5; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
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

    this.cells = [];          // [c][r] -> {sym, mult, dy, scale, alpha, glow} | null
    this.particles = [];
    this.floaters = [];
    this.beams = [];          // scanner beam segments
    this.fsHud = null;        // {index,total}
    this.fsMult = 0;          // collected serum multiplier (FS)
    this.meter = 0;           // invasion meter 0..capacity
    this.winBar = null;       // {amount}
    this.speed = 1;
    this.bet = 1;
    this.currency = '$';
    this.time = 0;
    this.skipRequested = false;

    // ambient lab particles (drifting spores)
    this.spores = [];
    for (var i = 0; i < 36; i++) {
      this.spores.push({ x: Math.random(), y: Math.random(), r: 0.004 + Math.random() * 0.01,
        sp: 0.1 + Math.random() * 0.4, ph: Math.random() * 7,
        hue: [150, 190, 280, 110][i % 4] });
    }

    this.initIdleGrid();
    this.resize();

    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    canvas.addEventListener('pointerdown', function () { self.skipRequested = true; });

    (function loop(t) {
      self.time = t / 1000;
      self.draw();
      requestAnimationFrame(loop);
    })(0);
  }

  var P = Renderer.prototype;

  P.payingIds = function () {
    return CFG.symbols.map(function (s) { return s.id; });
  };

  P.initIdleGrid = function () {
    var ids = this.payingIds();
    for (var c = 0; c < this.cols; c++) {
      this.cells[c] = [];
      for (var r = 0; r < this.rows; r++)
        this.cells[c][r] = this.mkCell({ sym: ids[(Math.random() * ids.length) | 0] });
    }
  };

  P.mkCell = function (data) {
    return { sym: data.sym, mult: data.mult, dy: 0, scale: 1, alpha: 1, glow: 0 };
  };

  /* ---- layout ---------------------------------------------------------- */
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

    var headerH = Math.max(48, this.h * 0.13);
    var footerH = Math.max(36, this.h * 0.09);
    var availH = this.h - headerH - footerH - 12;
    var availW = this.w - 28;
    this.cell = Math.floor(Math.min(availW / this.cols, availH / this.rows));
    this.boardW = this.cell * this.cols;
    this.boardH = this.cell * this.rows;
    this.boardX = (this.w - this.boardW) / 2;
    this.boardY = headerH + (availH - this.boardH) / 2 + 6;
  };

  P.cellXY = function (c, r) {
    return { x: this.boardX + c * this.cell, y: this.boardY + r * this.cell };
  };

  /* ---- timing helpers -------------------------------------------------- */
  P.wait = function (ms) {
    var self = this;
    return new Promise(function (res) { setTimeout(res, ms / self.speed); });
  };

  P.tween = function (obj, prop, to, ms, ease) {
    var self = this, from = obj[prop], t0 = performance.now(), dur = ms / self.speed;
    ease = ease || EASE.outCubic;
    return new Promise(function (res) {
      (function step(t) {
        var k = Math.min(1, (t - t0) / dur);
        obj[prop] = from + (to - from) * ease(k);
        if (k < 1) requestAnimationFrame(step); else res();
      })(performance.now());
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
    this.currency = opts.currency || '$';
    this.speed = opts.turbo ? 2.6 : 1;
    this.skipRequested = false;
    var hooks = opts.hooks || {};
    var onWin = opts.onWin || function () {};
    function hook(name) {
      var fn = hooks[name];
      return fn ? (fn.apply(null, Array.prototype.slice.call(arguments, 1)) || Promise.resolve())
                : Promise.resolve();
    }

    return (async function () {
      var inFs = false, fsWinSoFar = 0;
      self.meter = 0; self.fsMult = 0; self.winBar = null;

      for (var i = 0; i < book.events.length; i++) {
        var ev = book.events[i];
        switch (ev.type) {
          case 'reveal':
            self.fsMult = ev.fsMult || (inFs ? self.fsMult : 0);
            await self.animReveal(ev.grid);
            break;

          case 'win':
            await self.animWin(ev);
            var shown = inFs ? fsWinSoFar + ev.spinWin : ev.spinWin;
            self.winBar = { amount: shown };
            onWin(shown);
            break;

          case 'tumble':
            await self.animTumble(ev.grid);
            break;

          case 'orbCollect':
            await self.animOrbCollect(ev);
            self.fsMult = ev.fsMult;
            break;

          case 'meter':
            self.meter = ev.value;
            await self.wait(150);
            break;

          case 'scannerBeam':
            await hook('feature', 'scanner');
            await self.animScannerBeam(ev);
            break;

          case 'scatterPay':
            self.sfx.scatter();
            self.floatText('LAB PORTAL PAYS ' + self.fmt(ev.pay), self.w / 2, self.boardY - 12, '#19d3ff');
            await self.wait(650);
            break;

          case 'fsTrigger':
            self.sfx.bonus();
            await hook('scatterTrigger', ev.count, ev.spins);
            await hook('fsStart', ev.spins, ev.mode);
            inFs = true; fsWinSoFar = 0; self.fsMult = 0;
            self.fsHud = { index: 0, total: ev.spins };
            break;

          case 'fsSpin':
            self.fsHud.index = ev.index;
            self.fsHud.total = ev.total;
            fsWinSoFar = self._fsAccum || 0;
            self.winBar = null;
            await self.wait(280);
            break;

          case 'fsRetrigger':
            self.sfx.bonus();
            self.fsHud.total = ev.total;
            self.floatText('+' + ev.extraSpins + ' FREE SPINS!', self.w / 2, self.boardY - 12, '#8aff3a');
            await self.wait(800);
            break;

          case 'fsEnd':
            self._fsAccum = 0;
            await self.wait(250);
            await hook('fsComplete', ev.totalWin, ev.spinsPlayed);
            self.fsHud = null; inFs = false; self.fsMult = 0;
            break;

          case 'maxWin':
            self.sfx.maxWin();
            await hook('maxWin', ev.totalWin);
            break;

          case 'roundEnd':
            if (ev.totalWin > 0) {
              self.winBar = { amount: ev.totalWin };
              onWin(ev.totalWin);
              await hook('winTier', ev.totalWin);
            }
            break;
        }
        // track FS running total across spins
        if (ev.type === 'win' && inFs) self._fsAccum = fsWinSoFar + ev.spinWin;
      }
      self.meter = 0;
    })();
  };

  /* ---- reveal ---------------------------------------------------------- */
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
        var delay = c * 55 + (this.rows - r) * 16;
        jobs.push(this.dropCell(cell, delay, 420));
        if (grid[c][r].sym === 'scatter') {
          (function (cc) { setTimeout(function () { self.sfx.scatter(); }, (cc * 55 + 360) / self.speed); })(c);
        }
      }
      (function (cc) { setTimeout(function () { self.sfx.land(cc); }, (cc * 55 + 300) / self.speed); })(c);
    }
    return Promise.all(jobs);
  };

  P.dropCell = function (cell, delayMs, durMs) {
    var self = this;
    return self.wait(delayMs).then(function () {
      return self.tween(cell, 'dy', 0, durMs, EASE.outBounce);
    });
  };

  /* ---- win: highlight + pay + germ explosion --------------------------- */
  P.animWin = function (ev) {
    var self = this;
    return (async function () {
      var k, i, win;
      for (k = 0; k < ev.wins.length; k++) {
        win = ev.wins[k];
        for (i = 0; i < win.cells.length; i++) {
          var cc = self.cells[win.cells[i][0]][win.cells[i][1]];
          if (cc) cc.glow = 1;
        }
      }
      self.sfx.winChime(ev.tumbleIndex);
      await self.wait(110);

      for (k = 0; k < ev.wins.length; k++) {
        win = ev.wins[k];
        var cx = 0, cy = 0;
        for (i = 0; i < win.cells.length; i++) {
          var p = self.cellXY(win.cells[i][0], win.cells[i][1]);
          cx += p.x + self.cell / 2; cy += p.y + self.cell / 2;
        }
        cx /= win.cells.length; cy /= win.cells.length;
        self.floatText(self.fmt(win.pay), cx, cy, '#ffffff');
      }
      if (ev.mult > 1) {
        self.sfx.multiplier();
        self.floatText('TOTAL ×' + ev.mult, self.w / 2, self.boardY + self.boardH + 8, '#c264ff');
      }
      await self.wait(420);

      self.sfx.pop(ev.tumbleIndex);
      var jobs = [];
      for (k = 0; k < ev.wins.length; k++) {
        win = ev.wins[k];
        for (i = 0; i < win.cells.length; i++) {
          var c0 = win.cells[i][0], r0 = win.cells[i][1];
          var cell = self.cells[c0][r0];
          if (!cell) continue;
          self.burst(c0, r0, cell.sym);
          jobs.push(self.tween(cell, 'scale', 0, 190, EASE.inCubic));
        }
      }
      await Promise.all(jobs);
      for (k = 0; k < ev.wins.length; k++) {
        win = ev.wins[k];
        for (i = 0; i < win.cells.length; i++)
          self.cells[win.cells[i][0]][win.cells[i][1]] = null;
      }
      await self.wait(90);
    })();
  };

  /* ---- tumble ---------------------------------------------------------- */
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
        var oldRow = this.findRowOf(c, kept[kp]);
        kept[kp].dy = (oldRow - target) * this.cell;
        col.push(kept[kp]);
      }
      for (var r2 = 0; r2 < this.rows; r2++) {
        this.cells[c][r2] = col[r2];
        if (col[r2].dy !== 0) jobs.push(this.dropCell(col[r2], c * 16, 360));
      }
    }
    return Promise.all(jobs).then(function () { return self.wait(80); });
  };

  P.findRowOf = function (c, cell) {
    for (var r = 0; r < this.rows; r++) if (this.cells[c][r] === cell) return r;
    return 0;
  };

  /* ---- orb collection (free spins) ------------------------------------- */
  P.animOrbCollect = function (ev) {
    var self = this;
    return (async function () {
      self.sfx.multiplier();
      var hudX = self.w / 2, hudY = self.boardY - Math.max(28, self.cell * 0.5);
      for (var i = 0; i < ev.orbs.length; i++) {
        var o = ev.orbs[i];
        var p = self.cellXY(o.c, o.r);
        self.floatText('+×' + o.mult, p.x + self.cell / 2, p.y + self.cell / 2, '#c264ff');
        for (var n = 0; n < 10; n++) {
          var a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random()) * self.cell * 4;
          self.particles.push({ x: p.x + self.cell / 2, y: p.y + self.cell / 2,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 2 + Math.random() * 4,
            color: '#c264ff', life: 1, decay: 1.6 });
        }
      }
      await self.wait(550);
    })();
  };

  /* ---- scanner beam feature -------------------------------------------- */
  P.animScannerBeam = function (ev) {
    var self = this;
    return (async function () {
      // ensure board shows the scanner grid
      for (var c = 0; c < self.cols; c++)
        for (var r = 0; r < self.rows; r++)
          self.cells[c][r] = self.mkCell(ev.grid[c][r]);
      self.sfx.scanner();
      // sweep beams to each wild
      for (var i = 0; i < ev.wilds.length; i++) {
        var p = self.cellXY(ev.wilds[i][0], ev.wilds[i][1]);
        self.beams.push({ x: p.x + self.cell / 2, y: p.y + self.cell / 2, born: self.time, life: 0.9 });
        var cell = self.cells[ev.wilds[i][0]][ev.wilds[i][1]];
        if (cell) cell.glow = 1;
      }
      await self.wait(900);
    })();
  };

  /* ---- particles & texts ----------------------------------------------- */
  P.burst = function (c, r, sym) {
    var p = this.cellXY(c, r), s = CFG.symbolById(sym), color = s ? s.color : '#fff';
    if (sym === 'scatter') color = '#19d3ff';
    if (sym === 'wild') color = '#ff6d86';
    for (var n = 0; n < 16; n++) {
      var a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random()) * this.cell * 5;
      this.particles.push({ x: p.x + this.cell / 2, y: p.y + this.cell / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cell * 2,
        r: 2 + Math.random() * (this.cell * 0.09), color: color, life: 1, decay: 1.6 + Math.random() });
    }
  };

  P.floatText = function (text, x, y, color) {
    this.floaters.push({ text: text, x: x, y: y, color: color || '#fff', life: 1.5 });
  };

  /* ======================================================================
   * DRAW LOOP
   * ==================================================================== */
  P.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, t = this.time;
    var dt = Math.min(0.05, t - (this.lastT || t)); this.lastT = t;

    // background: dark lab
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1226');
    sky.addColorStop(0.55, '#0c1838');
    sky.addColorStop(1, '#0a0f22');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.drawLabBackdrop(ctx);

    // drifting spores
    for (var i = 0; i < this.spores.length; i++) {
      var b = this.spores[i];
      var bx = b.x * w, by = (b.y + Math.sin(t * b.sp + b.ph) * 0.04) * h;
      var br = b.r * Math.min(w, h) * (1 + 0.2 * Math.sin(t * 1.4 + b.ph));
      ctx.fillStyle = 'hsla(' + b.hue + ',90%,65%,0.10)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }

    this.drawBoard(ctx, dt);
    this.drawMeter(ctx);
    this.drawHud(ctx);
    this.drawBeams(ctx);
    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
    this.drawPublisherPlaceholder(ctx);
  };

  P.drawLabBackdrop = function (ctx) {
    var w = this.w, h = this.h, t = this.time;
    // floor grid perspective
    ctx.save();
    ctx.strokeStyle = 'rgba(40,90,140,0.18)';
    ctx.lineWidth = 1;
    var horizon = h * 0.62;
    for (var gx = -6; gx <= 6; gx++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + gx * 22, horizon);
      ctx.lineTo(w / 2 + gx * 180, h);
      ctx.stroke();
    }
    for (var gy = 0; gy < 7; gy++) {
      var yy = horizon + Math.pow(gy / 7, 2) * (h - horizon);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }
    ctx.restore();
    // glowing tube tanks on the sides
    this.drawTube(ctx, w * 0.06, h * 0.5, h * 0.34, '#19d3ff', t);
    this.drawTube(ctx, w * 0.94, h * 0.5, h * 0.34, '#8aff3a', t + 1.5);
  };

  P.drawTube = function (ctx, x, cy, hh, color, t) {
    var ww = Math.max(22, hh * 0.18);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ART.roundRectPath(ctx, x - ww / 2, cy - hh / 2, ww, hh, ww * 0.4);
    var grd = ctx.createLinearGradient(0, cy - hh / 2, 0, cy + hh / 2);
    grd.addColorStop(0, 'rgba(20,40,60,0.5)');
    grd.addColorStop(1, color);
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    // bubbles
    for (var i = 0; i < 4; i++) {
      var by = cy + hh / 2 - ((t * (30 + i * 10) + i * 50) % hh);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * ww * 0.2, by, ww * 0.12, 0, 7); ctx.fill();
    }
    ctx.restore();
  };

  P.drawBoard = function (ctx, dt) {
    var bx = this.boardX, by = this.boardY, bw = this.boardW, bh = this.boardH, cs = this.cell;

    // frame
    ctx.save();
    ART.roundRectPath(ctx, bx - 12, by - 12, bw + 24, bh + 24, 18);
    ctx.fillStyle = 'rgba(8,16,34,0.66)';
    ctx.shadowColor = 'rgba(25,211,255,0.5)';
    ctx.shadowBlur = 26; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(70,180,235,0.8)'; ctx.stroke();
    // corner bolts
    ctx.fillStyle = 'rgba(120,200,255,0.7)';
    [[bx - 12, by - 12], [bx + bw + 12, by - 12], [bx - 12, by + bh + 12], [bx + bw + 12, by + bh + 12]]
      .forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fill(); });
    ctx.restore();

    // cell wells
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var p = this.cellXY(c, r);
        ctx.fillStyle = (c + r) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.07)';
        ART.roundRectPath(ctx, p.x + 2, p.y + 2, cs - 4, cs - 4, cs * 0.14);
        ctx.fill();
      }
    }

    // symbols (clip to board)
    ctx.save();
    ART.roundRectPath(ctx, bx - 4, by - 4, bw + 8, bh + 8, 14);
    ctx.clip();
    for (var c2 = 0; c2 < this.cols; c2++) {
      for (var r2 = 0; r2 < this.rows; r2++) {
        var cell = this.cells[c2][r2];
        if (!cell || cell.alpha <= 0 || cell.scale <= 0) continue;
        var q = this.cellXY(c2, r2);
        var size = cs * 0.96 * cell.scale;
        var ox = q.x + (cs - size) / 2;
        var oy = q.y + (cs - size) / 2 + cell.dy;
        ctx.globalAlpha = cell.alpha;
        var wob = (cell.sym === 'scatter' || cell.sym === 'orb')
          ? 1 + 0.04 * Math.sin(this.time * 4 + c2 * 1.7 + r2) : 1;
        var s2 = size * wob, sx = q.x + (cs - s2) / 2, sy = q.y + (cs - s2) / 2 + cell.dy;
        if (cell.glow > 0) {
          ctx.save();
          ctx.shadowColor = 'rgba(255,255,255,0.95)';
          ctx.shadowBlur = cs * 0.32 * (0.7 + 0.3 * Math.sin(this.time * 9));
          ART.draw(ctx, cell.sym, sx, sy, s2, cell.mult);
          ctx.restore();
        } else {
          ART.draw(ctx, cell.sym, sx, sy, s2, cell.mult);
        }
        ctx.globalAlpha = 1;
        cell.glow = Math.max(0, cell.glow - dt * 0.4);
      }
    }
    ctx.restore();
  };

  /* ---- Invasion Meter -------------------------------------------------- */
  P.drawMeter = function (ctx) {
    var cs = this.cell, cap = CFG.invasionMeter.capacity;
    var bx = this.boardX, by = this.boardY + this.boardH + Math.max(10, cs * 0.16);
    var bw = this.boardW, bh = Math.max(12, cs * 0.18);
    if (this.fsHud) return; // hide meter during free spins
    ctx.save();
    ART.roundRectPath(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(8,16,34,0.8)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(70,180,235,0.5)'; ctx.stroke();
    var frac = Math.min(1, this.meter / cap);
    if (frac > 0) {
      ctx.save();
      ART.roundRectPath(ctx, bx, by, bw, bh, bh / 2); ctx.clip();
      var grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grd.addColorStop(0, '#19d3ff'); grd.addColorStop(0.6, '#8aff3a'); grd.addColorStop(1, '#ff3b5c');
      ctx.fillStyle = grd;
      ctx.fillRect(bx, by, bw * frac, bh);
      ctx.restore();
    }
    ctx.fillStyle = '#cfe6ff';
    ctx.font = '800 ' + Math.max(9, bh * 0.62) + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('INVASION METER ' + Math.round(frac * 100) + '%', bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  };

  /* ---- HUDs ------------------------------------------------------------ */
  P.drawHud = function (ctx) {
    var cs = this.cell;
    if (this.fsHud) {
      var y = this.boardY - Math.max(24, cs * 0.46);
      // free spins counter
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var fs = Math.max(12, cs * 0.28);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      var txt = 'FREE SPINS ' + this.fsHud.index + ' / ' + this.fsHud.total;
      var tw = ctx.measureText(txt).width + fs * 2;
      ART.roundRectPath(ctx, this.boardX, y - fs, tw, fs * 2, fs);
      ctx.fillStyle = 'rgba(10,20,42,0.92)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#19d3ff'; ctx.stroke();
      ctx.fillStyle = '#19d3ff'; ctx.fillText(txt, this.boardX + tw / 2, y);
      // total multiplier
      var mtxt = 'TOTAL ×' + this.fsMult;
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      var mw = ctx.measureText(mtxt).width + fs * 2;
      ART.roundRectPath(ctx, this.boardX + this.boardW - mw, y - fs, mw, fs * 2, fs);
      ctx.fillStyle = 'rgba(40,10,70,0.92)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#c264ff'; ctx.stroke();
      ctx.fillStyle = '#e6c6ff'; ctx.fillText(mtxt, this.boardX + this.boardW - mw / 2, y);
      ctx.restore();
    }
    if (this.winBar && this.winBar.amount > 0) {
      var by = this.boardY + this.boardH + Math.max(28, cs * 0.46);
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var f2 = Math.max(13, cs * 0.32);
      ctx.font = '900 ' + f2 + 'px Arial, sans-serif';
      var label = 'WIN ' + this.fmt(this.winBar.amount);
      ctx.lineWidth = f2 * 0.18; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(5,12,26,0.9)'; ctx.strokeText(label, this.w / 2, by);
      ctx.fillStyle = '#ffe9a8'; ctx.fillText(label, this.w / 2, by);
      ctx.restore();
    }
  };

  P.drawBeams = function (ctx) {
    var alive = [];
    for (var i = 0; i < this.beams.length; i++) {
      var b = this.beams[i];
      var age = this.time - b.born, k = age / b.life;
      if (k >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#8aff3a'; ctx.lineWidth = 3 + (1 - k) * 6;
      ctx.shadowColor = '#8aff3a'; ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(this.w / 2, this.boardY - this.cell * 0.6);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
      alive.push(b);
    }
    this.beams = alive;
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
      ctx.strokeStyle = 'rgba(5,12,26,0.9)'; ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
      alive.push(f);
    }
    this.floaters = alive;
  };

  P.drawPublisherPlaceholder = function (ctx) {
    var w = 96, h = 26, x = 12, y = this.h - h - 10;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ART.roundRectPath(ctx, x, y, w, h, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,200,255,0.55)'; ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 9px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(200,225,255,0.85)';
    ctx.fillText('PUBLISHER LOGO', x + w / 2, y + h / 2);
    ctx.restore();
  };

  g.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
