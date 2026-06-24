// =============================================================================
// judgeCore.js — the judge logic, runnable from anywhere (Express OR Vite plugin)
// =============================================================================
//
// Factored out so the same code powers both the standalone Express server and the
// in-process Vite dev middleware (so the game no longer needs a separate server).
// The API key stays server-side (Node) — it's read from the environment by the
// caller and passed in here; it never reaches the browser bundle.

import { buildJudgePrompt } from "./judgePrompt.js";

const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCORE_KEYS = ["completeness", "clutter", "coherence", "composition", "theme"];

export function keyLooksValid(apiKey) {
  return !!apiKey && apiKey.startsWith("sk-ant-") && !apiKey.includes("your-key-here");
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Defensive parse: strip fences, fall back to the first {...}, validate the five
// numeric scores, clamp 0-5, recompute the total. Returns null on any failure.
export function parseJudgeJson(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let obj = tryParse(t);
  if (!obj) {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]);
  }
  if (!obj || typeof obj !== "object" || !obj.scores) return null;
  for (const k of SCORE_KEYS) {
    if (typeof obj.scores[k] !== "number" || Number.isNaN(obj.scores[k])) return null;
  }
  const scores = {};
  for (const k of SCORE_KEYS) scores[k] = Math.max(0, Math.min(5, Math.round(obj.scores[k])));
  const total = SCORE_KEYS.reduce((sum, k) => sum + scores[k], 0);
  const critique =
    typeof obj.critique === "string" && obj.critique.trim() ? obj.critique.trim() : "No critique provided.";
  return { scores, total, critique };
}

// Run a judge request. Returns { status, data } on success or { status, error }.
// Never throws.
export async function judge({ apiKey, themePrompt, imageBase64, requiredItems = [], placedItems = [] }) {
  if (!keyLooksValid(apiKey)) {
    return { status: 500, error: "No API key on the server. Add ANTHROPIC_API_KEY to server/.env." };
  }
  if (!themePrompt || !imageBase64) {
    return { status: 400, error: "Missing themePrompt or imageBase64." };
  }

  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const prompt = buildJudgePrompt({ themePrompt, requiredItems, placedItems });

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: rawBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("judge: could not reach Anthropic:", err);
    return { status: 502, error: "Could not reach the judge service." };
  }

  if (!res.ok) {
    const detail = await res.text();
    console.error("Anthropic API error", res.status, detail.slice(0, 400));
    return { status: 502, error: "The judge service returned an error." };
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") {
    return { status: 502, error: "Unexpected response from the judge." };
  }
  const parsed = parseJudgeJson(text);
  if (!parsed) {
    return { status: 502, error: "The judge's response could not be read." };
  }
  return { status: 200, data: parsed };
}
