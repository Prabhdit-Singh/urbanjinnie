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

## Simulation volume — production vs sample

Stake recommends **100k+ simulations per mode**. `generate.js` therefore defaults to
**100,000 books per mode**; pass smaller counts for quick local runs
(`node generate.js 3000 1500`).

> The `library/publish_files/` committed in this repo is a **small sample** (kept lean for
> git). Run `npm run build` to produce the full **100k/mode production set** (≈249 MB) that
> you upload to Stake. The generator is deterministic, so the production set is reproducible.

Production 100k/mode run (validated: 100,000 records per mode, **0** CSV↔logic payout
mismatches, valid zStandard):

| Mode | Cost | RTP after | Book file (zst) | Note |
| --- | --- | --- | --- | --- |
| base        | 1×    | **96.20%** | 11 MB  | calibrated at listed cost |
| bonus       | 100×  | **96.20%** | 84 MB  | calibrated at listed cost |
| super       | 250×  | **96.19%** | 124 MB | calibrated at listed cost |
| storm       | 150×  | **96.20%** | 17 MB  | calibrated at listed cost |
| singularity | 500×  | **96.20%** | 7 MB   | calibrated at listed cost |

**Reprice resolved at scale.** At small sample sizes the storm/singularity buy modes had to
be re-priced (their few sampled books couldn't reach the 150×/500× target mean). At the 100k
production default the sample contains high-enough payouts (storm max ≈230×, singularity
≈860×), so **all modes calibrate at their listed buy prices** — no repricing.

## ⚠️ Remaining work for a real submission

1. **Production math.** This is still the **demo** pay model — now correctly *calibrated*
   to 96.20% at listed costs and generated at 100k/mode, but with an extreme, fat-tailed
   shape (very low hit rate). A real release needs a purpose-built pay model whose
   distribution and feature values are designed for the target RTP and prices.
2. **Official toolchain & web-sdk frontend.** Stake's reference flow is the Python
   `math-sdk` (`make setup`, Python 3.12+, Rust) for math and the declarative TS/PIXI
   **`web-sdk`** for the client. Solar Drift's frontend is bespoke vanilla JS, **not**
   web-sdk — running it on Stake's player requires porting the presentation layer onto
   web-sdk (or adapting web-sdk to replay these books).

In short: **the math is now format-compliant and RTP-calibrated; a production pay model
and a web-sdk frontend are the remaining work for an actual real-money release.**
