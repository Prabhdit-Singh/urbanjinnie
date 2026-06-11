# Slot Game Demos 🎰

Two original, zero-dependency slot demos. Critter Clash's creatures use
painted character portraits; all other art is drawn procedurally on canvas
and all audio is synthesized with WebAudio. Each game keeps a strict
Stake-Engine-style separation between deterministic math (event books) and
presentation (playback).

| Game | Where | Concept |
| --- | --- | --- |
| **Critter Clash 1000** | [`critter-clash/`](critter-clash/) | 6×5 creature-battle slot — original Column Creature Battle multiplier feature, mobile-portrait casino interface |
| **Candy Surge 1000** | repo root (`index.html`) | 7×7 cluster-pays tumble slot with sticky doubling multiplier spots |

## Run them

No build step. Serve the repo root and pick a game:

```bash
python3 -m http.server 8000
# Candy Surge:    http://localhost:8000
# Critter Clash:  http://localhost:8000/critter-clash/
```

The Critter Clash lobby also links back to Candy Surge.

---

## CRITTER CLASH 1000 ⚔️

An original "cute monster battle" slot (no Pokémon characters or names — all
creatures are original). Full design document:
[`critter-clash/DESIGN.md`](critter-clash/DESIGN.md).

| Feature | Detail |
| --- | --- |
| Grid | 6×5, pays anywhere (lows 9+, creatures 3+) |
| Column Creature Battle | Every creature lands with a multiplier (x2–x100). 2+ creatures in one column battle; the highest multiplier wins the column, ties combine, wild eggs add +x2, Goldhorn doubles the winner |
| Spin multiplier | All winning column multipliers are **added together** and applied to the total symbol win — after wins are calculated |
| Free spins | 3/4/5+ Battle Arena Tickets → 10/12/15 spins; battles more frequent, multipliers hotter, and battle multipliers **carry over** for the whole bonus; 3+ battles in a spin → +2 spins |
| Bonus Buy | Free Spins 80× bet · Super Free Spins 200× bet (battles nearly every spin, hottest multiplier rolls) |
| Max win | 10,000× bet |
| Simulated RTP | ~96% (base 95.6–97.7% across seeds, buy 95.6%, super buy 96.6%) |

The interface is a mobile-portrait casino app implementing the full 20-screen
flow: casino lobby → game info → loading → game, with bet settings, settings
toggles (sound/music/turbo/shake/battle animation/win animations), game
history, exit confirmation, battle/multiplier/win overlays and free-spins
screens.

```bash
cd critter-clash
node tools/simulate.js 400000     # RTP / volatility verification
node tools/verify_book.js 20000   # event-book invariant checks
node tools/smoke_render.js        # Playwright UI smoke test + screenshots
```

---

## CANDY SURGE 1000 🍬

A high-volatility **7×7 cluster-pays tumble slot** demo with sticky doubling
multiplier spots (up to **×1024**), free spins, Double Chance ante, Bonus Buy /
Super Bonus Buy, and a **25,000× max win** — wrapped in a dark casino-style
shell.

> **Original game.** Mechanics belong to the well-known "tumble + multiplier
> spots" genre, but the name, theme, symbols, artwork, sounds and code are all
> original. A **publisher logo placeholder** is included in the game canvas
> (bottom-left) and the game footer — drop your studio mark in both places.

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

Both games mirror the separation that
[Stake Engine](https://stake-engine.com/docs) enforces between its
[math-sdk](https://stakeengine.github.io/math-sdk/) and web-sdk:

```
js/config.js    math configuration (paytable, weights, bet modes, caps)
js/engine.js    math engine — produces a complete, ordered EVENT BOOK per
                round; deterministic via seedable RNG; runs in Node + browser
js/renderer.js  playback only: animates the book, never computes outcomes
js/ui.js        casino shell: wallet, bet panel, modals, screen flow
js/symbols.js   procedural symbol sprites (cached canvas art)
js/audio.js     WebAudio-synthesized SFX
tools/          math verification (run with Node)
```

Policy-relevant properties:

- **Supported win evaluation types** — Candy Surge uses `cluster`, Critter
  Clash uses `scatter` (pays anywhere), two of the four evaluation types
  Stake Engine supports (`lines | ways | cluster | scatter`).
- **Outcome/presentation separation** — the engine emits a self-contained
  result book (reveal → win → battles/tumble → … → roundEnd); the frontend
  replays it, exactly like web-sdk playback of RGS books. Swapping the local
  engine for RGS `/play` responses is a transport change, not a redesign.
- **Configured max win cap** — wins clamp at the cap and the round terminates,
  matching the engine-level `maxWinX` cap requirement.
- **Deterministic, seedable math** — books are reproducible for testing
  (`new GameEngine(seed)`), the analogue of forced/simulated results.
- **Verified math** — each game's `tools/simulate.js` plays 100k+ rounds per
  bet mode (the volume Stake Engine recommends for production math).

Candy Surge latest 200k-round results (fat-tailed math; exact calibration to
96.5% would be done by Stake Engine's optimization step over generated books):

| Mode | Cost | Simulated RTP | Notes |
| --- | --- | --- | --- |
| Base | 1× | ~93–97% | hit rate ~58%, bonus ~1 in 290 |
| Double Chance | 1.25× | ~91–96% | bonus ~1 in 178 |
| Bonus Buy | 100× | ~95% | |
| Super Bonus Buy | 500× | ~98% | |

**Demo entertainment builds — no real-money play, no RGS connection.** The
demo wallets are local only (resettable).
