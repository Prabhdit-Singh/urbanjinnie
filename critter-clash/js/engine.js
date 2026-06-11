/* =========================================================================
 * CRITTER CLASH 1000 — Math Engine
 *
 * Deterministic, presentation-free game math. playRound() returns a "book":
 * an ordered list of events describing everything that happened in the
 * round, in bet multiples. The renderer/UI replay the book; they never
 * compute outcomes.
 *
 * Spin lifecycle:
 *   reveal  -> symbols (and hidden creature multipliers) land
 *   win     -> pays-anywhere symbol wins are evaluated (the BASE win)
 *   battles -> each column with 2+ creatures fights; the strongest
 *              multiplier wins the column (ties combine), wilds add +x2,
 *              Goldhorn doubles the column result
 *   multApply -> sum of winning column multipliers is applied to the base
 *              win (multiplier applies AFTER wins are calculated)
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

  /* ---- Weight tables ---------------------------------------------------- */
  P.buildWeightTable = function (opts) {
    var w = {}, base = CFG.weights.base, k;
    var creatureMult = opts.superFs ? CFG.weights.superCreatureMult : CFG.weights.fsCreatureMult;
    for (k in base) {
      var v = base[k];
      if (opts.inFreeSpins) {
        if (CFG.isCreature(k)) v *= creatureMult;
        if (k === 'scatter') v *= CFG.weights.fsScatterMult;
      }
      w[k] = v;
    }
    return w;
  };

  // Creature multiplier table; free spins flatten the weights so high-end
  // multipliers roll more often ("winning creature multipliers increase").
  // Super free spins flatten harder.
  P.rollCreatureMult = function (id, opts) {
    var src = CFG.creatureIds[id].mults, table = src;
    if (opts.inFreeSpins) {
      var exp = opts.superFs ? CFG.weights.superMultExp : CFG.weights.fsMultExp;
      table = {};
      for (var k in src) table[k] = Math.pow(src[k], exp);
    }
    return parseInt(this.weightedPick(table), 10);
  };

  /* ---- Grid. grid[c][r], r = 0 is the TOP row. mults[c][r] holds the
   * hidden battle multiplier for creature cells (0 elsewhere). ----------- */
  P.makeGrid = function (weights, opts) {
    var grid = [], mults = [];
    for (var c = 0; c < CFG.grid.cols; c++) {
      grid[c] = []; mults[c] = [];
      for (var r = 0; r < CFG.grid.rows; r++) {
        var id = this.weightedPick(weights);
        grid[c][r] = id;
        mults[c][r] = CFG.isCreature(id) ? this.rollCreatureMult(id, opts) : 0;
      }
    }
    return { grid: grid, mults: mults };
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

  /* Force a grid for bonus buys: generate scatter-free, then place exactly
   * N scatters at random distinct positions. */
  P.makeForcedGrid = function (weights, opts, forcedScatters) {
    var w = {}, k;
    for (k in weights) if (k !== 'scatter') w[k] = weights[k];
    var made = this.makeGrid(w, opts);
    var n = parseInt(this.weightedPick(forcedScatters), 10);
    var placed = 0;
    while (placed < n) {
      var c = (this.rng() * CFG.grid.cols) | 0, r = (this.rng() * CFG.grid.rows) | 0;
      if (made.grid[c][r] !== 'scatter') {
        made.grid[c][r] = 'scatter';
        made.mults[c][r] = 0;
        placed++;
      }
    }
    return made;
  };

  /* ---- Pays-anywhere evaluation ------------------------------------------
   * Lows pay on 8+ matching anywhere; the Golden Egg wild counts toward
   * every LOW symbol. Creatures are premium and pay on 3+ anywhere. */
  P.evalPays = function (grid) {
    var counts = {}, cells = {}, wildCells = [], c, r, id;
    for (c = 0; c < CFG.grid.cols; c++) {
      for (r = 0; r < CFG.grid.rows; r++) {
        id = grid[c][r];
        if (id === 'scatter') continue;
        if (id === 'wild') { wildCells.push([c, r]); continue; }
        counts[id] = (counts[id] || 0) + 1;
        (cells[id] = cells[id] || []).push([c, r]);
      }
    }
    var wins = [], total = 0;
    for (id in counts) {
      var count = counts[id] + (CFG.isLow(id) ? wildCells.length : 0);
      var tier = CFG.tierFor(id, count);
      if (tier < 0) continue;
      var pay = CFG.paytable[id][tier];
      var winCells = CFG.isLow(id) ? cells[id].concat(wildCells) : cells[id];
      wins.push({ symbol: id, count: count, cells: winCells, pay: pay });
      total += pay;
    }
    return { wins: wins, total: total };
  };

  /* ---- Column Creature Battles --------------------------------------------
   * 2+ creatures in a column battle. The highest multiplier wins; if the
   * top multiplier is tied, the tied values COMBINE (x4 vs x4 -> x8).
   * Each wild in the column adds +x2. Goldhorn doubles the column result. */
  P.evalBattles = function (grid, mults) {
    var battles = [], totalMult = 0;
    for (var c = 0; c < CFG.grid.cols; c++) {
      var fighters = [], wilds = 0, hasGoldhorn = false;
      for (var r = 0; r < CFG.grid.rows; r++) {
        var id = grid[c][r];
        if (CFG.isCreature(id)) {
          fighters.push({ r: r, id: id, mult: mults[c][r] });
          if (id === 'goldhorn') hasGoldhorn = true;
        } else if (id === 'wild') {
          wilds++;
        }
      }
      if (fighters.length < CFG.battle.minFighters) continue;

      var best = 0, i;
      for (i = 0; i < fighters.length; i++) best = Math.max(best, fighters[i].mult);
      var winners = [], result = 0;
      for (i = 0; i < fighters.length; i++) {
        if (fighters[i].mult === best) { winners.push(i); result += best; }
      }
      var wildBoost = wilds * CFG.battle.wildBoost;
      result += wildBoost;
      var goldDoubled = CFG.battle.goldhornDoubles && hasGoldhorn;
      if (goldDoubled) result *= 2;

      battles.push({ col: c, fighters: fighters, winners: winners,
                     wildBoost: wildBoost, goldDoubled: goldDoubled, result: result });
      totalMult += result;
    }
    return { battles: battles, totalMult: totalMult };
  };

  /* ---- One spin -----------------------------------------------------------
   * ctx: { events, opts, roundWin, capped, carry (free spins only) } */
  P.playSpin = function (ctx) {
    var weights = this.buildWeightTable(ctx.opts);
    var made;
    if (ctx.opts.forcedScatters) {
      made = this.makeForcedGrid(weights, ctx.opts, ctx.opts.forcedScatters);
      ctx.opts.forcedScatters = null; // only the triggering spin is forced
    } else {
      made = this.makeGrid(weights, ctx.opts);
    }
    var grid = made.grid, mults = made.mults;

    ctx.events.push({ type: 'reveal', grid: this.cloneGrid(grid), mults: this.cloneGrid(mults) });

    var pays = this.evalPays(grid);
    if (pays.wins.length)
      ctx.events.push({ type: 'win', wins: pays.wins, baseWin: pays.total });

    var battleRes = this.evalBattles(grid, mults);
    if (battleRes.battles.length)
      ctx.events.push({ type: 'battles', battles: battleRes.battles, totalMult: battleRes.totalMult });

    // Free spins: winning battle multipliers accumulate for the whole bonus
    var effMult = battleRes.totalMult;
    if (ctx.opts.inFreeSpins && battleRes.totalMult > 0) {
      ctx.carry += battleRes.totalMult;
      ctx.events.push({ type: 'carryUpdate', added: battleRes.totalMult, carry: ctx.carry });
    }
    if (ctx.opts.inFreeSpins) effMult = ctx.carry;

    // The multiplier is only applied AFTER the winning symbols are calculated
    var spinWin = pays.total;
    if (spinWin > 0 && effMult >= 2) {
      spinWin = pays.total * effMult;
      ctx.events.push({ type: 'multApply', baseWin: pays.total, mult: effMult, finalWin: spinWin });
    }

    var roundTotal = ctx.roundWin + spinWin;
    if (roundTotal >= CFG.maxWinX) {
      spinWin -= roundTotal - CFG.maxWinX; // clamp to exactly the cap
      ctx.capped = true;
    }
    if (spinWin > 0)
      ctx.events.push({ type: 'spinWin', win: spinWin });

    ctx.roundWin += spinWin;
    return { win: spinWin, scatters: this.countScatters(grid), battleCount: battleRes.battles.length };
  };

  /* ---- Full round -----------------------------------------------------------
   * mode: 'base' | 'buy'
   * Returns { events, totalWinX, cost, mode } — wins in BASE BET multiples. */
  P.playRound = function (mode) {
    mode = mode || 'base';
    var betMode = CFG.betModes[mode];
    var ctx = { events: [], roundWin: 0, capped: false, carry: 0 };
    var opts = { inFreeSpins: false };
    if (betMode.forcedScatters) {
      var fs = {}; for (var k in betMode.forcedScatters) fs[k] = betMode.forcedScatters[k];
      opts.forcedScatters = fs;
    }
    ctx.opts = opts;

    var base = this.playSpin(ctx);

    if (base.scatters >= 3 && !ctx.capped) {
      var sPay = CFG.scatterPays[Math.min(base.scatters, 6)] || 0;
      if (ctx.roundWin + sPay > CFG.maxWinX) sPay = CFG.maxWinX - ctx.roundWin;
      ctx.roundWin += sPay;
      ctx.events.push({ type: 'scatterPay', count: base.scatters, pay: sPay });
    }

    if (base.scatters >= CFG.freeSpins.trigger && !ctx.capped) {
      var spins = CFG.freeSpins.awards[Math.min(base.scatters, 6)];
      ctx.events.push({ type: 'fsTrigger', count: base.scatters, spins: spins,
                        super: !!betMode.superFs });
      this.playFreeSpins(ctx, spins, !!betMode.superFs);
    }

    if (ctx.capped) ctx.events.push({ type: 'maxWin', totalWin: ctx.roundWin });
    ctx.events.push({ type: 'roundEnd', totalWin: ctx.roundWin });

    return { events: ctx.events, totalWinX: ctx.roundWin, cost: betMode.cost, mode: mode };
  };

  P.playFreeSpins = function (ctx, spins, superFs) {
    ctx.opts = { inFreeSpins: true, superFs: !!superFs };
    ctx.carry = 0;

    var total = spins, played = 0, fsWin = 0;
    while (played < total && !ctx.capped) {
      played++;
      ctx.events.push({ type: 'fsSpin', index: played, total: total, carry: ctx.carry });
      var res = this.playSpin(ctx);
      fsWin += res.win;

      if (ctx.capped) break;

      // 3+ battles in one free spin: extra spins
      var bb = CFG.freeSpins.battleBonus;
      if (res.battleCount >= bb.battles) {
        total += bb.spins;
        ctx.events.push({ type: 'fsBattleBonus', battles: res.battleCount,
                          extraSpins: bb.spins, total: total });
      }
      // 3+ tickets during a free spin: retrigger
      if (res.scatters >= CFG.freeSpins.trigger) {
        total += CFG.freeSpins.retriggerSpins;
        ctx.events.push({ type: 'fsRetrigger', count: res.scatters,
                          extraSpins: CFG.freeSpins.retriggerSpins, total: total });
      }
    }
    ctx.events.push({ type: 'fsEnd', fsWin: fsWin, totalWin: ctx.roundWin, spinsPlayed: played });
  };

  g.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
