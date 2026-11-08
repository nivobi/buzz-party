# Security

## How Buzz Party is exposed

Buzz Party runs a small web server so phones on the same network can join:
plain HTTP and a WebSocket on port 8420 (or the next free one up to 8429), with
no accounts and no passwords.
That is on purpose (guests scan a QR code and play), and it means **anyone on
your local network can open the buzzer page and press buttons**. Run it on a
home network you trust, not on public WiFi, and don't forward the port to the
internet.

What a phone can do through it: claim a player, press the five buzzer buttons,
change the language and sounds, go back to the game list, and turn Buzz Party
off (on a console PC that powers the machine off). It cannot read or write
files, run commands or reach anything else on the computer.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately
through GitHub instead: the repository's **Security** tab, then **Report a
vulnerability**. Include what you found, how to reproduce it, and what an
attacker could do with it.

You'll get an answer within a week. This is a hobby project maintained by one
person, so a fix may take a little longer, but it will be taken seriously.

## Supported versions

Only the latest release gets security fixes.
