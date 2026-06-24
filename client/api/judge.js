// =============================================================================
// api/judge.js — the deployed judge endpoint (a Vercel serverless function)
// =============================================================================
//
// On the hosted site this file becomes the POST /api/judge endpoint. It reads the
// secret ANTHROPIC_API_KEY from the host's environment variables (set in the
// Vercel dashboard) — the key lives only here on the server, never in the browser
// bundle. Locally, the same judge logic runs as Vite dev middleware (vite.config).

import { judge } from "./_judgeCore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Vercel usually parses JSON into req.body; fall back to reading the stream.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body) {
    body = await new Promise((resolve) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
      req.on("error", () => resolve(null));
    });
  }
  if (!body) {
    res.status(400).json({ error: "Invalid request body." });
    return;
  }

  const result = await judge({
    apiKey: process.env.ANTHROPIC_API_KEY,
    themePrompt: body.themePrompt,
    imageBase64: body.imageBase64,
    requiredItems: body.requiredItems,
    placedItems: body.placedItems,
  });
  res.status(result.status).json(result.status === 200 ? result.data : { error: result.error });
}
