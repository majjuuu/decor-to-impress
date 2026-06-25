// =============================================================================
// avatarPicker.js — "Create your character" start screen with a live 3D preview
// =============================================================================
//
// Shown once before the game begins. It runs its OWN tiny Three.js renderer in a
// canvas so the chosen avatar spins live and updates instantly as you change
// gender / skin tone / outfit (the "Dress to Impress" feel). showAvatarPicker()
// resolves with the chosen { gender, skin, outfit } once the player hits play,
// then fully tears down its renderer so nothing leaks into the main scene.

import * as THREE from "three";
import { buildAvatar, SKIN_TONES, outfitsFor } from "./avatar.js";

const cssHex = (hex) => "#" + hex.toString(16).padStart(6, "0");

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

export function showAvatarPicker() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay picker";
    overlay.innerHTML = `
      <div class="overlay__card picker__card" role="dialog">
        <p class="brand">Décor to Impress</p>
        <h1 class="overlay__title">Create your character</h1>
        <div class="picker__stage"><canvas class="picker__canvas"></canvas></div>
        <div class="picker__row picker__gender">
          <button class="btn picker__gbtn is-active" data-gender="female">Female</button>
          <button class="btn picker__gbtn" data-gender="male">Male</button>
        </div>
        <p class="picker__label">Skin tone</p>
        <div class="picker__row picker__skins"></div>
        <p class="picker__label">Outfit</p>
        <div class="picker__row picker__outfit">
          <button class="btn picker__arrow" data-dir="-1" aria-label="Previous outfit">‹</button>
          <span class="picker__outfit-name"></span>
          <button class="btn picker__arrow" data-dir="1" aria-label="Next outfit">›</button>
        </div>
        <button class="btn btn--primary overlay__cta" data-action="play">Let's play! →</button>
      </div>`;
    overlay.style.display = "flex"; // .overlay defaults to display:none
    document.body.appendChild(overlay);

    const config = { gender: "female", skin: SKIN_TONES[1].hex, outfit: 0 };

    // ---- mini 3D preview ----------------------------------------------------
    const canvas = overlay.querySelector(".picker__canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    cam.position.set(0, 1.05, 3.6);
    cam.lookAt(0, 0.85, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8aaa, 1.05));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2.5, 4, 3); scene.add(key);
    // a soft turntable disc under the character
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.08, 36),
      new THREE.MeshStandardMaterial({ color: 0xece3ff, roughness: 0.8 })
    );
    disc.position.y = -0.04; scene.add(disc);

    let avatarGroup = null;
    function rebuild() {
      if (avatarGroup) { scene.remove(avatarGroup); disposeTree(avatarGroup); }
      avatarGroup = buildAvatar(config).group;
      scene.add(avatarGroup);
    }
    rebuild();

    // Keep the WebGL buffer matched to the canvas's laid-out size. Done in the
    // render loop (the standard pattern) so it's correct on first layout and on any
    // later resize, without depending on resize events firing before first paint.
    const pr = renderer.getPixelRatio();
    function syncSize() {
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) {
        renderer.setSize(w, h, false);
        cam.aspect = w / h; cam.updateProjectionMatrix();
      }
    }

    let raf = 0, running = true;
    function loop() {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      syncSize();
      if (avatarGroup) avatarGroup.rotation.y += 0.012;
      renderer.render(scene, cam);
    }
    loop();

    // ---- controls -----------------------------------------------------------
    const skinsRow = overlay.querySelector(".picker__skins");
    SKIN_TONES.forEach((tone) => {
      const b = document.createElement("button");
      b.className = "swatch picker__skin" + (tone.hex === config.skin ? " is-active" : "");
      b.style.background = cssHex(tone.hex);
      b.title = tone.name;
      b.addEventListener("click", () => {
        config.skin = tone.hex;
        skinsRow.querySelectorAll(".picker__skin").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        rebuild();
      });
      skinsRow.appendChild(b);
    });

    const nameEl = overlay.querySelector(".picker__outfit-name");
    const refreshOutfitName = () => { nameEl.textContent = outfitsFor(config.gender)[config.outfit].name; };

    overlay.querySelectorAll(".picker__gbtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        config.gender = btn.dataset.gender;
        config.outfit = 0;
        overlay.querySelectorAll(".picker__gbtn").forEach((x) => x.classList.remove("is-active"));
        btn.classList.add("is-active");
        refreshOutfitName(); rebuild();
      });
    });

    overlay.querySelectorAll(".picker__arrow").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = outfitsFor(config.gender).length;
        config.outfit = (config.outfit + Number(btn.dataset.dir) + n) % n;
        refreshOutfitName(); rebuild();
      });
    });
    refreshOutfitName();

    // ---- confirm: tear everything down, resolve the chosen config -----------
    overlay.querySelector('[data-action="play"]').addEventListener("click", () => {
      running = false;
      cancelAnimationFrame(raf);
      if (avatarGroup) disposeTree(avatarGroup);
      disposeTree(disc);
      renderer.dispose();
      overlay.remove();
      resolve({ ...config });
    });
  });
}
