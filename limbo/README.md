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
| Bonus Buy | Rush Mode, Triple Shot, Jackpot Shot — see below |

## Bonus Buy modes

Three Bonus Buy options (🎯 Bonus Buy button), each built to answer a
different player desire rather than being three skins on one mechanic. All
three still draw from the exact same `computeResult()` HMAC-SHA256 draw a
normal bet uses — they just take more than one draw, or spend the one draw
differently — so every shot in every bonus is independently verifiable the
same way a normal bet is (🔒 panel / `tools/verify_fairness.js`).

**Payout convention (locked):** every mode's `×` figures — Rush's per-shot
target, Triple Shot's gates, Jackpot's MIN/MAX WIN — are multiples of the
**base unit bet**, never of that mode's feature-buy cost. A Triple Shot
TRIPLE HIT at `T=10×` pays `1,110 × bet`, the same bet used to compute the
3× cost, not `1,110 × (3×bet)`. This matches how a normal bet already works
and keeps every mode's numbers directly comparable.

| Mode | Volatility | What you buy | Cost | Math |
| --- | --- | --- | --- | --- |
| **Rush Mode** (accessible) | Medium-High | 10 rapid-fire shots at your current Target Multiplier | 10× bet | Literally 10 independent normal bets, fired back to back — RTP-neutral by construction (99%) |
| **Triple Shot** (premium) | High | 1 draw, 3 escalating prize gates at your chosen starting target × 1/10/100 | 3× bet | Payout = sum of every gate the one draw cleared — RTP-neutral by construction (99%, exactly, for any starting target) |
| **Jackpot Shot** (extreme) | Extreme | 1 draw against a disclosed prize range — MIN WIN 25×, MAX WIN 100,000× | 9.30× bet | Below MIN WIN: miss (payout 0). At/above MIN WIN: the draw's *own value*, clamped to MAX WIN, **is** the payout — no separate prize table or wheel |

**Rush Mode** reuses your Target Multiplier field directly — it's not a
separate setting. The stage reveals shots as a rapid ticker (not a wait for
one projectile to finish before the next fires) with a live `SHOT n/10 · HITS
h · WIN x×` readout, ending on a `RUSH COMPLETE` summary.

**Triple Shot** is ONE draw, not three. You pick a starting target `T`
(2×–900×, via number input or preset buttons); the feature derives three
gates at `T`, `10T`, `100T`. One projectile launches — how far the single
result climbs decides how many gates it clears, and clearing a gate banks
its own prize **on top of** any earlier one (crossing `100T` implies `10T`
and `T` were already crossed, since the gates are strictly increasing):

| Result vs. gates (T = 10×) | Payout |
| --- | --- |
| < 10× | 0× |
| ≥ 10×, < 100× | 10× |
| ≥ 100×, < 1,000× | 10× + 100× = 110× |
| ≥ 1,000× | 10× + 100× + 1,000× = 1,110× — **TRIPLE HIT** |

The elegant part: payout(result) = Σ gate × 𝟙[result ≥ gate], so by
linearity `E[payout] = Σ gate × P(result≥gate) = Σ gate × (1−houseEdge)/gate
= 3×(1−houseEdge)` — the gate values cancel out completely. RTP is
**exactly** 99% at every possible starting target, provably, not just
approximately — `startTarget` is purely a volatility dial (higher target =
rarer, bigger cumulative payout, same expected return). Max total payout is
`111×T`, so the target selector is capped at 900× (111 × 900 = 99,900×,
under the game's 1,000,000× result ceiling). "TRIPLE HIT" is a cosmetic
label on the same plain summed payout, same as the other modes' win labels.

**Jackpot Shot** is the one genuinely different payout shape: because the
underlying result distribution is already heavy-tailed (the same one every
normal bet uses), conditioning on "at least MIN WIN" and capping at MAX WIN
naturally puts most winning draws near the low end with progressively rarer
huge ones — no artificial weighting needed. Its cost (9.30× bet) is
calibrated **analytically**, not by naive Monte Carlo: a single MAX WIN hit
is roughly 1-in-101,000, so a simulated RTP reading needs tens of millions
of rounds before it stops swinging ~50% run to run (see the fat-tail warning
`tools/simulate_bonus.js` prints). The exact expected payout — and thus the
exact cost for a chosen RTP — comes from closed-form/numerical integration
instead:

```bash
node tools/jackpot_integral.js        # exact calibration, no RNG variance
node tools/simulate_bonus.js 500000   # RTP check for all 3 modes (Jackpot's reading is noisy — expected)
```

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
js/config.js    math configuration (house edge, target range, bet limits, bonus modes)
js/engine.js    provably-fair round math; playBet + playRush/playTripleShot/playJackpot; runs in Node + browser
js/renderer.js  playback only: animates the count-up (and the 3 bonus scenes), never decides outcomes
js/ui.js        casino shell: wallet, bet panel, autoplay, bonus buy modal, fairness panel
js/audio.js     WebAudio-synthesized SFX
tools/          math + fairness verification (run with Node), incl. bonus RTP + Jackpot calibration
```

**Demo entertainment build — no real-money play, no RGS connection.**
