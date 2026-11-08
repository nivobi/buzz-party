import { app, BrowserWindow, dialog, screen } from 'electron';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { networkInterfaces, uptime } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { Controller, type GameRunner, type Join } from './app/controller.js';
import { chooseDisplay, shouldRecheck } from './app/display.js';
import { FakeBridge } from './bridge/fake.js';
import { LinuxBridge } from './bridge/linux.js';
import { MacBridge } from './bridge/mac.js';
import { Presser } from './bridge/presser.js';
import type { KeyBridge } from './bridge/types.js';
import { CoverFetcher, findCover } from './core/covers.js';
import { scanGames, type Game } from './core/games.js';
import { defaultRouteInterface, pickLanIp } from './core/lan-ip.js';
import { isLang, loadDictionaries, translator, type Lang } from './core/i18n.js';
import { fetchNetsetup, wifiQrText } from './core/netsetup.js';
import { ensureFolders, paths, pickBios } from './core/paths.js';
import { startFakeLights, startLightListener } from './core/lights.js';
import { findPcsx2Candidates, isBuzzPartyBuild, Pcsx2Manager } from './core/pcsx2-manager.js';
import type { Lights } from './shared/protocol.js';
import { readSettings, shouldPlayIntro, updateSettings } from './core/settings.js';
import { SlotManager } from './core/slots.js';
import { startServer } from './server/server.js';

// Some Linux setups (e.g. Ubuntu 24.04) block Chromium's sandbox for unpackaged
// or unpacked apps. BUZZ_NO_SANDBOX=1 turns it off; the app only shows its own
// local pages, so this is acceptable for a dedicated console box.
if (process.platform === 'linux' && process.env.BUZZ_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox');

const PORT = 8420;
const MAX_PORT = 8429;

const resources = app.isPackaged ? process.resourcesPath : app.getAppPath();
const helperPath = app.isPackaged ? join(resources, 'buzzhelper') : join(resources, 'build', 'buzzhelper');
const templatePath = join(resources, app.isPackaged ? 'pcsx2' : 'resources/pcsx2', 'PCSX2.template.ini');
const webDir = join(app.getAppPath(), 'web');

app.whenReady().then(async () => {
  const p = paths();
  await ensureFolders(p);

  // UI language: chosen on first run (flags on the TV and phones), then remembered.
  const settingsFile = join(p.root, 'settings.json');
  const settings = await readSettings(settingsFile);
  let lang: Lang | null = settings.language ?? null;
  let sound = settings.sound ?? true;
  const t = translator(loadDictionaries(webDir), () => lang);

  const bridge: KeyBridge =
    process.platform === 'darwin' ? new MacBridge(helperPath)
    : process.platform === 'linux' ? new LinuxBridge(helperPath)
    : new FakeBridge();
  const presser = new Presser(bridge, { minHoldMs: 50 });
  const slots = new SlotManager({ now: Date.now, releaseAfterMs: 90_000 });
  // Buzzer lights: our patched PCSX2 sends them to a local UDP port; stock PCSX2 sends nothing.
  // BUZZ_FAKE_LIGHTS=1 plays a made-up light show instead, for working on the phones.
  let onLights: (l: Lights) => void = () => {};
  const fakeLights = process.env.BUZZ_FAKE_LIGHTS === '1';
  const lightSource = fakeLights
    ? (() => { const f = startFakeLights(l => onLights(l)); return { port: undefined, close: async () => f.stop() }; })()
    : await startLightListener(l => onLights(l)).catch(err => {
      console.warn('Buzzer lights off: could not listen for them:', err);
      return null;
    });

  const candidates = findPcsx2Candidates();
  const pcsx2Path = candidates[0] ?? null;
  const fallbackAppPath = pcsx2Path && isBuzzPartyBuild(pcsx2Path) ? candidates.find(c => !isBuzzPartyBuild(c)) : undefined;
  const manager = pcsx2Path
    ? new Pcsx2Manager({ appPath: pcsx2Path, fallbackAppPath, dataDir: p.pcsx2Data, template: readFileSync(templatePath, 'utf8'), bridge,
      ledUdpPort: lightSource?.port })
    : null;

  const target = () => chooseDisplay(screen.getAllDisplays());
  let biosFile: string | null = null;

  const runner: GameRunner = {
    launch: async (game: Game) => {
      if (!manager || !biosFile) throw new Error('PCSX2 or BIOS missing');
      const t = target();
      await manager.launch(game, { biosDir: p.bios, biosFile, tvBounds: t.external ? t.display.bounds : undefined });
    },
    stop: async () => { await manager?.stop(); },
    onExit: cb => manager?.onExit(cb),
  };

  const coverFetcher = new CoverFetcher({ dir: p.covers });
  let port = PORT;
  async function check(promptTrust: boolean): Promise<{ games: Game[]; problems: string[]; join: Join | null }> {
    const problems: string[] = [];
    if (!pcsx2Path) problems.push(t(process.platform === 'linux' ? 'problem.pcsx2.linux' : 'problem.pcsx2'));
    biosFile = pickBios(await readdir(p.bios).catch(() => []));
    if (!biosFile) problems.push(t('problem.bios', { path: p.bios }));
    const games = await scanGames(p.games);
    for (const g of games) {
      const file = g.serial ? await findCover(g.serial, p.covers) : null;
      g.cover = file ? `/covers/${encodeURIComponent(file)}` : null;
    }
    // Missing covers download in the background; the picker updates when they land.
    void Promise.all(games.filter(g => g.serial && !g.cover).map(g => coverFetcher.ensure(g.serial!)))
      .then(async got => {
        if (got.some(Boolean) && shouldRecheck(controller.tvState().mode)) controller.update(await check(false));
      });
    if (games.length === 0) problems.push(t('problem.games', { path: p.games }));
    if (bridge.isAlive?.() === false) {
      problems.push(t('problem.helper'));
    } else if (!(await bridge.isTrusted(promptTrust))) {
      problems.push(t(process.platform === 'linux' ? 'problem.input.linux' : 'problem.accessibility'));
    }
    const ip = pickLanIp(networkInterfaces(), await defaultRouteInterface());
    let join: Join | null = null;
    if (ip) {
      const url = `http://${ip}:${port}/`;
      join = { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 512 }) };
    } else {
      problems.push(t('problem.wifi'));
    }
    return { games, problems, join };
  }

  const controller = new Controller({ slots, presser, runner, games: [], problems: ['Starting…'], join: null, quit: () => app.quit(),
    lang, sound, t, platform: process.platform, lightsAnyMode: fakeLights,
    setLang: async next => {
      if (!isLang(next) || next === lang) return;
      lang = next;
      await updateSettings(settingsFile, { language: lang });
      controller.update({ ...(await check(false)), lang });
    },
    setSound: async on => {
      if (on === sound) return;
      sound = on;
      await updateSettings(settingsFile, { sound });
      controller.update({ sound });
    },
  });
  onLights = l => controller.setLights(l);
  const server = await startServer(controller, { webDir, port: PORT, maxPort: MAX_PORT, coversDir: p.covers });
  port = server.port;
  controller.update(await check(true));
  setInterval(() => controller.tick(), 5000);

  // Every 5 s outside a game: setup problems, new games, and the network
  // (a Wi-Fi change must update the join QR code).
  let checking = false;
  setInterval(async () => {
    if (checking || !shouldRecheck(controller.tvState().mode)) return;
    checking = true;
    try {
      const result = await check(false);
      if (shouldRecheck(controller.tvState().mode)) controller.update(result);
    } finally {
      checking = false;
    }
  }, 5000);

  // The console box's WiFi setup (buzz-netsetup, Linux only). Polled every
  // second so "Connecting…" and the 5 s "Connected ✓" show in time. Without the
  // service every poll is null and nothing changes.
  if (process.platform === 'linux') {
    let lastWifi = 'null';
    let wifiQr: { ssid: string; qr: string } | null = null;
    let polling = false;
    setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const wifi = await fetchNetsetup();
        const key = JSON.stringify(wifi);
        if (key === lastWifi) return;
        lastWifi = key;
        if (wifi?.mode === 'hotspot') {
          if (wifiQr?.ssid !== wifi.hotspotSsid) {
            wifiQr = { ssid: wifi.hotspotSsid, qr: await QRCode.toDataURL(wifiQrText(wifi.hotspotSsid), { margin: 1, width: 512 }) };
          }
          wifi.qr = wifiQr.qr;
        }
        // Setup over: re-check at once, so the picker shows the join QR code for the new network.
        if (wifi === null && shouldRecheck(controller.tvState().mode)) {
          controller.update({ ...(await check(false).catch(() => ({}))), wifi: null });
        } else {
          controller.update({ wifi });
        }
      } finally {
        polling = false;
      }
    }, 1000);
  }

  const { display } = target();
  const win = new BrowserWindow({
    ...display.bounds,
    frame: false,
    fullscreen: true,
    backgroundColor: '#14121f',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.setBounds(display.bounds);
  // The intro is skipped (or muted) through the page's URL, since it starts
  // before the page has heard anything from the server.
  const query = [shouldPlayIntro(settings.intro, uptime()) ? '' : 'nointro', sound ? '' : 'mute'].filter(Boolean).join('&');
  win.loadURL(`http://127.0.0.1:${port}/tv/${query ? `?${query}` : ''}`);

  let lastMode = controller.tvState().mode;
  controller.onChange(async () => {
    const mode = controller.tvState().mode;
    if (mode === lastMode) return;
    const wasGame = lastMode === 'game' || lastMode === 'launching';
    lastMode = mode;
    if (wasGame && mode !== 'game' && mode !== 'launching') {
      // Back from a game: picker in front again, and pick up new games.
      win.show();
      win.focus();
      app.focus({ steal: true });
      controller.update(await check(false));
    }
  });
  win.on('focus', () => {
    if (controller.tvState().mode === 'game') manager?.focus();
  });

  // On quit: let go of held keys, give PCSX2 a moment to stop, then close up.
  // Without this, a key could stay "pressed" in the OS and PCSX2 could linger.
  let quitting = false;
  app.on('before-quit', event => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    const within = (work: Promise<unknown> | undefined, ms: number) =>
      Promise.race([Promise.resolve(work).catch(() => {}), new Promise(r => setTimeout(r, ms))]);
    void (async () => {
      presser.releaseAll();
      await new Promise(r => setTimeout(r, 100)); // let the key-up reach the helper
      await within(manager?.stop(), 8000);
      bridge.dispose();
      await within(lightSource?.close(), 1000);
      await within(server.close(), 2000);
    })().finally(() => app.exit(0));
  });
})
// A failed start (for example no free port) must be visible, not a silent exit.
.catch(err => {
  dialog.showErrorBox('Buzz Party', `Buzz Party could not start.\n\n${err instanceof Error ? err.message : String(err)}`);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
