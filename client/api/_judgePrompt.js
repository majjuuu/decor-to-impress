// =============================================================================
// _judgePrompt.js — the rubric prompt (shared by local dev + deployed function)
// =============================================================================
// The leading underscore tells Vercel this is a helper, NOT an API route.

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
