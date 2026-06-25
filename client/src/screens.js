// =============================================================================
// screens.js — DOM overlays (START / REVEAL / RESULT) and the DESIGN HUD
// =============================================================================
//
// All of this is plain HTML/CSS layered over the 3D canvas. This module only
// builds and shows/hides DOM and reports button clicks via callbacks — it holds
// NO game logic. game.js decides which screen to show and when.
//
// Two kinds of UI live here:
//   - Full-screen OVERLAYS: START, REVEAL, RESULT (a centred card over a dim backdrop)
//   - The DESIGN HUD: a slim top bar with the theme + countdown + "Done" button
//     (shown only while playing, so it doesn't cover the start/result screens)

import { CRITERIA_LABELS } from "./rubric.js";

export function createScreens({ onStart, onDone, onRetry, onNext, onFinish, onRestart, onNextHouse, onExplore }) {
  // ---- Overlay root --------------------------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="overlay__card" role="dialog"></div>
  `;
  const card = overlay.querySelector(".overlay__card");
  document.body.appendChild(overlay);

  // ---- DESIGN HUD (top bar) ------------------------------------------------
  const hud = document.createElement("div");
  hud.className = "hud";
  hud.innerHTML = `
    <div class="hud__theme"><span class="hud__label">Theme</span> <span class="hud__theme-name"></span></div>
    <div class="hud__timer">5:00</div>
    <button class="hud__explore btn">👁 3rd person</button>
    <button class="hud__done btn btn--primary">Done</button>
  `;
  document.body.appendChild(hud);
  const hudThemeName = hud.querySelector(".hud__theme-name");
  const hudTimer = hud.querySelector(".hud__timer");
  const exploreBtn = hud.querySelector(".hud__explore");
  hud.querySelector(".hud__done").addEventListener("click", () => onDone());
  exploreBtn.addEventListener("click", () => onExplore && onExplore());
  hud.style.display = "none";

  // Toggle the camera button's label between first- and third-person.
  function setPovLabel(isThird) {
    exploreBtn.textContent = isThird ? "🙂 1st person" : "👁 3rd person";
  }

  // ---- Helpers -------------------------------------------------------------
  // animToken is the cleanup mechanism for time-based animations: every screen
  // change bumps it, and any running animation checks "is my token still current?"
  // and bails if not. So navigating away (Retry, Next room, timer expiry…)
  // automatically cancels a half-finished count-up — no manual teardown needed.
  let animToken = 0;

  function showOverlay(html) {
    animToken++; // cancel any animation from the previous screen
    card.innerHTML = html;
    overlay.style.display = "flex";
  }
  function hideOverlay() {
    animToken++; // cancel any in-flight result animation when leaving the overlay
    overlay.style.display = "none";
  }

  // Count a number element from 0 up to `target` over `ms`, guarded by a token so
  // it stops if the screen changes mid-animation.
  function countUp(el, target, suffix, ms, token) {
    if (!el) return;
    const start = performance.now();
    function step(now) {
      if (token !== animToken || !el.isConnected) return; // screen changed -> stop
      const t = Math.min(1, (now - start) / ms);
      el.textContent = `${Math.round(t * target)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // Fallback: guarantee the final number even if rAF is throttled, so scores are
    // never left stuck at 0. Still guarded by the token (cancels on screen change).
    setTimeout(() => {
      if (token === animToken && el.isConnected) el.textContent = `${target}${suffix}`;
    }, ms + 60);
  }

  // Run fn after `delay`, but only if we're still on the same screen.
  function later(fn, delay, token) {
    setTimeout(() => {
      if (token === animToken) fn();
    }, delay);
  }

  // ---- START ---------------------------------------------------------------
  // The ROOM TYPE is the headline so the player knows what they're designing
  // before they start; the theme + what the room needs are shown beneath it.
  function showStart(theme, roomName, houseNumber, requiredItems = []) {
    const house = houseNumber ? `House ${houseNumber}` : "";
    const needs = requiredItems.length
      ? `<p class="overlay__needs">Needs: <strong>${requiredItems.join(", ")}</strong></p>`
      : "";
    showOverlay(`
      <p class="brand">Décor to Impress</p>
      <p class="brand__tag">style the room, wow the AI judge</p>
      <p class="overlay__eyebrow">${house ? house + " · " : ""}next room</p>
      <h1 class="overlay__title overlay__room">${roomName || "Room"}</h1>
      ${needs}
      <p class="overlay__sub">Theme</p>
      <div class="theme-chip">${theme.name}</div>
      <p class="overlay__sub">${theme.tagline}</p>
      <p class="overlay__hint">You'll have <strong>5:00</strong> to design the ${
        roomName ? roomName.toLowerCase() : "room"
      } to match this theme. Arrange furniture, then submit for scoring.</p>
      <button class="btn btn--primary overlay__cta" data-action="start">Start designing</button>
    `);
    card.querySelector('[data-action="start"]').addEventListener("click", () => onStart());
  }

  // ---- REVEAL (loading placeholder + birdseye) -----------------------------
  function showReveal(image) {
    const shot = image
      ? `<img class="birdseye" src="${image}" alt="Top-down view of your room" />`
      : "";
    showOverlay(`
      ${shot}
      <div class="spinner" aria-hidden="true"></div>
      <h1 class="overlay__title">Scoring your design…</h1>
      <p class="overlay__sub">The judge is taking a look.</p>
    `);
  }

  // ---- RESULT (renders from a result object) -------------------------------
  // result = { scores: {completeness,clutter,coherence,composition,theme},
  //            total, critique }
  function showResult(result, theme, outcome) {
    const keys = Object.keys(result.scores);
    // Render bars EMPTY (width 0) and numbers at 0 — we animate them up after the
    // screen mounts, driven by the result object.
    const rows = keys
      .map((key) => {
        const label = CRITERIA_LABELS[key] || key;
        return `
          <div class="score-row" data-key="${key}">
            <span class="score-row__label">${label}</span>
            <span class="score-row__bar"><span class="score-row__fill" style="width:0%"></span></span>
            <span class="score-row__num">0/5</span>
          </div>`;
      })
      .join("");

    const shot = result.image
      ? `<img class="birdseye anim-fade" src="${result.image}" alt="Top-down view of your room" />`
      : "";

    // Outcome flags decide the badge + which buttons appear (the four-way branch).
    const { passed, hasNext, isLast, roomName, threshold } = outcome;
    const badge = passed
      ? `<div class="verdict verdict--pass">${
          isLast ? "Final room cleared! 🎉" : "Room cleared! ✓"
        }</div>`
      : `<div class="verdict verdict--fail">Below ${threshold}/25 — keep trying</div>`;

    // Retry is always available. The second (primary) button depends on outcome:
    //   passed + more rooms -> Next room ; passed + last room -> Finish ; fail -> none
    let primary = "";
    if (passed && hasNext) primary = `<button class="btn btn--primary" data-action="next">Next room →</button>`;
    else if (passed && isLast) primary = `<button class="btn btn--primary" data-action="finish">Finish →</button>`;

    showOverlay(`
      <p class="overlay__eyebrow">${roomName} · ${theme ? theme.name : ""}</p>
      <h1 class="overlay__title">Results</h1>
      ${badge}
      ${shot}
      <div class="scores">${rows}</div>
      <div class="total">Total <strong class="total__num">0</strong> / 25</div>
      <p class="critique anim-fade">${result.critique}</p>
      <div class="overlay__actions">
        <button class="btn" data-action="retry">Retry</button>
        ${primary}
      </div>
    `);
    card.querySelector('[data-action="retry"]').addEventListener("click", () => onRetry());
    const nextBtn = card.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.addEventListener("click", () => onNext());
    const finishBtn = card.querySelector('[data-action="finish"]');
    if (finishBtn) finishBtn.addEventListener("click", () => onFinish());

    // ---- Animate the result in (instead of popping) ------------------------
    // Sequence: fade the birdseye, then count up each score (bar + number) one
    // after another, then the total, then fade in the critique. All steps are
    // guarded by the current token via later()/countUp(), so leaving the screen
    // cancels whatever's still pending.
    const token = animToken;
    const STAGGER = 160; // ms between successive score rows
    const COUNT_MS = 450; // duration of each count-up

    // birdseye fade-in shortly after mount (a small delay lets the CSS opacity
    // transition trigger; using a timer, not rAF, so it works even if rAF is
    // throttled — otherwise the birdseye could be left invisible).
    later(() => card.querySelector(".birdseye")?.classList.add("is-shown"), 30, token);

    keys.forEach((key, i) => {
      later(() => {
        const row = card.querySelector(`.score-row[data-key="${key}"]`);
        if (!row) return;
        const val = result.scores[key];
        row.querySelector(".score-row__fill").style.width = `${(val / 5) * 100}%`; // CSS animates width
        countUp(row.querySelector(".score-row__num"), val, "/5", COUNT_MS, token);
      }, 200 + i * STAGGER, token);
    });

    const afterScores = 200 + keys.length * STAGGER + 150;
    later(() => countUp(card.querySelector(".total__num"), result.total, "", 500, token), afterScores, token);
    later(() => card.querySelector(".critique")?.classList.add("is-shown"), afterScores + 550, token);
  }

  // ---- WIN (house complete) ------------------------------------------------
  function showWin(houseNumber) {
    showOverlay(`
      <div class="trophy" aria-hidden="true">🏠</div>
      <h1 class="overlay__title">House ${houseNumber || ""} complete!</h1>
      <p class="overlay__sub">Every room designed. Ready for a fresh one?</p>
      <div class="overlay__actions">
        <button class="btn btn--primary" data-action="nexthouse">Next house →</button>
        <button class="btn" data-action="restart">Redo this house</button>
      </div>
    `);
    card.querySelector('[data-action="nexthouse"]').addEventListener("click", () => onNextHouse());
    card.querySelector('[data-action="restart"]').addEventListener("click", () => onRestart());
  }

  // ---- ERROR (judge unavailable) -------------------------------------------
  // No valid score means we can't pass, so the only sensible action is Retry.
  function showError(image, message) {
    const shot = image
      ? `<img class="birdseye" src="${image}" alt="Top-down view of your room" />`
      : "";
    showOverlay(`
      <div class="error-badge" aria-hidden="true">!</div>
      <h1 class="overlay__title">Judge unavailable</h1>
      ${shot}
      <p class="overlay__sub">${message || "Something went wrong scoring your design."}</p>
      <div class="overlay__actions">
        <button class="btn btn--primary" data-action="retry">Retry</button>
      </div>
    `);
    card.querySelector('[data-action="retry"]').addEventListener("click", () => onRetry());
  }

  // ---- HUD control ---------------------------------------------------------
  function showHud(theme) {
    hudThemeName.textContent = theme.name;
    hud.style.display = "flex";
  }
  function hideHud() {
    hud.style.display = "none";
  }
  function updateTimer(text) {
    hudTimer.textContent = text;
  }
  // Visual warning in the final stretch (DESIGN_DOC mentions a last-30s shift; we
  // do the cheap colour part now, audio is Milestone 7 polish).
  function setTimerWarning(on) {
    hudTimer.classList.toggle("hud__timer--warning", on);
  }

  return {
    showStart,
    showReveal,
    showResult,
    showWin,
    showError,
    hideOverlay,
    showHud,
    hideHud,
    setPovLabel,
    updateTimer,
    setTimerWarning,
  };
}
