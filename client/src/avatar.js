// =============================================================================
// avatar.js — the player's character, built procedurally from primitives
// =============================================================================
//
// buildAvatar(config) returns a THREE.Group whose origin is at the FEET (y=0),
// plus references to the limb pivots so a walk cycle can swing them. Everyone
// shares the same face; the player chooses gender (body shape + hair), skin tone,
// and one of five outfits. buildHands(config) returns a first-person "viewmodel"
// (two forearms + hands) to attach to the camera in first-person view.
//
// It's primitives, so it can't be photoreal — but proper proportions, a shaped
// head, irises + brows + ears + defined lips, and collared/belted clothes read as
// a real little person rather than a snowman.

import * as THREE from "three";

export const SKIN_TONES = [
  { name: "Porcelain", hex: 0xffe0bd },
  { name: "Light", hex: 0xf1c27d },
  { name: "Medium", hex: 0xe0ac69 },
  { name: "Tan", hex: 0xc68642 },
  { name: "Brown", hex: 0x8d5524 },
  { name: "Deep", hex: 0x5c3a21 },
];

// Outfit = top + bottom + sleeve length + an accent (collar/belt) colour.
export const FEMALE_OUTFITS = [
  { name: "Sundress", top: 0xff7eb6, bottom: 0xff7eb6, accent: 0xfff0f6, kind: "dress", sleeves: "none" },
  { name: "Tee & Jeans", top: 0xffd54f, bottom: 0x46618f, accent: 0xffffff, kind: "pants", sleeves: "short" },
  { name: "Hoodie & Leggings", top: 0xb06ad6, bottom: 0x2f333b, accent: 0xd8b6ee, kind: "pants", sleeves: "long" },
  { name: "Tank & Skirt", top: 0x2fcf95, bottom: 0xf3eee4, accent: 0x1f9e72, kind: "skirt", sleeves: "none" },
  { name: "Tee & Shorts", top: 0xff6b6b, bottom: 0x57a08c, accent: 0xffffff, kind: "shorts", sleeves: "short" },
];

export const MALE_OUTFITS = [
  { name: "Tee & Jeans", top: 0x3aa0ff, bottom: 0x35455e, accent: 0xffffff, kind: "pants", sleeves: "short" },
  { name: "Hoodie & Shorts", top: 0xef5350, bottom: 0x8d97a3, accent: 0xf3b0ae, kind: "shorts", sleeves: "long" },
  { name: "Polo & Chinos", top: 0x2fcf95, bottom: 0xc9b48a, accent: 0xffffff, kind: "pants", sleeves: "short" },
  { name: "Tank & Shorts", top: 0xffa23b, bottom: 0x3aa0ff, accent: 0xffd9a8, kind: "shorts", sleeves: "none" },
  { name: "Jacket & Jeans", top: 0x2c3e66, bottom: 0x46618f, accent: 0x9fb3d8, kind: "pants", sleeves: "long" },
];

export function outfitsFor(gender) {
  return gender === "male" ? MALE_OUTFITS : FEMALE_OUTFITS;
}

const HAIR_COLOR = 0x3a2a1c; // warm dark brown for everyone
const IRIS_COLOR = 0x6b4a2e; // warm brown eyes

function resolve(config) {
  const gender = config.gender === "male" ? "male" : "female";
  const skin = config.skin != null ? config.skin : SKIN_TONES[1].hex;
  const outfits = outfitsFor(gender);
  const outfit = outfits[(((config.outfit || 0) % outfits.length) + outfits.length) % outfits.length];
  return { gender, skin, outfit };
}

const mat = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });

// Build the character. Returns { group, parts, height, eyeY }.
export function buildAvatar(config = {}) {
  const { gender, skin, outfit } = resolve(config);

  const skinMat = mat(skin, 0.75);
  const topMat = mat(outfit.top, 0.85);
  const bottomMat = mat(outfit.bottom, 0.85);
  const accentMat = mat(outfit.accent, 0.7);
  const hairMat = mat(HAIR_COLOR, 0.95);
  const shoeMat = mat(0x2b2b33, 0.6);
  const beltMat = mat(0x4a3a2a, 0.6);
  const eyeWhiteMat = mat(0xfdfdff, 0.35);
  const irisMat = mat(IRIS_COLOR, 0.4);
  const pupilMat = mat(0x201a16, 0.3);
  const shineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 });
  const lipMat = mat(0xc4716a, 0.5);
  const browMat = mat(0x2e2117, 0.9);

  const m = gender === "male"
    ? { shoulderW: 0.46, hipW: 0.30, torsoH: 0.64, hipY: 0.86, headR: 0.165, armLen: 0.60, legLen: 0.86, limbR: 0.08 }
    : { shoulderW: 0.36, hipW: 0.35, torsoH: 0.58, hipY: 0.80, headR: 0.158, armLen: 0.54, legLen: 0.80, limbR: 0.07 };
  const shoulderY = m.hipY + m.torsoH;

  const root = new THREE.Group();
  root.userData.isAvatarRoot = true;

  // ---- Torso: a gently tapered shirt with a collar ----
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(m.shoulderW * 0.62, m.hipW * 0.78, m.torsoH, 18), topMat);
  torso.scale.z = 0.62; // flatten front-to-back so it's not a barrel
  torso.position.y = m.hipY + m.torsoH / 2;
  root.add(torso);
  // collar / neckline accent
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 1.5, m.shoulderW * 0.5, 0.1, 16), accentMat);
  collar.scale.z = 0.7; collar.position.y = shoulderY - 0.03; root.add(collar);
  // belt for trousers
  if (outfit.kind === "pants") {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(m.hipW * 0.8, m.hipW * 0.8, 0.09, 18), beltMat);
    belt.scale.z = 0.64; belt.position.y = m.hipY + 0.04; root.add(belt);
  }

  // skirt / dress flare
  if (outfit.kind === "skirt" || outfit.kind === "dress") {
    const skirtMat = new THREE.MeshStandardMaterial({
      color: outfit.kind === "dress" ? outfit.top : outfit.bottom, roughness: 0.85, side: THREE.DoubleSide,
    });
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(m.hipW * 1.8, 0.55, 18, 1, true), skirtMat);
    skirt.position.y = m.hipY + 0.02; root.add(skirt);
  }

  // ---- Legs ----
  const legMats = outfit.kind === "pants"
    ? { upper: bottomMat, lower: bottomMat }
    : outfit.kind === "shorts"
      ? { upper: bottomMat, lower: skinMat }
      : { upper: skinMat, lower: skinMat };
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * m.hipW * 0.5, m.hipY, 0);
    const half = m.legLen / 2;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 1.05, m.limbR * 0.95, half, 12), legMats.upper);
    upper.position.y = -half / 2; leg.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.95, m.limbR * 0.8, half, 12), legMats.lower);
    lower.position.y = -half - half / 2; leg.add(lower);
    // shoe: a body + a rounded toe
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(m.limbR * 2.1, 0.1, m.limbR * 2.8), shoeMat);
    shoe.position.set(0, -m.legLen + 0.04, 0.04); leg.add(shoe);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(m.limbR * 1.05, 10, 8), shoeMat);
    toe.scale.set(1, 0.7, 1.1); toe.position.set(0, -m.legLen + 0.06, m.limbR * 1.7); leg.add(toe);
    root.add(leg); legs.push(leg);
  }

  // ---- Arms ----
  const armMats = outfit.sleeves === "long"
    ? { upper: topMat, lower: topMat }
    : outfit.sleeves === "short"
      ? { upper: topMat, lower: skinMat }
      : { upper: skinMat, lower: skinMat };
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (m.shoulderW * 0.62 + m.limbR), shoulderY - 0.06, 0);
    const half = m.armLen / 2;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.85, m.limbR * 0.78, half, 10), armMats.upper);
    upper.position.y = -half / 2; arm.add(upper);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.78, m.limbR * 0.7, half, 10), armMats.lower);
    lower.position.y = -half - half / 2; arm.add(lower);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(m.limbR * 0.95, 10, 8), skinMat);
    hand.scale.set(1, 1.15, 0.8); hand.position.y = -m.armLen; arm.add(hand);
    root.add(arm); arms.push(arm);
  }

  // ---- Neck + head ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(m.limbR * 0.85, m.limbR * 0.95, 0.1, 10), skinMat);
  neck.position.y = shoulderY + 0.03; root.add(neck);

  const head = new THREE.Group();
  const R = m.headR;
  head.position.y = shoulderY + 0.08 + R;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 22, 18), skinMat);
  skull.scale.set(0.96, 1.1, 1.0); // a touch taller than wide -> head-shaped, not a ball
  head.add(skull);
  // jaw/chin taper
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(R * 0.7, 16, 12), skinMat);
  jaw.scale.set(0.95, 0.8, 0.95); jaw.position.set(0, -R * 0.5, R * 0.06); head.add(jaw);
  // ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 8, 8), skinMat);
    ear.scale.set(0.6, 1, 0.8); ear.position.set(side * R * 0.95, R * 0.02, 0); head.add(ear);
  }

  // Face (identical for everyone), looking down +Z.
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 12, 10), eyeWhiteMat);
    white.scale.set(1.35, 0.85, 0.5); white.position.set(side * R * 0.36, R * 0.14, R * 0.84); head.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(R * 0.1, 12, 10), irisMat);
    iris.position.set(side * R * 0.36, R * 0.14, R * 0.92); head.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.05, 8, 8), pupilMat);
    pupil.position.set(side * R * 0.36, R * 0.14, R * 0.96); head.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(R * 0.022, 6, 6), shineMat);
    shine.position.set(side * R * 0.33, R * 0.19, R * 0.97); head.add(shine);
    // eyebrow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(R * 0.34, R * 0.06, R * 0.06), browMat);
    brow.position.set(side * R * 0.36, R * 0.34, R * 0.86); brow.rotation.z = side * -0.12; head.add(brow);
  }
  // nose: subtle
  const nose = new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 10, 8), skinMat);
  nose.scale.set(0.8, 0.9, 1.1); nose.position.set(0, R * -0.02, R * 0.97); head.add(nose);
  // lips: upper + lower
  const upperLip = new THREE.Mesh(new THREE.BoxGeometry(R * 0.4, R * 0.07, R * 0.08), lipMat);
  upperLip.position.set(0, R * -0.34, R * 0.86); head.add(upperLip);
  const lowerLip = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.07, R * 0.22, 4, 8), lipMat);
  lowerLip.rotation.z = Math.PI / 2; lowerLip.scale.set(1, 1, 0.6);
  lowerLip.position.set(0, R * -0.42, R * 0.85); head.add(lowerLip);

  // Hair — capped on top/back so it never covers the face.
  buildHair(head, R, gender, hairMat);

  root.add(head);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.excludeFromCapture = true; } });

  return { group: root, parts: { legs, arms, head }, height: head.position.y + R, eyeY: head.position.y + R * 0.15 };
}

function buildHair(head, R, gender, hairMat) {
  // The face features sit on the +Z front of the head (eyes ~y=0.14R, brows ~0.34R).
  // A FULL/low cap drapes down the front and hides them — the old bug. Instead the
  // cap is a partial sphere cut high (small thetaLength) so its front rim is a
  // HAIRLINE just above the brows, leaving the whole face clear. The back of the
  // head is covered by a separate mass pushed back so it never reaches the face.

  // top cap / hairline — rim ends ~0.4R up (above the 0.34R brows, well above eyes)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.38), hairMat);
  cap.scale.set(1.06, 1.06, 1.08); head.add(cap);

  // back-of-head mass: covers crown→nape and the sides, pushed back so its front
  // face stays behind the eyes (front reaches only ~z=0.45R; eyes are at z=0.84R)
  const back = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 18, 14), hairMat);
  back.scale.set(1.12, 1.12, 0.85); back.position.set(0, -R * 0.05, -R * 0.42); head.add(back);

  if (gender === "male") {
    // a short fringe swept high on the forehead — sits above the brows
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, R * 0.22, R * 0.35), hairMat);
    fringe.position.set(0, R * 0.5, R * 0.5); fringe.rotation.x = 0.25; head.add(fringe);
  } else {
    // long hair down the back to the shoulders
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.85, R * 1.6, 6, 12), hairMat);
    tail.scale.set(1.2, 1, 0.5); tail.position.set(0, -R * 0.85, -R * 0.7); head.add(tail);
    // two side strands BEHIND the eye plane (z≈0.05R), framing the face at the ears
    for (const side of [-1, 1]) {
      const strand = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.18, R * 0.95, 4, 8), hairMat);
      strand.scale.set(1, 1, 0.5); strand.position.set(side * R * 0.95, -R * 0.4, R * 0.05); head.add(strand);
    }
  }
}

// First-person hands viewmodel: two forearms + hands rising from the bottom of
// the view, like Minecraft. Returns a Group meant to be attached to the CAMERA.
export function buildHands(config = {}) {
  const { skin, outfit } = resolve(config);
  const skinMat = mat(skin, 0.75);
  const sleeveMat = mat(outfit.top, 0.85);
  const longSleeve = outfit.sleeves === "long";

  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    // a forearm pointing up-forward into the view
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.42, 10), longSleeve ? sleeveMat : skinMat);
    sleeve.position.y = -0.21; arm.add(sleeve);
    // a cuff of shirt colour for short sleeves / bare arms (a bracelet of fabric)
    if (!longSleeve) {
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), sleeveMat);
      cuff.position.y = -0.4; arm.add(cuff);
    }
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), skinMat);
    hand.scale.set(1, 1.15, 0.8); arm.add(hand);
    // place at the lower corners, tilted inward toward the centre of the screen
    arm.position.set(side * 0.34, -0.42, -0.85);
    arm.rotation.set(-0.5, side * 0.12, side * 0.5);
    group.add(arm);
  }
  group.traverse((o) => { if (o.isMesh) { o.userData.excludeFromCapture = true; o.renderOrder = 999; } });
  return group;
}
