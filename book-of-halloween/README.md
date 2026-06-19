# BOOK OF HALLOWEEN 🎃📖

A standalone **5×3, 10-line "Book of" slot** demo with a haunted-night theme,
an ancient **Book** that is both Scatter and Wild, and **Free Spins** where one
random symbol becomes a **Special Expanding Symbol**.

Built in the same spirit as its sibling game in this repo
([Candy Surge 1000](../README.md)): **zero dependencies and zero binary
assets** — every symbol and the haunted backdrop are drawn procedurally on
`<canvas>`, and all sound is synthesized with WebAudio. The original game is
left completely untouched; this lives in its own folder.

> Theme inspired by the "Book of Halloween" slot art genre. The artwork here is
> **original procedural art** (no third-party image/audio files are bundled),
> matching the house rule of the sibling game. A **publisher logo placeholder**
> sits in the footer — drop your studio mark there.

## Run it

No build step. Serve the repo root (or this folder) and open the page:

```bash
python3 -m http.server 8000
# open http://localhost:8000/book-of-halloween/
```

## Game rules

| Feature | Detail |
| --- | --- |
| Reels | 5×3, **10 fixed paylines**, left-to-right from reel 1 |
| Book | **Scatter + Wild** — substitutes for every symbol and pays anywhere: 2/3/4/5 Books → 1× / 2× / 20× / 200× total bet |
| Free Spins | 3+ Books award **10 Free Spins**; one symbol is chosen at random as the **Special Expanding Symbol** |
| Expanding Symbol | During Free Spins the special symbol expands to cover its whole reel and pays on any position; 3+ Books retrigger **+10** spins |
| Max win | **5,000× total bet** (round ends at the cap) |
| Symbols | Jack-o-Lantern · Sugar Skull · Witch Potion · Widow Spider · A K Q J 10 |

## Files

```
index.html       casino shell (markup only)
css/style.css    dark Halloween theme
js/config.js     math/theme config (paytable, weights, lines, bet, caps)
js/art.js        procedural symbol sprites + animated haunted background
js/audio.js      WebAudio-synthesized SFX
js/game.js       engine (weighted draws + line/scatter/expand evaluation),
                 reel renderer, and the UI/casino shell wiring
tools/           headless verification (run with Node)
```

## Verify the math

```bash
node book-of-halloween/tools/smoke.js          # DOM-stubbed render + win-eval unit tests
node book-of-halloween/tools/simulate.js 300000 # full RTP / hit rate / trigger frequency
```

Latest 300k-round simulation (base game + free-spins bonus):

| Metric | Value |
| --- | --- |
| RTP | ~95% (≈93–97% per run; bonus-driven variance) |
| Hit rate | ~26% |
| Free spins trigger | ~1 in 90 |
| Max win cap | 5,000× |

The simulator accepts tuning overrides for quick sweeps:
`BOOKW=2.4 PAYMULT=19 node tools/simulate.js`.

**Demo entertainment build — no real-money play, no RGS connection.** The demo
wallet is local only (resettable with ↺).
