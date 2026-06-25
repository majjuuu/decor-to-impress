// =============================================================================
// avatarController.js — places, moves, animates and "is" the player's avatar
// =============================================================================
//
// Owns the avatar AND the camera. Two views:
//   - "fp"  (non-explore): FIRST-PERSON. Camera sits at the avatar's eyes; the
//           body is hidden and a hands viewmodel is shown (Minecraft-style). You
//           drag to look, WASD to walk, Space to jump. Used while designing — you
//           look down at the floor to place furniture.
//   - "explore": THIRD-PERSON follow camera; the whole body is shown and you roam
//           the neighborhood and walk into the show houses.
// Movement is relative to where you're looking (yaw). Collision stops you walking
// through furniture (in a room) and through house walls (out exploring). Gravity +
// Space gives a jump.

import * as THREE from "three";
import { buildAvatar, buildHands } from "./avatar.js";
import { ROOM_SIZE } from "./grid.js";

const ROOM_SPEED = 3.0;
const EXPLORE_SPEED = 7.0;
const LOOK_SENS = 0.0028;
const PITCH_MIN = -1.3, PITCH_MAX = 1.15;
const GRAVITY = 16;
const JUMP_V = 5.2;
const RADIUS = 0.34; // avatar collision radius (xz)

export function createAvatarController({ scene, camera, domElement, getDesignActive, getDesignColliders, getExploreColliders }) {
  let avatar = null;
  let hands = null;
  let config = null;
  let mode = "hidden"; // hidden | fp | explore
  let roomOffset = { x: 0, y: 0, z: 0 };
  let yaw = 0, pitch = -0.15;
  let walkPhase = 0, swing = 0, bob = 0;
  let vy = 0, grounded = true;

  // ---- input: keys + drag-to-look ----
  const keys = new Set();
  const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if (mode === "hidden") return;
    if (k === " ") { tryJump(); e.preventDefault(); return; }
    if (MOVE_KEYS.has(k)) keys.add(k);
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let dragging = false, lastX = 0, lastY = 0;
  const onPointerDown = (e) => { if (e.button === 0 && mode !== "hidden") { dragging = true; lastX = e.clientX; lastY = e.clientY; } };
  const onPointerMove = (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * LOOK_SENS;
    pitch -= (e.clientY - lastY) * LOOK_SENS;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
    lastX = e.clientX; lastY = e.clientY;
  };
  const onPointerUp = () => { dragging = false; };
  domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  function setConfig(cfg) {
    config = cfg;
    if (avatar) { scene.remove(avatar.group); disposeTree(avatar.group); }
    if (hands) { camera.remove(hands); disposeTree(hands); }
    avatar = buildAvatar(cfg);
    scene.add(avatar.group);
    hands = buildHands(cfg);
    camera.add(hands);
    if (!camera.parent) scene.add(camera); // so the hands (children of camera) render
    applyModeVisibility();
  }

  function applyModeVisibility() {
    if (!avatar) return;
    avatar.group.visible = mode === "explore"; // body shown only in 3rd person
    if (hands) hands.visible = mode === "fp";
  }

  // Stand in the active room (first-person). Called by activateRoom.
  function standInRoom(offset) {
    roomOffset = offset;
    if (mode === "explore" || !avatar) return;
    mode = "fp";
    avatar.group.position.set(offset.x, offset.y, offset.z + ROOM_SIZE * 0.32);
    yaw = Math.PI; pitch = -0.2; // face into the room (toward -Z / the back wall)
    vy = 0; grounded = true;
    applyModeVisibility();
    positionCamera();
  }

  function tryJump() {
    if (!avatar || mode === "hidden") return;
    if (mode === "fp" && !getDesignActive()) return;
    if (grounded) { vy = JUMP_V; grounded = false; }
  }

  function inputDir() {
    let f = 0, s = 0;
    if (keys.has("w") || keys.has("arrowup")) f += 1;
    if (keys.has("s") || keys.has("arrowdown")) f -= 1;
    if (keys.has("d") || keys.has("arrowright")) s += 1;
    if (keys.has("a") || keys.has("arrowleft")) s -= 1;
    return { f, s, moving: f !== 0 || s !== 0 };
  }

  function update(dt) {
    if (!avatar || mode === "hidden") return;
    const p = avatar.group.position;
    const canMove = mode === "explore" || getDesignActive();
    const inp = canMove ? inputDir() : { f: 0, s: 0, moving: false };

    if (inp.moving) {
      // move relative to look direction (yaw): forward = (sin,cos), right = (cos,-sin)
      let dx = Math.sin(yaw) * inp.f + Math.cos(yaw) * inp.s;
      let dz = Math.cos(yaw) * inp.f - Math.sin(yaw) * inp.s;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const speed = mode === "explore" ? EXPLORE_SPEED : ROOM_SPEED;
      p.x += dx * speed * dt;
      p.z += dz * speed * dt;
      avatar.group.rotation.y = Math.atan2(dx, dz); // face travel direction
      walkPhase += dt * 9;
    }

    // ---- gravity / jump ----
    const groundY = mode === "fp" ? roomOffset.y : 0;
    vy -= GRAVITY * dt;
    p.y += vy * dt;
    if (p.y <= groundY) { p.y = groundY; vy = 0; grounded = true; }

    // ---- collision + bounds ----
    if (mode === "fp") {
      const cols = getDesignColliders ? getDesignColliders() : [];
      resolveColliders(p, cols);
      const lim = ROOM_SIZE / 2 - RADIUS - 0.15; // stay inside the room footprint
      p.x = clamp(p.x, roomOffset.x - lim, roomOffset.x + lim);
      p.z = clamp(p.z, roomOffset.z - lim, roomOffset.z + lim);
    } else {
      resolveColliders(p, getExploreColliders ? getExploreColliders() : []);
    }

    // ---- limb / view animation ----
    const targetSwing = inp.moving ? Math.sin(walkPhase) * 0.5 : 0;
    swing += (targetSwing - swing) * 0.25;
    if (mode === "explore") {
      const [legL, legR] = avatar.parts.legs;
      const [armL, armR] = avatar.parts.arms;
      legL.rotation.x = swing; legR.rotation.x = -swing;
      armL.rotation.x = -swing; armR.rotation.x = swing;
    }
    // gentle hand bob in first person
    const targetBob = inp.moving ? Math.sin(walkPhase * 2) * 0.5 : 0;
    bob += (targetBob - bob) * 0.2;
    if (hands && mode === "fp") hands.position.y = bob * 0.02;

    positionCamera();
  }

  function positionCamera() {
    if (!avatar) return;
    const p = avatar.group.position;
    if (mode === "fp") {
      const eye = p.y + avatar.eyeY;
      camera.position.set(p.x, eye, p.z);
      const cp = Math.cos(pitch);
      camera.lookAt(p.x + Math.sin(yaw) * cp, eye + Math.sin(pitch), p.z + Math.cos(yaw) * cp);
    } else {
      const dist = 7.5, h = clamp(4.2 - pitch * 3, 1.6, 8);
      camera.position.set(p.x - Math.sin(yaw) * dist, p.y + h, p.z - Math.cos(yaw) * dist);
      camera.lookAt(p.x, p.y + 1.2, p.z);
    }
  }

  function enterExplore() {
    if (!avatar) return;
    mode = "explore";
    avatar.group.position.set(roomOffset.x, 0, 10); // out on the front lawn
    yaw = 0; pitch = 0; vy = 0; grounded = true;
    applyModeVisibility();
    positionCamera();
  }

  function exitExplore() {
    if (!avatar) return;
    mode = "fp";
    standInRoom(roomOffset);
  }

  function setHidden() { mode = "hidden"; applyModeVisibility(); }

  return {
    setConfig,
    standInRoom,
    enterExplore,
    exitExplore,
    setHidden,
    update,
    isExploring: () => mode === "explore",
    hasAvatar: () => !!avatar,
    _debug: () => ({ mode, keys: [...keys], yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), grounded, pos: avatar ? avatar.group.position.toArray().map((n) => +n.toFixed(2)) : null }),
  };
}

const BODY_H = 1.7; // avatar height, for vertical collision overlap

// Resolve circle-vs-AABB in the XZ plane; pushes `p` out of any box it overlaps.
// Only collides when the avatar's vertical span overlaps the box, so you can jump
// OVER low furniture and never snag on the walls of the floor ABOVE you.
function resolveColliders(p, boxes) {
  for (const b of boxes) {
    if (p.y >= b.maxY - 0.05) continue;            // feet above the box -> jumped over / on top
    if (p.y + BODY_H <= (b.minY || 0)) continue;   // box is entirely above the avatar (upper floor)
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-7) {
      const d = Math.sqrt(d2), push = RADIUS - d;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
    } else {
      // centre inside the box: pop out the nearest edge
      const l = p.x - b.minX, r = b.maxX - p.x, bk = p.z - b.minZ, fr = b.maxZ - p.z;
      const mn = Math.min(l, r, bk, fr);
      if (mn === l) p.x = b.minX - RADIUS; else if (mn === r) p.x = b.maxX + RADIUS;
      else if (mn === bk) p.z = b.minZ - RADIUS; else p.z = b.maxZ + RADIUS;
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}
