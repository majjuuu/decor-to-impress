// =============================================================================
// ui.js — the DOM catalog panel layered over the 3D canvas
// =============================================================================
//
// The game UI is plain HTML/CSS sitting on top of the WebGL canvas (no
// framework). This module builds the catalog panel and reports clicks back via
// an onSelect callback. It keeps NO game logic — main.js owns selection (and
// calls setSelected() to keep the highlight in sync) and the game tells it which
// items the CURRENT room offers via setItems() (Milestone 7b).

// Turn a numeric colour (0xRRGGBB) into a CSS hex string for the swatch.
function cssColor(hex) {
  return "#" + hex.toString(16).padStart(6, "0");
}

// Quick-pick palette shown as swatches; the colour wheel (native picker) covers
// everything in between.
const PRESETS = [
  0xffffff, 0xe8c39e, 0x8d6e63, 0xe05a5a, 0xf2a93b, 0xf2d04a, 0x6fcf73, 0x5e9cff,
  0xb968d6, 0x37474f,
];

export function buildCatalogUI({ onSelect, onColorChange, onWallColorChange }) {
  const panel = document.createElement("div");
  panel.className = "catalog";

  const title = document.createElement("h2");
  title.className = "catalog__title";
  title.textContent = "Catalog";
  panel.appendChild(title);

  const hint = document.createElement("p");
  hint.className = "catalog__hint";
  hint.textContent =
    "You're in first person: WASD to walk, drag to look, Space to jump. Pick an item, then click the floor to place it. R rotates · Esc deselects · click a placed piece (nothing selected) to delete.";
  panel.appendChild(hint);

  // The list of item buttons lives in its own container so we can rebuild it per
  // room without touching the title/hint.
  const list = document.createElement("div");
  list.className = "catalog__list";
  panel.appendChild(list);

  // ---- Per-part colour picker ----------------------------------------------
  // Two rows: (1) which PART of the selected piece to colour (chips shown in each
  // part's natural colour so you can spot e.g. the blanket), (2) the NEW colour to
  // apply (presets + wheel + reset). We accumulate overrides into `workingColors`
  // (material name -> 0xRRGGBB) and forward the whole map to main.js -> placement.
  const colorSection = document.createElement("div");
  colorSection.className = "catalog__colors";
  colorSection.innerHTML = `
    <p class="catalog__sublabel">Color parts</p>
    <p class="catalog__hint catalog__colorhint">Select a piece to color its parts.</p>
    <div class="parts"></div>
    <div class="swatches"></div>
  `;
  const partsRow = colorSection.querySelector(".parts");
  const swatchRow = colorSection.querySelector(".swatches");
  const colorHint = colorSection.querySelector(".catalog__colorhint");
  panel.appendChild(colorSection);

  const ALL = "*"; // pseudo-part meaning "every part"
  let parts = []; // [{ name, color }] for the active item
  let currentPart = ALL; // which part the colour buttons target
  let workingColors = {}; // material name -> 0xRRGGBB (the override map)

  function emit() {
    if (onColorChange) onColorChange({ ...workingColors });
  }

  // Apply a colour (or null = reset) to the currently-targeted part.
  function applyColor(color) {
    if (currentPart === ALL) {
      if (color == null) workingColors = {};
      else for (const p of parts) workingColors[p.name] = color;
    } else if (color == null) {
      delete workingColors[currentPart];
    } else {
      workingColors[currentPart] = color;
    }
    emit();
  }

  // Build the "new colour" buttons (reset + presets + wheel). Built once.
  function buildSwatches() {
    swatchRow.innerHTML = "";
    const reset = document.createElement("button");
    reset.className = "swatch swatch--original";
    reset.title = "Reset to original";
    reset.textContent = "↺";
    reset.addEventListener("click", () => applyColor(null));
    swatchRow.appendChild(reset);

    for (const preset of PRESETS) {
      const sw = document.createElement("button");
      sw.className = "swatch";
      sw.style.background = cssColor(preset);
      sw.title = cssColor(preset);
      sw.addEventListener("click", () => applyColor(preset));
      swatchRow.appendChild(sw);
    }

    const wheel = document.createElement("label");
    wheel.className = "swatch swatch--wheel";
    wheel.title = "Custom color";
    const wheelInput = document.createElement("input");
    wheelInput.type = "color";
    wheelInput.value = "#5e9cff";
    wheelInput.addEventListener("input", () => applyColor(parseInt(wheelInput.value.slice(1), 16)));
    wheel.appendChild(wheelInput);
    swatchRow.appendChild(wheel);
  }
  buildSwatches();

  function selectPart(name) {
    currentPart = name;
    partsRow.querySelectorAll(".part-chip").forEach((c) => c.classList.toggle("is-active", c.dataset.part === name));
  }

  // Rebuild the part chips for the selected item's parts. Resets overrides so each
  // piece you select starts from its original colours (predictable mental model).
  function setItemParts(itemParts) {
    parts = itemParts || [];
    workingColors = {};
    currentPart = ALL;
    partsRow.innerHTML = "";

    if (parts.length === 0) {
      colorHint.style.display = "block";
      swatchRow.style.display = "none";
      emit();
      return;
    }
    colorHint.style.display = "none";
    swatchRow.style.display = "flex";

    // "All" chip first, then one chip per part shown in its natural colour.
    const allChip = document.createElement("button");
    allChip.className = "part-chip is-active";
    allChip.dataset.part = ALL;
    allChip.textContent = "All";
    allChip.addEventListener("click", () => selectPart(ALL));
    partsRow.appendChild(allChip);

    for (const part of parts) {
      const chip = document.createElement("button");
      chip.className = "part-chip part-chip--swatch";
      chip.dataset.part = part.name;
      chip.style.background = part.color;
      chip.title = part.name;
      chip.addEventListener("click", () => selectPart(part.name));
      partsRow.appendChild(chip);
    }
    emit(); // start from original (empty map)
  }

  // ---- Wall colour picker (applies live to the active room's walls) ---------
  const wallSection = document.createElement("div");
  wallSection.className = "catalog__colors";
  wallSection.innerHTML = `<p class="catalog__sublabel">Wall color</p><div class="swatches wallswatches"></div>`;
  const wallRow = wallSection.querySelector(".wallswatches");
  panel.appendChild(wallSection);

  const WALL_PRESETS = [0xe8e4dc, 0xf2d9c4, 0xcfe3d0, 0xcdddf2, 0xf2cfd8, 0xe8d9a8, 0x9aa7b4, 0x6d7a8c];
  const wallReset = document.createElement("button");
  wallReset.className = "swatch swatch--original";
  wallReset.title = "Default wall colour";
  wallReset.textContent = "↺";
  wallReset.addEventListener("click", () => onWallColorChange && onWallColorChange(0xe8e4dc));
  wallRow.appendChild(wallReset);
  for (const preset of WALL_PRESETS) {
    const sw = document.createElement("button");
    sw.className = "swatch";
    sw.style.background = cssColor(preset);
    sw.addEventListener("click", () => onWallColorChange && onWallColorChange(preset));
    wallRow.appendChild(sw);
  }
  const wallWheel = document.createElement("label");
  wallWheel.className = "swatch swatch--wheel";
  wallWheel.title = "Custom wall colour";
  const wallWheelInput = document.createElement("input");
  wallWheelInput.type = "color";
  wallWheelInput.value = "#e8e4dc";
  wallWheelInput.addEventListener("input", () => onWallColorChange && onWallColorChange(parseInt(wallWheelInput.value.slice(1), 16)));
  wallWheel.appendChild(wallWheelInput);
  wallRow.appendChild(wallWheel);

  document.body.appendChild(panel);

  let buttonsById = {};

  // (Re)build the buttons for the given catalog items — called whenever a room
  // loads, so the catalog always shows that room's available furniture.
  function setItems(items) {
    list.innerHTML = "";
    buttonsById = {};
    for (const item of items) {
      const btn = document.createElement("button");
      btn.className = "catalog__item";
      btn.dataset.id = item.id;

      const swatch = document.createElement("span");
      swatch.className = "catalog__swatch";
      swatch.style.background = cssColor(item.color);

      const label = document.createElement("span");
      label.className = "catalog__label";
      const fp = item.footprint;
      label.textContent = `${item.name} (${fp.rows}×${fp.cols})`;

      btn.append(swatch, label);
      btn.addEventListener("click", () => onSelect(item));
      list.appendChild(btn);
      buttonsById[item.id] = btn;
    }
  }

  // Update the visual highlight to match the given id (or clear it for null).
  function setSelected(id) {
    for (const [itemId, btn] of Object.entries(buttonsById)) {
      btn.classList.toggle("is-active", itemId === id);
    }
  }

  // Show/hide the whole panel — the game shows it only during DESIGN. (Input is
  // also gated in placement.js, so hiding is purely cosmetic, not the gate.)
  function setVisible(visible) {
    panel.style.display = visible ? "block" : "none";
  }

  return { setItems, setSelected, setVisible, setItemParts };
}
