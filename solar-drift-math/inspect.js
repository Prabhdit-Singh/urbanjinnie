#!/usr/bin/env node
/* Solar Drift — inspect generated publication files.
 *
 * Usage:
 *   node inspect.js                 # summarise every mode in index.json
 *   node inspect.js base 3          # pretty-print the first 3 books of a mode
 *
 * Summary is derived from the lookup tables (book count + weighted RTP), so it
 * stays fast and never has to fully decode the large (100k+) book files.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("node:zlib");

const DIR = path.join(__dirname, "library", "publish_files");
if (!fs.existsSync(path.join(DIR, "index.json"))) {
  console.error("No publication files found. Run: node generate.js");
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const mode = process.argv[2];
const show = parseInt(process.argv[3], 10) || 0;

function lookupStats(m) {
  // Stream the CSV line-by-line — count rows and accumulate weighted payout.
  const text = fs.readFileSync(path.join(DIR, m.weights), "utf8");
  let rows = 0, w = 0, wp = 0, optimised = false, start = text.indexOf("\n") + 1;
  for (const line of text.slice(start).split("\n")) {
    if (!line) continue;
    const [, wt, pm] = line.split(",");
    rows++; w += +wt; wp += +wt * +pm;
    if (wt !== "1") optimised = true;
  }
  return { rows, rtp: wp / w, optimised };
}
// First N JSONL lines from a .zst without stringifying the whole buffer.
function firstBooks(m, n) {
  const buf = zlib.zstdDecompressSync(fs.readFileSync(path.join(DIR, m.events)));
  const out = [];
  let start = 0;
  for (let i = 0; i < buf.length && out.length < n; i++) {
    if (buf[i] === 0x0a) { out.push(buf.toString("utf8", start, i)); start = i + 1; }
  }
  return out;
}

if (mode) {
  const m = index.modes.find((x) => x.name === mode);
  if (!m) { console.error(`Unknown mode "${mode}". Modes: ${index.modes.map((x) => x.name).join(", ")}`); process.exit(1); }
  const s = lookupStats(m);
  console.log(`mode=${m.name} cost=${m.cost} books=${s.rows} weightedRTP=${(s.rtp / m.cost * 100).toFixed(2)}%`);
  firstBooks(m, show).forEach((l) => { console.log("\n" + "-".repeat(60)); console.log(JSON.stringify(JSON.parse(l), null, 2)); });
} else {
  console.log("Stake Engine publication summary");
  console.log("-".repeat(64));
  let anyOptimised = false;
  for (const m of index.modes) {
    const s = lookupStats(m);
    anyOptimised = anyOptimised || s.optimised;
    console.log(`${m.name.padEnd(12)} cost=${String(m.cost).padStart(6)}  books=${String(s.rows).padStart(7)}  RTP=${(s.rtp / m.cost * 100).toFixed(2)}%`);
  }
  console.log("-".repeat(64));
  console.log(anyOptimised
    ? "Weights calibrated by optimize.js (weighted RTP ÷ cost ≈ target)."
    : "All weights = 1 (raw). Run optimize.js to calibrate to a target RTP.");
}
