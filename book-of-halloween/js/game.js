/* =========================================================================
 * BOOK OF HALLOWEEN — engine, reel renderer & UI
 *
 * Self-contained: weighted reel draws -> line + scatter evaluation -> Free
 * Spins with a random Special Expanding Symbol. Reels animate on a canvas;
 * the casino shell lives in HTML/CSS. No external assets.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.BOH_Config, Art = g.BOH_Art, SFX = g.BOH_Audio;
  var COLS = CFG.grid.cols, ROWS = CFG.grid.rows;

  /* ---- layout (internal canvas coordinates) --------------------------- */
  var W = 960, H = 640;
  var CELL = 150, GAP = 10;
  var GRID_W = COLS * CELL + (COLS - 1) * GAP;
  var GRID_H = ROWS * CELL + (ROWS - 1) * GAP;
  var GX = (W - GRID_W) / 2;
  var GY = (H - GRID_H) / 2 + 18;

  /* ---- state ----------------------------------------------------------- */
  var state = {
    balance: CFG.startBalance,
    betIndex: CFG.bet.defaultIndex,
    grid: makeGrid(),            // current visible symbol ids [col][row]
    busy: false,
    auto: 0,
    fs: { active: false, remaining: 0, special: null, total: 0 },
    wins: [],                    // [{type, positions:[[c,r]..], amount, ...}]
    winFlash: 0,
    expandReels: []              // reels currently expanded (free spins)
  };

  var reels = [];               // animation model per reel
  var canvas, ctx, overlay;

  /* ---- helpers --------------------------------------------------------- */
  function bet() { return CFG.bet.levels[state.betIndex]; }
  function perLine() { return bet() / CFG.paylines.length; }
  function money(v) { return '$' + v.toFixed(2); }

  function makeGrid() {
    var grid = [];
    for (var c = 0; c < COLS; c++) { grid[c] = []; for (var r = 0; r < ROWS; r++) grid[c][r] = 'ten'; }
    return grid;
  }

  function weightedPick(weights) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var x = Math.random() * total;
    for (k in weights) { x -= weights[k]; if (x <= 0) return k; }
    return k;
  }

  function drawColumn(weights) {
    var col = [];
    for (var r = 0; r < ROWS; r++) col.push(weightedPick(weights));
    return col;
  }

  function payOf(id, count) {
    var row = CFG.paytable[id];
    if (!row || count < 3) return 0;
    return row[Math.min(count, 5) - 3];
  }

  /* ---- evaluation ------------------------------------------------------ */
  // Returns a list of win records for the given visible grid.
  function evaluate(grid) {
    var wins = [], total = 0;
    var BOOK = CFG.book.id;
    var fs = state.fs.active, special = state.fs.special;

    // 1) Book scatter (anywhere).
    var bookPos = [], bookCount = 0;
    for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++)
      if (grid[c][r] === BOOK) { bookCount++; bookPos.push([c, r]); }
    if (CFG.bookScatterPays[bookCount]) {
      var amt = CFG.bookScatterPays[bookCount] * bet();
      wins.push({ type: 'scatter', symbol: BOOK, count: bookCount, positions: bookPos, amount: amt });
      total += amt;
    }

    // 2) Expanding special symbol (Free Spins only).
    state.expandReels = [];
    if (fs && special) {
      var reelsWith = [];
      for (c = 0; c < COLS; c++) {
        var has = false;
        for (r = 0; r < ROWS; r++) if (grid[c][r] === special || grid[c][r] === BOOK) has = true;
        if (has) reelsWith.push(c);
      }
      if (reelsWith.length >= 3) {
        state.expandReels = reelsWith.slice();
        var ep = [];
        for (var i = 0; i < reelsWith.length; i++)
          for (r = 0; r < ROWS; r++) { grid[reelsWith[i]][r] = special; ep.push([reelsWith[i], r]); }
        var eAmt = payOf(special, reelsWith.length) * bet(); // covers all lines -> x total bet
        if (eAmt > 0) {
          wins.push({ type: 'expand', symbol: special, count: reelsWith.length, positions: ep, amount: eAmt });
          total += eAmt;
        }
      }
    }

    // 3) Line wins (left-to-right, Book is wild).
    for (var L = 0; L < CFG.paylines.length; L++) {
      var line = CFG.paylines[L];
      // when expansion paid this reel-set, skip line wins of that same symbol
      // (the expansion already pays it across every line).
      var cells = [];
      for (c = 0; c < COLS; c++) cells.push(grid[c][line[c]]);

      var target = null;
      for (c = 0; c < COLS; c++) if (cells[c] !== BOOK) { target = cells[c]; break; }
      if (!target || target === BOOK) continue;
      if (fs && special && state.expandReels.length && target === special) continue;

      var count = 0;
      for (c = 0; c < COLS; c++) { if (cells[c] === target || cells[c] === BOOK) count++; else break; }
      var lp = payOf(target, count);
      if (lp > 0) {
        var pos = [];
        for (c = 0; c < count; c++) pos.push([c, line[c]]);
        var lamt = lp * perLine();
        wins.push({ type: 'line', line: L, symbol: target, count: count, positions: pos, amount: lamt });
        total += lamt;
      }
    }

    return { wins: wins, total: total, bookCount: bookCount };
  }

  /* ---- spin orchestration --------------------------------------------- */
  function startSpin(isAuto) {
    if (state.busy) return;
    var freeMode = state.fs.active;

    if (!freeMode) {
      if (state.balance < bet()) { setStatus('Not enough balance — reset to keep playing.'); return; }
      state.balance -= bet();
      syncBalance();
    }

    state.busy = true;
    state.wins = [];
    clearOverlay();
    setSpinEnabled(false);
    SFX.resume(); SFX.spin();

    var weights = freeMode ? CFG.weights.fs : CFG.weights.base;
    var finalGrid = [];
    for (var c = 0; c < COLS; c++) finalGrid[c] = drawColumn(weights);

    var now = performance.now();
    reels = [];
    for (c = 0; c < COLS; c++) {
      var strip = [];
      for (var k = 0; k < 16; k++) strip.push(weightedPick(weights));
      reels.push({
        strip: strip,
        finalCol: finalGrid[c],
        pos: 0,
        speed: 26 + c * 0.6,         // symbols per second
        stopAt: now + 520 + c * 170, // staggered stop
        spinning: true,
        stopped: false
      });
    }

    state._finalGrid = finalGrid;
    state._allStopped = false;
  }

  function onAllStopped() {
    state.grid = state._finalGrid;
    var res = evaluate(state.grid);          // mutates grid for expansion
    state.wins = res.wins;

    var capped = false, cap = CFG.maxWinX * bet();
    var win = res.total;
    if (state.fs.active && state.fs.total + win > cap) { win = Math.max(0, cap - state.fs.total); capped = true; }
    else if (!state.fs.active && win > cap) { win = cap; capped = true; }

    state.balance += win;
    syncBalance();
    setLastWin(win);

    if (state.fs.active) { state.fs.total += win; updateFsBanner(); }

    // sound
    if (win > 0) {
      if (win >= bet() * 20) SFX.bigWin(); else SFX.win(Math.log10(1 + win / Math.max(bet(), 0.01)));
    }

    // triggers
    var triggered = false;
    if (res.bookCount >= CFG.freeSpins.trigger) {
      SFX.book();
      if (!state.fs.active) { startFreeSpins(res.bookCount); triggered = true; }
      else if (CFG.freeSpins.retrigger) {
        state.fs.remaining += CFG.freeSpins.award;
        updateFsBanner();
        showBanner('RETRIGGER!', '+' + CFG.freeSpins.award + ' Free Spins');
      }
    }

    state.winFlash = performance.now();
    state.busy = false;

    var delay = state.wins.length ? 1100 : 500;
    if (triggered) delay = 2200;

    if (state.fs.active && !triggered) {
      state.fs.remaining--;
      updateFsBanner();
      if (state.fs.remaining > 0) {
        setStatus('Free spin — ' + state.fs.remaining + ' left');
        setTimeout(function () { startSpin(false); }, delay);
        return;
      } else {
        setTimeout(endFreeSpins, delay + 400);
        return;
      }
    }

    if (triggered) { setSpinEnabled(false); return; } // handled by startFreeSpins flow

    setSpinEnabled(true);
    if (capped) setStatus('Max win reached!');

    // base-game autoplay (exactly N spins)
    if (state.auto > 0) {
      state.auto--;
      updateAutoBtn();
      if (state.auto > 0 && state.balance >= bet())
        setTimeout(function () { if (!state.fs.active && state.auto > 0) startSpin(true); }, delay);
      else { state.auto = 0; updateAutoBtn(); }
    }
  }

  function startFreeSpins(triggerCount) {
    var pool = CFG.expandableIds;
    state.fs.active = true;
    state.fs.remaining = CFG.freeSpins.award;
    state.fs.special = pool[Math.floor(Math.random() * pool.length)];
    state.fs.total = 0;
    state.auto = 0; updateAutoBtn();
    SFX.freeSpins();
    showFsBanner();
    var name = nameOf(state.fs.special);
    showBanner('FREE SPINS!', triggerCount + ' Books · Special: ' + name);
    setStatus('Free Spins! Special symbol: ' + name);
    setSpinEnabled(false);
    setTimeout(function () { clearOverlay(); startSpin(false); }, 2400);
  }

  function endFreeSpins() {
    var totalWin = state.fs.total;
    state.fs.active = false;
    state.fs.special = null;
    state.expandReels = [];
    hideFsBanner();
    showBanner('BONUS WIN', money(totalWin));
    setStatus('Free Spins finished — won ' + money(totalWin));
    setSpinEnabled(true);
  }

  /* ---- rendering ------------------------------------------------------- */
  function cellXY(c, r) { return { x: GX + c * (CELL + GAP), y: GY + r * (CELL + GAP) }; }

  function isWinningCell(c, r) {
    for (var i = 0; i < state.wins.length; i++) {
      var p = state.wins[i].positions;
      for (var j = 0; j < p.length; j++) if (p[j][0] === c && p[j][1] === r) return true;
    }
    return false;
  }

  function drawFrame(t) {
    ctx.clearRect(0, 0, W, H);
    Art.background(ctx, W, H, t);

    // ornate reel backboard
    ctx.save();
    Art.roundRect(ctx, GX - 22, GY - 22, GRID_W + 44, GRID_H + 44, 22);
    var bg = ctx.createLinearGradient(0, GY - 22, 0, GY + GRID_H + 22);
    bg.addColorStop(0, 'rgba(20,8,34,0.92)');
    bg.addColorStop(1, 'rgba(8,3,16,0.94)');
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,138,30,0.55)';
    ctx.shadowColor = 'rgba(255,138,30,0.5)'; ctx.shadowBlur = 18; ctx.stroke();
    ctx.restore();

    var winning = state.winFlash && (t - state.winFlash < 4000);
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.006);

    for (var c = 0; c < COLS; c++) {
      var reel = reels[c];
      // cell wells
      for (var r = 0; r < ROWS; r++) {
        var p = cellXY(c, r);
        ctx.save();
        Art.roundRect(ctx, p.x, p.y, CELL, CELL, 16);
        ctx.fillStyle = (c % 2) ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)';
        ctx.fill();
        ctx.restore();
      }

      // clip the reel column and draw symbols (animated or static)
      ctx.save();
      Art.roundRect(ctx, GX + c * (CELL + GAP) - 2, GY - 2, CELL + 4, GRID_H + 4, 16);
      ctx.clip();

      if (reel && reel.spinning) {
        drawSpinningReel(c, reel);
      } else {
        for (r = 0; r < ROWS; r++) {
          var pp = cellXY(c, r);
          var id = state.grid[c][r];
          var expanded = state.expandReels.indexOf(c) >= 0;
          drawSymbol(id, pp.x, pp.y, expanded && winning, t);
          if (winning && isWinningCell(c, r)) {
            ctx.save();
            Art.roundRect(ctx, pp.x + 3, pp.y + 3, CELL - 6, CELL - 6, 14);
            ctx.strokeStyle = 'rgba(255,210,90,' + (0.5 + 0.5 * pulse) + ')';
            ctx.lineWidth = 4; ctx.shadowColor = '#ffcf52'; ctx.shadowBlur = 16; ctx.stroke();
            ctx.restore();
          }
        }
      }
      ctx.restore();
    }

    // winning paylines
    if (winning) drawWinLines(pulse);
  }

  function drawSpinningReel(c, reel) {
    var n = reel.strip.length;
    var base = GX + 0;
    var colX = GX + c * (CELL + GAP);
    var off = (reel.pos % 1) * (CELL + GAP);
    for (var r = -1; r <= ROWS; r++) {
      var idx = ((Math.floor(reel.pos) + r) % n + n) % n;
      var id = reel.strip[idx];
      var y = GY + r * (CELL + GAP) - off;
      drawSymbol(id, colX, y, false, 0, 0.85);
    }
  }

  function drawSymbol(id, x, y, glow, t, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    var pad = 14, sz = CELL - pad * 2;
    if (glow) {
      var pulse = 0.6 + 0.4 * Math.sin((t || 0) * 0.008);
      ctx.shadowColor = 'rgba(255,138,30,' + pulse + ')';
      ctx.shadowBlur = 28;
      Art.roundRect(ctx, x + 4, y + 4, CELL - 8, CELL - 8, 14);
      ctx.fillStyle = 'rgba(255,138,30,0.12)'; ctx.fill();
      ctx.shadowBlur = 0;
    }
    Art.draw(ctx, id, x + pad, y + pad, sz);
    ctx.restore();
  }

  function drawWinLines(pulse) {
    var palette = ['#ffd23b', '#ff7ad9', '#7ad4ff', '#9be86a', '#ff8a1e', '#c9b8ff'];
    var li = 0;
    for (var i = 0; i < state.wins.length; i++) {
      var wn = state.wins[i];
      if (wn.type !== 'line') continue;
      var line = CFG.paylines[wn.line];
      ctx.save();
      ctx.strokeStyle = palette[li % palette.length];
      ctx.globalAlpha = 0.45 + 0.4 * pulse;
      ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
      ctx.beginPath();
      for (var c = 0; c <= wn.count - 1; c++) {
        var p = cellXY(c, line[c]);
        var cx = p.x + CELL / 2, cy = p.y + CELL / 2;
        c === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.restore();
      li++;
    }
  }

  /* ---- animation loop -------------------------------------------------- */
  var lastT = 0;
  function loop(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;

    if (reels.length) {
      var allStopped = true;
      for (var c = 0; c < COLS; c++) {
        var reel = reels[c];
        if (reel.spinning) {
          reel.pos += reel.speed * dt;
          if (t >= reel.stopAt) {
            reel.spinning = false; reel.stopped = true;
            state.grid[c] = reel.finalCol;   // snap this column immediately
            SFX.reelStop(c);
          } else allStopped = false;
        }
      }
      if (allStopped && !state._allStopped) { state._allStopped = true; onAllStopped(); }
    }

    drawFrame(t);
    requestAnimationFrame(loop);
  }

  /* ---- overlay / banners ----------------------------------------------- */
  function showBanner(big, small) {
    overlay.innerHTML = '<div class="banner"><div class="big">' + big + '</div>' +
      (small ? '<div class="small">' + small + '</div>' : '') + '</div>';
  }
  function clearOverlay() { overlay.innerHTML = ''; }

  /* ---- UI binding ------------------------------------------------------ */
  var el = {};
  function $(id) { return document.getElementById(id); }

  function syncBalance() { el.balance.textContent = money(state.balance); }
  function setLastWin(v) { el.lastWin.textContent = v > 0 ? money(v) : '—'; }
  function setStatus(s) { el.status.textContent = s; }
  function setBet() { el.betValue.value = money(bet()); }
  function setSpinEnabled(on) {
    el.btnSpin.disabled = !on;
    el.btnSpin.textContent = state.fs.active ? 'FREE SPIN' : 'SPIN';
  }
  function updateAutoBtn() {
    el.btnAuto.classList.toggle('on', state.auto > 0);
    el.btnAuto.textContent = state.auto > 0 ? ('Auto · ' + state.auto) : 'Auto ×10';
  }
  function nameOf(id) {
    for (var i = 0; i < CFG.symbols.length; i++) if (CFG.symbols[i].id === id) return CFG.symbols[i].name;
    return id;
  }
  function showFsBanner() { el.fsBanner.style.display = 'block'; updateFsBanner(); }
  function hideFsBanner() { el.fsBanner.style.display = 'none'; }
  function updateFsBanner() {
    el.fsRemain.textContent = state.fs.remaining;
    el.fsSpecial.textContent = state.fs.special ? nameOf(state.fs.special) : '—';
    el.fsWin.textContent = money(state.fs.total);
  }

  function buildPaytable() {
    var grid = $('paytableGrid');
    var rows = '';
    var list = CFG.symbols.concat([{ id: CFG.book.id, name: CFG.book.name }]);
    grid.innerHTML = '';
    list.forEach(function (sym) {
      var div = document.createElement('div');
      div.className = 'pt-row';
      var cv = document.createElement('canvas');
      cv.width = cv.height = 76;
      var cx = cv.getContext('2d');
      Art.draw(cx, sym.id, 4, 4, 68);
      div.appendChild(cv);
      var name = document.createElement('div'); name.className = 'pt-name'; name.textContent = sym.name;
      var pays = document.createElement('div'); pays.className = 'pt-pays';
      if (sym.id === CFG.book.id) {
        pays.textContent = 'Scatter 2/3/4/5 → 1× 2× 20× 200×';
      } else {
        var p = CFG.paytable[sym.id];
        pays.textContent = p[0] + ' / ' + p[1] + ' / ' + p[2];
      }
      div.appendChild(name); div.appendChild(pays);
      grid.appendChild(div);
    });
  }

  function bindUI() {
    el.balance = $('balance'); el.lastWin = $('lastWin'); el.status = $('statusLine');
    el.betValue = $('betValue'); el.btnSpin = $('btnSpin'); el.btnAuto = $('btnAuto');
    el.fsBanner = $('fsBanner'); el.fsRemain = $('fsRemain'); el.fsSpecial = $('fsSpecial'); el.fsWin = $('fsWin');

    $('betDown').onclick = function () { if (state.busy) return; state.betIndex = Math.max(0, state.betIndex - 1); setBet(); };
    $('betUp').onclick = function () { if (state.busy) return; state.betIndex = Math.min(CFG.bet.levels.length - 1, state.betIndex + 1); setBet(); };
    $('betMax').onclick = function () { if (state.busy) return; state.betIndex = CFG.bet.levels.length - 1; setBet(); };

    el.btnSpin.onclick = function () { if (!state.fs.active) state.auto = 0, updateAutoBtn(); startSpin(false); };
    el.btnAuto.onclick = function () {
      if (state.fs.active) return;
      if (state.auto > 0) { state.auto = 0; updateAutoBtn(); }
      else { state.auto = 10; updateAutoBtn(); if (!state.busy) startSpin(true); }
    };

    $('btnReset').onclick = function () {
      state.balance = CFG.startBalance; syncBalance(); setStatus('Demo balance reset.');
    };

    var sound = $('btnSound');
    sound.onclick = function () {
      var on = !SFX.isEnabled(); SFX.setEnabled(on);
      sound.classList.toggle('off', !on); sound.textContent = on ? '🔊' : '🔇';
    };

    $('btnInfo').onclick = function () { $('infoModal').classList.add('open'); };
    $('infoClose').onclick = function () { $('infoModal').classList.remove('open'); };
    $('infoModal').onclick = function (e) { if (e.target === this) this.classList.remove('open'); };

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space') { e.preventDefault(); if (!el.btnSpin.disabled) el.btnSpin.click(); }
    });
  }

  /* ---- boot ------------------------------------------------------------ */
  function init() {
    canvas = $('game'); ctx = canvas.getContext('2d'); overlay = $('overlay');
    bindUI();
    // seed an initial visible grid
    for (var c = 0; c < COLS; c++) state.grid[c] = drawColumn(CFG.weights.base);
    syncBalance(); setBet(); setLastWin(0); updateAutoBtn();
    buildPaytable();
    SFX.setEnabled(true);
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Exposed for headless testing (tools/smoke.js); unused by the page itself.
  g.BOH_Game = {
    state: state, evaluate: evaluate, payOf: payOf, drawColumn: drawColumn,
    bet: bet, perLine: perLine
  };
})(typeof window !== 'undefined' ? window : globalThis);
