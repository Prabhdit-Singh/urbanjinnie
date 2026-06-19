# Solar Drift — Math (Stake Engine format)

The **math model** for Solar Drift, separated from the frontend, and a generator that
emits the files the **Stake Engine RGS** requires for a math upload.

This mirrors the Stake Engine split between **math-sdk** (produces outcomes) and
**web-sdk** (plays them back). Standalone, deterministic, no npm dependencies. Requires
**Node.js ≥ 22** (uses the built-in `node:zlib` zstd codec).

> Docs: <https://stakeengine.github.io/math-sdk/rgs_docs/data_format/>

## Files

```
config.js      paytable, reel weights, pays, bet levels, mode geometry, caps, win tiers
engine.js      seeded RNG, outcome generation, ways evaluation, multipliers, event book
generate.js    writes the Stake Engine publication files (index.json, books, lookup tables)
optimize.js    RTP calibration — tunes lookup weights so weighted RTP = target
inspect.js     decompress + summarise / pretty-print generated books
simulate.js    quick Monte-Carlo RTP / hit-rate report
verify.js      determinism + event-book contract checks
package.json   npm scripts
library/
  publish_files/
    index.json                    { modes:[{name,cost,events,weights}] }
    books_<mode>.jsonl.zst        zstandard-compressed JSON-lines, one round per line
    lookUpTable_<mode>_0.csv      id,weight,payoutMultiplier
```

The bundled `library/publish_files/` is already generated **and calibrated** to 96.20%.

The model is extracted **verbatim** from the frontend's `js/game.js` (same LCG RNG, pools,
scatter injection, ways evaluation, Energy-Core multiplier, free/storm/singularity rules),
so the math and the frontend describe the same game.

## Run it

```bash
npm run build              # generate -> optimize -> inspect (the full pipeline)

# or step by step:
node verify.js                  # determinism + contract checks (no files needed)
node generate.js                # write library/publish_files/ (default sizes)
node generate.js 100000 20000   # more base / bonus books for production-scale volume
node optimize.js                # calibrate lookup weights to 96.20% RTP
node optimize.js 95.5           # calibrate to a different target RTP
node inspect.js                 # summary table of every mode + weighted RTP
node inspect.js base 3          # pretty-print the first 3 base books
```

## Stake Engine upload format

`index.json` lists the bet modes; each references a compressed **book** file and a
**lookup table**:

```json
{
  "modes": [
    { "name": "base",  "cost": 1.0,   "events": "books_base.jsonl.zst",  "weights": "lookUpTable_base_0.csv" },
    { "name": "bonus", "cost": 100.0, "events": "books_bonus.jsonl.zst", "weights": "lookUpTable_bonus_0.csv" }
  ]
}
```

- **Book** (one JSON-lines entry per round): `{ "id", "payoutMultiplier", "events": [...] }`,
  where `events` is the ordered sequence the frontend replays
  (`reveal → freeSpinTrigger → freeSpin… → roundEnd`, etc.).
- **Lookup table** row: `id,weight,payoutMultiplier`. At play time the RGS samples a book
  by `weight`; the weighted-average `payoutMultiplier` is the mode's RTP.

Modes generated here: `base` (1×), `bonus` Black Hole Free Spins (100×), `super` Super
Free Spins (250×), `storm` Solar Storm Respins (150×), `singularity` Singularity (500×).

## Calibration result (96.20%)

`optimize.js` calibrates each mode to 96.20% RTP. Latest run:

| Mode | Cost | RTP before | RTP after | Note |
| --- | --- | --- | --- | --- |
| base        | 1×      | 2129% | **96.20%** | weights calibrated at listed cost |
| bonus       | 100×    | 230%  | **96.17%** | weights calibrated at listed cost |
| super       | 250×    | 178%  | **96.22%** | weights calibrated at listed cost |
| storm       | 23.88×  | 15%   | **96.21%** | repriced — see below |
| singularity | 11.33×  | 2%    | **96.16%** | repriced — see below |

**Reprice finding.** The demo math cannot pay enough for the storm (150×) and singularity
(500×) buy prices at 96.20% RTP — their largest possible payouts (≈97× and ≈318×) are
below the required mean. `optimize.js` therefore re-prices those modes to a fair value
(`mean / RTP`). In a production build the math for those features would be **reshaped** so
the intended fixed buy prices are reachable; the optimiser surfaces the issue rather than
hiding it.

## ⚠️ Remaining work for a real submission

1. **Production math.** This is still the **demo** pay model — now correctly *calibrated*
   to 96.20%, but with an extreme, fat-tailed shape (very low hit rate) and unsupported
   buy prices on two features. A real release needs a purpose-built pay model whose
   distribution and feature values are designed for the target RTP and prices.
2. **Official toolchain & web-sdk frontend.** Stake's reference flow is the Python
   `math-sdk` (`make setup`, Python 3.12+, Rust) for math and the declarative TS/PIXI
   **`web-sdk`** for the client. Solar Drift's frontend is bespoke vanilla JS, **not**
   web-sdk — running it on Stake's player requires porting the presentation layer onto
   web-sdk (or adapting web-sdk to replay these books).

In short: **the math is now format-compliant and RTP-calibrated; a production pay model
and a web-sdk frontend are the remaining work for an actual real-money release.**
