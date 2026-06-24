// =============================================================================
// rooms.js — PROCEDURAL house generator (Milestone 9)
// =============================================================================
//
// Instead of a hand-written room list, each house is GENERATED: a fixed footprint
// of FLOORS x ROOMS_PER_FLOOR, where every floor gets a bathroom plus a random
// mix of other room types, each with a randomised theme pool. Finish a house and
// the game generates the next one, so play is endless and varied. The layout
// geometry (offsets/floors) is handled by room.js — this module only decides the
// CONTENT (which room types, required items, themes) per house.

import { THEMES } from "./themes.js";

export const PASS_THRESHOLD = 18; // out of 25
export const FLOORS = 2;
export const ROOMS_PER_FLOOR = 5;

// Non-bathroom room templates (a required item + the furniture it offers). Window
// + door are added to every room.
const ROOM_TYPES = [
  { name: "Bedroom", requiredItems: ["Bed"], itemIds: ["bed", "dresser", "lamp", "plant", "bookshelf"] },
  { name: "Living Room", requiredItems: ["Chair"], itemIds: ["sofa", "coffeeTable", "tvStand", "chair", "lamp", "plant", "bookshelf"] },
  { name: "Dining Room", requiredItems: ["Chair"], itemIds: ["chair", "desk", "plant", "lamp", "sofa"] },
  { name: "Study", requiredItems: ["Desk"], itemIds: ["desk", "chair", "dresser", "lamp", "bookshelf"] },
  { name: "Office", requiredItems: ["Desk"], itemIds: ["desk", "chair", "dresser", "lamp", "bookshelf"] },
  { name: "Lounge", requiredItems: ["Chair"], itemIds: ["sofa", "coffeeTable", "lamp", "plant", "tvStand", "bookshelf"] },
  { name: "Nursery", requiredItems: ["Bed"], itemIds: ["bed", "dresser", "plant", "lamp", "bookshelf"] },
  { name: "Library", requiredItems: ["Desk"], itemIds: ["bookshelf", "desk", "chair", "sofa", "plant"] },
];
const BATHROOM = { name: "Bathroom", requiredItems: ["Toilet"], itemIds: ["toilet", "bathtub", "sink", "plant"] };

// Items available in EVERY room (wall pieces + space tools), appended to each.
const UNIVERSAL = ["window", "door", "shelf", "divider"];

// Fisher–Yates shuffle (Math.random is fine in the browser).
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A random pool of 3 distinct theme ids for one room.
function randomThemePool() {
  return shuffle([...THEMES]).slice(0, 3).map((t) => t.id);
}

// Generate one house: FLOORS floors, each with a bathroom + (ROOMS_PER_FLOOR-1)
// distinct other room types, placed in random order. Returns a flat room list in
// play order (floor 0 first, then up).
export function generateHouse() {
  const rooms = [];
  let n = 0;
  for (let floor = 0; floor < FLOORS; floor++) {
    const picks = shuffle([...ROOM_TYPES]).slice(0, ROOMS_PER_FLOOR - 1).map((t) => ({ ...t }));
    picks.push({ ...BATHROOM });
    shuffle(picks); // bathroom lands at a random slot on the floor
    for (const t of picks) {
      rooms.push({
        id: `r${n}`,
        name: t.name,
        requiredItems: t.requiredItems,
        itemIds: [...t.itemIds, ...UNIVERSAL],
        themeIds: randomThemePool(),
      });
      n++;
    }
  }
  return rooms;
}
