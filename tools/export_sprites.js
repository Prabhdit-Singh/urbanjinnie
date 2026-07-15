/* Bakes the procedural symbol painters into real PNG asset files under
 * assets/symbols/ at 256px. The game loads these PNGs first and only falls
 * back to procedural drawing if a file is missing — so a publisher can drop
 * in their own art by replacing the PNGs.
 *
 * Usage: node tools/export_sprites.js  (requires a local http server on :8000
 * or pass a base URL as argv[2]; puppeteer must be installed, e.g. in /tmp) */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('/tmp/node_modules/puppeteer');

const SIZE = 256;
const OUT = path.join(__dirname, '..', 'assets', 'symbols');
const BASE = process.argv[2] || 'http://127.0.0.1:8000';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  // ?procedural forces the painters even if PNGs already exist (re-export)
  await page.goto(BASE + '/index.html?procedural=1', { waitUntil: 'networkidle0' });

  const sprites = await page.evaluate((size) => {
    const out = {};
    window.SymbolArt.ids().forEach((id) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      window.SymbolArt.paintInto(cv.getContext('2d'), id, size);
      out[id] = cv.toDataURL('image/png');
    });
    return out;
  }, SIZE);

  for (const [id, dataUrl] of Object.entries(sprites)) {
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(OUT, id + '.png'), Buffer.from(b64, 'base64'));
    console.log('exported assets/symbols/%s.png (%d bytes)', id, Buffer.byteLength(b64, 'base64'));
  }

  await browser.close();
  console.log('Done: %d sprites at %dpx.', Object.keys(sprites).length, SIZE);
})().catch((e) => { console.error('EXPORT FAILED:', e); process.exit(1); });
