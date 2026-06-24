// =============================================================================
// judge.js — the single frontend seam to the AI judge
// =============================================================================
//
// This is the ONLY place the client talks to the backend. It POSTs to /api/judge
// (our own Express proxy), never to api.anthropic.com — the API key lives on the
// server and never reaches the browser. Milestone 7 reuses this unchanged; it
// just passes different themes/requiredItems per room.
//
// Returns the parsed { scores, total, critique } on success. Throws an Error with
// a friendly message on any failure so the caller can show a fallback instead of
// breaking.

export async function requestJudgeScore(image, theme, requiredItems, placedItems) {
  // Combine name + tagline so the judge has the full sense of the theme.
  const themePrompt = `${theme.name} — ${theme.tagline}`;

  let res;
  try {
    res = await fetch("/api/judge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        themePrompt,
        imageBase64: image, // full data URL; the server strips the prefix
        requiredItems,
        placedItems,
      }),
    });
  } catch {
    // network/refused (e.g. server not running)
    throw new Error("Can't reach the judge — is the server running?");
  }

  if (!res.ok) {
    let message = "The judge is unavailable.";
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      /* response wasn't JSON; keep the default message */
    }
    throw new Error(message);
  }

  return res.json(); // { scores, total, critique }
}
