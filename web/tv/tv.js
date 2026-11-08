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
    for (const s of ['language', 'setup', 'home', 'launching', 'game', 'wifi']) $(s).hidden = s !== id;
  }

  let lastSelected = null;
  let lastKey = '';
  let lastIds = '';
  let lastMode = null;

  // Messages are handled one at a time so a language file finishes loading
  // before the screen that needs it is drawn.
  let queue = Promise.resolve();
  function render(s) {
    queue = queue.then(() => renderNow(s)).catch(() => {});
  }

  let chooserDrawn = false;
  async function renderNow(s) {
    // WiFi setup comes first, even before a language is chosen: no phone can
    // reach the box until it is on a network.
    if (s.mode === 'wifi' && s.wifi) {
      const want = s.lang ?? 'en';
      if (want !== i18n.lang) await i18n.setLang(want);
      lastMode = s.mode;
      return renderWifi(s.wifi);
    }
    if (s.lang === null) {
      if (!chooserDrawn) {
        chooserDrawn = true;
        await i18n.renderChooser($('tv-langs'), code => ws?.send(JSON.stringify({ t: 'lang', lang: code })));
        $('tv-langs').querySelector('.lang')?.focus();
      }
      if (s.qr) $('lang-qr').src = s.qr;
      $('lang-url').textContent = s.joinUrl ?? '';
      return show('language');
    }
    if (window.sfx) window.sfx.enabled = s.sound !== false;
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

    // Move the covers only when something visible changed.
    const key = JSON.stringify([sel, s.games.map(g => [g.id, g.cover])]);
    if (key !== lastKey) {
      lastKey = key;
      const listChanged = JSON.stringify(s.games.map(g => g.id)) !== lastIds;
      lastIds = JSON.stringify(s.games.map(g => g.id));
      const moved = lastSelected !== null && lastSelected !== sel && n > 1;
      // A rescan that adds or removes games snaps into place; only a move by
      // the players slides, so the screen never seems to move on its own.
      placeCovers(s.games, sel, moved && !listChanged);
      if (moved) window.sfx?.move((sel - lastSelected + n) % n === 1);
      lastSelected = sel;
    }
    const g = s.games[sel];
    $('game-title').textContent = g?.title ?? '';
    $('game-langs').textContent = g?.languages?.length ? g.languages.join(' · ') : '';
    $('game-count').hidden = n < 2;
    $('game-count').textContent = n < 2 ? '' : `${sel + 1} / ${n}`;
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

  function renderWifi(w) {
    const name = w.ssid ?? '';
    const setup = w.mode === 'hotspot';
    $('wifi-title').textContent =
      w.mode === 'waiting' ? i18n.t('wifi.searching') :
      w.mode === 'joining' ? i18n.t('wifi.connecting', { name }) :
      w.mode === 'connected' ? i18n.t('wifi.connected') :
      i18n.t('wifi.title');
    $('wifi-error').hidden = !(setup && w.error);
    $('wifi-error').textContent = setup && w.error ? i18n.t(`wifi.error.${w.error}`, { name }) : '';
    $('wifi-setup').hidden = !setup;
    if (setup) {
      if (w.qr) $('wifi-qr').src = w.qr;
      $('wifi-scan').textContent = i18n.t('wifi.scan');
      $('wifi-ssid').textContent = w.hotspotSsid;
      $('wifi-nosheet').textContent = i18n.t('wifi.nosheet');
    }
    show('wifi');
  }

  // One element per game, kept between renders, so a move can slide each cover
  // from its old place to its new one. Places: -1 left, 0 centre, 1 right;
  // -2 and 2 are just off the sides, where covers wait hidden. With two games
  // the left place stays empty (the other game sits on the right).
  const covers = new Map(); // game id -> { el, place, look }

  function placeCovers(games, sel, slide) {
    const n = games.length;
    const stage = $('carousel');
    const seen = new Set();
    games.forEach((g, i) => {
      let d = (i - sel + n) % n;
      if (d > n / 2) d -= n;
      const place = Math.max(-2, Math.min(2, d));
      let c = covers.get(g.id);
      if (!c) {
        c = { el: document.createElement('div'), place: null, look: null };
        covers.set(g.id, c);
        stage.append(c.el);
      }
      seen.add(g.id);
      const look = JSON.stringify([g.cover, g.title, i % 4]);
      if (look !== c.look) { fillCover(c.el, g, i); c.look = look; }
      // New covers, rescans, and covers that wrap from one hidden side to the
      // other jump straight to their place instead of flying across the TV.
      const jump = !slide || c.place === null || Math.abs(place - c.place) > 1;
      c.el.classList.toggle('instant', jump);
      c.el.dataset.place = String(place);
      c.el.classList.toggle('center', place === 0);
      c.place = place;
    });
    for (const [id, c] of covers) if (!seen.has(id)) { c.el.remove(); covers.delete(id); }
    void stage.offsetWidth; // apply the jumps now, then let later moves slide
    requestAnimationFrame(() => { for (const c of covers.values()) c.el.classList.remove('instant'); });
  }

  function fillCover(el, g, i) {
    el.className = 'cover';
    el.replaceChildren();
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
  }

  // Keyboard on the language chooser: left/right move between flags, Enter picks.
  document.addEventListener('keydown', e => {
    if ($('language').hidden) return;
    const flags = [...$('tv-langs').querySelectorAll('.lang')];
    if (!flags.length) return;
    const i = Math.max(0, flags.indexOf(document.activeElement));
    if (e.key === 'ArrowRight') flags[(i + 1) % flags.length].focus();
    else if (e.key === 'ArrowLeft') flags[(i - 1 + flags.length) % flags.length].focus();
    else return;
    e.preventDefault();
  });

  connect();
})();
