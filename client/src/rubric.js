// =============================================================================
// rubric.js — the scoring rubric shape (and a placeholder result for now)
// =============================================================================
//
// The judge (Milestone 6) scores five criteria 0–5; the total is their sum
// (max 25). Defining the criteria + the result SHAPE here in one place means the
// RESULT screen and the future judge agree on the contract, and M6 only has to
// fill in real numbers — no screen rework.

export const CRITERIA_LABELS = {
  completeness: "Completeness",
  clutter: "Clutter balance",
  coherence: "Color / theme coherence",
  composition: "Focal point / composition",
  theme: "Theme adherence",
};

// Placeholder result used until the real AI judge lands in Milestone 6.
// Same shape the judge will return: { scores, total, critique }.
export function makePlaceholderResult() {
  const scores = {
    completeness: 4,
    clutter: 3,
    coherence: 4,
    composition: 3,
    theme: 4,
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return {
    scores,
    total,
    critique: "Placeholder critique — the real AI judge arrives in Milestone 6.",
  };
}
