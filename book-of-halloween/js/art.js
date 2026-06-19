/* =========================================================================
 * BOOK OF HALLOWEEN — Procedural symbol art & atmosphere
 *
 * Every symbol and the haunted backdrop are drawn in code — no image files.
 * Symbol sprites are cached per (id, size) and blitted by the renderer.
 * ========================================================================= */
(function (g) {
  'use strict';

  var cache = {};

  /* ---- small helpers --------------------------------------------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glow(ctx, color, blur, fn) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    fn();
    ctx.restore();
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
    var r = Math.max(0, ((n >> 16) & 255) * (1 - amt)) | 0;
    var gg = Math.max(0, ((n >> 8) & 255) * (1 - amt)) | 0;
    var b = Math.max(0, (n & 255) * (1 - amt)) | 0;
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  // Ornate metallic letter used for the royal symbols (A K Q J 10).
  function royal(ctx, s, ch, tone) {
    var c = s / 2;
    var grd = ctx.createLinearGradient(0, s * 0.18, 0, s * 0.86);
    grd.addColorStop(0, lighten(tone, 0.45));
    grd.addColorStop(0.5, tone);
    grd.addColorStop(1, darken(tone, 0.45));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + (s * (ch.length > 1 ? 0.5 : 0.66)) + 'px Georgia, "Times New Roman", serif';
    // soft drop / glow
    glow(ctx, tone, s * 0.12, function () {
      ctx.fillStyle = grd;
      ctx.fillText(ch, c, c + s * 0.04);
    });
    // metallic edge
    ctx.lineWidth = s * 0.018;
    ctx.strokeStyle = 'rgba(20,8,30,0.55)';
    ctx.strokeText(ch, c, c + s * 0.04);
    // top specular
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, c - s * 0.34, s * 0.16, s * 0.68, s * 0.26, s * 0.06);
    ctx.clip();
    ctx.fillText(ch, c, c + s * 0.04);
    ctx.restore();
  }

  /* ---- per-symbol painters (draw centered into an s x s box) ----------- */
  var painters = {
    pumpkin: function (ctx, s) {
      var c = s / 2, R = s * 0.36;
      // stem
      ctx.fillStyle = '#4f7a2a';
      ctx.beginPath();
      ctx.moveTo(c - s * 0.05, c - R * 0.95);
      ctx.quadraticCurveTo(c + s * 0.02, c - R * 1.5, c + s * 0.08, c - R * 1.15);
      ctx.lineTo(c + s * 0.05, c - R * 0.9);
      ctx.closePath(); ctx.fill();
      // body lobes
      var grd = ctx.createRadialGradient(c - R * 0.3, c - R * 0.3, R * 0.2, c, c, R * 1.25);
      grd.addColorStop(0, '#ffb347');
      grd.addColorStop(0.55, '#ff8a1e');
      grd.addColorStop(1, '#c85a06');
      ctx.fillStyle = grd;
      glow(ctx, 'rgba(255,150,30,0.5)', s * 0.06, function () {
        for (var i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(c + i * R * 0.5, c + R * 0.05, R * (i === 0 ? 0.92 : 0.62), R * 1.02, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      // carved glow face
      ctx.fillStyle = '#3a1402';
      function tri(x, w, up) {
        ctx.beginPath();
        if (up) { ctx.moveTo(c + x, c - R * 0.08); ctx.lineTo(c + x - w, c + R * 0.28); ctx.lineTo(c + x + w, c + R * 0.28); }
        else { ctx.moveTo(c + x, c + R * 0.28); ctx.lineTo(c + x - w, c - R * 0.08); ctx.lineTo(c + x + w, c - R * 0.08); }
        ctx.closePath(); ctx.fill();
      }
      glow(ctx, '#ffe26b', s * 0.09, function () {
        ctx.fillStyle = '#ffd23b';
        tri(-R * 0.45, R * 0.2, true);
        tri(R * 0.45, R * 0.2, true);
        // jagged grin
        ctx.beginPath();
        ctx.moveTo(c - R * 0.55, c + R * 0.42);
        var xs = [-0.55, -0.33, -0.12, 0.12, 0.33, 0.55];
        for (var i = 0; i < xs.length; i++) {
          var y = (i % 2 === 0) ? R * 0.42 : R * 0.7;
          ctx.lineTo(c + xs[i] * R, c + y);
        }
        ctx.lineTo(c + R * 0.55, c + R * 0.42);
        ctx.closePath(); ctx.fill();
      });
    },

    skull: function (ctx, s) {
      var c = s / 2, R = s * 0.34;
      var grd = ctx.createRadialGradient(c - R * 0.3, c - R * 0.4, R * 0.15, c, c, R * 1.3);
      grd.addColorStop(0, '#fffdf4');
      grd.addColorStop(0.6, '#e9e4d6');
      grd.addColorStop(1, '#b9b09a');
      ctx.fillStyle = grd;
      // cranium
      ctx.beginPath();
      ctx.arc(c, c - R * 0.18, R, Math.PI * 0.92, Math.PI * 2.08);
      // jaw
      ctx.lineTo(c + R * 0.58, c + R * 0.72);
      ctx.quadraticCurveTo(c, c + R * 1.12, c - R * 0.58, c + R * 0.72);
      ctx.closePath(); ctx.fill();
      // eye sockets (glow)
      glow(ctx, '#ff7a1e', s * 0.07, function () {
        ctx.fillStyle = '#2a1408';
        ctx.beginPath(); ctx.ellipse(c - R * 0.42, c - R * 0.12, R * 0.27, R * 0.32, 0.25, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(c + R * 0.42, c - R * 0.12, R * 0.27, R * 0.32, -0.25, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,140,40,0.85)';
        ctx.beginPath(); ctx.arc(c - R * 0.42, c - R * 0.1, R * 0.1, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(c + R * 0.42, c - R * 0.1, R * 0.1, 0, 7); ctx.fill();
      });
      // nose + teeth
      ctx.fillStyle = '#2a1408';
      ctx.beginPath();
      ctx.moveTo(c, c + R * 0.18); ctx.lineTo(c - R * 0.12, c + R * 0.42); ctx.lineTo(c + R * 0.12, c + R * 0.42);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9a917b'; ctx.lineWidth = s * 0.012;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(c + i * R * 0.2, c + R * 0.55); ctx.lineTo(c + i * R * 0.2, c + R * 0.92); ctx.stroke();
      }
    },

    potion: function (ctx, s) {
      var c = s / 2;
      // flask body
      var grd = ctx.createRadialGradient(c - s * 0.08, c + s * 0.06, s * 0.04, c, c + s * 0.1, s * 0.32);
      grd.addColorStop(0, '#b6ff9e');
      grd.addColorStop(0.5, '#54e06a');
      grd.addColorStop(1, '#138f3a');
      ctx.fillStyle = grd;
      glow(ctx, 'rgba(90,240,120,0.6)', s * 0.08, function () {
        ctx.beginPath();
        ctx.arc(c, c + s * 0.14, s * 0.26, 0, Math.PI * 2);
        ctx.fill();
      });
      // neck
      ctx.fillStyle = 'rgba(150,255,180,0.35)';
      ctx.beginPath();
      roundRect(ctx, c - s * 0.07, c - s * 0.24, s * 0.14, s * 0.24, s * 0.03);
      ctx.fill();
      // liquid line + bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(c - s * 0.07, c + s * 0.1, s * 0.025, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.04, c + s * 0.18, s * 0.018, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c + s * 0.1, c + s * 0.06, s * 0.022, 0, 7); ctx.fill();
      // glass highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.ellipse(c - s * 0.1, c + s * 0.06, s * 0.04, s * 0.1, -0.5, 0, 7); ctx.fill();
      // cork
      ctx.fillStyle = '#7a4a22';
      ctx.beginPath();
      roundRect(ctx, c - s * 0.06, c - s * 0.32, s * 0.12, s * 0.1, s * 0.02);
      ctx.fill();
    },

    spider: function (ctx, s) {
      var c = s / 2, R = s * 0.16;
      // web strand
      ctx.strokeStyle = 'rgba(220,220,255,0.4)'; ctx.lineWidth = s * 0.012;
      ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, c - R * 1.5); ctx.stroke();
      // legs
      ctx.strokeStyle = '#16121c'; ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.026;
      for (var side = -1; side <= 1; side += 2) {
        for (var i = 0; i < 4; i++) {
          var ay = c - R * 0.4 + i * R * 0.5;
          ctx.beginPath();
          ctx.moveTo(c + side * R * 0.5, ay);
          ctx.quadraticCurveTo(c + side * R * 2.0, ay - R * 0.5, c + side * R * 2.4, ay + R * (0.4 + i * 0.25));
          ctx.stroke();
        }
      }
      // body
      var grd = ctx.createRadialGradient(c - R * 0.3, c - R * 0.3, R * 0.1, c, c + R * 0.2, R * 1.4);
      grd.addColorStop(0, '#4a3a5e');
      grd.addColorStop(1, '#0c0a12');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.ellipse(c, c + R * 0.4, R * 0.85, R * 1.1, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(c, c - R * 0.55, R * 0.55, 0, 7); ctx.fill();
      // red hourglass
      ctx.fillStyle = '#ff3b46';
      ctx.beginPath();
      ctx.moveTo(c - R * 0.3, c + R * 0.05); ctx.lineTo(c + R * 0.3, c + R * 0.05);
      ctx.lineTo(c - R * 0.3, c + R * 0.75); ctx.lineTo(c + R * 0.3, c + R * 0.75);
      ctx.closePath(); ctx.fill();
      // eyes
      glow(ctx, '#ff4d4d', s * 0.04, function () {
        ctx.fillStyle = '#ffd0d0';
        ctx.beginPath(); ctx.arc(c - R * 0.2, c - R * 0.6, R * 0.1, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(c + R * 0.2, c - R * 0.6, R * 0.1, 0, 7); ctx.fill();
      });
    },

    book: function (ctx, s) {
      var c = s / 2;
      var w = s * 0.62, h = s * 0.74;
      // cover
      var grd = ctx.createLinearGradient(c - w / 2, 0, c + w / 2, 0);
      grd.addColorStop(0, '#3a1746');
      grd.addColorStop(0.5, '#6a2a5f');
      grd.addColorStop(1, '#2a1030');
      glow(ctx, 'rgba(255,140,30,0.7)', s * 0.12, function () {
        ctx.fillStyle = grd;
        roundRect(ctx, c - w / 2, c - h / 2, w, h, s * 0.05);
        ctx.fill();
      });
      // spine + edge pages
      ctx.fillStyle = '#e8dcc0';
      roundRect(ctx, c + w / 2 - s * 0.04, c - h / 2 + s * 0.03, s * 0.05, h - s * 0.06, s * 0.01);
      ctx.fill();
      // gold border
      ctx.strokeStyle = '#ffcf52'; ctx.lineWidth = s * 0.02;
      roundRect(ctx, c - w / 2 + s * 0.05, c - h / 2 + s * 0.05, w - s * 0.12, h - s * 0.1, s * 0.03);
      ctx.stroke();
      // glowing rune emblem (pentacle-ish star in a circle)
      glow(ctx, '#ff9a2e', s * 0.1, function () {
        ctx.strokeStyle = '#ffd23b'; ctx.lineWidth = s * 0.022;
        ctx.beginPath(); ctx.arc(c, c, s * 0.17, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        for (var i = 0; i < 5; i++) {
          var a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
          var x = c + Math.cos(a) * s * 0.15, y = c + Math.sin(a) * s * 0.15;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      });
      // clasp
      ctx.fillStyle = '#ffcf52';
      roundRect(ctx, c - s * 0.03, c + h / 2 - s * 0.06, s * 0.06, s * 0.1, s * 0.015);
      ctx.fill();
    },

    ace:   function (ctx, s, tone) { royal(ctx, s, 'A', tone); },
    king:  function (ctx, s, tone) { royal(ctx, s, 'K', tone); },
    queen: function (ctx, s, tone) { royal(ctx, s, 'Q', tone); },
    jack:  function (ctx, s, tone) { royal(ctx, s, 'J', tone); },
    ten:   function (ctx, s, tone) { royal(ctx, s, '10', tone); }
  };

  function toneOf(id) {
    var arr = (g.BOH_Config.symbols);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i].tone;
    return '#ff8a1e';
  }

  var Art = {
    sprite: function (id, size) {
      var key = id + '@' + size;
      if (cache[key]) return cache[key];
      var cv = document.createElement('canvas');
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.ceil(size * dpr);
      var ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      (painters[id] || painters.pumpkin)(ctx, size, toneOf(id));
      cache[key] = cv;
      return cv;
    },
    draw: function (ctx, id, x, y, size) {
      ctx.drawImage(this.sprite(id, Math.round(size)), x, y, size, size);
    },
    clearCache: function () { cache = {}; },
    roundRect: roundRect,
    glow: glow,

    /* ---- Haunted backdrop: night sky, full moon, hills, bats, fog ------- */
    background: function (ctx, w, h, t) {
      // sky
      var sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#160a24');
      sky.addColorStop(0.5, '#241036');
      sky.addColorStop(1, '#0c0512');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // moon
      var mx = w * 0.8, my = h * 0.26, mr = Math.min(w, h) * 0.13;
      var mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.2, mx, my, mr * 1.4);
      mg.addColorStop(0, '#fff4d6');
      mg.addColorStop(0.7, '#ffcf6b');
      mg.addColorStop(1, 'rgba(255,180,80,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(mx, my, mr * 1.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff4d6';
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
      // craters
      ctx.fillStyle = 'rgba(210,170,90,0.35)';
      ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.18, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * 0.25, my + mr * 0.1, mr * 0.13, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + mr * 0.05, my - mr * 0.45, mr * 0.1, 0, 7); ctx.fill();
      // stars
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (var i = 0; i < 60; i++) {
        var sx = (i * 137.5) % w, sy = (i * 73.3) % (h * 0.6);
        var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.002 + i));
        ctx.globalAlpha = tw * 0.7;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
      // bats (silhouettes drifting)
      ctx.fillStyle = 'rgba(8,4,12,0.85)';
      for (var b = 0; b < 5; b++) {
        var bx = (w * 0.15 + b * w * 0.16 + t * 0.02 * (b % 2 ? 1 : -1)) % w;
        var by = h * (0.12 + 0.05 * b) + Math.sin(t * 0.003 + b) * 6;
        bat(ctx, bx, by, Math.min(w, h) * 0.03, t * 0.02 + b);
      }
      // gravestone hills
      ctx.fillStyle = '#100716';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.72);
      ctx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.55, h * 0.74);
      ctx.quadraticCurveTo(w * 0.8, h * 0.86, w, h * 0.7);
      ctx.lineTo(w, h);
      ctx.closePath(); ctx.fill();
      // fog band
      var fog = ctx.createLinearGradient(0, h * 0.62, 0, h);
      fog.addColorStop(0, 'rgba(120,90,150,0)');
      fog.addColorStop(1, 'rgba(120,90,150,0.18)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
    }
  };

  function bat(ctx, x, y, s, ph) {
    var flap = Math.sin(ph) * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-s * 0.6, -s * (0.6 + flap), -s * 1.6, 0);
    ctx.quadraticCurveTo(-s * 0.8, s * 0.1, -s * 0.4, s * 0.35);
    ctx.quadraticCurveTo(0, -s * 0.2, s * 0.4, s * 0.35);
    ctx.quadraticCurveTo(s * 0.8, s * 0.1, s * 1.6, 0);
    ctx.quadraticCurveTo(s * 0.6, -s * (0.6 + flap), 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  g.BOH_Art = Art;
})(typeof window !== 'undefined' ? window : globalThis);
