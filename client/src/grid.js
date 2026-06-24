// =============================================================================
// grid.js — the room's floor grid and occupancy data structure
// =============================================================================
//
// The whole placement system (Milestone 2) is built on a simple idea: the floor
// is divided into square tiles, and we keep a 2D array that records which tiles
// are occupied. Collision detection then becomes "is this tile already taken?"
// instead of real 3D geometry math — much simpler and more robust.
//
// We centre the room on the world origin (0, 0, 0). With a 10x10 grid of 1-unit
// tiles, the floor spans from -5 to +5 on both the X and Z axes. (In Three.js,
// X is left/right, Y is up, Z is toward/away from the camera — the floor lives
// on the X/Z plane and "up" is Y.)

export const GRID_SIZE = 10; // tiles per side -> a 10 x 10 grid
export const TILE_SIZE = 1; // world units per tile
export const ROOM_SIZE = GRID_SIZE * TILE_SIZE; // 10 world units across

// The occupancy array: grid[row][col].
//   null  -> empty tile
//   <id>  -> id of the furniture item occupying this tile (filled in M2)
// Array.from(...) builds GRID_SIZE rows, each a fresh array of GRID_SIZE nulls.
// (We avoid Array(n).fill([]) because that would share ONE row array.)
export const grid = Array.from({ length: GRID_SIZE }, () =>
  Array.from({ length: GRID_SIZE }, () => null)
);

// ---- Coordinate helpers (used heavily in Milestone 2) -----------------------
// These convert between "grid space" (row/col integers) and "world space"
// (Three.js X/Z floats), keeping that conversion in exactly one place.

// Given a row/col, return the world-space centre of that tile.
// Row maps to Z, column maps to X. We shift by half the room and half a tile so
// tile (0,0) sits in a corner and each returned point is the tile's centre.
export function tileToWorld(row, col) {
  const x = col * TILE_SIZE - ROOM_SIZE / 2 + TILE_SIZE / 2;
  const z = row * TILE_SIZE - ROOM_SIZE / 2 + TILE_SIZE / 2;
  return { x, z };
}

// Given a world-space point (e.g. where the mouse ray hit the floor), return the
// row/col of the tile it falls in. The inverse of tileToWorld().
export function worldToTile(x, z) {
  const col = Math.floor((x + ROOM_SIZE / 2) / TILE_SIZE);
  const row = Math.floor((z + ROOM_SIZE / 2) / TILE_SIZE);
  return { row, col };
}

// True if a row/col is inside the grid bounds (handy guard for M2).
export function isInBounds(row, col) {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}
