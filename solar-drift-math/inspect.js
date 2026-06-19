#!/usr/bin/env node
/* Solar Drift — inspect generated publication files.
 *
 * Usage:
 *   node inspect.js                 # summarise every mode in index.json
 *   node inspect.js base 3          # pretty-print the first 3 books of a mode
 *
 * Decompresses books_<mode>.jsonl.zst, validates it parses, and reports the
 * weighted RTP from the lookup table.
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

function booksOf(m) {
  return zlib.zstdDecompressSync(fs.readFileSync(path.join(DIR, m.events)))
    .toString("utf8").trim().split("\n");
}
function weightedRtp(m) {
  const csv = fs.readFileSync(path.join(DIR, m.weights), "utf8").trim().split("\n");
  let w = 0, wp = 0;
  for (let i = 1; i < csv.length; i++) { const [, wt, pm] = csv[i].split(","); w += +wt; wp += +wt * +pm; }
  return wp / w;
}

if (mode) {
  const m = index.modes.find((x) => x.name === mode);
  if (!m) { console.error(`Unknown mode "${mode}". Modes: ${index.modes.map((x) => x.name).join(", ")}`); process.exit(1); }
  const books = booksOf(m);
  console.log(`mode=${m.name} cost=${m.cost} books=${books.length} weightedRTP=${weightedRtp(m).toFixed(2)}x`);
  for (let i = 0; i < show && i < books.length; i++) {
    console.log("\n" + "-".repeat(60));
    console.log(JSON.stringify(JSON.parse(books[i]), null, 2));
  }
} else {
  console.log("Stake Engine publication summary");
  console.log("-".repeat(60));
  for (const m of index.modes) {
    const books = booksOf(m);
    console.log(`${m.name.padEnd(12)} cost=${String(m.cost).padStart(6)}  books=${String(books.length).padStart(6)}  weightedRTP=${weightedRtp(m).toFixed(2)}x`);
  }
  console.log("-".repeat(60));
  const anyOptimised = index.modes.some((m) => {
    const csv = fs.readFileSync(path.join(DIR, m.weights), "utf8").trim().split("\n");
    return csv.slice(1).some((l) => l.split(",")[1] !== "1");
  });
  console.log(anyOptimised
    ? "Weights calibrated by optimize.js (weighted RTP shown above ÷ cost ≈ target)."
    : "All weights = 1 (raw). Run optimize.js to calibrate to a target RTP.");
}
