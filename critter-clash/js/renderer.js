/* =========================================================================
 * CRITTER CLASH 1000 — Renderer
 *
 * Pure playback layer: receives event "books" from the engine and animates
 * them. Never computes game outcomes. The 6×5 board, creature multiplier
 * badges, column battles and HUD are drawn on the canvas; the big cinematic
 * moments (battle screen, total-multiplier calculation, win screens, free
 * spins trigger / summary) are DOM overlays defined in index.html.
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

  function $(id) { return document.getElementById(id); }

  function Renderer(canvas, sfx) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sfx = sfx;
    this.cols = CFG.grid.cols;
    this.rows = CFG.grid.rows;

    this.cells = [];          // [c][r] -> {sym, mult, dy, scale, alpha, glow, dead, winner}
    this.particles = [];
    this.floaters = [];
    this.banner = null;       // transient canvas banner (max win / good luck)
    this.fsHud = null;        // {index, total, carry}
    this.totalBar = null;     // {value, label} under the board
    this.columnChips = [];    // [{col, value}] battle results
    this.battleFocus = -1;    // spotlight column during a battle
    this.vsCol = -1;          // column currently showing a VS badge
    this.speed = 1;
    this.bet = 1;
    this.currency = '$';
    this.time = 0;
    this.skipRequested = false;
    this.settings = { shake: true, battleAnim: true, winAnim: true };

    this.bokeh = [];
    for (var i = 0; i < 22; i++) {
      this.bokeh.push({ x: Math.random(), y: Math.random(), r: 0.02 + Math.random() * 0.05,
                        sp: 0.2 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2,
                        hue: [265, 215, 35, 150][i % 4] });
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
    var ids = CFG.lows.map(function (s) { return s.id; })
      .concat(CFG.creatures.slice(0, 4).map(function (s) { return s.id; }));
    for (var c = 0; c < this.cols; c++) {
      this.cells[c] = [];
      for (var r = 0; r < this.rows; r++) {
        var sym = ids[(Math.random() * ids.length) | 0];
        this.cells[c][r] = this.mkCell(sym, CFG.isCreature(sym) ? 2 : 0);
      }
    }
  };

  P.mkCell = function (sym, mult) {
    return { sym: sym, mult: mult || 0, dy: 0, scale: 1, alpha: 1, glow: 0, dead: false, winner: false };
  };

  /* ---- layout (portrait stage) ------------------------------------------ */
  P.resize = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(300, rect.width);
    this.h = Math.max(300, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var topH = Math.max(40, this.h * 0.1);     // FS HUD strip
    var botH = Math.max(44, this.h * 0.12);    // total multiplier bar + win bar
    var availH = this.h - topH - botH - 12;
    var availW = this.w - 16;
    this.cell = Math.floor(Math.min(availW / this.cols, availH / this.rows));
    this.boardW = this.cell * this.cols;
    this.boardH = this.cell * this.rows;
    this.boardX = (this.w - this.boardW) / 2;
    this.boardY = topH + (availH - this.boardH) / 2 + 6;
  };

  P.cellXY = function (c, r) {
    return { x: this.boardX + c * this.cell, y: this.boardY + r * this.cell };
  };

  /* ---- timing helpers ----------------------------------------------------- */
  P.wait = function (ms) {
    var self = this;
    return new Promise(function (res) { setTimeout(res, ms / self.speed); });
  };

  // wait that can be cut short by tapping the canvas
  P.waitSkippable = function (ms) {
    var self = this;
    self.skipRequested = false;
    return new Promise(function (res) {
      var t0 = performance.now();
      (function check() {
        if (self.skipRequested || performance.now() - t0 >= ms / self.speed) res();
        else requestAnimationFrame(check);
      })();
    });
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

  P.shake = function () {
    if (!this.settings.shake) return;
    var app = $('app');
    app.classList.remove('shake');
    void app.offsetWidth; // restart the animation
    app.classList.add('shake');
  };

  P.showOv = function (id) { $(id).classList.add('open'); };
  P.hideOv = function (id) { $(id).classList.remove('open'); };

  /* ======================================================================
   * BOOK PLAYBACK
   * ==================================================================== */
  P.playBook = function (book, opts) {
    var self = this;
    this.bet = opts.bet;
    this.settings = opts.settings || this.settings;
    this.speed = this.settings.turbo ? 2.2 : 1;
    var onWin = opts.onWin || function () {};

    return (async function () {
      var inFs = false, fsWinSoFar = 0, lastBattles = null;
      var fsBestSpin = 0, fsLastCarry = 0, sawMultApply = false;

      for (var i = 0; i < book.events.length; i++) {
        var ev = book.events[i];
        switch (ev.type) {
          case 'reveal':
            self.columnChips = [];
            self.totalBar = null;
            self.winBar = null;
            lastBattles = null;
            sawMultApply = false;
            await self.animReveal(ev.grid, ev.mults);
            break;

          case 'win':
            await self.animWin(ev);
            break;

          case 'battles':
            lastBattles = ev;
            await self.animBattles(ev, inFs);
            break;

          case 'carryUpdate':
            fsLastCarry = ev.carry;
            if (self.fsHud) self.fsHud.carry = ev.carry;
            self.sfx.multiplier();
            self.floatText('CARRY-OVER x' + ev.carry, self.w / 2, self.boardY - 16, '#ffd24a');
            await self.wait(550);
            break;

          case 'multApply':
            sawMultApply = true;
            await self.animMultApply(ev, lastBattles);
            break;

          case 'spinWin':
            self.winBar = { amount: ev.win };
            if (inFs) {
              fsWinSoFar += ev.win;
              if (ev.win > fsBestSpin) fsBestSpin = ev.win;
              if (self.fsHud) self.fsHud.win = fsWinSoFar;
            }
            onWin(inFs ? fsWinSoFar : ev.win);
            await self.wait(350);
            break;

          case 'scatterPay':
            self.sfx.scatter();
            self.floatText('TICKETS PAY ' + self.fmt(ev.pay), self.w / 2, self.boardY - 16, '#ffd24a');
            await self.wait(750);
            break;

          case 'fsTrigger':
            self.sfx.bonus();
            await self.animFsTrigger(ev);
            inFs = true;
            fsWinSoFar = 0; fsBestSpin = 0; fsLastCarry = 0;
            self.fsHud = { index: 0, total: ev.spins, carry: 0, win: 0 };
            break;

          case 'fsSpin':
            self.fsHud.index = ev.index;
            self.fsHud.total = ev.total;
            self.fsHud.carry = ev.carry;
            await self.wait(330);
            break;

          case 'fsBattleBonus':
            self.sfx.victory();
            self.fsHud.total = ev.total;
            self.floatText(ev.battles + ' BATTLES! +' + ev.extraSpins + ' FREE SPINS',
                           self.w / 2, self.boardY - 16, '#2fdd64');
            await self.wait(850);
            break;

          case 'fsRetrigger':
            self.sfx.bonus();
            self.fsHud.total = ev.total;
            self.floatText('+' + ev.extraSpins + ' FREE SPINS!', self.w / 2, self.boardY - 16, '#2fdd64');
            await self.wait(850);
            break;

          case 'fsEnd':
            await self.wait(300);
            await self.animFsEnd(ev, fsBestSpin, fsLastCarry);
            self.fsHud = null;
            inFs = false;
            break;

          case 'maxWin':
            self.sfx.maxWin();
            self.banner = { title: 'MAX WIN!', sub: CFG.maxWinX.toLocaleString() + '× — ' + self.fmt(ev.totalWin), born: self.time };
            await self.waitSkippable(2800);
            self.banner = null;
            break;

          case 'roundEnd':
            if (ev.totalWin > 0) {
              self.winBar = { amount: ev.totalWin };
              onWin(ev.totalWin);
              await self.animRoundWin(ev.totalWin, sawMultApply);
            }
            break;
        }
      }
    })();
  };

  /* ---- reveal: columns drop in -------------------------------------------- */
  P.animReveal = function (grid, mults) {
    var self = this;
    this.sfx.spin();
    this.floatText('GOOD LUCK!', this.w / 2, this.boardY + this.boardH + 26, '#b9b3e0');
    var jobs = [];
    for (var c = 0; c < this.cols; c++) {
      for (var r = 0; r < this.rows; r++) {
        var cell = this.mkCell(grid[c][r], mults[c][r]);
        cell.dy = -(this.rows - r + 2) * this.cell - this.boardY;
        this.cells[c][r] = cell;
        jobs.push(this.dropCell(cell, c * 55 + (this.rows - r) * 20, 430));
        if (grid[c][r] === 'scatter') {
          (function (cc) { setTimeout(function () { self.sfx.scatter(); }, (cc * 55 + 360) / self.speed); })(c);
        }
      }
      (function (cc) { setTimeout(function () { self.sfx.land(cc); }, (cc * 55 + 320) / self.speed); })(c);
    }
    return Promise.all(jobs);
  };

  P.dropCell = function (cell, delayMs, durMs) {
    var self = this;
    return self.wait(delayMs).then(function () {
      return self.tween(cell, 'dy', 0, durMs, EASE.outBounce);
    });
  };

  /* ---- symbol wins: highlight + pay floaters ------------------------------ */
  P.animWin = function (ev) {
    var self = this;
    return (async function () {
      var k, i;
      for (k = 0; k < ev.wins.length; k++) {
        var win = ev.wins[k];
        for (i = 0; i < win.cells.length; i++) {
          var cc = self.cells[win.cells[i][0]][win.cells[i][1]];
          if (cc) cc.glow = 1;
        }
      }
      self.sfx.winChime();
      await self.wait(160);
      for (k = 0; k < ev.wins.length; k++) {
        var w2 = ev.wins[k], cx = 0, cy = 0;
        for (i = 0; i < w2.cells.length; i++) {
          var p = self.cellXY(w2.cells[i][0], w2.cells[i][1]);
          cx += p.x + self.cell / 2; cy += p.y + self.cell / 2;
        }
        cx /= w2.cells.length; cy /= w2.cells.length;
        self.floatText(w2.count + '× ' + symName(w2.symbol) + '  ' + self.fmt(w2.pay), cx, cy, '#ffffff');
        for (i = 0; i < Math.min(w2.cells.length, 6); i++)
          self.burst(w2.cells[i][0], w2.cells[i][1], w2.symbol);
      }
      await self.wait(620);
    })();
  };

  /* ---- the Column Creature Battle ------------------------------------------
   * Per battle column: spotlight + VS badge (screen 7), full-screen battle
   * animation (screen 8, skipped in turbo / when disabled), winner reveal
   * with column multiplier chip (screen 9), then the running total bar
   * (screen 10). */
  P.animBattles = function (ev, inFs) {
    var self = this;
    return (async function () {
      var running = 0;
      for (var b = 0; b < ev.battles.length; b++) {
        var battle = ev.battles[b];

        // 1. spotlight the column, VS badge between the fighters
        self.battleFocus = battle.col;
        self.vsCol = battle.col;
        self.sfx.battleStart();
        await self.waitSkippable(750);
        self.vsCol = -1;

        // 2. full-screen battle animation
        if (self.settings.battleAnim && !self.settings.turbo && battle.fighters.length >= 2) {
          await self.playBattleOverlay(battle);
        } else {
          for (var ci = 0; ci < 3; ci++) { self.sfx.clash(ci); self.shake(); await self.wait(160); }
        }

        // 3. winner reveal on the board
        var winners = {};
        for (var wi = 0; wi < battle.winners.length; wi++) winners[battle.winners[wi]] = true;
        var winnerNames = [];
        for (var f = 0; f < battle.fighters.length; f++) {
          var fr = battle.fighters[f];
          var cell = self.cells[battle.col][fr.r];
          if (winners[f]) { cell.winner = true; cell.glow = 1.4; winnerNames.push(symName(fr.id)); }
          else cell.dead = true;
        }
        self.sfx.victory();
        var chip = { col: battle.col, value: battle.result, pop: 0 };
        self.columnChips.push(chip);
        self.tween(chip, 'pop', 1, 380, EASE.outBack);
        var label = winnerNames.join(' & ') + ' wins! Column x' + battle.result;
        if (battle.goldDoubled) label += '  (GOLDHORN ×2!)';
        else if (battle.wildBoost) label += '  (+x' + battle.wildBoost + ' WILD)';
        self.floatText(label, self.w / 2, self.boardY - 16, '#ffd24a');

        running += battle.result;
        self.totalBar = { value: running, label: ev.battles.length > 1 ? 'TOTAL MULTIPLIER' : 'COLUMN MULTIPLIER' };
        self.battleFocus = -1;
        await self.waitSkippable(900);
      }
      self.totalBar = { value: ev.totalMult, label: 'TOTAL MULTIPLIER' };
      if (ev.battles.length > 1) {
        self.sfx.multiplier();
        await self.waitSkippable(650);
      }
    })();
  };

  // full-screen DOM battle (screen 8) — shows the two strongest fighters
  P.playBattleOverlay = function (battle) {
    var self = this;
    var sorted = battle.fighters.slice().sort(function (a, b) { return b.mult - a.mult; });
    var f1 = sorted[sorted.length - 1], f2 = sorted[0]; // underdog vs champion
    ART.paintInto($('battleLeft'), f1.id);
    ART.paintInto($('battleRight'), f2.id);
    $('battleLeftMult').textContent = 'x' + f1.mult;
    $('battleRightMult').textContent = 'x' + f2.mult;
    $('battleLeftName').textContent = symName(f1.id);
    $('battleRightName').textContent = symName(f2.id);
    $('battleCaption').textContent = battle.fighters.length > 2
      ? 'MINI TOURNAMENT — ' + battle.fighters.length + ' CRITTERS!'
      : 'THE BATTLE BEGINS!';
    this.showOv('ovBattle');
    return (async function () {
      for (var i = 0; i < 3; i++) {
        await self.wait(420);
        self.sfx.clash(i);
        self.shake();
      }
      await self.wait(420);
      self.hideOv('ovBattle');
    })();
  };

  /* ---- total multiplier calculation (screen 11) ---------------------------- */
  P.animMultApply = function (ev, battlesEv) {
    var self = this;
    var parts = [];
    if (battlesEv) {
      for (var i = 0; i < battlesEv.battles.length; i++) parts.push('x' + battlesEv.battles[i].result);
    }
    var formula = parts.length > 1 ? parts.join(' + ') + ' = x' + ev.mult : 'x' + ev.mult;
    if (this.fsHud && parts.length) formula = parts.join(' + ') + ' + carry = x' + ev.mult;
    $('calcFormula').textContent = formula;
    $('calcApply').textContent = 'BASE WIN ' + this.fmt(ev.baseWin) + ' × ' + ev.mult + ' = ' + this.fmt(ev.finalWin);
    this.sfx.multiplier();
    this.showOv('ovCalc');
    return this.waitSkippable(this.settings.winAnim ? 1900 : 900).then(function () {
      self.hideOv('ovCalc');
    });
  };

  /* ---- free spins trigger (screen 13) --------------------------------------- */
  P.animFsTrigger = function (ev) {
    var self = this;
    var tickets = document.querySelectorAll('.fs-ticket');
    tickets.forEach(function (cv) { ART.paintInto(cv, 'scatter'); });
    $('fsSpinsAwarded').textContent = ev.spins + (ev.super ? ' SUPER FREE SPINS' : ' FREE SPINS');
    this.showOv('ovFsTrigger');
    return this.waitSkippable(2400).then(function () { self.hideOv('ovFsTrigger'); });
  };

  /* ---- bonus complete summary (screen 16) ----------------------------------- */
  P.animFsEnd = function (ev, bestSpin, finalCarry) {
    var self = this;
    $('fsEndWin').textContent = this.fmt(ev.fsWin);
    $('fsEndSpins').textContent = ev.spinsPlayed;
    $('fsEndMult').textContent = 'x' + finalCarry;
    $('fsEndBest').textContent = this.fmt(bestSpin);
    this.sfx.bigWin();
    this.showOv('ovFsEnd');
    return new Promise(function (res) {
      var btn = $('fsEndContinue');
      function done() { btn.removeEventListener('click', done); self.hideOv('ovFsEnd'); res(); }
      btn.addEventListener('click', done);
    });
  };

  /* ---- round win screens (12 / 15) ------------------------------------------ */
  P.animRoundWin = function (totalWinX, hadMult) {
    var self = this;
    var tier = totalWinX >= 500 ? 'EPIC WIN!' : totalWinX >= 100 ? 'MEGA WIN!' :
               totalWinX >= 40 ? 'SUPER WIN!' : totalWinX >= 20 ? 'BIG WIN!' : null;
    if (!this.settings.winAnim && !tier) return Promise.resolve();
    if (!tier && !hadMult && totalWinX < 5) return Promise.resolve();

    var title = $('winTitle'), amount = $('winAmount'), sub = $('winSub');
    title.textContent = tier || 'TOTAL WIN';
    title.classList.toggle('mega', !!tier);
    sub.textContent = tier ? 'Incredible! Keep clashing!' : 'Tap anywhere to continue';
    if (tier) this.sfx.bigWin();
    this.showOv('ovWin');

    // count up the amount
    var dur = Math.min(2400, 700 + totalWinX * 8);
    var t0 = performance.now(), lastTick = 0;
    this.skipRequested = false;
    var ov = $('ovWin');
    var tapped = false;
    function onTap() { tapped = true; }
    ov.addEventListener('pointerdown', onTap);
    return new Promise(function (res) {
      function step(t) {
        var k = Math.min(1, (t - t0) / (dur / self.speed));
        if (tapped || self.skipRequested) k = 1;
        amount.textContent = self.fmt(totalWinX * EASE.outCubic(k));
        if (t - lastTick > 70) { self.sfx.tick(); lastTick = t; }
        if (k < 1) requestAnimationFrame(step);
        else setTimeout(function () {
          ov.removeEventListener('pointerdown', onTap);
          self.hideOv('ovWin');
          res();
        }, (tier ? 900 : 600) / self.speed);
      }
      requestAnimationFrame(step);
    });
  };

  /* ---- particles & floaters --------------------------------------------------- */
  P.burst = function (c, r, sym) {
    var p = this.cellXY(c, r);
    var src = CFG.creatureIds[sym] || CFG.lowIds[sym];
    var color = src ? src.color : '#ffd24a';
    for (var n = 0; n < 10; n++) {
      var a = Math.random() * Math.PI * 2, sp = (0.4 + Math.random()) * this.cell * 4;
      this.particles.push({
        x: p.x + this.cell / 2, y: p.y + this.cell / 2,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - this.cell * 2,
        r: 2 + Math.random() * (this.cell * 0.08),
        color: color, life: 1, decay: 1.6 + Math.random()
      });
    }
  };

  P.floatText = function (text, x, y, color) {
    this.floaters.push({ text: text, x: x, y: y, color: color || '#fff', life: 1.7 });
  };

  function symName(id) {
    var s = CFG.creatureIds[id] || CFG.lowIds[id];
    return s ? s.name : id;
  }

  /* ======================================================================
   * DRAW LOOP
   * ==================================================================== */
  P.draw = function () {
    var ctx = this.ctx, w = this.w, h = this.h, t = this.time;
    var dt = Math.min(0.05, t - (this.lastT || t)); this.lastT = t;

    /* background: night arena sky */
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#191243');
    sky.addColorStop(0.55, '#241a5e');
    sky.addColorStop(1, '#120c38');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < this.bokeh.length; i++) {
      var b = this.bokeh[i];
      var bx = b.x * w, by = (b.y + Math.sin(t * b.sp + b.ph) * 0.02) * h;
      var br = b.r * Math.min(w, h) * (1 + 0.15 * Math.sin(t * 1.3 + b.ph));
      ctx.fillStyle = 'hsla(' + b.hue + ',90%,75%,0.08)';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }

    // arena ground glow
    ctx.fillStyle = 'rgba(122,92,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 14, w * 0.55, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawBoard(ctx, dt);
    this.drawHud(ctx);
    this.drawParticles(ctx, dt);
    this.drawFloaters(ctx, dt);
    if (this.banner) this.drawBanner(ctx);
  };

  P.drawBoard = function (ctx, dt) {
    var bx = this.boardX, by = this.boardY, bw = this.boardW, bh = this.boardH, cs = this.cell;

    // frame
    ctx.save();
    ART.roundRectPath(ctx, bx - 8, by - 8, bw + 16, bh + 16, 16);
    ctx.fillStyle = 'rgba(12,7,36,0.72)';
    ctx.shadowColor = 'rgba(122,92,255,0.55)';
    ctx.shadowBlur = 22;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(160,140,255,0.75)';
    ctx.stroke();
    ctx.restore();

    var c, r, p;
    // cells
    for (c = 0; c < this.cols; c++) {
      for (r = 0; r < this.rows; r++) {
        p = this.cellXY(c, r);
        ctx.fillStyle = (c + r) % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
        ART.roundRectPath(ctx, p.x + 1.5, p.y + 1.5, cs - 3, cs - 3, cs * 0.16);
        ctx.fill();
      }
    }

    // battle spotlight: dim everything except the focused column
    var focus = this.battleFocus;

    // symbols (clipped so drops appear from under the frame)
    ctx.save();
    ART.roundRectPath(ctx, bx - 4, by - 4, bw + 8, bh + 8, 14);
    ctx.clip();
    for (c = 0; c < this.cols; c++) {
      for (r = 0; r < this.rows; r++) {
        var cell = this.cells[c][r];
        if (!cell || cell.alpha <= 0 || cell.scale <= 0) continue;
        p = this.cellXY(c, r);
        var size = cs * 0.94 * cell.scale;
        var ox = p.x + (cs - size) / 2;
        var oy = p.y + (cs - size) / 2 + cell.dy;
        var alpha = cell.alpha;
        if (focus >= 0 && c !== focus) alpha *= 0.25;
        if (cell.dead) alpha *= 0.3;
        ctx.globalAlpha = alpha;
        if (cell.glow > 0 || cell.winner) {
          ctx.save();
          ctx.shadowColor = cell.winner ? 'rgba(255,210,74,0.95)' : 'rgba(255,255,255,0.9)';
          ctx.shadowBlur = cs * 0.32 * (0.7 + 0.3 * Math.sin(this.time * 9));
          ART.draw(ctx, cell.sym, ox, oy, size);
          ctx.restore();
        } else {
          ART.draw(ctx, cell.sym, ox, oy, size);
        }
        ctx.globalAlpha = 1;
        cell.glow = Math.max(0, cell.glow - dt * 0.4);

        // creature multiplier badge
        if (cell.mult >= 2 && cell.dy === 0 && !cell.dead) {
          this.drawMultBadge(ctx, p.x + cs / 2, p.y + cs - cs * 0.13, cs, cell.mult,
                             focus >= 0 && c !== focus ? 0.3 : 1);
        }
        // WINNER ribbon
        if (cell.winner) {
          ctx.save();
          ctx.font = '900 ' + Math.max(8, cs * 0.16) + 'px Arial, sans-serif';
          ctx.textAlign = 'center';
          var wlbl = 'WINNER';
          var tw = ctx.measureText(wlbl).width + cs * 0.16;
          ART.roundRectPath(ctx, p.x + cs / 2 - tw / 2, p.y + cs * 0.02, tw, cs * 0.22, cs * 0.06);
          ctx.fillStyle = '#2fdd64';
          ctx.fill();
          ctx.fillStyle = '#052d10';
          ctx.textBaseline = 'middle';
          ctx.fillText(wlbl, p.x + cs / 2, p.y + cs * 0.14);
          ctx.restore();
        }
      }
    }
    ctx.restore();

    // VS badge over the focused battle column
    if (this.vsCol >= 0) {
      var vp = this.cellXY(this.vsCol, 0);
      var vy = by + bh / 2;
      var pulse = 1 + 0.12 * Math.sin(this.time * 10);
      ctx.save();
      ctx.translate(vp.x + cs / 2, vy);
      ctx.scale(pulse, pulse);
      ctx.font = '900 ' + cs * 0.5 + 'px "Arial Black", Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = cs * 0.1; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#7a3c00';
      ctx.strokeText('VS', 0, 0);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('VS', 0, 0);
      ctx.restore();
    }

    // column multiplier chips (battle results)
    for (var k = 0; k < this.columnChips.length; k++) {
      var chip = this.columnChips[k];
      var cp = this.cellXY(chip.col, this.rows - 1);
      var scale = Math.max(0.01, chip.pop);
      ctx.save();
      ctx.translate(cp.x + cs / 2, by + bh + 14);
      ctx.scale(scale, scale);
      this.drawMultBadge(ctx, 0, 0, cs * 1.25, chip.value, 1);
      ctx.restore();
    }
  };

  P.drawMultBadge = function (ctx, cx, cy, cs, value, alpha) {
    var label = 'x' + value;
    var fs = Math.max(9, cs * (label.length > 3 ? 0.2 : 0.24));
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = '900 ' + fs + 'px Arial, sans-serif';
    var tw = ctx.measureText(label).width;
    var pw = tw + fs * 0.9, ph = fs * 1.4;
    var grd = ctx.createLinearGradient(cx, cy - ph / 2, cx, cy + ph / 2);
    grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffc83d'); grd.addColorStop(1, '#e08a00');
    ART.roundRectPath(ctx, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
    ctx.fillStyle = grd;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#8a5200';
    ctx.stroke();
    ctx.fillStyle = '#4d2c00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + fs * 0.05);
    ctx.restore();
  };

  P.drawHud = function (ctx) {
    var cs = this.cell;

    // free spins HUD (screen 14): spins + carry-over multiplier
    if (this.fsHud) {
      var y = Math.max(20, this.boardY * 0.45);
      ctx.save();
      ctx.textAlign = 'center';
      var fs = Math.max(11, cs * 0.26);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      var txt = 'FREE SPINS ' + this.fsHud.index + '/' + this.fsHud.total +
                '   •   CARRY-OVER x' + (this.fsHud.carry || 0);
      var tw = ctx.measureText(txt).width + fs * 2;
      ART.roundRectPath(ctx, this.w / 2 - tw / 2, y - fs, tw, fs * 2, fs);
      ctx.fillStyle = 'rgba(40,20,90,0.92)';
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffd24a'; ctx.stroke();
      ctx.fillStyle = '#ffd24a';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, this.w / 2, y + 1);
      ctx.restore();
    }

    // total multiplier bar (screens 9/10)
    if (this.totalBar) {
      var by = this.boardY + this.boardH + Math.max(34, cs * 0.6);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var f2 = Math.max(12, cs * 0.3);
      ctx.font = '900 ' + f2 + 'px Arial, sans-serif';
      var label = this.totalBar.label + '  x' + this.totalBar.value;
      var tw2 = ctx.measureText(label).width + f2 * 2.2;
      ART.roundRectPath(ctx, this.w / 2 - tw2 / 2, by - f2 * 0.95, tw2, f2 * 1.9, f2);
      var grd = ctx.createLinearGradient(0, by - f2, 0, by + f2);
      grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffc83d'); grd.addColorStop(1, '#e08a00');
      ctx.fillStyle = grd;
      ctx.shadowColor = 'rgba(255,200,61,0.6)';
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#4d2c00';
      ctx.fillText(label, this.w / 2, by + 1);
      ctx.restore();
    } else if (this.winBar && this.winBar.amount > 0) {
      var wy = this.boardY + this.boardH + Math.max(34, cs * 0.6);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var f3 = Math.max(13, cs * 0.32);
      ctx.font = '900 ' + f3 + 'px Arial, sans-serif';
      var wl = 'WIN ' + this.fmt(this.winBar.amount);
      ctx.lineWidth = f3 * 0.18; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,8,50,0.85)';
      ctx.strokeText(wl, this.w / 2, wy);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(wl, this.w / 2, wy);
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
      f.y -= 24 * dt;
      var fs = Math.max(12, this.cell * 0.26);
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 1.4);
      ctx.font = '900 ' + fs + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = fs * 0.2; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,8,50,0.9)';
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
    ctx.fillStyle = 'rgba(10,5,30,0.62)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(pop, pop);
    var fs = Math.max(28, Math.min(54, this.w * 0.085));
    ctx.textAlign = 'center';
    ctx.font = '900 ' + fs + 'px "Arial Black", Arial, sans-serif';
    ctx.lineWidth = fs * 0.18; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5b1a8a';
    ctx.strokeText(b.title, 0, -fs * 0.2);
    var grd = ctx.createLinearGradient(0, -fs, 0, fs * 0.4);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(1, '#ffd24a');
    ctx.fillStyle = grd;
    ctx.fillText(b.title, 0, -fs * 0.2);
    if (b.sub) {
      ctx.font = '900 ' + fs * 0.45 + 'px Arial, sans-serif';
      ctx.lineWidth = fs * 0.1;
      ctx.strokeText(b.sub, 0, fs * 0.75);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(b.sub, 0, fs * 0.75);
    }
    ctx.restore();
  };

  g.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
