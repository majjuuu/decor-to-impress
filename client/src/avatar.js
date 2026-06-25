// =============================================================================
// avatar.js — the player's character, built procedurally from primitives
// =============================================================================
//
// Like the furniture and houses, the avatar is built in code from boxes, spheres
// and cylinders — no model files. buildAvatar(config) returns a THREE.Group whose
// origin is at the FEET (y=0), so we can drop it on any floor, plus references to
// the limb pivots so a walk cycle can swing them (see avatarController.js).
//
// Per the design: EVERYONE shares the same face (eyes, nose, lips). The player
// only chooses gender (body shape + hair), skin tone, and one of five outfits.

import * as THREE from "three";

// Six skin tones offered in the picker.
export const SKIN_TONES = [
  { name: "Porcelain", hex: 0xffe0bd },
  { name: "Light", hex: 0xf1c27d },
  { name: "Medium", hex: 0xe0ac69 },
  { name: "Tan", hex: 0xc68642 },
  { name: "Brown", hex: 0x8d5524 },
  { name: "Deep", hex: 0x5c3a21 },
];

// Outfit = a top (shirt/dress) + a bottom + a sleeve length. `kind` decides the
// lower body: pants (full), shorts (upper half, lower legs bare), skirt (a flared
// cone, bare legs below), dress (the TOP colour flares into a skirt, bare legs).
export const FEMALE_OUTFITS = [
  { name: "Sundress", top: 0xff7eb6, bottom: 0xff7eb6, kind: "dress", sleeves: "none" },
  { name: "Tee & Jeans", top: 0xffd54f, bottom: 0x4a6fa5, kind: "pants", sleeves: "short" },
  { name: "Hoodie & Leggings", top: 0xb06ad6, bottom: 0x33373f, kind: "pants", sleeves: "long" },
  { name: "Tank & Skirt", top: 0x2fcf95, bottom: 0xfaf6ee, kind: "skirt", sleeves: "none" },
  { name: "Tee & Shorts", top: 0xff6b6b, bottom: 0x6db5a0, kind: "shorts", sleeves: "short" },
];

export const MALE_OUTFITS = [
  { name: "Tee & Jeans", top: 0x3aa0ff, bottom: 0x3a4a63, kind: "pants", sleeves: "short" },
  { name: "Hoodie & Shorts", top: 0xff6b6b, bottom: 0x9aa3ad, kind: "shorts", sleeves: "long" },
  { name: "Polo & Chinos", top: 0x2fcf95, bottom: 0xc9b48a, kind: "pants", sleeves: "short" },
  { name: "Tank & Shorts", top: 0xffa23b, bottom: 0x3aa0ff, kind: "shorts", sleeves: "none" },
  { name: "Jacket & Jeans", top: 0x2c3e66, bottom: 0x4a6fa5, kind: "pants", sleeves: "long" },
];

export function outfitsFor(gender) {
  return gender === "male" ? MALE_OUTFITS : FEMALE_OUTFITS;
}

// Build the character. Returns { group, parts } where parts.legs/arms are the two
// pivot Groups to swing for walking, and parts.head is the head Group.
export function buildAvatar(config = {}) {
  const gender = config.gender === "male" ? "male" : "female";
  const skin = config.skin != null ? config.skin : SKIN_TONES[1].hex;
  const outfits = outfitsFor(gender);
  const outfit = outfits[((config.outfit || 0) % outfits.length + outfits.length) % outfits.length];

  const mat = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const skinMat = mat(skin, 0.8);
  const topMat = mat(outfit.top, 0.9);
  const bottomMat = mat(outfit.bottom, 0.9);
  const hairMat = mat(0x4a3525, 1);
  const shoeMat = mat(0x2b2b33, 0.7);
  const eyeWhiteMat = mat(0xffffff, 0.4);
  const pupilMat = mat(0x2b2b3a, 0.4);
  const lipMat = mat(0xcc5a5a, 0.6);

  // Body metrics differ a touch by gender (shoulders/hips/height).
  const m = gender === "male"
    ? { shoulderW: 0.44, hipW: 0.30, torsoH: 0.62, hipY: 0.84, headR: 0.165, armLen: 0.58, legLen: 0.84, limbR: 0.078 }
    : { shoulderW: 0.34, hipW: 0.34, torsoH: 0.56, hipY: 0.78, headR: 0.16, armLen: 0.52, legLen: 0.78, limbR: 0.068 };
  const shoulderY = m.hipY + m.torsoH;

  const root = new THREE.Group();
  root.userData.isAvatarRoot = true; // handy for lookups/tests

  // ---- Torso (the shirt) ----
  const torso = new THREE.Mesh(new THREE.BoxGeometry(m.shoulderW * 1.5, m.torsoH, 0.27), topMat);
  torso.position.y = m.hipY + m.torsoH / 2;
  root.add(torso);

  // Skirt / dress flare (a bottomless cone). Dress uses the TOP colour; a skirt
  // outfit uses the bottom colour.
  if (outfit.kind === "skirt" || outfit.kind === "dress") {
    const skirtMat = new THREE.MeshStandardMaterial({
      color: outfit.kind === "dress" ? outfit.top : outfit.bottom,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(m.hipW * 1.7, 0.5, 16, 1, true), skirtMat);
    skirt.position.y = m.hipY - 0.02;
    root.add(skirt);
  }

  // ---- Legs (two pivots at the hips) ----
  const legMats = outfit.kind === "pants"
    ? { upper: bottomMat, lower: bottomMat }
    : outfit.kind === "shorts"
      ? { upper: bottomMat, lower: skinMat }
      : { upper: skinMat, lower: skinMat }; // skirt/dress -> bare legs
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * m.hipW * 0.5, m.hipY, 0);
    const half = m.legLen / 2;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR, m.limbR * 0.95, half, 10), legMats.upper);
    upper.position.y = -half / 2; leg.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.95, m.limbR * 0.85, half, 10), legMats.lower);
    lower.position.y = -half - half / 2; leg.add(lower);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(m.limbR * 2.4, 0.1, m.limbR * 3.6), shoeMat);
    shoe.position.set(0, -m.legLen + 0.03, 0.05); leg.add(shoe);
    root.add(leg); legs.push(leg);
  }

  // ---- Arms (two pivots at the shoulders) ----
  const armMats = outfit.sleeves === "long"
    ? { upper: topMat, lower: topMat }
    : outfit.sleeves === "short"
      ? { upper: topMat, lower: skinMat }
      : { upper: skinMat, lower: skinMat };
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (m.shoulderW * 0.78 + m.limbR), shoulderY - 0.05, 0);
    const half = m.armLen / 2;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.9, m.limbR * 0.82, half, 10), armMats.upper);
    upper.position.y = -half / 2; arm.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.82, m.limbR * 0.78, half, 10), armMats.lower);
    lower.position.y = -half - half / 2; arm.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(m.limbR * 1.05, 8, 6), skinMat);
    hand.position.y = -m.armLen; arm.add(hand);
    root.add(arm); arms.push(arm);
  }

  // ---- Neck + head ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.8, m.limbR * 0.8, 0.08, 8), skinMat);
  neck.position.y = shoulderY + 0.04;
  root.add(neck);

  const head = new THREE.Group();
  const R = m.headR;
  head.position.y = shoulderY + 0.08 + R; // head centre
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 14), skinMat);
  head.add(skull);

  // Face (identical for everyone). The face looks down +Z (the avatar's "front").
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(R * 0.26, 10, 8), eyeWhiteMat);
    white.scale.z = 0.5; white.position.set(side * R * 0.37, R * 0.13, R * 0.85); head.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.13, 8, 6), pupilMat);
    pupil.position.set(side * R * 0.37, R * 0.13, R * 0.96); head.add(pupil);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(R * 0.12, R * 0.26, 8), skinMat);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, R * -0.04, R * 1.0); head.add(nose);
  const lips = new THREE.Mesh(new THREE.BoxGeometry(R * 0.42, R * 0.11, R * 0.1), lipMat);
  lips.position.set(0, R * -0.34, R * 0.92); head.add(lips);

  // Hair: positioned BACK/up so it caps the top & back without covering the face.
  if (gender === "male") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0, 16, 12), hairMat);
    cap.scale.set(1.04, 0.9, 1.04); cap.position.set(0, R * 0.22, -R * 0.22); head.add(cap);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 16, 12), hairMat);
    cap.scale.set(1.06, 0.95, 1.06); cap.position.set(0, R * 0.18, -R * 0.16); head.add(cap);
    // long hair: a flattened mass hanging down the back toward the shoulders
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.7, R * 1.4, 6, 10), hairMat);
    back.scale.set(1.25, 1, 0.5); back.position.set(0, -R * 0.7, -R * 0.7); head.add(back);
  }

  root.add(head);

  // Cast shadows (looks grounded in the room); never appear in the judged birdseye.
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.userData.excludeFromCapture = true; }
  });

  return { group: root, parts: { legs, arms, head }, height: head.position.y + R };
}
