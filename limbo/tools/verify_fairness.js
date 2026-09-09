/* =========================================================================
 * Fairness contract checks:
 *  1) The SHA-256 / HMAC-SHA256 implementation matches published test
 *     vectors (NIST SHA-256 vectors, RFC 4231 HMAC test case 1).
 *  2) GameEngine.computeResult is a pure, deterministic function of its
 *     inputs (same serverSeed/clientSeed/nonce -> same result, always).
 *  3) Results stay within [1.00, target.max] across a wide input sweep.
 *  4) The server-seed hash is a real commitment: hashing the revealed
 *     seed reproduces the hash published before the bet.
 *
 * Usage: node tools/verify_fairness.js
 * ========================================================================= */
'use strict';

require('../js/sha256.js');
require('../js/config.js');
require('../js/engine.js');

var Sha256 = globalThis.Sha256;
var CFG = globalThis.GameConfig;
var Engine = globalThis.GameEngine;

var failures = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) failures++;
}

// 1) known vectors
check('sha256("")', Sha256.hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('sha256("abc")', Sha256.hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
var key20 = Buffer.alloc(20, 0x0b).toString('binary');
check('HMAC-SHA256 RFC4231 case 1',
  Sha256.hmacHex(key20, 'Hi There') === 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');

// 2) determinism
var r1 = Engine.computeResult('seedA', 'client1', 42, CFG.houseEdge, CFG.target.max);
var r2 = Engine.computeResult('seedA', 'client1', 42, CFG.houseEdge, CFG.target.max);
check('computeResult is deterministic for identical inputs', r1 === r2);

var r3 = Engine.computeResult('seedA', 'client1', 43, CFG.houseEdge, CFG.target.max);
check('different nonce changes the result (no obvious collision)', r3 !== r1);

// 3) range sweep
var eng = new Engine(999);
var inRange = true, n = 200000;
for (var i = 0; i < n; i++) {
  var m = Engine.computeResult('sweepSeed', 'c' + (i % 7), i, CFG.houseEdge, CFG.target.max);
  if (!(m >= 1 && m <= CFG.target.max)) { inRange = false; break; }
}
check('computeResult stays within [1.00, ' + CFG.target.max + '] over ' + n + ' draws', inRange);

// 4) hash commitment round-trips through a live engine
var live = new Engine(7);
var committedHash = live.serverSeedHash();
var revealed = live.rotateServerSeed();
check('revealed server seed hashes back to the committed hash', Sha256.hex(revealed) === committedHash);

console.log('');
console.log(failures === 0 ? 'All fairness checks passed.' : failures + ' check(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
