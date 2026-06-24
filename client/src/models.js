// =============================================================================
// models.js — load every catalog model ONCE, up front (preload-then-clone)
// =============================================================================
//
// glTF / GLB: glTF is the standard "JPEG of 3D" — a scene description (meshes,
// materials, textures, transforms). A .glb is the binary, self-contained form
// (geometry + textures in one file). Three's GLTFLoader parses it into a normal
// Object3D tree we can add to the scene.
//
// PRELOAD-THEN-CLONE: loading a GLB is asynchronous (network + parse). If we
// loaded per placement, every piece would pop in late and we'd re-fetch the same
// file repeatedly. Instead we load each model ONCE here into a template map
// (id -> Object3D), then placement makes a cheap clone() of the template for each
// piece. Cloning shares the underlying geometry/material, so it's fast and light.
//
// Because loading is async, we must finish preloading BEFORE play begins — main.js
// shows a loading state and only starts the game once this resolves. That's also
// why we don't allow placement before models are ready.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Make any material named "glass" actually read as glass: see-through and lightly
// blue-tinted. Materials are shared across a model's clones, so fixing the
// template once makes every window glassy (cheap). Runs at load.
function glassifyMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m.name === "glass") {
        m.transparent = true;
        m.opacity = 0.32;
        m.color = new THREE.Color(0xbfe6ff);
        m.roughness = 0.05;
        m.metalness = 0;
        m.depthWrite = false; // don't let the pane occlude things seen through it
        m.needsUpdate = true;
      }
    }
  });
}

// Returns a Promise of { [itemId]: Object3D template }. Items without a modelPath
// are skipped (placement falls back to a coloured box for them).
export function preloadModels(catalog) {
  const loader = new GLTFLoader();
  const withModels = catalog.filter((item) => item.modelPath);

  return Promise.all(
    withModels.map((item) =>
      loader.loadAsync(item.modelPath).then((gltf) => {
        glassifyMaterials(gltf.scene); // make window glass see-through
        return [item.id, gltf.scene];
      })
    )
  ).then((pairs) => Object.fromEntries(pairs));
}
