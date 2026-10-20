# Buzz Party roadmap

Where Buzz Party is headed, roughly in order. Each phase should be usable on its
own before the next one starts.

## Now (v1, done)

- macOS app: double-click, game picker on the TV, phones join by QR code.
- Phones as Buzz! buzzers (red + blue/orange/green/yellow), up to 4 players.
- PCSX2 runs underneath with its own settings, invisible to the family.
- Buzz! Junior titles recognised by disc ID (all regions).
- Played and working: RoboJam with one phone on the Mac's own screen.

## 1. Ready for family game night

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
- [ ] README with setup guide (PCSX2, own BIOS dump, ripping own discs).
- [ ] Pick a license.
- [ ] Signed builds (Apple Developer ID) so macOS doesn't reset permissions and
      warn on download.
- [ ] Never ship a BIOS or game images; link to PCSX2's legal BIOS-dumping guide.

## 5. PS3 Buzz! games (RPCS3)

- [ ] Spike: RPCS3 emulates the Buzz! buzzers too; check how it binds them to keys.
- [ ] Emulator abstraction so the picker can launch PS2 or PS3 games.
- [ ] Buzz! Quiz World, Buzz! Quiz TV and friends.

## 6. Console mode

- [ ] Cheap mini PC running Linux that boots straight into Buzz Party (kiosk,
      auto-login, no desktop).
- [ ] Linux input bridge (uinput) and PCSX2 bundled.
- [ ] "Turn off" from a phone shuts the machine down.
- [ ] For personal use: never give devices away with a BIOS or games on them.
