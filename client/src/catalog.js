// =============================================================================
// catalog.js — the data-driven list of furniture the player can place
// =============================================================================
//
// Everything about a furniture item lives here as plain data, NOT code. The UI
// reads this list to build the panel, and the placement system reads it to size
// the ghost/mesh. Keeping it data-driven means Milestone 7 can swap in per-room
// catalogs and unlock new items without touching the placement logic.
//
// Footprint is given in DEFAULT orientation as { rows, cols }:
//   rows -> how many grid tiles deep (along Z)
//   cols -> how many grid tiles wide (along X)
// Milestone 3 will rotate items by swapping rows<->cols; the data here never
// changes, only the rotation applied to it.
//
// For now each item is just a coloured box (a placeholder). `height` is the box
// height in world units; `color` is its material colour. Real Kenney models get
// swapped in later — the placement system won't care, since it only needs the
// footprint and a mesh.

export const CATALOG = [
  {
    id: "lamp",
    name: "Lamp",
    footprint: { rows: 1, cols: 1 },
    height: 1.4,
    color: 0xf2c14e, // warm yellow (ghost/fallback tint + swatch)
    modelPath: "/models/lampRoundFloor.glb",
    scale: 1.63, // uniform scale on the raw model (tuned from its measured size)
    baseRotation: 0, // degrees; aligns model "front" with our footprint convention
  },
  {
    id: "plant",
    name: "Plant",
    footprint: { rows: 1, cols: 1 },
    height: 1.0,
    color: 0x4caf50, // leafy green
    modelPath: "/models/pottedPlant.glb",
    scale: 1.77,
    baseRotation: 0,
  },
  {
    id: "chair",
    name: "Chair",
    footprint: { rows: 1, cols: 1 },
    height: 0.9,
    color: 0x8d6e63, // wood brown
    modelPath: "/models/chair.glb",
    scale: 2.0,
    baseRotation: 0,
  },
  {
    id: "desk",
    name: "Desk",
    footprint: { rows: 1, cols: 2 }, // 1 deep, 2 wide
    height: 0.8,
    color: 0x5c6bc0, // indigo
    modelPath: "/models/desk.glb",
    scale: 2.3,
    baseRotation: 0,
    details: ["cup", "book"], // a mug + a book on the desk
  },
  {
    id: "dresser",
    name: "Dresser",
    footprint: { rows: 2, cols: 1 }, // 2 deep, 1 wide
    height: 1.0,
    color: 0x26a69a, // teal
    modelPath: "/models/cabinetBedDrawer.glb",
    scale: 3.38,
    baseRotation: 0,
  },
  {
    id: "bed",
    name: "Bed",
    footprint: { rows: 2, cols: 3 }, // 2 deep, 3 wide
    height: 0.6,
    color: 0xec407a, // pink
    modelPath: "/models/bedDouble.glb",
    scale: 1.98,
    baseRotation: 90, // its long axis is on Z; footprint is wider on X, so turn it
  },

  // ---- More furniture (floor items) -----------------------------------------
  {
    id: "sofa",
    name: "Sofa",
    footprint: { rows: 1, cols: 2 }, // 1 deep, 2 wide
    height: 0.8,
    color: 0x6d8b74,
    modelPath: "/models/sofa.glb",
    scale: 2.0,
    baseRotation: 0,
  },
  {
    id: "coffeeTable",
    name: "Coffee Table",
    footprint: { rows: 1, cols: 1 },
    height: 0.4,
    color: 0x8d6e63,
    modelPath: "/models/coffeeTable.glb",
    scale: 1.5,
    baseRotation: 0,
    details: ["cup", "book"], // a coffee cup + a book on top
  },
  {
    id: "bookshelf",
    name: "Bookshelf",
    footprint: { rows: 1, cols: 1 },
    height: 1.8,
    color: 0x8d6e63,
    modelPath: "/models/bookshelf.glb",
    scale: 2.0,
    baseRotation: 0,
  },
  {
    id: "tvStand",
    name: "TV Stand",
    footprint: { rows: 1, cols: 2 },
    height: 0.6,
    color: 0x5d4037,
    modelPath: "/models/tvStand.glb",
    scale: 2.2,
    baseRotation: 0,
    details: ["tv"], // a TV (screen on a stand) sits on top
  },
  {
    id: "divider",
    name: "Divider",
    footprint: { rows: 1, cols: 1 }, // a thin partition; rotate (R) + chain to split space
    height: 1.6,
    color: 0xbdbdbd,
    modelPath: "/models/divider.glb",
    scale: 1.7,
    baseRotation: 0,
  },

  // ---- Small decor (fill the room with detail) ------------------------------
  {
    id: "books",
    name: "Books",
    footprint: { rows: 1, cols: 1 },
    height: 0.2,
    color: 0xc0563f,
    modelPath: "/models/books.glb",
    scale: 2.6,
    baseRotation: 0,
  },
  {
    id: "smallPlant",
    name: "Small Plant",
    footprint: { rows: 1, cols: 1 },
    height: 0.5,
    color: 0x4f8f43,
    modelPath: "/models/smallPlant.glb",
    scale: 4.5,
    baseRotation: 0,
  },
  {
    id: "cushion",
    name: "Cushion",
    footprint: { rows: 1, cols: 1 },
    height: 0.3,
    color: 0xff9eb5,
    procedural: "cushion", // no model — built in code
  },
  {
    id: "flowers",
    name: "Flowers",
    footprint: { rows: 1, cols: 1 },
    height: 0.6,
    color: 0xff5fa2,
    procedural: "flowers",
  },
  {
    id: "rug",
    name: "Rug",
    footprint: { rows: 2, cols: 3 },
    height: 0.05,
    color: 0xb07a6b,
    modelPath: "/models/rug.glb",
    scale: 1.7,
    baseRotation: 0,
    flat: true, // lies on the floor; furniture can sit on top, ignores occupancy
  },

  // ---- Bathroom fixtures (floor items) --------------------------------------
  {
    id: "toilet",
    name: "Toilet",
    footprint: { rows: 1, cols: 1 },
    height: 0.9,
    color: 0xfafafa,
    modelPath: "/models/toilet.glb",
    scale: 1.9,
    baseRotation: 0,
  },
  {
    id: "bathtub",
    name: "Bathtub",
    footprint: { rows: 1, cols: 2 }, // 1 deep, 2 wide (long)
    height: 0.5,
    color: 0xe0f7fa,
    modelPath: "/models/bathtub.glb",
    scale: 1.5,
    baseRotation: 0,
  },
  {
    id: "sink",
    name: "Sink",
    footprint: { rows: 1, cols: 1 },
    height: 0.8,
    color: 0xeceff1,
    modelPath: "/models/sink.glb",
    scale: 1.5,
    baseRotation: 0,
  },

  // ---- Wall-mounted items (mount: "wall") -----------------------------------
  // These don't sit on floor tiles — they snap onto a wall segment. The model is
  // a full-height wall piece with a built-in window/doorway. `wallScale` sizes it
  // to one segment + the wall height (tuned at runtime).
  {
    id: "window",
    name: "Window",
    mount: "wall",
    footprint: { rows: 1, cols: 1 }, // for the catalog label only
    color: 0x90caf9, // light blue (swatch)
    modelPath: "/models/window.glb",
    scale: 1.2,
    baseRotation: 0,
    mountY: 0.9, // raised to sill height (wall frames it above/below)
  },
  {
    id: "shelf",
    name: "Wall Shelf",
    mount: "wall",
    procedural: "shelf", // built in code (no model) — a plank that sticks out of the wall
    footprint: { rows: 1, cols: 1 },
    color: 0xa1887f,
    mountY: 1.45, // mounted high on the wall
  },
  {
    id: "wallArt",
    name: "Wall Art",
    mount: "wall",
    procedural: "wallArt", // framed picture (canvas colour tintable)
    footprint: { rows: 1, cols: 1 },
    color: 0x7ec8e3,
    mountY: 1.5, // centred at eye level
  },
  {
    id: "door",
    name: "Door",
    mount: "wall",
    footprint: { rows: 1, cols: 1 },
    color: 0x8d6e63,
    modelPath: "/models/door.glb",
    scale: 2.0, // ~2-unit-tall door (clearly a door, with frame + handle)
    baseRotation: 0,
    mountY: 0, // on the floor
  },
];

// Convenience lookup by id (handy for the UI and future save/load).
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((it) => [it.id, it]));
