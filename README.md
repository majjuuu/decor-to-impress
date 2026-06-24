# Décor to Impress

*Style the room, wow the AI judge.*

A browser game where you furnish rooms in a procedurally generated house under a
5‑minute timer to match a theme — then an AI judge scores your design.

Built with **Three.js** (vanilla, no framework) for the 3D, a small **serverless
backend** that proxies the Anthropic API for the AI judge, and a procedural house
generator. Inspired by the "design under pressure, then get rated" loop.

## Features

- **Real‑time 3D room design** — orbit the camera, place/rotate/delete furniture on
  a grid with ghost previews and collision checking.
- **A whole house** — an open‑front "dollhouse" with multiple floors (each with a
  bathroom), a pitched roof, and a garden; finished rooms stay decorated next door.
- **Procedurally generated houses** — every house is a fresh mix of room types and
  themes; clear one and move to the next.
- **AI judge** — the room's top‑down birdseye is sent to an AI vision model that
  scores it on five rubric criteria and writes a one‑line critique.
- **Customization** — recolor individual furniture parts, repaint walls, place
  wall‑mounted windows/doors/shelves and movable room dividers.
- **Game feel** — sound effects, a last‑30‑seconds audio/visual shift, and an
  animated results reveal.

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
