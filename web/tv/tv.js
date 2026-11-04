// Buzz Party TV screen. State arrives over the same WebSocket the phones use.
(() => {
  const $ = id => document.getElementById(id);
  let retry = 0;
  let ws = null;

  function connect() {
    ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onopen = () => { retry = 0; ws.send('{"t":"tv"}'); };
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'tv') render(msg.state);
    };
    ws.onclose = () => setTimeout(connect, Math.min(3000, 200 * 2 ** retry++));
  }

  function show(id) {
    for (const s of ['language', 'setup', 'home', 'launching', 'game']) $(s).hidden = s !== id;
  }

  let lastSelected = null;
  let lastKey = '';
  let lastMode = null;

  // Messages are handled one at a time so a language file finishes loading
  // before the screen that needs it is drawn.
  let queue = Promise.resolve();
  function render(s) {
    queue = queue.then(() => renderNow(s)).catch(() => {});
  }

  let chooserDrawn = false;
  async function renderNow(s) {
    if (s.lang === null) {
      if (!chooserDrawn) {
        chooserDrawn = true;
        await i18n.renderChooser($('tv-langs'), code => ws?.send(JSON.stringify({ t: 'lang', lang: code })));
      }
      if (s.qr) $('lang-qr').src = s.qr;
      $('lang-url').textContent = s.joinUrl ?? '';
      return show('language');
    }
    if (s.lang !== i18n.lang) {
      await i18n.setLang(s.lang);
    }
    if (s.mode === 'setup') {
      // The "allow incoming connections" prompt is a macOS thing.
      $('setup-hint').hidden = s.platform !== 'darwin';
      $('problems').replaceChildren(...s.problems.map(p => Object.assign(document.createElement('li'), { textContent: p })));
      return show('setup');
    }
    if (s.mode === 'launching' && lastMode !== 'launching') window.sfx?.select();
    lastMode = s.mode;
    if (s.mode === 'launching') {
      $('launching-text').textContent = i18n.t('launching', { title: s.gameTitle ?? '' });
      return show('launching');
    }
    if (s.mode === 'game') return show('game');

    const n = s.games.length;
    const sel = Math.min(s.selected, n - 1);
    $('home-hint').innerHTML = i18n.t(n > 1 ? 'home.hintMany' : 'home.hintOne');

    // Rebuild the carousel only when something visible changed.
    const key = JSON.stringify([sel, s.games.map(g => [g.id, g.cover])]);
    if (key !== lastKey) {
      lastKey = key;
      // Always three places so the picked game sits dead centre; with two
      // games the left place stays empty.
      const items = [-1, 0, 1].map(off => {
        if (n === 1 && off !== 0) return spacer();
        if (n === 2 && off === -1) return spacer();
        const i = (sel + off + n) % n;
        return cover(s.games[i], i, off === 0);
      });
      $('carousel').replaceChildren(...items);
      if (lastSelected !== null && lastSelected !== sel && n > 1) {
        const forward = (sel - lastSelected + n) % n === 1;
        const c = $('carousel');
        c.classList.remove('slide-next', 'slide-prev');
        void c.offsetWidth;
        c.classList.add(forward ? 'slide-next' : 'slide-prev');
        window.sfx?.move(forward);
      }
      lastSelected = sel;
    }
    const g = s.games[sel];
    $('game-title').textContent = g?.title ?? '';
    $('game-langs').textContent = g?.languages?.length ? g.languages.join(' · ') : '';
    $('home-error').hidden = s.problems.length === 0;
    $('home-error').textContent = s.problems.join(' ');

    if (s.qr) $('qr').src = s.qr;
    $('url').textContent = s.joinUrl ?? '';
    $('players').replaceChildren(...s.slots.map(p => {
      const el = document.createElement('div');
      el.className = `player p${p.slot}` + (p.taken ? ' joined' : '') + (p.taken && !p.connected ? ' away' : '');
      el.textContent = p.taken ? i18n.t('player', { n: p.slot }) : i18n.t('player.free', { n: p.slot });
      return el;
    }));
    show('home');
  }

  function spacer() {
    const el = document.createElement('div');
    el.className = 'cover side spacer';
    return el;
  }

  function cover(g, i, center) {
    const el = document.createElement('div');
    el.className = `cover ${center ? 'center' : 'side'}`;
    if (g.cover) {
      const img = new Image();
      img.alt = g.title;
      img.src = g.cover;
      img.onerror = () => { img.remove(); el.classList.add('card', `c${i % 4}`); el.textContent = g.title; };
      el.append(img);
    } else {
      el.classList.add('card', `c${i % 4}`);
      el.textContent = g.title;
    }
    return el;
  }

  connect();
})();
