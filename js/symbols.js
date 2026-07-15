/* =========================================================================
 * CANDY SURGE 1000 — Symbol art system
 *
 * Symbols are REAL baked bitmap sprites: each one is rendered once through
 * a multi-pass candy pipeline (cast shadow, layered body gradients, inner
 * occlusion, subsurface bounce light, dual specular highlights, contour +
 * inner rim line, per-symbol detail work, sugar specks) and cached as a
 * bitmap. The repo also ships pre-exported PNGs in assets/symbols/ (built
 * by tools/export_sprites.js) which are loaded first — the procedural
 * pipeline is the sprite *factory* and the fallback, so a publisher can
 * swap any PNG for their own art without touching code.
 * ========================================================================= */
(function (g) {
  'use strict';

  var CFG = g.GameConfig;
  var cache = {};
  var images = {};   // id -> HTMLImageElement (pre-exported PNG assets)

  var FORCE_PROCEDURAL = typeof location !== 'undefined' &&
    /[?&]procedural/.test(location.search);

  function colorOf(id) {
    for (var i = 0; i < CFG.symbols.length; i++)
      if (CFG.symbols[i].id === id) return CFG.symbols[i];
    return { color: '#9ad7ff', color2: '#3a7bd5' };
  }

  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.min(255, ((n >> 16) & 255) + 255 * amt) | 0;
    var gg = Math.min(255, ((n >> 8) & 255) + 255 * amt) | 0;
    var b = Math.min(255, (n & 255) + 255 * amt) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function darken(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, ((n >> 16) & 255) - 255 * amt) | 0;
    var gg = Math.max(0, ((n >> 8) & 255) - 255 * amt) | 0;
    var b = Math.max(0, (n & 255) - 255 * amt) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  /* ---- path builders ---------------------------------------------------- */
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
      i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
              : ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
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

  function beanPath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.05, r * 0.72, -0.5, 0, Math.PI * 2);
    ctx.closePath();
  }

  function circlePath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
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

  /* ---- the candy pipeline ------------------------------------------------
   * path(ctx) must set the current path. All passes derive from `s` (sprite
   * size) so sprites look identical at any resolution. */
  function candy(ctx, s, col, path, opts) {
    opts = opts || {};
    var cx = s / 2, cy = s / 2, R = s * 0.4;

    // 1. cast shadow (soft, offset down)
    ctx.save();
    ctx.translate(0, s * 0.045);
    path(ctx);
    ctx.filter = 'blur(' + s * 0.028 + 'px)';
    ctx.fillStyle = 'rgba(30,4,36,0.45)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.restore();

    // 2. body: layered gradients (top light -> mid tone -> deep bottom)
    path(ctx);
    var body = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.55, R * 0.08, cx, cy + R * 0.15, R * 1.5);
    body.addColorStop(0, lighten(col.color, 0.42));
    body.addColorStop(0.32, lighten(col.color, 0.12));
    body.addColorStop(0.62, col.color);
    body.addColorStop(1, darken(col.color2, 0.08));
    ctx.fillStyle = body;
    ctx.fill();

    // clip for interior passes
    ctx.save();
    path(ctx);
    ctx.clip();

    // 3. inner occlusion (dark soft ring hugging the contour)
    path(ctx);
    ctx.lineWidth = s * 0.085;
    ctx.strokeStyle = 'rgba(52,8,54,0.32)';
    ctx.filter = 'blur(' + s * 0.02 + 'px)';
    ctx.stroke();
    ctx.filter = 'none';

    // 4. subsurface bounce light (candy translucency from below)
    var bounce = ctx.createLinearGradient(0, cy + R * 0.15, 0, cy + R * 1.05);
    bounce.addColorStop(0, 'rgba(255,255,255,0)');
    bounce.addColorStop(1, opts.bounce || 'rgba(255,214,245,0.5)');
    ctx.fillStyle = bounce;
    ctx.fillRect(0, cy, s, s / 2);

    // 5. sugar specks (subtle sparkle texture)
    if (opts.specks !== false) {
      for (var i = 0; i < 26; i++) {
        var a = (i * 2.399963) % (Math.PI * 2);          // golden-angle scatter
        var rr = R * (0.15 + ((i * 37) % 83) / 100);
        var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.9;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.06 + ((i * 13) % 10) / 90) + ')';
        ctx.beginPath();
        ctx.arc(px, py, s * (0.006 + ((i * 7) % 5) / 900), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore(); // end clip

    // 6. contour: dark outline + bright inner rim
    path(ctx);
    ctx.lineWidth = s * 0.028;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = darken(col.color2, 0.22);
    ctx.stroke();
    ctx.save();
    path(ctx);
    ctx.clip();
    path(ctx);
    ctx.lineWidth = s * 0.035;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.translate(0, -s * 0.012);
    ctx.stroke();
    ctx.restore();

    // 7. dual speculars: broad soft sheen + hard hotspot
    ctx.save();
    path(ctx);
    ctx.clip();
    ctx.save();
    ctx.translate(cx - R * 0.32, cy - R * 0.45);
    ctx.rotate(-0.55);
    var sheen = ctx.createLinearGradient(0, -R * 0.35, 0, R * 0.3);
    sheen.addColorStop(0, 'rgba(255,255,255,0.75)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.52, R * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.45, cy - R * 0.58, R * 0.1, R * 0.055, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ---- per-symbol painters ------------------------------------------------ */
  var painters = {
    star: function (ctx, s, col) {
      var c = s / 2, R = s * 0.42;
      candy(ctx, s, col, function (x) { starPath(x, c, c, R, R * 0.52, 5, -Math.PI / 2); },
            { bounce: 'rgba(255,190,160,0.45)' });
      // center jelly dot
      circlePath(ctx, c, c + s * 0.01, R * 0.16);
      var dot = ctx.createRadialGradient(c - R * 0.05, c - R * 0.05, 0, c, c, R * 0.18);
      dot.addColorStop(0, '#ffe1ea'); dot.addColorStop(1, darken(col.color2, 0.05));
      ctx.fillStyle = dot; ctx.fill();
      ctx.lineWidth = s * 0.014; ctx.strokeStyle = 'rgba(120,10,50,0.5)'; ctx.stroke();
    },

    heart: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      candy(ctx, s, col, function (x) { heartPath(x, c, c + s * 0.02, R); },
            { bounce: 'rgba(255,170,230,0.55)' });
      // stitched crease down the middle
      ctx.save();
      heartPath(ctx, c, c + s * 0.02, R); ctx.clip();
      ctx.strokeStyle = 'rgba(150,20,110,0.35)';
      ctx.lineWidth = s * 0.012;
      ctx.setLineDash([s * 0.02, s * 0.018]);
      ctx.beginPath();
      ctx.moveTo(c, c - R * 0.42);
      ctx.quadraticCurveTo(c + R * 0.06, c, c, c + R * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },

    gem: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      candy(ctx, s, col, function (x) { hexPath(x, c, c, R, Math.PI / 6); },
            { bounce: 'rgba(210,170,255,0.5)', specks: false });
      // faceting: inner hex + spokes with light/dark faces
      ctx.save();
      hexPath(ctx, c, c, R, Math.PI / 6); ctx.clip();
      var inner = R * 0.52;
      for (var i = 0; i < 6; i++) {
        var a0 = Math.PI / 6 + (Math.PI / 3) * i, a1 = a0 + Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a0) * inner, c + Math.sin(a0) * inner);
        ctx.lineTo(c + Math.cos(a0) * R, c + Math.sin(a0) * R);
        ctx.lineTo(c + Math.cos(a1) * R, c + Math.sin(a1) * R);
        ctx.lineTo(c + Math.cos(a1) * inner, c + Math.sin(a1) * inner);
        ctx.closePath();
        ctx.fillStyle = i < 2 ? 'rgba(255,255,255,0.14)' : i < 4 ? 'rgba(40,0,70,0.12)' : 'rgba(255,255,255,0.05)';
        ctx.fill();
      }
      hexPath(ctx, c, c, inner, Math.PI / 6);
      var table = ctx.createLinearGradient(c, c - inner, c, c + inner);
      table.addColorStop(0, 'rgba(255,255,255,0.32)');
      table.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.fillStyle = table; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = s * 0.012; ctx.stroke();
      ctx.restore();
    },

    ring: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38, hole = R * 0.42;
      // torus = candy pass on full disc, then punch + shade the hole
      candy(ctx, s, col, function (x) { circlePath(x, c, c, R); },
            { bounce: 'rgba(160,220,255,0.5)' });
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      circlePath(ctx, c, c, hole);
      ctx.fill();
      ctx.restore();
      // hole inner shading
      circlePath(ctx, c, c, hole);
      ctx.lineWidth = s * 0.03;
      ctx.strokeStyle = darken(col.color2, 0.2);
      ctx.stroke();
      ctx.save();
      circlePath(ctx, c, c, hole + s * 0.028);
      ctx.clip();
      circlePath(ctx, c, c + s * 0.012, hole);
      ctx.lineWidth = s * 0.02;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.stroke();
      ctx.restore();
    },

    bean: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38;
      candy(ctx, s, col, function (x) { beanPath(x, c, c, R); },
            { bounce: 'rgba(190,255,180,0.5)' });
    },

    drop: function (ctx, s, col) {
      var c = s / 2, R = s * 0.38;
      candy(ctx, s, col, function (x) { dropPath(x, c, c + s * 0.04, R); },
            { bounce: 'rgba(255,230,150,0.55)' });
    },

    swirl: function (ctx, s, col) {
      var c = s / 2, R = s * 0.4;
      candy(ctx, s, col, function (x) { circlePath(x, c, c, R); },
            { bounce: 'rgba(170,255,240,0.5)', specks: false });
      // glossy spiral stripes with shadowed edges
      ctx.save();
      circlePath(ctx, c, c, R * 0.94); ctx.clip();
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass === 0 ? 'rgba(10,80,70,0.25)' : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = s * (pass === 0 ? 0.085 : 0.062);
        ctx.lineCap = 'round';
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          var a0 = i * (Math.PI * 2 / 3) + (pass ? 0 : 0.05);
          for (var t = 0; t <= 1.001; t += 0.05) {
            var a = a0 + t * Math.PI * 1.5, rr = R * 0.1 + t * R * 0.82;
            var x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
            t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      // re-assert top sheen over the stripes
      ctx.save();
      circlePath(ctx, c, c, R); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(c - R * 0.3, c - R * 0.42, R * 0.5, R * 0.28, -0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    scatter: function (ctx, s) {
      var c = s / 2, R = s * 0.4;
      // radiant halo
      var halo = ctx.createRadialGradient(c, c, R * 0.2, c, c, R * 1.25);
      halo.addColorStop(0, 'rgba(255,214,74,0.55)');
      halo.addColorStop(1, 'rgba(255,214,74,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, s, s);
      // crystal cube
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(Math.PI / 4);
      var half = R * 0.68;
      var grd = ctx.createLinearGradient(-half, -half, half, half);
      grd.addColorStop(0, '#fff8c9');
      grd.addColorStop(0.42, '#ffd24a');
      grd.addColorStop(0.75, '#ff9d1d');
      grd.addColorStop(1, '#e86a00');
      ctx.shadowColor = 'rgba(255,190,40,0.95)';
      ctx.shadowBlur = s * 0.12;
      roundRectPath(ctx, -half, -half, half * 2, half * 2, R * 0.16);
      ctx.fillStyle = grd; ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = s * 0.028;
      ctx.strokeStyle = 'rgba(140,64,0,0.6)';
      ctx.stroke();
      // beveled facets
      roundRectPath(ctx, -half, -half, half * 2, half * 2, R * 0.16);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-half, -half); ctx.lineTo(half, -half); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-half, half); ctx.lineTo(half, half); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(120,40,0,0.28)'; ctx.fill();
      roundRectPath(ctx, -half * 0.5, -half * 0.5, half, half, R * 0.08);
      var core = ctx.createLinearGradient(-half * 0.5, -half * 0.5, half * 0.5, half * 0.5);
      core.addColorStop(0, 'rgba(255,255,255,0.9)');
      core.addColorStop(1, 'rgba(255,220,120,0.25)');
      ctx.fillStyle = core; ctx.fill();
      ctx.restore();
      // sparkles
      sparkle(ctx, c + R * 0.55, c - R * 0.62, s * 0.085);
      sparkle(ctx, c - R * 0.62, c + R * 0.45, s * 0.055);
      sparkle(ctx, c + R * 0.15, c + R * 0.72, s * 0.04);
    }
  };

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

  /* ---- asset loading + cache --------------------------------------------- */
  function allIds() {
    var ids = CFG.symbols.map(function (s) { return s.id; });
    ids.push('scatter');
    return ids;
  }

  function preload() {
    if (FORCE_PROCEDURAL || typeof Image === 'undefined') return;
    allIds().forEach(function (id) {
      var img = new Image();
      img.onload = function () { images[id] = img; cache = {}; };
      img.onerror = function () { /* procedural fallback stays active */ };
      img.src = 'assets/symbols/' + id + '.png';
    });
  }

  var SymbolArt = {
    sprite: function (id, size) {
      var key = id + '@' + size;
      if (cache[key]) return cache[key];
      var cv = document.createElement('canvas');
      var dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      cv.width = cv.height = Math.max(2, Math.ceil(size * dpr));
      var ctx = cv.getContext('2d');
      if (images[id]) {
        ctx.drawImage(images[id], 0, 0, cv.width, cv.height);
      } else {
        ctx.scale(dpr, dpr);
        (painters[id] || painters.swirl)(ctx, size, colorOf(id));
      }
      cache[key] = cv;
      return cv;
    },
    draw: function (ctx, id, x, y, size) {
      ctx.drawImage(this.sprite(id, Math.round(size)), x, y, size, size);
    },
    paintInto: function (ctx, id, size) {   // used by the sprite exporter
      (painters[id] || painters.swirl)(ctx, size, colorOf(id));
    },
    ids: allIds,
    roundRectPath: roundRectPath,
    clearCache: function () { cache = {}; }
  };

  preload();
  g.SymbolArt = SymbolArt;
})(typeof window !== 'undefined' ? window : globalThis);
