# Buzzer lights on phones — design

## Intent

Real Buzz! handsets have a light in the big red button. The game switches it
on and off to cue players: blinking for "press to join", lit for whoever buzzed
first, lit for whose turn it is, flashing on results. Players read these cues
without looking at the TV. Buzz Party phones currently show nothing, so those
cues are lost.

Goal: when a game lights player N's buzzer, player N's phone lights up the same
way, at the same moment.

Research summary (2026-11-07):

- The light is purely an output. The game sends a 7-byte HID output report:
  `[0x00, L1, L2, L3, L4, 0x00, 0x00]`, `0xFF` = on, `0x00` = off. The game
  never reads light state back, so games cannot break without it.
- Stock PCSX2 (`pcsx2/USB/usb-pad/usb-buzz.cpp`) throws the report away:
  interrupt OUT data is accepted and dropped (`case USB_TOKEN_OUT: break;`),
  and a class `SET_REPORT` control request is not handled and most likely
  stalls (inferred from the code, not traced through the USB core). The
  emulated descriptor declares no OUT endpoint, so games probably send lights
  via `SET_REPORT`.
- So the light data never leaves PCSX2 today. Getting it requires a patched
  PCSX2.

## Goals

- Phones mirror the game's buzzer light for their slot, live.
- Works with a patched PCSX2 build that we publish ("Buzz Party PCSX2").
- A regular PCSX2 install keeps working exactly as now, just without lights.
- No setup for players: if our build is installed, lights work.

## Non-goals

- Lights on the TV screen (the game already shows everything on screen).
- Phone vibration (games blink fast; iOS web can't vibrate anyway).
- Windows (Buzz Party doesn't support it).
- Restoring light state after loading a save state (PCSX2 doesn't save it;
  the light corrects itself the next time the game changes it).
- Tracking PCSX2 releases. We pin one version and upgrade on purpose.

## Anti-goals (failure even if it "works")

- Stock PCSX2 users see any change, warning or breakage.
- A light stays stuck on after the game ends or PCSX2 dies.
- Visible lag between the game's cue and the phone (target: well under 100 ms
  on a home LAN).
- The patch changes gameplay or input behaviour in any way.
- The patched PCSX2 sends anything off the local machine.

## How it works

```
game ──SET_REPORT──▶ patched usb-buzz.cpp ──UDP 127.0.0.1──▶ Buzz Party
                                                            │
                                         per-slot {t:'light'} over WebSocket
                                                            ▼
                                                     phone N glows
```

### 1. PCSX2 fork and patch

- Public fork of PCSX2 on GitHub (the user's account), branch off one pinned
  release tag. *(Our call: pin 2.8.2, the version currently installed via brew
  and that `resources/pcsx2/PCSX2.template.ini` works with. Builder confirms
  the template still works with it.)*
- Patch, in `pcsx2/USB/usb-pad/usb-buzz.cpp` only where possible:
  - Handle the HID class `SET_REPORT` (output) request on the Buzz device:
    read the 4 light bytes, report success. Real hardware accepts this
    request, so accepting it is more faithful than stalling. Also read
    interrupt OUT data if any arrives.
  - When the 4 light values change, send them to a local UDP port. Also
    resend the current state about once a second, so a Buzz Party restart or
    a late listener catches up.
  - The port comes from a new BuzzDevice setting in `PCSX2.ini`, under
    `[USB1]` *(our call: key name `LedUdpPort`; 0 or missing = off)*. Buzz
    Party already writes `[USB1]`; stock PCSX2 ignores the unknown key.
  - Send only to `127.0.0.1`.
- Message format *(our call)*: a short ASCII datagram, e.g.
  `buzzled 1 1 0 1 0` (format version, then lights 1–4). Easy to read in
  logs and in tests.
- Write the patch as a general feature ("Buzz LED output over UDP"), not tied
  to Buzz Party, and offer it upstream to PCSX2 as a separate, best-effort
  step. If they accept it, we can drop the fork later. Not blocking.

### 2. Building and publishing the fork

- Fork lives at `github.com/nivobi/pcsx2`. The user approved Claude creating
  the fork, pushing, publishing releases and filing the upstream PR with `gh`.
  No Co-Authored-By or AI attribution lines in any commit or PR.
- The upstream PR is filed only after the go/no-go spike passes.

- Reuse PCSX2's own GitHub Actions workflows to produce:
  - macOS app (same architecture as stock, see below),
  - Linux x86-64 AppImage.
- Publish as GitHub Releases on the fork. The fork stays public (PCSX2 is
  GPL-3; Buzz Party is MIT and runs it as a separate program, which is fine).
- macOS build is not notarized. No paid Apple developer account. On macOS
  15+ right-click → Open no longer works; the user approves it once under
  System Settings → Privacy & Security → "Open Anyway". README documents this.
  *(Our call:)* Buzz Party does **not** strip the quarantine flag itself. If
  our build fails to start and stock PCSX2 is also installed, Buzz Party falls
  back to stock PCSX2 for that launch (game runs, no lights) and logs why, so
  a blocked first launch never costs a game night.
- Architecture *(our call)*: match stock. Stock PCSX2 2.8.2 for macOS is
  x86_64 only and runs under Rosetta on Apple Silicon; our build may do the
  same. No separate arm64/universal work.
- Distinct names so Buzz Party can tell it apart: *(our call)*
  `PCSX2-BuzzParty.app` and `pcsx2-buzzparty-*.AppImage`.

### 3. Buzz Party changes

- **Finding PCSX2** (`src/core/pcsx2-manager.ts`): look for our build first
  in the same places as now, then fall back to stock PCSX2 as today.
  `PCSX2_PATH` still overrides everything.
- **Config** (`src/core/pcsx2-config.ts`): always write
  `LedUdpPort = <port>` under `[USB1]`. Harmless for stock PCSX2.
- **Light listener** (new, e.g. `src/core/lights.ts`): binds a UDP socket on
  `127.0.0.1` only, parses datagrams, ignores anything malformed, keeps the
  current 4-light state, emits changes. *(Our call on port: pick a free one at
  startup and write it into the ini before launch.)*
- **Controller / server**:
  - On a light change, send each connected phone in that slot a small
    message `{ t: 'light', on: boolean }`. Separate from the full `state`
    message, which carries the QR code and is too heavy to send on every
    blink.
  - When a phone connects or reconnects, send its current light state.
  - When the game ends, PCSX2 exits, or the mode leaves `game`/`launching`:
    set all lights off and tell the phones.
- **Phone** (`web/phone/`):
  - Big red button: bright red glow when on, normal look when off.
  - At the same time, a soft red glow around the screen edges.
  - Only on the buzzer screen. Mirror on/off exactly; no extra animation or
    blinking of our own (the game does its own blinking).
  - Nothing shown when lights never arrive (stock PCSX2): no hint, no warning.
- **Testing without PCSX2**: a fake light source that plays a pattern
  (blink, chase, one-on), switched on by an env var *(our call:
  `BUZZ_FAKE_LIGHTS=1`)*, so the phone side can be developed and tested
  without the emulator. Unit tests for the parser, the state and off-on-exit,
  and the server's per-slot sends.
- **README**: optional "buzzer lights" section: what it is, where to download
  our build, the macOS right-click note, and that stock PCSX2 still works.

### 0. First step: go/no-go spike

Before any CI, release or Buzz Party work: build the patch locally, run a
couple of Buzz! titles, and confirm light reports arrive via `SET_REPORT`
(or OUT) **without changing the emulated USB descriptor**. *(Our call:)* If
lights only come through after a descriptor change (e.g. adding an OUT
endpoint), stop and bring it back to the user, because every game would see
that change.

### Notes for `pcsx2-manager.ts`

- The macOS running-process check looks for `PCSX2.app/Contents/MacOS/PCSX2`;
  it must also recognise `PCSX2-BuzzParty.app`.
- `PCSX2_PATH` is only honoured on Linux today; make it work on macOS too.

## Slot mapping

Buzz Party uses one Buzz device (`[USB1] Type = BuzzDevice`) with 4 slots, so
light N goes to the phone holding slot N.

## Left to the builder

- Exact patch code and how settings are read inside PCSX2's USB device code.
- Confirming on real games that lights arrive via `SET_REPORT` (or OUT), and
  checking a few titles to see that the cues match what you'd expect.
- CSS details of the glow.
- How the UDP port is chosen and passed, as long as it's local only.
