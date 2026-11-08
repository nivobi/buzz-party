// Writes web/phone/keep-awake.js with the tiny video embedded. Run from the repo root:
//   node scripts/make-keep-awake.mjs awake.mp4
// awake.mp4 was made with:
//   ffmpeg -f lavfi -i color=c=black:s=16x16:r=2 -f lavfi -i anullsrc=r=8000:cl=mono -t 2 \n//     -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -tune stillimage \n//     -c:a aac -b:a 8k -shortest -movflags +faststart awake.mp4
import { readFileSync, writeFileSync } from 'node:fs';

const b64 = readFileSync(process.argv[2]).toString('base64');
const js = `// Keeps the phone's screen on during a game. Plain JS, no build step.
// navigator.wakeLock exists only on HTTPS and localhost; the buzzer page is plain
// http on the LAN, so phones fell asleep mid-game (iPhone, 2026-11-08). There the
// fallback is a tiny muted video looping inline, which phones treat as "something
// is playing". It must start from a tap, and restart when the page comes back.
// The video is a data URI: Safari will not play a video from a server without
// byte-range support, and ours has none. (2 s, 16x16 black, silent; 2.3 KB.)
(() => {
  const VIDEO = 'data:video/mp4;base64,${b64}';

  function create({ document, navigator, secure }) {
    let method = null;
    let video = null;

    async function lock() {
      if (!secure || !navigator.wakeLock) return false;
      try {
        await navigator.wakeLock.request('screen');
        return true;
      } catch {
        return false;
      }
    }

    async function play() {
      if (!video) {
        video = document.createElement('video');
        for (const a of ['muted', 'playsinline', 'loop']) video.setAttribute(a, '');
        video.muted = true;
        video.src = VIDEO;
        Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
        document.body.append(video);
      }
      try {
        await video.play();
      } catch { /* not allowed yet: the next tap tries again */ }
    }

    return {
      get method() { return method; },
      /** Call from a tap: the only moment phones allow the video to start. */
      async start() {
        if (method === 'video') return play();
        if (await lock()) { method = 'wakelock'; return; }
        method = 'video';
        await play();
      },
      /** The page is visible again: phones drop the lock and pause the video while away. */
      async resume() {
        if (method === 'wakelock') { if (!(await lock())) { method = 'video'; await play(); } }
        else if (method === 'video') await play();
      },
    };
  }

  globalThis.BuzzKeepAwake = { create };
})();
`;
writeFileSync('web/phone/keep-awake.js', js);
console.log('wrote', js.length, 'bytes');
