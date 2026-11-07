# Buzzer Lights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phones mirror the game's Buzz! buzzer light for their slot, using an optional patched PCSX2 build that reports light changes over local UDP.

**Architecture:** A fork of PCSX2 (pinned to v2.8.2) patches `usb-buzz.cpp` to accept the game's LED report and send `buzzled 1 a b c d` datagrams to `127.0.0.1:<LedUdpPort>`. Buzz Party writes that port into `PCSX2.ini`, listens on it, keeps the 4-light state in the Controller and sends each phone `{ t: 'light', on }` for its slot. Stock PCSX2 ignores the ini key, sends nothing, and everything works as today.

**Tech Stack:** TypeScript (Node, `node:dgram`), `ws`, vitest; plain JS/CSS phone page; PCSX2 C++ fork built with its own GitHub Actions; `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-11-07-buzzer-lights-design.md`

## Global Constraints

- PCSX2 fork: `github.com/nivobi/pcsx2`, branch `buzz-led-udp` off tag `v2.8.2`.
- Datagram format (exact): ASCII `buzzled 1 L1 L2 L3 L4`, each `Ln` is `0` or `1`, single spaces, optional trailing newline.
- Patch sends only to `127.0.0.1`; sends on every change and resends the current state about once a second.
- ini key (exact): `LedUdpPort = <port>` under `[USB1]`; `0` or missing = off.
- Our build names (exact): `PCSX2-BuzzParty.app` (macOS), `pcsx2-buzzparty-*.AppImage` (Linux). Inner macOS executable stays `Contents/MacOS/PCSX2`.
- Phone message (exact): `{ "t": "light", "on": boolean }`.
- Fake light source env var (exact): `BUZZ_FAKE_LIGHTS=1`.
- Stock PCSX2 path must behave exactly as before: no new warnings, problems or UI.
- Buzz Party never strips the macOS quarantine flag.
- No `Co-Authored-By` or AI attribution lines in any commit or PR (this repo and the fork).
- Run all Buzz Party tests with `npm test`; type-check with `npm run build`.

## Review Focus

1. A resend datagram arriving just after the game ended → light stays off (Task 5 test `lights arriving outside a game are ignored`).
2. Garbage or foreign traffic on the UDP port → ignored, no crash, no light change (Task 2 parser tests + `listener ignores junk`).
3. A phone that switches slot mid-game → immediately shows its new slot's light (Task 5 test `lightOf follows the slot`, Task 6 test `a state push also carries the light`).
4. Our build blocked by Gatekeeper / fails to start, stock installed → game starts on stock, and the controller never sees an exit for the failed attempt (Task 4 test `falls back to stock when our build never starts`).
5. Light listener can't bind → Buzz Party still starts, lights just never come (Task 7 wiring: start wrapped in try/catch, `ledUdpPort` omitted).

---

### Task 1: PCSX2 patch — go/no-go spike

Outside this repo. Clone to `~/code/pcsx2`.

**Files (in the fork):**
- Modify: `pcsx2/USB/usb-pad/usb-buzz.cpp`
- Modify: `pcsx2/USB/usb-pad/usb-buzz.h` (state fields, if needed)

**Interfaces:**
- Produces: datagrams per Global Constraints; reads `[USB1] LedUdpPort` via the device's settings (same mechanism the Buzz device uses for its bindings, e.g. `USB::GetConfigInt(si, port, TypeName(), "LedUdpPort", 0)`).

- [ ] **Step 1: Fork and branch**

```bash
gh repo fork PCSX2/pcsx2 --clone=false
git clone https://github.com/nivobi/pcsx2.git ~/code/pcsx2
cd ~/code/pcsx2 && git checkout -b buzz-led-udp v2.8.2 && git submodule update --init --recursive
```

- [ ] **Step 2: Patch `usb-buzz.cpp`**
  - In `buzz_handle_control`: handle HID class `SET_REPORT` (bmRequestType `0x21`, bRequest `0x09`): take bytes 1–4 of the 7-byte payload as lights (non-zero = on), return success instead of falling through to stall.
  - In `buzz_handle_data` `USB_TOKEN_OUT`: same parse if data arrives.
  - When lights change → send datagram. In `buzz_handle_data` (polled constantly on IN) → if ≥1000 ms since last send, resend.
  - POSIX UDP socket, created when `LedUdpPort > 0`, closed on device destroy. Do **not** change the USB descriptors.

- [ ] **Step 3: Build locally (macOS)** following the fork's `.github/workflows/macos_build.yml` (dependency script + cmake). Expected: `PCSX2.app` builds.

- [ ] **Step 4: Verify with a real game**

Set `LedUdpPort = 9876` under `[USB1]` in the ini this build uses, run `nc -ulk 127.0.0.1 9876`, start a Buzz! title and reach the "press your buzzer" screen.
Expected: `buzzled 1 …` lines that change as the game blinks lights. Check two titles. Then confirm buttons still work normally in-game.

- [ ] **Step 5: Gate**

If lights arrive without descriptor changes → commit (`feat(usb-buzz): send Buzz LED state over local UDP`) and push the branch. If they only arrive after a descriptor change → **stop and report to the user**. Do not start Task 3+ fork work, CI, or the upstream PR.

### Task 2: Light parser, listener and fake source

**Files:**
- Create: `src/core/lights.ts`
- Modify: `src/shared/protocol.ts` (add types)
- Test: `test/lights.test.ts`

**Interfaces:**
- Produces (protocol.ts): `export type Lights = readonly [boolean, boolean, boolean, boolean];` and `export type PhoneLight = { t: 'light'; on: boolean };`
- Produces (lights.ts):
  - `export const LIGHTS_OFF: Lights`
  - `export function parseLights(data: Buffer | string): Lights | null`
  - `export function startLightListener(onLights: (l: Lights) => void, o?: { port?: number }): Promise<{ port: number; close(): Promise<void> }>` — binds `udp4` on `127.0.0.1`, default port `0`; calls `onLights` for every valid datagram; swallows socket errors after bind.
  - `export function startFakeLights(onLights: (l: Lights) => void, o?: { intervalMs?: number }): { stop(): void }` — default `intervalMs` 400; cycles a chase (1,2,3,4 one at a time) then all-on/all-off twice, repeating.

- [ ] **Step 1: Write failing tests**

```ts
test('parses a valid datagram', () => {
  expect(parseLights('buzzled 1 1 0 1 0')).toEqual([true, false, true, false]);
  expect(parseLights(Buffer.from('buzzled 1 0 0 0 1\n'))).toEqual([false, false, false, true]);
});
test('rejects anything else', () => {
  for (const s of ['', 'buzzled 2 1 0 1 0', 'buzzled 1 1 0 1', 'buzzled 1 1 0 1 0 1', 'buzzled 1 2 0 0 0', 'hello', 'buzzled 1  1 0 1 0'])
    expect(parseLights(s)).toBeNull();
});
test('listener delivers datagrams sent to 127.0.0.1', async () => {
  const got: Lights[] = [];
  const l = await startLightListener(x => got.push(x));
  // send 'buzzled 1 1 1 0 0' with dgram to 127.0.0.1:l.port, wait until got.length === 1
  expect(got[0]).toEqual([true, true, false, false]);
  await l.close();
});
test('listener ignores junk', async () => {
  // send 'nope' then 'buzzled 1 0 1 0 0'; wait for one delivery
  // expect got to equal [[false, true, false, false]]
});
test('fake lights produce a chase', () => {
  vi.useFakeTimers();
  const got: Lights[] = [];
  const f = startFakeLights(x => got.push(x), { intervalMs: 10 });
  vi.advanceTimersByTime(40);
  expect(got.slice(0, 4)).toEqual([[true,false,false,false],[false,true,false,false],[false,false,true,false],[false,false,false,true]]);
  f.stop(); vi.useRealTimers();
});
```

- [ ] **Step 2: Run** `npx vitest run test/lights.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/lights.ts` and the protocol types. Parser regex: `/^buzzled 1 ([01]) ([01]) ([01]) ([01])\n?$/`.
- [ ] **Step 4: Run** `npx vitest run test/lights.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: light datagram parser, UDP listener and fake light source`

### Task 3: ini writes `LedUdpPort`

**Files:**
- Modify: `src/core/pcsx2-config.ts` (`buildPcsx2Ini`)
- Modify: `src/core/pcsx2-manager.ts` (constructor option, pass-through)
- Test: `test/pcsx2-config.test.ts`

**Interfaces:**
- Produces: `buildPcsx2Ini(template, { biosDir, biosFile, startFullscreen, ledUdpPort?: number })`; `new Pcsx2Manager({ ..., ledUdpPort?: number })`.

- [ ] **Step 1: Failing tests** in `test/pcsx2-config.test.ts`:
  - `'USB1 carries LedUdpPort when given'`: built ini's `[USB1]` section contains line `LedUdpPort = 9876` (and still `Type = BuzzDevice` plus all 20 bindings).
  - `'no LedUdpPort line without a port'`: built ini contains no `LedUdpPort`.
- [ ] **Step 2: Run** `npx vitest run test/pcsx2-config.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: append `LedUdpPort = ${port}` after the bindings in the `usb1.lines` array when `ledUdpPort` is a positive integer; manager passes its option into `buildPcsx2Ini`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: write LedUdpPort for the Buzz device`

### Task 4: Find our build first, fall back to stock

**Files:**
- Modify: `src/core/pcsx2-manager.ts`
- Test: `test/pcsx2-manager.test.ts`, `test/pcsx2-linux.test.ts`

**Interfaces:**
- Produces:
  - `export function isBuzzPartyBuild(path: string): boolean` — basename `PCSX2-BuzzParty.app`, or matches `/^pcsx2-buzzparty.*\.appimage$/i`.
  - `export function findPcsx2Candidates(o?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; home?: string; dirs?: string[]; exists?: (p: string) => boolean }): string[]` — ordered, deduped. macOS: `$PCSX2_PATH` (if exists), `/Applications/PCSX2-BuzzParty.app`, `~/Applications/PCSX2-BuzzParty.app`, `/Applications/PCSX2.app`, `~/Applications/PCSX2.app`. Linux: `$PCSX2_PATH`, then buzzparty AppImages (dir order, newest name first), then other `pcsx2*.AppImage`, then `pcsx2-qt`/`pcsx2` on PATH.
  - `findPcsx2(): string | null` — first candidate (kept for callers). `findLinuxPcsx2` stays, returning the first Linux candidate.
  - `new Pcsx2Manager({ ..., fallbackAppPath?: string })`.
  - macOS `listPids` pgrep pattern: `PCSX2(-BuzzParty)?\.app/Contents/MacOS/PCSX2`.

- [ ] **Step 1: Failing tests**
  - `'mac prefers our build, then stock'`: with `exists` true for `/Applications/PCSX2.app` and `/Applications/PCSX2-BuzzParty.app` → `['/Applications/PCSX2-BuzzParty.app', '/Applications/PCSX2.app']`.
  - `'PCSX2_PATH wins on mac too'`: env `PCSX2_PATH=/x/My.app`, exists true → first element `/x/My.app`.
  - `'linux prefers a buzzparty AppImage'`: dir has `pcsx2-v2.9.0.AppImage` and `pcsx2-buzzparty-2.8.2.AppImage` (both executable) → buzzparty first.
  - `'isBuzzPartyBuild'`: true for `/Applications/PCSX2-BuzzParty.app`, `~/Applications/pcsx2-buzzparty-2.8.2.AppImage`; false for `/Applications/PCSX2.app`.
  - `'falls back to stock when our build never starts'` (manager, fake OS): first `spawnPcsx2` returns a child that emits `exit` immediately with no pid ever appearing; second (fallback) spawn's pid appears. Expect: spawned app paths `['/Ours.app', '/Stock.app']`, `launch` resolves, `m.running === true`, an `onExit` listener was called 0 times.
  - `'no fallback configured: still throws PCSX2 did not start'`.
- [ ] **Step 2: Run** `npx vitest run test/pcsx2-manager.test.ts test/pcsx2-linux.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** The fake `spawnPcsx2` in tests receives `appPath`; record it. In `launch`, a failed primary attempt (no pid) with `fallbackAppPath` set and not cancelled → `console.warn` the reason, mark that child so `exited()` does not notify listeners, spawn the fallback and continue the normal flow.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: prefer the Buzz Party PCSX2 build, fall back to stock if it won't start`

### Task 5: Controller keeps the lights

**Files:**
- Modify: `src/app/controller.ts`
- Test: `test/controller.test.ts`

**Interfaces:**
- Consumes: `Lights`, `LIGHTS_OFF` (Task 2).
- Produces on `Controller`:
  - `setLights(l: Lights): void` — ignored unless mode is `game`/`launching` or `deps.lightsAnyMode` is true; stores and notifies light listeners only when changed.
  - `lightOf(token: string): boolean` — the light for the token's slot; `false` without a slot.
  - `onLights(cb: () => void): void`
  - `ControllerDeps.lightsAnyMode?: boolean`
  - On launch start and in `gameEnded()`: reset to `LIGHTS_OFF`, notify if it changed.

- [ ] **Step 1: Failing tests**
  - `'in game, lightOf follows the slot'`: phones `a`→1, `b`→3, launch, `setLights([true,false,false,false])` → `lightOf('a') === true`, `lightOf('b') === false`, light listener called once.
  - `'same lights again do not notify'`.
  - `'lightOf follows the slot'`: in game, lights `[false,false,true,false]`; `a` leaves and claims 3 → `lightOf('a') === true`.
  - `'game end turns all lights off'`: in game, lights on for slot 1, `runner.crash()` → `lightOf('a') === false`, listener notified.
  - `'lights arriving outside a game are ignored'`: after game end, `setLights([true,true,true,true])` → all false, no notify.
  - `'lightsAnyMode accepts lights in the picker'`.
- [ ] **Step 2: Run** `npx vitest run test/controller.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: controller tracks buzzer lights per slot`

### Task 6: Server sends lights to phones

**Files:**
- Modify: `src/server/server.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: `PhoneLight` (Task 2); `lightOf`/`onLights` (Task 5).
- Produces: `PhoneHub` gains optional `lightOf?(token: string): boolean` and `onLights?(cb: () => void): void`. When present: every state send to a phone is followed by `{ t: 'light', on: hub.lightOf(token) }`; on `onLights`, each open phone socket with a token gets its light message.

- [ ] **Step 1: Failing tests** (extend `FakeHub` with a `lights: Record<string, boolean>` map, `lightOf`, `onLights`, `fireLights()`):
  - `'hello gets state then its light'`: after hello, messages are `[{t:'state',…}, {t:'light', on:false}]`.
  - `'a light change reaches only the phones, with each phone's own value'`: tokens `a` (on) and `b` (off) → `a` gets `{t:'light',on:true}`, `b` gets `{t:'light',on:false}`; a TV socket gets no light message.
  - `'a state push also carries the light'`: `hub.fire()` → state followed by light.
  - `'a hub without lights sends no light messages'` (existing FakeHub).
- [ ] **Step 2: Run** `npx vitest run test/server.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: send each phone its buzzer light`

### Task 7: Phone glow and app wiring

**Files:**
- Modify: `web/phone/phone.js`, `web/phone/phone.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `startLightListener`, `startFakeLights` (Task 2); `ledUdpPort`, `fallbackAppPath`, `findPcsx2Candidates`, `isBuzzPartyBuild` (Tasks 3–4); `setLights`, `lightsAnyMode` (Task 5).

- [ ] **Step 1: Phone.** In `ws.onmessage`, `msg.t === 'light'` → toggle class `lit` on the red button (`.btn.red`) and on `#buzzer`. On `ws.onclose` → remove both. CSS: `.red.lit` bright red glow (stronger radial gradient + red outer `box-shadow`); `#buzzer.lit` soft inset red glow around the screen edges (`box-shadow: inset 0 0 …`). Transitions ≤ 60 ms so fast game blinking stays visible. Nothing else changes when no light message ever arrives.
- [ ] **Step 2: Wiring in `main.ts`.**
  - Candidates → `appPath = c[0]`; `fallbackAppPath = isBuzzPartyBuild(c[0]) ? c.find(p => !isBuzzPartyBuild(p)) : undefined`.
  - `BUZZ_FAKE_LIGHTS=1` → `startFakeLights(l => controller.setLights(l))` and `lightsAnyMode: true`; otherwise `try { lights = await startLightListener(l => controller.setLights(l)) } catch (e) { console.warn(...) }` and pass `ledUdpPort: lights?.port` to `Pcsx2Manager`. The manager is created before the controller today; reorder or use a late-bound callback so `controller` exists when lights arrive.
  - Quit: close the listener / stop the fake source alongside the server close.
- [ ] **Step 3: Verify** `npm run build && npm test` — Expected: both pass.
- [ ] **Step 4: Manual check.** `BUZZ_FAKE_LIGHTS=1 npm start`, join from a phone → red button and screen edge glow in a chase/blink pattern; close the page → reopen → glow resumes. Without the env var and with stock PCSX2: phone looks exactly as before.
- [ ] **Step 5: Commit** `feat: phones glow with the buzzer light`

### Task 8: Fork CI, release, README, upstream PR

**Files:**
- Fork: `.github/workflows/*` (enable / add `workflow_dispatch` packaging that renames artifacts per Global Constraints)
- Modify: `README.md`, `ROADMAP.md`

- [ ] **Step 1: Fork CI.** Enable Actions on `nivobi/pcsx2`; run the existing macOS and Linux AppImage workflows on `buzz-led-udp`; rename outputs to `PCSX2-BuzzParty.app` (zipped) and `pcsx2-buzzparty-2.8.2.AppImage`. Expected: both artifacts download and launch.
- [ ] **Step 2: Release.** `gh release create buzzparty-2.8.2-1 --repo nivobi/pcsx2 …` with both files and notes (what changed, GPL-3, source = this branch).
- [ ] **Step 3: End-to-end.** Install our macOS build, approve "Open Anyway" once, play a Buzz! title through Buzz Party → phones glow with the game's cues; buzzers still work. Remove our build → stock PCSX2 runs, no lights, nothing else different.
- [ ] **Step 4: README.** Optional "Buzzer lights" section: what it does, download link to the release, macOS Privacy & Security → "Open Anyway" step, Rosetta note, stock PCSX2 still works. Tick the roadmap item.
- [ ] **Step 5: Commit** `docs: optional buzzer lights build`
- [ ] **Step 6: Upstream PR (best effort).** Only after Task 1 passed. Add Windows socket support (winsock) so it builds on all PCSX2 platforms, describe it as a general "Buzz LED output over UDP" option, open against `PCSX2/pcsx2` master with `gh pr create`. Not blocking.
