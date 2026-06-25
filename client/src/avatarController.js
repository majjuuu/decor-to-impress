// =============================================================================
// avatarController.js — places, moves, animates and "is" the player's avatar
// =============================================================================
//
// Owns the avatar AND the camera. The view is FIRST-PERSON by default (camera at
// the eyes, body hidden, hands viewmodel shown); the "Explore" button toggles a
// THIRD-PERSON follow camera so you can see your character. Either way you can
// roam freely — out of your room's open front, across the neighborhood, into the
// show houses. One special rule: whenever you're INSIDE a house, the view forces
// back to first-person ("avatar's POV inside the house"), even if you'd switched
// to third-person outside.
//
// Movement is relative to where you're looking (yaw). Collision (circle-vs-AABB)
// stops you walking through walls and furniture; Space + gravity gives a jump.

import * as THREE from "three";
import { buildAvatar, buildHands } from "./avatar.js";
import { ROOM_SIZE } from "./grid.js";

const SPEED = 5.5;          // walk speed (units/sec)
const LOOK_SENS = 0.0028;
const PITCH_MIN = -1.3, PITCH_MAX = 1.15;
const GRAVITY = 16;
const JUMP_V = 5.2;
const RADIUS = 0.34;        // avatar collision radius (xz)
const BODY_H = 1.7;

export function createAvatarController({ scene, camera, domElement, getDesignActive, getColliders, getHouseRegions }) {
  let avatar = null, hands = null;
  let active = false;        // becomes true once the avatar is in the world
  let userPOV = "fp";        // "fp" | "third"  (what the Explore button chose)
  let roomOffset = { x: 0, y: 0, z: 0 };
  let yaw = 0, pitch = -0.15;
  let walkPhase = 0, swing = 0, bob = 0;
  let vy = 0, grounded = true;

  // ---- input: keys + drag-to-look ----
  const keys = new Set();
  const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
  const onKeyDown = (e) => {
    if (!active) return;
    const k = e.key.toLowerCase();
    if (k === " ") { tryJump(); e.preventDefault(); return; }
    if (MOVE_KEYS.has(k)) keys.add(k);
  };
  const onKeyUp = (e) => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let dragging = false, lastX = 0, lastY = 0;
  const onPointerDown = (e) => { if (e.button === 0 && active) { dragging = true; lastX = e.clientX; lastY = e.clientY; } };
  const onPointerMove = (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * LOOK_SENS;
    pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch - (e.clientY - lastY) * LOOK_SENS));
    lastX = e.clientX; lastY = e.clientY;
  };
  const onPointerUp = () => { dragging = false; };
  domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  function setConfig(cfg) {
    if (avatar) { scene.remove(avatar.group); disposeTree(avatar.group); }
    if (hands) { camera.remove(hands); disposeTree(hands); }
    avatar = buildAvatar(cfg);
    scene.add(avatar.group);
    hands = buildHands(cfg);
    camera.add(hands);
    if (!camera.parent) scene.add(camera); // so the hands (children of camera) render
  }

  // Is the avatar standing inside any house (a player room or a show house)?
  function insideHouse(p) {
    const regions = getHouseRegions ? getHouseRegions() : [];
    for (const r of regions) {
      if (p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ && p.y > r.minY && p.y < r.maxY) return true;
    }
    return false;
  }
  // First-person is forced inside houses; otherwise honour the Explore toggle.
  function effectiveFP() { return avatar ? (userPOV === "fp" || insideHouse(avatar.group.position)) : true; }
  function withinActiveRoom(p) {
    const h = ROOM_SIZE / 2;
    return p.x > roomOffset.x - h && p.x < roomOffset.x + h && p.z > roomOffset.z - h && p.z < roomOffset.z + h;
  }

  // Stand in the active room (first-person), facing into it. Called on room change.
  function standInRoom(offset) {
    roomOffset = offset;
    active = true;
    userPOV = "fp"; // each new room starts in first person
    avatar.group.position.set(offset.x, offset.y, offset.z + ROOM_SIZE * 0.32);
    yaw = Math.PI; pitch = -0.2; vy = 0; grounded = true;
    refreshVisibility();
    positionCamera();
  }

  function refreshVisibility() {
    if (!avatar) return;
    const fp = effectiveFP();
    avatar.group.visible = !fp;       // body only in third-person
    if (hands) hands.visible = fp;    // hands only in first-person
  }

  function togglePOV() { userPOV = userPOV === "fp" ? "third" : "fp"; refreshVisibility(); positionCamera(); }

  function tryJump() {
    if (!avatar || !active || !getDesignActive()) return;
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
    if (!avatar || !active) return;
    const p = avatar.group.position;
    const inp = getDesignActive() ? inputDir() : { f: 0, s: 0, moving: false };

    if (inp.moving) {
      // forward = (sin yaw, cos yaw); strafe-right = camera right = (-cos yaw, sin yaw)
      let dx = Math.sin(yaw) * inp.f - Math.cos(yaw) * inp.s;
      let dz = Math.cos(yaw) * inp.f + Math.sin(yaw) * inp.s;
      const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
      p.x += dx * SPEED * dt;
      p.z += dz * SPEED * dt;
      avatar.group.rotation.y = Math.atan2(dx, dz);
      walkPhase += dt * 9;
    }

    // gravity / jump — stand on the active room floor while inside it, else ground
    const groundY = withinActiveRoom(p) ? roomOffset.y : 0;
    vy -= GRAVITY * dt;
    p.y += vy * dt;
    if (p.y <= groundY) { p.y = groundY; vy = 0; grounded = true; }

    resolveColliders(p, getColliders ? getColliders() : []);

    // limb / view animation
    const targetSwing = inp.moving ? Math.sin(walkPhase) * 0.5 : 0;
    swing += (targetSwing - swing) * 0.25;
    const fp = effectiveFP();
    if (!fp) {
      const [legL, legR] = avatar.parts.legs, [armL, armR] = avatar.parts.arms;
      legL.rotation.x = swing; legR.rotation.x = -swing;
      armL.rotation.x = -swing; armR.rotation.x = swing;
    }
    const targetBob = inp.moving ? Math.sin(walkPhase * 2) * 0.5 : 0;
    bob += (targetBob - bob) * 0.2;
    if (hands && fp) hands.position.y = bob * 0.02;

    refreshVisibility();
    positionCamera();
  }

  function positionCamera() {
    if (!avatar) return;
    const p = avatar.group.position;
    if (effectiveFP()) {
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

  function setHidden() { active = false; if (avatar) avatar.group.visible = false; if (hands) hands.visible = false; }

  return {
    setConfig,
    standInRoom,
    togglePOV,
    setHidden,
    update,
    isThirdPerson: () => userPOV === "third",
    hasAvatar: () => !!avatar,
    _debug: () => ({ active, userPOV, fp: effectiveFP(), inside: avatar ? insideHouse(avatar.group.position) : null, grounded, pos: avatar ? avatar.group.position.toArray().map((n) => +n.toFixed(2)) : null }),
  };
}

function resolveColliders(p, boxes) {
  for (const b of boxes) {
    if (p.y >= b.maxY - 0.05) continue;            // feet above the box -> over/on top
    if (p.y + BODY_H <= (b.minY || 0)) continue;   // box entirely above (upper floor)
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-7) {
      const d = Math.sqrt(d2), push = RADIUS - d;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
    } else {
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
