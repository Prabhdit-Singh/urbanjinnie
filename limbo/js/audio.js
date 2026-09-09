/* =========================================================================
 * APEX LIMBO — Audio (WebAudio synthesis, no audio assets)
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

  // Rising tick while the counter climbs — pitch tracks progress (0..1).
  P.tick = function (progress) {
    var f = 480 + progress * 900;
    this.tone({ type: 'square', freq: f, dur: 0.035, vol: 0.08 });
  };

  P.win = function (payoutX) {
    var base = 523.25 * Math.pow(1.05, Math.min(Math.log2(Math.max(payoutX, 1)) * 3, 16));
    var steps = [1, 1.25, 1.5, 2];
    for (var i = 0; i < steps.length; i++)
      this.tone({ type: 'triangle', freq: base * steps[i], dur: 0.2, vol: 0.22, delay: i * 0.05 });
    if (payoutX >= CFGApexWinFactor()) {
      this.noise({ freq: 2500, slide: 6000, dur: 0.5, vol: 0.1, filter: 'highpass' });
    }
  };

  function CFGApexWinFactor() {
    return (g.GameConfig && g.GameConfig.apexWinFactor) || 5;
  }

  P.bust = function () {
    this.tone({ type: 'sawtooth', freq: 220, slide: 60, dur: 0.28, vol: 0.2 });
    this.noise({ freq: 400, slide: 90, dur: 0.25, vol: 0.15, filter: 'lowpass' });
  };

  P.autoToggle = function (on) {
    this.tone({ type: 'sine', freq: on ? 880 : 440, dur: 0.1, vol: 0.2 });
  };

  g.AudioFx = AudioFx;
})(typeof window !== 'undefined' ? window : globalThis);
