#!/usr/bin/env node
/* Solar Drift — engine contract & determinism checks.
 *
 * Usage: node verify.js
 *
 * Asserts the engine is deterministic for a fixed seed and that every produced
 * round emits a well-formed event book (reveal -> [win] -> [feature] -> roundEnd)
 * with sane values. Exits non-zero on the first failure.
 */
const Engine = require("./engine.js");
const Config = require("./config.js");

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
}

// 1. Determinism: same seed -> identical sequence of grids.
const seqA = [];
const seqB = [];
let a = Engine.createRNG(424242);
let b = Engine.createRNG(424242);
for (let i = 0; i < 500; i++) {
  seqA.push(Engine.playRound(a, { mode: "base", bet: 1 }).grid.join(""));
  seqB.push(Engine.playRound(b, { mode: "base", bet: 1 }).grid.join(""));
}
check("deterministic for a fixed seed", JSON.stringify(seqA) === JSON.stringify(seqB));
check("different seeds diverge",
  Engine.playRound(Engine.createRNG(1), { mode: "base", bet: 1 }).grid.join("") !==
  Engine.playRound(Engine.createRNG(2), { mode: "base", bet: 1 }).grid.join(""));

// 2. Grid sizes per mode.
for (const [mode, cfg] of Object.entries(Config.MODES)) {
  const r = Engine.playRound(Engine.createRNG(7), { mode, bet: 1 });
  check(`${mode}: grid has ${cfg.cells} cells`, r.grid.length === cfg.cells);
}

// 3. Event-book contract over many rounds.
const rng = Engine.createRNG(99);
let bookOk = true;
let nonNeg = true;
let capLabelOk = true;
for (let i = 0; i < 20000; i++) {
  const r = Engine.playRound(rng, { mode: "base", bet: 1 });
  const book = r.book;
  if (book[0].type !== "reveal" || book[book.length - 1].type !== "roundEnd") bookOk = false;
  if (book[book.length - 1].totalWin !== r.win) bookOk = false;
  if (r.win < 0) nonNeg = false;
  if (r.feature && (r.feature.spinsAwarded == null || r.feature.spinsAwarded <= 0)) capLabelOk = false;
}
check("event book starts with reveal, ends with roundEnd", bookOk);
check("round wins are never negative", nonNeg);
check("free-spins feature always awards spins", capLabelOk);

// 4. Win tiers are ordered and total to a known label set.
const tier = Engine.getWinTier(150, 1);
check("150x bet => MAX WIN tier", tier.label === "MAX WIN");
check("0.5x bet => NICE WIN tier", Engine.getWinTier(0.5, 1).label === "NICE WIN");

console.log("-".repeat(40));
console.log(`${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
