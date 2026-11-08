# Contributing to Buzz Party

Thanks for wanting to help. Bug reports, testing on other setups and small,
focused pull requests are all welcome.

## Before you start

- **Bigger changes: open an issue first,** so we can agree on the approach
  before you spend time on it. The [roadmap](ROADMAP.md) lists what is planned.
- **Never add a BIOS, a game image or a copyrighted cover** to the repository,
  an issue or a pull request. Buzz Party only works with copies you dumped
  yourself. `.gitignore` blocks the common file types.

## Setting up

You need git and Node.js 22.12 or newer. See the [README](README.md#install)
for the full install, and [Linux](README.md#linux) for what Linux needs.

```sh
git clone https://github.com/nivobi/buzz-party.git
cd buzz-party
npm install
npm test        # the test suite (vitest)
npm start       # build and run the app
```

## Making a change

- **Tests first** for anything with logic: write a test that fails, then make
  it pass. The tests live in `test/` and run with `npm test`.
- Keep `npx tsc --noEmit -p .` clean.
- The TV and phone pages in `web/` are plain HTML, CSS and JS with no build
  step; keep them that way.
- Every text on the TV or a phone goes through `web/i18n/` and must exist in
  every language (a test checks the keys match).
- Platforms: macOS and Linux (X11) are supported. Windows is not yet; the test
  suite does not pass there.

## Pull requests

- One topic per pull request, with a short description of **why** and **what**,
  and how you tested it (which OS, which game, which phones).
- CI runs the type check, the tests and the key helper build on Ubuntu and
  macOS. It must be green before a merge.
- Write commit messages that say what changed and why
  (for example `fix(phone): keep the screen on over plain http`).

## Adding a language

Copy `web/i18n/en.json` to `web/i18n/<code>.json`, translate it, add a flag
as `web/flags/<code>.svg`, and add the code to `LANGS` in `web/i18n.js` and
`src/core/i18n.ts`. Native speakers reviewing the existing translations are
very welcome too.

## Reporting bugs

Use the bug report form. Include your OS, how you installed PCSX2, which game,
which phones, and the log: `~/.buzz-party.log` on the console, or the terminal
output of `npm start`.

By contributing you agree that your work is released under the
[MIT License](LICENSE), and that you follow the [code of conduct](CODE_OF_CONDUCT.md).
