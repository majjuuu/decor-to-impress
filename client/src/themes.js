// =============================================================================
// themes.js — the data-driven list of round themes
// =============================================================================
//
// Each round picks one theme; it's shown on the START screen and kept visible in
// the DESIGN HUD, and (in Milestone 6) handed to the AI judge as the thing the
// player's design is scored against. Keeping themes as plain data means we can
// add/tune them — and later make them per-room (Milestone 7) — without touching
// the game-loop code.

export const THEMES = [
  { id: "cozy", name: "Cozy", tagline: "Warm, inviting, soft. Make it a hug." },
  { id: "minimalist", name: "Minimalist", tagline: "Less is more. Clean and uncluttered." },
  { id: "spooky", name: "Spooky", tagline: "Eerie and atmospheric — embrace the dark." },
  { id: "bright", name: "Bright & Airy", tagline: "Open, light, and full of life." },
];

// Pick a random theme, optionally avoiding one (so "Next room" feels fresh and
// doesn't hand you the same theme twice in a row). Math.random() is fine in the
// browser; we only avoid it in the workflow-script sandbox, not in app code.
export function pickRandomTheme(exclude = null) {
  const pool = exclude ? THEMES.filter((t) => t.id !== exclude.id) : THEMES;
  const list = pool.length ? pool : THEMES; // safety if exclude emptied the pool
  return list[Math.floor(Math.random() * list.length)];
}

// Pick a random theme from a room's pool (a list of theme ids), optionally
// avoiding one for variety on Retry.
export function pickThemeFromIds(ids, exclude = null) {
  const inPool = THEMES.filter((t) => ids.includes(t.id));
  const avoiding = exclude ? inPool.filter((t) => t.id !== exclude.id) : inPool;
  const list = avoiding.length ? avoiding : inPool; // fall back if exclude emptied it
  return list[Math.floor(Math.random() * list.length)];
}
