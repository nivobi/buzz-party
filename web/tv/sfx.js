// Small synthesized UI sounds for the TV: no audio files needed.
// Browsers can block audio before any interaction, so every call is best-effort.
(() => {
  let ctx = null;
  const audio = () => {
    try {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  };

  // One short note: sine (plus a quiet octave for sparkle) with a fast attack and decay.
  function note(freq, start, len, peak, type = 'sine') {
    if (!window.sfx.enabled) return;
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + start;
    for (const [mult, amp] of [[1, 1], [2, 0.25]]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak * amp, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + len + 0.05);
    }
  }

  window.sfx = {
    // Switched off from the phone menu; the TV page sets this from the server state.
    enabled: true,
    // Browsing the carousel: a soft tick, a little higher going forward, lower going back.
    move(forward) {
      note(forward ? 1046.5 : 784, 0, 0.09, 0.12);
      note(forward ? 1318.5 : 987.8, 0.04, 0.12, 0.07);
    },
    // Picking a game: a bright rising chord.
    select() {
      note(523.25, 0, 0.5, 0.14);    // C5
      note(659.25, 0.07, 0.5, 0.13); // E5
      note(783.99, 0.14, 0.55, 0.12); // G5
      note(1046.5, 0.22, 0.8, 0.12); // C6
    },
  };
})();
