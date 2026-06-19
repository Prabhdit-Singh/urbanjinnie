#!/usr/bin/env node
/* Solar Drift — Stake Engine publication generator.
 *
 * Produces the math files the Stake Engine RGS requires for upload, in the
 * documented format (https://stakeengine.github.io/math-sdk/rgs_docs/data_format/):
 *
 *   library/publish_files/
 *     index.json                      { modes:[{name,cost,events,weights}] }
 *     books_<mode>.jsonl.zst          zstandard-compressed JSON-lines books
 *     lookUpTable_<mode>_0.csv        id,weight,payoutMultiplier
 *
 * Each "book" is one complete round: an ordered event list plus its
 * payoutMultiplier (round win / bet). The lookup table assigns a selection
 * weight to every book; the weighted-average payoutMultiplier is the mode RTP.
 *
 * Usage: node generate.js [baseCount] [bonusCount]
 *
 * NOTE: this is an UNOPTIMISED library generated from the demo math. Stake's
 * production pipeline runs an optimisation step (Rust) that tunes the lookup
 * weights to hit an exact target RTP. See README for the gap.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("node:zlib");
const Engine = require("./engine.js");
const Config = require("./config.js");

// Production default: Stake recommends 100k+ simulations per mode for outcome
// diversity. Override with CLI args for smaller/faster local runs.
const BASE_COUNT = Math.max(1, parseInt(process.argv[2], 10) || 100000);
const BONUS_COUNT = Math.max(1, parseInt(process.argv[3], 10) || 100000);

const OUT = path.join(__dirname, "library", "publish_files");
fs.rmSync(path.join(__dirname, "library"), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const FS = Config.FREE_SPINS;
const round2 = (n) => +n.toFixed(2);
const evalWays = (outcome, freeMult, mode) =>
  Engine.evaluateWays.call({ freeMult: freeMult || 1 }, outcome, 1, mode);
const ids = (outcome) => outcome.map((s) => s.id);

// ---- Free-spins session (mirrors game.js spinFree / retrigger) -------------
function playFreeSession(rng, spins, startMult) {
  const events = [];
  let mult = startMult;
  let left = spins;
  let total = 0;
  events.push({ type: "freeSpinsStart", spins, startMult });
  while (left > 0) {
    left--;
    const outcome = Engine.buildOutcome(rng, "free", Config.MODES.free.cells);
    const res = evalWays(outcome, mult, "free");
    total += res.win;
    events.push({ type: "freeSpin", grid: ids(outcome), win: round2(res.win), mult, left });
    if (res.coreCount > 0) {
      mult = Math.min(25, mult + res.coreCount);
      events.push({ type: "multUpdate", mult });
    }
    if (res.scatterCount >= 3) {
      const key = res.scatterCount >= 5 ? "5" : String(res.scatterCount);
      const extra = FS.retrigger[key];
      left += extra;
      events.push({ type: "retrigger", extra, scatters: res.scatterCount });
    }
  }
  events.push({ type: "freeSpinsEnd", totalWin: round2(total) });
  return { events, win: total };
}

// ---- Storm respin session (mirrors game.js spinStorm) ----------------------
function playStormSession(rng) {
  const events = [];
  let respins = Config.STORM.startRespins;
  let lockedBefore = 0;
  let total = 0;
  events.push({ type: "stormStart", respins });
  while (respins > 0) {
    const outcome = Engine.buildOutcome(rng, "storm", Config.MODES.storm.cells);
    const res = evalWays(outcome, 1, "storm");
    let win = res.win + (res.coreCount > 0 ? res.coreCount * Config.STORM.coreBonusX : 0);
    total += win;
    const lockedNow = outcome.filter((s) => s.id === "locked").length;
    events.push({ type: "respin", grid: ids(outcome), win: round2(win), locked: lockedNow, respins });
    if (lockedNow > lockedBefore) { lockedBefore = lockedNow; respins = Config.STORM.startRespins; }
    else respins--;
  }
  events.push({ type: "stormEnd", totalWin: round2(total) });
  return { events, win: total };
}

// ---- Singularity session (single 7x7 spin) --------------------------------
function playSingularitySession(rng) {
  const outcome = Engine.buildOutcome(rng, "singularity", Config.MODES.singularity.cells);
  const res = evalWays(outcome, 1, "singularity");
  return {
    events: [
      { type: "singularityReveal", grid: ids(outcome) },
      ...(res.win > 0 ? [{ type: "win", amount: round2(res.win), mult: res.multiplier }] : []),
      { type: "singularityEnd", totalWin: round2(res.win) },
    ],
    win: res.win,
  };
}

// ---- One complete round per mode ------------------------------------------
function playRound(rng, mode) {
  if (mode === "base") {
    const events = [];
    let total = 0;
    const outcome = Engine.buildOutcome(rng, "base", Config.MODES.base.cells);
    const res = evalWays(outcome, 1, "base");
    total += res.win;
    events.push({ type: "reveal", grid: ids(outcome), win: round2(res.win), mult: res.multiplier });
    if (res.scatterCount >= 3) {
      const key = res.scatterCount >= 5 ? "5" : String(res.scatterCount);
      const award = FS.award[key];
      const startMult = res.scatterCount >= 5 ? FS.startMult.fivePlus : FS.startMult.default;
      events.push({ type: "freeSpinTrigger", scatters: res.scatterCount, award });
      const fs = playFreeSession(rng, award, startMult);
      events.push(...fs.events);
      total += fs.win;
    }
    events.push({ type: "roundEnd", totalWin: round2(total) });
    return { events, payout: round2(total) };
  }
  if (mode === "bonus")       { const s = playFreeSession(rng, FS.award["3"], FS.startMult.default); return wrap(s); }
  if (mode === "super")       { const s = playFreeSession(rng, FS.superBuy.spins, FS.superBuy.startMult); return wrap(s); }
  if (mode === "storm")       { const s = playStormSession(rng); return wrap(s); }
  if (mode === "singularity") { const s = playSingularitySession(rng); return wrap(s); }
  throw new Error("unknown mode " + mode);
  function wrap(s) { return { events: s.events, payout: round2(s.win) }; }
}

// ---- Mode definitions (name -> entry cost in x bet) -----------------------
const MODES = [
  { name: "base",        cost: 1.0,   count: BASE_COUNT },
  { name: "bonus",       cost: 100.0, count: BONUS_COUNT },
  { name: "super",       cost: 250.0, count: BONUS_COUNT },
  { name: "storm",       cost: 150.0, count: BONUS_COUNT },
  { name: "singularity", cost: 500.0, count: BONUS_COUNT },
];

const indexModes = [];
console.log("Generating Stake Engine publication files...");
for (const m of MODES) {
  const rng = Engine.createRNG(0x50127 ^ hash(m.name)); // deterministic per mode
  const lookupRows = ["id,weight,payoutMultiplier"];
  let weightedPayout = 0;
  let maxPayout = 0;
  const booksName = `books_${m.name}.jsonl.zst`;
  const weightsName = `lookUpTable_${m.name}_0.csv`;
  // Stream book lines to a temp .jsonl on disk (a single JS string of all books
  // overflows V8's max string length at high simulation counts), then compress.
  const tmpPath = path.join(OUT, `books_${m.name}.jsonl.tmp`);
  const fd = fs.openSync(tmpPath, "w");
  for (let i = 1; i <= m.count; i++) {
    const r = playRound(rng, m.name);
    fs.writeSync(fd, JSON.stringify({ id: i, payoutMultiplier: r.payout, events: r.events }) + "\n");
    lookupRows.push(`${i},1,${r.payout}`);
    weightedPayout += r.payout;
    if (r.payout > maxPayout) maxPayout = r.payout;
  }
  fs.closeSync(fd);
  const compressed = zlib.zstdCompressSync(fs.readFileSync(tmpPath)); // Buffer has no 512MB limit
  fs.writeFileSync(path.join(OUT, booksName), compressed);
  fs.unlinkSync(tmpPath);
  fs.writeFileSync(path.join(OUT, weightsName), lookupRows.join("\n") + "\n");

  const rtp = weightedPayout / m.count;       // average payout (x bet)
  const rtpVsCost = (rtp / m.cost) * 100;      // return relative to entry cost
  indexModes.push({ name: m.name, cost: m.cost, events: booksName, weights: weightsName });
  console.log(
    `  ${m.name.padEnd(12)} books=${String(m.count).padStart(6)} ` +
    `avgPayout=${rtp.toFixed(2)}x  RTP/cost=${rtpVsCost.toFixed(2)}%  max=${maxPayout.toFixed(2)}x`
  );
}

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ modes: indexModes }, null, 2) + "\n");
console.log(`\nWrote ${indexModes.length} modes to ${path.relative(__dirname, OUT)}/`);
console.log("Files: index.json, books_<mode>.jsonl.zst, lookUpTable_<mode>_0.csv");

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = (h * 16777619) >>> 0; } return h; }
