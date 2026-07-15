// Cursed Baker — reel grid rendering + spin/landing animation
const ReelGrid = (() => {
  const COLS = 5;
  const ROWS = 4;
  let gridEl = null;
  let current = INITIAL_GRID.slice();
  let spinning = false;
  let rapid = false;

  function init(el) {
    gridEl = el;
    render(current);
  }

  function cellNode(symbolKey, index) {
    const def = SYMBOLS[symbolKey];
    const cell = document.createElement('div');
    cell.className = 'reel-cell';
    if (def.type === 'wild') cell.classList.add('reel-cell--wild');
    if (def.type === 'scatter') cell.classList.add('reel-cell--scatter');

    const bg = document.createElement('div');
    bg.className = 'reel-cell__bg';

    const sym = document.createElement('div');
    sym.className = 'reel-cell__symbol';
    sym.style.backgroundImage = `url(${def.src})`;
    sym.style.animationDelay = `${(index % COLS) * 0.06 + Math.floor(index / COLS) * 0.03}s`;

    cell.appendChild(bg);
    cell.appendChild(sym);
    return cell;
  }

  function render(gridArray) {
    gridEl.innerHTML = '';
    gridArray.forEach((key, i) => gridEl.appendChild(cellNode(key, i)));
  }

  function randomSymbol() {
    return SPIN_POOL[Math.floor(Math.random() * SPIN_POOL.length)];
  }

  function setRapid(value) {
    rapid = value;
  }

  function spin() {
    if (spinning) return Promise.resolve();
    spinning = true;
    gridEl.classList.add('is-spinning');

    const colDelayBase = rapid ? 90 : 160;
    const settleBase = rapid ? 260 : 520;

    return new Promise((resolve) => {
      for (let c = 0; c < COLS; c++) {
        const delay = settleBase + c * colDelayBase;
        setTimeout(() => {
          for (let r = 0; r < ROWS; r++) {
            current[r * COLS + c] = randomSymbol();
          }
          if (c === COLS - 1) {
            gridEl.classList.remove('is-spinning');
            render(current);
            spinning = false;
            resolve();
          }
        }, delay);
      }
    });
  }

  return { init, spin, setRapid, isSpinning: () => spinning };
})();
