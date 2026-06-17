/* =========================================================================
 * MEDBOT INVASION 1000 — UI layer
 *
 * Casino-shell controls: demo wallet, bet panel (manual/auto), Bonus Buy
 * menu + confirm purchase, settings, game history, paytable. Talks to
 * main.js through callbacks; never touches game math.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  function $(id) { return document.getElementById(id); }

  function UI(opts) {
    this.onSpin = opts.onSpin;      // function(mode) -> Promise<totalWin currency>
    this.sfx = opts.sfx;
    this.screens = opts.screens;

    this.balance = parseFloat(localStorage.getItem('medbot_balance'));
    if (!(this.balance > 0)) this.balance = CFG.startBalance;
    this.bet = CFG.bet.default;
    this.turbo = false;
    this.quick = false;
    this.sound = true;
    this.busy = false;
    this.auto = { active: false, remaining: 0 };
    this.autoCount = 25;
    this.history = [];

    this.bind();
    this.renderBalance();
    this.renderBet();
    this.buildPaytable();
    this.buildFeatureCards();
  }

  var P = UI.prototype;

  P.fmt = function (v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  P.renderBalance = function () {
    $('balance').textContent = this.fmt(this.balance);
    localStorage.setItem('medbot_balance', String(this.balance));
  };

  P.renderBet = function () {
    $('betInput').value = this.bet.toFixed(2);
    $('betCost').textContent = this.fmt(this.bet);
    document.querySelectorAll('[data-cost]').forEach(function (el) {
      var mode = el.dataset.cost;
      el.textContent = '$' + (UI._inst.bet * CFG.betModes[mode].cost)
        .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  };

  P.setBet = function (v) {
    v = Math.min(CFG.bet.max, Math.max(CFG.bet.min, v));
    this.bet = Math.round(v * 100) / 100;
    this.renderBet();
  };

  P.stepBet = function (dir) {
    var steps = CFG.bet.steps, i;
    if (dir > 0) { for (i = 0; i < steps.length; i++) if (steps[i] > this.bet + 1e-9) { this.setBet(steps[i]); return; } this.setBet(CFG.bet.max); }
    else { for (i = steps.length - 1; i >= 0; i--) if (steps[i] < this.bet - 1e-9) { this.setBet(steps[i]); return; } this.setBet(CFG.bet.min); }
  };

  P.setBusy = function (b) {
    this.busy = b;
    $('btnSpin').disabled = b && !this.auto.active;
    $('btnBuy').disabled = b;
    $('betInput').disabled = b;
    document.body.classList.toggle('busy', b);
  };

  P.win = function (amount) {
    $('lastWin').textContent = amount > 0 ? this.fmt(amount) : '—';
  };

  P.message = function (text) { $('statusLine').textContent = text; };

  /* ---- wiring ---- */
  P.bind = function () {
    var self = this; UI._inst = this;
    function click(id, fn) {
      var el = $(id); if (!el) return;
      el.addEventListener('click', function (e) { self.sfx.ensure(); self.sfx.click(); fn(e); });
    }

    click('tabManual', function () { self.setTab(false); });
    click('tabAuto', function () { self.setTab(true); });

    click('betDown', function () { self.stepBet(-1); });
    click('betUp', function () { self.stepBet(1); });
    click('betMin', function () { self.setBet(CFG.bet.min); });
    click('betHalf', function () { self.setBet(self.bet / 2); });
    click('betDouble', function () { self.setBet(self.bet * 2); });
    click('betMax', function () { self.setBet(CFG.bet.max); });
    $('betInput').addEventListener('change', function () {
      var v = parseFloat($('betInput').value);
      self.setBet(isNaN(v) ? CFG.bet.default : v);
    });

    click('btnSpin', function () { self.spin('base'); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!self.busy && !self.screens.anyOverlayOpen() && self.screens.current === 'game') {
          self.sfx.ensure(); self.spin('base');
        }
      }
    });

    // autoplay
    document.querySelectorAll('[data-auto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('[data-auto]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.autoCount = btn.dataset.auto === 'inf' ? Infinity : parseInt(btn.dataset.auto, 10);
      });
    });
    click('btnAutoStart', function () {
      if (self.auto.active) { self.stopAuto(); return; }
      self.auto.active = true; self.auto.remaining = self.autoCount;
      $('btnAutoStart').textContent = 'STOP AUTOPLAY';
      $('btnAutoStart').classList.add('stop');
      self.autoLoop();
    });

    // bonus buy
    click('btnBuy', function () { self.screens.openOverlay('buyMenu'); });
    document.querySelectorAll('[data-buy]').forEach(function (b) {
      b.addEventListener('click', function () { self.sfx.click(); self.openConfirm(b.dataset.buy); });
    });
    click('confirmNo', function () { self.screens.closeOverlay('buyConfirm'); });
    click('confirmYes', function () {
      self.screens.closeOverlay('buyConfirm');
      self.spin(self.pendingBuy);
    });

    // settings / history / info / exit
    click('btnSettings', function () { self.screens.openOverlay('settingsModal'); });
    click('btnHistory', function () { self.renderHistory(); self.screens.openOverlay('historyModal'); });
    click('btnInfo', function () { self.screens.openOverlay('infoModal'); });
    click('lobbyInfo', function () { self.screens.openOverlay('infoModal'); });
    click('lobbyPaytable', function () { self.screens.openOverlay('infoModal'); });
    click('btnExit', function () { self.screens.openOverlay('exitModal'); });
    click('exitNo', function () { self.screens.closeOverlay('exitModal'); });
    click('exitYes', function () { self.screens.closeOverlay('exitModal'); self.screens.openOverlay('thanksModal'); });
    click('thanksBack', function () { self.screens.closeOverlay('thanksModal'); self.screens.show('lobby'); });

    // settings toggles
    document.querySelectorAll('[data-set]').forEach(function (t) {
      t.addEventListener('click', function () {
        t.classList.toggle('on');
        var on = t.classList.contains('on'), key = t.dataset.set;
        self.sfx.click();
        if (key === 'sound') { self.sound = on; self.sfx.setEnabled(on); self.syncSoundBtn(); }
        if (key === 'turbo') { self.turbo = on; $('btnTurbo').classList.toggle('on', on); }
        if (key === 'quick') { self.quick = on; }
      });
    });

    // panel icons
    click('btnTurbo', function () {
      self.turbo = !self.turbo;
      $('btnTurbo').classList.toggle('on', self.turbo);
      var t = document.querySelector('[data-set="turbo"]'); if (t) t.classList.toggle('on', self.turbo);
    });
    click('btnSound', function () {
      self.sound = !self.sound; self.sfx.setEnabled(self.sound); self.syncSoundBtn();
      var t = document.querySelector('[data-set="sound"]'); if (t) t.classList.toggle('on', self.sound);
    });
    click('btnReset', function () {
      self.balance = CFG.startBalance; self.renderBalance(); self.message('Demo balance reset.');
    });
  };

  P.syncSoundBtn = function () {
    $('btnSound').classList.toggle('on', !this.sound);
    $('btnSound').textContent = this.sound ? '🔊' : '🔇';
  };

  P.setTab = function (auto) {
    $('tabManual').classList.toggle('active', !auto);
    $('tabAuto').classList.toggle('active', auto);
    $('manualPane').style.display = auto ? 'none' : '';
    $('autoPane').style.display = auto ? '' : 'none';
  };

  /* ---- bonus buy confirm ---- */
  P.openConfirm = function (mode) {
    this.pendingBuy = mode;
    var bm = CFG.betModes[mode];
    var spinsByMode = { buy: 10, scanner: 12, outbreak: 15, virusking: 16 };
    $('confirmTitle').textContent = bm.label.toUpperCase();
    $('confirmSpins').textContent = spinsByMode[mode] + '+ FREE SPINS';
    $('confirmSub').textContent = 'for ' + bm.cost + '× your current bet';
    $('confirmCost').textContent = this.fmt(this.bet * bm.cost);
    this.screens.closeOverlay('buyMenu');
    this.screens.openOverlay('buyConfirm');
  };

  /* ---- spin orchestration ---- */
  P.spin = function (mode) {
    var self = this;
    if (this.busy) return Promise.resolve();
    var cost = this.bet * CFG.betModes[mode].cost;
    if (cost > this.balance + 1e-9) {
      this.message('Insufficient demo balance — press ↺ to reset.');
      this.stopAuto();
      return Promise.resolve();
    }
    $('placeBets').classList.add('hide');
    this.balance -= cost;
    this.renderBalance();
    this.win(0);
    this.message(CFG.betModes[mode].label + ' — good luck!');
    this.setBusy(true);

    return this.onSpin(mode).then(function (info) {
      var totalWin = info.win;
      self.balance += totalWin;
      self.renderBalance();
      self.message(totalWin > 0 ? 'You won ' + self.fmt(totalWin) + '!' : 'No win — spin again!');
      self.addHistory(cost, totalWin, info.feature);
      self.setBusy(false);
    }).catch(function (err) { console.error(err); self.setBusy(false); });
  };

  P.autoLoop = function () {
    var self = this;
    if (!this.auto.active || this.auto.remaining <= 0) { this.stopAuto(); return; }
    this.auto.remaining--;
    $('btnAutoStart').textContent = 'STOP (' + (this.auto.remaining === Infinity ? '∞' : this.auto.remaining) + ')';
    this.spin('base').then(function () {
      if (self.auto.active) setTimeout(function () { self.autoLoop(); }, 420);
    });
  };

  P.stopAuto = function () {
    this.auto.active = false;
    $('btnAutoStart').textContent = 'START AUTOPLAY';
    $('btnAutoStart').classList.remove('stop');
  };

  /* ---- game history (screen 24) ---- */
  P.addHistory = function (cost, win, feature) {
    var now = new Date();
    var t = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.history.unshift({ time: t, bet: cost, win: win, feature: feature || 'Base Game' });
    if (this.history.length > 30) this.history.pop();
  };

  P.renderHistory = function () {
    var body = $('histBody');
    if (!this.history.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted center">No rounds yet — spin to play.</td></tr>';
      return;
    }
    var self = this, html = '';
    this.history.forEach(function (h) {
      html += '<tr><td>' + h.time + '</td><td>' + self.fmt(h.bet) + '</td>' +
        '<td class="win">' + (h.win > 0 ? self.fmt(h.win) : '—') + '</td><td>' + h.feature + '</td></tr>';
    });
    body.innerHTML = html;
  };

  /* ---- paytable (info modal) ---- */
  P.buildPaytable = function () {
    var host = $('paytableGrid'); if (!host) return;
    var tiers = CFG.payTiers;
    function row(id, name, pays, isSpecial) {
      var r = document.createElement('div'); r.className = 'pt-row';
      var icon = document.createElement('canvas'); icon.width = icon.height = 52;
      icon.getContext('2d').drawImage(g.SymbolArt.sprite(id, 52, id === 'orb' ? 5 : undefined), 0, 0, 52, 52);
      r.appendChild(icon);
      var v = document.createElement('div'); v.className = 'pt-vals';
      var html = '<b>' + name + '</b>';
      if (isSpecial) { html += '<span>' + pays + '</span>'; }
      else {
        for (var i = tiers.length - 1; i >= 0; i--) {
          var label = (i === tiers.length - 1) ? tiers[i] + '+' : tiers[i] + '–' + (tiers[i + 1] - 1);
          html += '<span>' + label + ': <em>' + pays[i] + '×</em></span>';
        }
      }
      v.innerHTML = html; r.appendChild(v); host.appendChild(r);
    }
    CFG.symbols.forEach(function (s) { row(s.id, s.name, CFG.paytable[s.id]); });
    var sp = CFG.scatterPays;
    row('scatter', CFG.scatter.name + ' (Scatter)',
      Object.keys(sp).map(function (k) { return k + ': ' + sp[k] + '×'; }).join(' · '), true);
    row('wild', CFG.wild.name, 'Substitutes all paying symbols', true);
    row('orb', CFG.orb.name, 'Free spins: adds ×2–×100 to the total multiplier', true);
  };

  P.buildFeatureCards = function () {
    var host = $('featureCards'); if (!host) return;
    var feats = [
      ['Invasion Meter', 'Germ explosions fill it to fire the Scanner Beam'],
      ['Scanner Beam', 'Turns random symbols into Wild Med Kits'],
      ['Serum Multipliers', 'Collect orbs to grow the win multiplier'],
      ['Emergency Lab Spins', 'Free spins with up to ×100 total multiplier']
    ];
    host.innerHTML = feats.map(function (f) {
      return '<div class="feat"><b>' + f[0] + '</b><span>' + f[1] + '</span></div>';
    }).join('');
  };

  g.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
