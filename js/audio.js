/* =========================================================================
 * MEDBOT INVASION 1000 — Audio (WebAudio synthesis, no audio assets)
 * ========================================================================= */
(function (g) {
  'use strict';

  function AudioFx() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
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
  };

  P.setEnabled = function (on) { this.enabled = on; };

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

  P.pop = function (chain) {
    var f = 300 * Math.pow(1.13, Math.min(chain, 12));
    this.tone({ type: 'square', freq: f, slide: f * 1.6, dur: 0.1, vol: 0.18 });
    this.tone({ type: 'sine', freq: f * 2, dur: 0.12, vol: 0.12, delay: 0.02 });
    this.noise({ freq: 2500, slide: 800, dur: 0.1, vol: 0.1 });
  };

  P.winChime = function (level) {
    var base = 523.25 * Math.pow(1.06, Math.min(level || 0, 8));
    var steps = [1, 1.25, 1.5];
    for (var i = 0; i < steps.length; i++)
      this.tone({ type: 'triangle', freq: base * steps[i], dur: 0.18, vol: 0.2, delay: i * 0.05 });
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

  P.scanner = function () {
    this.noise({ freq: 400, slide: 5000, dur: 0.5, vol: 0.16, filter: 'bandpass' });
    this.tone({ type: 'sawtooth', freq: 220, slide: 1800, dur: 0.5, vol: 0.12 });
    this.tone({ type: 'sine', freq: 1800, slide: 600, dur: 0.4, vol: 0.1, delay: 0.1 });
  };

  P.maxWin = function () {
    for (var i = 0; i < 10; i++)
      this.tone({ type: 'triangle', freq: 523.25 * Math.pow(2, (i % 5) / 5), dur: 0.25, vol: 0.2, delay: i * 0.08 });
  };

  g.AudioFx = AudioFx;
})(typeof window !== 'undefined' ? window : globalThis);
