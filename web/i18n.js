// Shared by the TV and phone pages: loads the language files and fills the page.
// Plain JS, no build step. Add a language by dropping <code>.json into web/i18n/
// and the flag into web/flags/, then listing it in LANGS (here and src/core/i18n.ts).
(() => {
  const LANGS = ['en', 'da'];
  let dict = {};
  let fallback = {};
  let current = null;

  async function load(code) {
    const res = await fetch(`/i18n/${code}.json`);
    return res.ok ? res.json() : {};
  }

  async function setLang(code) {
    if (!LANGS.includes(code)) return false;
    if (code === current) return false;
    if (!Object.keys(fallback).length) fallback = await load('en');
    dict = code === 'en' ? fallback : await load(code);
    current = code;
    document.documentElement.lang = code;
    apply(document);
    return true;
  }

  function t(key, params) {
    let s = dict[key] ?? fallback[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }

  // data-i18n="key" sets text; data-i18n-html="key" sets markup (trusted files only);
  // data-i18n-aria="key" sets aria-label.
  function apply(root) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }

  // Flag buttons for the language chooser.
  async function nameOf(code) {
    if (code === current) return dict['lang.name'];
    const d = await load(code);
    return d['lang.name'] ?? code;
  }
  async function renderChooser(box, onPick) {
    const names = await Promise.all(LANGS.map(nameOf));
    box.replaceChildren(
      ...LANGS.map((code, i) => {
        const b = document.createElement('button');
        b.className = 'lang';
        b.dataset.lang = code;
        const img = new Image();
        img.src = `/flags/${code}.svg`;
        img.alt = '';
        const span = document.createElement('span');
        span.textContent = names[i];
        b.append(img, span);
        b.addEventListener('click', () => onPick(code));
        return b;
      }),
    );
  }

  window.i18n = { LANGS, setLang, t, apply, renderChooser, get lang() { return current; } };
})();
