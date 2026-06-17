# MEDBOT INVASION 1000 — Developer Specification

Complete game spec implemented from the **MedBot Master Package Sheet**.
This document describes the math model, symbol set, features, screen flow and
the Stake Engine alignment of the build in this repository.

---

## 1. Identity

| Field | Value |
| --- | --- |
| Game name | MEDBOT INVASION 1000 |
| Game id | `medbot_invasion_1000` |
| Layout | 6 reels × 5 rows (30 cells) |
| Win evaluation | **Scatter / pay-anywhere** — 8+ of a kind anywhere |
| Mechanic | Germ-Explosion tumble (cascading wins) |
| Target RTP | 96.5% |
| Volatility | High |
| Max win | 5,000× bet (round ends at cap) |
| Currency | Demo wallet (no real money) |

---

## 2. Symbols

### High pay — characters
| id | name |
| --- | --- |
| `dr_nova` | Dr. Nova |
| `nurse_bot` | Nurse Bot |
| `virus_king` | Virus King |
| `germ_blob` | Germ Blob |
| `med_drone` | Med Drone |

### Premium
`serum_vial` (Serum Vial) · `bio_capsule` (Bio Capsule) · `lab_crystal` (Lab Crystal)

### Low pay — card values
`ace` (A) · `king` (K) · `queen` (Q) · `jack` (J) · `ten` (10)

### Special
| id | name | role |
| --- | --- | --- |
| `wild` | Wild Med Kit | substitutes every paying symbol |
| `scatter` | Lab Portal | 3+ trigger free spins; pays 3–100× |
| `orb` | Serum Multiplier Orb | carries ×2–×100; collected in free spins |

All symbol art is drawn **procedurally on canvas** (no image/SVG assets),
reproducing the icons on the master sheet.

---

## 3. Paytable (× total bet, by count)

| Symbol | 8–9 | 10–11 | 12+ |
| --- | --- | --- | --- |
| Dr. Nova | 14 | 36 | 72 |
| Nurse Bot | 7 | 18 | 36 |
| Virus King | 6 | 14 | 28 |
| Germ Blob | 4.4 | 8.4 | 21 |
| Med Drone | 3 | 7 | 17 |
| Serum Vial | 2.2 | 4.4 | 12 |
| Bio Capsule | 1.7 | 3 | 8.4 |
| Lab Crystal | 1.4 | 2.2 | 7 |
| A | 1.2 | 1.8 | 6 |
| K | 0.85 | 1.4 | 4.4 |
| Q | 0.7 | 1.2 | 3.6 |
| J | 0.6 | 0.85 | 3 |
| 10 | 0.4 | 0.7 | 2.2 |

**Lab Portal (Scatter)** pays: 3 → 3× · 4 → 5× · 5 → 20× · 6 → 100×.

---

## 4. Core mechanics

1. **Pay anywhere** — 8 or more matching symbols anywhere on the grid pay;
   position is irrelevant. Wild Med Kits top up every paying symbol's count.
2. **Germ Explosion (tumble)** — winning symbols explode, survivors fall, new
   symbols drop from the top; repeats while new wins form.
3. **Invasion Meter** — charges from germ activity each base spin; when it tops
   out it fires the **Scanner Beam** (1–3 random cells become Wild for one
   extra evaluation). Tuned to be RTP-light and visible.
4. **Lab Portals → Emergency Lab Spins** — 3/4/5/6 portals award 10/12/15/20
   free spins. Portals also pay.
5. **Serum Multiplier Orbs** — in free spins, orb values are **collected into a
   running total multiplier** (up to ×100 base, higher in premium buys) applied
   to every win for the rest of the bonus.
6. **Retrigger** — 3+ portals during free spins add +5 spins.
7. **Max win** — the round ends immediately at 5,000× bet.

---

## 5. Bet modes & Bonus Buys

| Mode | Cost | Behaviour | Simulated RTP |
| --- | --- | --- | --- |
| Base Game | 1× | normal play, Invasion Meter active | ~96–97.5% |
| Buy Free Spins | 100× | 10 Emergency Lab Spins | ~96% |
| Scanner Mode | 250× | extra Scanner Beams & Wilds, +2 spins | ~95–96% |
| Outbreak Mode | 500× | more germ explosions, big orbs, +5 spins | ~97–98% |
| Virus King Mode | 1000× | highest-value orbs (×100 cap raised), +5 spins | ~95–96% |

Bonus frequency in the base game: **~1 in 150 spins**.

> Exact per-mode RTP is finalized by the Stake Engine optimization step over
> generated books; values above are direct Monte-Carlo simulations from
> `tools/simulate.js` (300k+ base rounds).

---

## 6. Screen flow (master sheet, 24+ screens)

1. Lobby Card · 2. Game Info · 3. Loading · 4. Main Game (Ready) ·
5. Bet Settings · 6. Bonus Buy Button · 7. Bonus Buy Menu ·
8. Confirm Purchase · 9. Spin Animation · 10. Invasion Meter ·
11. Scanner Beam · 12. Serum Multiplier Added · 13. Win (Nice) ·
14. Scatter Trigger · 15. Free Spins Start · 16. Free Spins Round ·
17. Germ Explosion · 18. Virus King Feature · 19. Big Win · 20. Mega Win ·
21. Paytable · 22. Free Spins Complete · 23. Settings · 24. Game History ·
25. Exit Confirmation · 26. Thanks / Back to Lobby.

Implemented as DOM screens/overlays (`js/screens.js`, `index.html`) plus
in-canvas feature animations (`js/renderer.js`). Win tiers:
Nice (≥5×) · Big (≥50×) · Mega (≥200×) · Epic (≥1000×) · Max (5000×).

---

## 7. Stake Engine alignment

```
js/config.js    math configuration (paytable, weights, modes, caps)
js/engine.js    math engine — deterministic ordered EVENT BOOK per round
js/renderer.js  playback only — animates the book, never computes outcomes
js/screens.js   screen/state manager + celebratory overlay hooks
js/ui.js        casino shell: wallet, bet panel, bonus buy, settings, history
js/symbols.js   procedural symbol art (cached canvas sprites)
js/audio.js     WebAudio-synthesized SFX
tools/          math + playback verification (Node)
```

- **Outcome / presentation separation** — the engine emits a self-contained
  book (`reveal → win → tumble → orbCollect → … → roundEnd`); the frontend
  replays it. Swapping the local engine for RGS `/play` responses is a
  transport change, not a redesign.
- **Deterministic, seedable math** — `new GameEngine(seed)` reproduces books
  (the analogue of forced/simulated results) for testing.
- **Configured max-win cap** — wins clamp at 5,000× and the round terminates.
- **Verified math** — `tools/simulate.js` runs 300k+ rounds/mode for RTP, hit
  rate, bonus frequency and distribution.

### Test commands
```bash
node tools/simulate.js 300000   # RTP / volatility per mode
node tools/verify_book.js 25000 # event-book contract checks
node tools/smoke_render.js      # headless renderer playback (no errors)
# Browser E2E (Playwright): node tools/browser_test.js
```

**Demo entertainment build — no real-money play, no RGS connection.**
