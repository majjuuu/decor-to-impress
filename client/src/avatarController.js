// =============================================================================
// avatarController.js — places, moves and animates the player's avatar
// =============================================================================
//
// Owns the single in-world avatar. Two modes:
//   - "room":    the avatar stands in the room you're designing; WASD/arrows nudge
//                it around that room (the orbit camera is unchanged).
//   - "explore": a 3rd-person follow-camera; WASD/arrows walk it freely across the
//                ground (the house + the endless neighborhood), Minecraft-style.
// A simple swing-the-limbs walk cycle plays whenever it's moving. Movement is
// world-relative (W = away from camera, etc.) which lines up with both the default
// design view and the fixed-offset follow camera.

import * as THREE from "three";
import { buildAvatar } from "./avatar.js";
import { ROOM_SIZE } from "./grid.js";

const ROOM_SPEED = 3.2; // units/sec while nudging around a room
const EXPLORE_SPEED = 7.5; // units/sec while roaming
const TURN_LERP = 0.2; // how fast the avatar swivels to face its heading

export function createAvatarController({ scene, camera, getDesignActive, focusActiveRoom }) {
  let avatar = null; // { group, parts }
  let mode = "hidden"; // hidden | room | explore
  let roomOffset = { x: 0, y: 0, z: 0 };
  let yaw = 0; // current facing (radians)
  let walkPhase = 0; // accumulates while moving, drives the limb swing
  let swing = 0; // current limb swing amount (eased toward target)

  // Saved camera pose so leaving explore can restore the design view exactly.
  const keys = new Set();
  const onKeyDown = (e) => { const k = e.key.toLowerCase(); if (MOVE_KEYS.has(k)) keys.add(k); };
  const onKeyUp = (e) => { const k = e.key.toLowerCase(); keys.delete(k); };
  const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Build (or rebuild) the avatar from a picker config. Called once after the
  // picker; could be called again later if we add wardrobe changes.
  function setConfig(config) {
    if (avatar) { scene.remove(avatar.group); disposeTree(avatar.group); }
    avatar = buildAvatar(config);
    scene.add(avatar.group);
    avatar.group.visible = mode !== "hidden";
  }

  // Stand the avatar in the room at `offset` (front-left, facing the open front so
  // you see its face). Called by activateRoom; ignored while exploring.
  function standInRoom(offset) {
    roomOffset = offset;
    if (mode === "explore" || !avatar) return;
    mode = "room";
    avatar.group.visible = true;
    avatar.group.position.set(offset.x - ROOM_SIZE * 0.28, offset.y, offset.z + ROOM_SIZE * 0.28);
    yaw = 0; // face +Z (toward the camera / open front)
    avatar.group.rotation.y = 0;
    resetPose();
  }

  // The intended heading from the pressed keys, in WORLD space. W = -Z (up-screen
  // for both the default design cam and the follow cam), etc.
  function inputVector() {
    let x = 0, z = 0;
    if (keys.has("w") || keys.has("arrowup")) z -= 1;
    if (keys.has("s") || keys.has("arrowdown")) z += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    return { x, z, moving: x !== 0 || z !== 0 };
  }

  function update(dt) {
    if (!avatar || mode === "hidden") return;
    // In "room" mode movement is only allowed while actually designing.
    const canMove = mode === "explore" || (mode === "room" && getDesignActive());
    const inp = canMove ? inputVector() : { x: 0, z: 0, moving: false };

    if (inp.moving) {
      const len = Math.hypot(inp.x, inp.z);
      const nx = inp.x / len, nz = inp.z / len;
      const speed = mode === "explore" ? EXPLORE_SPEED : ROOM_SPEED;
      const p = avatar.group.position;
      p.x += nx * speed * dt;
      p.z += nz * speed * dt;

      if (mode === "room") {
        // keep the avatar inside the room footprint
        const lim = ROOM_SIZE / 2 - 0.6;
        p.x = clamp(p.x, roomOffset.x - lim, roomOffset.x + lim);
        p.z = clamp(p.z, roomOffset.z - lim, roomOffset.z + lim);
        p.y = roomOffset.y;
      } else {
        p.y = 0; // roam on the ground
      }

      // face the heading (shortest-arc lerp)
      const targetYaw = Math.atan2(nx, nz);
      yaw = lerpAngle(yaw, targetYaw, TURN_LERP);
      avatar.group.rotation.y = yaw;
      walkPhase += dt * 10;
    }

    // ease the limb swing toward "walking" (sine) or "idle" (0)
    const targetSwing = inp.moving ? Math.sin(walkPhase) * 0.5 : 0;
    swing += (targetSwing - swing) * 0.25;
    const [legL, legR] = avatar.parts.legs;
    const [armL, armR] = avatar.parts.arms;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing; armR.rotation.x = swing;

    // explore: the camera trails behind the avatar at a fixed offset
    if (mode === "explore") {
      const p = avatar.group.position;
      const desired = new THREE.Vector3(p.x, p.y + 4.6, p.z + 8.0);
      camera.position.lerp(desired, 0.12);
      camera.lookAt(p.x, p.y + 1.1, p.z);
    }
  }

  function enterExplore() {
    if (!avatar) return;
    mode = "explore";
    avatar.group.visible = true;
    // start on the lawn in front of the house, facing the street
    avatar.group.position.set(roomOffset.x, 0, 8);
    yaw = 0; avatar.group.rotation.y = 0;
    resetPose();
  }

  function exitExplore() {
    if (!avatar) return;
    mode = "room";
    standInRoom(roomOffset); // back to standing in the active room
    if (focusActiveRoom) focusActiveRoom(roomOffset); // restore the design camera
  }

  function resetPose() {
    walkPhase = 0; swing = 0;
    if (!avatar) return;
    for (const l of avatar.parts.legs) l.rotation.x = 0;
    for (const a of avatar.parts.arms) a.rotation.x = 0;
  }

  function setHidden() { mode = "hidden"; if (avatar) avatar.group.visible = false; }

  return {
    setConfig,
    standInRoom,
    enterExplore,
    exitExplore,
    setHidden,
    update,
    isExploring: () => mode === "explore",
    hasAvatar: () => !!avatar,
    _debug: () => ({ mode, keys: [...keys], design: getDesignActive(), pos: avatar ? avatar.group.position.toArray().map((n) => +n.toFixed(2)) : null }),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}
