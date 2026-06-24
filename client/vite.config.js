import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { judge } from "./api/_judgeCore.js";

// Load the API key from server/.env (the existing key file) into this Node
// process. It stays server-side — Vite never bundles process.env into the client.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../server/.env") });

// In-process judge: instead of a separate Express server the user has to keep
// running, the judge lives INSIDE the Vite dev server as middleware. So just
// `npm run dev` and the judge works — nothing else to launch. The browser still
// fetches "/api/judge" (same origin), and the key never leaves Node.
function judgeApiPlugin() {
  return {
    name: "judge-api",
    configureServer(server) {
      server.middlewares.use("/api/judge", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          const send = (status, obj) => {
            res.statusCode = status;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(obj));
          };
          let payload;
          try {
            payload = JSON.parse(body);
          } catch {
            return send(400, { error: "Invalid request body." });
          }
          const result = await judge({
            apiKey: process.env.ANTHROPIC_API_KEY,
            themePrompt: payload.themePrompt,
            imageBase64: payload.imageBase64,
            requiredItems: payload.requiredItems,
            placedItems: payload.placedItems,
          });
          if (result.status === 200) return send(200, result.data);
          return send(result.status, { error: result.error });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [judgeApiPlugin()],
  server: {
    port: 5180,
    strictPort: true,
  },
});
