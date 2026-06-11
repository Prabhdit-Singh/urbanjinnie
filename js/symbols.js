/* =========================================================================
 * CANDY SURGE 1000 — Procedural symbol art
 *
 * Every symbol is drawn in code (no image assets): glossy "candy" shapes
 * with radial-gradient bodies, rim shading and a specular highlight.
 * Sprites are cached per (id, size) for fast blitting from the renderer.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var cache = {};

  function colorOf(id) {
    for (var i = 0; i < CFG.symbols.length; i++)
      if (CFG.symbols[i].id === id) return CFG.symbols[i];
    return { color: '#9ad7ff', color2: '#3a7bd5' };
  }

  /* ---- path helpers ---------------------------------------------------- */
  function starPath(ctx, cx, cy, R, r, points, rot) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var rad = (i % 2 === 0) ? R : r;
      var a = rot + (Math.PI * i) / points;
      var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function heartPath(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.62);
    ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.18, cx - s * 0.62, cy - s * 0.95, cx, cy - s * 0.42);
    ctx.bezierCurveTo(cx + s * 0.62, cy - s * 0.95, cx + s * 1.1, cy - s * 0.18, cx, cy + s * 0.62);
    ctx.closePath();
  }

  function hexPath(ctx, cx, cy, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = rot + (Math.PI / 3) * i;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function dropPath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.15);
    ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.25, cx + r * 0.85, cy + r * 0.45, cx, cy + r * 0.85);
    ctx.bezierCurveTo(cx - r * 0.85, cy + r * 0.45, cx - r * 0.9, cy - r * 0.25, cx, cy - r * 1.15);
    ctx.closePath();
  }

  /* ---- shared candy shading -------------------------------------------- */
  function bodyGradient(ctx, cx, cy, r, c1, c2) {
    var grd = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.45, r * 0.1, cx, cy, r * 1.25);
    grd.addColorStop(0, lighten(c1, 0.35));
    grd.addColorStop(0.45, c1);
    grd.addColorStop(1, c2);
    return grd;
  }

  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, ((n >> 16) & 255) + 255 * amt) | 0;
    var gg = Math.min(255, ((n >> 8) & 255) + 255 * amt) | 0;
    var b = Math.min(255, (n & 255) + 255 * amt) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function gloss(ctx, cx, cy, r, rot) {
    ctx.save();
    ctx.translate(cx - r * 0.3, cy - r * 0.42);
    ctx.rotate(rot == null ? -0.5 : rot);
    var grd = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.25);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function rim(ctx, lineWidth) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(40,8,40,0.35)';
    ctx.stroke();
  }

  /* ---- per-symbol painters ---------------------------------------------
   * Each painter draws into a square of `s` pixels, centered. */
  var painters = {
    star: function (ctx, s, col) {
      var c = s / 2, R = s * 0.42;
      starPath(ctx, c, c, R, R * 0.52, 5, -Math.PI / 2);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      gloss(ctx, c, c - s * 0.02, R * 0.9);
    },
    heart: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      heartPath(ctx, c, c + s * 0.02, R);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      gloss(ctx, c - s * 0.02, c, R * 0.85);
    },
    gem: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      hexPath(ctx, c, c, R, Math.PI / 6);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      // inner facet
      hexPath(ctx, c, c, R * 0.55, Math.PI / 6);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      gloss(ctx, c, c, R * 0.85);
    },
    ring: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38, hole = R * 0.42;
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.arc(c, c, hole, 0, Math.PI * 2, true);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill('evenodd');
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); rim(ctx, s * 0.022);
      ctx.beginPath(); ctx.arc(c, c, hole, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(40,8,40,0.3)'; ctx.lineWidth = s * 0.018; ctx.stroke();
      gloss(ctx, c + R * 0.06, c - R * 0.18, R * 0.8);
    },
    bean: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38;
      ctx.save();
      ctx.translate(c, c); ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.05, R * 0.72, 0, 0, Math.PI * 2);
      ctx.fillStyle = bodyGradient(ctx, 0, 0, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      ctx.restore();
      gloss(ctx, c - R * 0.15, c - R * 0.3, R * 0.85, -0.5);
    },
    drop: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38;
      dropPath(ctx, c, c + s * 0.04, R);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      gloss(ctx, c, c - s * 0.04, R * 0.8);
    },
    swirl: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.fillStyle = bodyGradient(ctx, c, c, R, col.color, col.color2);
      ctx.fill(); rim(ctx, s * 0.025);
      // candy swirl stripes
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, R * 0.92, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = s * 0.07;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        var a0 = i * (Math.PI * 2 / 3);
        for (var t = 0; t <= 1.001; t += 0.06) {
          var a = a0 + t * Math.PI * 1.5, rr = R * 0.12 + t * R * 0.8;
          var x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
          t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      gloss(ctx, c, c, R * 0.85);
    },
    scatter: function (ctx, s) {
      var c = s / 2, R = s * 0.4;
      // glowing crystal cube (diamond orientation)
      ctx.save();
      ctx.translate(c, c); ctx.rotate(Math.PI / 4);
      var half = R * 0.72;
      var grd = ctx.createLinearGradient(-half, -half, half, half);
      grd.addColorStop(0, '#fff6b0');
      grd.addColorStop(0.5, '#ffd24a');
      grd.addColorStop(1, '#ff8a00');
      ctx.shadowColor = 'rgba(255,200,60,0.9)';
      ctx.shadowBlur = s * 0.16;
      roundRectPath(ctx, -half, -half, half * 2, half * 2, R * 0.18);
      ctx.fillStyle = grd; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = s * 0.03; ctx.strokeStyle = 'rgba(120,60,0,0.45)'; ctx.stroke();
      // inner facet lines
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = s * 0.02;
      roundRectPath(ctx, -half * 0.55, -half * 0.55, half * 1.1, half * 1.1, R * 0.1);
      ctx.stroke();
      ctx.restore();
      // sparkle
      sparkle(ctx, c + R * 0.45, c - R * 0.55, s * 0.1);
      sparkle(ctx, c - R * 0.5, c + R * 0.4, s * 0.06);
      gloss(ctx, c, c - R * 0.15, R * 0.8);
    }
  };

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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

  /* ---- public API ------------------------------------------------------- */
  var SymbolArt = {
    sprite: function (id, size) {
      var key = id + '@' + size;
      if (cache[key]) return cache[key];
      var cv = document.createElement('canvas');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.ceil(size * dpr);
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      (painters[id] || painters.swirl)(ctx, size, colorOf(id));
      cache[key] = cv;
      return cv;
    },
    draw: function (ctx, id, x, y, size) {
      ctx.drawImage(this.sprite(id, Math.round(size)), x, y, size, size);
    },
    roundRectPath: roundRectPath,
    clearCache: function () { cache = {}; }
  };

  g.SymbolArt = SymbolArt;
})(typeof window !== 'undefined' ? window : globalThis);
