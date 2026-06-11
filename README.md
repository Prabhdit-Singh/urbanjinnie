# CANDY SURGE 1000 🍬

A high-volatility **7×7 cluster-pays tumble slot** demo with sticky doubling
multiplier spots (up to **×1024**), free spins, Double Chance ante, Bonus Buy /
Super Bonus Buy, and a **25,000× max win** — wrapped in a dark casino-style
shell. Built with zero dependencies and zero binary assets: all symbol art is
drawn procedurally on canvas and all audio is synthesized with WebAudio.

> **Original game.** Mechanics belong to the well-known "tumble + multiplier
> spots" genre, but the name, theme, symbols, artwork, sounds and code are all
> original. A **publisher logo placeholder** is included in the game canvas
> (bottom-left) and the game footer — drop your studio mark in both places.

## Run it

No build step. Serve the folder (or just open `index.html`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Game rules

| Feature | Detail |
| --- | --- |
| Grid | 7×7, cluster pays (5+ matching symbols connected horizontally/vertically) |
| Tumble | Winning clusters pop; symbols fall and refill until no new wins |
| Multiplier spots | Wins mark their cells. 2nd hit on a mark → ×2, doubling each further hit up to **×1024**. A cluster's pay is multiplied by the **sum** of spot values under it. Marks reset each base-game spin, **persist for the whole bonus** |
| Free spins | 3/4/5/6/7 scatters → 10/12/14/16/18 spins; 3+ scatters in the bonus → +10 spins; scatters also pay 2–200× |
| Double Chance | ×1.25 bet, ~2× free-spins trigger frequency (base game only; disables Bonus Buy) |
| Bonus Buy | 100× bet → guaranteed free spins trigger |
| Super Bonus Buy | 500× bet → free spins with pre-placed multiplier spots **and** every new mark lands as ×2 instantly |
| Max win | 25,000× bet — the round ends immediately at the cap |
| Target RTP | 96.5% |

## Architecture — Stake Engine alignment

The codebase deliberately mirrors the separation that
[Stake Engine](https://stake-engine.com/docs) enforces between its
[math-sdk](https://stakeengine.github.io/math-sdk/) and web-sdk:

```
js/config.js    math configuration (paytable, weights, bet modes, caps)
js/engine.js    math engine — produces a complete, ordered EVENT BOOK per
                round; deterministic via seedable RNG; runs in Node + browser
js/renderer.js  playback only: animates the book, never computes outcomes
js/ui.js        casino shell: wallet, bet panel, autoplay, modals
js/symbols.js   procedural symbol sprites (cached canvas art)
js/audio.js     WebAudio-synthesized SFX
tools/          math verification (run with Node)
```

Policy-relevant properties:

- **Cluster win evaluation** — one of the four evaluation types Stake Engine
  supports (`lines | ways | cluster | scatter`).
- **Outcome/presentation separation** — the engine emits a self-contained
  result book (reveal → win → tumble → … → roundEnd); the frontend replays it,
  exactly like web-sdk playback of RGS books. Swapping the local engine for
  RGS `/play` responses is a transport change, not a redesign.
- **Configured max win cap** — wins clamp at 25,000× and the round terminates,
  matching the engine-level `maxWinX` cap requirement.
- **Deterministic, seedable math** — books are reproducible for testing
  (`new GameEngine(seed)`), the analogue of forced/simulated results.
- **Verified math** — `tools/simulate.js` plays 100k+ rounds per mode
  (the volume Stake Engine recommends for production math):

```bash
node tools/simulate.js 200000   # RTP / hit rate / bonus freq / distribution
node tools/verify_book.js       # event-book contract checks (20k rounds)
node tools/smoke_render.js      # headless renderer playback test
```

Latest 200k-round results (fat-tailed math; exact calibration to 96.5% would
be done by Stake Engine's optimization step over generated books):

| Mode | Cost | Simulated RTP | Notes |
| --- | --- | --- | --- |
| Base | 1× | ~93–97% | hit rate ~58%, bonus ~1 in 290 |
| Double Chance | 1.25× | ~91–96% | bonus ~1 in 178 |
| Bonus Buy | 100× | ~95% | |
| Super Bonus Buy | 500× | ~98% | |

**Demo entertainment build — no real-money play, no RGS connection.** The
demo wallet is local only (resettable with ↺).
