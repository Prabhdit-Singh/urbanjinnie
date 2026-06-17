/* =========================================================================
 * MEDBOT INVASION 1000 — Math Engine
 *
 * Deterministic, presentation-free game math. playRound() returns a "book":
 * an ordered list of events describing everything that happened, in bet
 * multiples. The renderer/UI replay the book; they never compute outcomes.
 * This mirrors the Stake Engine split between math-sdk (result generation)
 * and web-sdk (playback).
 *
 * Mechanic: 6x5 pay-anywhere. 8+ of a kind anywhere pays; Wild Med Kits
 * substitute. Winning symbols explode (germ explosion / tumble), survivors
 * fall, new symbols drop in; repeats while wins form. Lab Portals (3+)
 * trigger Emergency Lab Spins, where Serum Multiplier Orbs are collected
 * into a running total multiplier applied to every win.
 *
 * Runs in the browser (window.GameEngine) and Node (globalThis) so the exact
 * same code feeds tools/simulate.js for RTP verification.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;

  /* ---- Seedable RNG (mulberry32) — deterministic books for testing ---- */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function GameEngine(seed) {
    this.rng = makeRng(seed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : seed);
  }

  var P = GameEngine.prototype;

  P.random = function () { return this.rng(); };

  P.weightedPick = function (table) {
    var total = 0, k;
    for (k in table) total += table[k];
    var r = this.rng() * total;
    for (k in table) { r -= table[k]; if (r < 0) return k; }
    return k;
  };

  /* ---- Grid helpers. grid[c][r], r = 0 is the TOP row. ----------------- */
  P.buildWeightTable = function (opts) {
    var src = opts.inFreeSpins ? CFG.weights.fs : CFG.weights.base, w = {}, k;
    for (k in src) w[k] = src[k];
    if (opts.inFreeSpins) {
      if (opts.orbBoost) w.orb *= opts.orbBoost;     // bonus buys seed more orbs
      if (opts.extraWilds) w.wild *= 1.6;            // Scanner Mode
      if (opts.germBoost) w.germ_blob *= 1.4;        // Outbreak Mode
    } else {
      w.orb = 0;                                     // orbs only matter in FS
    }
    return w;
  };

  P.drawCell = function (weights) {
    var id = this.weightedPick(weights);
    if (id === 'orb') return { sym: 'orb', mult: this.rollOrb(this._bigOrbs) };
    return { sym: id };
  };

  P.rollOrb = function (bigOrbs) {
    var vals = CFG.orbValues;
    if (bigOrbs) {
      // Virus King Mode: bias the orb roll toward the top values
      vals = { 5: 18, 10: 16, 15: 14, 25: 12, 50: 9, 100: 6 };
    }
    return parseInt(this.weightedPick(vals), 10);
  };

  P.makeGrid = function (weights) {
    var grid = [];
    for (var c = 0; c < CFG.grid.cols; c++) {
      grid[c] = [];
      for (var r = 0; r < CFG.grid.rows; r++) grid[c][r] = this.drawCell(weights);
    }
    return grid;
  };

  P.cloneGrid = function (grid) {
    var out = [];
    for (var c = 0; c < grid.length; c++) {
      out[c] = [];
      for (var r = 0; r < grid[c].length; r++) {
        var cell = grid[c][r];
        out[c][r] = cell == null ? null : { sym: cell.sym, mult: cell.mult };
      }
    }
    return out;
  };

  P.countSym = function (grid, sym) {
    var n = 0;
    for (var c = 0; c < CFG.grid.cols; c++)
      for (var r = 0; r < CFG.grid.rows; r++)
        if (grid[c][r] && grid[c][r].sym === sym) n++;
    return n;
  };

  /* Force the initial grid for bonus buys: build with no scatters, then place
   * exactly N Lab Portals at random distinct positions. */
  P.makeForcedGrid = function (weights, forcedScatters) {
    var w = {}, k;
    for (k in weights) if (k !== 'scatter') w[k] = weights[k];
    var grid = this.makeGrid(w);
    var n = parseInt(this.weightedPick(forcedScatters), 10);
    var placed = 0;
    while (placed < n) {
      var c = (this.rng() * CFG.grid.cols) | 0, r = (this.rng() * CFG.grid.rows) | 0;
      if (grid[c][r].sym !== 'scatter') { grid[c][r] = { sym: 'scatter' }; placed++; }
    }
    return grid;
  };

  /* ---- Pay-anywhere evaluation. Wilds substitute for paying symbols. ----
   * Returns { wins:[{symbol,count,cells,pay}], removeCells:[[c,r]] }. */
  P.evaluate = function (grid) {
    var cols = CFG.grid.cols, rows = CFG.grid.rows, c, r;
    var positions = {}, wilds = [];
    for (c = 0; c < cols; c++) {
      for (r = 0; r < rows; r++) {
        var cell = grid[c][r];
        if (!cell) continue;
        if (cell.sym === 'wild') { wilds.push([c, r]); continue; }
        if (cell.sym === 'scatter' || cell.sym === 'orb') continue;
        (positions[cell.sym] || (positions[cell.sym] = [])).push([c, r]);
      }
    }
    var wins = [], removeMap = {};
    for (var sym in positions) {
      var cells = positions[sym];
      var count = cells.length + wilds.length;        // wilds top up every paying symbol
      var tier = CFG.tierForCount(count);
      if (tier < 0) continue;
      var pay = CFG.paytable[sym][tier];
      var all = cells.concat(wilds);
      wins.push({ symbol: sym, count: count, cells: all, pay: pay });
      for (var i = 0; i < all.length; i++) removeMap[all[i][0] + ',' + all[i][1]] = true;
    }
    var removeCells = [];
    for (var k in removeMap) { var p = k.split(','); removeCells.push([+p[0], +p[1]]); }
    return { wins: wins, removeCells: removeCells };
  };

  /* Sum of multiplier-orb values currently on the grid. */
  P.collectOrbs = function (grid) {
    var orbs = [], sum = 0;
    for (var c = 0; c < CFG.grid.cols; c++)
      for (var r = 0; r < CFG.grid.rows; r++) {
        var cell = grid[c][r];
        if (cell && cell.sym === 'orb') { orbs.push({ c: c, r: r, mult: cell.mult }); sum += cell.mult; }
      }
    return { orbs: orbs, sum: sum };
  };

  /* ---- Tumble: remove cells, settle survivors, refill from the top ----- */
  P.tumble = function (grid, removeCells, weights) {
    var cols = CFG.grid.cols, rows = CFG.grid.rows;
    var remove = {};
    for (var i = 0; i < removeCells.length; i++) remove[removeCells[i][0] + ',' + removeCells[i][1]] = true;
    var next = [];
    for (var c = 0; c < cols; c++) {
      var kept = [];
      for (var r = 0; r < rows; r++) if (!remove[c + ',' + r]) kept.push(grid[c][r]);
      var col = [];
      while (col.length < rows - kept.length) col.push(this.drawCell(weights));
      next[c] = col.concat(kept);
    }
    return next;
  };

  /* ---- One spin: reveal + tumble loop. ctx carries round + FS state. ---- */
  P.playSpin = function (ctx) {
    var weights = this.buildWeightTable(ctx.opts);
    this._bigOrbs = ctx.opts.bigOrbs;
    var grid;
    if (ctx.opts.forcedScatters) {
      grid = this.makeForcedGrid(weights, ctx.opts.forcedScatters);
      ctx.opts.forcedScatters = null;        // only the triggering spin is forced
    } else {
      grid = this.makeGrid(weights);
    }

    var spinWin = 0, tumbleIndex = 0, germsExploded = 0;
    var inFs = ctx.opts.inFreeSpins;

    var orbInfo = this.collectOrbs(grid);
    ctx.events.push({ type: 'reveal', grid: this.cloneGrid(grid),
                      orbSum: orbInfo.sum, fsMult: ctx.fsMult || 0 });

    for (;;) {
      var ev = this.evaluate(grid);
      if (!ev.wins.length) break;

      var stepBase = 0, i;
      for (i = 0; i < ev.wins.length; i++) stepBase += ev.wins[i].pay;

      // In free spins, collected orb total multiplies every paying tumble.
      var orbs = this.collectOrbs(grid);
      var mult = 1;
      if (inFs && ctx.fsMult > 0) mult = ctx.fsMult;
      var stepWin = stepBase * mult;

      // Count germ explosions for the Invasion Meter (base game only)
      for (i = 0; i < ev.wins.length; i++)
        if (ev.wins[i].symbol === 'germ_blob') germsExploded += ev.wins[i].count;

      spinWin += stepWin;
      var roundTotal = ctx.roundWin + spinWin;
      var capped = roundTotal >= CFG.maxWinX;
      if (capped) spinWin -= roundTotal - CFG.maxWinX;

      ctx.events.push({ type: 'win', tumbleIndex: tumbleIndex, wins: ev.wins,
                        stepBase: stepBase, mult: mult, stepWin: stepWin,
                        spinWin: spinWin, fsMult: ctx.fsMult || 0 });

      if (capped) { ctx.capped = true; break; }

      grid = this.tumble(grid, ev.removeCells, weights);
      tumbleIndex++;
      var oi = this.collectOrbs(grid);
      ctx.events.push({ type: 'tumble', grid: this.cloneGrid(grid), orbSum: oi.sum });
    }

    // After the tumble sequence settles, collect any orbs left on the board.
    if (inFs) {
      var finalOrbs = this.collectOrbs(grid);
      if (finalOrbs.orbs.length) {
        var before = ctx.fsMult;
        var cap = ctx.opts.orbCap || CFG.orbTotalCap;
        ctx.fsMult = Math.min(cap, ctx.fsMult + finalOrbs.sum);
        ctx.events.push({ type: 'orbCollect', orbs: finalOrbs.orbs, added: finalOrbs.sum,
                          fsMultBefore: before, fsMult: ctx.fsMult });
      }
    }

    ctx.roundWin += spinWin;
    return {
      win: spinWin,
      scatters: this.countSym(grid, 'scatter'),
      germs: germsExploded
    };
  };

  /* ---- Full round ------------------------------------------------------
   * mode: 'base' | 'buy' | 'scanner' | 'outbreak' | 'virusking'
   * Returns { events, totalWinX, cost, mode } — wins in BASE BET multiples. */
  P.playRound = function (mode) {
    mode = mode || 'base';
    var betMode = CFG.betModes[mode];
    var ctx = { events: [], roundWin: 0, capped: false, fsMult: 0, meter: 0 };
    var opts = { inFreeSpins: false };
    if (betMode.forcedScatters) {
      var fs = {}; for (var k in betMode.forcedScatters) fs[k] = betMode.forcedScatters[k];
      opts.forcedScatters = fs;
    }
    ctx.opts = opts;

    var base = this.playSpin(ctx);

    // Invasion Meter (base game only): germ explosions plus background activity
    // charge it; when it tops out the Scanner Beam fires — random cells become
    // wild for one extra evaluation + tumble sequence.
    if (!betMode.forcedScatters && !ctx.capped) {
      var fire = this.rng() < CFG.invasionMeter.fireChance;
      var cap = CFG.invasionMeter.capacity;
      var meterVal = fire ? cap
        : Math.min(cap - 1, base.germs * 4 + ((this.rng() * (cap - 2)) | 0));
      ctx.meter = meterVal;
      ctx.events.push({ type: 'meter', value: meterVal, capacity: cap });
      if (fire) {
        var extra = this.runScannerBeam(ctx);
        base.win += extra.win;
        if (extra.scatters > base.scatters) base.scatters = extra.scatters;
      }
    }

    // Lab Portal scatter pay + free spins trigger
    if (base.scatters >= 3 && !ctx.capped) {
      var sPay = CFG.scatterPays[Math.min(base.scatters, 6)] || 0;
      if (ctx.roundWin + sPay > CFG.maxWinX) sPay = CFG.maxWinX - ctx.roundWin;
      ctx.roundWin += sPay;
      ctx.events.push({ type: 'scatterPay', count: base.scatters, pay: sPay });
    }

    if (base.scatters >= CFG.freeSpins.trigger && !ctx.capped) {
      var spins = CFG.freeSpins.awards[Math.min(base.scatters, 6)];
      ctx.events.push({ type: 'fsTrigger', count: base.scatters, spins: spins, mode: mode });
      this.playFreeSpins(ctx, mode, spins);
    }

    if (ctx.capped) ctx.events.push({ type: 'maxWin', totalWin: ctx.roundWin });
    ctx.events.push({ type: 'roundEnd', totalWin: ctx.roundWin });

    return { events: ctx.events, totalWinX: ctx.roundWin, cost: betMode.cost, mode: mode };
  };

  /* Scanner Beam: turn a few random non-special cells into wilds, then run a
   * single extra pay-anywhere evaluation + tumble sequence on a fresh board. */
  P.runScannerBeam = function (ctx) {
    var weights = this.buildWeightTable(ctx.opts);
    var grid = this.makeGrid(weights);
    var n = CFG.invasionMeter.scannerWildsMin +
            ((this.rng() * (CFG.invasionMeter.scannerWildsMax - CFG.invasionMeter.scannerWildsMin + 1)) | 0);
    var targets = [], placed = 0, tries = 0;
    while (placed < n && tries < 60) {
      tries++;
      var c = (this.rng() * CFG.grid.cols) | 0, r = (this.rng() * CFG.grid.rows) | 0;
      if (grid[c][r].sym === 'scatter' || grid[c][r].sym === 'wild') continue;
      grid[c][r] = { sym: 'wild' }; targets.push([c, r]); placed++;
    }
    ctx.events.push({ type: 'scannerBeam', grid: this.cloneGrid(grid), wilds: targets });

    // Single evaluation (no cascade) keeps the feature exciting but RTP-light.
    var win = 0;
    var ev = this.evaluate(grid);
    if (ev.wins.length) {
      var step = 0;
      for (var i = 0; i < ev.wins.length; i++) step += ev.wins[i].pay;
      win = step;
      var total = ctx.roundWin + win;
      if (total >= CFG.maxWinX) { win -= total - CFG.maxWinX; ctx.capped = true; }
      ctx.events.push({ type: 'win', tumbleIndex: 0, wins: ev.wins, stepBase: step,
                        mult: 1, stepWin: step, spinWin: win, fsMult: 0, scanner: true });
    }
    ctx.roundWin += win;
    return { win: win, scatters: this.countSym(grid, 'scatter') };
  };

  P.playFreeSpins = function (ctx, mode, spins) {
    var betMode = CFG.betModes[mode];
    ctx.opts = {
      inFreeSpins: true,
      orbBoost: betMode.orbBoost || 1,
      extraWilds: !!betMode.extraWilds,
      germBoost: !!betMode.germBoost,
      bigOrbs: !!betMode.bigOrbs,
      orbCap: betMode.orbCap || CFG.orbTotalCap
    };
    ctx.fsMult = 0;     // collected serum multiplier total, persists across the bonus

    var total = spins + (betMode.extraSpins || 0), played = 0, fsWin = 0;
    while (played < total && !ctx.capped) {
      played++;
      ctx.events.push({ type: 'fsSpin', index: played, total: total, fsMult: ctx.fsMult });
      var res = this.playSpin(ctx);
      fsWin += res.win;

      if (res.scatters >= CFG.freeSpins.retrigger && !ctx.capped) {
        total += CFG.freeSpins.retriggerSpins;
        ctx.events.push({ type: 'fsRetrigger', count: res.scatters,
                          extraSpins: CFG.freeSpins.retriggerSpins, total: total });
      }
    }
    ctx.events.push({ type: 'fsEnd', fsWin: fsWin, totalWin: ctx.roundWin,
                      spinsPlayed: played, fsMult: ctx.fsMult });
  };

  g.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
