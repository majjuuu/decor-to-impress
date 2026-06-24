// =============================================================================
// soundManager.js — tiny Web Audio wrapper (preload + play), no dependencies
// =============================================================================
//
// WEB AUDIO BASICS: the browser gives us one AudioContext — a little audio
// graph. We decode each clip ONCE into an AudioBuffer (raw samples), then to
// play a sound we create a cheap BufferSource node, point it at a buffer, wire
// it through a gain (volume) node to the speakers, and start() it. Sources are
// one-shot (you make a new one per play); buffers are reused — same preload-then-
// instantiate idea as the 3D models.
//
// THE AUTOPLAY / GESTURE RULE: browsers start the AudioContext "suspended" and
// refuse to make noise until the user interacts with the page (so sites can't
// blast audio on load). So nothing is audible until we call ctx.resume() inside
// a real user gesture. main.js calls unlock() on the first pointer-down; play()
// also resumes defensively. Decoding works while suspended, so preloading early
// is fine — only actual sound needs the gesture.
//
// This is a singleton module: the whole app shares one audio system, so other
// modules just `import { play } from "./soundManager.js"`.

const CLIPS = {
  place: "/audio/place.ogg", // furniture "thunk"
  start: "/audio/start.ogg",
  done: "/audio/done.ogg",
  rotate: "/audio/rotate.ogg",
  delete: "/audio/delete.ogg",
  invalid: "/audio/invalid.ogg",
  tick: "/audio/tick.ogg", // last-30s countdown
  warning: "/audio/warning.ogg", // one-shot "30 seconds left!" sting
  win: "/audio/win.ogg",
};

let ctx = null;
let masterGain = null;
const buffers = {}; // name -> AudioBuffer

function ensureContext() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(ctx.destination);
  return ctx;
}

// Decode every clip up front so play() is instant. Safe to call before any
// gesture (decoding doesn't need a running context). Never throws — a missing
// clip just means that one sound is silent.
export async function preloadSounds() {
  ensureContext();
  await Promise.all(
    Object.entries(CLIPS).map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        buffers[name] = await ctx.decodeAudioData(data);
      } catch (err) {
        console.warn(`sound "${name}" failed to load:`, err);
      }
    })
  );
}

// Resume the context inside a user gesture so sound is actually allowed.
export function unlock() {
  ensureContext();
  if (ctx.state === "suspended") ctx.resume();
}

// Debug helper (for verification): current context state + which clips loaded.
export function _debugState() {
  return { ctxState: ctx ? ctx.state : "none", loaded: Object.keys(buffers) };
}

// Play a one-shot clip. `rate` lets us pitch/tempo-shift (used for the late-game
// tick). No-op if the clip isn't loaded yet.
export function play(name, { volume = 1, rate = 1 } = {}) {
  if (!ctx || !buffers[name]) return;
  if (ctx.state === "suspended") ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(masterGain);
  src.start(0);
}
