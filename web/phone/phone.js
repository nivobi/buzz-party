// Buzz Party phone buzzer. Plain JS, no build step.
(() => {
  const $ = id => document.getElementById(id);
  const SLOT_COLORS = { 1: 'var(--blue)', 2: 'var(--orange)', 3: 'var(--green)', 4: '#c9a800' };
  const STATUS = {
    setup: 'Getting ready – look at the TV',
    picker: 'Pick a game',
    waiting: 'Press RED to start',
    launching: 'Starting…',
    game: '',
  };

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
        render();
      }
    };
    ws.onclose = () => {
      releaseAll();
      show('connecting');
      setTimeout(connect, Math.min(5000, 300 * 2 ** retry++));
    };
  }

  function show(id) {
    for (const s of ['connecting', 'pick', 'buzzer']) $(s).hidden = s !== id;
  }

  function render() {
    if (!state.you) {
      renderSlots();
      show('pick');
      return;
    }
    $('player').textContent = `PLAYER ${state.you}`;
    $('status').textContent = STATUS[state.mode] ?? '';
    document.querySelector('.strip').style.setProperty('--c', SLOT_COLORS[state.you]);
    show('buzzer');
    $('invite-qr').src = state.qr;
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
        b.textContent = `PLAYER ${s.slot}`;
        b.disabled = s.taken;
        b.addEventListener('click', () => send({ t: 'claim', slot: s.slot }));
        return b;
      }),
    );
  }

  // Buttons: register on finger down, release on up/cancel/leave.
  for (const el of document.querySelectorAll('.btn')) {
    const b = el.dataset.b;
    const down = e => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      if (held.has(b)) return;
      held.add(b);
      el.classList.add('pressed');
      navigator.vibrate?.(30);
      send({ t: 'btn', b, down: true });
    };
    const up = e => {
      e.preventDefault();
      if (!held.has(b)) return;
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
    for (const el of document.querySelectorAll('.btn.pressed')) el.classList.remove('pressed');
  }

  // Menu.
  const sheet = id => {
    for (const s of ['menu', 'confirm', 'invite']) $(s).hidden = s !== id;
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
      else if (act === 'leave') {
        sheet(null);
        releaseAll();
        send({ t: 'menu', action: 'leave' });
      } else if (act === 'back') confirmThen('Stop this game and go back to the games?', () => send({ t: 'menu', action: 'back' }));
      else if (act === 'off') confirmThen('Turn off Buzz Party for everyone?', () => send({ t: 'menu', action: 'off' }));
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
