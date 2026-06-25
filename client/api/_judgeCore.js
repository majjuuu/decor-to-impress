// =============================================================================
// _judgeCore.js — judge logic (shared by local dev middleware + deployed function)
// =============================================================================
// The leading underscore tells Vercel this is a helper, NOT an API route. The API
// key is read from the environment by the caller and passed in; it never reaches
// the browser bundle.

import { buildJudgePrompt } from "./_judgePrompt.js";

const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const SCORE_KEYS = ["completeness", "clutter", "coherence", "composition", "theme"];

// Transient HTTP statuses worth retrying (rate limit / overloaded / server errors).
// 400/401/403/404 are the caller's fault and are NOT retried — they'd just fail again.
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 3; // total tries before giving up
const TIMEOUT_MS = 20000; // abort a single hung request after this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Exponential backoff with a little jitter: ~0.5s, ~1s, ... capped at 5s.
const backoffMs = (attempt) => Math.min(500 * 2 ** (attempt - 1), 5000) + Math.floor(Math.random() * 250);

export function keyLooksValid(apiKey) {
  return !!apiKey && apiKey.startsWith("sk-ant-") && !apiKey.includes("your-key-here");
}

// DEMO MODE: when no API key is configured (e.g. a free public deploy), the judge
// returns a quick heuristic score instead of an error, so the game is still fully
// playable at zero cost. It loosely rewards placing the required items + a sensible
// amount of furniture. `demo: true` lets the UI note it's not a real AI score.
function demoResult({ requiredItems = [], placedItems = [] }) {
  const count = placedItems.reduce((s, p) => s + (p.count || 1), 0);
  const names = placedItems.map((p) => p.name);
  const hasRequired = requiredItems.every((r) => names.includes(r));
  const base = Math.min(5, 2 + Math.round(count / 2)); // more pieces -> higher, capped
  const clamp = (n) => Math.max(0, Math.min(5, n));
  const scores = {
    completeness: clamp(hasRequired ? base + 1 : base - 2),
    clutter: clamp(count === 0 ? 0 : count > 9 ? 2 : base),
    coherence: clamp(base),
    composition: clamp(count === 0 ? 0 : base - 1),
    theme: clamp(base),
  };
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return {
    scores,
    total,
    critique: "Demo score — add an API key to enable real AI judging.",
    demo: true,
  };
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
// Never throws. Retries transient failures (rate limits, overload, server errors,
// network blips, and unparseable replies) with exponential backoff — these are the
// usual cause of intermittent "judge unavailable" errors, and a single retry clears
// almost all of them. Permanent failures (bad key, bad request) fail fast.
export async function judge({ apiKey, themePrompt, imageBase64, requiredItems = [], placedItems = [] }) {
  if (!keyLooksValid(apiKey)) {
    // No key -> demo mode (zero cost) instead of an error.
    return { status: 200, data: demoResult({ requiredItems, placedItems }) };
  }
  if (!themePrompt || !imageBase64) {
    return { status: 400, error: "Missing themePrompt or imageBase64." };
  }

  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const prompt = buildJudgePrompt({ themePrompt, requiredItems, placedItems });
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 600, // small JSON reply; headroom so it never truncates mid-object
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: rawBase64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  let lastError = "The judge is unavailable.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(backoffMs(attempt - 1));

    // Abort a single request if it hangs, so a stuck call doesn't block the player.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      lastError = "Could not reach the judge service.";
      console.error(`judge: network error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err && err.message);
      continue; // network error / timeout -> retry
    }
    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`Anthropic API error ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}):`, detail.slice(0, 300));
      // Permanent failures: don't waste retries.
      if (res.status === 401 || res.status === 403) return { status: 502, error: "The judge's API key was rejected — check ANTHROPIC_API_KEY." };
      if (res.status === 400 || res.status === 404) return { status: 502, error: "The judge request was invalid." };
      if (RETRYABLE.has(res.status)) {
        lastError = res.status === 429 ? "The judge is busy right now." : "The judge service is temporarily overloaded.";
        // Honour Retry-After on rate limits (capped so the player isn't left waiting).
        const ra = Number(res.headers.get("retry-after"));
        if (res.status === 429 && ra > 0) await sleep(Math.min(ra * 1000, 6000));
        continue;
      }
      lastError = "The judge service returned an error.";
      continue;
    }

    let data;
    try { data = await res.json(); } catch { lastError = "The judge sent an unreadable response."; continue; }
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string") { lastError = "Unexpected response from the judge."; continue; }
    const parsed = parseJudgeJson(text);
    if (!parsed) {
      // The model occasionally returns prose instead of clean JSON — retrying usually fixes it.
      lastError = "The judge's response could not be read.";
      console.error("judge: parse failed:", text.slice(0, 200));
      continue;
    }
    return { status: 200, data: parsed };
  }

  return { status: 502, error: `${lastError} Please try again.` };
}
