/* =========================================================================
 * CRITTER CLASH 1000 — Symbol art
 *
 * Creatures use the painted character art in assets/creatures/ (rendered as
 * rounded symbol tiles); everything else — card royals, wild egg, arena
 * ticket — is drawn procedurally in code. The procedural chibi painters
 * also serve as a fallback while the character art is still loading.
 * Sprites are cached per (id, size) for fast blitting from the renderer,
 * and the same painters feed the lobby/info/battle overlay canvases.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var cache = {};

  /* ---- painted character art (assets/creatures/<id>.jpg) --------------- */
  var IMAGES = {};
  if (typeof document !== 'undefined') {
    CFG.creatures.forEach(function (cr) {
      var img = new Image();
      img.onload = function () {
        IMAGES[cr.id] = img;
        // drop sprites cached from the procedural fallback
        for (var k in cache) if (k.indexOf(cr.id + '@') === 0) delete cache[k];
      };
      img.src = 'assets/creatures/' + cr.id + '.jpg';
    });
  }

  // rounded symbol tile filled with the painted character art
  function paintCreatureImage(ctx, s, img) {
    var pad = s * 0.045, w = s - pad * 2, r = s * 0.17;
    roundRectPath(ctx, pad, pad, w, w, r);
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, pad, pad, w, w);
    ctx.restore();
    roundRectPath(ctx, pad, pad, w, w, r);
    ctx.lineWidth = s * 0.028;
    ctx.strokeStyle = 'rgba(15,8,40,0.55)';
    ctx.stroke();
    roundRectPath(ctx, pad + s * 0.018, pad + s * 0.018, w - s * 0.036, w - s * 0.036, r * 0.82);
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.stroke();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
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

  function bodyGradient(ctx, cx, cy, r, c1, c2) {
    var grd = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.45, r * 0.1, cx, cy, r * 1.25);
    grd.addColorStop(0, lighten(c1, 0.35));
    grd.addColorStop(0.45, c1);
    grd.addColorStop(1, c2);
    return grd;
  }

  function rim(ctx, lineWidth) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(15,8,40,0.4)';
    ctx.stroke();
  }

  function gloss(ctx, cx, cy, r) {
    ctx.save();
    ctx.translate(cx - r * 0.3, cy - r * 0.42);
    ctx.rotate(-0.5);
    var grd = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.25);
    grd.addColorStop(0, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function sparkle(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  /* ---- face shared by all creatures ------------------------------------- */
  function face(ctx, cx, cy, s, opts) {
    opts = opts || {};
    var er = s * (opts.eye || 0.07);
    ctx.fillStyle = '#1d1230';
    ctx.beginPath(); ctx.arc(cx - s * 0.13, cy - s * 0.02, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.13, cy - s * 0.02, er, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(cx - s * 0.13 - er * 0.3, cy - s * 0.02 - er * 0.35, er * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + s * 0.13 - er * 0.3, cy - s * 0.02 - er * 0.35, er * 0.35, 0, Math.PI * 2); ctx.fill();
    // smile
    ctx.strokeStyle = '#1d1230';
    ctx.lineWidth = s * 0.02;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (opts.fangs) {
      ctx.moveTo(cx - s * 0.08, cy + s * 0.09);
      ctx.lineTo(cx + s * 0.08, cy + s * 0.09);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.06, cy + s * 0.09); ctx.lineTo(cx - s * 0.03, cy + s * 0.15); ctx.lineTo(cx, cy + s * 0.09);
      ctx.moveTo(cx + s * 0.06, cy + s * 0.09); ctx.lineTo(cx + s * 0.03, cy + s * 0.15); ctx.lineTo(cx, cy + s * 0.09);
      ctx.fill();
    } else {
      ctx.arc(cx, cy + s * 0.06, s * 0.08, 0.25, Math.PI - 0.25);
      ctx.stroke();
    }
    // blush
    ctx.fillStyle = 'rgba(255,120,140,0.35)';
    ctx.beginPath(); ctx.ellipse(cx - s * 0.21, cy + s * 0.06, s * 0.05, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + s * 0.21, cy + s * 0.06, s * 0.05, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  }

  function colorsOf(id) {
    var c = CFG.creatureIds[id] || CFG.lowIds[id];
    return c || { color: '#9ad7ff', color2: '#3a7bd5' };
  }

  /* ---- per-symbol painters (square of s pixels, centered) -------------- */
  var painters = {};

  // card royals: glossy gem tile with a big letter
  CFG.lows.forEach(function (low) {
    painters[low.id] = function (ctx, s) {
      var pad = s * 0.12, w = s - pad * 2, r = s * 0.16;
      roundRectPath(ctx, pad, pad, w, w, r);
      ctx.fillStyle = bodyGradient(ctx, s / 2, s / 2, w / 2, low.color, low.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      roundRectPath(ctx, pad + s * 0.05, pad + s * 0.05, w - s * 0.1, w - s * 0.1, r * 0.7);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = s * 0.015;
      ctx.stroke();
      ctx.font = '900 ' + s * 0.42 + 'px "Arial Black", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = s * 0.06; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,8,40,0.55)';
      ctx.strokeText(low.label, s / 2, s / 2 + s * 0.02);
      ctx.fillStyle = '#fff';
      ctx.fillText(low.label, s / 2, s / 2 + s * 0.02);
      gloss(ctx, s / 2, s / 2 - s * 0.06, w * 0.55);
    };
  });

  painters.blazepup = function (ctx, s) {
    var col = colorsOf('blazepup'), c = s / 2, R = s * 0.34;
    // flame tuft
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(c, c - R * 1.55);
    ctx.quadraticCurveTo(c + R * 0.5, c - R * 1.1, c, c - R * 0.8);
    ctx.quadraticCurveTo(c - R * 0.5, c - R * 1.1, c, c - R * 1.55);
    ctx.fill();
    // pointy ears
    ctx.fillStyle = col.color2;
    ctx.beginPath();
    ctx.moveTo(c - R * 0.9, c - R * 0.3); ctx.lineTo(c - R * 1.1, c - R * 1.2); ctx.lineTo(c - R * 0.3, c - R * 0.85);
    ctx.moveTo(c + R * 0.9, c - R * 0.3); ctx.lineTo(c + R * 1.1, c - R * 1.2); ctx.lineTo(c + R * 0.3, c - R * 0.85);
    ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
    ctx.fill(); rim(ctx, s * 0.022);
    face(ctx, c, c, s);
    gloss(ctx, c, c - R * 0.2, R * 0.9);
  };

  painters.aquash = function (ctx, s) {
    var col = colorsOf('aquash'), c = s / 2, R = s * 0.33;
    // shell behind
    ctx.beginPath(); ctx.arc(c, c + R * 0.35, R * 0.95, Math.PI, 0);
    ctx.fillStyle = '#2e7d4f'; ctx.fill();
    ctx.strokeStyle = 'rgba(15,8,40,0.4)'; ctx.lineWidth = s * 0.02; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(c + i * R * 0.5, c + R * 0.35);
      ctx.lineTo(c + i * R * 0.62, c - R * 0.4);
      ctx.stroke();
    }
    // head
    ctx.beginPath(); ctx.arc(c, c - R * 0.15, R * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c - R * 0.15, R * 0.8, col.color, col.color2);
    ctx.fill(); rim(ctx, s * 0.022);
    // fins
    ctx.fillStyle = col.color2;
    ctx.beginPath();
    ctx.ellipse(c - R * 0.95, c + R * 0.5, R * 0.32, R * 0.16, -0.5, 0, Math.PI * 2);
    ctx.ellipse(c + R * 0.95, c + R * 0.5, R * 0.32, R * 0.16, 0.5, 0, Math.PI * 2);
    ctx.fill();
    face(ctx, c, c - R * 0.15, s * 0.9);
    gloss(ctx, c, c - R * 0.35, R * 0.7);
  };

  painters.leafling = function (ctx, s) {
    var col = colorsOf('leafling'), c = s / 2, R = s * 0.33;
    // leaf sprout
    ctx.save();
    ctx.strokeStyle = '#168a30'; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c, c - R); ctx.quadraticCurveTo(c + R * 0.1, c - R * 1.3, c - R * 0.05, c - R * 1.5); ctx.stroke();
    ctx.fillStyle = '#56c94f';
    ctx.beginPath();
    ctx.ellipse(c + R * 0.3, c - R * 1.5, R * 0.42, R * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // head (slightly squashed = lizard)
    ctx.beginPath(); ctx.ellipse(c, c, R * 1.05, R * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
    ctx.fill(); rim(ctx, s * 0.022);
    // belly scale
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(c, c + R * 0.45, R * 0.5, R * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    face(ctx, c, c, s);
    gloss(ctx, c, c - R * 0.25, R * 0.8);
  };

  painters.voltoroo = function (ctx, s) {
    var col = colorsOf('voltoroo'), c = s / 2, R = s * 0.32;
    // tall kangaroo ears
    ctx.fillStyle = col.color2;
    ctx.beginPath();
    ctx.ellipse(c - R * 0.55, c - R * 1.15, R * 0.24, R * 0.62, -0.18, 0, Math.PI * 2);
    ctx.ellipse(c + R * 0.55, c - R * 1.15, R * 0.24, R * 0.62, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lighten(col.color, 0.25);
    ctx.beginPath();
    ctx.ellipse(c - R * 0.55, c - R * 1.1, R * 0.12, R * 0.4, -0.18, 0, Math.PI * 2);
    ctx.ellipse(c + R * 0.55, c - R * 1.1, R * 0.12, R * 0.4, 0.18, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
    ctx.fill(); rim(ctx, s * 0.022);
    face(ctx, c, c - s * 0.02, s);
    // lightning bolt on forehead
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(c + R * 0.05, c - R * 0.75);
    ctx.lineTo(c - R * 0.2, c - R * 0.35);
    ctx.lineTo(c, c - R * 0.35);
    ctx.lineTo(c - R * 0.08, c - R * 0.05);
    ctx.lineTo(c + R * 0.22, c - R * 0.5);
    ctx.lineTo(c + R * 0.02, c - R * 0.5);
    ctx.closePath();
    ctx.fill();
    gloss(ctx, c, c - R * 0.2, R * 0.85);
  };

  painters.frostfin = function (ctx, s) {
    var col = colorsOf('frostfin'), c = s / 2, R = s * 0.36;
    // penguin body
    ctx.beginPath(); ctx.ellipse(c, c + s * 0.02, R * 0.92, R * 1.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, '#3d6db5', '#1d3a73');
    ctx.fill(); rim(ctx, s * 0.022);
    // icy belly
    ctx.fillStyle = lighten(col.color, 0.3);
    ctx.beginPath(); ctx.ellipse(c, c + R * 0.32, R * 0.55, R * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    // flippers
    ctx.fillStyle = '#1d3a73';
    ctx.beginPath();
    ctx.ellipse(c - R * 0.95, c + R * 0.15, R * 0.2, R * 0.5, -0.35, 0, Math.PI * 2);
    ctx.ellipse(c + R * 0.95, c + R * 0.15, R * 0.2, R * 0.5, 0.35, 0, Math.PI * 2);
    ctx.fill();
    // beak
    ctx.fillStyle = '#ffb637';
    ctx.beginPath();
    ctx.moveTo(c - R * 0.16, c - R * 0.05);
    ctx.lineTo(c + R * 0.16, c - R * 0.05);
    ctx.lineTo(c, c + R * 0.2);
    ctx.closePath(); ctx.fill();
    face(ctx, c, c - R * 0.25, s, { eye: 0.06 });
    // ice crystal on head
    sparkle(ctx, c + R * 0.6, c - R * 0.85, s * 0.08);
    gloss(ctx, c, c - R * 0.4, R * 0.7);
  };

  painters.nightfang = function (ctx, s) {
    var col = colorsOf('nightfang'), c = s / 2, R = s * 0.3;
    // bat wings
    ctx.fillStyle = col.color2;
    function wing(dir) {
      ctx.beginPath();
      ctx.moveTo(c + dir * R * 0.6, c);
      ctx.quadraticCurveTo(c + dir * R * 1.9, c - R * 0.9, c + dir * R * 1.75, c + R * 0.5);
      ctx.quadraticCurveTo(c + dir * R * 1.35, c + R * 0.25, c + dir * R * 1.15, c + R * 0.7);
      ctx.quadraticCurveTo(c + dir * R * 0.85, c + R * 0.4, c + dir * R * 0.6, c + R * 0.6);
      ctx.closePath(); ctx.fill();
    }
    wing(-1); wing(1);
    // pointed ears
    ctx.beginPath();
    ctx.moveTo(c - R * 0.7, c - R * 0.5); ctx.lineTo(c - R * 0.85, c - R * 1.5); ctx.lineTo(c - R * 0.1, c - R * 0.85);
    ctx.moveTo(c + R * 0.7, c - R * 0.5); ctx.lineTo(c + R * 0.85, c - R * 1.5); ctx.lineTo(c + R * 0.1, c - R * 0.85);
    ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
    ctx.fill(); rim(ctx, s * 0.022);
    face(ctx, c, c, s * 0.95, { fangs: true });
    gloss(ctx, c, c - R * 0.25, R * 0.8);
  };

  painters.goldhorn = function (ctx, s) {
    var col = colorsOf('goldhorn'), c = s / 2, R = s * 0.32;
    ctx.save();
    ctx.shadowColor = 'rgba(255,210,74,0.9)';
    ctx.shadowBlur = s * 0.12;
    // single spiral horn
    ctx.fillStyle = '#fff1c4';
    ctx.beginPath();
    ctx.moveTo(c - R * 0.18, c - R * 0.85);
    ctx.lineTo(c + R * 0.18, c - R * 0.85);
    ctx.lineTo(c, c - R * 1.7);
    ctx.closePath(); ctx.fill();
    // regal ears
    ctx.fillStyle = col.color2;
    ctx.beginPath();
    ctx.ellipse(c - R * 0.8, c - R * 0.65, R * 0.3, R * 0.45, -0.5, 0, Math.PI * 2);
    ctx.ellipse(c + R * 0.8, c - R * 0.65, R * 0.3, R * 0.45, 0.5, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
    ctx.fill();
    ctx.restore();
    rim(ctx, s * 0.022);
    face(ctx, c, c, s);
    sparkle(ctx, c - R * 0.85, c - R * 1.1, s * 0.07);
    sparkle(ctx, c + R * 1.0, c - R * 0.2, s * 0.05);
    gloss(ctx, c, c - R * 0.25, R * 0.85);
  };

  painters.wild = function (ctx, s) {
    var c = s / 2, R = s * 0.34;
    // golden egg
    ctx.save();
    ctx.shadowColor = 'rgba(255,210,74,0.85)';
    ctx.shadowBlur = s * 0.14;
    ctx.beginPath();
    ctx.ellipse(c, c, R * 0.78, R, 0, 0, Math.PI * 2);
    var grd = ctx.createLinearGradient(c - R, c - R, c + R, c + R);
    grd.addColorStop(0, '#fff6c4'); grd.addColorStop(0.5, '#ffd24a'); grd.addColorStop(1, '#e08a00');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();
    rim(ctx, s * 0.022);
    // zigzag shine band
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    for (var i = 0; i <= 6; i++) {
      var x = c - R * 0.6 + (R * 1.2 / 6) * i;
      var y = c + (i % 2 ? -1 : 1) * R * 0.1;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    // WILD tag
    ctx.font = '900 ' + s * 0.17 + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = s * 0.04; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#7a4400';
    ctx.strokeText('WILD', c, c + R * 0.45);
    ctx.fillStyle = '#fff';
    ctx.fillText('WILD', c, c + R * 0.45);
    sparkle(ctx, c + R * 0.5, c - R * 0.6, s * 0.08);
    gloss(ctx, c, c - R * 0.35, R * 0.7);
  };

  painters.scatter = function (ctx, s) {
    var c = s / 2;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(-0.16);
    var w = s * 0.74, h = s * 0.48;
    ctx.shadowColor = 'rgba(255,210,74,0.9)';
    ctx.shadowBlur = s * 0.13;
    var grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grd.addColorStop(0, '#ffe9a8'); grd.addColorStop(0.5, '#ffc83d'); grd.addColorStop(1, '#e08a00');
    roundRectPath(ctx, -w / 2, -h / 2, w, h, s * 0.06);
    ctx.fillStyle = grd; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = s * 0.022; ctx.strokeStyle = 'rgba(120,60,0,0.55)'; ctx.stroke();
    // perforation
    ctx.setLineDash([s * 0.02, s * 0.025]);
    ctx.beginPath(); ctx.moveTo(w * 0.22, -h / 2); ctx.lineTo(w * 0.22, h / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7a4400';
    ctx.font = '900 ' + s * 0.13 + 'px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ARENA', -w * 0.14, -h * 0.12);
    ctx.fillText('TICKET', -w * 0.14, h * 0.18);
    // star on the stub
    var sx = w * 0.36;
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = (i % 2 === 0) ? s * 0.085 : s * 0.038;
      var a = -Math.PI / 2 + (Math.PI / 5) * i;
      var x = sx + Math.cos(a) * rad, y = Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
    sparkle(ctx, c + s * 0.3, c - s * 0.3, s * 0.07);
  };

  /* ---- public API ------------------------------------------------------- */
  function paint(ctx, id, size) {
    if (IMAGES[id]) paintCreatureImage(ctx, size, IMAGES[id]);
    else (painters[id] || painters.ten)(ctx, size);
  }

  var SymbolArt = {
    sprite: function (id, size) {
      var key = id + '@' + size;
      if (cache[key]) return cache[key];
      var cv = document.createElement('canvas');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.ceil(size * dpr);
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      paint(ctx, id, size);
      cache[key] = cv;
      return cv;
    },
    draw: function (ctx, id, x, y, size) {
      ctx.drawImage(this.sprite(id, Math.round(size)), x, y, size, size);
    },
    // paint into an existing DOM canvas (info screen, battle overlay, tiles)
    paintInto: function (canvas, id) {
      var size = Math.max(canvas.clientWidth || canvas.width, 32);
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.height = Math.ceil(size * dpr);
      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      paint(ctx, id, size);
    },
    roundRectPath: roundRectPath,
    clearCache: function () { cache = {}; }
  };

  g.SymbolArt = SymbolArt;
})(typeof window !== 'undefined' ? window : globalThis);
