#!/usr/bin/env node
/* Solar Drift — RTP calibration (lookup-weight optimisation).
 *
 * The analogue of Stake Engine's optimisation step: it tunes the per-book
 * weights in each lookUpTable so the weighted-average payoutMultiplier equals a
 * target RTP. Reads the files produced by generate.js, rewrites the lookup
 * tables and index.json in place, and reports before/after RTP.
 *
 * Usage: node optimize.js [targetRtpPct]      (default 96.20)
 *
 * Method per mode (cost = entry price in x bet):
 *   target weighted-mean payout = RTP * cost.
 *   - If that target lies within [minPayout, maxPayout] of the book set, we hit
 *     it exactly by up/down-weighting one side of the distribution (integer
 *     weights >= 1) while keeping the listed cost.
 *   - If the target exceeds the largest payout the demo math can produce, the
 *     listed cost is UNREACHABLE; we re-price the mode to its fair value
 *     (cost = meanPayout / RTP, uniform weights) and flag it.
 */
const fs = require("fs");
const path = require("path");

const TARGET = (parseFloat(process.argv[2]) || 96.2) / 100;
const DIR = path.join(__dirname, "library", "publish_files");
const indexPath = path.join(DIR, "index.json");
if (!fs.existsSync(indexPath)) { console.error("Run generate.js first."); process.exit(1); }
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

function readPayouts(csvFile) {
  const lines = fs.readFileSync(path.join(DIR, csvFile), "utf8").trim().split("\n");
  return lines.slice(1).map((l) => { const [id, , pm] = l.split(","); return { id: +id, payout: +pm }; });
}
function writeLookup(csvFile, rows) {
  fs.writeFileSync(path.join(DIR, csvFile),
    "id,weight,payoutMultiplier\n" + rows.map((r) => `${r.id},${r.weight},${r.payout}`).join("\n") + "\n");
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const weightedMean = (rows) => sum(rows.map((r) => r.weight * r.payout)) / sum(rows.map((r) => r.weight));

// Integer weights so that weighted-mean payout == targetMean (exactly, modulo
// 1-unit rounding). Upweights the low side when current mean is too high, the
// high side when too low.
function calibrate(books, targetMean) {
  const N = books.length, S = sum(books.map((b) => b.payout));
  const cur = S / N;
  const rows = books.map((b) => ({ id: b.id, payout: b.payout, weight: 1 }));
  if (Math.abs(cur - targetMean) < 1e-9) return rows;

  const upLow = cur > targetMean;                     // pull mean DOWN via low side
  const U = books.filter((b) => (upLow ? b.payout < targetMean : b.payout > targetMean));
  const O = books.filter((b) => !(upLow ? b.payout < targetMean : b.payout > targetMean));
  const S_U = sum(U.map((b) => b.payout)), N_U = U.length;
  const S_O = sum(O.map((b) => b.payout)), N_O = O.length;
  // wU = (T*N_O - S_O) / (S_U - T*N_U)
  const wU = (targetMean * N_O - S_O) / (S_U - targetMean * N_U);
  const floor = Math.max(1, Math.floor(wU));
  const frac = wU - floor;
  const inU = new Set(U.map((b) => b.id));
  let bumpAcc = 0;
  for (const r of rows) {
    if (inU.has(r.id)) {
      r.weight = floor;
      bumpAcc += frac;
      if (bumpAcc >= 1) { r.weight += 1; bumpAcc -= 1; }
    } else r.weight = 1;
  }
  return rows;
}

console.log(`Calibrating to target RTP ${(TARGET * 100).toFixed(2)}%`);
console.log("-".repeat(78));
console.log("mode          cost     RTP before   ->   RTP after    action");
console.log("-".repeat(78));

for (const m of index.modes) {
  const books = readPayouts(m.weights);
  const mean = sum(books.map((b) => b.payout)) / books.length;
  const maxPayout = Math.max(...books.map((b) => b.payout));
  const rtpBefore = mean / m.cost;
  let rows, action, newCost = m.cost;
  const targetMean = TARGET * m.cost;

  if (targetMean <= maxPayout) {
    rows = calibrate(books, targetMean);
    action = "weights calibrated @ listed cost";
  } else {
    // Unreachable at listed cost -> fair-price the mode.
    newCost = +(mean / TARGET).toFixed(2);
    rows = books.map((b) => ({ ...b, weight: 1 }));
    action = `REPRICED ${m.cost}x -> ${newCost}x (target unreachable; max payout ${maxPayout.toFixed(0)}x)`;
    m.cost = newCost;
  }
  writeLookup(m.weights, rows);
  const rtpAfter = weightedMean(rows) / newCost;
  console.log(
    `${m.name.padEnd(12)} ${String(newCost).padStart(6)}   ${(rtpBefore * 100).toFixed(1).padStart(8)}%   ->   ${(rtpAfter * 100).toFixed(2).padStart(7)}%    ${action}`
  );
}

fs.writeFileSync(indexPath, JSON.stringify({ modes: index.modes }, null, 2) + "\n");
console.log("-".repeat(78));
console.log("Rewrote lookup tables + index.json.");
console.log("REPRICED modes mean the demo math cannot support the listed buy price at this");
console.log("RTP; production math would be reshaped so fixed buy prices are reachable.");
