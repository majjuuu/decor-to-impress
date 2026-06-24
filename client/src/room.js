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

// =============================================================================
// Neighborhood: purely-cosmetic background so the world reads as a NEIGHBORHOOD
// rather than one house in an empty field — rows of little houses across a
// street, sidewalks + lane markings, street lamps, and a few drifting clouds.
// Everything is tagged excludeFromCapture (never leaks into the birdseye the
// judge sees) and castShadow:false (it sits outside the room's shadow box, so
// drawing it into the shadow map would only cost perf for nothing).
// =============================================================================
export function buildNeighborhood(scene) {
  const group = new THREE.Group();

  // Cheerful, kid-friendly palettes (the game's whole vibe is bright + playful).
  const WALLS = [0xffd9a0, 0xffb3c1, 0xb5e2ff, 0xc8f0c0, 0xe7d4ff, 0xfff0a8, 0xffc6d9, 0xbfe0c8];
  const ROOFS = [0x9c4f3f, 0x6a8caf, 0x7a9e58, 0xb0617f, 0x5f7d8c, 0xc97b4a, 0x8a6dab];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const jit = (n) => (Math.random() - 0.5) * n;

  // Shared materials + a tiny box helper (one geometry per call, but materials are
  // reused across all houses so we don't churn the GPU with hundreds of dupes).
  const box = (w, hh, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
  const foundationMat = new THREE.MeshStandardMaterial({ color: 0x8d8278, roughness: 1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.9 }); // white trim
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.25, metalness: 0.1, emissive: 0x213040, emissiveIntensity: 0.15 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xd9b54a, roughness: 0.4, metalness: 0.6 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x9c5a47, roughness: 1 }); // chimney
  const capMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 });
  const stoopMat = new THREE.MeshStandardMaterial({ color: 0xb8b2a8, roughness: 1 });
  const shutterMats = [0x6a8caf, 0x7a9e58, 0xb0617f, 0x5f7d8c, 0xc97b4a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const doorMats = [0x6d4c33, 0x9c4f3f, 0x3f5d7a, 0x4a7a52, 0x7a3f5d].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));

  // A real gable roof: two sloped planes meeting at a ridge, with eaves that
  // overhang the walls (the overhang + the sloped faces are what make it read as
  // 3D rather than a flat lid). The two triangular gable ENDS are the wall colour,
  // so the wall appears to continue up into the peak. Origin sits at the eave line.
  function gableRoof(W, D, ov, rise, slopeMat, gableMat) {
    const g = new THREE.Group();
    const xH = W / 2 + ov, zH = D / 2 + ov;
    const v = (x, y, z) => [x, y, z];
    const tri = (a, b, c) => [...a, ...b, ...c];
    const quad = (a, b, c, d) => [...tri(a, b, c), ...tri(a, c, d)];
    const A0 = v(-xH, 0, -zH), B0 = v(-xH, rise, 0), C0 = v(-xH, 0, zH);
    const A1 = v(xH, 0, -zH), B1 = v(xH, rise, 0), C1 = v(xH, 0, zH);
    const slopes = new THREE.BufferGeometry();
    slopes.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      ...quad(A0, A1, B1, B0), // -z slope
      ...quad(B0, B1, C1, C0), // +z slope
    ]), 3));
    slopes.computeVertexNormals();
    g.add(new THREE.Mesh(slopes, slopeMat));
    // gable-end triangles at the wall plane (no overhang), filling wall up to ridge
    const wxH = W / 2, wzH = D / 2;
    for (const sx of [-1, 1]) {
      const t = new THREE.BufferGeometry();
      t.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
        ...v(sx * wxH, 0, -wzH), ...v(sx * wxH, 0, wzH), ...v(sx * wxH, rise, 0),
      ]), 3));
      t.computeVertexNormals();
      g.add(new THREE.Mesh(t, gableMat));
    }
    return g;
  }

  // A framed window built on the +Z plane (origin at its centre): a recessed glass
  // pane, a four-bar white frame that stands proud of the wall, a cross mullion, a
  // sill, and optional shutters. Rotate the returned group to mount it on any wall.
  function makeWindow(s, withShutters) {
    const g = new THREE.Group();
    const w = 1.3 * s, hh = 1.5 * s, t = 0.12 * s, fr = 0.12 * s;
    const glass = box(w - fr, hh - fr, 0.05 * s, glassMat); glass.position.z = -0.02 * s; g.add(glass);
    const top = box(w + fr, fr, t, frameMat); top.position.set(0, hh / 2, 0.03 * s); g.add(top);
    const bot = box(w + fr, fr, t, frameMat); bot.position.set(0, -hh / 2, 0.03 * s); g.add(bot);
    const lft = box(fr, hh + fr, t, frameMat); lft.position.set(-w / 2, 0, 0.03 * s); g.add(lft);
    const rgt = box(fr, hh + fr, t, frameMat); rgt.position.set(w / 2, 0, 0.03 * s); g.add(rgt);
    const mv = box(0.05 * s, hh - fr, 0.05 * s, frameMat); mv.position.z = 0.02 * s; g.add(mv);
    const mh = box(w - fr, 0.05 * s, 0.05 * s, frameMat); mh.position.z = 0.02 * s; g.add(mh);
    const sill = box(w + 0.3 * s, 0.1 * s, 0.22 * s, frameMat); sill.position.set(0, -hh / 2 - 0.05 * s, 0.06 * s); g.add(sill);
    if (withShutters) {
      const m = shutterMats[Math.floor(Math.random() * shutterMats.length)];
      for (const sx of [-1, 1]) {
        const sh = box(0.28 * s, hh + fr, 0.06 * s, m);
        sh.position.set(sx * (w / 2 + 0.22 * s), 0, 0.02 * s); g.add(sh);
      }
    }
    return g;
  }

  // A panelled door on the +Z plane: slab + white frame surround + brass knob.
  function makeDoor(s) {
    const g = new THREE.Group();
    const w = 1.1 * s, hh = 2.0 * s, fr = 0.13 * s;
    const slab = box(w, hh, 0.1 * s, doorMats[Math.floor(Math.random() * doorMats.length)]); g.add(slab);
    const top = box(w + 2 * fr, fr, 0.16 * s, frameMat); top.position.set(0, hh / 2 + fr / 2, 0.02 * s); g.add(top);
    const lft = box(fr, hh + fr, 0.16 * s, frameMat); lft.position.set(-w / 2 - fr / 2, fr / 2, 0.02 * s); g.add(lft);
    const rgt = box(fr, hh + fr, 0.16 * s, frameMat); rgt.position.set(w / 2 + fr / 2, fr / 2, 0.02 * s); g.add(rgt);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 8, 6), knobMat);
    knob.position.set(w / 2 - 0.18 * s, 0, 0.08 * s); g.add(knob);
    return g;
  }

  // One little house: foundation + (sometimes two-storey) body + gable roof +
  // chimney + framed door/windows + shutters. Built facing +Z, then rotated.
  function house(x, z, rotY, s) {
    const h = new THREE.Group();
    const stories = Math.random() < 0.3 ? 2 : 1;
    const W = 6 * s, D = 5 * s, storyH = 3.1 * s, H = storyH * stories;
    const wallColor = pick(WALLS);
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1 });
    const roofMat = new THREE.MeshStandardMaterial({ color: pick(ROOFS), roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const gableMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 1, side: THREE.DoubleSide });

    const plinthH = 0.4 * s;
    const plinth = box(W + 0.25 * s, plinthH, D + 0.25 * s, foundationMat); plinth.position.y = plinthH / 2; h.add(plinth);
    const body = box(W, H, D, wallMat); body.position.y = plinthH + H / 2; h.add(body);
    const topY = plinthH + H;

    const roof = gableRoof(W, D, 0.45 * s, 1.9 * s, roofMat, gableMat); roof.position.y = topY; h.add(roof);

    const chim = box(0.7 * s, 1.7 * s, 0.7 * s, brickMat); chim.position.set(W * 0.28, topY + 0.85 * s, -D * 0.18); h.add(chim);
    const cap = box(0.88 * s, 0.16 * s, 0.88 * s, capMat); cap.position.set(W * 0.28, topY + 1.7 * s, -D * 0.18); h.add(cap);

    // front door (ground floor, left) + a concrete stoop
    const door = makeDoor(s); door.position.set(-W * 0.22, plinthH + 1.0 * s, D / 2 + 0.05 * s); h.add(door);
    const stoop = box(1.8 * s, 0.18 * s, 0.9 * s, stoopMat); stoop.position.set(-W * 0.22, plinthH + 0.09 * s, D / 2 + 0.45 * s); h.add(stoop);

    // windows per storey: front (shuttered) + one on each side wall
    const winY = (f) => plinthH + storyH * f + storyH * 0.55;
    for (let f = 0; f < stories; f++) {
      const xs = f === 0 ? [W * 0.22] : [-W * 0.24, W * 0.24]; // ground floor: door takes the left
      for (const wx of xs) { const win = makeWindow(s, true); win.position.set(wx, winY(f), D / 2 + 0.04 * s); h.add(win); }
      const left = makeWindow(s, false); left.rotation.y = -Math.PI / 2; left.position.set(-W / 2 - 0.04 * s, winY(f), 0); h.add(left);
      const right = makeWindow(s, false); right.rotation.y = Math.PI / 2; right.position.set(W / 2 + 0.04 * s, winY(f), 0); h.add(right);
    }

    h.position.set(x, 0, z); h.rotation.y = rotY; group.add(h);
  }

  // The play house occupies x ≈ -5..47, z ≈ -5..5 and is viewed from the +Z front.
  // Back row (far -Z), fronts turned toward the player so we see their faces.
  for (const x of [-14, -3, 8, 19, 30, 41, 52, 63]) house(x + jit(3), -27 + jit(4), 0, 1 + Math.random() * 0.4);
  // Front row across the street (far +Z), fronts turned back toward the street.
  for (const x of [-12, 1, 14, 27, 40, 53, 66]) house(x + jit(3), 32 + jit(4), Math.PI, 1 + Math.random() * 0.4);
  // Side clusters (turned to face inward) close the neighborhood off at the ends.
  for (const z of [-12, 2, 16]) house(-22 + jit(2), z + jit(3), Math.PI / 2, 1 + Math.random() * 0.3);
  for (const z of [-12, 2, 16]) house(64 + jit(2), z + jit(3), -Math.PI / 2, 1 + Math.random() * 0.3);

  // ---- Street + sidewalks (between the play house and the front row) ----------
  const STREET_Z = 19, X0 = -28, X1 = 78, ROAD_W = 7, WALK_W = 2.4;
  const slab = (w, d, x, z, color, y = 0.02) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); group.add(m); return m;
  };
  const len = X1 - X0, cx = (X0 + X1) / 2;
  slab(len, ROAD_W, cx, STREET_Z, 0x4a4a52); // asphalt
  slab(len, WALK_W, cx, STREET_Z - ROAD_W / 2 - WALK_W / 2, 0xbfb8ad); // near sidewalk
  slab(len, WALK_W, cx, STREET_Z + ROAD_W / 2 + WALK_W / 2, 0xbfb8ad); // far sidewalk
  // Dashed centre line.
  for (let x = X0 + 2; x < X1; x += 5) slab(2.2, 0.28, x, STREET_Z, 0xf2c14e, 0.03);

  // ---- Street lamps along the near sidewalk ----------------------------------
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x37343c, roughness: 0.8, metalness: 0.3 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd86b, emissiveIntensity: 0.7 });
  const lampZ = STREET_Z - ROAD_W / 2 - WALK_W;
  for (let x = X0 + 6; x < X1; x += 13) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4.2, 8), poleMat);
    pole.position.y = 2.1; lamp.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.12), poleMat);
    arm.position.set(0.4, 4.1, 0); lamp.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bulbMat);
    bulb.position.set(0.8, 4.0, 0); lamp.add(bulb);
    lamp.position.set(x, 0, lampZ); group.add(lamp);
  }

  // ---- Clouds: flattened white blobs drifting high above the neighborhood -----
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xdfe9f5, emissiveIntensity: 0.3 });
  const cloud = (x, y, z, s) => {
    const c = new THREE.Group();
    for (const [dx, dy, dz, r] of [[0, 0, 0, 1], [1.1, -0.1, 0.2, 0.75], [-1.0, -0.15, -0.1, 0.7], [0.4, 0.25, -0.2, 0.6]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r * s, 10, 8), cloudMat);
      puff.position.set(dx * s, dy * s, dz * s); c.add(puff);
    }
    c.position.set(x, y, z); group.add(c);
  };
  for (const [x, y, z, s] of [[-10, 34, -40, 3], [25, 40, -55, 4], [55, 36, -35, 3.2], [10, 44, 60, 3.6], [60, 38, 50, 3]]) {
    cloud(x, y, z, s);
  }

  // The neighborhood is static and cosmetic: no shadows, never judged, and never
  // moves — so bake each transform once and stop recomputing matrices per frame.
  group.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
    o.userData.excludeFromCapture = true;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  scene.add(group);
  return group;
}
