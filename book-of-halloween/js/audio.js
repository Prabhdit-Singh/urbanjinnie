/* =========================================================================
 * BOOK OF HALLOWEEN — WebAudio sound (synthesized, no audio files)
 * ========================================================================= */
(function (g) {
  'use strict';

  var ctx = null, master = null, enabled = true;

  function ensure() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }

  function tone(freq, t0, dur, type, vol, glideTo) {
    var o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, hp) {
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    var gn = ctx.createGain(); gn.gain.value = vol || 0.2;
    src.connect(f); f.connect(gn); gn.connect(master);
    src.start(t0);
  }

  var Audio = {
    setEnabled: function (v) { enabled = v; if (v) ensure(); },
    isEnabled: function () { return enabled; },
    resume: function () { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },

    spin: function () {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      tone(180, t, 0.18, 'sawtooth', 0.12, 90);
      noise(t, 0.2, 0.06, 1200);
    },
    reelStop: function (i) {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      tone(120 + i * 18, t, 0.1, 'square', 0.14, 70);
      noise(t, 0.05, 0.05, 600);
    },
    win: function (mag) {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      var notes = [392, 523, 659, 784];
      var n = Math.min(4, 1 + Math.floor(mag));
      for (var i = 0; i < n; i++) tone(notes[i], t + i * 0.09, 0.22, 'triangle', 0.22);
    },
    book: function () {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      tone(220, t, 0.5, 'sine', 0.25, 660);
      noise(t + 0.02, 0.4, 0.05, 400);
    },
    freeSpins: function () {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      var seq = [262, 330, 392, 523, 660, 784];
      for (var i = 0; i < seq.length; i++) tone(seq[i], t + i * 0.12, 0.4, 'triangle', 0.24);
      tone(131, t, 1.0, 'sawtooth', 0.1, 196);
    },
    bigWin: function () {
      if (!enabled) return; ensure(); if (!ctx) return;
      var t = ctx.currentTime;
      var seq = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < seq.length; i++) tone(seq[i], t + i * 0.1, 0.5, 'sawtooth', 0.2);
    }
  };

  g.BOH_Audio = Audio;
})(typeof window !== 'undefined' ? window : globalThis);
