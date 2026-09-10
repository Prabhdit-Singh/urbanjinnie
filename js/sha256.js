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
