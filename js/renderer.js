/* =========================================================================
 * CANDY SURGE 1000 — Renderer v2 (physics animation system)
 *
 * Pure playback layer for engine event books (never computes outcomes).
 * Animation features:
 *   - gravity-driven symbol falls with squash-and-stretch spring landings
 *   - motion-stretch on fast falls, idle bobbing, scatter wobble
 *   - scatter anticipation (slowed columns + golden spotlight + riser)
 *   - win choreography: celebrate wobble -> shockwave ring -> shard burst
 *   - screen shake scaled to cluster size
 *   - multiplier badge pop-in with gold spark bursts
 *   - candy-shower big win splashes with rotating light rays
 *   - living background: bokeh, drifting clouds, floating candies
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var ART = g.SymbolArt;

  var EASE = {
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outBack: function (t) { var s = 1.7; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
    inCubic: function (t) { return t * t * t; }
  };

  var GRAV = 62;          // cells / s^2
  var SPRING_K = 160;     // squash spring stiffness
  var SPRING_D = 13;      // squash spring damping
  var CELEB_DUR = 0.9;    // seconds of win wobble

  function Renderer(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.cols = CFG.grid.cols;
    this.rows = CFG.grid.rows;

    this.cells = [];
    this.spots = [];
    this.spotsMap = {};
    this.badgeAnims = {};
    this.particles = [];
    this.floaters = [];
    this.banner = null;
    this.fsHud = null;
    this.winBar = null;
    this.shake = 0;
    this.dimKeys = null;      // Set of "c,r" celebrating cells while others dim
    this.antiCols = null;     // {from:int} anticipation columns
    this.speed = 1;
    this.bet = 1;
    this.currency = '$';
    this.time = 0;
    this.lastT = 0;
    this.skipRequested = false;
    this.instant = false;     // headless tests: complete falls immediately
    this._fallsLeft = 0;
    this._fallResolve = null;

    // background décor
    this.bokeh = [];
    for (var i = 0; i < 26; i++)
      this.bokeh.push({ x: Math.random(), y: Math.random(), r: 0.02 + Math.random() * 0.05,
                        sp: 0.2 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2,
                        hue: [305, 270, 195, 45][i % 4] });
    this.clouds = [];
    for (var j = 0; j < 4; j++)
      this.clouds.push({ x: Math.random(), y: 0.1 + Math.random() * 0.5,
                         w: 0.22 + Math.random() * 0.2, sp: 0.006 + Math.random() * 0.01 });
    this.bgCandy = [];
    var ids = CFG.symbols.map(function (s) { return s.id; });
    for (var k = 0; k < 7; k++)
      this.bgCandy.push({ x: Math.random(), y: Math.random(), sym: ids[k % ids.length],
                          sp: 0.012 + Math.random() * 0.02, rot: Math.random() * 6,
                          rv: (Math.random() - 0.5) * 0.4, sc: 0.5 + Math.random() * 0.7 });

    this.initIdleGrid();
    this.resize();

    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    canvas.addEventListener('pointerdown', function () { self.skipRequested = true; });

    var loop = function (t) {
      var dt = Math.min(0.05, (t - self.lastT) / 1000 || 0.016);
      self.lastT = t;
      self.time = t / 1000;
      self.update(dt * self.speed);
      self.draw(dt * self.speed);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  var P = Renderer.prototype;

  P.mkCell = function (sym) {
    return { sym: sym, dy: 0, vy: 0, fallDelay: 0, falling: false,
             sx: 1, sy: 1, svx: 0, svy: 0, rot: 0,
             alpha: 1, glow: 0, celeb: -1, phase: Math.random() * Math.PI * 2 };
  };

  P.initIdleGrid = function () {
    var ids = CFG.symbols.map(function (s) { return s.id; });
    for (var c = 0; c < this.cols; c++) {
      this.cells[c] = [];
      for (var r = 0; r < this.rows; r++)
        this.cells[c][r] = this.mkCell(ids[(Math.random() * ids.length) | 0]);
    }
  };

  /* ---- layout ------------------------------------------------------------ */
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

  P.wait = function (ms) {
    var self = this;
    return new Promise(function (res) { setTimeout(res, ms / self.speed); });
  };

  P.fmt = function (x) {
    var v = x * this.bet;
    return this.currency + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---- per-frame simulation ------------------------------------------------ */
  P.update = function (dt) {
    var g0 = GRAV * this.cell;
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var cell = this.cells[c][r];
        if (!cell) continue;

        if (cell.fallDelay > 0) {
          cell.fallDelay -= dt;
          if (cell.fallDelay <= 0) cell.falling = true;
        } else if (cell.falling) {
          cell.vy += g0 * dt;
          cell.dy += cell.vy * dt;
          if (cell.dy >= 0) {
            cell.dy = 0;
            cell.falling = false;
            // squash & stretch on impact, scaled by impact speed
            var imp = Math.min(1, cell.vy / (g0 * 0.55));
            cell.sy = 1 - 0.32 * imp;
            cell.sx = 1 + 0.3 * imp;
            cell.svx = 0; cell.svy = 0;
            cell.vy = 0;
            this.onCellLanded(c, r, cell);
          }
        }

        // squash spring back to 1
        if (cell.sx !== 1 || cell.sy !== 1 || cell.svx || cell.svy) {
          cell.svx += (1 - cell.sx) * SPRING_K * dt - cell.svx * SPRING_D * dt;
          cell.svy += (1 - cell.sy) * SPRING_K * dt - cell.svy * SPRING_D * dt;
          cell.sx += cell.svx * dt;
          cell.sy += cell.svy * dt;
          if (Math.abs(cell.sx - 1) < 0.002 && Math.abs(cell.svx) < 0.01) { cell.sx = 1; cell.svx = 0; }
          if (Math.abs(cell.sy - 1) < 0.002 && Math.abs(cell.svy) < 0.01) { cell.sy = 1; cell.svy = 0; }
        }

        if (cell.celeb >= 0) cell.celeb += dt;
        cell.glow = Math.max(0, cell.glow - dt * 0.5);
      }
    }
    this.shake *= Math.exp(-6 * dt);
    if (this.shake < 0.15) this.shake = 0;
  };

  P.onCellLanded = function (c, r, cell) {
    var self = this;
    if (this._fallsLeft > 0) {
      this._fallsLeft--;
      if (this._fallsLeft === 0 && this._fallResolve) {
        var res = this._fallResolve;
        this._fallResolve = null;
        this.antiCols = null;
        setTimeout(function () { res(); }, 60 / self.speed);
      }
    }
    if (r === this.rows - 1) this.sfx.land(c);
    if (cell.sym === 'scatter') {
      this.sfx.scatter();
      var p = this.cellXY(c, r);
      this.sparkBurst(p.x + this.cell / 2, p.y + this.cell / 2, 8, '#ffd24a');
      this.shake = Math.max(this.shake, 2.5);
    }
  };

  /* schedule falls for every cell that has dy < 0; returns a completion promise */
  P.beginFalls = function () {
    var self = this;
    var n = 0;
    for (var c = 0; c < this.cols; c++)
      for (var r = 0; r < this.rows; r++) {
        var cell = this.cells[c][r];
        if (cell && cell.dy < 0) n++;
      }
    if (n === 0 || this.instant) {
      for (var c2 = 0; c2 < this.cols; c2++)
        for (var r2 = 0; r2 < this.rows; r2++) {
          var cl = this.cells[c2][r2];
          if (cl) { cl.dy = 0; cl.falling = false; cl.fallDelay = 0; cl.vy = 0; }
        }
      this.antiCols = null;
      return Promise.resolve();
    }
    this._fallsLeft = n;
    return new Promise(function (res) { self._fallResolve = res; });
  };

  /* ======================================================================
   * BOOK PLAYBACK (event contract unchanged from engine)
   * ==================================================================== */
  P.playBook = function (book, opts) {
    var self = this;
    this.bet = opts.bet;
    this.speed = opts.turbo ? 2.4 : 1;
    this.skipRequested = false;
    var onWin = opts.onWin || function () {};

    return (async function () {
      var inFs = false, fsWinSoFar = 0;

      for (var i = 0; i < book.events.length; i++) {
        var ev = book.events[i];
        switch (ev.type) {
          case 'reveal':
            self.setSpots(ev.spots, true);
            await self.animReveal(ev.grid);
            break;

          case 'win':
            await self.animWin(ev);
            var totalNow = inFs ? fsWinSoFar + ev.spinWin : ev.spinWin;
            self.winBar = { amount: totalNow, tumbles: ev.tumbleIndex + 1 };
            if (self.fsHud) self.fsHud.win = fsWinSoFar + ev.spinWin;
            onWin(totalNow);
            break;

          case 'tumble':
            await self.animTumble(ev.grid);
            self.setSpots(ev.spots, true);
            break;

          case 'scatterPay':
            self.sfx.scatter();
            self.floatText('SCATTER PAYS ' + self.fmt(ev.pay), self.w / 2, self.boardY - 14, '#ffd24a');
            await self.wait(700);
            break;

          case 'fsTrigger':
            self.sfx.bonus();
            await self.splash('FREE SPINS!', ev.spins + ' FREE SPINS — MULTIPLIER SPOTS STICK', 2300, '#ff7ad9', true);
            inFs = true;
            fsWinSoFar = 0;
            self.fsHud = { index: 0, total: ev.spins, win: 0 };
            break;

          case 'fsSpin':
            self.fsHud.index = ev.index;
            self.fsHud.total = ev.total;
            fsWinSoFar = self.fsHud.win;
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
            self.setSpots(ev.spots, false);
            self.sfx.multiplier();
            self.floatText('SUPER MULTIPLIERS PLACED!', self.w / 2, self.boardY - 14, '#ffd24a');
            await self.wait(900);
            break;

          case 'fsEnd':
            await self.wait(300);
            await self.splash('BONUS COMPLETE', 'TOTAL WIN ' + self.fmt(ev.totalWin), 2300, '#ffd24a');
            self.fsHud = null;
            inFs = false;
            break;

          case 'maxWin':
            self.sfx.maxWin();
            await self.splash('MAX WIN!', CFG.maxWinX.toLocaleString() + '× — ' + self.fmt(ev.totalWin), 3200, '#ff4d6d', true);
            break;

          case 'roundEnd':
            if (ev.totalWin > 0) {
              self.winBar = { amount: ev.totalWin, tumbles: 0 };
              onWin(ev.totalWin);
              if (ev.totalWin >= 20 && ev.totalWin < CFG.maxWinX)
                await self.bigWinSplash(ev.totalWin);
            }
            break;
        }
      }
    })();
  };

  /* ---- reveal with scatter anticipation ------------------------------------- */
  P.animReveal = function (grid) {
    this.winBar = null;
    this.sfx.spin();

    // anticipation: after the column holding the 2nd scatter, later columns slow
    var scatCols = [];
    for (var c = 0; c < this.cols; c++)
      for (var r = 0; r < this.rows; r++)
        if (grid[c][r] === 'scatter' && scatCols.indexOf(c) < 0) scatCols.push(c);
    var antiFrom = (scatCols.length >= 2 && scatCols[1] < this.cols - 1) ? scatCols[1] + 1 : -1;

    var riserAt = -1;
    for (var c2 = 0; c2 < this.cols; c2++) {
      var colDelay = c2 * 0.055;
      if (antiFrom >= 0 && c2 >= antiFrom) {
        colDelay += 0.25 + (c2 - antiFrom + 1) * 0.5;
        if (riserAt < 0) riserAt = antiFrom * 0.055 + 0.35;
      }
      for (var r2 = 0; r2 < this.rows; r2++) {
        var cell = this.mkCell(grid[c2][r2]);
        cell.dy = -(this.boardY + (this.rows - r2 + 1.5) * this.cell);
        cell.vy = 0;
        cell.fallDelay = colDelay + (this.rows - r2) * 0.022;
        cell.falling = false;
        this.cells[c2][r2] = cell;
      }
    }
    if (antiFrom >= 0 && !this.instant) {
      this.antiCols = { from: antiFrom };
      var self = this;
      setTimeout(function () { if (self.antiCols) self.sfx.riser(); }, (riserAt * 1000) / this.speed);
    }
    return this.beginFalls();
  };

  /* ---- win choreography: celebrate -> shockwave -> shatter -------------------- */
  P.animWin = function (ev) {
    var self = this;
    return (async function () {
      var k, i, cl;
      // celebrate: winners wobble & glow, everything else dims
      self.dimKeys = {};
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        for (i = 0; i < cl.cells.length; i++) {
          var cc = self.cells[cl.cells[i][0]][cl.cells[i][1]];
          if (cc) { cc.glow = 1; cc.celeb = 0; }
          self.dimKeys[cl.cells[i][0] + ',' + cl.cells[i][1]] = true;
        }
      }
      self.sfx.winChime(ev.tumbleIndex);
      await self.wait(430);

      // pays
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        var cx = 0, cy = 0;
        for (i = 0; i < cl.cells.length; i++) {
          var p = self.cellXY(cl.cells[i][0], cl.cells[i][1]);
          cx += p.x + self.cell / 2; cy += p.y + self.cell / 2;
        }
        cx /= cl.cells.length; cy /= cl.cells.length;
        var label = self.fmt(cl.pay) + (cl.multSum > 0 ? '  (x' + cl.multSum + ')' : '');
        self.floatText(label, cx, cy, cl.multSum > 0 ? '#ffd24a' : '#ffffff', cl.multSum > 0);
        if (cl.multSum > 0) self.sfx.multiplier();
      }
      await self.wait(400);

      // shatter
      self.sfx.pop(ev.tumbleIndex);
      var totalCells = 0;
      for (k = 0; k < ev.clusters.length; k++) {
        cl = ev.clusters[k];
        totalCells += cl.cells.length;
        var rx = 0, ry = 0;
        for (i = 0; i < cl.cells.length; i++) {
          var c0 = cl.cells[i][0], r0 = cl.cells[i][1];
          var q = self.cellXY(c0, r0);
          rx += q.x + self.cell / 2; ry += q.y + self.cell / 2;
          var cell2 = self.cells[c0][r0];
          if (cell2) self.shatter(c0, r0, cell2.sym);
          self.cells[c0][r0] = null;
        }
        self.particles.push({ type: 'ring', x: rx / cl.cells.length, y: ry / cl.cells.length,
                              r: self.cell * 0.4, vr: self.cell * 9, life: 0.5, decay: 2,
                              color: 'rgba(255,255,255,0.85)', lw: self.cell * 0.08 });
      }
      self.shake = Math.max(self.shake, Math.min(14, 3 + totalCells * 0.35));
      self.dimKeys = null;
      self.setSpots(ev.spots, false);
      await self.wait(170);
    })();
  };

  /* ---- tumble ------------------------------------------------------------------ */
  P.animTumble = function (newGrid) {
    for (var c = 0; c < this.cols; c++) {
      var kept = [];
      for (var r = 0; r < this.rows; r++) if (this.cells[c][r]) kept.push({ cell: this.cells[c][r], row: r });
      var newCount = this.rows - kept.length;
      var col = [];
      for (var n = 0; n < newCount; n++) {
        var cell = this.mkCell(newGrid[c][n]);
        cell.dy = -((newCount - n + 1.2) * this.cell + 14);
        cell.fallDelay = c * 0.02 + 0.04;
        col.push(cell);
      }
      for (var kp = 0; kp < kept.length; kp++) {
        var target = newCount + kp;
        var kc = kept[kp].cell;
        kc.dy = (kept[kp].row - target) * this.cell;  // <= 0
        if (kc.dy < 0) { kc.fallDelay = c * 0.02; kc.vy = 0; }
        col.push(kc);
      }
      for (var r2 = 0; r2 < this.rows; r2++) this.cells[c][r2] = col[r2];
    }
    var self = this;
    return this.beginFalls().then(function () { return self.wait(80); });
  };

  /* ---- multiplier spots with badge pop tracking ---------------------------------- */
  P.setSpots = function (spots, silent) {
    var map = {}, i, key;
    for (i = 0; i < spots.length; i++) {
      key = spots[i].c + ',' + spots[i].r;
      map[key] = spots[i].value;
      if (!silent && spots[i].value >= 2 && (this.spotsMap[key] || 0) < spots[i].value) {
        this.badgeAnims[key] = this.time;
        var p = this.cellXY(spots[i].c, spots[i].r);
        this.sparkBurst(p.x + this.cell / 2, p.y + this.cell - this.cell * 0.16, 7, '#ffc83d');
      }
    }
    this.spots = spots;
    this.spotsMap = map;
  };

  /* ---- particles ------------------------------------------------------------------ */
  P.shatter = function (c, r, sym) {
    var p = this.cellXY(c, r), color = '#fff', color2 = '#caa';
    for (var i = 0; i < CFG.symbols.length; i++)
      if (CFG.symbols[i].id === sym) { color = CFG.symbols[i].color; color2 = CFG.symbols[i].color2; }
    if (sym === 'scatter') { color = '#ffd24a'; color2 = '#e08a00'; }
    var cx = p.x + this.cell / 2, cy = p.y + this.cell / 2;
    for (var n = 0; n < 7; n++) {
      var a = Math.random() * Math.PI * 2, sp = (0.5 + Math.random()) * this.cell * 6;
      this.particles.push({ type: 'shard', x: cx, y: cy,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cell * 2.5,
                            r: this.cell * (0.08 + Math.random() * 0.1),
                            rot: Math.random() * 6, rv: (Math.random() - 0.5) * 18,
                            color: n % 2 ? color : color2, life: 0.9, decay: 1.3 + Math.random() * 0.6 });
    }
    this.sparkBurst(cx, cy, 8, color);
  };

  P.sparkBurst = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random()) * this.cell * 4;
      this.particles.push({ type: 'spark', x: x, y: y,
                            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cell,
                            r: 1.5 + Math.random() * 3, color: color,
                            life: 0.7, decay: 1.8 + Math.random() });
    }
  };

  P.candyRain = function (n) {
    var ids = CFG.symbols.map(function (s) { return s.id; });
    for (var i = 0; i < n; i++) {
      this.particles.push({ type: 'candy', x: Math.random() * this.w, y: -40 - Math.random() * 60,
                            vx: (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 160,
                            r: this.cell * (0.35 + Math.random() * 0.4),
                            rot: Math.random() * 6, rv: (Math.random() - 0.5) * 6,
                            sym: ids[(Math.random() * ids.length) | 0], life: 6, decay: 0 });
    }
  };

  P.floatText = function (text, x, y, color, big) {
    this.floaters.push({ text: text, x: x, y: y, color: color || '#fff', life: 1.6, big: !!big, born: this.time });
  };

  /* ---- splashes --------------------------------------------------------------------- */
  P.splash = function (title, sub, ms, color, wipe) {
    var self = this;
    this.banner = { title: title, sub: sub, color: color, born: this.time, wipe: !!wipe };
    this.shake = Math.max(this.shake, 4);
    for (var n = 0; n < 60; n++) {
      this.particles.push({ type: 'confetti',
        x: this.w / 2 + (Math.random() - 0.5) * this.w * 0.5,
        y: this.h / 2 + (Math.random() - 0.5) * this.h * 0.25,
        vx: (Math.random() - 0.5) * 600, vy: -250 - Math.random() * 450,
        r: 3 + Math.random() * 5, rot: Math.random() * 6, rv: (Math.random() - 0.5) * 14,
        color: ['#ff7ad9', '#ffd24a', '#5ee06a', '#4fc3ff'][n % 4], life: 1.6, decay: 0.75 });
    }
    return this.wait(ms).then(function () { self.banner = null; });
  };

  P.bigWinSplash = function (x) {
    var self = this;
    var tier = x >= 500 ? 'EPIC WIN' : x >= 100 ? 'MEGA WIN' : x >= 40 ? 'SUPER WIN' : 'BIG WIN';
    self.sfx.bigWin();
    self.skipRequested = false;
    self.banner = { title: tier, sub: self.fmt(0), color: '#ffd24a', born: self.time, rays: true };
    var dur = Math.min(3000, 1100 + x * 8);
    var t0 = performance.now();
    return new Promise(function (res) {
      var lastTick = 0, lastRain = 0;
      function step(t) {
        var k = Math.min(1, (t - t0) / (dur / self.speed));
        if (self.skipRequested) k = 1;
        if (self.banner) self.banner.sub = self.fmt(x * EASE.outCubic(k));
        if (t - lastTick > 60) { self.sfx.tick(); lastTick = t; }
        if (t - lastRain > 90 && k < 1) { self.candyRain(2); lastRain = t; }
        if (k < 1) requestAnimationFrame(step);
        else setTimeout(function () { self.banner = null; res(); }, 750 / self.speed);
      }
      requestAnimationFrame(step);
    });
  };

  /* ======================================================================
   * DRAWING
   * ==================================================================== */
  P.draw = function (dt) {
    var ctx = this.ctx, w = this.w, h = this.h, t = this.time;

    /* --- background --- */
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b1055');
    sky.addColorStop(0.55, '#5b2a86');
    sky.addColorStop(1, '#b0447c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < this.bokeh.length; i++) {
      var b = this.bokeh[i];
      var bx = b.x * w, by = (b.y + Math.sin(t * b.sp + b.ph) * 0.02) * h;
      var br = b.r * Math.min(w, h) * (1 + 0.15 * Math.sin(t * 1.3 + b.ph));
      ctx.fillStyle = 'hsla(' + b.hue + ',90%,75%,0.10)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }

    // drifting clouds
    for (var cd = 0; cd < this.clouds.length; cd++) {
      var cl = this.clouds[cd];
      cl.x += cl.sp * dt;
      if (cl.x > 1.3) cl.x = -0.3;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.ellipse(cl.x * w, cl.y * h, cl.w * w, cl.w * w * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // floating background candies
    for (var bc = 0; bc < this.bgCandy.length; bc++) {
      var f = this.bgCandy[bc];
      f.y -= f.sp * dt;
      f.rot += f.rv * dt;
      if (f.y < -0.1) { f.y = 1.1; f.x = Math.random(); }
      var size = this.cell * f.sc;
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.translate(f.x * w, f.y * h);
      ctx.rotate(f.rot);
      ART.draw(ctx, f.sym, -size / 2, -size / 2, size);
      ctx.restore();
    }

    // candy hills
    ctx.fillStyle = 'rgba(255,122,217,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (var hx = 0; hx <= w; hx += 8)
      ctx.lineTo(hx, h - 30 - Math.sin(hx / 140 + 1) * 18);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    /* --- shaken scene: logo, board, HUD --- */
    ctx.save();
    if (this.shake > 0)
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.drawLogo(ctx, t);
    this.drawBoard(ctx, t);
    this.drawHud(ctx);
    ctx.restore();

    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
    if (this.banner) this.drawBanner(ctx, t);
    this.drawPublisherPlaceholder(ctx);
  };

  P.drawLogo = function (ctx, t) {
    var cx = this.w / 2, y = Math.max(30, this.boardY * 0.42);
    var size = Math.max(20, Math.min(34, this.w * 0.034));
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(1 + 0.012 * Math.sin(t * 2.1), 1 + 0.012 * Math.sin(t * 2.1));
    ctx.textAlign = 'center';
    ctx.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = size * 0.22;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b1a4d';
    ctx.strokeText('CANDY SURGE', 0, 0);
    var shimmer = Math.sin(t * 1.4) * 0.5 + 0.5;
    var grad = ctx.createLinearGradient(-size * 4, -size, size * 4, 0);
    grad.addColorStop(0, '#ffe9f7');
    grad.addColorStop(Math.max(0.01, Math.min(0.99, shimmer)), '#fff');
    grad.addColorStop(1, '#ff3fa0');
    ctx.fillStyle = grad;
    ctx.fillText('CANDY SURGE', 0, 0);
    ctx.font = '900 ' + size * 0.72 + 'px "Arial Black", Arial, sans-serif';
    ctx.strokeStyle = '#7a3c00';
    ctx.lineWidth = size * 0.18;
    ctx.strokeText('1000', size * 5.2, -size * 0.1);
    ctx.fillStyle = '#ffd24a';
    ctx.fillText('1000', size * 5.2, -size * 0.1);
    ctx.font = '700 ' + Math.max(9, size * 0.34) + 'px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('WIN UP TO ' + CFG.maxWinX.toLocaleString() + '×', 0, size * 0.62);
    ctx.restore();
  };

  P.drawBoard = function (ctx, t) {
    var bx = this.boardX, by = this.boardY, bw = this.boardW, bh = this.boardH, cs = this.cell;

    // frame with breathing glow
    ctx.save();
    ART.roundRectPath(ctx, bx - 10, by - 10, bw + 20, bh + 20, 18);
    ctx.fillStyle = 'rgba(20,6,40,0.55)';
    ctx.shadowColor = 'rgba(255,122,217,0.55)';
    ctx.shadowBlur = 20 + 7 * Math.sin(t * 1.6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,160,225,0.8)';
    ctx.stroke();
    ctx.restore();

    // cells
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var p = this.cellXY(c, r);
        ctx.fillStyle = (c + r) % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.085)';
        ART.roundRectPath(ctx, p.x + 1.5, p.y + 1.5, cs - 3, cs - 3, cs * 0.16);
        ctx.fill();
      }
    }

    // anticipation spotlight on pending columns
    if (this.antiCols) {
      for (var ac = this.antiCols.from; ac < this.cols; ac++) {
        var landedAll = true;
        for (var ar = 0; ar < this.rows; ar++) {
          var acell = this.cells[ac][ar];
          if (acell && (acell.dy < 0 || acell.fallDelay > 0)) { landedAll = false; break; }
        }
        if (landedAll) continue;
        var ap = this.cellXY(ac, 0);
        var pulse = 0.5 + 0.5 * Math.sin(t * 8);
        ctx.save();
        ART.roundRectPath(ctx, ap.x + 1, this.boardY + 1, cs - 2, this.boardH - 2, cs * 0.14);
        ctx.fillStyle = 'rgba(255,210,74,' + (0.1 + 0.12 * pulse) + ')';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,210,74,' + (0.5 + 0.4 * pulse) + ')';
        ctx.stroke();
        ctx.restore();
      }
    }

    // multiplier spot underlays
    for (var s = 0; s < this.spots.length; s++) {
      var sp = this.spots[s];
      var pp = this.cellXY(sp.c, sp.r);
      if (sp.value >= 2) {
        var pulse2 = 1 + 0.06 * Math.sin(t * 5 + sp.c + sp.r);
        ctx.save();
        ART.roundRectPath(ctx, pp.x + 2, pp.y + 2, cs - 4, cs - 4, cs * 0.16);
        ctx.fillStyle = 'rgba(255,210,74,0.20)';
        ctx.fill();
        ctx.lineWidth = 2 * pulse2;
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

    // symbols
    ctx.save();
    ART.roundRectPath(ctx, bx - 4, by - 4, bw + 8, bh + 8, 14);
    ctx.clip();
    for (var c2 = 0; c2 < this.cols; c2++) {
      for (var r2 = 0; r2 < this.rows; r2++) {
        var cell = this.cells[c2][r2];
        if (!cell || cell.alpha <= 0) continue;
        var q = this.cellXY(c2, r2);
        var key = c2 + ',' + r2;
        var dim = this.dimKeys && !this.dimKeys[key];

        var scale = 1, wob = 0;
        if (cell.celeb >= 0 && cell.celeb < CELEB_DUR) {
          scale = 1 + 0.16 * Math.sin(cell.celeb * 9.5) * (1 - cell.celeb / CELEB_DUR + 0.4);
          wob = 0.1 * Math.sin(cell.celeb * 13 + cell.phase);
        } else if (cell.celeb >= CELEB_DUR) {
          cell.celeb = -1;
        }

        var bob = 0, rotIdle = 0;
        var settled = !cell.falling && cell.fallDelay <= 0 && cell.dy === 0;
        if (settled && cell.celeb < 0) {
          bob = Math.sin(t * 1.7 + cell.phase) * cs * 0.013;
          if (cell.sym === 'scatter') {
            rotIdle = 0.08 * Math.sin(t * 3 + cell.phase);
            scale *= 1 + 0.045 * Math.sin(t * 4 + cell.phase);
          }
        }

        var size = cs * 0.94;
        var cxp = q.x + cs / 2;
        var cyp = q.y + cs / 2 + cell.dy + bob;

        ctx.save();
        ctx.globalAlpha = cell.alpha * (dim ? 0.42 : 1);
        ctx.translate(cxp, cyp);
        ctx.rotate(cell.rot + wob + rotIdle);
        // motion stretch while falling fast
        var stretch = cell.falling ? Math.min(0.22, cell.vy / (GRAV * cs * 0.9)) : 0;
        ctx.scale(cell.sx * scale * (1 - stretch * 0.4), cell.sy * scale * (1 + stretch));
        if (cell.glow > 0.02) {
          ctx.shadowColor = 'rgba(255,255,255,0.95)';
          ctx.shadowBlur = cs * 0.4 * cell.glow * (0.7 + 0.3 * Math.sin(t * 9));
        }
        // falling ghost trail
        if (stretch > 0.06) {
          ctx.globalAlpha = cell.alpha * 0.2;
          ART.draw(ctx, cell.sym, -size / 2, -size / 2 - cell.vy * 0.016, size);
          ctx.globalAlpha = cell.alpha * (dim ? 0.42 : 1);
        }
        ART.draw(ctx, cell.sym, -size / 2, -size / 2, size);
        ctx.restore();
      }
    }
    ctx.restore();

    // multiplier badges (with pop-in)
    for (var s2 = 0; s2 < this.spots.length; s2++) {
      var sp2 = this.spots[s2];
      if (sp2.value < 2) continue;
      var pq = this.cellXY(sp2.c, sp2.r);
      var bkey = sp2.c + ',' + sp2.r;
      var pop = 1;
      if (this.badgeAnims[bkey] != null) {
        var age = (t - this.badgeAnims[bkey]) * 3.2;
        if (age < 1) pop = EASE.outBack(Math.max(0, age)); else delete this.badgeAnims[bkey];
      }
      this.drawMultBadge(ctx, pq.x + cs / 2, pq.y + cs - cs * 0.16, cs, sp2.value, pop);
    }
  };

  P.drawMultBadge = function (ctx, cx, cy, cs, value, pop) {
    var label = 'x' + value;
    var fs = Math.max(10, cs * (label.length > 4 ? 0.2 : 0.26));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.font = '900 ' + fs + 'px Arial, sans-serif';
    var tw = ctx.measureText(label).width;
    var pw = tw + fs * 0.9, ph = fs * 1.45;
    var grd = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
    grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffc83d'); grd.addColorStop(1, '#e08a00');
    ART.roundRectPath(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
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
    ctx.fillText(label, 0, fs * 0.06);
    ctx.restore();
  };

  P.drawHud = function (ctx) {
    var cs = this.cell;
    if (this.fsHud) {
      var y = this.boardY - Math.max(26, cs * 0.42);
      ctx.save();
      ctx.textAlign = 'center';
      var fs = Math.max(12, cs * 0.3);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      var txt = 'FREE SPINS ' + this.fsHud.index + ' / ' + this.fsHud.total;
      if (this.fsHud.win > 0) txt += '   •   ' + this.fmt(this.fsHud.win);
      var tw = ctx.measureText(txt).width + fs * 2;
      ART.roundRectPath(ctx, this.w / 2 - tw / 2, y - fs, tw, fs * 2, fs);
      ctx.fillStyle = 'rgba(91,26,77,0.9)';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ff7ad9'; ctx.stroke();
      // progress bar
      var prog = Math.min(1, this.fsHud.index / Math.max(1, this.fsHud.total));
      ART.roundRectPath(ctx, this.w / 2 - tw / 2 + 4, y + fs - 5, (tw - 8) * prog, 3, 1.5);
      ctx.fillStyle = '#ffd24a';
      ctx.fill();
      ctx.fillStyle = '#ffd24a';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, this.w / 2, y + 1);
      ctx.restore();
    }
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
      if (p.decay) p.life -= dt * p.decay; else p.life -= dt * 0.16;
      if (p.life <= 0) continue;
      switch (p.type) {
        case 'spark':
          p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, p.life * 1.5);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          break;
        case 'shard':
          p.vy += 1100 * dt; p.x += p.vx * dt; p.y += p.y >= this.h + 40 ? 0 : p.vy * dt;
          p.rot += p.rv * dt;
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.life * 1.3);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.8, p.r * 0.6); ctx.lineTo(-p.r * 0.8, p.r * 0.6);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        case 'ring':
          p.r += p.vr * dt;
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.life * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.lw * Math.max(0.2, p.life);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          break;
        case 'candy':
          p.vy += 300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rv * dt;
          if (p.y > this.h + 80) continue;
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.life);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ART.draw(ctx, p.sym, -p.r / 2, -p.r / 2, p.r);
          ctx.restore();
          break;
        case 'confetti':
          p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rv * dt;
          ctx.save();
          ctx.globalAlpha = Math.min(1, p.life);
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
          ctx.restore();
          break;
      }
      alive.push(p);
    }
    this.particles = alive;
  };

  P.drawFloaters = function (ctx, dt) {
    var alive = [];
    for (var i = 0; i < this.floaters.length; i++) {
      var f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) continue;
      f.y -= 26 * dt;
      var pop = EASE.outBack(Math.min(1, (this.time - f.born) * 5));
      var fs = Math.max(13, this.cell * (f.big ? 0.38 : 0.3)) * pop;
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

  P.drawBanner = function (ctx, t) {
    var b = this.banner;
    var age = t - b.born;
    var pop = EASE.outBack(Math.min(1, age * 3.5));
    ctx.save();

    // radial wipe-in
    if (b.wipe && age < 0.45) {
      var wr = EASE.outCubic(age / 0.45) * Math.max(this.w, this.h) * 0.85;
      var wg = ctx.createRadialGradient(this.w / 2, this.h / 2, wr * 0.4, this.w / 2, this.h / 2, wr);
      wg.addColorStop(0, 'rgba(255,122,217,0.0)');
      wg.addColorStop(0.85, 'rgba(255,122,217,0.5)');
      wg.addColorStop(1, 'rgba(255,122,217,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.fillStyle = 'rgba(15,5,30,0.62)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(this.w / 2, this.h / 2);

    // rotating light rays
    ctx.save();
    ctx.rotate(t * 0.5);
    for (var rr = 0; rr < 12; rr++) {
      ctx.rotate(Math.PI / 6);
      var ray = ctx.createLinearGradient(0, 0, this.w * 0.55, 0);
      ray.addColorStop(0, 'rgba(255,210,74,' + (b.rays ? 0.16 : 0.07) + ')');
      ray.addColorStop(1, 'rgba(255,210,74,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.w * 0.55, -0.09, 0.09);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.scale(pop, pop);
    var breathe = 1 + 0.02 * Math.sin(t * 6);
    ctx.scale(breathe, breathe);
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
