// Buzz Party TV screen. State arrives over the same WebSocket the phones use.
(() => {
  const $ = id => document.getElementById(id);
  let retry = 0;

  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { retry = 0; ws.send('{"t":"tv"}'); };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'tv') render(msg.state);
    };
    ws.onclose = () => setTimeout(connect, Math.min(3000, 200 * 2 ** retry++));
  }

  function show(id) {
    for (const s of ['setup', 'home', 'launching', 'game']) $(s).hidden = s !== id;
  }

  let lastGamesKey = '';

  function render(s) {
    if (s.mode === 'setup') {
      $('problems').replaceChildren(...s.problems.map(p => Object.assign(document.createElement('li'), { textContent: p })));
      return show('setup');
    }
    if (s.mode === 'launching') {
      $('launch-title').textContent = s.gameTitle ?? '';
      return show('launching');
    }
    if (s.mode === 'game') return show('game');

    const waiting = s.mode === 'waiting';
    $('home-title').textContent = waiting ? 'Ready to play' : 'Pick a game';
    $('home-hint').innerHTML = waiting
      ? 'Grab your phones, then press <b class="c-red">RED</b> to start'
      : 'Phones: <b class="c-blue">BLUE</b> / <b class="c-orange">ORANGE</b> to move · <b class="c-red">RED</b> to start';
    $('home-error').hidden = s.problems.length === 0;
    $('home-error').textContent = s.problems.join(' ');

    const key = s.games.map(g => g.id).join('|');
    if (key !== lastGamesKey) {
      lastGamesKey = key;
      $('games').replaceChildren(...s.games.map((g, i) => card(g, i)));
    }
    [...$('games').children].forEach((el, i) => el.classList.toggle('selected', !waiting && i === s.selected));
    $('games').children[s.selected]?.scrollIntoView({ block: 'nearest' });

    if (s.qr) $('qr').src = s.qr;
    $('url').textContent = s.joinUrl ?? '';
    $('players').replaceChildren(...s.slots.map(p => {
      const el = document.createElement('div');
      el.className = `player p${p.slot}` + (p.taken ? ' joined' : '') + (p.taken && !p.connected ? ' away' : '');
      el.textContent = p.taken ? `Player ${p.slot}` : `Player ${p.slot} – free`;
      return el;
    }));
    show('home');
  }

  function card(g, i) {
    const el = document.createElement('div');
    el.className = `card c${i % 4}`;
    if (g.serial) {
      const img = new Image();
      const exts = ['png', 'jpg', 'jpeg', 'webp'];
      let n = 0;
      img.onerror = () => { if (++n < exts.length) img.src = `/covers/${g.serial}.${exts[n]}`; else img.remove(); };
      img.src = `/covers/${g.serial}.${exts[0]}`;
      el.append(img);
    }
    el.append(Object.assign(document.createElement('span'), { textContent: g.title }));
    return el;
  }

  connect();
})();
