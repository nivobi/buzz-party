# Buzz Party v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A double-click macOS app that shows a Buzz! Junior game picker on the TV, lets up to 4 phones join by QR code as Buzz! buzzers, and runs the picked game in PCSX2 with phone presses arriving as buzzer presses.

**Architecture:** Electron app. Main process holds the core: game scanner, slot manager, controller state machine, PCSX2 manager, an HTTP + WebSocket server for phones, and an input bridge that turns presses into OS key events through a small Swift helper process. PCSX2 reads those keys as its emulated `BuzzDevice`. The TV picker and the phone page are plain HTML/JS with no framework.

**Tech Stack:** Node 24.22.0, TypeScript 7.0.2, Electron 44.9.1, ws 8.22.0, qrcode 1.5.4, vitest 5.0.5, Swift 6.3 (macOS helper), PCSX2 2.8.2.

**Spec:** `docs/superpowers/specs/2026-10-20-buzz-party-design.md`

## Global Constraints

- Node from nvm `v24.22.0`. Prefix commands with `PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH"` if `node -v` shows something else.
- Pin exact dependency versions in `package.json` (no `^`).
- Never commit or bundle BIOS files or game images. `.gitignore` already blocks `*.iso *.bin *.BIN *.chd bios/ games/`.
- The 20-key buzzer map lives in ONE place (`src/shared/keymap.ts`). The PCSX2 config and the bridge both read it.
  P1 `1 Q A Z X` · P2 `2 W S C V` · P3 `3 E D B N` · P4 `4 R F G H` (order: red, blue, orange, green, yellow).
- Phone button order top to bottom: red (big round), blue, orange, green, yellow.
- Max 4 players. Slots are 1–4.
- PCSX2 runs with its own data dir (`-datapath`). The owner's normal PCSX2 config (`~/Library/Application Support/PCSX2`) is never written.
- PCSX2 UI never shows: launch with `-batch -nogui`, and config sets `SetupWizardIncomplete = false`, `ConfirmShutdown = false`.
- v1 is verified on macOS only. Code outside `src/bridge/mac.ts`, `native/mac/` and the macOS branch of `src/core/pcsx2-manager.ts` must not assume macOS.
- User data folder: `~/BuzzParty/` with `Games/`, `BIOS/`, `Covers/`, and the hidden PCSX2 data dir `.pcsx2/`.
- Default BIOS when several are present: the file whose name contains `SCPH-70004`, otherwise the first `.bin` (case-insensitive) alphabetically.
- Slot frees after its phone has been disconnected for 90 s.
- Minimum key hold: 50 ms (a quicker tap is held until 50 ms have passed).
- HTTP/WS port 8420, falling back to 8421–8429 if taken.

## Review Focus

1. **A phone drops mid-press** (Wi-Fi blip, screen lock while holding red): its held keys must be released immediately, never stuck down. *Test in Task 5 (`releaseAll`) and Task 7 (disconnect releases).*
2. **Junk in the Games folder** (a `.txt`, a corrupt or truncated ISO, a `.chd`, a subfolder): the scan skips or falls back to the filename and never throws. *Test in Task 2.*
3. **PCSX2 exits on its own** (crash, or quit some other way): the app goes back to the picker, and phones return to picker mode. *Test in Task 7 (`onGameExit`).*
4. **Wrong network interface in the QR code** (Docker `172.17.x`, Tailscale `100.x`, link-local `169.254.x`, IPv6 only): the chosen IP is the Wi-Fi/Ethernet LAN address. With no LAN address, the TV says so instead of showing a dead QR code. *Test in Task 4.*
5. **Two people press at once, or one phone with two fingers**: every key is independent, and one key's release doesn't release another. *Test in Task 5.*

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts
src/shared/keymap.ts          Buttons, the 20-key table, macOS virtual key codes
src/shared/protocol.ts        Phone<->server and main->TV message types
src/core/iso.ts               Read SYSTEM.CNF out of an ISO9660 image → serial
src/core/titles.ts            Known Buzz! Junior serials → titles
src/core/games.ts             Scan Games folder → Game[]
src/core/slots.ts             Player slot claim/reconnect/timeout (pure, injected clock)
src/core/lan-ip.ts            Pick the LAN IPv4 for the QR code (pure)
src/core/pcsx2-config.ts      Patch the PCSX2 template ini (pure)
src/core/pcsx2-manager.ts     Find PCSX2, write config, launch/stop, exit callback
src/core/paths.ts             ~/BuzzParty folders, BIOS picking
src/bridge/types.ts           KeyBridge interface
src/bridge/presser.ts         Slot/button → keys, held-set, min-hold, releaseAll
src/bridge/fake.ts            Recording KeyBridge for tests
src/bridge/mac.ts             KeyBridge over the Swift helper
native/mac/buzzhelper.swift   stdin command helper: key down/up, focus, place, trust
src/app/controller.ts         State machine: setup/picker/waiting/game
src/server/server.ts          HTTP static (web/phone) + WebSocket /ws
src/main.ts, src/preload.ts   Electron main, TV window on the right display
web/phone/{index.html,phone.css,phone.js}
web/tv/{index.html,tv.css,tv.js}
resources/pcsx2/PCSX2.template.ini
test/*.test.ts
```

---

### Task 1: Project scaffold + key map

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/shared/keymap.ts`
- Test: `test/keymap.test.ts`

**Interfaces:**
- Produces:
  - `type Button = 'red' | 'blue' | 'orange' | 'green' | 'yellow'`
  - `const BUTTONS: readonly Button[]` in phone order (red, blue, orange, green, yellow)
  - `type Slot = 1 | 2 | 3 | 4`, `const SLOTS: readonly Slot[]`
  - `type KeyName` = one of the 20 key characters (`'1'`, `'Q'`, …)
  - `keyFor(slot: Slot, button: Button): KeyName`
  - `const MAC_KEYCODES: Record<KeyName, number>` (kVK_ANSI codes)
  - `pcsx2BindingName(slot: Slot, button: Button): string` → e.g. `'BuzzDevice_Red1'`

- [ ] **Step 1: Scaffold.** `npm init -y`, then set `"type": "module"`, `"main": "dist/main.js"`, scripts `build` (`tsc -p .`), `test` (`vitest run`), `start` (`npm run build && electron .`). Install exact: `electron@44.9.1 typescript@7.0.2 vitest@5.0.5 @types/ws` (dev), `ws@8.22.0 qrcode@1.5.4` (deps). tsconfig: `module`/`moduleResolution` `NodeNext`, `target` `ES2023`, `outDir` `dist`, `rootDir` `src`, `strict`. Add `dist/` and `node_modules/` to `.gitignore` (already there).

- [ ] **Step 2: Write the failing test** `test/keymap.test.ts`

```ts
import { keyFor, MAC_KEYCODES, pcsx2BindingName, BUTTONS, SLOTS } from '../src/shared/keymap.js';
test('spec key map', () => {
  expect(SLOTS.map(s => BUTTONS.map(b => keyFor(s, b)).join(''))).toEqual(['1QAZX', '2WSCV', '3EDBN', '4RFGH']);
});
test('all 20 keys distinct and have mac codes', () => {
  const keys = SLOTS.flatMap(s => BUTTONS.map(b => keyFor(s, b)));
  expect(new Set(keys).size).toBe(20);
  for (const k of keys) expect(typeof MAC_KEYCODES[k]).toBe('number');
  expect(MAC_KEYCODES['1']).toBe(0x12); expect(MAC_KEYCODES['Q']).toBe(0x0C); expect(MAC_KEYCODES['N']).toBe(0x2D);
});
test('pcsx2 binding names', () => {
  expect(pcsx2BindingName(1, 'red')).toBe('BuzzDevice_Red1');
  expect(pcsx2BindingName(4, 'yellow')).toBe('BuzzDevice_Yellow4');
});
```

- [ ] **Step 3: Run** `npx vitest run test/keymap.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement `src/shared/keymap.ts`.** Mac codes: `1`0x12 `2`0x13 `3`0x14 `4`0x15 `Q`0x0C `W`0x0D `E`0x0E `R`0x0F `A`0x00 `S`0x01 `D`0x02 `F`0x03 `Z`0x06 `X`0x07 `C`0x08 `V`0x09 `B`0x0B `N`0x2D `G`0x05 `H`0x04.
- [ ] **Step 5: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: scaffold project and buzzer key map`.

---

### Task 2: ISO serial reader, titles, game scan

**Files:**
- Create: `src/core/iso.ts`, `src/core/titles.ts`, `src/core/games.ts`
- Test: `test/iso.test.ts`, `test/games.test.ts`, fixture builder `test/helpers/make-iso.ts`

**Interfaces:**
- Produces:
  - `readSerial(isoPath: string): Promise<string | null>`: `'SCUS-97597'` or null if it can't be read
  - `parseBoot2(systemCnf: string): string | null`: `'BOOT2 = cdrom0:\\SCUS_975.97;1'` → `'SCUS-97597'`
  - `titleFor(serial: string | null, fileName: string): string`
  - `interface Game { id: string; path: string; serial: string | null; title: string }` (`id` = serial ?? file name)
  - `scanGames(dir: string): Promise<Game[]>`, sorted by title

- [ ] **Step 1: Write a fixture helper** `makeIso(files: Record<string,string>): Buffer` in `test/helpers/make-iso.ts`. It builds a minimal ISO9660 image: system area of 16 empty sectors, a PVD at sector 16 (type 1, `CD001`, root directory record at byte 156), a terminator at sector 17, the root directory at sector 18, and file data after it. Each file name is stored as `NAME;1`.
- [ ] **Step 2: Write failing tests.**

```ts
test('parseBoot2', () => {
  expect(parseBoot2('BOOT2 = cdrom0:\\SCUS_975.97;1 \r\nVER = 1.00')).toBe('SCUS-97597');
  expect(parseBoot2('VER = 1.00')).toBeNull();
});
test('readSerial from iso', async () => {
  const p = tmpFile(makeIso({ 'SYSTEM.CNF': 'BOOT2 = cdrom0:\\SLES_123.45;1\n' }));
  expect(await readSerial(p)).toBe('SLES-12345');
});
test('readSerial on junk/truncated returns null', async () => {
  expect(await readSerial(tmpFile(Buffer.from('nope')))).toBeNull();
  expect(await readSerial(tmpFile(makeIso({ 'SYSTEM.CNF': 'x' }).subarray(0, 40000)))).toBeNull();
});
test('scanGames skips junk, falls back to file name', async () => {
  // dir: RoboJam.iso (SCUS-97597), notes.txt, broken.iso (junk), Other.chd, sub/ (folder)
  const games = await scanGames(dir);
  expect(games.map(g => [g.title, g.serial])).toEqual([
    ['Buzz! Junior: RoboJam', 'SCUS-97597'], ['broken', null], ['Other', null]]);
});
```
- [ ] **Step 3: Run** `npx vitest run test/iso.test.ts test/games.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `readSerial`: read the PVD and the root directory record (extent LBA = LE u32 at +2, size = LE u32 at +10). Walk the records to find `SYSTEM.CNF;1`, read it, then call `parseBoot2`. Any error or out-of-range read returns `null`.
  - `scanGames`: accepts `.iso .chd .cso .bin .gz` (case-insensitive) files at top level only, and calls `readSerial` for `.iso` only.
  - `titles.ts`: the known Buzz! Junior serials (all regions, looked up from PCSX2's GameDB `resources/GameIndex.yaml` inside `/Applications/PCSX2.app/Contents/Resources/`), mapped to `'Buzz! Junior: RoboJam'` style names. Must include `SCUS-97597`. For unknown serials, use the file name without its extension.
- [ ] **Step 5: Run** `npx vitest run`. Expected: PASS.
- [ ] **Step 6: Verify against the real disc:** `npx tsx -e "import('./src/core/iso.ts').then(m=>m.readSerial(process.env.HOME+'/Downloads/Buzz! Junior - RoboJam (USA) (En,Fr,Es).iso').then(console.log))"` (install `tsx` dev if needed). Expected: `SCUS-97597`.
- [ ] **Step 7: Commit** `feat: game scan with ISO serial detection`.

---

### Task 3: Slot manager

**Files:**
- Create: `src/core/slots.ts`
- Test: `test/slots.test.ts`

**Interfaces:**
- Produces: `class SlotManager { constructor(opts: { now: () => number; releaseAfterMs: number }) }` with
  - `connect(token: string): Slot | null`: marks the token connected and returns its slot if it holds one
  - `claim(token: string, slot: Slot): boolean`: ok if the slot is free or already held by this token. A token holds at most one slot, so claiming a new one releases the old one.
  - `release(token: string): void`
  - `disconnect(token: string): void`: keeps the slot and stamps the time
  - `sweep(): Slot[]`: frees slots disconnected for at least `releaseAfterMs` and returns the freed slots
  - `view(): { slot: Slot; taken: boolean; connected: boolean }[]`
  - `slotOf(token: string): Slot | null`

- [ ] **Step 1: Write failing tests:** claim a free slot → true. Claim a slot held by another token → false. Same-token reclaim → true. Claiming slot 3 while holding slot 1 frees slot 1. Disconnect and reconnect within 90 s → `connect` returns the same slot. Disconnect, advance 90 000 ms, `sweep()` → `[slot]` and the slot is free. A reconnect at 89 999 ms keeps the slot. `view()` shows taken/connected flags.
- [ ] **Step 2: Run** `npx vitest run test/slots.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `SlotManager`** with a `Map<Slot, { token; disconnectedAt: number | null }>`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: player slot manager with reconnect and timeout`.

---

### Task 4: LAN IP picker

**Files:**
- Create: `src/core/lan-ip.ts`
- Test: `test/lan-ip.test.ts`

**Interfaces:**
- Produces: `pickLanIp(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>, defaultIface?: string): string | null`, plus `defaultRouteInterface(): Promise<string | undefined>`. The latter runs `route -n get default` on macOS and reads the `interface:` line. On other OSes, or if it fails, it returns `undefined`.

- [ ] **Step 1: Write failing tests** with fake interface dicts:
  - `en0 192.168.0.23` + `docker0 172.17.0.1` + `utun4 100.101.1.2` + `lo0 127.0.0.1` → `'192.168.0.23'`
  - when `defaultIface = 'en7'` (USB Ethernet `10.0.0.5`) and `en0` also exists → `'10.0.0.5'`
  - only `169.254.3.4` and `::1` → `null`
  - `bridge100 192.168.64.1` (VM bridge) + `en0 192.168.1.9` → `'192.168.1.9'`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep IPv4 only, non-internal. Drop `127.*`, `169.254.*` and `100.64.0.0/10` (CGNAT/Tailscale). Drop interfaces named `docker*`, `br-*`, `veth*`, `utun*`, `bridge*`, `vmnet*`, `vboxnet*` and `tailscale*`. Prefer `defaultIface`, then names `en*`/`eth*`/`wl*`, then RFC1918, then the first remaining.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: LAN IP selection for join QR`.

---

### Task 5: Key presser (held keys, min hold, releaseAll)

**Files:**
- Create: `src/bridge/types.ts`, `src/bridge/fake.ts`, `src/bridge/presser.ts`
- Test: `test/presser.test.ts`

**Interfaces:**
- Consumes: `keyFor`, `Slot`, `Button`, `KeyName` (Task 1)
- Produces:
  - `interface KeyBridge { keyDown(k: KeyName): void; keyUp(k: KeyName): void; focusPid(pid: number): void; placeWindow(pid: number, r: { x: number; y: number; width: number; height: number }): Promise<boolean>; toggleFullscreen(): void; isTrusted(prompt: boolean): Promise<boolean>; dispose(): void }`
  - `class FakeBridge implements KeyBridge { events: string[] }`: records `'down:Q'`, `'up:Q'`, and so on
  - `class Presser { constructor(bridge: KeyBridge, opts: { minHoldMs: number }); press(slot: Slot, b: Button): void; release(slot: Slot, b: Button): void; releaseAll(slot?: Slot): void }`

- [ ] **Step 1: Write failing tests** (vitest fake timers):
  - press then release after 200 ms → `['down:1','up:1']`
  - press then release after 5 ms → `up` is sent only once 50 ms have passed since the down
  - P1 red + P2 red together, release P1 → `'up:2'` was never sent
  - same phone holding blue and green, release blue → green stays down
  - repeated `press` of a held key sends no second `down`
  - `releaseAll(1)` while P1 holds red and yellow → both `up`, P2's keys untouched
  - `releaseAll()` with no argument releases everything (used on game stop)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `Presser`. It keeps `Map<KeyName, downAt>` and delays an early `release` until `minHoldMs` has passed.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: key presser with min-hold and release-all`.

---

### Task 6: PCSX2 config patcher + manager

**Files:**
- Create: `resources/pcsx2/PCSX2.template.ini`, `src/core/pcsx2-config.ts`, `src/core/paths.ts`, `src/core/pcsx2-manager.ts`
- Test: `test/pcsx2-config.test.ts`, `test/paths.test.ts`

**Interfaces:**
- Consumes: `pcsx2BindingName`, `keyFor`, `SLOTS`, `BUTTONS` (Task 1)
- Produces:
  - `buildPcsx2Ini(template: string, o: { biosDir: string; biosFile: string; startFullscreen: boolean }): string`
  - `paths(home?: string): { root; games; bios; covers; pcsx2Data }` and `ensureFolders(): Promise<void>`
  - `pickBios(files: string[]): string | null`
  - `findPcsx2(): string | null` (macOS: `/Applications/PCSX2.app`, `~/Applications/PCSX2.app`)
  - `class Pcsx2Manager { constructor(o: { appPath: string; dataDir: string; template: string; bridge: KeyBridge }); launch(game: Game, o: { biosDir; biosFile; tvBounds?: Rect }): Promise<void>; stop(): Promise<void>; get running(): boolean; onExit(cb: () => void): void; focus(): void }`

- [ ] **Step 1: Create the template.** Copy `~/Library/Application Support/PCSX2/inis/PCSX2.ini.default`, which PCSX2 2.8.2 generated itself on 2026-10-20, to `resources/pcsx2/PCSX2.template.ini`. Set `[GameList] Paths =` to empty so no personal paths get committed.
- [ ] **Step 2: Write failing tests** for `buildPcsx2Ini` on the template. The output must:
  - set `SetupWizardIncomplete = false`, `ConfirmShutdown = false`, `HideMouseCursor = true`, `PauseOnFocusLoss = false`
  - set `StartFullscreen` from the option
  - set `[Folders] Bios = <biosDir>` and `[Filenames] BIOS = <biosFile>`
  - set `[USB1] Type = BuzzDevice` with all 20 `BuzzDevice_<Color><n> = Keyboard/<key>` lines matching `keyFor`
  - leave no `Keyboard/` binding under `[Pad1]`
  - make sure no other section binds any of the 20 buzzer keys, by asserting that every `= Keyboard/<K>` with K among the 20 sits inside `[USB1]`
  - add `[AutoUpdater] CheckAtStartup = false`
  - keep `SettingsVersion = 1`
  - not touch other sections, e.g. `[EmuCore/GS]` stays byte-identical

  `pickBios(['SCPH-30003.BIN','SCPH-70004_BIOS_V12_EUR_200.BIN','x.NVM'])` → the 70004 file. `pickBios(['a.txt'])` → null.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement** `buildPcsx2Ini` as a section-aware line patcher (keep line order, set or add keys in a section, drop the `Keyboard/` keys in `[Pad1]`), then `pickBios` and `paths`.
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Implement `Pcsx2Manager`.**
  - `launch` writes `<dataDir>/inis/PCSX2.ini`, then runs `open -n -W -a <appPath> --args -batch -nogui -datapath <dataDir> -- <iso>`. Keep that child, since `-W` makes it exit when PCSX2 quits; that drives `onExit`. Find PCSX2's pid with `pgrep -n -f "PCSX2.app/Contents/MacOS/PCSX2"`.
  - If `tvBounds` is given: launch with `startFullscreen: false`, wait until the window exists (retry `placeWindow` for up to 10 s), then `placeWindow(pid, tvBounds)` and `toggleFullscreen()`. Otherwise launch with `startFullscreen: true`.
  - After launch, call `focusPid(pid)`.
  - `stop` sends SIGTERM to the pid, then SIGKILL after 5 s if it's still alive.
- [ ] **Step 7: Commit** `feat: PCSX2 config generation and process manager`.

---

### Task 7: Controller state machine

**Files:**
- Create: `src/shared/protocol.ts`, `src/app/controller.ts`
- Test: `test/controller.test.ts`

**Interfaces:**
- Consumes: `SlotManager` (T3), `Presser` (T5), `Game` (T2), and a `GameRunner = { launch(game: Game): Promise<void>; stop(): Promise<void>; onExit(cb: () => void): void }` (define this type in `controller.ts`). `main.ts` (T10) adapts `Pcsx2Manager` to it by binding the BIOS and `tvBounds`. A rejected `launch` returns the controller to picker/waiting and adds the error to `problems` for that view.
- Produces:
  - `type PhoneMsg = { t: 'hello'; token: string } | { t: 'claim'; slot: Slot } | { t: 'btn'; b: Button; down: boolean } | { t: 'menu'; action: 'back' | 'off' | 'leave' }`
  - `type Mode = 'setup' | 'picker' | 'waiting' | 'launching' | 'game'`
  - `type PhoneState = { t: 'state'; mode: Mode; you: Slot | null; slots: { slot: Slot; taken: boolean; connected: boolean }[]; joinUrl: string; qr: string }`
  - `type TvState = { mode: Mode; games: Game[]; selected: number; slots: PhoneState['slots']; joinUrl: string | null; qr: string | null; problems: string[]; gameTitle: string | null }`
  - `class Controller { constructor(d: { slots; presser; pcsx2; games: Game[]; problems: string[]; join: { url: string; qr: string } | null; quit: () => void }); phone(token: string, msg: PhoneMsg): void; disconnected(token: string): void; tick(): void; tvState(): TvState; phoneState(token: string): PhoneState; onChange(cb: () => void): void }`

  `problems` non-empty → mode `'setup'`. Exactly 1 game → `'waiting'`, otherwise `'picker'`.

- [ ] **Step 1: Write failing tests** with fakes:
  - picker: P1 orange moves `selected` +1 (wraps), blue −1, red launches `games[selected]` → mode `'launching'`, then `'game'` once `launch` resolves
  - a phone without a slot pressing buttons → ignored
  - waiting: red from any joined player launches the single game, and blue/orange do nothing
  - game: `btn down`/`up` calls `presser.press/release(slot, b)`
  - game + `disconnected(token)` → `presser.releaseAll(slot)` *(Review Focus 1)*
  - game + `menu back` → `pcsx2.stop()`, `presser.releaseAll()`, mode back to picker/waiting
  - fake pcsx2 fires `onExit` while in game → mode back to picker/waiting and `releaseAll()` *(Review Focus 3)*
  - `menu off` in picker calls `quit`, and in game it's ignored
  - `menu leave` releases the slot
  - every state change calls the `onChange` listeners
  - `tick()` calls `slots.sweep()`, and freeing a slot triggers `onChange`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `Controller`.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller state machine`.

---

### Task 8: Phone server + phone page

**Files:**
- Create: `src/server/server.ts`, `web/phone/index.html`, `web/phone/phone.css`, `web/phone/phone.js`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `Controller` (T7), protocol types (T7)
- Produces: `startServer(c: Controller, o: { webDir: string; port: number; maxPort: number }): Promise<{ port: number; close(): Promise<void> }>`. It serves `webDir` at `/` and runs a WebSocket at `/ws`. On connect, the first message must be `hello`. The server pushes `phoneState(token)` to each socket on every controller change. Socket close calls `c.disconnected(token)`.

- [ ] **Step 1: Write failing tests** (real server on port 0 with a fake controller and a `ws` client):
  - GET `/` returns the HTML
  - `hello` → receives `state`
  - `claim` and `btn` messages reach `controller.phone`
  - closing the socket → `disconnected` called
  - when the port is busy, the server takes the next one
  - a message that isn't JSON, or has an unknown `t`, is ignored and doesn't close the socket
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement the server** with `node:http` and `ws`. Static files only from `webDir`, with path traversal rejected.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Build the phone page** in plain JS, layout per the spec (player strip, then the red round button at about 40% height, then blue/orange/green/yellow bars).
  - Token in `localStorage` (try/catch, falling back to an in-memory token). Reconnects with backoff.
  - Slot picker screen shows taken slots greyed.
  - Buttons send on `pointerdown`/`pointerup`/`pointercancel`/`pointerleave` with `setPointerCapture`.
  - `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`, viewport `user-scalable=no`, prevent `contextmenu`.
  - `navigator.vibrate?.(30)` on press.
  - Wake Lock via `navigator.wakeLock?.request('screen')`, re-requested on `visibilitychange`.
  - "⋯" menu: Back to games (confirm, in game only), Invite a player (shows `state.qr`), Change player (`leave`), Turn off Buzz Party (confirm, picker/waiting only).
  - When the page goes hidden, send `btn up` for anything held.
- [ ] **Step 6: Manual check.** Run a scratch script that starts the server with a logging fake controller, open `http://<LAN-IP>:8420` on a phone, and confirm presses log `down`/`up` with holds.
- [ ] **Step 7: Commit** `feat: phone server and buzzer page`.

---

### Task 9: macOS Swift helper + MacBridge

**Files:**
- Create: `native/mac/buzzhelper.swift`, `src/bridge/mac.ts`; modify `package.json` (script `build:helper`)

**Interfaces:**
- Consumes: `KeyBridge`, `MAC_KEYCODES` (T1/T5)
- Produces: `class MacBridge implements KeyBridge { constructor(helperPath: string) }`. Helper protocol is one command per stdin line, and each command answers one stdout line:
  - `down <code>` / `up <code>` → `ok`. Posts CGEvent keyboard events, HID tap.
  - `focus <pid>` → `ok|fail`. NSRunningApplication activate.
  - `place <pid> <x> <y> <w> <h>` → `ok|fail`. AX: position and size of the first window.
  - `fullscreen` → `ok`. Option down, Return down/up, Option up: PCSX2's ToggleFullscreen hotkey.
  - `trust <0|1>` → `yes|no`. Calls `AXIsProcessTrustedWithOptions`, and with `1` it prompts.

- [ ] **Step 1: Write the helper.** `build:helper` = `swiftc -O native/mac/buzzhelper.swift -o build/buzzhelper`. Run it, then run `printf 'trust 0\n' | build/buzzhelper`. Expected: `yes` (the terminal already has Accessibility from the spike).
- [ ] **Step 2: Implement `MacBridge`.** It spawns the helper once and queues commands. `keyDown`/`keyUp` fire and forget. If the helper dies, respawn it once.
- [ ] **Step 3: Manual integration check with the real game.** Start RoboJam through `Pcsx2Manager` (Task 6) in a scratch script, using the BIOS from `~/BuzzParty/BIOS` (copy `SCPH-70004_BIOS_V12_EUR_200.*` there). Then use `Presser` + `MacBridge` to send P1 orange, wait 1 s, send P1 blue, then P1 red. Expected: the language highlight moves down, moves up, and confirms. Also try P2 orange (`S`) and check the game reacts once player 2 is in play. Take screenshots with `screencapture -x`.
- [ ] **Step 4: Commit** `feat: macOS input helper and bridge`.

---

### Task 10: Electron main + TV screens

**Files:**
- Create: `src/main.ts`, `src/preload.ts`, `web/tv/index.html`, `web/tv/tv.css`, `web/tv/tv.js`
- Test: `test/display.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `chooseDisplay(displays: { id: number; internal: boolean; bounds: Rect }[]): { display; external: boolean }`. It returns the first non-internal display when there are 2 or more, otherwise the only one. Preload exposes `window.buzz.onState(cb: (s: TvState) => void)`.

- [ ] **Step 1: Write the failing test** for `chooseDisplay`: [internal, external] → external with `external: true`; [internal] → internal with `external: false`. Mirroring shows up as one display, so it's the same as the single-display case.
- [ ] **Step 2: Run.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Wire up `main.ts`:**
  1. `ensureFolders()`.
  2. Find PCSX2, the BIOS (`pickBios` over `paths().bios`) and the games, and collect `problems` with friendly text:
     - "PCSX2 isn't installed"
     - "Put your PS2 BIOS file in ~/BuzzParty/BIOS"
     - "Put your games in ~/BuzzParty/Games"
     - "Allow Buzz Party in System Settings → Privacy & Security → Accessibility", checked with `bridge.isTrusted(true)`
  3. LAN IP → `joinUrl` + `qrcode.toDataURL`, or a problem "Not connected to Wi-Fi".
  4. Build the `Controller`, `startServer`, and run `setInterval(tick, 5000)`.
  5. Create a frameless fullscreen `BrowserWindow` on `chooseDisplay(...)` and push `tvState` on every change.
  6. In game mode, if the window gains focus, call `pcsx2.focus()`. When leaving game mode, show and focus the window.
  7. Pass `tvBounds` to `launch` only when `external` is true.
  8. Re-scan games and problems whenever mode returns to setup/picker. In setup mode, a "Check again" button and a 5 s re-check.
- [ ] **Step 6: Build the TV page:**
  - **setup screen:** list of problems, each with a one-line fix. Also mentions the firewall "Allow incoming connections" prompt.
  - **picker:** big cards. Title text on a Buzz-colored background, or `~/BuzzParty/Covers/<serial>.(png|jpg)` if present, loaded via a `buzz-cover://` protocol registered in main. The selected card is clearly highlighted. QR code and URL on the right, plus 4 player badges (joined/empty).
  - **waiting:** single game, QR code, players, "Press RED to start".
  - **launching:** "Starting <title>…".
  - **game:** plain black, since PCSX2 covers it.
  - Text readable from 3 m: base size at least 28 px at 1080p.
- [ ] **Step 7: Manual check on the Mac, lid open, HDMI to the TV, extended desktop:**
  1. `npm start` → picker on the TV.
  2. Two phones join.
  3. Navigate with phones.
  4. Pick RoboJam → it plays on the TV, fullscreen, and buzzers work for both players.
  5. "Back to games" from a phone → picker returns.
  6. Repeat with mirroring on.
- [ ] **Step 8: Commit** `feat: Electron app with TV picker`.

---

### Task 11: Package as a double-click app

**Files:**
- Modify: `package.json` (add `electron-builder` dev dep, pinned to its latest version at install time, and a `dist` script), create `build/entitlements.mac.plist` if needed

- [ ] **Step 1: Configure electron-builder.** macOS `dir` + `dmg` targets for the host arch, app name "Buzz Party", `extraResources` = `build/buzzhelper` and `resources/pcsx2/`, `files` = `dist/**`, `web/**`. Ad-hoc signing (`identity: null`) is fine for personal use.
- [ ] **Step 2: Build** with `npm run build:helper && npm run build && npx electron-builder --mac dir`. Expected: `dist-app/mac-arm64/Buzz Party.app`.
- [ ] **Step 3: First run:** move it to `/Applications` and double-click. Expected:
  - The setup screen asks for Accessibility for "Buzz Party". Grant it, then "Check again".
  - macOS asks about incoming connections. Allow.
  - The picker appears.
- [ ] **Step 4: Full evening rehearsal** with 4 phones (at least one iPhone and one Android), on the TV:
  - Join via QR.
  - Lock one phone mid-game, unlock it, and check it's the same player.
  - Kill one phone's Wi-Fi for 2 min and check its slot frees.
  - Invite a player from a phone.
  - Back to games, then Turn off.
  - Note anything iOS Safari doesn't support over plain HTTP (vibration, Wake Lock) in `docs/notes/ios.md`.
- [ ] **Step 5: Commit** `build: package Buzz Party for macOS`.
