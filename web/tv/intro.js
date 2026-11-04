// Startup intro: glowing towers rising out of the dark, a soft chime, then the
// title. Plays once when the TV page loads and then removes itself.
// Add ?nointro to the URL to skip it, or ?mute to play it without sound.
(() => {
  if (/[?&]nointro\b/.test(location.search)) return;

  const DURATION = 7.4;       // seconds until the overlay is gone
  const TITLE_AT = 3.6;       // title starts fading in
  const FADE_OUT_AT = 6.2;    // overlay starts fading out

  const canvas = document.createElement('canvas');
  canvas.id = 'intro';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
  }
  resize();
  addEventListener('resize', resize);

  // Seeded random so the scene looks the same every boot.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const PALETTE = [
    [60, 140, 255],   // blue
    [90, 180, 255],   // light blue
    [120, 120, 255],  // violet-blue
    [255, 170, 70],   // orange accent (rare)
    [235, 245, 255],  // white-blue
  ];
  const pick = () => {
    const r = rnd();
    if (r < 0.08) return PALETTE[3];
    if (r < 0.2) return PALETTE[4];
    if (r < 0.5) return PALETTE[1];
    if (r < 0.75) return PALETTE[2];
    return PALETTE[0];
  };

  const towers = [];
  for (let i = 0; i < 70; i++) {
    towers.push({
      x: (rnd() * 2 - 1) * 1.6,     // across the scene
      z: 0.6 + rnd() * 1.6,         // depth, smaller is closer
      w: 0.012 + rnd() * 0.03,      // width
      h: 0.25 + rnd() * 0.85,       // final height
      delay: rnd() * 2.2,           // when it starts rising
      speed: 0.7 + rnd() * 0.9,
      phase: rnd() * Math.PI * 2,
      color: pick(),
    });
  }
  towers.sort((a, b) => b.z - a.z); // far first

  const motes = [];
  for (let i = 0; i < 90; i++) {
    motes.push({ x: rnd() * 2 - 1, y: rnd(), z: 0.3 + rnd() * 1.2, s: 0.4 + rnd() * 0.8, color: pick() });
  }

  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // Soft synthetic sound: a low swell, then a bell-like chime as the title lands.
  // Browsers can refuse audio before a click, so everything here is best-effort.
  let audio = null;
  function startAudio() {
    try {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      audio = new A();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const now = audio.currentTime;
      const master = audio.createGain();
      master.gain.value = 0.35;
      master.connect(audio.destination);

      const drone = (freq, start, len, peak) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, now + start);
        g.gain.linearRampToValueAtTime(peak, now + start + len * 0.6);
        g.gain.linearRampToValueAtTime(0, now + start + len);
        o.connect(g).connect(master);
        o.start(now + start);
        o.stop(now + start + len + 0.1);
      };
      drone(55, 0, 6.5, 0.5);
      drone(82.5, 0.3, 6, 0.3);
      drone(110, 0.8, 5.5, 0.18);

      const bell = (freq, start, peak) => {
        for (const [mult, amp] of [[1, 1], [2.01, 0.4], [3.98, 0.15]]) {
          const o = audio.createOscillator();
          const g = audio.createGain();
          o.type = 'sine';
          o.frequency.value = freq * mult;
          g.gain.setValueAtTime(0, now + start);
          g.gain.linearRampToValueAtTime(peak * amp, now + start + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + start + 3.2);
          o.connect(g).connect(master);
          o.start(now + start);
          o.stop(now + start + 3.3);
        }
      };
      bell(659.25, TITLE_AT - 0.1, 0.22);      // E5
      bell(987.77, TITLE_AT + 0.12, 0.16);     // B5
      bell(1318.5, TITLE_AT + 0.3, 0.1);       // E6
    } catch { /* silent intro is fine */ }
  }
  if (!/[?&]mute\b/.test(location.search)) startAudio();

  function drawBackground(t, fade) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#02030a');
    g.addColorStop(0.55, '#070b1f');
    g.addColorStop(1, '#0a1233');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Haze at the horizon that brightens as the towers come up.
    const hy = H * 0.72;
    const haze = ctx.createRadialGradient(W / 2, hy, 0, W / 2, hy, W * 0.6);
    const a = 0.12 + 0.2 * clamp01(t / 4);
    haze.addColorStop(0, `rgba(70,130,255,${a * fade})`);
    haze.addColorStop(1, 'rgba(70,130,255,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
  }

  function drawTowers(t) {
    const horizon = H * 0.72;
    const drift = t * 0.03; // slow forward drift: towers glide past
    ctx.globalCompositeOperation = 'lighter';
    for (const tw of towers) {
      const rise = ease(clamp01((t - tw.delay) / (2.6 / tw.speed)));
      if (rise <= 0) continue;
      const z = tw.z - drift;
      const zz = z <= 0.45 ? z + 1.85 : z;
      const scale = 1 / zz;
      const sx = W / 2 + tw.x * scale * W * 0.36;
      const widthPx = tw.w * scale * W * 0.9;
      const base = horizon + (scale - 0.5) * H * 0.07;
      const heightPx = tw.h * rise * scale * H * 0.55;
      const sway = Math.sin(t * 0.8 + tw.phase) * 0.04 + 0.96; // gentle glow breathing
      const [r, g, b] = tw.color;
      const dim = clamp01(1.2 - zz * 0.45) * sway * clamp01((zz - 0.45) / 0.35);

      // Tower body: bright at the base, fading upward.
      const grad = ctx.createLinearGradient(0, base - heightPx, 0, base);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${0.28 * dim})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${0.85 * dim})`);
      ctx.fillStyle = grad;
      ctx.fillRect(sx - widthPx / 2, base - heightPx, widthPx, heightPx);

      // Bright core line.
      ctx.fillStyle = `rgba(255,255,255,${0.16 * dim})`;
      ctx.fillRect(sx - widthPx * 0.12, base - heightPx, widthPx * 0.24, heightPx);

      // Soft glow around the tower.
      const gw = widthPx * 5;
      const glow = ctx.createLinearGradient(sx - gw, 0, sx + gw, 0);
      glow.addColorStop(0, `rgba(${r},${g},${b},0)`);
      glow.addColorStop(0.5, `rgba(${r},${g},${b},${0.04 * dim})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(sx - gw, base - heightPx, gw * 2, heightPx);

      // Reflection on the floor.
      const refl = ctx.createLinearGradient(0, base, 0, base + heightPx * 0.4);
      refl.addColorStop(0, `rgba(${r},${g},${b},${0.22 * dim})`);
      refl.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = refl;
      ctx.fillRect(sx - widthPx / 2, base, widthPx, heightPx * 0.4);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawMotes(t, fade) {
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const y = ((m.y - t * 0.04 * m.s) % 1 + 1) % 1;
      const scale = 1 / m.z;
      const sx = W / 2 + m.x * scale * W * 0.4;
      const sy = H * 0.1 + y * H * 0.75;
      const r = (1.2 + 2.2 * m.s) * scale * dpr;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + m.x * 9);
      const [cr, cg, cb] = m.color;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.5 * tw * fade * clamp01(t / 2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTitle(t) {
    const a = ease(clamp01((t - TITLE_AT) / 1.4));
    if (a <= 0) return;
    const size = Math.round(Math.min(W * 0.085, H * 0.16));
    const cx = W / 2;
    const cy = H * 0.42;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.globalAlpha = a;
    // Wide letter spacing, supported in current Chromium.
    ctx.letterSpacing = `${Math.round(size * 0.16)}px`;
    ctx.shadowColor = 'rgba(90,170,255,0.95)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText('BUZZ PARTY', cx, cy);
    ctx.shadowBlur = size * 0.15;
    ctx.fillText('BUZZ PARTY', cx, cy);
    ctx.restore();
  }

  // Debug: ?introt=3.5 draws one still frame at that time and stays up.
  const still = /[?&]introt=([\d.]+)/.exec(location.search);
  const start = performance.now();
  function frame(now) {
    const t = still ? parseFloat(still[1]) : (now - start) / 1000;
    const fadeIn = clamp01(t / 0.9);
    const fadeOut = 1 - clamp01((t - FADE_OUT_AT) / (DURATION - FADE_OUT_AT - 0.1));

    ctx.clearRect(0, 0, W, H);
    drawBackground(t, fadeIn);
    drawTowers(t);
    drawMotes(t, fadeIn);
    drawTitle(t);

    // Fade up from black inside the canvas so the UI behind never flashes.
    ctx.fillStyle = `rgba(0,0,0,${1 - fadeIn})`;
    ctx.fillRect(0, 0, W, H);
    canvas.style.opacity = String(fadeOut);
    if (still) return;
    if (t >= DURATION) {
      canvas.remove();
      removeEventListener('resize', resize);
      if (audio) audio.close().catch(() => {});
      return;
    }
    requestAnimationFrame(frame);
  }
  if (still) frame(performance.now()); else requestAnimationFrame(frame);
})();
