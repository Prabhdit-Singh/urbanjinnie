# MEDBOT INVASION 1000 🧪🤖

A high-volatility **6×5 pay-anywhere tumble slot** built to the **MedBot Master
Package Sheet**. Lab-outbreak theme with an **Invasion Meter**, **Scanner Beam**
(symbols → Wild), **Serum Multiplier Orbs** collected in **Emergency Lab Spins**
(up to ×100 total), four **Bonus Buys** and a **5,000× max win** — wrapped in a
full HD neon-lab shell with every one of the package sheet's 24+ screens.

> **Built from the supplied design.** Math, screens, animations and the casino
> shell are all implemented in code. Symbol art uses a **drop-in PNG pipeline**
> (`assets/symbols/`) so the exact package artwork renders verbatim; a
> procedural fallback keeps the game running until the PNGs are added. **No SVG.**

## Run it

No build step. Serve the folder (or open `index.html`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Game rules

| Feature | Detail |
| --- | --- |
| Grid | 6×5, **pay anywhere** — 8+ matching symbols anywhere pay |
| Tumble | Winning symbols explode (germ explosion); survivors fall, new drop in; repeats |
| Wild Med Kit | Substitutes every paying symbol |
| Invasion Meter | Charges from germ activity; a full meter fires the **Scanner Beam** (random cells → Wild) |
| Lab Portal (Scatter) | 3/4/5/6 → 10/12/15/20 **Emergency Lab Spins**; also pays 3–100× |
| Serum Multiplier Orbs | In free spins, collected into a **total multiplier** (up to ×100) on every win |
| Bonus Buys | Free Spins 100× · Scanner 250× · Outbreak 500× · Virus King 1000× |
| Max win | 5,000× bet — round ends at the cap |
| Target RTP | 96.5% (high volatility, bonus ~1 in 150) |

## Symbols (from the package sheet)

- **Characters:** Dr. Nova · Nurse Bot · Virus King · Germ Blob · Med Drone
- **Premium:** Serum Vial · Bio Capsule · Lab Crystal
- **Card values:** A · K · Q · J · 10
- **Special:** Wild Med Kit · Lab Portal · Serum Multiplier Orb

### Using your exact symbol art
Drop the individual PNGs into `assets/symbols/` with the filenames listed in
`assets/symbols/README.md` (and `Asset_Manifest.json`). They are used verbatim,
no code changes, no build — just reload.

## Architecture — Stake Engine alignment

```
js/config.js    math configuration (paytable, weights, modes, caps)
js/engine.js    math engine — deterministic ordered EVENT BOOK per round
js/renderer.js  playback only: animates the book, never computes outcomes
js/screens.js   screen/state manager + celebratory overlay hooks
js/ui.js        casino shell: wallet, bet panel, bonus buy, settings, history
js/symbols.js   symbol art (exact PNG with procedural fallback)
js/audio.js     WebAudio-synthesized SFX
tools/          math + playback verification (Node)
```

Policy-relevant properties:

- **Win evaluation** — `scatter` / pay-anywhere (one of Stake Engine's four:
  `lines | ways | cluster | scatter`).
- **Outcome/presentation separation** — the engine emits a self-contained book
  (`reveal → win → tumble → orbCollect → … → roundEnd`); the frontend replays
  it, exactly like web-sdk playback of RGS books. Swapping the local engine for
  RGS `/play` responses is a transport change, not a redesign.
- **Configured max-win cap** — wins clamp at 5,000× and the round terminates.
- **Deterministic, seedable math** — `new GameEngine(seed)` reproduces books.
- **Verified math:**

```bash
node tools/simulate.js 300000   # RTP / hit rate / bonus freq / distribution
node tools/verify_book.js 25000 # event-book contract checks
node tools/smoke_render.js      # headless renderer playback test
node tools/browser_test.js      # Playwright end-to-end (screens + spins)
```

Latest simulation (300k base rounds; exact calibration to 96.5% is finalized by
Stake Engine's optimization step over generated books):

| Mode | Cost | Simulated RTP | Notes |
| --- | --- | --- | --- |
| Base | 1× | ~96–97.5% | hit rate ~37%, bonus ~1 in 150 |
| Buy Free Spins | 100× | ~96% | 10 free spins |
| Scanner Mode | 250× | ~95% | extra wilds/beams |
| Outbreak Mode | 500× | ~98% | big orbs, +spins |
| Virus King Mode | 1000× | ~95% | top-value orbs |

**Demo entertainment build — no real-money play, no RGS connection.** The demo
wallet is local only (resettable with ↺).
