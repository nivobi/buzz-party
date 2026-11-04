# Buzz Party

Play the PS2 **Buzz! Junior** party games with your phones as buzzers.

Buzz Party is a small desktop app. It shows a game picker on the TV, lets up to
four people join by scanning a QR code, and turns each phone into a Buzz!
buzzer (red button plus blue, orange, green and yellow). Underneath it runs the
[PCSX2](https://pcsx2.net) emulator with its own settings, so nobody has to
touch an emulator menu.

> Status: works on macOS. **Linux support is experimental** (see
> [Linux](#linux-experimental)). Windows is planned, see the [roadmap](ROADMAP.md).

## How it works

1. The app scans `~/BuzzParty/Games` for disc images and shows them in a
   carousel on the TV, with cover art.
2. Phones open the page behind the QR code and claim a player (1 to 4).
3. Button presses from the phones are sent over a WebSocket and turned into
   key presses for PCSX2, so the buzzers work like the real controllers.
4. The red buzzer starts the selected game. "Back to games" in the phone menu
   returns to the picker.

## What you need

- A Mac, or a Linux PC (experimental). Windows is not supported yet.
- [PCSX2](https://pcsx2.net) installed (`brew install --cask pcsx2`).
- A PS2 BIOS dumped from a console you own.
- Your own Buzz! Junior discs, ripped to `.iso` (or `.chd`, `.cso`, `.gz`).
- A TV or monitor, and phones on the **same Wi-Fi** as the computer.

**This project does not include or download games or BIOS files.** You must
supply your own legally obtained copies. Buzz Party is not affiliated with,
endorsed by or sponsored by Sony, Relentless Software or the PCSX2 team.

## Setup

On first start the app creates this folder:

```
~/BuzzParty/
  Games/    put your disc images here
  BIOS/     put your PS2 BIOS file here (SCPH-70004 is preferred)
  Covers/   cover art, downloaded once per game; your own image always wins
  settings.json
```

Then:

1. Put your games in `Games/` and the BIOS in `BIOS/`. Symlinks work, but only
   if they point at a file that exists.
2. Start Buzz Party. If something is missing, the TV tells you what.
3. Allow Buzz Party in **System Settings → Privacy & Security → Accessibility**.
   The app needs this to press keys in PCSX2.
4. The first time, macOS may ask to allow incoming network connections. Click
   **Allow** so phones can join.
5. Scan the QR code with a phone, pick a player, and press **RED** on a phone
   to start a game.

Controls on a phone while picking a game: **blue** goes left, **orange** goes
right, **red** plays.

## Linux (experimental)

The Linux support is written and unit-tested but has **not been tried on real
hardware yet**. It is meant for a small "console" PC that boots straight into
the app. Expect rough edges and please report what you find.

What you need:

- An **X11 session** (Xorg with a light window manager such as Openbox). Wayland
  is not supported: window focus and placement use `xdotool`.
- `xdotool`, a C compiler (`cc`) to build the key helper, and `fuse2` if you use
  an AppImage.
- The [PCSX2](https://pcsx2.net) **AppImage**. Buzz Party looks for it in
  `/opt/pcsx2`, `~/Applications`, `~/BuzzParty`, `~/.local/bin` and
  `/usr/local/bin` (newest file name wins), then for `pcsx2-qt` or `pcsx2` on
  the PATH. Set `PCSX2_PATH` to point at a specific file.
- Your BIOS and games in `~/BuzzParty`, same as on macOS.

Key presses reach PCSX2 through a virtual keyboard made with `/dev/uinput`, so
your user needs write access to it:

```sh
echo uinput | sudo tee /etc/modules-load.d/uinput.conf
sudo modprobe uinput
echo 'KERNEL=="uinput", GROUP="input", MODE="0660"' | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo udevadm control --reload && sudo udevadm trigger
sudo usermod -aG input "$USER"   # then log out and back in
```

Build the key helper and run the app from source:

```sh
npm install
npm run build:helper:linux
npm start
```

If something is missing, the TV tells you (for example when PCSX2 is not found
or `/dev/uinput` is not writable). There is no packaged Linux build yet.

For a boot-straight-into-the-app setup, log in automatically on a minimal X11
session and start the app from its autostart (for example `~/.xinitrc` running
Openbox and then `npm start`). Turn off screen blanking with `xset s off -dpms`.

## Languages

The UI is available in **English** and **Danish (Dansk)**. On first run the TV
and phones show flags; pick one and it is remembered in
`~/BuzzParty/settings.json`. You can change it later from the phone menu
(**Language**). Game titles and their language list come from the disc.

To add a language, copy `web/i18n/en.json` to `web/i18n/<code>.json`, translate
it, add a flag in `web/flags/<code>.svg`, and add the code to `LANGS` in
`web/i18n.js` and `src/core/i18n.ts`. A test checks that every language has
the same keys as English.

## Startup intro and sounds

The TV plays a short glowing-towers intro with a chime when it starts, and
small sounds when you browse and pick a game. All of it is generated in code
(no audio or video files). Add `?nointro` to the TV page URL to skip the intro.

## Development

```sh
npm install
npm test            # vitest
npm start           # builds TypeScript and runs the app with Electron
npm run build:helper  # builds the native key helper (macOS, needs swiftc)
npm run build:helper:linux  # the same for Linux (needs cc)
npm run dist        # packages a signed macOS app into dist-app/
```

Notes:

- The TV and phone pages are plain HTML, CSS and JS in `web/` (no build step).
- `src/` is TypeScript: `core/` (games, covers, PCSX2, settings, i18n),
  `app/` (the state machine), `server/` (HTTP and WebSocket), `bridge/`
  (key presses).
- `npm run dist` signs with a local certificate named "Buzz Party Local Signing"
  so macOS keeps the Accessibility permission between rebuilds. Create your own
  or change the name in `package.json`.
- Debug URL options on the TV page: `?nointro` and `?introt=3` (freeze the
  intro at 3 seconds).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## License

[MIT](LICENSE)
