// =============================================================================
// timer.js — a drift-free countdown
// =============================================================================
//
// THE RIGHT WAY TO COUNT DOWN: store an ABSOLUTE end timestamp and compute the
// remaining time from the clock on every tick:
//     endTime = now + duration;   remaining = endTime - now
//
// The naive alternative — keep a counter and do `remaining -= 1` every second —
// drifts. setInterval is not exact (it fires "about" every N ms, and is throttled
// in background tabs), so subtracting a fixed amount accumulates error and the
// clock slowly desyncs from real time. Computing `endTime - now` each tick means
// the displayed time is always correct no matter when (or how often) we sample.
//
// We also expose stop() and call it before any start() — see game.js, which stops
// the timer whenever it EXITS the DESIGN state, so a transition can never leave a
// stray interval ticking (which would otherwise make a restarted round appear to
// run at double speed).

export function createCountdown({ durationMs, onTick, onExpire }) {
  let endTime = 0;
  let intervalId = null;

  function tick() {
    const remaining = Math.max(0, endTime - Date.now());
    if (onTick) onTick(remaining);
    if (remaining <= 0) {
      stop();
      if (onExpire) onExpire();
    }
  }

  function start() {
    stop(); // guard: never run two intervals at once
    endTime = Date.now() + durationMs;
    tick(); // paint immediately so the HUD shows 5:00 without a 1s delay
    intervalId = setInterval(tick, 200); // sample often; correctness is from endTime
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function getRemaining() {
    return Math.max(0, endTime - Date.now());
  }

  function isRunning() {
    return intervalId !== null;
  }

  return { start, stop, getRemaining, isRunning };
}

// Format milliseconds as m:ss. We ceil to the next whole second so the clock
// reads "5:00" at the very start and ticks to "0:00" only when truly done.
export function formatMMSS(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
