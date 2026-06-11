/* =========================================================================
 * CRITTER CLASH 1000 — UI layer
 *
 * Casino-shell controls and the screen flow: Lobby → Game Info → Loading →
 * Game (with Bet Settings, Settings, History, Exit Confirmation modals).
 * Talks to main.js through callbacks; never touches game math.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var LS = 'cc1000_';

  function $(id) { return document.getElementById(id); }

  function UI(opts) {
    this.onSpin = opts.onSpin;        // function(mode) -> Promise<totalWin>
    this.sfx = opts.sfx;

    this.balance = parseFloat(localStorage.getItem(LS + 'balance'));
    if (!(this.balance > 0)) this.balance = CFG.startBalance;
    this.bet = CFG.bet.default;
    this.busy = false;
    this.history = [];
    try { this.history = JSON.parse(localStorage.getItem(LS + 'history') || '[]'); } catch (e) {}

    this.settings = { sound: true, music: false, turbo: false, shake: true, battleAnim: true, winAnim: true };
    try {
      var saved = JSON.parse(localStorage.getItem(LS + 'settings') || '{}');
      for (var k in saved) if (k in this.settings) this.settings[k] = saved[k];
    } catch (e) {}

    this.bind();
    this.applySettings();
    this.renderBalance();
    this.renderBet();
    this.buildPaytable();
    this.buildInfoCreatures();
    this.renderHistory();
    g.SymbolArt.paintInto($('tileArt'), 'blazepup');
  }

  var P = UI.prototype;

  P.fmt = function (v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---- screen flow ------------------------------------------------------- */
  P.show = function (id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('open'); });
    $(id).classList.add('open');
  };

  P.startLoading = function () {
    var self = this;
    this.show('screenLoading');
    var pct = 0;
    return new Promise(function (res) {
      var timer = setInterval(function () {
        pct = Math.min(100, pct + 6 + Math.random() * 14);
        $('loadFill').style.width = pct + '%';
        $('loadPct').textContent = 'LOADING… ' + Math.floor(pct) + '%';
        if (pct >= 100) {
          clearInterval(timer);
          setTimeout(function () {
            self.show('screenGame');
            self.message('Place your bet — tap SPIN or press SPACE.');
            window.dispatchEvent(new Event('resize')); // size the canvas now that it is visible
            res();
          }, 350);
        }
      }, 120);
    });
  };

  P.renderBalance = function () {
    $('balance').textContent = this.fmt(this.balance);
    $('lobbyBalance').textContent = this.fmt(this.balance);
    localStorage.setItem(LS + 'balance', String(this.balance));
  };

  P.renderBet = function () {
    $('betLabel').textContent = this.fmt(this.bet);
    $('betValue').textContent = this.fmt(this.bet);
    $('betTotal').textContent = this.fmt(this.bet);
    $('betBuyCost').textContent = this.fmt(this.bet * CFG.betModes.buy.cost);
    $('buyCost').textContent = this.fmt(this.bet * CFG.betModes.buy.cost);
    $('superBuyCost').textContent = this.fmt(this.bet * CFG.betModes.superbuy.cost);
    var self = this;
    document.querySelectorAll('.preset-btn').forEach(function (b) {
      b.classList.toggle('active', parseFloat(b.dataset.bet) === self.bet);
    });
  };

  P.setBet = function (v) {
    v = Math.min(CFG.bet.max, Math.max(CFG.bet.min, v));
    this.bet = Math.round(v * 100) / 100;
    this.renderBet();
  };

  P.stepBet = function (dir) {
    var steps = CFG.bet.steps, i;
    if (dir > 0) {
      for (i = 0; i < steps.length; i++) if (steps[i] > this.bet + 1e-9) { this.setBet(steps[i]); return; }
      this.setBet(steps[steps.length - 1]);
    } else {
      for (i = steps.length - 1; i >= 0; i--) if (steps[i] < this.bet - 1e-9) { this.setBet(steps[i]); return; }
      this.setBet(steps[0]);
    }
  };

  P.setBusy = function (b) {
    this.busy = b;
    $('btnSpin').disabled = b;
    $('btnBuy').disabled = b;
    $('btnBet').disabled = b;
    document.body.classList.toggle('busy', b);
  };

  P.win = function (amount) {
    $('lastWin').textContent = amount > 0 ? this.fmt(amount) : '—';
  };

  P.message = function (text) { $('statusLine').textContent = text; };

  /* ---- settings ------------------------------------------------------------ */
  P.applySettings = function () {
    var s = this.settings;
    this.sfx.setEnabled(s.sound);
    this.sfx.setMusic(s.music);
    $('turboLabel').textContent = s.turbo ? 'ON' : 'OFF';
    $('btnTurbo').classList.toggle('on', s.turbo);
    document.querySelectorAll('.toggle').forEach(function (t) {
      t.classList.toggle('on', !!s[t.dataset.setting]);
    });
    localStorage.setItem(LS + 'settings', JSON.stringify(s));
  };

  /* ---- history ------------------------------------------------------------- */
  P.record = function (mode, cost, winAmount) {
    this.history.unshift({
      t: Date.now(),
      bet: cost,
      win: winAmount,
      type: CFG.betModes[mode].label
    });
    this.history = this.history.slice(0, 50);
    localStorage.setItem(LS + 'history', JSON.stringify(this.history));
    this.renderHistory();
  };

  P.renderHistory = function () {
    var host = $('historyRows');
    if (!this.history.length) {
      host.innerHTML = '<tr><td colspan="4" class="muted">No spins yet.</td></tr>';
      return;
    }
    var self = this;
    host.innerHTML = this.history.map(function (h) {
      var d = new Date(h.t);
      var when = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
                 d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return '<tr><td>' + when + '</td><td>' + self.fmt(h.bet) + '</td>' +
             '<td class="' + (h.win > 0 ? 'win' : 'loss') + '">' + self.fmt(h.win) + '</td>' +
             '<td>' + h.type + '</td></tr>';
    }).join('');
  };

  /* ---- wiring ----------------------------------------------------------------- */
  P.bind = function () {
    var self = this;

    function click(id, fn) {
      $(id).addEventListener('click', function (e) { self.sfx.ensure(); self.sfx.click(); fn(e); });
    }

    // lobby
    click('tileCritter', function () { self.show('screenInfo'); });
    click('btnBuyCoins', function () { /* decorative in the demo */ });
    click('btnLobbyReset', function () {
      self.balance = CFG.startBalance;
      self.renderBalance();
    });

    // info screen
    click('btnInfoPlay', function () { self.startLoading(); });
    click('btnInfoBack', function () { self.show('screenLobby'); });

    // game top bar
    click('btnExit', function () { self.openModal('exitModal'); });
    click('btnHistory', function () { self.openModal('historyModal'); });
    click('btnSettings', function () { self.openModal('settingsModal'); });
    click('btnRules', function () { self.openModal('rulesModal'); });

    // exit confirmation
    click('exitNo', function () { self.closeModal('exitModal'); });
    click('exitYes', function () {
      self.closeModal('exitModal');
      self.show('screenLobby');
      self.renderBalance();
    });

    // bet settings
    click('btnBet', function () { self.openModal('betModal'); });
    click('betDown', function () { self.stepBet(-1); });
    click('betUp', function () { self.stepBet(1); });
    click('betApply', function () { self.closeModal('betModal'); });
    var presets = $('betPresets');
    CFG.bet.steps.forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'preset-btn';
      b.dataset.bet = v;
      b.textContent = self.fmt(v);
      b.addEventListener('click', function () { self.sfx.click(); self.setBet(v); });
      presets.appendChild(b);
    });

    // settings toggles
    document.querySelectorAll('.toggle').forEach(function (t) {
      t.addEventListener('click', function () {
        self.sfx.ensure(); self.sfx.click();
        var key = t.dataset.setting;
        self.settings[key] = !self.settings[key];
        self.applySettings();
      });
    });

    // quick turbo on the game bar
    click('btnTurbo', function () {
      self.settings.turbo = !self.settings.turbo;
      self.applySettings();
    });

    // bonus buy
    click('btnBuy', function () { self.openModal('buyModal'); });
    click('buyConfirm', function () { self.closeModal('buyModal'); self.spin('buy'); });
    click('superBuyConfirm', function () { self.closeModal('buyModal'); self.spin('superbuy'); });

    // spin
    click('btnSpin', function () { self.spin('base'); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!self.busy && !self.modalOpen() && $('screenGame').classList.contains('open')) {
          self.sfx.ensure();
          self.spin('base');
        }
      }
    });

    // generic modal close buttons + backdrop click
    document.querySelectorAll('.modal-close').forEach(function (b) {
      b.addEventListener('click', function () { self.sfx.click(); self.closeModal(b.dataset.close); });
    });
    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
    });
  };

  P.modalOpen = function () { return !!document.querySelector('.modal.open'); };
  P.openModal = function (id) { $(id).classList.add('open'); };
  P.closeModal = function (id) { $(id).classList.remove('open'); };

  /* ---- spin orchestration --------------------------------------------------- */
  P.spin = function (mode) {
    var self = this;
    if (this.busy) return Promise.resolve();
    var cost = this.bet * CFG.betModes[mode].cost;
    if (cost > this.balance + 1e-9) {
      this.message('Insufficient demo balance — reset it from the lobby (↺).');
      return Promise.resolve();
    }
    this.balance -= cost;
    this.renderBalance();
    this.win(0);
    this.message(CFG.betModes[mode].label + ' — good luck!');
    this.setBusy(true);

    return this.onSpin(mode).then(function (totalWin) {
      self.balance += totalWin;
      self.renderBalance();
      self.record(mode, cost, totalWin);
      self.message(totalWin > 0
        ? 'You won ' + self.fmt(totalWin) + '!'
        : 'No win — the critters rest. Spin again!');
      self.setBusy(false);
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
    });
  };

  /* ---- info screen creatures + paytable -------------------------------------- */
  P.buildInfoCreatures = function () {
    var host = $('infoCreatures');
    CFG.creatures.forEach(function (cr) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 44;
      cv.title = cr.name;
      host.appendChild(cv);
      g.SymbolArt.paintInto(cv, cr.id);
    });
  };

  P.buildPaytable = function () {
    function multRange(table) {
      var keys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
      return 'x' + keys[0] + '–x' + keys[keys.length - 1];
    }

    // creature battle table
    var cHost = $('creatureTable');
    CFG.creatures.forEach(function (cr) {
      var row = document.createElement('div');
      row.className = 'pt-row';
      var icon = document.createElement('canvas');
      row.appendChild(icon);
      var tbl = document.createElement('div');
      tbl.className = 'pt-vals';
      tbl.innerHTML = '<b>' + cr.name + ' <span class="muted small">(' + cr.elem + ')</span></b>' +
        '<span>Battle multiplier: <em>' + multRange(cr.mults) + '</em></span>';
      row.appendChild(tbl);
      cHost.appendChild(row);
      g.SymbolArt.paintInto(icon, cr.id);
      icon.style.width = icon.style.height = '48px';
    });

    // symbol pays
    var host = $('paytableGrid');
    function payRow(id, name, tiers, pays) {
      var row = document.createElement('div');
      row.className = 'pt-row';
      var icon = document.createElement('canvas');
      row.appendChild(icon);
      var tbl = document.createElement('div');
      tbl.className = 'pt-vals';
      var html = '<b>' + name + '</b>';
      for (var i = tiers.length - 1; i >= 0; i--) {
        var label = (i === tiers.length - 1) ? tiers[i] + '+' :
          (tiers[i + 1] - tiers[i] > 1 ? tiers[i] + '–' + (tiers[i + 1] - 1) : '' + tiers[i]);
        html += '<span>' + label + ': <em>' + pays[i] + '×</em></span>';
      }
      tbl.innerHTML = html;
      row.appendChild(tbl);
      host.appendChild(row);
      g.SymbolArt.paintInto(icon, id);
      icon.style.width = icon.style.height = '48px';
    }
    CFG.creatures.forEach(function (cr) { payRow(cr.id, cr.name, CFG.creatureTiers, CFG.paytable[cr.id]); });
    CFG.lows.forEach(function (s) { payRow(s.id, s.name, CFG.lowTiers, CFG.paytable[s.id]); });

    // scatter row
    var srow = document.createElement('div');
    srow.className = 'pt-row';
    var sicon = document.createElement('canvas');
    srow.appendChild(sicon);
    var sd = document.createElement('div');
    sd.className = 'pt-vals';
    var shtml = '<b>' + CFG.scatter.name + ' (Scatter)</b>';
    [6, 5, 4, 3].forEach(function (n) {
      shtml += '<span>' + (n === 6 ? '6+' : n) + ': <em>' + CFG.scatterPays[n] + '×</em></span>';
    });
    sd.innerHTML = shtml;
    srow.appendChild(sd);
    host.appendChild(srow);
    g.SymbolArt.paintInto(sicon, 'scatter');
    sicon.style.width = sicon.style.height = '48px';
  };

  g.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
