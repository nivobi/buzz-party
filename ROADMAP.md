# Buzz Party roadmap

Where Buzz Party is headed, roughly in order. Each phase should be usable on its
own before the next one starts.

## Now (v1, done)

- macOS app: double-click, game picker on the TV, phones join by QR code.
- Phones as Buzz! buzzers (red + blue/orange/green/yellow), up to 4 players.
- PCSX2 runs underneath with its own settings, invisible to the family.
- Buzz! Junior titles recognised by disc ID (all regions).
- Played and working: RoboJam with one phone on the Mac's own screen.

## Picker update (done 2026-10-21)

- Carousel game picker: big centred cover with a yellow glow, neighbours dimmed
  at the sides, blue/orange slides (wraps around), red plays.
- Real cover art, downloaded once per disc from the community collection PCSX2
  uses, into `~/BuzzParty/Covers`; your own image always wins; a coloured name
  card stands in when there's no cover or no internet.
- Big game name with a language line underneath (from the file name, Danish
  first), so e.g. US and Danish versions are easy to tell apart.
- Phones show the selected game in their status line.
- Builds signed with a local self-signed certificate, so macOS keeps the
  Accessibility permission across rebuilds.

## Languages, intro, sounds and Linux (done 2026-11-04)

- English and Danish UI, chosen on first run with flags (on the TV and on
  phones) and remembered in `~/BuzzParty/settings.json`; changeable from the
  phone menu. New languages are one JSON file plus a flag
  (`web/i18n/`, `web/flags/`).
- Startup intro (glowing towers, title, chime) and small sounds when browsing
  and picking a game, all generated in code.
- README and MIT license.
- Linux, first pass: a `/dev/uinput` key helper and `LinuxBridge`, finding and
  starting PCSX2 (AppImage or `pcsx2-qt`), `xdotool` focus/placement, Linux
  setup messages, and `npm run dist:linux`. The key bridge and the whole test
  suite are verified on Ubuntu 24.04 (x86-64); everything that needs a desktop
  and a GPU is not tried yet (see section 6).

## 1. Ready for family game night

- [x] First Danish game: Buzz! Junior: Monster Rumble (EU, with Dansk).
- [ ] Start Monster Rumble and check its language menu offers Dansk; if it
      follows the console language instead, set PCSX2's system language.
- [ ] Rip the family's own Buzz! Junior discs to ISO (DVD drive from the old PC,
      in the desktop with ImgBurn or over USB to the Mac).
- [ ] Rehearsal on the TV over HDMI: extended desktop and mirrored.
- [ ] 2–4 phones at once, at least one iPhone and one Android.
- [ ] Real-life failure checks: phone locks mid-game, Wi-Fi drops for 2 minutes,
      "Invite a player", "Back to games", "Turn off".
- [ ] Find out whether iPhones dim their screen mid-game over plain HTTP; if so,
      add the hidden-looping-video keep-awake fallback.
- [ ] Known small issues from the v1 review:
  - [ ] Focus requests can briefly delay buzzer presses (run focus off the key queue).
  - [ ] Helper process: handle spawn errors, respawn more than once, tell the TV
        if buzzers are dead.
  - [ ] On quit: release held keys and wait for PCSX2 to stop.
  - [ ] Show an error and quit if startup fails (e.g. no free port).
  - [ ] Two fingers on the same phone button: first lift releases it.
  - [ ] Exclude Parallels (`vnic*`) network adapters from the join address.
  - [ ] Don't list stray `.bin` files as games; better titles for `.iso.gz`.
  - [ ] Phone invite screen: hide the QR when there's no join address.
  - [ ] Look into a rare flaky server test (hello → close).
- [ ] Watch for Mac freezes: one kernel panic (WindowServer) happened with
      Buzz Party already closed, one freeze during a PCSX2 test. If it happens
      during a game, note the time and try PCSX2's Vulkan or software renderer.
- [ ] App icon.

## 2. Windows

- [ ] Spike on the home Windows PC: PCSX2 Windows build, Buzz keys via `SendInput`,
      focus handling.
- [ ] Windows input bridge + PCSX2 launcher branch (find the install, portable
      folder support).
- [ ] Windows installer (electron-builder NSIS) and first-run checks.

## 3. Every PS2 Buzz! game

- [ ] Add the adult Buzz! titles to the title list. PCSX2's GameDB has 38 titles /
      76 discs (The Music Quiz, The Big Quiz, The Sports Quiz, The Mega Quiz,
      The Pop Quiz, The Hollywood Quiz, Brain of the World/UK/…, and regional
      editions), all using the same buzzers.
- [ ] Test at least one adult Buzz! game end to end.
- [ ] Optional per-game settings if any title needs PCSX2 tweaks.

## 4. Going public (decide after 1–3)

- [ ] Prior-art check: existing phone-buzzer projects for PCSX2/RPCS3, and what
      people ask for on Reddit / PCSX2 forums.
- [x] README with setup guide. Still to add: how to dump your own BIOS and rip
      your own discs (link to PCSX2's guides), and screenshots.
- [x] Pick a license (MIT).
- [ ] Signed + notarized builds (Apple Developer ID) so other people's Macs
      don't warn on download. (On this Mac, a local certificate already keeps
      permissions across rebuilds.)
- [x] Never ship a BIOS or game images (`.gitignore` blocks them; the README says so).
- [ ] Link to PCSX2's legal BIOS-dumping guide from the README.

## 5. PS3 Buzz! games (RPCS3)

- [ ] Spike: RPCS3 emulates the Buzz! buzzers too; check how it binds them to keys.
- [ ] Emulator abstraction so the picker can launch PS2 or PS3 games.
- [ ] Buzz! Quiz World, Buzz! Quiz TV and friends.

## 6. Console mode

A cheap mini PC running Linux that boots straight into Buzz Party (kiosk,
auto-login, no desktop).

- [x] Linux input bridge (`/dev/uinput`), verified on real Linux.
- [x] Linux PCSX2 launch (AppImage / `pcsx2-qt`) and packaging code.
- [ ] Verify on a real Linux desktop with a GPU: PCSX2 starts and picks Vulkan,
      sound over HDMI, the game window goes fullscreen on the TV, `xdotool`
      focus and placement, the packaged app starts (sandbox).
- [ ] Check the PCSX2 AppImage process id matches the one the app tracks.
- [ ] Auto-login and start script for a minimal install; document it in the README.
- [ ] "Turn off" from a phone shuts the machine down (kiosk setup).
- [ ] First-run language chooser works with only a phone or a mouse today; add
      keyboard/remote navigation.
- [ ] Decide whether the intro plays on every launch or only on a cold boot.
- [ ] Wayland support for focus/placement (today needs an X11 session).
- [ ] For personal use: never give devices away with a BIOS or games on them.

## 7. Polish and ideas

- [ ] More UI languages (German, Swedish, Norwegian...); a native-speaker pass
      over the Danish texts.
- [ ] The "Scan for at deltage" text in the TV join box wraps onto two lines; tune the layout.
- [ ] A setting for sound effects volume or off.
