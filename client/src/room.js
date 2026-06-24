// =============================================================================
// room.js — builds the HOUSE: one open-front "dollhouse" shell per room
// =============================================================================
//
// MILESTONE 8 (connected house): instead of a single room at the origin, we build
// a shell for every room, each at its own world position. Rooms line up in a row
// per floor and stack upward between floors, so the whole thing reads as a house
// you can see into (we omit each room's FRONT wall — the dollhouse cross-section).
//
// Each shell is independent geometry translated by an offset; the game makes ONE
// of them "active" at a time (camera + grid + placement target it) while finished
// rooms keep their furniture and stay visible next door.

import * as THREE from "three";
import { GRID_SIZE, ROOM_SIZE } from "./grid.js";

export const WALL_HEIGHT = 3; // world units tall (exported so wall-mounted items match)
const WALL_THICKNESS = 0.15;

// Layout: rooms sit ROOM_SPACING apart along X (a small gap avoids z-fighting
// between neighbours' walls), and each floor is FLOOR_HEIGHT higher in Y.
export const ROOM_SPACING = ROOM_SIZE + 0.4;
export const FLOOR_HEIGHT = WALL_HEIGHT + 0.8;
export const ROOMS_PER_FLOOR = 5;

// World offset for room `index`: slot along the floor in X, floor number in Y.
export function roomOffset(index, perFloor = ROOMS_PER_FLOOR) {
  const floor = Math.floor(index / perFloor);
  const slot = index % perFloor;
  return { x: slot * ROOM_SPACING, y: floor * FLOOR_HEIGHT, z: 0 };
}

const floorMat = new THREE.MeshStandardMaterial({ color: 0xb9a98f, roughness: 0.9 });
export const DEFAULT_WALL_COLOR = 0xe8e4dc; // soft off-white

// Build one room shell at `offset`. Returns the pieces the game toggles/targets.
// We OMIT the front (+Z) wall so the camera (in front) can see the interior.
export function buildRoomShell(scene, offset) {
  const half = ROOM_SIZE / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(offset.x, offset.y, offset.z);
  floor.receiveShadow = true;
  scene.add(floor);

  // Each room gets its OWN wall material so its walls can be recoloured
  // independently (and that colour persists with the finished room).
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: DEFAULT_WALL_COLOR,
    roughness: 1.0,
    side: THREE.DoubleSide,
  });

  function makeWall(width, depth, x, z, wallId) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_HEIGHT, depth), wallMaterial);
    wall.position.set(offset.x + x, offset.y + WALL_HEIGHT / 2, offset.z + z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.userData.wallId = wallId;
    scene.add(wall);
    return wall;
  }

  // back (-Z), left (-X), right (+X). No front wall (open dollhouse face).
  const walls = [
    makeWall(ROOM_SIZE, WALL_THICKNESS, 0, -half, "back"),
    makeWall(WALL_THICKNESS, ROOM_SIZE, -half, 0, "left"),
    makeWall(WALL_THICKNESS, ROOM_SIZE, half, 0, "right"),
  ];

  const grid = new THREE.GridHelper(ROOM_SIZE, GRID_SIZE, 0x7a7f8a, 0x4a4f59);
  grid.position.set(offset.x, offset.y + 0.01, offset.z);
  grid.visible = false; // only the active room shows its grid
  grid.userData.isGrid = true; // capture hides these for the clean birdseye
  scene.add(grid);

  return { floor, walls, grid, offset, wallMaterial };
}

// Build a shell for each of `count` rooms and return them in index order.
export function buildHouse(scene, count) {
  const shells = [];
  for (let i = 0; i < count; i++) shells.push(buildRoomShell(scene, roomOffset(i)));
  return shells;
}

// A pitched (gable) roof over the whole top floor, so the structure reads as a
// house. Tagged excludeFromCapture so it never blocks/appears in the birdseye.
export function buildRoof(scene, count) {
  const perFloor = ROOMS_PER_FLOOR;
  const floors = Math.ceil(count / perFloor);
  const OV = 0.7; // eaves overhang
  const RISE = 2.6; // ridge height above the eaves
  const eaves = (floors - 1) * FLOOR_HEIGHT + WALL_HEIGHT;
  const ridge = eaves + RISE;
  const xMin = -ROOM_SIZE / 2 - OV;
  const xMax = (perFloor - 1) * ROOM_SPACING + ROOM_SIZE / 2 + OV;
  const zH = ROOM_SIZE / 2 + OV;

  // Cross-section A(-z,eave) B(0,ridge) C(+z,eave), extruded along X (x0..x1).
  const A0 = [xMin, eaves, -zH], B0 = [xMin, ridge, 0], C0 = [xMin, eaves, zH];
  const A1 = [xMax, eaves, -zH], B1 = [xMax, ridge, 0], C1 = [xMax, eaves, zH];
  const tri = (a, b, c) => [...a, ...b, ...c];
  const quad = (a, b, c, d) => [...tri(a, b, c), ...tri(a, c, d)];
  const pos = new Float32Array([
    ...quad(A0, A1, B1, B0), // -z slope
    ...quad(B0, B1, C1, C0), // +z slope
    ...tri(A0, B0, C0), // gable end (x min)
    ...tri(C1, B1, A1), // gable end (x max)
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x9c4f3f, roughness: 0.95, side: THREE.DoubleSide })
  );
  roof.castShadow = true;
  roof.userData.excludeFromCapture = true;
  scene.add(roof);
  return roof;
}

// Simple low-poly garden: trees + bushes scattered behind and beside the house.
// All tagged excludeFromCapture so the birdseye stays a clean room view.
export function buildGarden(scene) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 1 });
  const leafA = new THREE.MeshStandardMaterial({ color: 0x4f8f43, roughness: 1 });
  const leafB = new THREE.MeshStandardMaterial({ color: 0x5fa64f, roughness: 1 });

  const tree = (x, z, s = 1) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.18 * s, 1.3 * s, 7), trunkMat);
    trunk.position.y = 0.65 * s; trunk.castShadow = true; t.add(trunk);
    const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 10, 8), leafA);
    f1.position.y = 1.55 * s; f1.castShadow = true; t.add(f1);
    const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.6 * s, 10, 8), leafB);
    f2.position.set(0.4 * s, 1.95 * s, 0.25 * s); f2.castShadow = true; t.add(f2);
    t.position.set(x, 0, z); group.add(t);
  };
  const bush = (x, z, s = 1) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45 * s, 10, 8), leafA);
    b.position.set(x, 0.32 * s, z); b.scale.y = 0.8; b.castShadow = true; group.add(b);
  };

  // a back row across (and beyond) the house, plus clusters at the ends
  for (const x of [-8, 2, 13, 23, 34, 44, 53]) tree(x, -13 - Math.random() * 5, 0.9 + Math.random() * 0.5);
  tree(-10, -2, 1.1); tree(-11, 5, 0.9); tree(51, -3, 1.1); tree(52, 6, 1.0);
  for (const x of [-9, 8, 20, 32, 49]) bush(x, -8 - Math.random() * 2, 1 + Math.random() * 0.4);

  group.traverse((o) => { o.userData.excludeFromCapture = true; });
  scene.add(group);
  return group;
}
