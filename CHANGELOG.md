# Changelog

All notable changes to Buzz Party. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Downloads:** every release gets a ready-made macOS (Apple Silicon) zip and
  a Linux (x64) tarball, built by GitHub Actions. The Mac build is not signed
  with an Apple Developer ID; the README explains the first open.

### Changed

- **Electron 45** (from 44), plus updated electron-builder, vitest and `ws`.
  Checked on the console box with a full game round.

## [1.0.0] - 2026-11-08

The first release: phones as Buzz! buzzers for the PS2 Buzz! games, on macOS
and on a Linux "console" PC.

### Added

- **Phones as buzzers:** up to four players join by QR code and get the red
  buzzer plus the blue, orange, green and yellow answer buttons. Presses become
  key presses for PCSX2, so the games see real Buzz! controllers.
- **Game picker on the TV:** a carousel of your discs with cover art
  (downloaded once, your own image always wins), the title, the disc's
  languages, and "3 / 9". Blue and orange move, red plays.
- **PCSX2 underneath, with its own settings,** so nobody has to touch an
  emulator menu. The picture is drawn at the TV's resolution (1080p 3x,
  1440p 4x, 4K 5x) with VSync on, so text is sharp and nothing tears.
- **Every PS2 Buzz! title** recognised by disc ID in all regions (94 discs:
  the Junior games, the quiz series, Brain of the World and more).
- **Phone menu:** Back to games (the TV and phones say "Closing the game…" at
  once while PCSX2 exits), Invite a player, Change player, Language, Sounds,
  Turn off.
- **Phones stay awake** during a game, also over plain HTTP where browsers
  refuse the screen wake lock (a tiny muted video loops instead).
- **Languages:** English and Danish, chosen on first run with flags and
  changeable from a phone. A new language is one JSON file and a flag.
- **Startup intro and sounds,** all generated in code: glowing towers, then
  BUZZ! / PARTY BOX.
- **Buzzer lights (optional):** with the patched PCSX2 build, a phone glows
  when the game lights that player's buzzer.
- **Linux (X11):** a `/dev/uinput` key helper, PCSX2 as AppImage or
  `pcsx2-qt`, packaging with `npm run dist:linux`, and a kiosk mode where
  "Turn off" powers the PC off. Used daily on a console PC (Arch, Openbox,
  NVIDIA GTX 960) with sound over HDMI.
- **WiFi setup on the TV (optional):** with the separate `buzz-netsetup`
  service, a console at a new house walks the host through joining its WiFi
  from a phone, with a countdown, a network list and clear errors.

[Unreleased]: https://github.com/nivobi/buzz-party/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nivobi/buzz-party/releases/tag/v1.0.0
