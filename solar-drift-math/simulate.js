#!/usr/bin/env node
/* Solar Drift — Monte-Carlo math simulation.
 *
 * Usage:
 *   node simulate.js [rounds] [mode] [seed]
 *   node simulate.js 200000 base 12345
 *
 * Plays N independent rounds of the chosen mode and reports the simulated
 * return, hit rate, win distribution and (base mode) free-spins trigger
 * frequency. This is the analogue of a math-sdk simulation run.
 *
 * Reminder: the bundled pay model is a DEMO presentation model and is NOT
 * calibrated to the displayed 96.20% RTP. These numbers describe the demo math
 * as-is; production requires certified, calibrated math.
 */
const Engine = require("./engine.js");
const Config = require("./config.js");

const rounds = Math.max(1, parseInt(process.argv[2], 10) || 100000);
const mode = process.argv[3] || "base";
const seed = parseInt(process.argv[4], 10) || (Date.now() >>> 0);
const bet = 1;
const freeMult = mode === "free" ? Config.FREE_SPINS.startMult.default : 1;

if (!Config.MODES[mode]) {
  console.error(`Unknown mode "${mode}". Valid: ${Object.keys(Config.MODES).join(", ")}`);
  process.exit(1);
}

const rng = Engine.createRNG(seed);
let totalBet = 0;
let totalWin = 0;
let hits = 0;
let bonus = 0;
let maxMultiple = 0;
const tierCounts = {};

for (let i = 0; i < rounds; i++) {
  const r = Engine.playRound(rng, { mode, bet, freeMult });
  totalBet += bet;
  totalWin += r.win;
  if (r.win > 0) hits++;
  if (r.feature) bonus++;
  const multiple = r.win / bet;
  if (multiple > maxMultiple) maxMultiple = multiple;
  tierCounts[r.winTier] = (tierCounts[r.winTier] || 0) + 1;
}

const pct = (n) => (n * 100).toFixed(2) + "%";
const oneIn = (count) => (count > 0 ? `1 in ${Math.round(rounds / count)}` : "none");

console.log("Solar Drift — math simulation");
console.log("-".repeat(40));
console.log(`mode            : ${mode}`);
console.log(`rounds          : ${rounds.toLocaleString()}`);
console.log(`seed            : ${seed}`);
console.log(`bet             : ${bet}`);
console.log("-".repeat(40));
console.log(`simulated RTP   : ${pct(totalWin / totalBet)}`);
console.log(`hit rate        : ${pct(hits / rounds)}`);
if (mode === "base") console.log(`free spins      : ${oneIn(bonus)}`);
console.log(`max win         : ${maxMultiple.toFixed(2)}x bet (display cap ${Config.MATH.maxWinX}x)`);
console.log("-".repeat(40));
console.log("win tiers:");
Object.entries(tierCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([tier, n]) => console.log(`  ${tier.padEnd(12)} ${pct(n / rounds)}`));
console.log("-".repeat(40));
console.log("NOTE: demo presentation math — not calibrated to displayed RTP.");
