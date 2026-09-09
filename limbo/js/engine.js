/* =========================================================================
 * APEX LIMBO — Math Engine
 *
 * Provably-fair round math, deterministic and presentation-free (mirrors
 * the math/render split used by the Candy Surge demo in this repo).
 *
 * Provably-fair scheme (the standard scheme used across the "Limbo/Dice"
 * casino-game genre):
 *   - The engine holds a secret `serverSeed` and publishes only its
 *     SHA-256 commitment (serverSeedHash) BEFORE any bets are placed on it.
 *   - Each bet combines that serverSeed with a player-supplied `clientSeed`
 *     and an incrementing `nonce` through HMAC-SHA256.
 *   - The first 52 bits of the HMAC become a uniform float r in [0, 1),
 *     which maps to a result multiplier via computeResult() below.
 *   - When the player rotates the server seed (or on demand), the previous
 *     serverSeed is revealed so every past bet under it can be independently
 *     recomputed with computeResult() and matched against its committed hash.
 *
 * This is a genuine, verifiable implementation (see tools/verify_fairness.js)
 * — not a cosmetic stand-in — but it is still a local-only demo: there is no
 * server, no RGS, and no real-money wallet.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var Sha256 = g.Sha256;

  /* ---- pure math: seeds + nonce -> result multiplier -------------------
   * Exposed as a standalone function so it can be reused for independent
   * verification (tools/verify_fairness.js, the in-game "Verify" panel)
   * without needing a live GameEngine instance. */
  function computeResult(serverSeed, clientSeed, nonce, houseEdge, maxTarget) {
    var hash = Sha256.hmacHex(serverSeed, clientSeed + ':' + nonce);
    var h = parseInt(hash.slice(0, 13), 16);     // first 52 bits of the HMAC
    var e = Math.pow(2, 52);
    var r = h / e;                                // uniform float in [0, 1)
    var raw = (1 - houseEdge) / (1 - r);           // r -> 1 gives an unbounded tail
    var mult = Math.floor(raw * 100) / 100;        // 2dp, matches genre convention
    if (mult < 1) mult = 1;
    if (mult > maxTarget) mult = maxTarget;
    return mult;
  }

  /* ---- seedable local RNG, only used to generate fresh random seeds/ ---
   * client-seed suggestions and for tools/simulate.js sweeps; never used
   * to decide a bet outcome directly. */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomHex(nBytes, rng) {
    var s = '';
    for (var i = 0; i < nBytes; i++) {
      var byte = rng ? (rng() * 256) | 0 :
        (typeof crypto !== 'undefined' && crypto.getRandomValues)
          ? crypto.getRandomValues(new Uint8Array(1))[0]
          : (Math.random() * 256) | 0;
      s += (byte < 16 ? '0' : '') + byte.toString(16);
    }
    return s;
  }

  function GameEngine(seed) {
    this.rng = makeRng(seed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : seed);
    this.serverSeed = randomHex(16, seed == null ? null : this.rng);
    this.nonce = 0;
  }

  var P = GameEngine.prototype;

  P.serverSeedHash = function () { return Sha256.hex(this.serverSeed); };

  /* Reveals the CURRENT server seed (so past bets can be verified) and
   * starts a fresh one + resets the nonce, exactly like rotating a
   * provably-fair session on a real casino site. */
  P.rotateServerSeed = function () {
    var revealed = this.serverSeed;
    this.serverSeed = randomHex(16);
    this.nonce = 0;
    return revealed;
  };

  P.suggestClientSeed = function () { return randomHex(8); };

  /* One bet: uses & advances internal state (held server seed + nonce). */
  P.playBet = function (clientSeed, target) {
    target = Math.max(CFG.target.min, Math.min(CFG.target.max, target));
    var nonce = this.nonce++;
    var result = computeResult(this.serverSeed, clientSeed, nonce, CFG.houseEdge, CFG.target.max);
    var win = result >= target;
    return {
      nonce: nonce,
      clientSeed: clientSeed,
      serverSeedHash: this.serverSeedHash(),
      target: target,
      result: result,
      win: win,
      payoutX: win ? target : 0
    };
  };

  GameEngine.computeResult = computeResult;
  g.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
