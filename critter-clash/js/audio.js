/* =========================================================================
 * CRITTER CLASH 1000 — Audio (WebAudio synthesis, no audio assets)
 *
 * Sound effects + a soft ambient music loop, both synthesized. The
 * Settings screen toggles `setEnabled` (sfx) and `setMusic` independently.
 * ========================================================================= */
(function (g) {
  'use strict';

  function AudioFx() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.musicOn = false;
    this.musicTimer = null;
  }

  var P = AudioFx.prototype;

  P.ensure = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.ctx.destination);
    if (this.musicOn) this.startMusic();
  };

  P.setEnabled = function (on) { this.enabled = on; };

  P.setMusic = function (on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  };

  /* ---- ambient music loop: slow synth pad arpeggio ---------------------- */
  P.startMusic = function () {
    if (this.musicTimer || !this.ctx) return;
    var self = this;
    this.musicGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.8);
    var notes = [220, 261.6, 329.6, 392, 329.6, 261.6];   // Am pad
    var step = 0;
    function bar() {
      if (!self.ctx) return;
      var f = notes[step % notes.length];
      step++;
      var t0 = self.ctx.currentTime;
      [f, f * 1.5].forEach(function (freq, i) {
        var osc = self.ctx.createOscillator(), gn = self.ctx.createGain();
        osc.type = i ? 'sine' : 'triangle';
        osc.frequency.value = freq;
        gn.gain.setValueAtTime(0.0001, t0);
        gn.gain.exponentialRampToValueAtTime(i ? 0.4 : 0.9, t0 + 0.5);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
        osc.connect(gn); gn.connect(self.musicGain);
        osc.start(t0); osc.stop(t0 + 2.6);
      });
    }
    bar();
    this.musicTimer = setInterval(bar, 1200);
  };

  P.stopMusic = function () {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  };

  /* ---- synth primitives -------------------------------------------------- */
  P.tone = function (opts) {
    if (!this.enabled || !this.ctx) return;
    var c = this.ctx, t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator(), gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t0 + (opts.dur || 0.15));
    var vol = opts.vol == null ? 0.5 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.15));
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + (opts.dur || 0.15) + 0.05);
  };

  P.noise = function (opts) {
    if (!this.enabled || !this.ctx) return;
    var c = this.ctx, t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.2;
    var buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.slide) filt.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slide), t0 + dur);
    var gain = c.createGain();
    var vol = opts.vol == null ? 0.3 : opts.vol;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start(t0);
  };

  /* ---- game events ------------------------------------------------------ */
  P.click = function () { this.tone({ type: 'triangle', freq: 660, dur: 0.06, vol: 0.25 }); };

  P.spin = function () { this.noise({ freq: 500, slide: 2400, dur: 0.35, vol: 0.2 }); };

  P.land = function (i) {
    this.noise({ freq: 900, slide: 250, dur: 0.08, vol: 0.12, delay: i * 0.03 });
  };

  P.winChime = function () {
    var steps = [523.25, 659.25, 783.99];
    for (var i = 0; i < steps.length; i++)
      this.tone({ type: 'triangle', freq: steps[i], dur: 0.18, vol: 0.2, delay: i * 0.05 });
  };

  // battle start: war-drum thump + growl sweep
  P.battleStart = function () {
    this.noise({ freq: 120, slide: 60, dur: 0.3, vol: 0.4, filter: 'lowpass' });
    this.tone({ type: 'sawtooth', freq: 90, slide: 45, dur: 0.35, vol: 0.25 });
    this.tone({ type: 'square', freq: 392, dur: 0.1, vol: 0.12, delay: 0.12 });
  };

  // clash impacts during the fight
  P.clash = function (i) {
    this.noise({ freq: 2600, slide: 700, dur: 0.09, vol: 0.22, delay: (i || 0) * 0.001 });
    this.tone({ type: 'square', freq: 220 + Math.random() * 120, dur: 0.07, vol: 0.14 });
  };

  // battle winner fanfare
  P.victory = function () {
    var seq = [659.25, 783.99, 1046.5];
    for (var i = 0; i < seq.length; i++)
      this.tone({ type: 'triangle', freq: seq[i], dur: 0.2, vol: 0.25, delay: i * 0.07 });
  };

  P.multiplier = function () {
    this.tone({ type: 'sine', freq: 1318, dur: 0.25, vol: 0.25 });
    this.tone({ type: 'sine', freq: 1976, dur: 0.3, vol: 0.18, delay: 0.07 });
  };

  P.scatter = function () {
    var notes = [880, 1108.7, 1318.5];
    for (var i = 0; i < notes.length; i++)
      this.tone({ type: 'sine', freq: notes[i], dur: 0.2, vol: 0.22, delay: i * 0.06 });
  };

  P.bonus = function () {
    var seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    for (var i = 0; i < seq.length; i++) {
      this.tone({ type: 'triangle', freq: seq[i], dur: 0.22, vol: 0.3, delay: i * 0.11 });
      this.tone({ type: 'sine', freq: seq[i] / 2, dur: 0.22, vol: 0.15, delay: i * 0.11 });
    }
  };

  P.bigWin = function () {
    var seq = [659.25, 783.99, 987.77, 1318.5];
    for (var i = 0; i < seq.length; i++)
      this.tone({ type: 'sawtooth', freq: seq[i], dur: 0.3, vol: 0.12, delay: i * 0.09 });
    this.noise({ freq: 3000, slide: 6000, dur: 0.5, vol: 0.08, filter: 'highpass' });
  };

  P.tick = function () { this.tone({ type: 'square', freq: 1500, dur: 0.03, vol: 0.05 }); };

  P.maxWin = function () {
    for (var i = 0; i < 10; i++)
      this.tone({ type: 'triangle', freq: 523.25 * Math.pow(2, (i % 5) / 5), dur: 0.25, vol: 0.2, delay: i * 0.08 });
  };

  g.AudioFx = AudioFx;
})(typeof window !== 'undefined' ? window : globalThis);
