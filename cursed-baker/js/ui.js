// Cursed Baker — HUD interactions
const HUD = (() => {
  let els = {};
  let autoPlayOn = false;
  let rapidOn = false;
  let inFreeSpins = false;
  let betIndex = DEFAULT_BET_INDEX;
  let balance = STARTING_BALANCE;

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
    els.balanceValue = document.getElementById('balanceValue');
    els.betValue = document.getElementById('betValue');
    els.betMinus = document.getElementById('betMinus');
    els.betPlus = document.getElementById('betPlus');
  }

  function money(n) {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function animateValue(el, from, to, formatFn) {
    const duration = 450;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatFn(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function setBalance(next) {
    const from = balance;
    balance = Math.max(0, next);
    animateValue(els.balanceValue, from, balance, money);
  }

  function currentBet() {
    return BET_STEPS[betIndex];
  }

  function renderBet() {
    els.betValue.textContent = currentBet().toFixed(2);
  }

  function refreshBetControls() {
    const locked = inFreeSpins || autoPlayOn || ReelGrid.isSpinning();
    els.betMinus.disabled = locked || betIndex === 0;
    els.betPlus.disabled = locked || betIndex === BET_STEPS.length - 1;
  }

  function stepBet(delta) {
    if (inFreeSpins || autoPlayOn || ReelGrid.isSpinning()) return;
    const next = betIndex + delta;
    if (next < 0 || next >= BET_STEPS.length) return;
    betIndex = next;
    renderBet();
    refreshBetControls();
  }

  async function doSpin() {
    if (ReelGrid.isSpinning() || inFreeSpins) return;
    if (balance < currentBet()) return;
    setBalance(balance - currentBet());
    refreshBetControls();
    els.spin.classList.add('is-spinning');
    els.spin.disabled = true;
    await ReelGrid.spin();
    els.spin.classList.remove('is-spinning');
    els.spin.disabled = false;
    refreshBetControls();
  }

  function toggleRapid() {
    rapidOn = !rapidOn;
    ReelGrid.setRapid(rapidOn);
    els.rapid.classList.toggle('is-active', rapidOn);
  }

  function toggleAutoPlay() {
    autoPlayOn = !autoPlayOn;
    els.auto.classList.toggle('is-active', autoPlayOn);
    refreshBetControls();
    if (autoPlayOn) runAutoPlay();
  }

  async function runAutoPlay() {
    while (autoPlayOn && !inFreeSpins && balance >= currentBet()) {
      await doSpin();
      if (!autoPlayOn) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    autoPlayOn = false;
    els.auto.classList.remove('is-active');
    refreshBetControls();
  }

  async function startFreeSpinsDemo() {
    if (inFreeSpins) return;
    inFreeSpins = true;
    refreshBetControls();
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
    refreshBetControls();
  }

  function bind() {
    els.spin.addEventListener('click', doSpin);
    els.rapid.addEventListener('click', toggleRapid);
    els.auto.addEventListener('click', toggleAutoPlay);
    els.buyBonus.addEventListener('click', startFreeSpinsDemo);
    els.betMinus.addEventListener('click', () => stepBet(-1));
    els.betPlus.addEventListener('click', () => stepBet(1));
  }

  function init() {
    cache();
    bind();
    els.balanceValue.textContent = money(balance);
    renderBet();
    refreshBetControls();
  }

  return { init };
})();
