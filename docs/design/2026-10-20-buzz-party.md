# Buzz Party — design

Date: 2026-10-20
Status: approved 2026-10-20

## Intent

The family owns PS2 Buzz! Junior games (starting with *Buzz! Junior: RoboJam*) but
the Buzz! buzzers broke, so they can't play anymore. Buzz Party brings those games
back for family game night: the game runs on a computer plugged into the TV, and
everyone uses their own phone as a buzzer.

The players are aged roughly 15–60 with mixed tech comfort. The bar is "like a
PS2": turn it on and it works. Nobody should need to type an IP address, install
an app, pair anything, or touch the computer's keyboard and mouse during an
evening.

## Goals

1. **One double-click to play** on the owner's own Mac or Windows PC. The app
   opens fullscreen on the TV.
2. **Phones are the buzzers.** Scan a QR code with the phone camera, pick a
   player slot, get a screen that looks like a Buzz! buzzer. No app install.
3. **Game picker for Buzz! Junior titles.** Drop ISOs into a Games folder and
   they appear on the TV. Phones navigate the picker.
4. **Never touch the computer during play,** including going back to the picker
   from a running game.
5. **Built so it can later become a dedicated console:** a cheap mini PC that
   boots straight into Buzz Party (see *Later: console mode*).

## Non-goals (v1)

- Recompiling or porting the games natively. We run them in the PCSX2 emulator.
  (Evaluated; PS2 static recompilation is experimental and the buzzer I/O runs on
  the PS2's IOP, which is the least supported part.)
- Support for non-Buzz PS2 games. They may launch, but get no special handling,
  covers, or controller mapping beyond the buzzers.
- Online / over-the-internet play. Phones and computer are on the same home Wi-Fi.
- More than 4 players. The Buzz! hardware and games support exactly 4.
- A native phone app.
- Building the console image (later phase; v1 must just not block it).

## Anti-goals (fails even if it technically works)

- Grandma asks "what do I press?" — any step that needs typing, IP addresses,
  pairing codes, or a mouse during the evening.
- Noticeable input lag on the buzzer (being first to buzz is the game).
- The PCSX2 window/menus/setup wizard ever showing up to the family.
- The app shipping or bundling a PS2 BIOS or game ISOs.

## Constraints and verified facts

From a hands-on spike on 2026-10-20 (MacBook Pro M1 Pro, macOS 26.3):

- **PCSX2 2.8.2** (Homebrew cask `pcsx2`) boots RoboJam (serial **SCUS-97597**,
  CRC 60E1F7BB) at full speed (60 FPS, GPU ~2%) on a European BIOS
  (SCPH-70004, v2.00). On Apple Silicon PCSX2 is an x86_64 build running under
  Rosetta — performance is fine.
- **PCSX2's built-in Buzz emulation works.** USB port 1 device type
  `BuzzDevice`. Bindings `BuzzDevice_{Red,Blue,Orange,Green,Yellow}{1..4}` in the
  `[USB1]` section of `PCSX2.ini`, values like `Keyboard/Q`.
- **Synthetic keypresses drive the buzzers.** Sending key-down / ~150 ms /
  key-up via macOS System Events moved and confirmed selections in the game's
  first menu (blue = up, orange = down, red = select).
- **PCSX2 must be the focused window** to receive keyboard input.
- **PCSX2 overwrites a hand-written `PCSX2.ini`** that lacks its generated
  structure (`SettingsVersion` etc.) and reshows the setup wizard. Config must be
  produced by editing an ini PCSX2 generated itself (or a template derived from
  one), setting `[UI] SetupWizardIncomplete = false`, `[Filenames] BIOS = …`, and
  `[USB1]` as above.
- **Default `[Pad1]` keyboard bindings clash** with buzzer keys (1, 2, Q, W, A,
  S, …). All keyboard bindings in `[Pad1]` must be removed.
- **Default PCSX2 hotkeys** to avoid as buzzer keys: F1–F9, Escape, Space, Tab,
  Period, Insert, Alt+Return, Shift+R, Ctrl+Plus/Minus.
- Launching via `open -a PCSX2.app --args -batch -- <iso>` works on macOS;
  spawning the binary directly from a terminal did not show a window on first
  launch (Gatekeeper quarantine). Later launches should go through the app
  bundle on macOS.
- The owner's keyboard locale is Danish (QWERTY). Key injection should use
  layout-independent virtual key codes and stick to letter/digit keys.
- The owner has a PS2 at home; BIOS files are supplied by the user and live
  outside the app.

## Decisions (made with the owner)

- **Emulator underneath, invisible:** PCSX2 runs the games; the family never sees
  it.
- **Phone layout copies the real buzzer:** big red button on top, then four wide
  bars stacked in buzzer order — blue, orange, green, yellow — with a strip
  showing the player number/color.
- **Cross-platform from day one:** macOS and Windows for v1, Linux kept working
  so the later console can use it.
- **Multiple games:** mainly the PS2 Buzz! Junior series (RoboJam, Jungle Party,
  Monster Rumble, Dino Den, Ace Racers), all of which use the same buzzers.
- **BIOS default:** SCPH-70004 (EU, v2.00). User can swap the file.
- **Project location:** `~/code/buzz-party`.
- **v1 target machine:** this MacBook (Apple Silicon), lid open, HDMI to the
  TV. Windows support comes as a later milestone, tested on the owner's
  Windows PC at home. v1 code stays cross-platform (no Mac-only shortcuts
  outside the per-OS input bridge / PCSX2 launcher), but only macOS is verified
  on real hardware in v1. Linux: not ruled out by the code, untested.
- **Display:** with the lid open and HDMI, macOS may mirror or extend. If an
  external display is present and not mirrored, the app and PCSX2 both go
  fullscreen on the **external display (the TV)**. If mirrored or there's only
  one display, use the main display. *(My call on top of the owner's setup.)*

## Design

### Parts

1. **Desktop app (Electron).** One app, same on macOS / Windows / Linux. Owns
   the fullscreen TV screen (game picker + QR code), runs the phone server, and
   launches/stops PCSX2.
2. **Phone server** (inside the app). HTTP serves the phone page; WebSocket
   carries button events. Listens on the LAN.
3. **Phone page.** Single-page web app, no install.
4. **Input bridge.** Turns phone button events into OS key events PCSX2 reads as
   buzzer presses. One implementation per OS behind a common interface.
5. **PCSX2 manager.** Finds PCSX2, writes/maintains its config, launches a game,
   keeps it focused, stops it.

### The evening, end to end

1. Owner double-clicks **Buzz Party**. App opens fullscreen on the TV showing the
   game picker and a large QR code with the phone URL printed under it.
2. Each person scans the QR code with the phone camera. The phone page shows
   four player slots (P1–P4, in Buzz colors/numbers); taken slots are greyed
   out. Tapping a free slot claims it. The TV shows who has joined.
3. Phones navigate the picker: blue/orange move, red picks. Any joined player
   can drive the picker.
4. Picking a game: app launches PCSX2 fullscreen with that ISO and makes sure it
   is focused. Phones now send buzzer presses into the game.
5. To stop: any player opens the small "⋯" corner menu on their phone →
   **Back to games** → confirm. App stops PCSX2 and the picker returns to the
   front.
6. Closing the app (or quitting from the picker) stops everything.

If only one game is installed, the picker shows a **waiting-for-players** screen
instead (QR code, joined players, the one game) and the game starts only when a
player presses red on it. There is no auto-start on first join, so everyone gets
to scan the QR code. *(Builder-check call.)*

**Joining once a game is running** *(builder-check call)*: no overlay over
PCSX2. A phone that is already joined can show the join QR code from its "⋯"
menu (**Invite a player**), so a newcomer scans someone's phone. Free slots can
be claimed mid-game.

**Ending the evening** *(builder-check call)*: the phone "⋯" menu, on the picker
only, has **Turn off Buzz Party** with a confirm step. It closes the app. In
console mode it will later shut the machine down. The keyboard still works for
the owner.

### Phone page

- Layout: player strip on top, big round red buzzer (~40% of the screen), then
  four full-width bars: blue, orange, green, yellow. Portrait only.
- Press registers on **touch down**, release on touch up. Each press/release is
  sent immediately as its own message, so the game sees a real hold.
- Feedback: visual pressed state on every press; short vibration where the
  browser supports it (Android). iPhone Safari gets visual only.
- No zoom, scroll, text selection, long-press menus or double-tap zoom. Multi-
  touch must not break anything (two fingers on two buttons is allowed).
- Keep the screen awake while open (Screen Wake Lock API where available; a
  fallback is the builder's call).
- **Slot memory:** the phone remembers its slot (e.g. a token in localStorage).
  Reloading, or the phone locking and waking, reconnects to the same slot
  without rescanning. A slot frees up after its phone has been disconnected for
  a while (builder picks the timeout; ~1–2 minutes suggested) so a dead phone
  doesn't block a seat.
- Corner "⋯" menu: **Back to games** (with confirm, in a game), **Invite a
  player** (shows the join QR code), **Change player**, and **Turn off Buzz
  Party** (with confirm, on the picker only).
- No sound on the phone.

### Input bridge

- Interface: `press(player, button)` / `release(player, button)` where button ∈
  red, blue, orange, green, yellow.
- Implementation: OS-level synthetic key events using virtual key codes —
  macOS: CGEvent (needs the Accessibility permission, granted once; the app
  must explain and guide this on first run); Windows: SendInput; Linux: uinput
  or XTest (for the console later).
- Library choice is the builder's call (a maintained native module, or a tiny
  per-OS helper binary). It must hold keys down for the duration of the phone
  press, not just "tap".
- **Key map** (20 keys, letters/digits only, none clash with PCSX2 hotkeys once
  `[Pad1]` keyboard binds are removed). Suggested:

  | Player | Red | Blue | Orange | Green | Yellow |
  |---|---|---|---|---|---|
  | 1 | 1 | Q | A | Z | X |
  | 2 | 2 | W | S | C | V |
  | 3 | 3 | E | D | B | N |
  | 4 | 4 | R | F | G | H |

  The PCSX2 config and the bridge must use the same table, defined in one
  place.
- If PCSX2 loses focus mid-game, the app should bring it back to the front.

### PCSX2 manager

- **Finding PCSX2:** v1 requires PCSX2 to be installed (standard locations:
  `/Applications/PCSX2.app`, Windows install dir / portable folder). If missing,
  the TV shows a friendly one-screen instruction. Bundling PCSX2 (GPL-3.0) is
  deferred to console mode.
- **Config:** Buzz Party should not clobber the owner's own PCSX2 settings if
  avoidable. Prefer an isolated PCSX2 data/config directory for Buzz Party if
  PCSX2 supports one on each OS; otherwise manage the default config and back
  up the original once. (Builder verifies which is possible.) Required settings:
  wizard off, BIOS path/file, `[USB1] Type = BuzzDevice` + the key map,
  `[Pad1]` keyboard binds removed, fullscreen on start, confirm-on-shutdown off,
  PCSX2 UI hidden (batch / no-gui mode).
- **Launch:** fullscreen, no PCSX2 UI, the chosen ISO. On macOS go through the
  app bundle.
- **Stop:** clean shutdown of the emulator process; the picker comes back to the
  front.
- **Per-game settings:** a small table keyed by serial for any per-title tweaks
  found during testing (none known yet for RoboJam).

### Game picker (TV)

- Fullscreen, big, colorful cards, readable from the sofa.
- Games come from a **Games folder** (`.iso` and other formats PCSX2 opens).
  Each disc is identified by its serial from `SYSTEM.CNF` (`BOOT2 =
  cdrom0:\SCUS_975.97;1` → SCUS-97597).
- A built-in table maps known Buzz! Junior serials, all regions (US SCUS/SLUS,
  EU SCES/SLES), to nice titles. Unknown discs show their file name. Only RoboJam
  (SCUS-97597) is owned and tested today. The per-game settings table starts
  empty. *(Builder-check call.)*
- Cover art: optional. Show an image if the user put one in a covers folder
  (named by serial); otherwise a generated card (title on a Buzz-colored
  background). The app does not download or ship cover art.
- QR code + printed URL always visible on the picker, plus the joined players.

### Files and folders on the computer

- A user data folder (e.g. `~/BuzzParty/` or the OS app-data dir — builder's
  call) with `Games/` and `BIOS/`. First run creates them and the TV explains
  what goes where.
- BIOS and ISOs are never committed (`.gitignore` already blocks them) and never
  bundled into builds.

### Network

- Server binds on the LAN. The QR code encodes `http://<LAN-IP>:<port>/`.
  Picking the right IP matters: skip loopback, Docker, VPN (e.g. Tailscale
  `100.x`) and link-local interfaces; prefer the interface with the default
  route.
- Fixed port (builder picks one that's unlikely to clash), with fallback if
  taken.
- First run on macOS/Windows will trigger the OS firewall "allow incoming
  connections" prompt; the first-run screen should mention it.
- Plain HTTP on the LAN. Note: some browser features (Wake Lock, vibration) can
  require a secure context; the builder must verify what works over plain LAN
  HTTP on iOS Safari and Android Chrome and pick fallbacks.

### First run

A short guided screen on the TV (operable with keyboard/mouse this one time):
locate or confirm PCSX2, place BIOS file, place games, grant macOS
Accessibility permission, allow firewall. After that, double-click → play.

### Later: console mode (not v1)

A cheap mini PC running Linux that boots straight into Buzz Party fullscreen
(kiosk / auto-login), PCSX2 bundled, games and BIOS supplied by the owner on the
device. For the owner's personal use only — devices are never given away with a
BIOS or games preinstalled. v1 must keep Linux working and must not assume a
desktop or a mouse is present after first setup.

## Testing

- Input bridge behind an interface so the server and phone flows can be tested
  with a fake bridge.
- Unit tests: key map ↔ PCSX2 config consistency, serial parsing from
  `SYSTEM.CNF`, slot claim/reconnect/timeout logic, LAN IP selection.
- Manual check on real hardware each milestone: four phones (at least one
  iPhone, one Android) playing RoboJam on the TV.

## Left to the builder

- Exact libraries (native key injection, QR, WebSocket), port number, app
  packaging/signing approach.
- Slot-release timeout, Wake Lock fallback, visual styling details within the
  layout above.
- Whether PCSX2 supports an isolated config dir per OS (see PCSX2 manager).
- One-game auto-start trigger.
