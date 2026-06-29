# Décor to Impress

*Style the room, wow the AI judge.*

A browser game where you furnish rooms in a procedurally generated house under a
5‑minute timer to match a theme — then an AI judge scores your design.

Built with **Three.js** (vanilla, no framework) for the 3D, a small **serverless
backend** that proxies the Anthropic API for the AI judge, and a procedural house
generator. Inspired by the "design under pressure, then get rated" loop.

## Features

- **Play as your own avatar** — create a character on a live 3D picker (female/male,
  six skin tones, five outfits each); everyone shares the same face.
- **First‑person room design** — you're *inside* the room: walk, look around, jump,
  and place/rotate/delete furniture on a grid with ghost previews and collision.
- **Explore mode** — toggle a 3rd‑person follow camera, walk out the front door, and
  roam an endless, fog‑faded neighborhood; step into auto‑decorated "show houses"
  (the view snaps to first‑person inside) — and you bump into walls and furniture.
- **A whole house** — an open‑front "dollhouse" with multiple floors (each with a
  bathroom), a pitched roof, and a fenced front garden; finished rooms stay
  decorated next door.
- **Procedurally generated houses** — every house is a fresh mix of room types and
  themes; clear one and move to the next.
- **AI judge** — the room's top‑down birdseye is sent to an AI vision model that
  scores it on five rubric criteria and writes a one‑line critique (with retries so
  a transient API hiccup doesn't fail the round).
- **Customization** — recolor individual furniture parts, repaint walls, place
  wall‑mounted windows/clickable‑to‑open doors/shelves, rugs, small decor on
  shelves and tables, and movable room dividers.
- **Game feel** — sound effects, a last‑30‑seconds audio/visual shift, and an
  animated results reveal.

## Controls

- **WASD / arrow keys** — walk · **drag mouse** — look around · **Space** — jump
- Pick an item from the catalog, then **click the floor** to place it · **R** rotate
  · **Esc** deselect · **click a door** to open it · (nothing selected) **click a
  piece** to delete it
- **👁 button** — toggle first‑person ⇄ third‑person · **Done** — submit for scoring

## Tech

- Three.js (WebGL) · vanilla JS · Vite
- Anthropic Messages API (vision) via a serverless function (key stays server‑side)
- CC0 3D models & audio from [Kenney](https://kenney.nl)

## Run locally

```bash
cd client
npm install
npm run dev      # http://localhost:5180
```

The AI judge needs an Anthropic API key. Create `server/.env` with:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, the game runs in **demo mode** (placeholder scores) so everything is
still playable.

## Deploy

See [DEPLOY.md](DEPLOY.md) — one‑command deploy to Vercel (static game + a
serverless judge function), with the API key stored as an environment variable.

## Credits

3D furniture models and sound effects by [Kenney](https://kenney.nl) (CC0).
