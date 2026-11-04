// Buzz Party phone buzzer. Plain JS, no build step.
(() => {
  const $ = id => document.getElementById(id);
  const SLOT_COLORS = { 1: 'var(--blue)', 2: 'var(--orange)', 3: 'var(--green)', 4: '#c9a800' };
  const STATUS_KEYS = { setup: 'phone.status.setup', picker: 'phone.status.picker', waiting: 'phone.status.waiting', launching: 'phone.status.launching' };

  // A token survives reloads so the phone gets its player back.
  let token;
  try {
    token = localStorage.getItem('buzz-token');
    if (!token) {
      token = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('buzz-token', token);
    }
  } catch {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  let ws = null;
  let state = null;
  let queue = Promise.resolve(); // renders one at a time so a language loads before it is used
  let chooserDrawn = false;
  let retry = 0;
  const held = new Set();

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => {
      retry = 0;
      send({ t: 'hello', token });
    };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'state') {
        state = msg;
        queue = queue.then(render).catch(() => {});
      }
    };
    ws.onclose = () => {
      releaseAll();
      show('connecting');
      setTimeout(connect, Math.min(5000, 300 * 2 ** retry++));
    };
  }

  function show(id) {
    for (const s of ['connecting', 'language', 'pick', 'buzzer']) $(s).hidden = s !== id;
  }

  const pickLang = code => send({ t: 'lang', lang: code });

  async function render() {
    if (!chooserDrawn) {
      chooserDrawn = true;
      await i18n.renderChooser($('phone-langs'), pickLang);
      await i18n.renderChooser($('sheet-langs'), code => { sheet(null); pickLang(code); });
    }
    if (state.lang === null) return show('language');
    if (state.lang !== i18n.lang) await i18n.setLang(state.lang);
    if (!state.you) {
      renderSlots();
      show('pick');
      return;
    }
    $('player').textContent = i18n.t('phone.player', { n: state.you });
    const game = state.selectedTitle ? state.selectedTitle.replace(/^Buzz! Junior: /, '') : '';
    $('status').textContent =
      state.mode === 'picker' && game ? `◀ ${game} ▶` :
      state.mode === 'waiting' && game ? i18n.t('phone.status.waitingGame', { game }) :
      (state.mode === 'game' || state.mode === 'launching') && game ? game :
      (STATUS_KEYS[state.mode] ? i18n.t(STATUS_KEYS[state.mode]) : '');
    document.querySelector('.strip').style.setProperty('--c', SLOT_COLORS[state.you]);
    show('buzzer');
    $('sound-btn').textContent = i18n.t(state.sound === false ? 'phone.soundOff' : 'phone.soundOn');
    $('invite-qr').hidden = !state.qr;
    if (state.qr) $('invite-qr').src = state.qr;
    $('invite-url').textContent = state.joinUrl;
    const inGame = state.mode === 'game' || state.mode === 'launching';
    document.querySelector('[data-act="back"]').hidden = !inGame;
    document.querySelector('[data-act="off"]').hidden = inGame;
  }

  function renderSlots() {
    const box = $('slots');
    box.replaceChildren(
      ...state.slots.map(s => {
        const b = document.createElement('button');
        b.className = 'slot';
        b.dataset.slot = s.slot;
        b.textContent = i18n.t('phone.player', { n: s.slot });
        b.disabled = s.taken;
        b.addEventListener('click', () => send({ t: 'claim', slot: s.slot }));
        return b;
      }),
    );
  }

  // Buttons: register on finger down, release on up/cancel/leave. With two
  // fingers on one button, it stays pressed until the last one lifts.
  const fingers = new Map(); // button -> Set of pointer ids
  for (const el of document.querySelectorAll('.btn')) {
    const b = el.dataset.b;
    fingers.set(b, new Set());
    const down = e => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const ids = fingers.get(b);
      const first = ids.size === 0;
      ids.add(e.pointerId);
      if (!first) return;
      held.add(b);
      el.classList.add('pressed');
      navigator.vibrate?.(30);
      send({ t: 'btn', b, down: true });
    };
    const up = e => {
      e.preventDefault();
      const ids = fingers.get(b);
      if (!ids.delete(e.pointerId) || ids.size > 0) return;
      held.delete(b);
      el.classList.remove('pressed');
      send({ t: 'btn', b, down: false });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  function releaseAll() {
    for (const b of held) send({ t: 'btn', b, down: false });
    held.clear();
    for (const ids of fingers.values()) ids.clear();
    for (const el of document.querySelectorAll('.btn.pressed')) el.classList.remove('pressed');
  }

  // Menu.
  const sheet = id => {
    for (const s of ['menu', 'confirm', 'lang-sheet', 'invite']) $(s).hidden = s !== id;
  };
  let onYes = null;
  function confirmThen(text, fn) {
    $('confirm-text').textContent = text;
    onYes = fn;
    sheet('confirm');
  }
  $('menu-btn').addEventListener('click', () => sheet('menu'));
  $('confirm-yes').addEventListener('click', () => {
    sheet(null);
    onYes?.();
  });
  $('confirm-no').addEventListener('click', () => sheet(null));
  for (const el of document.querySelectorAll('[data-act]')) {
    el.addEventListener('click', () => {
      const act = el.dataset.act;
      if (act === 'close') sheet(null);
      else if (act === 'invite') sheet('invite');
      else if (act === 'language') sheet('lang-sheet');
      else if (act === 'sound') {
        sheet(null);
        send({ t: 'sound', on: !state.sound });
      }
      else if (act === 'leave') {
        sheet(null);
        releaseAll();
        send({ t: 'menu', action: 'leave' });
      } else if (act === 'back') confirmThen(i18n.t('phone.confirmBack'), () => send({ t: 'menu', action: 'back' }));
      else if (act === 'off') confirmThen(i18n.t('phone.confirmOff'), () => send({ t: 'menu', action: 'off' }));
    });
  }

  // Keep the screen on where the browser allows it.
  let wakeLock = null;
  async function keepAwake() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      wakeLock = null;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
    else keepAwake();
  });
  document.addEventListener('pointerdown', () => { if (!wakeLock) keepAwake(); }, { once: true });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  keepAwake();
  connect();
})();
