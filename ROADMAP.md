# Roadmap

Where Buzz Party is headed, roughly in order. This is a plan, not a promise:
priorities change, and help is welcome. If you want to pick something up, open
an issue first so we can talk about it.

## What works today

- **macOS app:** double-click, a game picker on the TV, phones join by QR code.
- **Phones as Buzz! buzzers:** red plus blue, orange, green and yellow, up to
  four players.
- **PCSX2 underneath:** runs with its own settings, so nobody has to use an
  emulator menu.
- **Buzz! titles** are recognised by disc ID in all regions: the Junior games
  (tested) and the quiz games and regional editions (names and covers only, not
  tested yet).
- **Game picker:** carousel with cover art (downloaded once per disc, your own
  image always wins) that slides from game to game, the game's title, the
  languages the disc supports, and which game you are on ("3 / 9").
- **Languages:** English and Danish UI, chosen on first run with flags and
  changeable from the phone menu. A new language is one JSON file plus a flag
  (`web/i18n/`, `web/flags/`).
- **Startup intro and sounds:** a short intro and small sounds when browsing
  and picking a game, all generated in code.
- **Buzzer lights (optional):** with our patched PCSX2 build, phones glow when
  the game lights that player's buzzer; regular PCSX2 still works without them.
- **Linux, first pass:** a `/dev/uinput` key helper and bridge, finding and
  starting PCSX2 (AppImage or `pcsx2-qt`), `xdotool` window focus, and
  `npm run dist:linux`. Runs on a console PC (Arch, X11 + Openbox, GTX 960):
  the packaged app, PCSX2 fullscreen, the buzzers and "Turn off" work. Sound
  over HDMI is not tried yet (see "Linux and console mode").

## 1. Stabilise

Make what exists solid before adding more.

- [ ] Test with 2–4 phones at once, including at least one iPhone and one Android.
- [ ] Failure checks: a phone locks mid-game, Wi-Fi drops for a couple of
      minutes, "Invite a player", "Back to games", "Turn off".
- [ ] Find out whether iPhones dim their screen mid-game over plain HTTP; if so,
      add a keep-awake fallback.
- [ ] Test on a TV over HDMI, with both an extended and a mirrored desktop.
- [ ] Check how each game chooses its in-game language (disc menu or console
      setting) and, if needed, let the user set it.
- [ ] Known small issues:
  - [x] Focus requests can briefly delay buzzer presses (macOS: key presses and window work now use separate helper processes).
  - [x] Key helper: restarts up to three times a minute, and the TV says so if the buzzers are dead.
  - [x] On quit: release held keys and wait for PCSX2 to stop.
  - [x] Show an error and quit if startup fails (for example no free port).
  - [x] Two fingers on the same phone button: it stays pressed until the last one lifts.
  - [x] Exclude virtual network adapters (Parallels, ZeroTier, WireGuard, ...) from the join address.
  - [x] Better titles for `.iso.gz`.
  - [ ] Don't list stray `.bin` files as games.
  - [x] Phone invite screen: hide the QR code when there is no join address.
  - [ ] A rare flaky server test (hello, then close).
- [ ] Investigate reports of freezes during emulation (try PCSX2's Vulkan or
      software renderer).
- [ ] App icon.

## 2. Linux and console mode

A small PC running Linux that boots straight into Buzz Party: automatic login,
no desktop.

- [x] Linux key bridge (`/dev/uinput`), verified on real Linux.
- [x] Linux PCSX2 launch (AppImage or `pcsx2-qt`) and packaging.
- [x] Verify on a real Linux PC with a GPU (Arch, GTX 960): the packaged app
      starts (Chromium sandbox), PCSX2 starts and goes fullscreen on the TV,
      window focus works, buzzers work. PCSX2's automatic renderer picks OpenGL
      on NVIDIA, which runs these games fine.
- [x] Find the PCSX2 AppImage's process: it is named after the file, not
      `pcsx2-qt`, so the app now matches any process name starting with `pcsx2`.
- [ ] Sound over HDMI on a TV.
- [ ] Document an automatic-login-and-start setup for a minimal install.
- [x] "Turn off" from a phone shuts the machine down in kiosk mode (the app
      quits, and the session's start script powers off).
- [x] First-run language chooser: phone, mouse or keyboard (left/right and Enter).
- [ ] Remote-control (HDMI-CEC) navigation for the chooser.
- [x] Intro: plays on every launch by default; `"intro": "boot"` in
      `~/BuzzParty/settings.json` plays it only within five minutes of the machine
      starting, `"never"` turns it off.
- [ ] Wayland support for window focus and placement (today it needs X11).

## 3. Windows

- [ ] Spike: PCSX2 Windows build, Buzz keys via `SendInput`, focus handling.
- [ ] Windows input bridge and PCSX2 launcher branch (find the install,
      portable folder support).
- [ ] Windows installer (electron-builder NSIS) and first-run checks.

## 4. Every PS2 Buzz! game

- [x] The other Buzz! titles are in the title list (94 discs from PCSX2's game
      database: the quiz series, Brain of the World/UK and more, with regional
      editions), so they get proper names and cover art.
- [ ] Test at least one of the quiz games end to end.
- [ ] Optional per-game settings if any title needs PCSX2 tweaks.

## 5. PS3 Buzz! games (RPCS3)

- [ ] Spike: RPCS3 emulates the Buzz! buzzers too; check how it binds them to keys.
- [ ] Emulator abstraction so the picker can launch PS2 or PS3 games.
- [ ] Buzz! Quiz World, Buzz! Quiz TV and friends.

## 6. Distribution

- [x] README with a setup guide.
- [x] MIT license.
- [x] Never ship a BIOS or game images (`.gitignore` blocks them; the README says so).
- [x] README screenshots.
- [ ] README: link to PCSX2's guides for dumping your own BIOS and discs.
- [ ] Signed and notarized macOS builds (Apple Developer ID), so downloads
      don't trigger warnings.
- [ ] Prebuilt releases on GitHub.

## 7. Ideas

- [ ] More UI languages (German, Swedish, Norwegian, ...), and a native-speaker
      review of the existing translations.
- [x] Sounds on or off from the phone menu.
- [ ] A sound volume setting.
- [x] TV join box fits the Danish text on one line.
