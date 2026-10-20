import { app, BrowserWindow, screen } from 'electron';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { Controller, type GameRunner, type Join } from './app/controller.js';
import { chooseDisplay, shouldRecheck } from './app/display.js';
import { FakeBridge } from './bridge/fake.js';
import { MacBridge } from './bridge/mac.js';
import { Presser } from './bridge/presser.js';
import type { KeyBridge } from './bridge/types.js';
import { scanGames, type Game } from './core/games.js';
import { defaultRouteInterface, pickLanIp } from './core/lan-ip.js';
import { ensureFolders, paths, pickBios } from './core/paths.js';
import { findPcsx2, Pcsx2Manager } from './core/pcsx2-manager.js';
import { SlotManager } from './core/slots.js';
import { startServer } from './server/server.js';

const PORT = 8420;
const MAX_PORT = 8429;

const resources = app.isPackaged ? process.resourcesPath : app.getAppPath();
const helperPath = app.isPackaged ? join(resources, 'buzzhelper') : join(resources, 'build', 'buzzhelper');
const templatePath = join(resources, app.isPackaged ? 'pcsx2' : 'resources/pcsx2', 'PCSX2.template.ini');
const webDir = join(app.getAppPath(), 'web');

app.whenReady().then(async () => {
  const p = paths();
  await ensureFolders(p);

  const bridge: KeyBridge = process.platform === 'darwin' ? new MacBridge(helperPath) : new FakeBridge();
  const presser = new Presser(bridge, { minHoldMs: 50 });
  const slots = new SlotManager({ now: Date.now, releaseAfterMs: 90_000 });
  const pcsx2Path = findPcsx2();
  const manager = pcsx2Path
    ? new Pcsx2Manager({ appPath: pcsx2Path, dataDir: p.pcsx2Data, template: readFileSync(templatePath, 'utf8'), bridge })
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

  let port = PORT;
  async function check(promptTrust: boolean): Promise<{ games: Game[]; problems: string[]; join: Join | null }> {
    const problems: string[] = [];
    if (!pcsx2Path) problems.push('PCSX2 isn’t installed. Install it from pcsx2.net (or `brew install --cask pcsx2`).');
    biosFile = pickBios(await readdir(p.bios).catch(() => []));
    if (!biosFile) problems.push(`Put your PS2 BIOS file in ${p.bios}`);
    const games = await scanGames(p.games);
    if (games.length === 0) problems.push(`Put your games in ${p.games}`);
    if (!(await bridge.isTrusted(promptTrust))) {
      problems.push('Allow Buzz Party in System Settings → Privacy & Security → Accessibility');
    }
    const ip = pickLanIp(networkInterfaces(), await defaultRouteInterface());
    let join: Join | null = null;
    if (ip) {
      const url = `http://${ip}:${port}/`;
      join = { url, qr: await QRCode.toDataURL(url, { margin: 1, width: 512 }) };
    } else {
      problems.push('Not connected to Wi-Fi. Connect this computer to the same Wi-Fi as the phones.');
    }
    return { games, problems, join };
  }

  const controller = new Controller({ slots, presser, runner, games: [], problems: ['Starting…'], join: null, quit: () => app.quit() });
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
  win.loadURL(`http://127.0.0.1:${port}/tv/`);

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

  app.on('before-quit', () => {
    void manager?.stop();
    bridge.dispose();
    void server.close();
  });
});

app.on('window-all-closed', () => app.quit());
