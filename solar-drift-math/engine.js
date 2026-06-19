/* Solar Drift — math engine.
 *
 * Deterministic, seedable, dependency-free. Produces a complete result for one
 * round (an ordered EVENT BOOK: reveal -> win -> feature -> roundEnd), the same
 * separation Stake Engine enforces between math-sdk (this) and web-sdk (the
 * frontend playback). Runs in Node and the browser.
 *
 * The math here is extracted verbatim from the frontend (js/game.js): the same
 * LCG RNG, weighted pools, scatter injection, ways evaluation, Energy-Core
 * multiplier rule, free/storm/singularity modifiers and win tiers.
 */
(function (root, factory) {
  const Config =
    typeof module !== "undefined" && module.exports
      ? require("./config.js")
      : root.SolarDriftConfig;
  const api = factory(Config);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SolarDriftEngine = api;
})(typeof self !== "undefined" ? self : this, function (Config) {
  const { SYMBOLS, WIN_FACTOR, MODES, WIN_TIERS, FREE_SPINS, STORM } = Config;

  // ---- RNG: linear congruential generator, identical to js/game.js ----------
  function createRNG(seed) {
    let s = (seed >>> 0) || 1;
    return {
      next() {
        // Same LCG as js/game.js. Operands stay within Number.MAX_SAFE_INTEGER
        // (max ~7.15e15 < 9.007e15), so plain multiply is exact and bit-faithful.
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      },
      get seed() { return s; },
    };
  }

  // ---- Pools ---------------------------------------------------------------
  const byId = (id) => SYMBOLS.find((s) => s.id === id);
  const regularSymbols = SYMBOLS.filter((s) => !["scatter", "wild"].includes(s.id));

  function flat(weights) {
    return SYMBOLS.flatMap((s) => Array(Math.max(1, weights(s))).fill(s));
  }
  const POOLS = {
    base: flat((s) => s.weight),
    free: flat((s) => (s.id === "scatter" ? 2 : s.weight)),
    storm: SYMBOLS.filter((s) => s.id !== "scatter").flatMap((s) =>
      Array(s.id === "locked" ? 5 : s.weight).fill(s)
    ),
    singularity: flat((s) => (s.id === "singularity" ? s.weight + 3 : s.weight)),
  };
  const poolFor = (mode) => POOLS[mode] || POOLS.base;

  const pick = (rng, pool) => pool[Math.floor(rng.next() * pool.length)];
  function shuffleIndexes(rng, n) {
    return [...Array(n).keys()].sort(() => rng.next() - 0.5);
  }

  // ---- Outcome generation (mirrors buildOutcome) ---------------------------
  function buildOutcome(rng, mode, cells) {
    const pool = poolFor(mode);
    const cfg = MODES[mode] || MODES.base;
    const outcome = Array.from({ length: cells }, () => pick(rng, pool));
    if (mode === "base" && rng.next() < cfg.scatterChance) {
      const positions = shuffleIndexes(rng, cells).slice(0, rng.next() < 0.35 ? 3 : 2);
      positions.forEach((i) => (outcome[i] = byId("scatter")));
    }
    if (mode === "free" && rng.next() < cfg.scatterChance) {
      shuffleIndexes(rng, cells).slice(0, 3).forEach((i) => (outcome[i] = byId("scatter")));
    }
    return outcome;
  }

  // ---- Ways evaluation (mirrors evaluateWays) ------------------------------
  function evaluateWays(outcome, bet, mode) {
    const cfg = MODES[mode] || MODES.base;
    const { cols, rows } = cfg;
    const grid = [];
    for (let c = 0; c < cols; c++) grid.push(outcome.slice(c * rows, c * rows + rows));

    let total = 0;
    const winningIndexes = new Set();
    const details = [];
    const candidates = regularSymbols.filter((s) => s.id !== "scatter");

    for (const sym of candidates) {
      let ways = 1;
      let matchedCols = 0;
      const tempIndexes = [];
      for (let c = 0; c < cols; c++) {
        const matches = [];
        for (let r = 0; r < rows; r++) {
          const s = grid[c][r];
          if (s.id === sym.id || s.id === "wild") matches.push(c * rows + r);
        }
        if (matches.length === 0) break;
        matchedCols++;
        ways *= matches.length;
        tempIndexes.push(...matches);
      }
      if (matchedCols >= 3) {
        const pay = sym.pay[matchedCols - 1] || 0;
        const value = bet * pay * ways * WIN_FACTOR;
        if (value > 0) {
          total += value;
          tempIndexes.forEach((i) => winningIndexes.add(i));
          details.push(`${sym.name} ${matchedCols} reels x ${ways} ways`);
        }
      }
    }

    const coreCount = outcome.filter((s) => s.id === "core").length;
    const wildCount = outcome.filter((s) => s.id === "wild").length;
    const scatterCount = outcome.filter((s) => s.id === "scatter").length;

    let multiplier = 1;
    if (coreCount) multiplier += Math.min(10, coreCount * cfg.coreMultStep);
    if (mode === "free") multiplier *= this && this.freeMult ? this.freeMult : 1;
    if (mode === "singularity") multiplier *= cfg.modeMultiplier;

    total *= multiplier;
    return {
      win: +total.toFixed(2),
      winningIndexes: [...winningIndexes],
      coreCount, wildCount, scatterCount,
      multiplier: +multiplier.toFixed(2),
      details,
    };
  }

  function getWinTier(amount, bet) {
    const multiple = amount / Math.max(bet, 0.01);
    return WIN_TIERS.find((t) => multiple >= t.min) || WIN_TIERS[WIN_TIERS.length - 1];
  }

  // ---- Round playback: returns an event book -------------------------------
  // ctx: { mode, bet, freeMult } — freeMult only used in "free" mode.
  function playRound(rng, ctx = {}) {
    const mode = ctx.mode || "base";
    const bet = ctx.bet || 1;
    const cfg = MODES[mode] || MODES.base;
    const outcome = buildOutcome(rng, mode, cfg.cells);
    const result = evaluateWays.call({ freeMult: ctx.freeMult || 1 }, outcome, bet, mode);

    let amount = result.win;
    if (mode === "storm" && result.coreCount > 0) amount += result.coreCount * bet * STORM.coreBonusX;
    amount = +amount.toFixed(2);

    let feature = null;
    if (mode === "base" && result.scatterCount >= 3) {
      const key = result.scatterCount >= 5 ? "5" : String(result.scatterCount);
      feature = {
        type: "freeSpins",
        scatters: result.scatterCount,
        spinsAwarded: FREE_SPINS.award[key],
        startMult: result.scatterCount >= 5 ? FREE_SPINS.startMult.fivePlus : FREE_SPINS.startMult.default,
      };
    }

    const tier = amount > 0 ? getWinTier(amount, bet) : { label: "NO WIN" };
    const book = [
      { type: "reveal", mode, grid: outcome.map((s) => s.id) },
    ];
    if (amount > 0) book.push({ type: "win", amount, multiplier: result.multiplier, tier: tier.label, details: result.details });
    if (feature) book.push({ type: "feature", feature });
    book.push({ type: "roundEnd", totalWin: amount });

    return {
      mode, bet,
      grid: outcome.map((s) => s.id),
      win: amount,
      winTier: tier.label,
      multiplier: result.multiplier,
      scatterCount: result.scatterCount,
      coreCount: result.coreCount,
      feature,
      book,
    };
  }

  return {
    createRNG,
    pools: POOLS,
    buildOutcome,
    evaluateWays,
    getWinTier,
    playRound,
    symbols: SYMBOLS,
  };
});
