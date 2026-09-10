/* =========================================================================
 * APEX LIMBO — UI layer
 *
 * Casino-shell controls: demo wallet, bet panel (manual/auto with bet
 * adjustment + stop conditions), target/chance linkage, provably-fair panel,
 * info modal, turbo & sound. Talks to main.js through callbacks; never
 * touches game math directly (it only reads GameEngine.computeResult for
 * the independent "Verify" tool, which is the whole point of that tool).
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;

  function $(id) { return document.getElementById(id); }

  function UI(opts) {
    this.onBet = opts.onBet;          // function(target, clientSeed) -> Promise<payoutAmount>
    this.onBonus = opts.onBonus;      // function(mode, target, clientSeed, turbo) -> Promise<{payout, summary}>
    this.engine = opts.engine;
    this.sfx = opts.sfx;

    this.balance = parseFloat(localStorage.getItem('apex_limbo_balance'));
    if (!(this.balance > 0)) this.balance = CFG.startBalance;

    this.bet = CFG.bet.default;
    this.target = CFG.target.default;
    this.tripleTarget = CFG.bonusModes.tripleShot.startTarget.default;
    this.turbo = false;
    this.sound = true;
    this.busy = false;

    this.clientSeed = localStorage.getItem('apex_limbo_clientseed') || this.engine.suggestClientSeed();
    localStorage.setItem('apex_limbo_clientseed', this.clientSeed);

    this.auto = {
      active: false, remaining: 0, count: CFG.auto.defaultCount,
      onWinMode: 'reset', onWinPct: 0, onLossMode: 'reset', onLossPct: 0,
      stopProfit: 0, stopLoss: 0, baseBet: CFG.bet.default, sessionPL: 0
    };

    this.buildQuickTargets();
    this.buildTripleStartPresets();
    this.bind();
    this.renderBalance();
    this.renderBet();
    this.renderTarget();
    this.renderFairness();
  }

  var P = UI.prototype;

  P.fmt = function (v) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  P.renderBalance = function () {
    $('balance').textContent = this.fmt(this.balance);
    localStorage.setItem('apex_limbo_balance', String(this.balance));
  };

  P.renderBet = function () {
    $('betInput').value = this.bet.toFixed(2);
    this.renderPayout();
  };

  P.setBet = function (v) {
    v = Math.min(CFG.bet.max, Math.max(CFG.bet.min, v));
    this.bet = Math.round(v * 100) / 100;
    this.renderBet();
  };

  P.renderPayout = function () {
    $('payoutOut').textContent = this.fmt(this.bet * this.target);
  };

  P.renderTarget = function () {
    $('targetInput').value = this.target.toFixed(2);
    $('chanceInput').value = CFG.chanceForTarget(this.target).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    this.renderPayout();
    if (this.renderer) this.renderer.setTarget(this.target);
  };

  P.setTarget = function (v) {
    if (isNaN(v)) v = CFG.target.default;
    v = Math.min(CFG.target.max, Math.max(CFG.target.min, v));
    this.target = Math.round(v * 100) / 100;
    this.renderTarget();
  };

  P.setChance = function (pct) {
    if (isNaN(pct) || pct <= 0) pct = CFG.chanceForTarget(CFG.target.default);
    var maxChance = CFG.chanceForTarget(CFG.target.min);
    var minChance = CFG.chanceForTarget(CFG.target.max);
    pct = Math.min(maxChance, Math.max(minChance, pct));
    this.setTarget(CFG.targetForChance(pct));
  };

  P.buildQuickTargets = function () {
    var host = $('quickTargets');
    var self = this;
    CFG.quickTargets.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'mini-btn wide';
      b.textContent = t + '×';
      b.addEventListener('click', function () { self.sfx.click(); self.setTarget(t); });
      host.appendChild(b);
    });
  };

  P.buildTripleStartPresets = function () {
    var host = $('tripleStartPresets');
    var self = this;
    CFG.bonusModes.tripleShot.startPresets.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'mini-btn wide';
      b.textContent = t + '×';
      b.addEventListener('click', function () { self.sfx.click(); self.setTripleTarget(t); });
      host.appendChild(b);
    });
  };

  P.setTripleTarget = function (v) {
    var st = CFG.bonusModes.tripleShot.startTarget;
    if (isNaN(v)) v = st.default;
    v = Math.min(st.max, Math.max(st.min, v));
    this.tripleTarget = Math.round(v * 100) / 100;
    $('tripleStartInput').value = this.tripleTarget.toFixed(2);
    this.renderBonusModal();
  };

  P.setBusy = function (b) {
    this.busy = b;
    $('btnBet').disabled = b && !this.auto.active;
    $('betInput').disabled = b;
    $('targetInput').disabled = b;
    $('chanceInput').disabled = b;
    $('btnBonus').disabled = b;
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

    click('tabManual', function () { self.setTab(false); });
    click('tabAuto', function () { self.setTab(true); });

    click('betHalf', function () { self.setBet(self.bet / 2); });
    click('betDouble', function () { self.setBet(self.bet * 2); });
    click('betMin', function () { self.setBet(CFG.bet.min); });
    click('betMax', function () { self.setBet(CFG.bet.max); });
    $('betInput').addEventListener('change', function () {
      self.setBet(parseFloat($('betInput').value));
    });

    $('targetInput').addEventListener('change', function () {
      self.setTarget(parseFloat($('targetInput').value));
    });
    $('chanceInput').addEventListener('change', function () {
      self.setChance(parseFloat($('chanceInput').value));
    });

    click('btnBet', function () { self.bet_(); });
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (!self.busy && !self.modalOpen() && !self.auto.active) {
          self.sfx.ensure();
          self.bet_();
        }
      }
    });

    // autoplay bet count
    var autoButtons = document.querySelectorAll('[data-auto]');
    autoButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        autoButtons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.auto.count = btn.dataset.auto === 'inf' ? Infinity : parseInt(btn.dataset.auto, 10);
      });
    });

    // on win / on loss segmented controls
    function bindSeg(attr, modeKey, pctInputId) {
      var buttons = document.querySelectorAll('[data-' + attr + ']');
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          buttons.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          self.auto[modeKey] = btn.dataset[attr];
          $(pctInputId).disabled = btn.dataset[attr] !== 'increase';
        });
      });
      $(pctInputId).addEventListener('change', function () {
        var v = Math.max(0, Math.min(CFG.auto.maxAdjustPct, parseFloat(this.value) || 0));
        this.value = v;
      });
    }
    bindSeg('onwin', 'onWinMode', 'onWinPct');
    bindSeg('onloss', 'onLossMode', 'onLossPct');

    click('btnAutoStart', function () {
      if (self.auto.active) { self.stopAuto('Stopped.'); return; }
      self.startAuto();
    });

    // bonus buy modal
    click('btnBonus', function () { self.renderBonusModal(); self.openModal('bonusModal'); });
    click('bonusClose', function () { self.closeModal('bonusModal'); });
    $('tripleStartInput').addEventListener('change', function () {
      self.setTripleTarget(parseFloat($('tripleStartInput').value));
    });
    click('rushConfirm', function () { self.closeModal('bonusModal'); self.bonus_('rush'); });
    click('tripleConfirm', function () { self.closeModal('bonusModal'); self.bonus_('tripleShot'); });
    click('jackpotConfirm', function () { self.closeModal('bonusModal'); self.bonus_('jackpot'); });

    // fairness modal
    click('btnFair', function () { self.renderFairness(); self.openModal('fairModal'); });
    click('fairClose', function () { self.closeModal('fairModal'); });
    click('fairNewClient', function () {
      self.clientSeed = self.engine.suggestClientSeed();
      localStorage.setItem('apex_limbo_clientseed', self.clientSeed);
      self.renderFairness();
    });
    $('fairClientSeed').addEventListener('change', function () {
      self.clientSeed = this.value.trim() || self.engine.suggestClientSeed();
      localStorage.setItem('apex_limbo_clientseed', self.clientSeed);
      self.renderFairness();
    });
    click('fairRotate', function () {
      var revealed = self.engine.rotateServerSeed();
      $('fairRevealed').style.display = '';
      $('fairRevealedSeed').textContent = revealed;
      self.renderFairness();
    });
    click('verifyRun', function () {
      var srv = $('verifyServer').value.trim();
      var cli = $('verifyClient').value.trim();
      var nonce = parseInt($('verifyNonce').value, 10) || 0;
      if (!srv) { self.message('Paste a revealed server seed to verify.'); return; }
      var result = g.GameEngine.computeResult(srv, cli, nonce, CFG.houseEdge, CFG.target.max);
      $('verifyOut').style.display = '';
      $('verifyOut').innerHTML = '<b>Result:</b> ' + result.toFixed(2) + '×';
    });

    // info modal
    click('btnInfo', function () { self.openModal('infoModal'); });
    click('infoClose', function () { self.closeModal('infoModal'); });

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

  P.modalOpen = function () { return !!document.querySelector('.modal.open'); };
  P.openModal = function (id) { $(id).classList.add('open'); };
  P.closeModal = function (id) { $(id).classList.remove('open'); };

  P.renderFairness = function () {
    $('fairServerHash').value = this.engine.serverSeedHash();
    $('fairClientSeed').value = this.clientSeed;
    $('fairNonce').value = String(this.engine.nonce);
  };

  /* ---- bonus buy ------------------------------------------------------------ */
  P.costMultiplierFor = function (mode) {
    if (mode === 'rush') return CFG.rushCost();
    if (mode === 'tripleShot') return CFG.tripleShotCost();
    if (mode === 'jackpot') return CFG.bonusModes.jackpot.costMultiplier;
    return 0;
  };

  P.renderBonusModal = function () {
    var jackpot = CFG.bonusModes.jackpot;

    $('rushDesc').textContent = CFG.bonusModes.rush.shots + ' rapid-fire shots at your Target Multiplier (' +
      this.target.toFixed(2) + '×).';
    $('rushCost').textContent = this.fmt(this.costMultiplierFor('rush') * this.bet);

    $('tripleStartInput').value = this.tripleTarget.toFixed(2);
    var gates = CFG.tripleShotGates(this.tripleTarget);
    $('tripleDesc').textContent = 'Gates: ' + gates.map(function (g) { return g + '×'; }).join(' / ') +
      '  ·  max total ' + (gates[0] + gates[1] + gates[2]) + '×';
    $('tripleCost').textContent = this.fmt(this.costMultiplierFor('tripleShot') * this.bet);

    $('jackpotDesc').textContent = 'MIN WIN ' + jackpot.minWin + '× · MAX WIN ' +
      jackpot.maxWin.toLocaleString() + '× — one draw, no wheel.';
    $('jackpotCost').textContent = this.fmt(this.costMultiplierFor('jackpot') * this.bet);
  };

  P.bonus_ = function (mode) {
    var self = this;
    if (this.busy) return Promise.resolve(false);
    var cost = this.costMultiplierFor(mode) * this.bet;
    if (cost > this.balance + 1e-9) {
      this.message('Insufficient demo balance for this bonus — press ↺ to reset.');
      return Promise.resolve(false);
    }
    this.balance -= cost;
    this.renderBalance();
    this.win(0);
    this.message(CFG.bonusModes[mode].label + ' — good luck!');
    this.setBusy(true);

    var modeTarget = mode === 'tripleShot' ? this.tripleTarget : this.target;
    return this.onBonus(mode, modeTarget, this.clientSeed, this.turbo).then(function (result) {
      self.balance += result.payout;
      self.renderBalance();
      self.renderFairness();
      self.win(result.payout);
      self.message(result.summary);
      self.setBusy(false);
      return { win: result.payout > 0, profit: result.payout - cost };
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
      return { win: false, profit: -cost };
    });
  };

  /* ---- bet orchestration -------------------------------------------------- */
  P.bet_ = function () {
    var self = this;
    if (this.busy) return Promise.resolve(false);
    if (this.bet > this.balance + 1e-9) {
      this.message('Insufficient demo balance — press ↺ to reset.');
      this.stopAuto();
      return Promise.resolve(false);
    }
    this.balance -= this.bet;
    this.renderBalance();
    this.win(0);
    this.message('Rolling…');
    this.setBusy(true);

    var stake = this.bet;
    return this.onBet(this.target, this.clientSeed, this.turbo).then(function (result) {
      self.balance += result.payout;
      self.renderBalance();
      self.renderFairness();
      self.message(result.win
        ? 'Rolled ' + result.result.toFixed(2) + '× — you won ' + self.fmt(result.payout) + '!'
        : 'Rolled ' + result.result.toFixed(2) + '× — bust, try again.');
      self.setBusy(false);
      return { win: result.win, profit: result.payout - stake };
    }).catch(function (err) {
      console.error(err);
      self.setBusy(false);
      return { win: false, profit: -stake };
    });
  };

  /* ---- autoplay ------------------------------------------------------------ */
  P.startAuto = function () {
    this.auto.active = true;
    this.auto.remaining = this.auto.count;
    this.auto.baseBet = this.bet;
    this.auto.sessionPL = 0;
    $('btnAutoStart').textContent = 'Stop Autoplay';
    $('btnAutoStart').classList.add('stop');
    this.sfx.autoToggle(true);
    this.autoLoop();
  };

  P.stopAuto = function (msg) {
    this.auto.active = false;
    $('btnAutoStart').textContent = 'Start Autoplay';
    $('btnAutoStart').classList.remove('stop');
    this.sfx.autoToggle(false);
    if (msg) this.message(msg);
  };

  P.autoLoop = function () {
    var self = this;
    if (!this.auto.active || this.auto.remaining <= 0) {
      this.stopAuto(this.auto.active ? 'Autoplay complete.' : undefined);
      return;
    }
    this.auto.remaining--;
    $('btnAutoStart').textContent = 'Stop (' +
      (this.auto.remaining === Infinity ? '∞' : this.auto.remaining) + ')';

    this.bet_().then(function (outcome) {
      if (!outcome || !self.auto.active) return;
      self.auto.sessionPL += outcome.profit;

      var mode = outcome.win ? self.auto.onWinMode : self.auto.onLossMode;
      var pct = outcome.win ? parseFloat($('onWinPct').value) || 0 : parseFloat($('onLossPct').value) || 0;
      self.setBet(mode === 'increase' ? self.bet * (1 + pct / 100) : self.auto.baseBet);

      var stopProfit = parseFloat($('stopProfit').value) || 0;
      var stopLoss = parseFloat($('stopLoss').value) || 0;
      if (stopProfit > 0 && self.auto.sessionPL >= stopProfit) {
        self.stopAuto('Autoplay stopped — profit target reached (' + self.fmt(self.auto.sessionPL) + ').');
        return;
      }
      if (stopLoss > 0 && -self.auto.sessionPL >= stopLoss) {
        self.stopAuto('Autoplay stopped — loss limit reached (' + self.fmt(-self.auto.sessionPL) + ').');
        return;
      }
      if (self.auto.active) {
        setTimeout(function () { self.autoLoop(); }, self.turbo ? CFG.auto.delayMs * 0.4 : CFG.auto.delayMs);
      }
    });
  };

  g.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
