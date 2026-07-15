// Cursed Baker — HUD interactions
const HUD = (() => {
  let els = {};
  let autoPlayOn = false;
  let rapidOn = false;
  let inFreeSpins = false;

  function cache() {
    els.spin = document.getElementById('btnSpin');
    els.rapid = document.getElementById('btnRapidSpin');
    els.auto = document.getElementById('btnAutoPlay');
    els.buyBonus = document.getElementById('btnBuyBonus');
    els.settings = document.getElementById('btnSettings');
    els.history = document.getElementById('btnHistory');
    els.info = document.getElementById('btnInfo');
    els.fsCounter = document.getElementById('fsCounter');
    els.fsValue = document.getElementById('fsCounterValue');
    els.grid = document.getElementById('reelGrid');
  }

  async function doSpin() {
    if (ReelGrid.isSpinning() || inFreeSpins) return;
    els.spin.classList.add('is-spinning');
    els.spin.disabled = true;
    await ReelGrid.spin();
    els.spin.classList.remove('is-spinning');
    els.spin.disabled = false;
  }

  function toggleRapid() {
    rapidOn = !rapidOn;
    ReelGrid.setRapid(rapidOn);
    els.rapid.classList.toggle('is-active', rapidOn);
  }

  function toggleAutoPlay() {
    autoPlayOn = !autoPlayOn;
    els.auto.classList.toggle('is-active', autoPlayOn);
    if (autoPlayOn) runAutoPlay();
  }

  async function runAutoPlay() {
    while (autoPlayOn && !inFreeSpins) {
      await doSpin();
      if (!autoPlayOn) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async function startFreeSpinsDemo() {
    if (inFreeSpins) return;
    inFreeSpins = true;
    els.buyBonus.classList.add('is-hidden');
    els.fsCounter.classList.add('is-visible');
    const total = 10;
    for (let i = 1; i <= total; i++) {
      els.fsValue.textContent = `${i}`;
      await ReelGrid.spin();
      await new Promise((r) => setTimeout(r, 400));
    }
    els.fsCounter.classList.remove('is-visible');
    els.buyBonus.classList.remove('is-hidden');
    inFreeSpins = false;
  }

  function bind() {
    els.spin.addEventListener('click', doSpin);
    els.rapid.addEventListener('click', toggleRapid);
    els.auto.addEventListener('click', toggleAutoPlay);
    els.buyBonus.addEventListener('click', startFreeSpinsDemo);
  }

  function init() {
    cache();
    bind();
  }

  return { init };
})();
