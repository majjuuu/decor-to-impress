// =============================================================================
// game.js — the finite state machine (FSM) that drives the round
// =============================================================================
//
// WHY AN FSM INSTEAD OF SCATTERED FLAGS:
// The game is in EXACTLY ONE state at a time and changes only through
// transition(to), which runs the current state's EXIT logic then the new state's
// ENTER logic. All "turn things on/off" code lives in those handlers, so a state
// can't be half-entered and exits always run (timer stopped, stray work cleared).
//
// MILESTONE 7b — PROGRESSION as BRANCHING TRANSITIONS:
// After RESULT we branch on TWO facts — did the round PASS (total >= threshold)
// and is there a NEXT room — giving four outcomes:
//   pass + more rooms  -> "Next room": advance, fully reset, load next room, START
//   pass + last room   -> "Finish": go to the WIN screen
//   fail               -> only "Retry": replay THIS room with a new theme
// The branch lives in ONE place (RESULT's enter, via the outcome flags it hands
// to the result screen). Rooms are DATA (rooms.js), so this is content, not code.

import { pickThemeFromIds } from "./themes.js";
import { createCountdown, formatMMSS } from "./timer.js";
import { PASS_THRESHOLD } from "./rooms.js";
import { CATALOG_BY_ID } from "./catalog.js";
import { play } from "./soundManager.js";

export const STATES = {
  START: "START",
  DESIGN: "DESIGN",
  REVEAL: "REVEAL",
  RESULT: "RESULT",
  ERROR: "ERROR", // judge request/parse failed — friendly fallback
  WIN: "WIN", // cleared the final room
};

const DESIGN_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_MS = 30 * 1000; // turn the clock red in the final 30s

export function createGame({
  placement,
  screens,
  captureScreenshot,
  requestJudgeScore, // (image, theme, requiredItems, placedItems) -> Promise<result>
  resetSelection, // clears the catalog highlight + active ghost between rounds
  setCatalogVisible, // show the catalog panel only during DESIGN
  setCatalogItems, // load the current room's available furniture into the panel
  activateRoom, // (index) -> point placement/capture/camera/grid at that room
  getRooms, // () -> current house's room list (procedurally generated)
  getHouseNumber, // () -> current house number (for display)
  newHouse, // () -> generate the next house + wipe furniture (shells reused)
}) {
  let state = null;
  let currentRoomIndex = 0;
  let theme = null;
  let result = null;
  let capturedImage = null; // base64 PNG birdseye, grabbed on REVEAL
  let errorMessage = null; // shown on the ERROR screen
  let revealToken = 0; // guards against a stale judge response applying late
  // Per-round juice flags (reset on every DESIGN enter, so they never leak across
  // rounds): one-time guard for the 30s warning sting + last whole-second we ticked.
  let warningFired = false;
  let lastTickSecond = null;

  const currentRoom = () => getRooms()[currentRoomIndex];
  const roomCount = () => getRooms().length;

  // The single countdown instance. onTick repaints the HUD; onExpire ends DESIGN.
  const timer = createCountdown({
    durationMs: DESIGN_MS,
    onTick: (ms) => {
      screens.updateTimer(formatMMSS(ms));
      const inWarning = ms <= WARNING_MS;
      screens.setTimerWarning(inWarning); // CSS red pulse (idempotent toggle)
      if (inWarning) {
        // ONE-TIME shift: the sting fires once per round, not every tick.
        if (!warningFired) {
          warningFired = true;
          play("warning");
        }
        // Audible tempo cue: a tick on each new whole second of the final stretch.
        const secs = Math.ceil(ms / 1000);
        if (secs > 0 && secs !== lastTickSecond) {
          lastTickSecond = secs;
          play("tick");
        }
      }
    },
    onExpire: () => transition(STATES.REVEAL),
  });

  // Load a room into the live game: point the catalog at its furniture, pick a
  // fresh theme from its pool, and make its shell the active room (camera flies
  // there, grid + placement target it).
  function loadRoom() {
    const room = currentRoom();
    setCatalogItems(room.itemIds.map((id) => CATALOG_BY_ID[id]));
    theme = pickThemeFromIds(room.themeIds);
    activateRoom(currentRoomIndex);
  }

  // Summarize the placed-items registry as [{ name, count }] for the judge.
  function summarizePlaced() {
    const counts = {};
    for (const entry of placement.placedItems) {
      counts[entry.item.name] = (counts[entry.item.name] || 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }

  // ---- Per-state ENTER logic ----------------------------------------------
  const onEnter = {
    [STATES.START]() {
      placement.setInputEnabled(false);
      setCatalogVisible(false);
      screens.hideHud();
      screens.showStart(theme, currentRoom().name, getHouseNumber(), currentRoom().requiredItems);
    },
    [STATES.DESIGN]() {
      screens.hideOverlay();
      resetSelection(); // start each round with nothing selected
      setCatalogVisible(true);
      screens.showHud(theme);
      screens.setTimerWarning(false); // clear any leftover red pulse from last round
      warningFired = false; // reset the per-round juice triggers
      lastTickSecond = null;
      placement.setInputEnabled(true);
      timer.start(); // fresh end-timestamp; start() stops any prior interval first
    },
    [STATES.REVEAL]() {
      setCatalogVisible(false);
      screens.hideHud();
      // Capture the clean top-down birdseye now, then show it on the loading
      // screen so the player sees what's being judged.
      capturedImage = captureScreenshot();
      screens.showReveal(capturedImage);

      // Send it to the AI judge with THIS room's requiredItems (a data change —
      // the Milestone 6 judge code is untouched). Async, so guard with a token.
      const token = ++revealToken;
      requestJudgeScore(capturedImage, theme, currentRoom().requiredItems, summarizePlaced())
        .then((judged) => {
          if (token !== revealToken) return; // stale response — ignore
          result = { ...judged, image: capturedImage }; // birdseye rides along
          transition(STATES.RESULT);
        })
        .catch((err) => {
          if (token !== revealToken) return;
          errorMessage = err && err.message ? err.message : "The judge is unavailable.";
          transition(STATES.ERROR);
        });
    },
    [STATES.RESULT]() {
      // The four-way branch, decided in ONE place: pass/fail x has-next/last.
      const passed = result.total >= PASS_THRESHOLD;
      const isLast = currentRoomIndex >= roomCount() - 1;
      screens.showResult(result, theme, {
        passed,
        hasNext: passed && !isLast,
        isLast,
        roomName: currentRoom().name,
        threshold: PASS_THRESHOLD,
      });
    },
    [STATES.WIN]() {
      play("win");
      screens.showWin(getHouseNumber()); // "House N complete!" + Next house
    },
    [STATES.ERROR]() {
      screens.showError(capturedImage, errorMessage);
    },
  };

  // ---- Per-state EXIT logic (always runs on the way out) -------------------
  const onExit = {
    [STATES.START]() {},
    [STATES.DESIGN]() {
      // The crucial cleanup: stop the timer and disable input whenever we leave
      // DESIGN, so no interval keeps ticking and no clicks land off-screen.
      timer.stop();
      placement.setInputEnabled(false);
    },
    [STATES.REVEAL]() {
      // Invalidate any in-flight judge response so it can't apply after we leave.
      revealToken++;
    },
    [STATES.RESULT]() {},
    [STATES.WIN]() {},
    [STATES.ERROR]() {},
  };

  // ---- The one transition function ----------------------------------------
  function transition(to) {
    if (state && onExit[state]) onExit[state]();
    state = to;
    if (onEnter[to]) onEnter[to]();
  }

  // ---- Public controls (wired to buttons/keys in main.js) ------------------
  function start() {
    placement.clearHouse(); // empty house at the start of a fresh game
    timer.stop();
    resetSelection();
    currentRoomIndex = 0;
    loadRoom();
    transition(STATES.START);
  }
  function beginDesign() {
    transition(STATES.DESIGN);
  }
  function finishDesign() {
    transition(STATES.REVEAL);
  }
  // Retry: replay the SAME room with a fresh theme. Only THIS room's pieces are
  // cleared — finished neighbours stay.
  function retry() {
    placement.clearActiveRoomEdits();
    timer.stop();
    resetSelection();
    theme = pickThemeFromIds(currentRoom().themeIds, theme);
    transition(STATES.DESIGN);
  }
  // Next room: COMMIT the finished room (its furniture stays next door), then load
  // the next room (fresh occupancy, new theme, camera flies over).
  function nextRoom() {
    if (currentRoomIndex >= roomCount() - 1) return; // guard; UI shouldn't allow it
    placement.commitRoom();
    timer.stop();
    resetSelection();
    currentRoomIndex += 1;
    loadRoom();
    transition(STATES.START);
  }
  // Finish: from the last room's RESULT, commit it then go to the win screen.
  function finishGame() {
    placement.commitRoom();
    transition(STATES.WIN);
  }
  // Restart: empty the whole house and start over from the first room.
  function restart() {
    placement.clearHouse();
    timer.stop();
    resetSelection();
    currentRoomIndex = 0;
    loadRoom();
    transition(STATES.START);
  }
  // Next house: generate a fresh procedural house (wipes furniture), start over
  // from its first room. Wired to the "Next house" button on the completion screen.
  function nextHouse() {
    newHouse(); // main regenerates the room list + clears all furniture
    timer.stop();
    resetSelection();
    currentRoomIndex = 0;
    loadRoom();
    transition(STATES.START);
  }

  // Pause/resume the design countdown — used by Explore mode so roaming the
  // neighborhood doesn't eat into the round's time. No-ops outside DESIGN.
  function pauseTimer() {
    if (state === STATES.DESIGN) timer.pause();
  }
  function resumeTimer() {
    if (state === STATES.DESIGN) timer.resume();
  }

  function getState() {
    return state;
  }
  function getTheme() {
    return theme;
  }
  function getRoom() {
    return currentRoom();
  }
  function getRoomIndex() {
    return currentRoomIndex;
  }

  return {
    start,
    beginDesign,
    finishDesign,
    retry,
    nextRoom,
    finishGame,
    restart,
    nextHouse,
    pauseTimer,
    resumeTimer,
    getState,
    getTheme,
    getRoom,
    getRoomIndex,
    transition, // exposed for tests
  };
}
