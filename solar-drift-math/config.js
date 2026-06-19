/* Solar Drift — math configuration.
 *
 * This is the single source of truth for the game's math model: symbols,
 * reel weights, pay values, bet levels, mode definitions and caps. It is the
 * exact model used by the frontend (js/game.js) extracted into a standalone,
 * dependency-free module that runs in Node and the browser.
 *
 * NOTE: these are DEMO targets. The pay model is a presentation model and is
 * NOT calibrated to the stated RTP. A production release must replace this with
 * approved, certified server-side math (see README).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SolarDriftConfig = api;
})(typeof self !== "undefined" ? self : this, function () {
  // id, display name, sprite, reel weight, pays for [1,2,3,4,5] of a kind.
  // Wins require 3+ on adjacent reels (ways), so only indexes 2..4 pay.
  const SYMBOLS = [
    { id: "scatter",     name: "Black Hole Scatter",    img: "black-hole-scatter.png",     weight: 3,  pay: [0, 0, 0, 0, 0] },
    { id: "wild",        name: "Cosmic Wild",           img: "cosmic-wild.png",            weight: 4,  pay: [0, 0, 0, 0, 0] },
    { id: "k",           name: "K",                     img: "K.png",                      weight: 11, pay: [0, 0, 1.2, 3, 8] },
    { id: "planet",      name: "Plasma Planet",         img: "plasma-planet.png",          weight: 8,  pay: [0, 0, 1.8, 5, 14] },
    { id: "10",          name: "10",                    img: "10.png",                     weight: 12, pay: [0, 0, 0.8, 2, 5] },
    { id: "j",           name: "J",                     img: "J.png",                      weight: 12, pay: [0, 0, 0.8, 2, 5] },
    { id: "ship",        name: "Drift Ship",            img: "drift-ship.png",             weight: 7,  pay: [0, 0, 2.5, 7, 18] },
    { id: "core",        name: "Energy Core Multiplier",img: "energy-core-multiplier.png", weight: 5,  pay: [0, 0, 1.5, 4, 10] },
    { id: "a",           name: "A",                     img: "A.png",                      weight: 11, pay: [0, 0, 1, 2.5, 7] },
    { id: "commander",   name: "Solar Commander",       img: "solar-commander.png",        weight: 4,  pay: [0, 0, 4, 12, 32] },
    { id: "q",           name: "Q",                     img: "Q.png",                      weight: 11, pay: [0, 0, 0.9, 2.2, 6] },
    { id: "locked",      name: "Locked Core",           img: "locked-core.png",            weight: 3,  pay: [0, 0, 1.8, 5, 12] },
    { id: "singularity", name: "Singularity Symbol",    img: "singularity.png",            weight: 3,  pay: [0, 0, 5, 15, 45] },
    { id: "scientist",   name: "Energy Scientist",      img: "energy-scientist.png",       weight: 4,  pay: [0, 0, 3.5, 10, 28] },
    { id: "solar",       name: "Solar Core",            img: "solar-core.png",             weight: 6,  pay: [0, 0, 3, 8, 22] },
  ];

  const BETS = [0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 5, 10, 20, 50, 100];

  // Scalar applied to every ways win (presentation tuning factor from game.js).
  const WIN_FACTOR = 0.08;

  // Per-mode grid geometry and outcome behaviour.
  const MODES = {
    base:        { cols: 5, rows: 4, cells: 20, scatterChance: 0.10, coreMultStep: 0.25 },
    free:        { cols: 5, rows: 4, cells: 20, scatterChance: 0.16, coreMultStep: 0.50 },
    storm:       { cols: 5, rows: 4, cells: 20, scatterChance: 0,    coreMultStep: 0.25 },
    singularity: { cols: 7, rows: 7, cells: 49, scatterChance: 0,    coreMultStep: 0.25, modeMultiplier: 2.5 },
  };

  // Free-spins awards keyed by scatter count (3 / 4 / 5+).
  const FREE_SPINS = {
    award:        { "3": 10, "4": 12, "5": 15 },
    retrigger:    { "3": 3, "4": 5, "5": 8 },
    startMult:    { default: 2, fivePlus: 3 },
    superBuy:     { spins: 15, startMult: 5 },
  };

  // Storm respins add a flat per-Energy-Core bonus.
  const STORM = { coreBonusX: 4, startRespins: 3 };

  const WIN_TIERS = [
    { min: 100, label: "MAX WIN",     subtitle: "YOU HIT THE DRIFT LIMIT" },
    { min: 50,  label: "SENSATIONAL", subtitle: "COSMIC PAYOUT ACTIVATED" },
    { min: 25,  label: "MEGA WIN",    subtitle: "SOLAR STORM PAYOUT" },
    { min: 12,  label: "BIG WIN",     subtitle: "BIG ENERGY BURST" },
    { min: 6,   label: "GOOD WIN",    subtitle: "GOOD DRIFT HIT" },
    { min: 0,   label: "NICE WIN",    subtitle: "NICE HIT" },
  ];

  const MATH = {
    gameType: "5x4, 1024 ways",
    ways: 1024,
    rtpTargetPct: 96.2,   // DEMO display target — not calibrated by this model
    volatility: "High",
    maxWinX: 10000,       // display cap (× bet)
  };

  return { SYMBOLS, BETS, WIN_FACTOR, MODES, FREE_SPINS, STORM, WIN_TIERS, MATH };
});
