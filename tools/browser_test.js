/* End-to-end browser test (Playwright/Chromium). Loads MEDBOT INVASION 1000,
 * walks the screen flow, runs base spins + every bonus buy, and screenshots
 * key screens. Reports any console/page errors. Usage: node tools/browser_test.js */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8137/index.html';
const OUT = '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const launchOpts = { args: ['--no-sandbox', '--disable-gpu'] };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  // Optional symbol PNGs may be absent (procedural fallback) — ignore their 404s.
  const ignorable = u => /assets\/symbols\/.*\.png/.test(u || '') || /favicon/.test(u || '');
  page.on('console', m => {
    if (m.type() !== 'error') return;
    var url = (m.location() && m.location().url) || '';
    if (!ignorable(url) && !ignorable(m.text())) errors.push('console.error: ' + m.text() + ' @ ' + url);
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('  shot:', name); }
  async function wait(ms) { await page.waitForTimeout(ms); }

  console.log('Loading', BASE);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(600);
  await shot('01_lobby');

  // open paytable + settings + history from lobby/game later; first PLAY
  await page.click('#lobbyInfo'); await wait(400); await shot('02_info_paytable');
  await page.click('[data-close="infoModal"]'); await wait(200);

  await page.click('#lobbyPlay');
  await wait(2600);                       // loading sequence
  await shot('03_game_ready');

  // turn on turbo so tests run fast
  await page.click('#btnTurbo'); await wait(150);

  // base spins
  for (let i = 0; i < 12; i++) { await page.click('#btnSpin'); await wait(900); }
  await shot('04_after_base_spins');

  // bonus buy menu
  await page.click('#btnBuy'); await wait(400); await shot('05_bonus_menu');

  // buy free spins -> confirm
  await page.click('[data-buy="buy"]'); await wait(400); await shot('06_confirm_buy');
  await page.click('#confirmYes');
  // let the FS play; capture mid-bonus
  await wait(2600); await shot('07_freespins');
  await wait(7000); await shot('08_freespins_late');
  // wait for the bonus to finish
  await page.waitForFunction(() => !document.getElementById('btnSpin').disabled, { timeout: 60000 }).catch(()=>{});
  await wait(800); await shot('09_after_bonus');

  // settings + history
  await page.click('#btnSettings'); await wait(300); await shot('10_settings');
  await page.click('[data-close="settingsModal"]'); await wait(150);
  await page.click('#btnHistory'); await wait(300); await shot('11_history');
  await page.click('[data-close="historyModal"]'); await wait(150);

  // virus king buy (premium) for a screenshot of the richest mode
  await page.click('#btnBuy'); await wait(300);
  await page.click('[data-buy="virusking"]'); await wait(300);
  await page.click('#confirmYes'); await wait(3000); await shot('12_virusking');
  await page.waitForFunction(() => !document.getElementById('btnSpin').disabled, { timeout: 90000 }).catch(()=>{});

  // exit flow
  await page.click('#btnExit'); await wait(300); await shot('13_exit_confirm');
  await page.click('#exitYes'); await wait(300); await shot('14_thanks');
  await page.click('#thanksBack'); await wait(400); await shot('15_back_to_lobby');

  const bal = await page.textContent('#balance').catch(()=>'n/a');
  console.log('Final balance:', bal);

  await browser.close();
  if (errors.length) { console.log('\n❌ PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\n✅ Browser test passed — no console/page errors.');
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
