# APEX LIMBO 🚀

A **Limbo-style** demo game: pick a target multiplier (or a win chance %),
place a bet, and a provably-fair result multiplier is generated. Clear your
target and you win **bet × target**; fall short and you lose the bet. Built
with zero dependencies and zero binary assets — the stage art is drawn
procedurally on canvas and all audio is synthesized with WebAudio.

> **Original game.** "Limbo" (target-multiplier, provably-fair) is a
> well-known casino-game genre implemented by many platforms — the name,
> theme, art, sounds and code here are original, and this project is **not
> affiliated with, endorsed by, or a copy of any specific commercial
> casino's game.** A **publisher logo placeholder** is included in the
> footer — drop your studio mark in.

## Run it

No build step. Serve the repo root (or just open `index.html`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/limbo/index.html
```

## Game rules

| Feature | Detail |
| --- | --- |
| Target | Choose any multiplier from **1.01×** to **1,000,000×** (or set a win-chance % — the two are linked) |
| Result | A provably-fair multiplier is generated for the bet; result ≥ target = **win** |
| Payout | `bet × target` on a win, `0` on a bust |
| Win chance | `(1 − house edge) ÷ target` — lower targets hit more often for a smaller payout, higher targets hit rarely for a bigger one; **expected return is the same at every target** |
| House edge | 1% → **99% RTP**, constant across the entire target range |
| Autoplay | Number of bets, on-win/on-loss bet adjustment (reset or increase by %), stop-on-profit and stop-on-loss thresholds |
| Apex Win | Cosmetic-only celebration when a win clears its target by 5×+ — no effect on math |

## Provably fair — for real

Unlike a purely cosmetic "fairness" badge, this demo implements the actual
scheme (`js/sha256.js`, `js/engine.js`):

1. The engine holds a secret **server seed** and immediately publishes its
   **SHA-256 hash** — a commitment made *before* any bet, so it can't be
   changed after the fact to influence a result.
2. Each bet combines that server seed with your **client seed** and an
   incrementing **nonce** through **HMAC-SHA256**. The first 52 bits of the
   HMAC become a uniform float, mapped to a result multiplier:

   ```
   result = floor( (1 − houseEdge) / (1 − r) × 100 ) / 100,  clamped to [1.00, 1000000]
   ```

3. Rotating the server seed (🔒 Provably Fair panel) reveals the seed that
   was just retired, so every bet placed under it can be recomputed with the
   formula above and matched against the hash that was shown at the time.
   The same panel has a **Verify** tool that recomputes any
   `(serverSeed, clientSeed, nonce)` triple client-side.

This is a genuine SHA-256/HMAC-SHA256 implementation (no `crypto` library
dependency, so it runs the same in the browser and in Node), checked against
the standard NIST SHA-256 vectors and RFC 4231's HMAC test case:

```bash
node tools/verify_fairness.js
```

It is still a **local-only demo**: there is no server, no RGS, and the demo
wallet lives in `localStorage` (resettable with ↺). Nothing here is wired to
real money.

## Math verification

```bash
node tools/simulate.js 500000   # RTP across random + fixed targets
```

Fixed-target sweeps track the theoretical win chance almost exactly (e.g.
~49.5% at 2×, ~9.9% at 10×, ~0.99% at 100×), which is what you'd expect from
`chance = 99 / target` — RTP is architecturally constant at 99% regardless
of the target chosen. The random-target RTP figure in that same run carries
much more variance than the slot demo's: at high targets a single very rare,
very large win can swing an all-target average well off 99% over a few
hundred thousand trials — that's the shape of this game's payout
distribution, not a bug (the fixed-target numbers are the trustworthy check).

## Architecture

Same math/presentation split as the Candy Surge demo in this repo:

```
js/sha256.js    pure-JS SHA-256 / HMAC-SHA256 (no dependencies)
js/config.js    math configuration (house edge, target range, bet limits)
js/engine.js    provably-fair round math; runs in Node + browser
js/renderer.js  playback only: animates the count-up, never decides outcomes
js/ui.js        casino shell: wallet, bet panel, autoplay, fairness panel
js/audio.js     WebAudio-synthesized SFX
tools/          math + fairness verification (run with Node)
```

**Demo entertainment build — no real-money play, no RGS connection.**
