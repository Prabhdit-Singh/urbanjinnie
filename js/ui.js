/* =========================================================================
 * CANDY SURGE 1000 — UI layer
 *
 * Casino-shell controls: demo wallet, bet panel (manual/auto), double
 * chance ante, bonus buy modal, paytable/info modal, turbo & sound.
 * Talks to main.js through callbacks; never touches game math.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;

  function $(id) { return document.getElementById(id); }

  function UI(opts) {
    this.onSpin = opts.onSpin;        // function(mode) -> Promise
    this.sfx = opts.sfx;

    this.balance = parseFloat(localStorage.getItem('cs1000_balance'));
    if (!(this.balance > 0)) this.balance = CFG.startBalance;
    this.bet = CFG.bet.default;
    this.ante = false;
    this.turbo = false;
    this.sound = true;
    this.busy = false;
    this.auto = { active: false, remaining: 0 };

    this.bind();
    this.renderBalance();
    this.renderBet();
    this.buildPaytable();
  }

  var P = UI.prototype;

  P.fmt = function (v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  P.renderBalance = function () {
    $('balance').textContent = this.fmt(this.balance);
    localStorage.setItem('cs1000_balance', String(this.balance));
  };

  P.renderBet = function () {
    $('betInput').value = this.bet.toFixed(2);
    var cost = this.ante ? this.bet * CFG.betModes.ante.cost : this.bet;
    $('betCost').textContent = this.fmt(cost);
    $('buyCost').textContent = this.fmt(this.bet * CFG.betModes.buy.cost);
    $('superBuyCost').textContent = this.fmt(this.bet * CFG.betModes.superbuy.cost);
  };

  P.setBet = function (v) {
    v = Math.min(CFG.bet.max, Math.max(CFG.bet.min, v));
    this.bet = Math.round(v * 100) / 100;
    this.renderBet();
  };

  P.setBusy = function (b) {
    this.busy = b;
    $('btnSpin').disabled = b && !this.auto.active;
    $('btnBuy').disabled = b || this.ante;
    $('betInput').disabled = b;
    $('betHalf').disabled = b;
    $('betDouble').disabled = b;
    $('betMin').disabled = b;
    $('betMax').disabled = b;
    document.body.classList.toggle('busy', b);
  };

  P.win = function (amount) {
    $('lastWin').textContent = amount > 0 ? this.fmt(amount) : '—';
  };

  P.message = function (text) { $('statusLine').textContent = text; };

  /* ---- wiring ------------------------------------------------------------ */
  P.bind = function () {
    var self = this;

    function click(id, fn) {
      $(id).addEventListener('click', function (e) { self.sfx.ensure(); self.sfx.click(); fn(e); });
    }

    // tabs
    click('tabManual', function () { self.setTab(false); });
    click('tabAuto', function () { self.setTab(true); });

    // bet controls
    click('betHalf', function () { self.setBet(self.bet / 2); });
    click('betDouble', function () { self.setBet(self.bet * 2); });
    click('betMin', function () { self.setBet(CFG.bet.min); });
    click('betMax', function () { self.setBet(CFG.bet.max); });
    $('betInput').addEventListener('change', function () {
      var v = parseFloat($('betInput').value);
      self.setBet(isNaN(v) ? CFG.bet.default : v);
    });

    // ante toggle
    click('anteToggle', function () {
      self.ante = !self.ante;
      $('anteToggle').classList.toggle('on', self.ante);
      $('btnBuy').disabled = self.ante || self.busy;
      self.renderBet();
      self.message(self.ante
        ? 'Double Chance on: bet ×1.31, free spins chance doubled.'
        : 'Place your bet.');
    });

    // spin
    click('btnSpin', function () { self.spin(self.ante ? 'ante' : 'base'); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!self.busy && !self.auto.active && !self.modalOpen()) {
          self.sfx.ensure();
          self.spin(self.ante ? 'ante' : 'base');
        }
      }
    });

    // autoplay
    var autoButtons = document.querySelectorAll('[data-auto]');
    autoButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        autoButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.autoCount = btn.dataset.auto === 'inf' ? Infinity : parseInt(btn.dataset.auto, 10);
      });
    });
    this.autoCount = 10;
    click('btnAutoStart', function () {
      if (self.auto.active) { self.stopAuto(); return; }
      self.auto.active = true;
      self.auto.remaining = self.autoCount;
      $('btnAutoStart').textContent = 'Stop Autoplay';
      $('btnAutoStart').classList.add('stop');
      self.autoLoop();
    });

    // bonus buy modal
    click('btnBuy', function () { self.openModal('buyModal'); });
    click('buyClose', function () { self.closeModal('buyModal'); });
    click('buyConfirm', function () { self.closeModal('buyModal'); self.spin('buy'); });
    click('superBuyConfirm', function () { self.closeModal('buyModal'); self.spin('superbuy'); });

    // info modal
    click('btnInfo', function () { self.openModal('infoModal'); });
    click('infoClose', function () { self.closeModal('infoModal'); });

    // turbo & sound
    click('btnTurbo', function () {
      self.turbo = !self.turbo;
      $('btnTurbo').classList.toggle('on', self.turbo);
    });
    click('btnSound', function () {
      self.sound = !self.sound;
      self.sfx.setEnabled(self.sound);
      $('btnSound').classList.toggle('on', !self.sound);
      $('btnSound').textContent = self.sound ? '🔊' : '🔇';
    });

    // demo wallet reset
    click('btnReset', function () {
      self.balance = CFG.startBalance;
      self.renderBalance();
      self.message('Demo balance reset.');
    });

    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
    });
  };

  P.setTab = function (auto) {
    $('tabManual').classList.toggle('active', !auto);
    $('tabAuto').classList.toggle('active', auto);
    $('manualPane').style.display = auto ? 'none' : '';
    $('autoPane').style.display = auto ? '' : 'none';
  };

  P.modalOpen = function () {
    return !!document.querySelector('.modal.open');
  };

  P.openModal = function (id) { $(id).classList.add('open'); };
  P.closeModal = function (id) { $(id).classList.remove('open'); };

  /* ---- spin orchestration -------------------------------------------------- */
  P.spin = function (mode) {
    var self = this;
    if (this.busy) return Promise.resolve();
    var cost = this.bet * CFG.betModes[mode].cost;
    if (cost > this.balance + 1e-9) {
      this.message('Insufficient demo balance — press ↺ to reset.');
      this.stopAuto();
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
      self.message(totalWin > 0
        ? 'You won ' + self.fmt(totalWin) + '!'
        : 'No win — spin again!');
      self.setBusy(false);
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
    });
  };

  P.autoLoop = function () {
    var self = this;
    if (!this.auto.active || this.auto.remaining <= 0) { this.stopAuto(); return; }
    this.auto.remaining--;
    $('btnAutoStart').textContent = 'Stop (' +
      (this.auto.remaining === Infinity ? '∞' : this.auto.remaining) + ')';
    this.spin(this.ante ? 'ante' : 'base').then(function () {
      if (self.auto.active) setTimeout(function () { self.autoLoop(); }, 450);
    });
  };

  P.stopAuto = function () {
    this.auto.active = false;
    $('btnAutoStart').textContent = 'Start Autoplay';
    $('btnAutoStart').classList.remove('stop');
  };

  /* ---- paytable (info modal) ------------------------------------------------ */
  P.buildPaytable = function () {
    var host = $('paytableGrid');
    var tiers = CFG.clusterTiers;
    CFG.symbols.forEach(function (sym) {
      var row = document.createElement('div');
      row.className = 'pt-row';
      var icon = document.createElement('canvas');
      icon.width = icon.height = 56;
      icon.getContext('2d').drawImage(g.SymbolArt.sprite(sym.id, 56), 0, 0, 56, 56);
      row.appendChild(icon);
      var tbl = document.createElement('div');
      tbl.className = 'pt-vals';
      var pays = CFG.paytable[sym.id];
      var html = '<b>' + sym.name + '</b>';
      for (var i = tiers.length - 1; i >= 0; i--) {
        var label = (i === tiers.length - 1) ? tiers[i] + '+' :
          (tiers[i + 1] - tiers[i] > 1 ? tiers[i] + '–' + (tiers[i + 1] - 1) : '' + tiers[i]);
        html += '<span>' + label + ': <em>' + pays[i] + '×</em></span>';
      }
      tbl.innerHTML = html;
      row.appendChild(tbl);
      host.appendChild(row);
    });
    // scatter row
    var srow = document.createElement('div');
    srow.className = 'pt-row';
    var sicon = document.createElement('canvas');
    sicon.width = sicon.height = 56;
    sicon.getContext('2d').drawImage(g.SymbolArt.sprite('scatter', 56), 0, 0, 56, 56);
    srow.appendChild(sicon);
    var sd = document.createElement('div');
    sd.className = 'pt-vals';
    var shtml = '<b>' + CFG.scatter.name + ' (Scatter)</b>';
    [7, 6, 5, 4, 3].forEach(function (n) {
      shtml += '<span>' + (n === 7 ? '7+' : n) + ': <em>' + CFG.scatterPays[n] + '×</em></span>';
    });
    sd.innerHTML = shtml;
    srow.appendChild(sd);
    host.appendChild(srow);
  };

  g.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
