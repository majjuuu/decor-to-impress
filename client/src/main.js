// =============================================================================
// main.js — entry point: scene, camera, renderer, lights, controls, render loop
// =============================================================================
//
// Mental model of a Three.js app — three core objects work together:
//
//   1. Scene    — a container holding everything we want to draw (meshes,
//                 lights, helpers). Think of it as the "world".
//   2. Camera   — our viewpoint into that world: position, direction, and how
//                 wide a slice of the world we see.
//   3. Renderer — takes the Scene + Camera and paints a 2D image onto a <canvas>
//                 using the GPU (WebGL).
//
// Nothing appears until we call renderer.render(scene, camera). To animate
// (and to let OrbitControls react to the mouse) we call it repeatedly inside a
// "render loop" driven by requestAnimationFrame.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildHouse, buildRoof, buildGarden, buildNeighborhood, buildEndlessHouses, buildFrontGarden } from "./room.js";
import { ROOM_SIZE, grid } from "./grid.js";
import { generateHouse } from "./rooms.js";
import { buildCatalogUI } from "./ui.js";
import { createPlacementSystem, getItemParts } from "./placement.js";
import { createScreens } from "./screens.js";
import { createGame } from "./game.js";
import { createCapture } from "./capture.js";
import { requestJudgeScore } from "./judge.js";
import { preloadModels } from "./models.js";
import { preloadSounds, unlock, play } from "./soundManager.js";
import { CATALOG } from "./catalog.js";
import "./style.css";

// ---- Renderer ---------------------------------------------------------------
// antialias smooths jagged edges. We size it to the window and cap the pixel
// ratio at 2 so high-DPI screens don't render an excessive number of pixels.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Turn on shadow maps now so furniture added later can cast soft shadows.
// PCFSoftShadowMap is the nicer-looking, slightly blurred shadow algorithm.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ---- Scene ------------------------------------------------------------------
const scene = new THREE.Scene();
const SKY = 0xbfe6ff; // pale horizon blue (fallback + hemisphere tint)
scene.background = new THREE.Color(SKY);

// ---- Fog --------------------------------------------------------------------
// Linear fog fades distant geometry into the pale horizon colour. This is what
// sells the "endless" world: the far edge of the (huge) house grid and ground
// dissolves into the sky, so you never see where the world stops. `near` is well
// past the play area so the active room and its surroundings stay perfectly crisp.
scene.fog = new THREE.Fog(0xdcefff, 75, 235);

// ---- Sky dome ---------------------------------------------------------------
// A big inside-out sphere with a vertical gradient (deep blue zenith -> pale
// horizon) reads as a real sky, not a flat colour. It's drawn on the BackSide so
// we see its inner surface, and follows nothing (camera always sits inside it).
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(400, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3e84d6) },
      horizonColor: { value: new THREE.Color(0xdcefff) },
      exponent: { value: 0.55 },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 horizonColor; uniform float exponent; varying vec3 vPos;
      void main(){ float h = max(normalize(vPos).y, 0.0); gl_FragColor = vec4(mix(horizonColor, topColor, pow(h, exponent)), 1.0); }`,
  })
);
scene.add(skyDome);

// ---- Garden ground ----------------------------------------------------------
// A big grass plane the house sits in. A procedural speckled texture (random
// green dabs) gives it natural variation instead of a flat fill, and it receives
// the house's shadow for a grounded, peaceful look.
function makeGrassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#6fae3d";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 110 + Math.random() * 90;
    ctx.fillStyle = `rgb(${40 + Math.random() * 45},${g},${35 + Math.random() * 35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  return tex;
}
// A grass plane big enough that, with fog, it fades into the horizon long before
// its real edge — so the world reads as endless ground in every direction.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(900, 900),
  new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(20, -0.05, 0); // roughly centred under the row of rooms
ground.receiveShadow = true;
scene.add(ground);

// ---- Camera -----------------------------------------------------------------
// PerspectiveCamera(fov, aspect, near, far):
//   fov  — vertical field of view in degrees (how "wide" the lens is).
//   aspect — width/height of the canvas; wrong aspect = stretched image.
//   near/far — only objects between these distances get drawn (the "frustum").
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
// Start outside and above the room, looking down at it at an angle.
camera.position.set(ROOM_SIZE * 0.9, ROOM_SIZE * 0.9, ROOM_SIZE * 0.9);

// ---- Lights -----------------------------------------------------------------
// We use TWO lights on purpose:
//   - AmbientLight fills the whole scene with a uniform, directionless glow so
//     no surface is ever pitch black. On its own it looks flat (no shading).
//   - DirectionalLight acts like the sun: parallel rays from one direction.
//     It produces the light/shadow gradients that give objects their 3D form,
//     and it's the light that casts shadows.
// Together: ambient sets the base brightness, directional adds shape + shadows.
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

// A hemisphere light tints fill light by sky (from above) and grass (from below)
// for a natural, soft outdoor feel.
const hemi = new THREE.HemisphereLight(SKY, 0x6a8d3a, 0.5);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
const SUN_DELTA = { x: ROOM_SIZE, y: ROOM_SIZE * 1.5, z: ROOM_SIZE * 0.5 };
sun.position.set(SUN_DELTA.x, SUN_DELTA.y, SUN_DELTA.z);
sun.castShadow = true;
// The shadow camera is an orthographic box sized to one room. The sun (and this
// box) FOLLOWS the active room — see activateRoom() — so shadows stay crisp no
// matter which room across the wide house you're in.
sun.shadow.camera.left = -ROOM_SIZE;
sun.shadow.camera.right = ROOM_SIZE;
sun.shadow.camera.top = ROOM_SIZE;
sun.shadow.camera.bottom = -ROOM_SIZE;
sun.shadow.mapSize.set(2048, 2048); // higher = crisper shadows
scene.add(sun);
scene.add(sun.target); // the light aims at this; we move it to the active room

// ---- The house --------------------------------------------------------------
// Houses are procedurally generated (Milestone 9). The footprint (room count) is
// fixed, so we build the shells once and just regenerate the room CONTENTS for
// each new house. The game makes one room "active" at a time; finished rooms stay
// decorated next door, and finishing the house generates the next one.
let currentRooms = generateHouse();
let houseNumber = 1;
const shells = buildHouse(scene, currentRooms.length);
buildRoof(scene, currentRooms.length); // pitched roof over the top floor
buildGarden(scene); // trees + bushes around the house
buildFrontGarden(scene); // fenced front yard with a path, flowers and trees
buildNeighborhood(scene); // detailed near-houses + street so it reads as a neighborhood
buildEndlessHouses(scene); // huge instanced house grid fading into fog → endless world

// ---- OrbitControls ----------------------------------------------------------
// OrbitControls lets the user rotate (left-drag), zoom (wheel), and pan
// (right-drag) the CAMERA around a target point — it does the spherical-
// coordinate math for us so we don't write any input handling.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0); // orbit around the room's centre
controls.enableDamping = true; // adds a little inertia so motion feels smooth
controls.dampingFactor = 0.08;

// Clamp the controls so the view stays sensible:
//   - maxPolarAngle just under 90° keeps the camera above the floor (it can't
//     drop to a flat, under-the-floor angle). Polar angle is measured from
//     straight-up: 0 = top-down, ~90° = horizontal.
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minPolarAngle = 0.05; // don't go perfectly top-down (avoids gimbal weirdness)
//   - distance limits stop zooming inside the floor or flying infinitely away.
controls.minDistance = ROOM_SIZE * 0.45;
controls.maxDistance = ROOM_SIZE * 1.5; // can't fly far from the room anymore
controls.enablePan = false; // no panning — the view stays anchored on the room

// Move the camera to look into a room at `offset` (from the open front + above),
// zoomed in close on that room.
function focusRoom(offset) {
  const tx = offset.x;
  const ty = offset.y + 1.2;
  const tz = offset.z;
  controls.target.set(tx, ty, tz);
  camera.position.set(tx + ROOM_SIZE * 0.45, ty + ROOM_SIZE * 0.5, tz + ROOM_SIZE * 0.8);
  controls.update();
}

// ---- Interactive systems (built after models preload) -----------------------
// These reference each other, so we declare them here and assign in init() once
// the furniture models have loaded. selectItem/deselect are hoisted and only
// called after init, so closing over these `let`s is safe.
let placement;
let ui;
let game;
let models = {};
let selectedId = null;

function selectItem(item) {
  // Selection only works while playing (DESIGN). Gate it on the game state, not
  // just on hiding the panel.
  if (game.getState() !== "DESIGN") return;
  // Clicking the already-active item again toggles it off (a handy deselect).
  if (selectedId === item.id) {
    deselect();
    return;
  }
  selectedId = item.id;
  placement.setActiveItem(item);
  ui.setSelected(item.id);
  // Load this piece's recolourable parts into the colour picker (resets overrides).
  ui.setItemParts(getItemParts(item, models));
}

function deselect() {
  selectedId = null;
  placement.clearActiveItem();
  ui.setSelected(null);
  ui.setItemParts([]); // clear the part picker back to its hint
}

// A minimal loading overlay shown while GLB models download/parse. We don't let
// play begin until they're ready (placement clones from the loaded templates).
const loadingEl = document.createElement("div");
loadingEl.className = "overlay";
loadingEl.style.display = "flex";
loadingEl.innerHTML = `<div class="overlay__card"><div class="spinner"></div><h1 class="overlay__title">Loading furniture…</h1></div>`;
document.body.appendChild(loadingEl);

// AudioContext gesture unlock: browsers won't play audio until the user
// interacts. Resume the context on the very first pointer-down (the Start button
// click counts), so sounds aren't silent. `once` removes the listener after.
window.addEventListener("pointerdown", unlock, { once: true });

async function init() {
  // Preload models AND sounds in parallel. Model preload can throw (then we fall
  // back to boxes); sound preload never throws (missing clips are just silent).
  const [modelResult] = await Promise.all([
    preloadModels(CATALOG).catch((err) => {
      console.error("Model preload failed; falling back to coloured boxes:", err);
      return {};
    }),
    preloadSounds(),
  ]);
  models = modelResult;

  let activeShell = null; // the room currently being designed (for wall recolour)

  // Placement clones from `models`; the catalog UI reports clicks. Seed it with
  // room 0; the game retargets it per room via activateRoom().
  placement = createPlacementSystem({
    scene,
    camera,
    floor: shells[0].floor,
    domElement: renderer.domElement,
    models,
    walls: shells[0].walls,
  });
  ui = buildCatalogUI({
    onSelect: selectItem,
    onColorChange: (colorMap) => placement.setActiveColorMap(colorMap),
    onWallColorChange: (color) => {
      // Recolour the ACTIVE room's walls live (each room has its own wall material).
      if (activeShell) activeShell.wallMaterial.color.set(color);
    },
  });

  // The game FSM owns the round; screens are the START/REVEAL/RESULT overlays;
  // capture provides the birdseye seam; judge talks to the backend.
  const screens = createScreens({
    onStart: () => { play("start"); game.beginDesign(); },
    onDone: () => { play("done"); game.finishDesign(); },
    onRetry: () => { play("done"); game.retry(); },
    onNext: () => { play("done"); game.nextRoom(); },
    onFinish: () => { play("done"); game.finishGame(); },
    onRestart: () => { play("done"); game.restart(); },
    onNextHouse: () => { play("start"); game.nextHouse(); },
  });
  const capture = createCapture({ renderer, scene });

  // Make room `index` the active one: point placement + capture at its shell,
  // show only its grid, and fly the camera to it.
  function activateRoom(index) {
    const shell = shells[index];
    activeShell = shell; // so the wall-colour picker targets this room
    placement.setActiveRoom(shell);
    capture.setActiveRoom(shell.offset);
    shells.forEach((s, i) => { s.grid.visible = i === index; });
    focusRoom(shell.offset);
    // Move the sun + its shadow box over this room so shadows stay crisp.
    sun.position.set(shell.offset.x + SUN_DELTA.x, shell.offset.y + SUN_DELTA.y, shell.offset.z + SUN_DELTA.z);
    sun.target.position.set(shell.offset.x, shell.offset.y, shell.offset.z);
    sun.target.updateMatrixWorld();
  }

  // Generate the next house: new randomised room contents (same fixed footprint),
  // and wipe all furniture. Shells are reused, so no geometry rebuild.
  function newHouse() {
    houseNumber += 1;
    currentRooms = generateHouse();
    placement.clearHouse();
  }

  game = createGame({
    placement,
    screens,
    captureScreenshot: capture.captureScreenshot,
    requestJudgeScore,
    resetSelection: deselect,
    setCatalogVisible: ui.setVisible,
    setCatalogItems: ui.setItems,
    activateRoom,
    getRooms: () => currentRooms,
    getHouseNumber: () => houseNumber,
    newHouse,
  });

  // Keyboard: only meaningful during DESIGN. Esc deselects; R rotates the active
  // item through 90° steps. (With nothing selected, left-clicking a placed item
  // deletes it — see placement.js, which also gates on input being enabled.)
  window.addEventListener("keydown", (e) => {
    if (game.getState() !== "DESIGN") return;
    if (e.key === "Escape") deselect();
    if (e.key === "r" || e.key === "R") placement.rotateActiveItem();
  });

  loadingEl.remove();
  game.start(); // START screen (theme + Start button; nothing placeable yet)

  // Expose for debugging in the console.
  window.__roomDesigner = { scene, camera, renderer, controls, shells, placement, grid, game, models, screens, capture };
}
init();

// ---- Resize handling --------------------------------------------------------
// When the window changes size we must update BOTH the camera's aspect ratio
// (so the image isn't stretched) and the renderer's drawing buffer size.
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); // apply the new aspect to the camera
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Render loop ------------------------------------------------------------
// requestAnimationFrame asks the browser to call us again before the next
// repaint (~60 times/sec). Each frame we update the controls (needed for
// damping) and draw one image. This loop is the single heartbeat of the app.
function animate() {
  requestAnimationFrame(animate);
  controls.update(); // required when enableDamping is on
  renderer.render(scene, camera);
}
animate();
