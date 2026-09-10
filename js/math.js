/* =========================================================================
 * APEX LIMBO — MATH (provably-fair engine + game configuration)
 *
 * Everything that decides an outcome or a payout lives in this one file,
 * and nothing in it touches the DOM, canvas, or audio. It is safe to read,
 * audit, or run standalone (Node or browser) independent of the front end:
 *
 *   1. Sha256   — pure-JS SHA-256 / HMAC-SHA256 (no dependencies)
 *   2. GameConfig — every tunable number: house edge, target range, bet
 *      limits, bonus-mode parameters
 *   3. GameEngine — the provably-fair round math: seed commitment, HMAC
 *      draw -> result multiplier, playBet + playRush/playTripleShot/playJackpot
 *
 * See docs/game-document (or the in-game 🔒 Provably Fair panel) for the
 * full math specification and RTP proofs. tools/*.js exercise this file
 * directly via `require('../js/math.js')` for verification and simulation.
 * ========================================================================= */

/* =========================================================================
 * APEX LIMBO — minimal pure-JS SHA-256 / HMAC-SHA256
 *
 * No dependencies, runs in browser and Node. Used to build a REAL
 * provably-fair commitment scheme for the round engine (engine.js):
 * server seed hash commitment + HMAC(serverSeed, clientSeed:nonce) result
 * derivation, independently reproducible by a player. Verified against the
 * standard SHA-256 test vectors and RFC 4231 HMAC test case 1 in
 * tools/verify_fairness.js.
 * ========================================================================= */
(function (g) {
  'use strict';

  var K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }

  function utf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { bytes.push(c); }
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return bytes;
  }

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function sha256(bytes) {
    var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bitLen = bytes.length * 8;
    var msg = bytes.slice();
    msg.push(0x80);
    while (msg.length % 64 !== 56) msg.push(0);
    for (var i = 3; i >= 0; i--) msg.push(0); // hi 32 bits of length (messages here are always small)
    for (i = 3; i >= 0; i--) msg.push((bitLen >>> (i * 8)) & 0xff);

    var w = new Array(64);
    for (var off = 0; off < msg.length; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
                (msg[off + i * 4 + 2] << 8) | (msg[off + i * 4 + 3])) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rrot(w[i - 15], 7) ^ rrot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rrot(w[i - 2], 17) ^ rrot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], gg = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
        var ch = (e & f) ^ (~e & gg);
        var t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh = gg; gg = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + gg) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    var out = [];
    for (i = 0; i < 8; i++) out.push((h[i] >>> 24) & 0xff, (h[i] >>> 16) & 0xff, (h[i] >>> 8) & 0xff, h[i] & 0xff);
    return out;
  }

  function sha256Hex(str) { return bytesToHex(sha256(utf8Bytes(str))); }

  function hmacSha256Hex(keyStr, msgStr) {
    var blockSize = 64;
    var key = utf8Bytes(keyStr);
    if (key.length > blockSize) key = sha256(key);
    else key = key.slice();
    while (key.length < blockSize) key.push(0);
    var opad = new Array(blockSize), ipad = new Array(blockSize);
    for (var i = 0; i < blockSize; i++) { opad[i] = key[i] ^ 0x5c; ipad[i] = key[i] ^ 0x36; }
    var inner = sha256(ipad.concat(utf8Bytes(msgStr)));
    var outer = sha256(opad.concat(inner));
    return bytesToHex(outer);
  }

  g.Sha256 = { hex: sha256Hex, hmacHex: hmacSha256Hex, bytes: sha256, utf8Bytes: utf8Bytes, bytesToHex: bytesToHex };
})(typeof window !== 'undefined' ? window : globalThis);


/* =========================================================================
 * APEX LIMBO — Game Configuration ("math config")
 *
 * Every tunable number that defines the game's math lives here, apart
 * from presentation.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CONFIG = {
    gameId: 'apex_limbo',
    gameName: 'APEX LIMBO',
    providerName: 'Urban Games',
    version: '1.0.0',

    houseEdge: 0.01,               // 1% house edge -> 99% theoretical RTP at any target
    rtp: 0.99,

    target: { min: 1.01, max: 1000000, default: 2.00, step: 0.01 },

    bet: { min: 0.10, max: 100, default: 1.00, steps: [0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100] },
    startBalance: 1000,

    quickTargets: [1.5, 2, 5, 10, 50, 100],

    auto: {
      counts: [10, 25, 50, 100, 'inf'],
      defaultCount: 25,
      maxAdjustPct: 1000,          // cap on-win/on-loss bet-change percentage
      delayMs: 550                 // pause between auto-bets (turbo halves it)
    },

    history: { size: 20 },

    // cosmetic-only "APEX" celebration threshold: fires when a win clears
    // the target by at least this factor. Purely presentational — has no
    // effect on the result or payout.
    apexWinFactor: 5,

    /* ---- Bonus Buy modes ---------------------------------------------
     * All three reuse the exact same provably-fair draw (computeResult in
     * engine.js) that a normal bet uses — they differ only in how many
     * draws are taken and how the draw(s) are turned into a payout. None
     * of them touch houseEdge; each mode's cost is derived from the SAME
     * math that prices a normal bet, so RTP stays honest and is checked
     * by tools/simulate_bonus.js rather than just asserted here. */
    bonusModes: {
      // RUSH MODE — "accessible": fires `shots` independent bets at the
      // player's current Target Multiplier, back to back, fast. This is
      // literally N normal bets (cost = N x bet, RTP = base RTP) wearing
      // a rapid-fire presentation — no separate math to balance.
      rush: {
        id: 'rush',
        label: 'Rush Mode',
        tagline: 'Speed & accumulation',
        volatility: 'Medium-High',
        shots: 10,
        shotIntervalMs: 170
        // cost = shots x bet (see UI.rushCost)
      },

      // TRIPLE SHOT — "premium": ONE draw, THREE escalating prize gates at
      // startTarget x [1, 10, 100]. Crossing a gate doesn't replace the
      // previous prize, it adds to it — payout = sum of every gate the one
      // result cleared. Because payout(result) = sum_j gate_j * 1[result >=
      // gate_j], linearity of expectation gives E[payout] = sum_j gate_j *
      // P(result>=gate_j) = sum_j gate_j*(houseEdge-complement/gate_j) =
      // 3*(1-houseEdge) -- the gate_j values cancel out completely, so RTP
      // is EXACTLY (1-houseEdge) for every possible startTarget, no
      // calibration needed (see tools/simulate_bonus.js for the empirical
      // check). The player's startTarget choice is the volatility control.
      tripleShot: {
        id: 'tripleShot',
        label: 'Triple Shot',
        tagline: 'One flight, three escalating gates',
        volatility: 'High',
        gateRatios: [1, 10, 100],
        startTarget: { min: 2, max: 900, default: 10, step: 0.01 },
        startPresets: [2, 5, 10, 25, 50, 100, 250, 500, 900]
        // cost = 3 x bet, ALWAYS (see UI.tripleShotCost) — independent of startTarget
      },

      // JACKPOT SHOT — "extreme": one draw. Below minWin it's a plain
      // miss (payout 0); at or above minWin the draw has already "entered
      // the zone" and its OWN value (clamped to maxWin) becomes the
      // payout — no separate prize table, no wheel. Because the base
      // result distribution is already heavy-tailed, awards land far more
      // often near minWin than near maxWin with no extra weighting logic.
      jackpot: {
        id: 'jackpot',
        label: 'Jackpot Shot',
        tagline: 'One shot at something enormous',
        volatility: 'Extreme',
        minWin: 25,
        maxWin: 100000,
        // Closed form for this payout shape: E[payout] = (1-houseEdge) *
        // (1 + ln(maxWin/minWin)); cost = E[payout] / targetRTP. With
        // targetRTP == (1-houseEdge) the (1-houseEdge) factor cancels, so
        // cost = 1 + ln(maxWin/minWin) = 1 + ln(100000/25) = 9.2938...,
        // confirmed by direct numerical integration (not Monte Carlo —
        // a single maxWin hit is ~1-in-101,010, so naive simulation needs
        // tens of millions of rounds to converge; see tools/jackpot_integral.js).
        // 9.2938 rounds to the nearest cent as 9.29 (a prior pass here
        // mistakenly used 9.30, which understates RTP by ~0.1pp).
        costMultiplier: 9.29

      }
    }
  };

  CONFIG.rushCost = function () { return CONFIG.bonusModes.rush.shots; };

  // The three escalating gate values for a chosen starting target.
  CONFIG.tripleShotGates = function (startTarget) {
    var m = CONFIG.bonusModes.tripleShot;
    startTarget = Math.max(m.startTarget.min, Math.min(m.startTarget.max, startTarget));
    return m.gateRatios.map(function (r) { return Math.round(startTarget * r * 100) / 100; });
  };
  CONFIG.tripleShotCost = function () { return CONFIG.bonusModes.tripleShot.gateRatios.length; };

  // Win chance (%) for a given target multiplier, and the inverse.
  CONFIG.chanceForTarget = function (target) {
    return (100 * (1 - CONFIG.houseEdge)) / target;
  };
  CONFIG.targetForChance = function (chancePct) {
    return (100 * (1 - CONFIG.houseEdge)) / chancePct;
  };

  g.GameConfig = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);


/* =========================================================================
 * APEX LIMBO — Math Engine
 *
 * Provably-fair round math, deterministic and presentation-free — the
 * engine never touches rendering, only produces results for the UI/
 * renderer to play back.
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

  /* ---- Bonus Buy modes --------------------------------------------------
   * All three reduce to one or more independent calls to computeResult()
   * under sequential nonces from the SAME held server seed — nothing here
   * is a different RNG or a special-cased draw. That means every shot in
   * every bonus is exactly as independently verifiable (via the Verify
   * panel / tools/verify_fairness.js) as a normal bet. */

  // RUSH MODE: `shots` independent bets at one shared target.
  P.playRush = function (clientSeed, target, shots) {
    target = Math.max(CFG.target.min, Math.min(CFG.target.max, target));
    var draws = [];
    for (var i = 0; i < shots; i++) {
      var nonce = this.nonce++;
      var result = computeResult(this.serverSeed, clientSeed, nonce, CFG.houseEdge, CFG.target.max);
      var win = result >= target;
      draws.push({ index: i, nonce: nonce, target: target, result: result, win: win, payoutX: win ? target : 0 });
    }
    var hits = draws.reduce(function (n, d) { return n + (d.win ? 1 : 0); }, 0);
    var totalPayoutX = draws.reduce(function (s, d) { return s + d.payoutX; }, 0);
    return { mode: 'rush', shots: draws, hits: hits, totalPayoutX: totalPayoutX, serverSeedHash: this.serverSeedHash() };
  };

  // TRIPLE SHOT: ONE draw, THREE escalating gates (startTarget x 1/10/100).
  // Crossing a gate banks its own value ON TOP of any earlier gate already
  // banked — since the gates are strictly increasing, crossing gate 3
  // necessarily means gates 1 and 2 were also crossed by the same result.
  P.playTripleShot = function (clientSeed, startTarget) {
    var gates = CFG.tripleShotGates(startTarget);
    var nonce = this.nonce++;
    var result = computeResult(this.serverSeed, clientSeed, nonce, CFG.houseEdge, CFG.target.max);
    var crossed = gates.map(function (g) { return result >= g; });
    var hits = crossed.reduce(function (n, c) { return n + (c ? 1 : 0); }, 0);
    var totalPayoutX = gates.reduce(function (sum, g, i) { return sum + (crossed[i] ? g : 0); }, 0);
    return {
      mode: 'tripleShot', nonce: nonce, result: result, gates: gates, crossed: crossed,
      hits: hits, totalPayoutX: totalPayoutX, serverSeedHash: this.serverSeedHash()
    };
  };

  // JACKPOT SHOT: one draw. Below minWin it's a plain miss. At/above
  // minWin the draw has "entered the zone" and its own value (clamped to
  // maxWin) IS the payout — still one ordinary computeResult() call.
  P.playJackpot = function (clientSeed, minWin, maxWin) {
    var nonce = this.nonce++;
    var result = computeResult(this.serverSeed, clientSeed, nonce, CFG.houseEdge, CFG.target.max);
    var hit = result >= minWin;
    var payoutX = hit ? Math.min(result, maxWin) : 0;
    return {
      mode: 'jackpot', nonce: nonce, result: result, hit: hit,
      payoutX: payoutX, minWin: minWin, maxWin: maxWin, serverSeedHash: this.serverSeedHash()
    };
  };

  GameEngine.computeResult = computeResult;
  g.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);

