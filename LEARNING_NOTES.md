# 💻 Décor to Impress — Learning Notes

> A learning log for **Erica Ma**, a Computer Engineering student, kept alongside
> this browser game (Three.js + an AI judge). Newest entries on top. Terms in
> **bold** are worth memorizing.
>
> (A copy of the 2026-06-25 entry also lives in the shared Img2Geom log.)

---

## 2026-06-25 — Making the AI judge reliable (retries, timeouts, backoff)

**Problem:** the judge "failed too often." **Root cause:** the judge calls the
Anthropic API with raw **`fetch`**, which does **no automatic retries**. The
official SDK retries transient failures; raw fetch does not. So any one-off hiccup
became an instant "judge unavailable."

**Which failures are transient (and should be retried):**

- **429** rate limited · **529** overloaded · **500/502/503** server errors · a
  dropped network connection · the model occasionally replying with prose instead
  of clean JSON (a **parse failure**).

**Which are permanent (fail fast, don't retry):**

- **401/403** bad or rejected API key · **400/404** malformed request. Retrying
  these just fails again — so we return a clear message immediately.

**The fix** (`client/api/_judgeCore.js`): wrap the call in a retry loop —

```
for attempt in 1..3:
    send request (with a 20s AbortController timeout)
    if network error / timeout      -> wait, retry
    if status is permanent (401/400)-> return a clear error now
    if status is transient (429/529)-> wait (honor Retry-After), retry
    if reply won't parse as JSON    -> wait, retry
    else                            -> success
wait between tries = exponential backoff (~0.5s, ~1s) + jitter
```

**Concepts this teaches:**

- **Idempotent retries with exponential backoff.** Re-send a *safe-to-repeat*
  request, waiting longer each time (0.5s → 1s → 2s…) so you don't hammer a
  struggling server. **Jitter** (a little randomness) stops many clients retrying
  in lockstep (the "thundering herd").
- **Classify errors before reacting.** A **status code** tells you whether to
  retry (5xx/429) or give up (4xx). Don't blindly retry everything.
- **Timeouts via `AbortController`.** A hung request must be cancellable, or it
  blocks the user forever. Abort after N seconds and retry.
- **Validate model output, always.** LLMs are **probabilistic** — a retry often
  fixes a malformed reply, but you must detect "malformed" first (see the
  defensive JSON parse).
- **Libraries encode this knowledge.** The Anthropic SDK does all of the above for
  free; we re-implemented it because this is a tiny raw-`fetch` proxy. Lesson:
  know what your SDK gives you before hand-rolling.

---

## 2026-06-25 — How the AI judge works + project takeaways

> The single most important idea: **"AI" here is not magic inside your program. It
> is one HTTP request to a model on someone else's computer.** Your code prepares
> the question, sends it safely, and carefully reads the answer.

### How the judge works (follow the data)

```
You click "Done"
   │  game.js (a STATE MACHINE) enters the REVEAL state
   ▼
capture.js   renders a clean TOP-DOWN photo with an ORTHOGRAPHIC camera,
   │         hides the avatar/grid/scenery, reads pixels -> a base64 PNG
   ▼
judge.js (BROWSER)   fetch POST /api/judge { image, theme, items }
   │                 ❗ never calls Anthropic directly
   ▼
/api/judge (SERVER)  local = a Vite dev plugin; deployed = a Vercel function
   │                 reads the SECRET api key from the environment
   ▼
_judgeCore.js judge()  builds a rubric PROMPT, POSTs image + prompt to Anthropic
   ▼
Claude (vision model)  "looks" at the image, returns TEXT that should be JSON
   ▼
parseJudgeJson()   extracts {scores}, validates 5 numbers, clamps each 0-5
   ▼
back to the browser -> animated score bars
```

**What each step teaches:**

- **Client–server architecture.** The browser (*client*) is public and untrusted;
  the *server* holds secrets and trusted logic. They talk over **HTTP**.
- **Secrets stay server-side — always.** Anything in the browser can be read by
  anyone (View Source). The **API key** bills *your* account, so the browser calls
  *your own* `/api/judge` and only the server attaches the key.
- **HTTP / `fetch` / `async`–`await`.** A request has a **method** (`POST`),
  **headers**, a **body** (JSON). The reply has a **status code** (200 OK, 4xx
  your fault, 5xx server's fault). `fetch` returns a **Promise** (a value that
  arrives *later*); `await` waits without freezing the app.
- **Serverless + environment variables.** The deployed judge is one file the host
  (Vercel) runs on demand; the key is injected as `process.env.ANTHROPIC_API_KEY`,
  never committed to Git.
- **Multimodal model + prompt engineering.** You send an **image + a text prompt**
  defining a rubric and demanding strict JSON. Writing that well is "prompt
  engineering."
- **Never trust model output — validate it.** Strip code fences, find the `{…}`,
  check each score is a real number, clamp 0–5. **Validate all external input.**
- **Graceful degradation.** No key -> a cheap **demo-mode** heuristic instead of
  crashing. Good systems degrade, they don't die.

### Whole-project takeaways (CompE fundamentals)

- **Finite-State Machine** (`game.js`): exactly one state at a time + defined
  transitions — core to software *and* digital logic.
- **Separation of concerns / data-driven design**: one file per job; furniture &
  rooms are **data** (`catalog.js`, `rooms.js`), not code.
- **Render loop + delta time**: redraw ~60×/sec via `requestAnimationFrame`; scale
  motion by **dt** so speed is the same on any machine.
- **3D fundamentals**: scene graph; mesh = geometry + material; **perspective vs
  orthographic** cameras; transforms = position/rotation/scale via **matrices**.
- **Raycasting (picking)**: turn a 2D click into a 3D hit — how you place furniture
  and open doors.
- **Procedural generation**: houses, the endless neighborhood, and the avatar are
  built from rules + primitives.
- **Performance is measurable**: **draw calls** cost more than triangles;
  ~580 background houses render in **2 draw calls** via **InstancedMesh**; **fog**
  hides the world's edge; we measured **ms/frame**.
- **Real math**: vectors; **trig** (`sin`/`cos` for yaw→movement & limb swing);
  **AABB collision** (closest point on a box, push out by a radius); **lerp**;
  **gravity** (`v -= g·dt; y += v·dt`) for the jump.
- **Event-driven programming**: keyboard/pointer **events** drive everything.
- **Version control as a narrative**: one **Git commit** per feature, explaining
  *why*.
- **Verify & debug by measuring** (the biggest one): *don't assume — check.* Real
  bugs caught this way: a **paused `requestAnimationFrame`** (the preview tab was
  `document.hidden`), a **1×1 canvas** (sized before layout), and the judge
  failing because raw `fetch` never retried.

**One sentence to keep:** an "AI feature" is mostly *ordinary engineering* —
client/server boundaries, secrets, HTTP, async, validation, and retries — wrapped
around a single model call. The model is the easy part; the plumbing is the work.
