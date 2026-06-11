# Critter Clash 1000 — Game Design Document

An original "cute monster battle" slot. No Pokémon characters or names — all
creatures, names and art are original. The game has its own identity instead
of being a Sugar Rush copy: the signature mechanic is the **Column Creature
Battle**.

## Overview

| | |
|---|---|
| Name | **Critter Clash 1000** |
| Grid | 6 columns × 5 rows |
| Win type | Pays anywhere (scatter pays) |
| Feature | Column Creature Battle → additive spin multiplier |
| Bonus | Free Spins with carry-over multipliers |
| Bonus Buy | 80× bet · Super Bonus Buy 200× bet |
| Max win | 10,000× bet |
| RTP | ~96% simulated (base 95.6–97.7% across seeds, buy 95.6%, super buy 96.6%) |

Name candidates considered: Monster Multiplier Mayhem, Battle Beasts Bonanza,
Tiny Titans Clash, Rune Critters, Beastie Battle Burst. **Critter Clash 1000**
chosen — fun, simple, slot-friendly.

## Symbols

| Type | Symbols |
|---|---|
| Low symbols | A, K, Q, J, 10 (card royal gems) |
| Creature symbols | Blazepup, Aquash, Leafling, Voltoroo, Frostfin, Nightfang, Goldhorn |
| Wild | Golden Egg — substitutes for low symbols, +x2 boost in battle columns |
| Scatter | Battle Arena Ticket — triggers Free Spins |

### Creatures

Every creature **lands with a battle multiplier** drawn from its weighted
range (the "hidden power"). Rarer creatures roll bigger multipliers.

| Creature | Theme | Multiplier range |
|---|---|---|
| Blazepup | Fire pup | x2–x10 |
| Aquash | Water turtle | x2–x12 |
| Leafling | Grass lizard | x2–x8 |
| Voltoroo | Electric kangaroo | x3–x15 |
| Frostfin | Ice penguin | x3–x20 |
| Nightfang | Shadow bat | x5–x25 |
| Goldhorn | Legendary golden beast | x10–x100 |

> Design note: the original sketch listed a separate "multiplier orb" symbol.
> It was folded into the creatures themselves — each creature *is* the
> multiplier carrier — which keeps the reel set tight and makes every
> creature landing meaningful.

## Main feature: Column Creature Battle

1. When **2+ creatures land in the same column**, they battle.
2. The **higher multiplier wins** — that value becomes the Column Multiplier.
3. **Tie rule:** equal top multipliers **combine** (x4 vs x4 → x8), so ties
   are exciting instead of boring.
4. **3+ creatures** in a column is a **mini tournament** — same rules: the
   highest roll wins, tied top rolls combine.
5. **Golden Egg (Wild)** in a battle column adds **+x2** per egg.
6. **Goldhorn** in a battle column **doubles** the column winner.

### Multiple column battles

Every winning column multiplier is **added together** into one total spin
multiplier:

> Column 1: Blazepup x3 beats Leafling x2 → x3
> Column 3: Thunder roll x8 beats x5 → x8
> Column 6: x6 beats x4 → x6
> **Total spin multiplier: x3 + x8 + x6 = x17**

### Important rule

The multiplier is applied **after** the winning symbols are calculated:

> Base win $4.20 × 17 = **$71.40**

If the spin has no symbol win, battle multipliers do nothing in the base game
(but still feed the carry-over meter during Free Spins).

## Symbol pays (pays anywhere)

* Low symbols pay with **9+** matching anywhere (tiers 9–10 / 11–12 / 13+).
* Creatures are premium: **3+** anywhere pays (tiers 3 / 4 / 5+).
* Battle Arena Tickets pay 1.5× / 3× / 10× / 50× for 3 / 4 / 5 / 6+.
* Exact values: see `js/config.js` (`paytable`).

## Free Spins

* **Trigger:** 3 / 4 / 5+ Battle Arena Tickets → **10 / 12 / 15 free spins**.
* **Battles happen more often** (creature weights ×1.40).
* **Multipliers roll hotter** (creature multiplier tables flattened toward the
  top of each range).
* **Carry-over:** every winning battle multiplier is added to a persistent
  bonus meter; each free-spin win is multiplied by the meter.
* **3+ battles in one spin → +2 extra free spins.**
* **3+ tickets during the bonus → +5 extra spins.**

### Bonus Buy menu

* **Free Spins — 80× bet:** buys straight into the bonus.
* **Super Free Spins — 200× bet:** creature rates roughly doubled so battles
  hit on nearly every spin, and multiplier tables roll at their hottest —
  the carry-over meter climbs much faster.

## Math model

Stake-Engine-style separation: `js/config.js` (tunables) + `js/engine.js`
(deterministic event books) are pure math, shared verbatim between the
browser and the Node verification tools.

Simulation results (`node tools/simulate.js 400000`):

| Mode | RTP | Hit rate | Bonus freq | Battle rate |
|---|---|---|---|---|
| Base (1×) | 95.6–97.7% by seed | 53.8% | 1 in 389 | 23.5% of spins, avg x8.3 |
| Bonus Buy (80×) | 95.6% | 100% | — | 99.3% of spins, avg x10.0 |
| Super Bonus Buy (200×) | 96.6% | 100% | — | 100% of spins, avg x12.0 |

`node tools/verify_book.js` replays 20k+ rounds and asserts every event book
is internally consistent (battle results, multiplier application, totals,
max-win cap).

## Screen flow (20 snapshots)

Implemented as a mobile-portrait casino app (`index.html`):

1. **Lobby Card** — Critter Clash 1000 featured tile in the Monster Casino lobby
2. **Game Info Screen** — explains creature battles
3. **Loading Screen** — monster island + progress bar
4. **Main Game Screen** — 6×5 grid ready
5. **Bet Settings Screen** — stepper, presets, total bet + buy costs
6. **Spin Animation** — reels drop, "GOOD LUCK!"
7. **Two Creatures Land in Same Column** — column spotlight + VS badge
8. **Battle Animation Screen** — full-screen fighters clash (toggleable)
9. **Winner Creature Screen** — WINNER ribbon + Column Multiplier chip
10. **Multiple Column Battle Screen** — chips per column, running total bar
11. **Total Multiplier Calculation** — `x3 + x8 + x6 = x17` card
12. **Win Screen** — total win count-up
13. **Free Spins Trigger** — tickets + "10 FREE SPINS AWARDED!"
14. **Free Spins Round** — HUD with spins left + CARRY-OVER multiplier
15. **Big Win / Mega Win Screen** — BIG / SUPER / MEGA / EPIC tiers
16. **Bonus Complete Screen** — total bonus win, spins played, final multiplier, best spin
    (+ **Bonus Buy Menu** — Free Spins 80× / Super Free Spins 200×)
17. **Settings Screen** — sound, music, turbo, screen shake, battle animation, win animations
18. **Game History Screen** — last 50 bets with date, bet, win, type
19. **Exit Confirmation** — NO / YES
20. **Back to Lobby**

## Art

The seven creatures use painted character portraits
(`assets/creatures/<id>.jpg`, 512px, downscaled from the supplied 1254px
originals) rendered as rounded symbol tiles on the grid and as full
portraits in the battle screen. All other art — card royals, the Golden Egg
wild, the Battle Arena Ticket, backgrounds, effects — is drawn procedurally
on canvas, and procedural chibi versions of the creatures serve as a
fallback while the portraits load.

## Running it

```bash
# play (any static server)
npx http-server .   # then open /critter-clash/

# math verification
node tools/simulate.js 400000     # RTP / volatility report
node tools/verify_book.js 20000   # event-book invariants

# headless UI smoke test (needs playwright + chromium)
node tools/smoke_render.js        # walks all screens, saves tools/shots/
```
