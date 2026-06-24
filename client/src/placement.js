// =============================================================================
// placement.js — grid occupancy, mouse->tile raycasting, ghost preview,
//                placing, rotating, and deleting furniture
// =============================================================================
//
// This module owns the "arrange furniture on the grid" interaction. It exposes
// clear, separate hooks so later milestones can build on it:
//   - footprintTiles                  -> THE single source of truth for "which
//                                        tiles does this item cover" (see below)
//   - canPlace / occupy / freeTiles   -> occupancy helpers, all routed through it
//   - placedItems registry            -> list of everything on the floor (M5)
//   - createPlacementSystem(...)       -> wires raycasting + ghost + click/rotate/delete
//
// THREE CONCEPTS, explained inline below:
//   (a) Raycasting + Normalized Device Coordinates — turning a mouse pixel into
//       a 3D ray, used both to find the floor tile AND to pick a placed mesh.
//   (b) Tile <-> world conversion — snapping that hit point onto our grid.
//   (c) How a footprint transforms under rotation (rows/cols swap on 90/270),
//       and why routing every system through ONE footprint function matters.

import * as THREE from "three";
import {
  grid,
  GRID_SIZE,
  ROOM_SIZE,
  TILE_SIZE,
  tileToWorld,
  worldToTile,
  isInBounds,
} from "./grid.js";
import { WALL_HEIGHT } from "./room.js";
import { play } from "./soundManager.js";

// -----------------------------------------------------------------------------
// Wall-mounted items (windows/doors) — a SEPARATE 1-D occupancy from the floor.
// Each wall has GRID_SIZE segments (matching the floor columns/rows along it).
// -----------------------------------------------------------------------------
const HALF = ROOM_SIZE / 2;
const WALL_INSET = 0.06; // push the piece just inside the wall's inner face

// Where (and which way) a piece sits for segment `index` on a given wall. The
// rotationY turns the piece's window/door face toward the room interior.
function wallSegmentTransform(wallId, index) {
  const along = index - HALF + 0.5; // tile centre along the wall: -4.5 .. +4.5
  switch (wallId) {
    case "back": return { x: along, z: -HALF + WALL_INSET, rotationY: 0 };
    case "front": return { x: along, z: HALF - WALL_INSET, rotationY: Math.PI };
    case "left": return { x: -HALF + WALL_INSET, z: along, rotationY: Math.PI / 2 };
    case "right": return { x: HALF - WALL_INSET, z: along, rotationY: -Math.PI / 2 };
    default: return { x: 0, z: 0, rotationY: 0 };
  }
}

// -----------------------------------------------------------------------------
// (c) Footprint under rotation — the single source of truth
// -----------------------------------------------------------------------------
//
// An item's footprint is stored once, in DEFAULT orientation, as { rows, cols }.
// When you rotate it 90 or 270 degrees, width and depth swap: a 2x3 bed (2 deep,
// 3 wide) standing on its side becomes 3x2 (3 deep, 2 wide). At 0 and 180 the
// shape is unchanged. effectiveFootprint() applies exactly that swap.
//
// WHY one function: the ghost preview, canPlace, occupy, and delete's freeTiles
// must all agree, tile-for-tile, on which squares an item covers. If any of them
// computed tiles independently they could drift out of sync (e.g. the ghost says
// "valid" but occupy marks a different set, leaving phantom-occupied tiles). By
// routing EVERY one of them through footprintTiles(), there is a single
// definition of "covered tiles" and they cannot disagree.

export function effectiveFootprint(item, orientation = 0) {
  const { rows, cols } = item.footprint;
  const swapped = orientation === 90 || orientation === 270;
  return swapped ? { rows: cols, cols: rows } : { rows, cols };
}

// THE function: the list of {row, col} tiles an item covers when its top-left
// (origin) tile is at (originRow, originCol) in the given orientation.
export function footprintTiles(item, originRow, originCol, orientation = 0) {
  const fp = effectiveFootprint(item, orientation);
  const tiles = [];
  for (let r = originRow; r < originRow + fp.rows; r++) {
    for (let c = originCol; c < originCol + fp.cols; c++) {
      tiles.push({ row: r, col: c });
    }
  }
  return tiles;
}

// World-space centre of the whole footprint, so a multi-tile mesh sits centred
// over the tiles it occupies. We average the centres of the two corner tiles.
export function footprintCenterWorld(item, originRow, originCol, orientation = 0) {
  const fp = effectiveFootprint(item, orientation);
  const a = tileToWorld(originRow, originCol);
  const b = tileToWorld(originRow + fp.rows - 1, originCol + fp.cols - 1);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

// -----------------------------------------------------------------------------
// Occupancy helpers — all derive their tiles from footprintTiles().
// -----------------------------------------------------------------------------

// Can `item` be placed at origin (row, col) in this orientation? True only if
// EVERY covered tile is in-bounds AND currently empty (null).
export function canPlace(item, row, col, orientation = 0) {
  return footprintTiles(item, row, col, orientation).every(
    ({ row: r, col: c }) => isInBounds(r, c) && grid[r][c] === null
  );
}

// Flat items (rugs) lie under furniture: they only need to be IN-BOUNDS — they
// ignore (and don't claim) tile occupancy, so things can sit on top of them.
export function canPlaceFlat(item, row, col, orientation = 0) {
  return footprintTiles(item, row, col, orientation).every(({ row: r, col: c }) => isInBounds(r, c));
}

// Mark an item's covered tiles as occupied, tagging them with an instance id so
// we know WHICH placed item owns each tile (delete uses this).
export function occupy(item, row, col, instanceId, orientation = 0) {
  for (const { row: r, col: c } of footprintTiles(item, row, col, orientation)) {
    grid[r][c] = instanceId;
  }
}

// Free a set of tiles (set them back to null). Takes the tile list directly so
// delete can call freeTiles(entry.tiles) — the SAME tiles footprintTiles
// produced at placement time, guaranteeing we free exactly what we occupied.
export function freeTiles(tiles) {
  for (const { row, col } of tiles) {
    grid[row][col] = null;
  }
}

// -----------------------------------------------------------------------------
// Placed-items registry — every piece currently on the floor.
// -----------------------------------------------------------------------------
// Each entry: { instanceId, item, row, col, orientation, mesh, tiles }
//   row/col   = origin (top-left) tile
//   orientation = 0/90/180/270
//   tiles     = the exact covered-tile list (from footprintTiles at placement)
// M5 (screenshot/judge) and delete both read from this.
export const placedItems = [];

// Degrees -> radians for a rotation about the vertical (Y) axis. Because each
// mesh's geometry is centred on its local origin, setting mesh.rotation.y spins
// it around its OWN centre — which is what we want for both ghost and placed art.
function orientationToRadians(orientation) {
  return THREE.MathUtils.degToRad(orientation);
}

// -----------------------------------------------------------------------------
// Item-mesh factory — a CLONE of the preloaded model (Milestone 7a), or a
// coloured-box fallback if a model is missing.
// -----------------------------------------------------------------------------
// IMPORTANT: this changes ONLY "what mesh gets created". Everything returned is
// wrapped in a Group "holder" whose local origin sits at floor level, centred on
// the footprint — exactly the contract place() relies on. So footprintTiles,
// canPlace, occupy, freeTiles, and the orientation rotation are all untouched.
//
// `models` is the id -> template map from preloadModels(). We clone the template
// (sharing geometry/material — cheap), apply the catalog's baseRotation + scale,
// recentre it on the holder, and sit it on the floor (bottom at y=0).
//
// `colorMap` recolours INDIVIDUAL PARTS: it maps a material name (e.g. "carpet"
// = the bed's blanket, "wood" = the frame) to a 0xRRGGBB colour. Parts not in the
// map keep their original colour. {} or null means fully original.
//
// CLONE MATERIALS PER INSTANCE: a plain clone() shares materials with the
// template, so recolouring one piece would recolour every clone. For each part we
// override, we clone THAT material for this instance and record it on the holder
// so removePlaced can dispose it (untouched parts keep the shared template
// material and own nothing).
// A procedural wall shelf: a wood plank that sits flush on the wall (local z=0)
// and sticks out into the room (+z), with two small brackets. Built in code since
// the kit has no wall-shelf model. Its bottom is at y=0 so placeWall's mountY
// raises it to shelf height.
function makeShelf(color = 0xa1887f) {
  const holder = new THREE.Group();
  holder.userData.ownedMaterials = [];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  holder.userData.ownedMaterials.push(mat);
  const W = 0.92, T = 0.06, D = 0.28;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), mat);
  plank.position.set(0, 0, D / 2); // flush at wall (z=0), extends into room (+z)
  plank.castShadow = true;
  plank.receiveShadow = true;
  holder.add(plank);
  for (const bx of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, D * 0.8), mat);
    br.position.set(bx, -0.08, D * 0.4);
    br.castShadow = true;
    holder.add(br);
  }
  return holder;
}

// --- More procedural decor (small objects that fill a room) ------------------
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });

// A soft floor cushion (a squashed sphere). Sits on the floor.
function makeCushion(color = 0xff9eb5) {
  const h = new THREE.Group();
  const m = mat(color, { roughness: 0.95 });
  h.userData.ownedMaterials = [m];
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), m);
  c.scale.set(1, 0.45, 1);
  c.position.y = 0.19;
  c.castShadow = true;
  c.receiveShadow = true;
  h.add(c);
  return h;
}

// A vase of flowers (bloom colour is tintable).
function makeFlowers(color = 0xff5fa2) {
  const h = new THREE.Group();
  const owned = [];
  h.userData.ownedMaterials = owned;
  const vaseMat = mat(0xdfe7ef, { roughness: 0.3 }); owned.push(vaseMat);
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.28, 12), vaseMat);
  vase.position.y = 0.14; vase.castShadow = true; h.add(vase);
  const stemMat = mat(0x4f8f43); owned.push(stemMat);
  const bloomMat = mat(color, { roughness: 0.6 }); owned.push(bloomMat);
  for (const [x, y, z] of [[0, 0.58, 0], [0.1, 0.52, 0.06], [-0.1, 0.54, -0.05], [0.06, 0.6, -0.08]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, y - 0.28, 5), stemMat);
    stem.position.set(x, (0.28 + y) / 2, z); h.add(stem);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bloomMat);
    bloom.position.set(x, y, z); bloom.castShadow = true; h.add(bloom);
  }
  return h;
}

// A framed picture for the wall (canvas colour tintable). Built centred on y=0 so
// placeWall's mountY puts its middle at eye level. Faces +z (into the room).
function makeWallArt(color = 0x7ec8e3) {
  const h = new THREE.Group();
  const owned = [];
  h.userData.ownedMaterials = owned;
  const frameMat = mat(0x6d4c33); owned.push(frameMat);
  const artMat = mat(color, { roughness: 0.6 }); owned.push(artMat);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.52, 0.05), frameMat);
  frame.position.z = 0.025; frame.castShadow = true; h.add(frame);
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.06), artMat);
  canvas.position.z = 0.04; h.add(canvas);
  return h;
}

// --- "Props on top" — little details placed on furniture (group bottom at y=0) -
function propCup(owned) {
  const g = new THREE.Group();
  const cupMat = mat(0xffffff, { roughness: 0.4 }); owned.push(cupMat);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 12), cupMat);
  cup.position.y = 0.04; cup.castShadow = true; g.add(cup);
  const coffeeMat = mat(0x5a3a22, { roughness: 0.5 }); owned.push(coffeeMat);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 12), coffeeMat);
  coffee.position.y = 0.08; g.add(coffee);
  return g;
}
function propBook(owned) {
  const g = new THREE.Group();
  const colors = [0xe05a5a, 0x5e9cff, 0x6fcf73];
  let y = 0;
  for (let i = 0; i < 2; i++) {
    const m = mat(colors[(i + (owned.length % 3)) % 3]); owned.push(m);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.12), m);
    b.position.set(0, y + 0.018, 0); b.rotation.y = i * 0.3; b.castShadow = true; g.add(b);
    y += 0.04;
  }
  return g;
}
function propTV(cabW, owned) {
  const g = new THREE.Group();
  const w = Math.min(1.2, cabW * 0.8), hgt = w * 0.6;
  const dark = mat(0x161616, { roughness: 0.4 }); owned.push(dark);
  const screenMat = mat(0x2a4a66, { roughness: 0.2, metalness: 0.1, emissive: 0x16314d, emissiveIntensity: 0.5 });
  owned.push(screenMat);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.14), dark); base.position.y = 0.015; g.add(base);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.05), dark); neck.position.y = 0.09; g.add(neck);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.05), dark);
  bezel.position.set(0, 0.15 + hgt / 2, -0.015); bezel.castShadow = true; g.add(bezel);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, hgt - 0.08, 0.06), screenMat);
  screen.position.set(0, 0.15 + hgt / 2, 0.02); g.add(screen);
  return g;
}

// Place the named props on top of a model (using its measured bounds).
function decorateTop(holder, modelBox, details, owned) {
  const topY = modelBox.max.y;
  const cabW = modelBox.max.x - modelBox.min.x;
  const slots = [0, -0.18, 0.18, -0.3, 0.3]; // spread props along X
  details.forEach((name, i) => {
    let prop = null;
    if (name === "tv") prop = propTV(cabW, owned);
    else if (name === "cup") prop = propCup(owned);
    else if (name === "book") prop = propBook(owned);
    if (!prop) return;
    const x = name === "tv" ? 0 : slots[i % slots.length];
    prop.position.set(x, topY, name === "tv" ? -0.04 : 0);
    holder.add(prop);
  });
}

function makeItemHolder(item, models, colorMap = null) {
  // Procedural items build their own geometry (no GLB).
  if (item.procedural) {
    const c = colorMap && Object.values(colorMap)[0];
    const tint = c != null ? c : item.color;
    if (item.procedural === "shelf") return makeShelf(tint);
    if (item.procedural === "cushion") return makeCushion(tint);
    if (item.procedural === "flowers") return makeFlowers(tint);
    if (item.procedural === "wallArt") return makeWallArt(tint);
  }

  const holder = new THREE.Group();
  holder.userData.ownedMaterials = []; // per-instance materials we must dispose
  const owned = holder.userData.ownedMaterials;
  const template = models[item.id];

  if (!template) {
    // Fallback: a coloured box. No named parts, so use any chosen colour or the
    // item's default swatch.
    const firstColor = colorMap ? Object.values(colorMap)[0] : undefined;
    const { rows, cols } = item.footprint;
    const geo = new THREE.BoxGeometry(cols * TILE_SIZE, item.height, rows * TILE_SIZE);
    const mat = new THREE.MeshStandardMaterial({
      color: firstColor != null ? firstColor : item.color,
      roughness: 0.7,
    });
    const box = new THREE.Mesh(geo, mat);
    box.position.y = item.height / 2; // box centre up so its base rests on y=0
    box.castShadow = true;
    box.receiveShadow = true;
    holder.add(box);
    owned.push(mat);
    return holder;
  }

  const model = template.clone(true);
  model.rotation.y = THREE.MathUtils.degToRad(item.baseRotation || 0);
  model.scale.setScalar(item.scale || 1);

  // Recentre on X/Z and drop onto the floor: measure the (rotated, scaled) bounds,
  // then shift so the footprint centre is at the holder origin and the bottom is y=0.
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  const hasOverrides = colorMap && Object.keys(colorMap).length > 0;
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true; // shadows: every mesh casts; the floor receives
    obj.receiveShadow = true;
    if (hasOverrides) recolourParts(obj, colorMap, owned);
  });

  holder.add(model);

  // Little details on top (a TV on the stand, a coffee cup + book on a table, …)
  // so furniture reads as "lived in" rather than bare.
  if (item.details && item.details.length) {
    decorateTop(holder, new THREE.Box3().setFromObject(model), item.details, owned);
  }

  return holder;
}

// Recolour only the materials whose NAME appears in colorMap; leave the rest as
// the shared template material. Cloned (overridden) materials are pushed to `owned`.
function recolourParts(mesh, colorMap, owned) {
  const override = (mat) => {
    const color = colorMap[mat.name];
    if (color == null) return mat; // this part isn't being recoloured — keep shared
    const m = mat.clone();
    m.map = null; // drop the baked colour so the chosen colour reads true
    m.vertexColors = false;
    m.color = new THREE.Color(color);
    m.needsUpdate = true;
    owned.push(m);
    return m;
  };
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map(override)
    : override(mesh.material);
}

// List a model's recolourable PARTS as [{ name, color }] (unique by material
// name, with the part's natural colour as a CSS hex) — used to build the part UI.
export function getItemParts(item, models) {
  const template = models[item.id];
  if (!template) return [];
  const seen = new Map();
  template.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      const name = m.name || "part";
      if (!seen.has(name)) {
        seen.set(name, "#" + (m.color ? m.color.getHexString() : "cccccc"));
      }
    }
  });
  return [...seen.entries()].map(([name, color]) => ({ name, color }));
}

// =============================================================================
// createPlacementSystem — wires mouse/keyboard interaction to the helpers above.
// =============================================================================
export function createPlacementSystem({ scene, camera, floor, domElement, models = {}, walls = [] }) {
  // The ACTIVE room (Milestone 8): which floor/walls we raycast and the world
  // offset that local tile/wall coords are placed at. setActiveRoom() swaps these
  // as the player moves between rooms; everything else works in local room space.
  let activeFloor = floor;
  let activeWalls = walls;
  let roomOff = { x: 0, y: 0, z: 0 };

  // Per-wall segment occupancy (separate from the floor `grid`).
  const wallGrid = {
    back: new Array(GRID_SIZE).fill(null),
    front: new Array(GRID_SIZE).fill(null),
    left: new Array(GRID_SIZE).fill(null),
    right: new Array(GRID_SIZE).fill(null),
  };
  const canPlaceWall = (wallId, index) =>
    wallGrid[wallId] && index >= 0 && index < GRID_SIZE && wallGrid[wallId][index] === null;
  const occupyWall = (wallId, index, id) => { wallGrid[wallId][index] = id; };
  const freeWall = (w) => { if (w && wallGrid[w.wallId]) wallGrid[w.wallId][w.index] = null; };
  // --- Raycasting setup ------------------------------------------------------
  // A Raycaster shoots a ray FROM the camera THROUGH a point on the screen and
  // reports what 3D objects it hits. We aim it using the mouse position in
  // "Normalized Device Coordinates" (NDC): a -1..+1 box where (-1,-1) is the
  // canvas bottom-left and (+1,+1) the top-right — independent of pixel size.
  // We use the SAME ray two ways:
  //   - intersect the floor  -> which grid tile is under the cursor (placement)
  //   - intersect placed meshes -> which furniture is under the cursor (delete)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let activeItem = null; // catalog item selected for placement (or null)
  let activeOrientation = 0; // current rotation of the active item / ghost
  let activeColorMap = {}; // material-name -> 0xRRGGBB overrides for the next piece
  let ghost = null; // translucent preview mesh (rebuilt when activeItem changes)
  let hoverTile = null; // { row, col } origin under the mouse, or null if off-grid
  let hoverWall = null; // { wallId, index } under the mouse (for wall items)
  let instanceCounter = 0;
  const isWallItem = () => activeItem && activeItem.mount === "wall";
  // Input is gated by the game state machine: placement/rotate/delete only work
  // while playing (DESIGN). We gate the actual handlers here — not just by hiding
  // the catalog — so a stray click during START/REVEAL/RESULT does nothing.
  let inputEnabled = false;

  // Ghost materials: green ("valid") and red ("blocked").
  const ghostMatValid = new THREE.MeshBasicMaterial({
    color: 0x4caf50,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const ghostMatBlocked = new THREE.MeshBasicMaterial({
    color: 0xe53935,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  // Point the raycaster at wherever a pointer event happened (shared by the
  // floor-tile and placed-mesh lookups below).
  function aimRayAt(event) {
    const rect = domElement.getBoundingClientRect();
    // pixel -> NDC: x maps 0..w to -1..+1, y is flipped (screen y grows down).
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  // (a)+(b): cast the ray at the FLOOR and convert the hit point to a tile.
  // Returns { row, col } or null if the ray misses the floor / lands off-grid.
  function tileUnderPointer(event) {
    aimRayAt(event);
    const hits = raycaster.intersectObject(activeFloor);
    if (hits.length === 0) return null;
    // Convert the world hit into the active room's LOCAL space before tiling.
    const { row, col } = worldToTile(hits[0].point.x - roomOff.x, hits[0].point.z - roomOff.z);
    return isInBounds(row, col) ? { row, col } : null;
  }

  // Cast the ray at the WALLS and return the wall segment under the cursor.
  // Returns { wallId, index } or null. Used for window/door placement.
  function wallUnderPointer(event) {
    if (activeWalls.length === 0) return null;
    aimRayAt(event);
    const hits = raycaster.intersectObjects(activeWalls, false);
    if (hits.length === 0) return null;
    const wallId = hits[0].object.userData.wallId;
    const p = hits[0].point;
    // subtract the room offset so "along the wall" is in local space
    const along = wallId === "back" || wallId === "front" ? p.x - roomOff.x : p.z - roomOff.z;
    const index = Math.floor(along + HALF); // 0 .. GRID_SIZE-1
    return index >= 0 && index < GRID_SIZE ? { wallId, index } : null;
  }

  // (a): cast the ray at the PLACED MESHES and return the owning registry entry.
  // intersectObjects tests our list of furniture meshes; the first hit is the
  // closest one to the camera. Each mesh carries a back-reference to its record
  // in userData, so we resolve a click straight to the placed-item it belongs to.
  function placedUnderPointer(event) {
    if (placedItems.length === 0) return null;
    aimRayAt(event);
    const meshes = placedItems.map((p) => p.mesh);
    // recursive = true: holders are Groups now (a model is many child meshes), so
    // the ray must descend into them. We tag every descendant with userData.placed,
    // so whichever child is hit resolves back to its registry entry.
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    return hits[0].object.userData.placed || null;
  }

  // --- Ghost -----------------------------------------------------------------
  function buildGhost() {
    disposeGhost();
    if (!activeItem) return;
    ghost = makeGhostMesh(activeItem);
    ghost.visible = false; // hidden until the mouse is over the grid
    scene.add(ghost);
  }

  function makeGhostMesh(item) {
    // Wall items get a tall thin segment-shaped ghost; floor items a footprint box.
    const geo =
      item.mount === "wall"
        ? new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, 0.16)
        : new THREE.BoxGeometry(item.footprint.cols * TILE_SIZE, item.height, item.footprint.rows * TILE_SIZE);
    const mesh = new THREE.Mesh(geo, ghostMatValid);
    // The birdseye capture (capture.js) hides anything flagged here, so a ghost
    // preview can never leak into the judged screenshot. (It's normally already
    // disposed when input is disabled on leaving DESIGN, but this is belt-and-braces.)
    mesh.userData.excludeFromCapture = true;
    return mesh;
  }

  function disposeGhost() {
    if (!ghost) return;
    scene.remove(ghost);
    ghost.geometry.dispose();
    ghost = null;
  }

  // Position, rotate, and colour the ghost. Wall items follow the hovered wall
  // segment; floor items follow the hovered tile + orientation. Validity is
  // re-checked here so it updates on move (and, for floor items, on R).
  function updateGhost() {
    if (!ghost || !activeItem) {
      if (ghost) ghost.visible = false;
      return;
    }
    if (isWallItem()) {
      if (!hoverWall) { ghost.visible = false; return; }
      const t = wallSegmentTransform(hoverWall.wallId, hoverWall.index);
      ghost.position.set(t.x + roomOff.x, roomOff.y + WALL_HEIGHT / 2, t.z + roomOff.z);
      ghost.rotation.y = t.rotationY;
      ghost.material = canPlaceWall(hoverWall.wallId, hoverWall.index) ? ghostMatValid : ghostMatBlocked;
      ghost.visible = true;
      return;
    }
    if (!hoverTile) { ghost.visible = false; return; }
    const { row, col } = hoverTile;
    const center = footprintCenterWorld(activeItem, row, col, activeOrientation);
    ghost.position.set(center.x + roomOff.x, roomOff.y + activeItem.height / 2, center.z + roomOff.z);
    ghost.rotation.y = orientationToRadians(activeOrientation);
    // Flat items (rugs) lie under furniture, so they only need to be in-bounds —
    // they don't care about occupied tiles.
    const ok = activeItem.flat
      ? canPlaceFlat(activeItem, row, col, activeOrientation)
      : canPlace(activeItem, row, col, activeOrientation);
    ghost.material = ok ? ghostMatValid : ghostMatBlocked;
    ghost.visible = true;
  }

  // --- Pointer handlers ------------------------------------------------------
  function onPointerMove(event) {
    if (!inputEnabled) return; // gated to the DESIGN state
    if (!activeItem) return; // no active item -> no ghost, and clicks mean delete
    if (isWallItem()) hoverWall = wallUnderPointer(event);
    else hoverTile = tileUnderPointer(event);
    updateGhost();
  }

  // OrbitControls uses left-drag to rotate and right-drag to pan the camera. We
  // only want a genuine click to place/delete, not the end of a drag — so we
  // record where the pointer went down and skip the action if it moved much.
  let downX = 0;
  let downY = 0;
  function onPointerDown(event) {
    downX = event.clientX;
    downY = event.clientY;
  }
  function isDrag(event) {
    return Math.hypot(event.clientX - downX, event.clientY - downY) > 5;
  }

  // Left click: place if an item is active; otherwise try to delete what's under
  // the cursor. (Per Milestone 2, deselecting with Esc enables delete mode.)
  function onClick(event) {
    if (!inputEnabled) return; // gated to the DESIGN state
    if (isDrag(event)) return; // was a camera drag, not a click
    if (isWallItem()) {
      const seg = wallUnderPointer(event);
      if (seg) {
        const placed = placeWall(activeItem, seg.wallId, seg.index);
        if (!placed) play("invalid"); // that wall segment is taken
      }
    } else if (activeItem) {
      const tile = tileUnderPointer(event);
      if (tile) {
        const placed = place(activeItem, tile.row, tile.col, activeOrientation);
        if (!placed) play("invalid"); // clicked an occupied/overflowing tile
      }
    } else {
      const target = placedUnderPointer(event);
      if (target) removePlaced(target);
    }
  }

  // Optional: right-click always deletes (even with an item active). We suppress
  // the browser context menu, and skip if the right button was used to pan.
  function onContextMenu(event) {
    event.preventDefault();
    if (!inputEnabled) return; // gated to the DESIGN state
    if (isDrag(event)) return;
    const target = placedUnderPointer(event);
    if (target) removePlaced(target);
  }

  // --- Placement / rotation / deletion ---------------------------------------
  function place(item, row, col, orientation = 0) {
    const flat = !!item.flat;
    // Flat items only need to be in-bounds; normal items need free tiles.
    if (flat ? !canPlaceFlat(item, row, col, orientation) : !canPlace(item, row, col, orientation)) {
      return null;
    }

    const instanceId = ++instanceCounter;
    const tiles = flat ? [] : footprintTiles(item, row, col, orientation);
    if (!flat) occupy(item, row, col, instanceId, orientation); // flat items don't claim tiles

    // The holder's origin sits on the floor, centred on the footprint, so we just
    // place it at the footprint centre (y=0) and spin it by the orientation —
    // identical to the old box convention, but now it contains a real model.
    const mesh = makeItemHolder(item, models, activeColorMap);
    const center = footprintCenterWorld(item, row, col, orientation);
    // Flat items lift a hair off the floor so they don't z-fight and sit under furniture.
    mesh.position.set(center.x + roomOff.x, roomOff.y + (flat ? 0.02 : 0), center.z + roomOff.z);
    mesh.rotation.y = orientationToRadians(orientation);

    const entry = { instanceId, item, row, col, orientation, mesh, tiles, flat };
    // Two-way link: registry knows its mesh; every descendant knows its record so
    // a delete-raycast hitting any child mesh resolves back to this entry.
    mesh.traverse((obj) => {
      obj.userData.instanceId = instanceId;
      obj.userData.placed = entry;
    });
    scene.add(mesh);
    placedItems.push(entry);

    play("place"); // the "thunk"
    popIn(mesh); // tiny scale animation for tactile feel
    updateGhost(); // the tile we just filled is now occupied -> ghost may turn red
    return entry;
  }

  // Place a wall-mounted item (window/door) on a wall segment. Mirrors place() but
  // uses wall occupancy + transform instead of the floor grid.
  function placeWall(item, wallId, index) {
    if (!canPlaceWall(wallId, index)) return null;

    const instanceId = ++instanceCounter;
    occupyWall(wallId, index, instanceId);

    const mesh = makeItemHolder(item, models, activeColorMap);
    const t = wallSegmentTransform(wallId, index);
    mesh.position.set(t.x + roomOff.x, roomOff.y + (item.mountY || 0), t.z + roomOff.z);
    mesh.rotation.y = t.rotationY;

    const entry = { instanceId, item, mesh, wall: { wallId, index } };
    mesh.traverse((obj) => {
      obj.userData.instanceId = instanceId;
      obj.userData.placed = entry;
    });
    scene.add(mesh);
    placedItems.push(entry);

    play("place");
    popIn(mesh);
    updateGhost();
    return entry;
  }

  // Placement pop: scale the holder 0.9 -> 1 over ~120ms. Self-terminates if the
  // piece is removed mid-animation (parent becomes null), so it needs no external
  // cleanup. Driven by the existing render loop via requestAnimationFrame.
  function popIn(holder) {
    const DURATION = 120;
    const startTime = performance.now();
    holder.scale.setScalar(0.9);
    function step(now) {
      if (!holder.parent) return; // removed -> stop
      const t = Math.min(1, (now - startTime) / DURATION);
      holder.scale.setScalar(0.9 + 0.1 * t);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // Fallback: guarantee the resting scale even if rAF is throttled (background
    // tab) — the pop is cosmetic, but the piece must never be left under-scaled.
    setTimeout(() => {
      if (holder.parent) holder.scale.setScalar(1);
    }, DURATION + 40);
  }

  // Rotate the active (not-yet-placed) item by 90°, cycling 0->90->180->270->0.
  function rotateActiveItem() {
    if (!inputEnabled || !activeItem) return;
    activeOrientation = (activeOrientation + 90) % 360;
    play("rotate");
    updateGhost(); // re-snap + re-validate against the rotated footprint
  }

  // Delete a placed item: pull its mesh from the scene, free its tiles using the
  // EXACT list it was placed with, and drop it from the registry. freeTiles +
  // entry.tiles means we release precisely the tiles footprintTiles occupied.
  function removePlaced(entry) {
    play("delete");
    scene.remove(entry.mesh);
    // We deliberately do NOT dispose geometry — clones SHARE it with the template
    // (that's what makes cloning cheap); disposing would corrupt other clones.
    // We DO dispose this instance's OWNED materials (the per-piece tinted ones we
    // cloned for custom colours); shared template materials own nothing here.
    (entry.mesh.userData.ownedMaterials || []).forEach((m) => m.dispose());
    // Free occupancy: wall items release their wall segment; floor items their tiles.
    if (entry.wall) freeWall(entry.wall);
    else freeTiles(entry.tiles);
    const i = placedItems.indexOf(entry);
    if (i !== -1) placedItems.splice(i, 1);
    updateGhost(); // freeing tiles may make the ghost valid again
  }

  // --- Public API ------------------------------------------------------------
  function setActiveItem(item) {
    activeItem = item;
    activeOrientation = 0; // every fresh selection starts in default orientation
    buildGhost();
  }
  function clearActiveItem() {
    activeItem = null;
    activeOrientation = 0;
    hoverTile = null;
    hoverWall = null;
    disposeGhost();
  }

  // Set the per-part colour overrides for the NEXT placed piece: a map of
  // material name -> 0xRRGGBB (parts not listed stay original; {} = fully
  // original). Already-placed pieces keep their own colours.
  function setActiveColorMap(map) {
    activeColorMap = map || {};
  }

  // Enable/disable ALL placement interaction. The game's FSM calls this:
  // true on entering DESIGN, false on leaving it. Disabling also drops any
  // active item so the ghost can't linger on a non-play screen.
  function setInputEnabled(on) {
    inputEnabled = on;
    if (!on) clearActiveItem();
  }
  function isInputEnabled() {
    return inputEnabled;
  }

  // ---- Multi-room (Milestone 8) --------------------------------------------
  // Finished rooms' meshes stay in the scene (the house fills up); only the
  // ACTIVE room's pieces are in `placedItems` (editable/judged). committedItems
  // holds the locked meshes of completed rooms so a full restart can clear them.
  const committedItems = [];

  function resetGrids() {
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) grid[r][c] = null;
    for (const id of Object.keys(wallGrid)) wallGrid[id].fill(null);
  }

  // Point placement at a different room: which floor/walls to raycast and the
  // world offset to place at. Occupancy was already reset by the caller's commit/
  // clear, so we just retarget and drop any active selection.
  function setActiveRoom(shell) {
    activeFloor = shell.floor;
    activeWalls = shell.walls;
    roomOff = shell.offset;
    clearActiveItem();
  }

  // Finished room: keep its meshes on screen (lock them) and start fresh occupancy.
  function commitRoom() {
    committedItems.push(...placedItems);
    placedItems.length = 0;
    resetGrids();
  }

  // Retry the current room: remove only THIS room's pieces (committed neighbours stay).
  function clearActiveRoomEdits() {
    [...placedItems].forEach(removePlaced);
    resetGrids();
  }

  // Full reset (restart / new game): remove every room's pieces, committed too.
  function clearHouse() {
    [...placedItems].forEach(removePlaced);
    for (const e of committedItems) {
      scene.remove(e.mesh);
      (e.mesh.userData.ownedMaterials || []).forEach((m) => m.dispose());
    }
    committedItems.length = 0;
    resetGrids();
  }

  domElement.addEventListener("pointermove", onPointerMove);
  domElement.addEventListener("pointerdown", onPointerDown);
  domElement.addEventListener("click", onClick);
  domElement.addEventListener("contextmenu", onContextMenu);

  return {
    setActiveItem,
    clearActiveItem,
    setActiveColorMap, // per-part colour overrides for the next placed piece
    setInputEnabled, // gate all interaction to the DESIGN state
    isInputEnabled,
    setActiveRoom, // point placement at a room shell (Milestone 8)
    commitRoom, // lock the finished room, keep its meshes
    clearActiveRoomEdits, // remove only the current room's pieces (retry)
    clearHouse, // remove every room's pieces (restart)
    rotateActiveItem,
    place, // exposed for programmatic placement / tests
    placeWall, // exposed for tests
    removePlaced, // exposed for programmatic deletion / tests
    placedItems, // registry (also exported standalone above)
  };
}
