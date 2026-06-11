/* =========================================================================
 * CANDY SURGE 1000 — Math Engine
 *
 * Deterministic, presentation-free game math. playRound() returns a "book":
 * an ordered list of events describing everything that happened in the
 * round, in bet multiples. The renderer/UI replay the book; they never
 * compute outcomes. This mirrors the Stake Engine separation between the
 * math-sdk (result generation) and the web-sdk (playback).
 *
 * Runs in the browser (window.GameEngine) and in Node (globalThis) so the
 * exact same code is used by tools/simulate.js for RTP verification.
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
    var w = {}, src = opts.inFreeSpins ? CFG.weights.fs : CFG.weights.base, k;
    for (k in src) if (k !== 'scatter') w[k] = src[k];
    var sMult = 1;
    if (opts.inFreeSpins) sMult = CFG.weights.fsScatterMult;          // FS retrigger rate
    else if (opts.ante) sMult = CFG.weights.anteScatterMult;          // ante boosts base trigger only
    w.scatter = CFG.weights.base.scatter * sMult;
    return w;
  };

  P.drawCell = function (weights) { return this.weightedPick(weights); };

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
    for (var c = 0; c < grid.length; c++) out[c] = grid[c].slice();
    return out;
  };

  P.countScatters = function (grid) {
    var n = 0;
    for (var c = 0; c < CFG.grid.cols; c++)
      for (var r = 0; r < CFG.grid.rows; r++)
        if (grid[c][r] === 'scatter') n++;
    return n;
  };

  /* Force an initial grid for bonus buys: generate scatter-free, then place
   * exactly N scatters at random distinct positions. */
  P.makeForcedGrid = function (weights, forcedScatters) {
    var w = {}, k;
    for (k in weights) if (k !== 'scatter') w[k] = weights[k];
    var grid = this.makeGrid(w);
    var n = parseInt(this.weightedPick(forcedScatters), 10);
    var placed = 0;
    while (placed < n) {
      var c = (this.rng() * CFG.grid.cols) | 0, r = (this.rng() * CFG.grid.rows) | 0;
      if (grid[c][r] !== 'scatter') { grid[c][r] = 'scatter'; placed++; }
    }
    return grid;
  };

  /* ---- Cluster detection: 4-connectivity flood fill, size >= 5 --------- */
  P.findClusters = function (grid) {
    var cols = CFG.grid.cols, rows = CFG.grid.rows;
    var seen = [], clusters = [], c, r;
    for (c = 0; c < cols; c++) seen[c] = new Array(rows).fill(false);
    for (c = 0; c < cols; c++) {
      for (r = 0; r < rows; r++) {
        if (seen[c][r] || grid[c][r] === 'scatter') continue;
        var sym = grid[c][r], stack = [[c, r]], cells = [];
        seen[c][r] = true;
        while (stack.length) {
          var p = stack.pop(); cells.push(p);
          var nb = [[p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]];
          for (var i = 0; i < nb.length; i++) {
            var nc = nb[i][0], nr = nb[i][1];
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            if (seen[nc][nr] || grid[nc][nr] !== sym) continue;
            seen[nc][nr] = true; stack.push([nc, nr]);
          }
        }
        if (cells.length >= CFG.minClusterSize) clusters.push({ symbol: sym, cells: cells });
      }
    }
    return clusters;
  };

  /* ---- Multiplier spots ------------------------------------------------ */
  function spotKey(c, r) { return c + ',' + r; }

  // startHits: hits needed before a mark carries a multiplier. Normally 2
  // (mark on 1st hit, x2 on 2nd); SUPER free spins use 1 (x2 immediately).
  function spotValue(hits, startHits) {
    if (hits < startHits) return 0;
    var v = CFG.multiplier.base * Math.pow(2, hits - startHits);
    return Math.min(v, CFG.multiplier.cap);
  }

  function snapshotSpots(spots, startHits) {
    var out = [];
    for (var k in spots) {
      var p = k.split(',');
      out.push({ c: +p[0], r: +p[1], hits: spots[k], value: spotValue(spots[k], startHits) });
    }
    return out;
  }

  /* ---- Tumble: remove cluster cells, settle columns, refill from top --- */
  P.tumble = function (grid, removeCells, weights) {
    var cols = CFG.grid.cols, rows = CFG.grid.rows;
    var remove = {};
    for (var i = 0; i < removeCells.length; i++) remove[spotKey(removeCells[i][0], removeCells[i][1])] = true;
    var next = [];
    for (var c = 0; c < cols; c++) {
      var kept = [];
      for (var r = 0; r < rows; r++) if (!remove[spotKey(c, r)]) kept.push(grid[c][r]);
      var col = [];
      while (col.length < rows - kept.length) col.push(this.drawCell(weights));
      next[c] = col.concat(kept);
    }
    return next;
  };

  /* ---- One spin: reveal + tumble loop. Returns win in bet multiples. ---
   * ctx: { events, opts, spots (persistent in FS), roundWin, capped } */
  P.playSpin = function (ctx) {
    var weights = this.buildWeightTable(ctx.opts);
    var grid;
    if (ctx.opts.forcedScatters) {
      grid = this.makeForcedGrid(weights, ctx.opts.forcedScatters);
      ctx.opts.forcedScatters = null; // only the triggering spin is forced
    } else {
      grid = this.makeGrid(weights);
    }

    var spots = ctx.opts.persistSpots ? ctx.spots : {};
    var startHits = ctx.opts.startHits || CFG.multiplier.startHits;
    var spinWin = 0, tumbleIndex = 0;

    ctx.events.push({ type: 'reveal', grid: this.cloneGrid(grid), spots: snapshotSpots(spots, startHits) });

    for (;;) {
      var clusters = this.findClusters(grid);
      if (!clusters.length) break;

      var winInfo = [], removeCells = [], stepWin = 0, i, j;
      for (i = 0; i < clusters.length; i++) {
        var cl = clusters[i];
        var basePay = CFG.paytable[cl.symbol][CFG.tierForSize(cl.cells.length)];
        var multSum = 0;
        for (j = 0; j < cl.cells.length; j++)
          multSum += spotValue(spots[spotKey(cl.cells[j][0], cl.cells[j][1])] || 0, startHits);
        var pay = basePay * (multSum > 0 ? multSum : 1);
        stepWin += pay;
        winInfo.push({ symbol: cl.symbol, size: cl.cells.length, cells: cl.cells,
                       basePay: basePay, multSum: multSum, pay: pay });
        for (j = 0; j < cl.cells.length; j++) removeCells.push(cl.cells[j]);
      }

      // Marks/multipliers from this win apply to FUTURE wins on those spots
      for (i = 0; i < removeCells.length; i++) {
        var k = spotKey(removeCells[i][0], removeCells[i][1]);
        spots[k] = (spots[k] || 0) + 1;
      }

      spinWin += stepWin;
      var roundTotal = ctx.roundWin + spinWin;
      var capped = roundTotal >= CFG.maxWinX;
      if (capped) spinWin -= roundTotal - CFG.maxWinX; // clamp to exactly the cap

      ctx.events.push({ type: 'win', tumbleIndex: tumbleIndex, clusters: winInfo,
                        stepWin: stepWin, spinWin: spinWin, spots: snapshotSpots(spots, startHits) });

      if (capped) { ctx.capped = true; break; }

      grid = this.tumble(grid, removeCells, weights);
      tumbleIndex++;
      ctx.events.push({ type: 'tumble', grid: this.cloneGrid(grid), spots: snapshotSpots(spots, startHits) });
    }

    ctx.roundWin += spinWin;
    if (ctx.opts.persistSpots) ctx.spots = spots;
    return { win: spinWin, scatters: this.countScatters(grid) };
  };

  /* ---- Full round ------------------------------------------------------
   * mode: 'base' | 'ante' | 'buy' | 'superbuy'
   * Returns { events, totalWinX, cost, mode } — wins in BASE BET multiples. */
  P.playRound = function (mode) {
    mode = mode || 'base';
    var betMode = CFG.betModes[mode];
    var ctx = { events: [], roundWin: 0, capped: false, spots: {} };
    var opts = { ante: mode === 'ante', inFreeSpins: false, persistSpots: false };
    if (betMode.forcedScatters) {
      // shallow copy so the weighted table isn't consumed
      var fs = {}; for (var k in betMode.forcedScatters) fs[k] = betMode.forcedScatters[k];
      opts.forcedScatters = fs;
    }
    ctx.opts = opts;

    var base = this.playSpin(ctx);

    // Scatter pay + free spins trigger (evaluated after the tumble sequence)
    if (base.scatters >= 3 && !ctx.capped) {
      var sPay = CFG.scatterPays[Math.min(base.scatters, 7)] || 0;
      if (ctx.roundWin + sPay > CFG.maxWinX) sPay = CFG.maxWinX - ctx.roundWin;
      ctx.roundWin += sPay;
      ctx.events.push({ type: 'scatterPay', count: base.scatters, pay: sPay });
    }

    if (base.scatters >= CFG.freeSpins.trigger && !ctx.capped) {
      var spins = CFG.freeSpins.awards[Math.min(base.scatters, 7)];
      ctx.events.push({ type: 'fsTrigger', count: base.scatters, spins: spins });
      this.playFreeSpins(ctx, mode, spins);
    }

    if (ctx.capped) ctx.events.push({ type: 'maxWin', totalWin: ctx.roundWin });
    ctx.events.push({ type: 'roundEnd', totalWin: ctx.roundWin });

    return { events: ctx.events, totalWinX: ctx.roundWin, cost: betMode.cost, mode: mode };
  };

  P.playFreeSpins = function (ctx, mode, spins) {
    var betMode = CFG.betModes[mode];
    var startHits = betMode.superSpots ? CFG.multiplier.startHits - 1 : CFG.multiplier.startHits;
    ctx.opts = { ante: false, inFreeSpins: true, persistSpots: true, startHits: startHits };
    ctx.spots = {};

    // Super Bonus Buy: pre-seed random multiplier spots
    var seed = betMode.seedSpots;
    if (seed) {
      var n = seed.min + ((this.rng() * (seed.max - seed.min + 1)) | 0);
      var placed = 0;
      while (placed < n) {
        var c = (this.rng() * CFG.grid.cols) | 0, r = (this.rng() * CFG.grid.rows) | 0;
        var key = c + ',' + r;
        if (ctx.spots[key]) continue;
        var val = parseInt(this.weightedPick(seed.values), 10);
        // hits encoding: value = base * 2^(hits - startHits)
        ctx.spots[key] = startHits + Math.round(Math.log(val / CFG.multiplier.base) / Math.LN2);
        placed++;
      }
      ctx.events.push({ type: 'seedSpots', spots: snapshotSpots(ctx.spots, startHits) });
    }

    var total = spins, played = 0, fsWin = 0;
    while (played < total && !ctx.capped) {
      played++;
      ctx.events.push({ type: 'fsSpin', index: played, total: total });
      var res = this.playSpin(ctx);
      fsWin += res.win;

      if (res.scatters >= CFG.freeSpins.trigger && !ctx.capped) {
        total += CFG.freeSpins.retriggerSpins;
        ctx.events.push({ type: 'fsRetrigger', count: res.scatters,
                          extraSpins: CFG.freeSpins.retriggerSpins, total: total });
      }
    }
    ctx.events.push({ type: 'fsEnd', fsWin: fsWin, totalWin: ctx.roundWin, spinsPlayed: played });
  };

  g.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
