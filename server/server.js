// =============================================================================
// server.js — the AI-judge proxy (Node + Express)
// =============================================================================
//
// WHY THIS PROXY EXISTS (the whole point of the milestone):
// Calling api.anthropic.com requires a secret API key. If the browser called the
// API directly, that key would have to ship in the frontend bundle — visible to
// anyone via "View Source" or the Network tab, and trivially stolen and abused.
// So the key lives ONLY here, on the server, loaded from an env var. The browser
// talks to OUR endpoint (/api/judge); this server adds the key and forwards the
// request to Anthropic. The key never touches the client.
//
// FLOW: client POSTs { themePrompt, imageBase64, requiredItems, placedItems }
//   -> we build the rubric prompt + image block, call Anthropic with the key
//   -> we defensively parse the model's JSON and return clean { scores, total, critique }.

import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJudgePrompt } from "./judgePrompt.js";

dotenv.config(); // loads .env into process.env (the key is read from there)

const API_KEY = process.env.ANTHROPIC_API_KEY;
// A key is only usable if it's present, isn't the .env.example placeholder, and
// looks like a real Anthropic key — otherwise we give a clear "add your key"
// message instead of forwarding a bogus key and getting a confusing 401.
const HAS_KEY = !!API_KEY && API_KEY.startsWith("sk-ant-") && !API_KEY.includes("your-key-here");
const PORT = process.env.PORT || 8787;
// claude-haiku-4-5: fast, cheap, supports image input — good for scoring.
// Swap to claude-sonnet-4-6 for sharper aesthetic judgment (one line).
const MODEL = "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SCORE_KEYS = ["completeness", "clutter", "coherence", "composition", "theme"];

const app = express();
// Base64 PNGs are large; bump the JSON body limit so the image fits.
app.use(express.json({ limit: "12mb" }));

app.post("/api/judge", async (req, res) => {
  try {
    if (!HAS_KEY) {
      // Clean error the frontend can show — not a crash.
      return res.status(500).json({
        error: "No API key on the server. Add ANTHROPIC_API_KEY to server/.env and restart it.",
      });
    }

    const { themePrompt, imageBase64, requiredItems = [], placedItems = [] } = req.body || {};
    if (!themePrompt || !imageBase64) {
      return res.status(400).json({ error: "Missing themePrompt or imageBase64." });
    }

    // The frontend's toDataURL() yields "data:image/png;base64,XXXX". The API's
    // image block wants ONLY the raw base64 ("XXXX"), so strip the data-URL prefix.
    const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = buildJudgePrompt({ themePrompt, requiredItems, placedItems });

    // The user message carries TWO content blocks: the image, then the text.
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
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
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: rawBase64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error("Anthropic API error", anthropicRes.status, detail.slice(0, 500));
      return res.status(502).json({ error: "The judge service returned an error." });
    }

    const data = await anthropicRes.json();

    // ---- Two-layer parse --------------------------------------------------
    // Layer 1: the API ENVELOPE. Anthropic returns { content: [{type:"text",
    // text:"..."}] }. The model's JSON is the STRING inside content[0].text.
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string") {
      console.error("Unexpected envelope:", JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: "Unexpected response from the judge." });
    }

    // Layer 2: parse THAT string into our score object (defensively).
    const parsed = parseJudgeJson(text);
    if (!parsed) {
      console.error("Could not parse model text:", text.slice(0, 500));
      return res.status(502).json({ error: "The judge's response could not be read." });
    }

    return res.json(parsed);
  } catch (err) {
    console.error("judge endpoint crashed:", err);
    return res.status(500).json({ error: "The judge is unavailable." });
  }
});

// -----------------------------------------------------------------------------
// Defensive parser: model text -> validated { scores, total, critique }.
// WHY: LLMs sometimes wrap JSON in ```json fences or add a stray sentence. We
// strip fences, fall back to grabbing the first {...} block, JSON.parse in a
// try/catch, and VALIDATE the shape (all five scores present and numeric). On any
// failure we return null so the caller responds with a clean error, never a crash.
// Exported so it can be unit-tested without hitting the network.
// -----------------------------------------------------------------------------
export function parseJudgeJson(text) {
  let t = String(text).trim();
  // strip a leading ```json / ``` fence and a trailing ``` fence if present
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let obj = tryParse(t);
  if (!obj) {
    // fallback: extract the first {...} block from any surrounding prose
    const match = t.match(/\{[\s\S]*\}/);
    if (match) obj = tryParse(match[0]);
  }
  if (!obj || typeof obj !== "object" || !obj.scores) return null;

  // every score must be present and numeric
  for (const key of SCORE_KEYS) {
    if (typeof obj.scores[key] !== "number" || Number.isNaN(obj.scores[key])) return null;
  }

  // clamp to 0-5 integers and recompute total ourselves (don't trust the model's sum)
  const scores = {};
  for (const key of SCORE_KEYS) {
    scores[key] = Math.max(0, Math.min(5, Math.round(obj.scores[key])));
  }
  const total = SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0);
  const critique =
    typeof obj.critique === "string" && obj.critique.trim()
      ? obj.critique.trim()
      : "No critique provided.";

  return { scores, total, critique };
}

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Don't start the HTTP listener when this file is imported for unit tests.
// Compare resolved paths (robust on Windows, where the file:// URL form differs).
const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMain = thisFile.toLowerCase() === invokedFile.toLowerCase();
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Judge proxy listening on http://localhost:${PORT}`);
    if (HAS_KEY) {
      console.log("ANTHROPIC_API_KEY loaded — judge is ready.");
    } else {
      console.warn("WARNING: no valid ANTHROPIC_API_KEY — add it to server/.env and restart. /api/judge will error until then.");
    }
  });
}

export { app };
