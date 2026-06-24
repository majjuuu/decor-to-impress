// =============================================================================
// capture.js — top-down birdseye screenshot of the room (Milestone 5)
// =============================================================================
//
// captureScreenshot() is the single seam Milestone 6 will consume: it renders a
// clean top-down view and returns a base64 PNG data URL. All the rendering
// internals (the overhead camera, hiding the grid, restoring everything) are
// encapsulated here.
//
// THREE CONCEPTS, explained:
//
// (1) ORTHOGRAPHIC vs PERSPECTIVE camera.
//     A PerspectiveCamera mimics an eye/lens: distant things look smaller and
//     parallel lines converge (foreshortening). Great for the playable 3D view,
//     bad for a judged top-down: furniture far from the lens centre would look
//     skewed and differently sized, muddying any read of composition/spacing.
//     An OrthographicCamera has NO perspective — parallel lines stay parallel and
//     an object's on-screen size doesn't depend on distance. That gives an even,
//     map-like birdseye where layout and proportion are honest. Its "lens" is a
//     box (frustum) defined by left/right/top/bottom rather than a field of view.
//
// (2) THE STRAIGHT-DOWN "up vector" GOTCHA.
//     A camera needs two things to orient itself: where it looks (the forward
//     direction) and which way is "up". By default up = (0, 1, 0) = +Y. But to
//     shoot straight down we look along -Y — which is PARALLEL to the up vector.
//     "Up" then can't be projected onto the view plane and the orientation is
//     degenerate (you get a blank/garbled or NaN view). The fix: pick an up that
//     lies in the floor plane. We use up = (0, 0, -1) so the back wall (-Z) is the
//     top of the image and the frame is stable and upright.
//
// (3) WHY CAPTURE IMMEDIATELY AFTER RENDER (drawing-buffer clearing).
//     WebGL is created with preserveDrawingBuffer:false by default, meaning the
//     canvas's pixel buffer is wiped once the browser composites the page (i.e.
//     after the current JS task yields). So we must read the pixels in the SAME
//     synchronous tick as renderer.render(): render, then toDataURL/drawImage
//     right away, with nothing async in between. A delayed read returns blank.
//     (If a setup ever does come back blank, the fallback is to construct the
//     WebGLRenderer with { preserveDrawingBuffer: true }.)

import * as THREE from "three";
import { ROOM_SIZE } from "./grid.js";
import { WALL_HEIGHT, FLOOR_HEIGHT } from "./room.js";

const MARGIN = 1.6; // breathing room around the 10x10 room so edge furniture isn't clipped
const MAX_SIZE = 1024; // cap the longest output edge (cheaper to send to the judge)

export function createCapture({ renderer, scene }) {
  // Build the overhead orthographic camera once; we tune its frustum per capture
  // to match the canvas aspect (so the image is never stretched).
  const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, ROOM_SIZE * 4);
  topCam.up.set(0, 0, -1); // the up-vector fix (see concept #2)

  // The active room's world offset — the birdseye is framed over THIS room so the
  // judge sees the room being designed, not the whole house.
  let roomOff = { x: 0, y: 0, z: 0 };
  function setActiveRoom(offset) {
    roomOff = offset;
  }

  // Size the ortho frustum to the current canvas aspect ratio. We keep the room
  // (half-width = ROOM_SIZE/2 + margin) fully visible on the SHORTER axis and let
  // the longer axis show a bit more background — frustum aspect == canvas aspect,
  // so pixels stay square and nothing is distorted.
  function frameToAspect() {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const aspect = w / h;
    const half = ROOM_SIZE / 2 + MARGIN;
    let halfW = half;
    let halfH = half;
    if (aspect >= 1) halfW = half * aspect; // landscape: widen horizontally
    else halfH = half / aspect; // portrait: extend vertically
    topCam.left = -halfW;
    topCam.right = halfW;
    topCam.top = halfH;
    topCam.bottom = -halfH;
    topCam.updateProjectionMatrix();
  }

  // Render the clean top-down view and return it as a base64 PNG. Returns null
  // if something goes wrong (capture should never break the game flow).
  function captureScreenshot() {
    const hidden = [];

    try {
      // Aim straight down at the ACTIVE room's centre. CRUCIAL for the multi-floor
      // house: place the camera in the gap between this room's wall-tops and the
      // floor of the room ABOVE, and clip the far plane to just past this room's
      // floor — otherwise the upstairs floor occludes the top-down view (and the
      // downstairs room would show through). So each birdseye shows only its room.
      const camY = roomOff.y + (WALL_HEIGHT + FLOOR_HEIGHT) / 2; // between ceiling & floor above
      topCam.position.set(roomOff.x, camY, roomOff.z);
      topCam.lookAt(roomOff.x, roomOff.y, roomOff.z);
      topCam.near = 0.1;
      topCam.far = camY - roomOff.y + 0.6; // reach this floor (+ a little grass), not the one below

      // Hide everything that shouldn't be judged: all gridlines, and any transient
      // mesh (ghost preview / highlight) flagged to be excluded.
      scene.traverse((obj) => {
        if (obj.userData && (obj.userData.isGrid || obj.userData.excludeFromCapture) && obj.visible) {
          obj.visible = false;
          hidden.push(obj);
        }
      });

      frameToAspect();
      renderer.render(scene, topCam); // draw the birdseye to the canvas buffer

      // Read IMMEDIATELY (concept #3). We downscale by drawing the WebGL canvas
      // onto a 2D canvas — drawImage reads the live buffer synchronously, same as
      // toDataURL, but lets us cap the size in one step.
      const srcW = renderer.domElement.width;
      const srcH = renderer.domElement.height;
      const scale = Math.min(1, MAX_SIZE / Math.max(srcW, srcH));
      const outW = Math.max(1, Math.round(srcW * scale));
      const outH = Math.max(1, Math.round(srcH * scale));

      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      out.getContext("2d").drawImage(renderer.domElement, 0, 0, outW, outH);
      return out.toDataURL("image/png");
    } catch (err) {
      console.error("captureScreenshot failed:", err);
      return null;
    } finally {
      // Restore visibility so the normal interactive view is untouched. The main
      // render loop keeps using the perspective camera, so nothing else to undo.
      hidden.forEach((obj) => (obj.visible = true));
    }
  }

  return { captureScreenshot, setActiveRoom, _topCam: topCam };
}
