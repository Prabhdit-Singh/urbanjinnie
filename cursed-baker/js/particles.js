// Cursed Baker — ambient ash/ember particle drift over the background art
const BgParticles = (() => {
  let canvas, ctx, particles, raf;

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }

  function makeParticle() {
    const purple = Math.random() < 0.55;
    return {
      x: Math.random() * canvas.width,
      y: canvas.height + Math.random() * 100,
      r: (Math.random() * 1.6 + 0.6) * devicePixelRatio,
      speed: (Math.random() * 0.35 + 0.1) * devicePixelRatio,
      drift: (Math.random() - 0.5) * 0.3 * devicePixelRatio,
      alpha: Math.random() * 0.5 + 0.15,
      hue: purple ? 'rgba(190,120,255,' : 'rgba(255,170,90,',
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    const count = Math.round((canvas.clientWidth * canvas.clientHeight) / 22000);
    particles = Array.from({ length: Math.min(Math.max(count, 24), 90) }, makeParticle);
    tick();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.y -= p.speed;
      p.x += p.drift;
      p.twinkle += 0.02;
      if (p.y < -20) Object.assign(p, makeParticle(), { y: canvas.height + 20 });
      const a = p.alpha * (0.6 + 0.4 * Math.sin(p.twinkle));
      ctx.beginPath();
      ctx.fillStyle = `${p.hue}${a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    raf = requestAnimationFrame(tick);
  }

  return { init };
})();
