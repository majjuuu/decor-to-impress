# Sharing Décor to Impress online (Vercel)

This deploys the game to a free public URL you can send to friends. The AI judge
runs as a tiny serverless function that holds **your** Anthropic API key — the key
stays on the server and is never shipped to the browser.

Everything that gets deployed lives in the **`client/`** folder (the game + the
`client/api/judge.js` function). The `server/` folder is the old local-only server
and is NOT needed for the deploy.

---

## Step 0 — Protect your wallet (do this first)

Friends' rounds use **your** key, so set a hard cap so it can never surprise you:

1. Go to **console.anthropic.com → Settings → Limits (or Billing)**.
2. Set a **monthly spend limit** (e.g. $5). The judge uses Claude Haiku — roughly
   a fraction of a cent per round — so $5 is hundreds of rounds, but the cap means
   you're never exposed to more than that.

---

## Step 1 — Deploy with the Vercel CLI (fastest, no GitHub needed)

Open a terminal **in the client folder**:

```
cd "C:\!Claude_Erica\RoomDesigner\client"
npx vercel login        # opens your browser to sign in / make a free account
npx vercel              # deploy — accept the defaults (it detects Vite)
```

When prompted:
- "Set up and deploy?" → **Yes**
- "Which scope?" → your account
- "Link to existing project?" → **No**
- Project name → press Enter (or pick a name)
- "In which directory is your code located?" → **`./`** (you're already in client)
- It auto-detects **Vite** — accept the build settings.

## Step 2 — Add your API key as a secret

```
npx vercel env add ANTHROPIC_API_KEY
```
- Paste your key (the one from `server/.env`) when asked.
- Select **Production** (you can also add Preview + Development).

Then redeploy so the key takes effect, and publish to the public URL:
```
npx vercel --prod
```

Vercel prints a URL like `https://room-designer-xxxx.vercel.app` — **that's the
link to share.** 🎉

---

## Alternative — GitHub + Vercel dashboard (auto-redeploys on every change)

1. Put the project on GitHub (the `.gitignore` already excludes your key + node_modules):
   ```
   cd "C:\!Claude_Erica\RoomDesigner"
   git init && git add . && git commit -m "Décor to Impress"
   ```
   Create a repo on github.com and push (follow GitHub's "push existing repo" steps).
2. On **vercel.com → Add New Project → Import** your repo.
3. Set **Root Directory = `client`**.
4. Under **Environment Variables**, add `ANTHROPIC_API_KEY` = your key.
5. Click **Deploy**. Future `git push`es redeploy automatically.

---

## Notes

- **Your key is safe**: it's only ever read by the serverless function on Vercel's
  servers. It is never in the downloaded game code, and `.gitignore` keeps it out
  of GitHub. (Never paste your key into the game's frontend or share it directly.)
- **To update the live game later**: run `npx vercel --prod` again (CLI), or just
  `git push` (GitHub path).
- **If the judge says "unavailable" on the live site**: the `ANTHROPIC_API_KEY`
  env var probably isn't set (or you didn't redeploy after adding it).
