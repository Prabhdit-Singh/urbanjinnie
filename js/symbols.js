/* =========================================================================
 * MEDBOT INVASION 1000 — Procedural symbol art
 *
 * Every symbol is drawn in code on canvas (NO external image / SVG assets):
 * the lab characters, premium items, neon card values and the special
 * symbols from the master sheet. Sprites are cached per (id, size) for fast
 * blitting from the renderer.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var cache = {};

  /* ---- EXACT SYMBOL ARTWORK (drop-in PNGs) -----------------------------
   * Place the individual symbol PNGs from the MedBot package in
   * `assets/symbols/` using the filenames below. When a file is present it is
   * used VERBATIM (your exact artwork). If it is missing, the procedural
   * painter below is used as a fallback so the game still runs. No SVG.
   * ------------------------------------------------------------------ */
  var ASSET_DIR = 'assets/symbols/';
  var ASSET_FILES = {
    dr_nova: 'dr_nova.png', nurse_bot: 'nurse_bot.png', virus_king: 'virus_king.png',
    germ_blob: 'germ_blob.png', med_drone: 'med_drone.png',
    serum_vial: 'serum_vial.png', bio_capsule: 'bio_capsule.png', lab_crystal: 'lab_crystal.png',
    ace: 'ace.png', king: 'king.png', queen: 'queen.png', jack: 'jack.png', ten: 'ten.png',
    wild: 'wild_med_kit.png', scatter: 'lab_portal.png', orb: 'serum_multiplier_orb.png'
  };
  var ASSETS = {};   // id -> HTMLImageElement (only set once loaded successfully)

  function loadAssets() {
    if (typeof Image === 'undefined') return;
    Object.keys(ASSET_FILES).forEach(function (id) {
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth > 0) { ASSETS[id] = img; cache = {}; /* re-bake sprites */ }
      };
      img.onerror = function () { /* keep procedural fallback */ };
      img.src = ASSET_DIR + ASSET_FILES[id];
    });
  }

  function drawContain(ctx, img, size) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var scale = Math.min(size / iw, size / ih);
    var w = iw * scale, h = ih * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  }

  // The multiplier value is dynamic, so it is overlaid on the orb artwork.
  function overlayOrbValue(ctx, s, value) {
    var label = 'x' + value;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + s * (label.length > 3 ? 0.2 : 0.26) + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#5a18a0'; ctx.shadowBlur = s * 0.08;
    ctx.lineWidth = s * 0.03; ctx.strokeStyle = '#3a0a6a';
    ctx.strokeText(label, s / 2, s / 2 + s * 0.01);
    ctx.fillText(label, s / 2, s / 2 + s * 0.01);
    ctx.restore();
  }

  function colorOf(id) {
    var s = CFG.symbolById(id);
    return s || { color: '#9ad7ff', color2: '#3a7bd5', name: '' };
  }

  /* ---- low-level helpers ----------------------------------------------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, ((n >> 16) & 255) + 255 * amt) | 0;
    var gg = Math.min(255, ((n >> 8) & 255) + 255 * amt) | 0;
    var b = Math.min(255, (n & 255) + 255 * amt) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function darken(hex, amt) { return lighten(hex, -amt); }

  function radial(ctx, cx, cy, r, c1, c2) {
    var grd = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r * 1.25);
    grd.addColorStop(0, lighten(c1, 0.4));
    grd.addColorStop(0.5, c1);
    grd.addColorStop(1, c2);
    return grd;
  }

  function gloss(ctx, cx, cy, rx, ry) {
    var grd = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    grd.addColorStop(0, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function plate(ctx, s, c1, c2) {
    // rounded tile backplate used by all symbols for a consistent HD frame
    var pad = s * 0.06;
    var grd = ctx.createLinearGradient(0, pad, 0, s - pad);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    rr(ctx, pad, pad, s - pad * 2, s - pad * 2, s * 0.16);
    ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = s * 0.015;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
  }

  function rimGlow(ctx, s, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.12;
    ctx.lineWidth = s * 0.02;
    ctx.strokeStyle = color;
    rr(ctx, s * 0.07, s * 0.07, s - s * 0.14, s - s * 0.14, s * 0.15);
    ctx.stroke();
    ctx.restore();
  }

  function blobPath(ctx, cx, cy, r, wob, seedf) {
    ctx.beginPath();
    var n = 12;
    for (var i = 0; i <= n; i++) {
      var a = (Math.PI * 2 * i) / n;
      var rr2 = r * (1 + wob * Math.sin(a * 3 + seedf) * 0.5 + wob * Math.cos(a * 5 + seedf) * 0.3);
      var x = cx + Math.cos(a) * rr2, y = cy + Math.sin(a) * rr2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function eye(ctx, x, y, r, look) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16202e';
    ctx.beginPath(); ctx.arc(x + (look || 0) * r * 0.3, y + r * 0.1, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  /* ---- per-symbol painters --------------------------------------------- */
  var painters = {

    /* ===== HIGH PAY CHARACTERS ===== */
    dr_nova: function (ctx, s, col) {
      plate(ctx, s, '#16243f', '#0a1426');
      var cx = s / 2;
      // shoulders / lab coat
      var coat = ctx.createLinearGradient(0, s * 0.6, 0, s);
      coat.addColorStop(0, '#eaf3ff'); coat.addColorStop(1, '#b9cbe0');
      ctx.fillStyle = coat;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.96);
      ctx.quadraticCurveTo(s * 0.22, s * 0.66, s * 0.5, s * 0.62);
      ctx.quadraticCurveTo(s * 0.78, s * 0.66, s * 0.8, s * 0.96);
      ctx.closePath(); ctx.fill();
      // collar + green tie
      ctx.fillStyle = '#22e36a';
      ctx.beginPath();
      ctx.moveTo(cx, s * 0.64); ctx.lineTo(cx - s * 0.05, s * 0.78);
      ctx.lineTo(cx, s * 0.92); ctx.lineTo(cx + s * 0.05, s * 0.78); ctx.closePath(); ctx.fill();
      // head
      ctx.fillStyle = radial(ctx, cx, s * 0.42, s * 0.2, '#f2c9a0', '#c98b5e');
      ctx.beginPath(); ctx.arc(cx, s * 0.42, s * 0.19, 0, Math.PI * 2); ctx.fill();
      // spiky silver hair
      ctx.fillStyle = '#e7ecf5';
      for (var i = -3; i <= 3; i++) {
        ctx.beginPath();
        var hx = cx + i * s * 0.05;
        ctx.moveTo(hx - s * 0.04, s * 0.3);
        ctx.lineTo(hx, s * 0.16 - Math.abs(i) * s * 0.006);
        ctx.lineTo(hx + s * 0.04, s * 0.3);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(cx, s * 0.31, s * 0.2, s * 0.09, 0, Math.PI, 0); ctx.fill();
      // cyan visor glasses
      ctx.save();
      ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.1;
      ctx.fillStyle = col.color;
      rr(ctx, cx - s * 0.16, s * 0.38, s * 0.32, s * 0.09, s * 0.04);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      rr(ctx, cx - s * 0.13, s * 0.4, s * 0.08, s * 0.02, s * 0.01); ctx.fill();
      // smile
      ctx.strokeStyle = '#8a4b2f'; ctx.lineWidth = s * 0.015;
      ctx.beginPath(); ctx.arc(cx, s * 0.5, s * 0.06, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      rimGlow(ctx, s, col.color);
    },

    nurse_bot: function (ctx, s, col) {
      plate(ctx, s, '#2a1622', '#150a12');
      var cx = s / 2;
      // body
      ctx.fillStyle = radial(ctx, cx, s * 0.72, s * 0.22, '#ffffff', '#c8d4e2');
      rr(ctx, cx - s * 0.2, s * 0.58, s * 0.4, s * 0.34, s * 0.1); ctx.fill();
      // red cross on chest
      ctx.fillStyle = '#ff3b5c';
      rr(ctx, cx - s * 0.04, s * 0.64, s * 0.08, s * 0.2, s * 0.01); ctx.fill();
      rr(ctx, cx - s * 0.1, s * 0.7, s * 0.2, s * 0.08, s * 0.01); ctx.fill();
      // head (rounded)
      ctx.fillStyle = radial(ctx, cx, s * 0.36, s * 0.2, '#ffffff', '#cdd9e8');
      rr(ctx, cx - s * 0.18, s * 0.22, s * 0.36, s * 0.3, s * 0.13); ctx.fill();
      // nurse cap band
      ctx.fillStyle = '#ff3b5c';
      rr(ctx, cx - s * 0.18, s * 0.22, s * 0.36, s * 0.06, s * 0.03); ctx.fill();
      ctx.fillStyle = '#fff';
      rr(ctx, cx - s * 0.03, s * 0.235, s * 0.06, s * 0.03, s * 0.005); ctx.fill();
      // eyes (glowing)
      ctx.save(); ctx.shadowColor = '#19d3ff'; ctx.shadowBlur = s * 0.08;
      ctx.fillStyle = '#19d3ff';
      ctx.beginPath(); ctx.arc(cx - s * 0.07, s * 0.38, s * 0.035, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.07, s * 0.38, s * 0.035, 0, 7); ctx.fill();
      ctx.restore();
      // smile mouth
      ctx.strokeStyle = '#6a7686'; ctx.lineWidth = s * 0.014;
      ctx.beginPath(); ctx.arc(cx, s * 0.44, s * 0.05, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      rimGlow(ctx, s, '#ff6d86');
    },

    virus_king: function (ctx, s, col) {
      plate(ctx, s, '#241040', '#120724');
      var cx = s / 2, cy = s * 0.55;
      // body blob
      ctx.save();
      ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.12;
      blobPath(ctx, cx, cy, s * 0.26, 0.12, 1.2);
      ctx.fillStyle = radial(ctx, cx, cy, s * 0.3, col.color, col.color2);
      ctx.fill();
      ctx.restore();
      // virus spikes
      ctx.fillStyle = col.color2;
      for (var i = 0; i < 10; i++) {
        var a = (Math.PI * 2 * i) / 10 + 0.3;
        var x1 = cx + Math.cos(a) * s * 0.26, y1 = cy + Math.sin(a) * s * 0.26;
        var x2 = cx + Math.cos(a) * s * 0.34, y2 = cy + Math.sin(a) * s * 0.34;
        ctx.beginPath(); ctx.arc(x2, y2, s * 0.03, 0, 7); ctx.fill();
        ctx.lineWidth = s * 0.02; ctx.strokeStyle = col.color2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      // crown
      ctx.fillStyle = '#ffd24a';
      ctx.beginPath();
      var cw = s * 0.26, cyT = s * 0.26, base = s * 0.34;
      ctx.moveTo(cx - cw / 2, base);
      ctx.lineTo(cx - cw / 2, cyT + s * 0.04);
      ctx.lineTo(cx - cw / 4, cyT + s * 0.08);
      ctx.lineTo(cx, cyT);
      ctx.lineTo(cx + cw / 4, cyT + s * 0.08);
      ctx.lineTo(cx + cw / 2, cyT + s * 0.04);
      ctx.lineTo(cx + cw / 2, base);
      ctx.closePath();
      ctx.save(); ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = s * 0.08; ctx.fill(); ctx.restore();
      ctx.fillStyle = '#ff3b5c';
      ctx.beginPath(); ctx.arc(cx, cyT + s * 0.02, s * 0.02, 0, 7); ctx.fill();
      // angry eyes
      eye(ctx, cx - s * 0.08, cy, s * 0.05, -1);
      eye(ctx, cx + s * 0.08, cy, s * 0.05, -1);
      ctx.strokeStyle = '#2a0d3a'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.13, cy - s * 0.07); ctx.lineTo(cx - s * 0.03, cy - s * 0.03); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.13, cy - s * 0.07); ctx.lineTo(cx + s * 0.03, cy - s * 0.03); ctx.stroke();
      // grin
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.1, s * 0.07, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke();
      rimGlow(ctx, s, col.color);
    },

    germ_blob: function (ctx, s, col) {
      plate(ctx, s, '#10240f', '#06120a');
      var cx = s / 2, cy = s * 0.54;
      ctx.save();
      ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.14;
      blobPath(ctx, cx, cy, s * 0.27, 0.16, 3.1);
      ctx.fillStyle = radial(ctx, cx, cy, s * 0.3, col.color, col.color2);
      ctx.fill();
      ctx.restore();
      // slime drips
      ctx.fillStyle = col.color;
      ctx.beginPath(); ctx.arc(cx - s * 0.14, s * 0.78, s * 0.04, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.16, s * 0.74, s * 0.03, 0, 7); ctx.fill();
      // bumps
      ctx.fillStyle = lighten(col.color, 0.18);
      for (var i = 0; i < 5; i++) {
        var a = i * 1.3;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.12, s * 0.03, 0, 7); ctx.fill();
      }
      // eyes + tongue
      eye(ctx, cx - s * 0.08, cy - s * 0.02, s * 0.055, 0);
      eye(ctx, cx + s * 0.08, cy - s * 0.02, s * 0.055, 0);
      ctx.fillStyle = '#1c3a14';
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.11, s * 0.06, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff5a7a';
      ctx.beginPath(); ctx.arc(cx, cy + s * 0.14, s * 0.025, 0, Math.PI); ctx.fill();
      rimGlow(ctx, s, col.color);
    },

    med_drone: function (ctx, s, col) {
      plate(ctx, s, '#0f1f33', '#08111f');
      var cx = s / 2, cy = s * 0.5;
      // rotors
      ctx.strokeStyle = 'rgba(180,210,255,0.45)'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); ctx.ellipse(cx - s * 0.24, cy - s * 0.12, s * 0.12, s * 0.03, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + s * 0.24, cy - s * 0.12, s * 0.12, s * 0.03, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#7fa8d8'; ctx.lineWidth = s * 0.025;
      ctx.beginPath(); ctx.moveTo(cx - s * 0.14, cy - s * 0.06); ctx.lineTo(cx - s * 0.24, cy - s * 0.12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.14, cy - s * 0.06); ctx.lineTo(cx + s * 0.24, cy - s * 0.12); ctx.stroke();
      // body sphere (chrome)
      ctx.fillStyle = radial(ctx, cx, cy, s * 0.2, '#dfeaf7', col.color2);
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.19, 0, 7); ctx.fill();
      // visor band
      ctx.save(); ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.1;
      ctx.fillStyle = '#0c3a5c';
      rr(ctx, cx - s * 0.16, cy - s * 0.05, s * 0.32, s * 0.12, s * 0.05); ctx.fill();
      ctx.fillStyle = col.color;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.04, 0, 7); ctx.fill();
      ctx.restore();
      // red cross badge
      ctx.fillStyle = '#ff3b5c';
      rr(ctx, cx - s * 0.015, cy + s * 0.08, s * 0.03, s * 0.08, s * 0.005); ctx.fill();
      rr(ctx, cx - s * 0.04, cy + s * 0.105, s * 0.08, s * 0.03, s * 0.005); ctx.fill();
      gloss(ctx, cx - s * 0.05, cy - s * 0.08, s * 0.07, s * 0.04);
      rimGlow(ctx, s, col.color);
    },

    /* ===== PREMIUM SYMBOLS ===== */
    serum_vial: function (ctx, s, col) {
      plate(ctx, s, '#0e2438', '#07131f');
      var cx = s / 2;
      // glass tube
      ctx.fillStyle = 'rgba(220,240,255,0.18)';
      rr(ctx, cx - s * 0.1, s * 0.2, s * 0.2, s * 0.6, s * 0.1); ctx.fill();
      // liquid
      ctx.save();
      rr(ctx, cx - s * 0.1, s * 0.2, s * 0.2, s * 0.6, s * 0.1); ctx.clip();
      var liq = ctx.createLinearGradient(0, s * 0.45, 0, s * 0.8);
      liq.addColorStop(0, lighten(col.color, 0.25)); liq.addColorStop(1, col.color2);
      ctx.fillStyle = liq;
      ctx.fillRect(cx - s * 0.1, s * 0.45, s * 0.2, s * 0.4);
      // bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - s * 0.02, s * 0.6, s * 0.02, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + s * 0.03, s * 0.7, s * 0.015, 0, 7); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.1;
      ctx.lineWidth = s * 0.02; ctx.strokeStyle = 'rgba(180,225,255,0.7)';
      rr(ctx, cx - s * 0.1, s * 0.2, s * 0.2, s * 0.6, s * 0.1); ctx.stroke();
      ctx.restore();
      // cork
      ctx.fillStyle = '#caa06a';
      rr(ctx, cx - s * 0.07, s * 0.13, s * 0.14, s * 0.08, s * 0.02); ctx.fill();
      gloss(ctx, cx - s * 0.04, s * 0.32, s * 0.02, s * 0.12);
      rimGlow(ctx, s, col.color);
    },

    bio_capsule: function (ctx, s, col) {
      plate(ctx, s, '#0c2410', '#06120a');
      var cx = s / 2, cy = s / 2;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-0.5);
      // top half (white)
      ctx.fillStyle = radial(ctx, 0, -s * 0.1, s * 0.18, '#ffffff', '#cfe0d0');
      rr(ctx, -s * 0.14, -s * 0.26, s * 0.28, s * 0.26, s * 0.14); ctx.fill();
      // bottom half (green)
      ctx.fillStyle = radial(ctx, 0, s * 0.1, s * 0.18, lighten(col.color, 0.2), col.color2);
      rr(ctx, -s * 0.14, 0, s * 0.28, s * 0.26, s * 0.14); ctx.fill();
      // seam
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(-s * 0.14, -s * 0.01, s * 0.28, s * 0.02);
      gloss(ctx, -s * 0.05, -s * 0.12, s * 0.03, s * 0.1);
      ctx.restore();
      ctx.save(); ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.1;
      ctx.lineWidth = s * 0.012; ctx.strokeStyle = lighten(col.color, 0.1);
      ctx.translate(cx, cy); ctx.rotate(-0.5);
      rr(ctx, -s * 0.14, -s * 0.26, s * 0.28, s * 0.52, s * 0.14); ctx.stroke();
      ctx.restore();
      rimGlow(ctx, s, col.color);
    },

    lab_crystal: function (ctx, s, col) {
      plate(ctx, s, '#1c1038', '#0e0722');
      var cx = s / 2, cy = s * 0.55;
      function shard(dx, h, w, c1, c2) {
        ctx.save();
        ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.1;
        var grd = ctx.createLinearGradient(cx + dx, cy - h, cx + dx, cy + h * 0.4);
        grd.addColorStop(0, c1); grd.addColorStop(1, c2);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy - h);
        ctx.lineTo(cx + dx + w, cy - h * 0.2);
        ctx.lineTo(cx + dx + w * 0.5, cy + h * 0.4);
        ctx.lineTo(cx + dx - w * 0.5, cy + h * 0.4);
        ctx.lineTo(cx + dx - w, cy - h * 0.2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = s * 0.008;
        ctx.beginPath(); ctx.moveTo(cx + dx, cy - h); ctx.lineTo(cx + dx, cy + h * 0.4); ctx.stroke();
        ctx.restore();
      }
      shard(-s * 0.12, s * 0.16, s * 0.07, lighten(col.color, 0.3), col.color2);
      shard(s * 0.13, s * 0.18, s * 0.07, lighten(col.color, 0.25), col.color2);
      shard(0, s * 0.27, s * 0.1, lighten(col.color, 0.4), col.color2);
      rimGlow(ctx, s, col.color);
    },

    /* ===== LOW PAY — neon card values ===== */
    ace: function (ctx, s, c) { cardLetter(ctx, s, c); },
    king: function (ctx, s, c) { cardLetter(ctx, s, c); },
    queen: function (ctx, s, c) { cardLetter(ctx, s, c); },
    jack: function (ctx, s, c) { cardLetter(ctx, s, c); },
    ten: function (ctx, s, c) { cardLetter(ctx, s, c); },

    /* ===== SPECIALS ===== */
    wild: function (ctx, s) {
      plate(ctx, s, '#3a0f17', '#1c0309');
      var cx = s / 2, cy = s * 0.46;
      // red med kit
      ctx.save(); ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = s * 0.14;
      var grd = ctx.createLinearGradient(0, cy - s * 0.2, 0, cy + s * 0.2);
      grd.addColorStop(0, '#ff6d86'); grd.addColorStop(1, '#c8102e');
      ctx.fillStyle = grd;
      rr(ctx, cx - s * 0.24, cy - s * 0.16, s * 0.48, s * 0.34, s * 0.05); ctx.fill();
      ctx.restore();
      // handle
      ctx.strokeStyle = '#8a0d22'; ctx.lineWidth = s * 0.03;
      ctx.beginPath(); ctx.arc(cx, cy - s * 0.16, s * 0.08, Math.PI, 0); ctx.stroke();
      // white cross
      ctx.fillStyle = '#fff';
      rr(ctx, cx - s * 0.04, cy - s * 0.1, s * 0.08, s * 0.22, s * 0.01); ctx.fill();
      rr(ctx, cx - s * 0.12, cy - s * 0.02, s * 0.24, s * 0.08, s * 0.01); ctx.fill();
      // WILD banner
      ctx.save();
      ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = s * 0.08;
      ctx.fillStyle = '#ffd24a';
      rr(ctx, cx - s * 0.26, s * 0.74, s * 0.52, s * 0.16, s * 0.04); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#3a0f17';
      ctx.font = '900 ' + s * 0.13 + 'px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('WILD', cx, s * 0.82);
      ctx.restore && ctx.restore;
      rimGlow(ctx, s, '#ff6d86');
    },

    scatter: function (ctx, s) {
      plate(ctx, s, '#06203a', '#031020');
      var cx = s / 2, cy = s / 2;
      // swirling lab portal
      ctx.save();
      ctx.shadowColor = '#19d3ff'; ctx.shadowBlur = s * 0.18;
      for (var ring = 0; ring < 4; ring++) {
        var rad = s * (0.32 - ring * 0.06);
        ctx.strokeStyle = 'rgba(' + [25 + ring * 30, 180 + ring * 15, 255, 0.85 - ring * 0.15].join(',') + ')';
        ctx.lineWidth = s * (0.05 - ring * 0.008);
        ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * 0.92, ring * 0.4, 0, Math.PI * 2); ctx.stroke();
      }
      // core
      var core = ctx.createRadialGradient(cx, cy, s * 0.02, cx, cy, s * 0.16);
      core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, '#7fe3ff'); core.addColorStop(1, '#0a4a78');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.15, 0, 7); ctx.fill();
      ctx.restore();
      // sparkles
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(cx + s * 0.18, cy - s * 0.18, s * 0.02, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx - s * 0.2, cy + s * 0.14, s * 0.015, 0, 7); ctx.fill();
      rimGlow(ctx, s, '#19d3ff');
    },

    orb: function (ctx, s, col, value) {
      plate(ctx, s, '#1d0f38', '#0e0722');
      var cx = s / 2, cy = s / 2;
      ctx.save();
      ctx.shadowColor = '#c264ff'; ctx.shadowBlur = s * 0.2;
      var grd = ctx.createRadialGradient(cx - s * 0.08, cy - s * 0.1, s * 0.03, cx, cy, s * 0.32);
      grd.addColorStop(0, '#f3d6ff'); grd.addColorStop(0.45, '#c264ff'); grd.addColorStop(1, '#5a18a0');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, 7); ctx.fill();
      ctx.restore();
      // energy ring
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = s * 0.014;
      ctx.beginPath(); ctx.ellipse(cx, cy, s * 0.3, s * 0.12, 0.5, 0, Math.PI * 2); ctx.stroke();
      // value text
      var label = 'x' + (value != null ? value : '');
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + s * (label.length > 3 ? 0.2 : 0.26) + 'px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.shadowColor = '#5a18a0'; ctx.shadowBlur = s * 0.06;
      ctx.fillText(label, cx, cy + s * 0.01);
      ctx.restore();
      rimGlow(ctx, s, '#c264ff');
    },

    /* ===== feature-only icons (not paying symbols) ===== */
    scanner_gun: function (ctx, s) {
      var cx = s / 2, cy = s / 2;
      ctx.save(); ctx.shadowColor = '#8aff3a'; ctx.shadowBlur = s * 0.12;
      ctx.fillStyle = '#2c3b2a';
      rr(ctx, cx - s * 0.18, cy - s * 0.1, s * 0.3, s * 0.2, s * 0.04); ctx.fill();
      ctx.fillStyle = '#8aff3a';
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.12, cy - s * 0.06);
      ctx.lineTo(cx + s * 0.32, cy);
      ctx.lineTo(cx + s * 0.12, cy + s * 0.06);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a4a12';
      rr(ctx, cx - s * 0.12, cy + s * 0.08, s * 0.08, s * 0.18, s * 0.02); ctx.fill();
      ctx.restore();
    },

    emergency: function (ctx, s) {
      var cx = s / 2, cy = s / 2;
      ctx.save(); ctx.shadowColor = '#ff3b5c'; ctx.shadowBlur = s * 0.16;
      var grd = ctx.createRadialGradient(cx, cy - s * 0.06, s * 0.03, cx, cy, s * 0.3);
      grd.addColorStop(0, '#ff8a9c'); grd.addColorStop(1, '#b3122e');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, 7); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#7a0c1e'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 ' + s * 0.36 + 'px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy + s * 0.02);
    }
  };

  /* card value glyphs (A K Q J 10) drawn as neon plates */
  var cardText = { ace: 'A', king: 'K', queen: 'Q', jack: 'J', ten: '10' };
  function cardLetter(ctx, s, col) {
    plate(ctx, s, darken(col.color2, 0.12), '#0a0f1c');
    var cx = s / 2, cy = s / 2;
    var id = null;
    for (var k in cardText) if (CFG.symbolById(k) === col) id = k;
    // fall back: find by color match
    if (!id) for (var j = 0; j < CFG.symbols.length; j++)
      if (CFG.symbols[j] === col) id = CFG.symbols[j].id;
    var txt = cardText[id] || 'A';
    ctx.save();
    ctx.shadowColor = col.color; ctx.shadowBlur = s * 0.18;
    ctx.fillStyle = col.color;
    ctx.font = '900 ' + s * (txt.length > 1 ? 0.42 : 0.52) + 'px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = s * 0.02; ctx.strokeStyle = lighten(col.color, 0.5);
    ctx.strokeText(txt, cx, cy + s * 0.02);
    ctx.fillText(txt, cx, cy + s * 0.02);
    ctx.restore();
    rimGlow(ctx, s, col.color);
  }

  /* ---- public API ------------------------------------------------------ */
  var SymbolArt = {
    // For orbs, pass the multiplier value via `variant` to bake it into the sprite key.
    sprite: function (id, size, variant) {
      var key = id + '@' + size + (variant != null ? '#' + variant : '');
      if (cache[key]) return cache[key];
      var cv = document.createElement('canvas');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.ceil(size * dpr);
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      if (ASSETS[id]) {
        // EXACT artwork: draw the provided PNG verbatim
        drawContain(ctx, ASSETS[id], size);
        if (id === 'orb' && variant != null) overlayOrbValue(ctx, size, variant);
      } else {
        var painter = painters[id] || cardLetter;
        painter(ctx, size, colorOf(id), variant);
      }
      cache[key] = cv;
      return cv;
    },
    draw: function (ctx, id, x, y, size, variant) {
      ctx.drawImage(this.sprite(id, Math.round(size), variant), x, y, size, size);
    },
    roundRectPath: rr,
    lighten: lighten,
    clearCache: function () { cache = {}; }
  };

  // expose the expected asset filenames for tooling / docs
  SymbolArt.assetFiles = ASSET_FILES;
  SymbolArt.assetDir = ASSET_DIR;
  SymbolArt.hasAsset = function (id) { return !!ASSETS[id]; };

  loadAssets();   // attempt to load exact PNGs; procedural fallback if absent

  g.SymbolArt = SymbolArt;
})(typeof window !== 'undefined' ? window : globalThis);
