/* =========================================================================
 * Headless browser smoke test (Playwright) — walks the full screen flow:
 * lobby → game info → loading → game; plays a seeded base round with two
 * column battles (battle overlay + total multiplier calculation + win
 * screen), then a seeded Bonus Buy round through free spins to the Bonus
 * Complete summary. Fails on any page error or stuck state, and saves
 * screenshots to tools/shots/.
 *
 * Usage: node tools/smoke_render.js
 * (requires a global playwright install with chromium)
 * ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');

let chromium;
try { chromium = require('playwright').chromium; }
catch (e) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const PORT = 8217;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      fs.readFile(file, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end('not found'); return; }
        rsp.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        rsp.end(data);
      });
    });
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const errors = [];

  async function newPage(seed, settings) {
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.addInitScript(({ seed, settings }) => {
      window.CC_SEED = seed;
      localStorage.setItem('cc1000_settings', JSON.stringify(settings));
      localStorage.setItem('cc1000_balance', '1000');
    }, { seed, settings });
    await page.goto(`http://localhost:${PORT}/`);
    return page;
  }

  /* ---- pass 1: screen flow + seeded battle round (full animations) ----- */
  let page = await newPage(6, { sound: false, music: false, turbo: false, shake: true, battleAnim: true, winAnim: true });
  await page.waitForSelector('#screenLobby.open');
  await page.screenshot({ path: path.join(SHOTS, '01-lobby.png') });

  await page.click('#tileCritter');
  await page.waitForSelector('#screenInfo.open');
  await page.screenshot({ path: path.join(SHOTS, '02-info.png') });

  await page.click('#btnInfoPlay');
  await page.waitForSelector('#screenLoading.open');
  await page.screenshot({ path: path.join(SHOTS, '03-loading.png') });
  await page.waitForSelector('#screenGame.open', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, '04-game.png') });

  // bet settings modal
  await page.click('#btnBet');
  await page.waitForSelector('#betModal.open');
  await page.screenshot({ path: path.join(SHOTS, '05-bet-settings.png') });
  await page.click('#betApply');

  // seeded battle round
  await page.click('#btnSpin');
  await page.waitForSelector('#ovBattle.open', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '08-battle.png') });
  await page.waitForSelector('#ovCalc.open', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '11-calc.png') });
  await page.waitForSelector('#ovWin.open', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '12-win.png') });
  await page.waitForFunction(() => !document.body.classList.contains('busy'), { timeout: 60000 });
  await page.screenshot({ path: path.join(SHOTS, '10-board-after-battles.png') });

  // settings / history / exit confirmation
  await page.click('#btnSettings');
  await page.waitForSelector('#settingsModal.open');
  await page.screenshot({ path: path.join(SHOTS, '17-settings.png') });
  await page.click('[data-close="settingsModal"].cta-btn');
  await page.click('#btnHistory');
  await page.waitForSelector('#historyModal.open');
  await page.screenshot({ path: path.join(SHOTS, '18-history.png') });
  await page.click('[data-close="historyModal"].cta-btn');
  await page.click('#btnExit');
  await page.waitForSelector('#exitModal.open');
  await page.screenshot({ path: path.join(SHOTS, '19-exit.png') });
  await page.click('#exitYes');
  await page.waitForSelector('#screenLobby.open');
  await page.close();

  /* ---- pass 2: seeded Bonus Buy through free spins (turbo) -------------- */
  page = await newPage(1, { sound: false, music: false, turbo: true, shake: false, battleAnim: false, winAnim: true });
  await page.click('#tileCritter');
  await page.click('#btnInfoPlay');
  await page.waitForSelector('#screenGame.open', { timeout: 15000 });
  await page.click('#btnBuy');
  await page.waitForSelector('#buyModal.open');
  await page.screenshot({ path: path.join(SHOTS, '14-buy-menu.png') });
  await page.click('#buyConfirm');
  await page.waitForSelector('#ovFsTrigger.open', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '13-fs-trigger.png') });
  await page.waitForFunction(
    () => document.querySelector('#screenGame.open') && !document.querySelector('#ovFsTrigger.open'),
    { timeout: 30000 });
  await page.waitForSelector('#ovFsEnd.open', { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, '16-bonus-complete.png') });
  await page.click('#fsEndContinue');
  await page.waitForFunction(() => !document.body.classList.contains('busy'), { timeout: 60000 });

  // super bonus buy
  await page.click('#btnBuy');
  await page.waitForSelector('#buyModal.open');
  await page.click('#superBuyConfirm');
  await page.waitForSelector('#ovFsEnd.open', { timeout: 180000 });
  await page.screenshot({ path: path.join(SHOTS, '16b-super-bonus-complete.png') });
  await page.click('#fsEndContinue');
  await page.waitForFunction(() => !document.body.classList.contains('busy'), { timeout: 60000 });
  await page.close();

  await browser.close();
  srv.close();

  if (errors.length) {
    console.error('SMOKE TEST FAILED — page errors:');
    errors.forEach((e) => console.error('  ' + e));
    process.exit(1);
  }
  console.log('Smoke test OK — full screen flow, battle round and bonus round played without errors.');
  console.log('Screenshots in', SHOTS);
})().catch((e) => { console.error('SMOKE TEST FAILED:', e.message); process.exit(1); });
