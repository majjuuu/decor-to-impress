# How to add screenshots + a demo video

The game runs in your browser, so the best media is captured by *you* while playing.
This guide shows the easiest way to add both to the README.

> Start the game first: `cd client && npm run dev`, then open **http://localhost:5180**.

---

## A. Screenshots

**Capture**
- **Windows:** `Win + Shift + S` (snip a region) or `PrtSc` (full screen).
- **Mac:** `Cmd + Shift + 4` (region) or `Cmd + Shift + 3` (full screen).

**Suggested shots** (save each into this folder, `docs/screenshots/`):

| Save as | What to capture |
|---|---|
| `picker.png` | The "Create your character" screen (avatar in the 3D preview) |
| `design.png` | First-person view while placing furniture in a room |
| `explore.png` | Third-person (👁 button) out in the neighborhood |
| `result.png` | The AI judge's results screen with the score bars |

**Wire them into the README**
1. Drop the PNGs into this folder.
2. Open `README.md`, find the **Screenshots** block, and **uncomment** the table
   (delete the `<!--` and `-->` around it). Adjust names if you used different ones.

---

## B. Demo video (the easy GitHub way)

GitHub can host and play a video for you — no need to commit a big file.

**Record** (~30–60 seconds is plenty). A nice flow to show:
1. Create your character → **Let's play!**
2. Place a few pieces of furniture (first person)
3. Hit **Done** and show the AI score
4. Press **👁** for third person, walk outside, and enter a neighbor's show house

- **Windows:** `Win + G` (Xbox Game Bar) → record. Or `Win + Alt + R` to start/stop.
- **Mac:** `Cmd + Shift + 5` → Record.

**Embed it**
1. On the repo, open **Issues → New issue** (you do *not* have to submit it).
2. **Drag your video file into the comment box.** GitHub uploads it and inserts a
   link like `https://github.com/user-attachments/assets/abc123...`.
3. Copy that URL, open `README.md`, and paste it on its own line in the **Demo**
   section (replacing the `PASTE-VIDEO-URL-HERE` placeholder). Delete the surrounding
   `<!-- -->`. GitHub will render a video player.

**Alternative — a GIF in the repo:** convert your clip to a GIF (e.g. ezgif.com),
save it here as `demo.gif`, and add `![demo](docs/screenshots/demo.gif)` to the
Demo section. Keep GIFs small (< ~10 MB) so the page loads fast.

---

## C. Commit your media

Once the files are in place and the README is updated:

```bash
cd "C:\!Claude_Erica\RoomDesigner"
git add -A
git commit -m "Add screenshots and demo video to README"
git push
```

(Or just tell Claude "I added the screenshots" and it will wire them in and push.)
