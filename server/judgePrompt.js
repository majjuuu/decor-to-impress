// =============================================================================
// judgePrompt.js — the rubric prompt, centralized so it's easy to tune
// =============================================================================
//
// Keeping the prompt in one place (server-side) means Milestone 7 can pass
// different themes/required items per room without any prompt changes, and we can
// iterate on judging quality without touching the endpoint or the client.
//
// The prompt does three jobs:
//   1. Give the model context (it's a design judge; here's the theme + the items).
//   2. Define each 0–5 criterion so scores are consistent.
//   3. Demand ONLY JSON in an exact shape — no prose, no markdown fences — so the
//      client can parse it reliably. (We still parse defensively; models stray.)

export function buildJudgePrompt({ themePrompt, requiredItems = [], placedItems = [] }) {
  const required = requiredItems.length ? requiredItems.join(", ") : "none specified";
  const placed = placedItems.length
    ? placedItems.map((p) => `${p.count}x ${p.name}`).join(", ")
    : "nothing was placed";

  return `You are an interior-design judge for a furniture-arranging game.

The attached image is a TOP-DOWN birdseye of a single room. Furniture is shown as simple coloured blocks (this is a prototype), so judge LAYOUT, balance, spacing, and how well the choices fit the theme — not the art quality of the boxes.

Theme for this round: "${themePrompt}".
Required items for this room: ${required}.
Items the player actually placed: ${placed}.

Score each criterion from 0 to 5 (integers):
- completeness: are the required items present and is it a sensible, furnished room (not empty)?
- clutter: balance — 5 = well-judged amount, low = nearly empty OR overcrowded.
- coherence: do the pieces/colours work together for this theme?
- composition: is there a clear arrangement — a focal point, symmetry, or sensible flow?
- theme: how strongly does the layout match the theme "${themePrompt}"?

Respond with ONLY a JSON object — no prose, no explanation, no markdown code fences — in EXACTLY this shape, with each score an integer 0-5 and a single short sentence of critique:
{"scores":{"completeness":0,"clutter":0,"coherence":0,"composition":0,"theme":0},"total":0,"critique":"one short sentence"}`;
}
