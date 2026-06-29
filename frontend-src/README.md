# SYNORA · Frontend (React + Vite + TypeScript)

The interface, rebuilt to the SYNORA design system.

## Develop
```bash
npm install
npm run dev          # http://localhost:5173 — proxies /api to 127.0.0.1:8000
```
Run the backend separately in another terminal: `python ../run.py`.

## Build
```bash
npm run build        # outputs straight into ../frontend, which the backend serves
```
Then just start the backend (`python ../run.py`) and open http://127.0.0.1:8000.

## Layout
- `src/styles/tokens.css` — design tokens (onyx palette, phosphor accent, motion curves)
- `src/lib/` — api client, types, global store (engine loop, polling)
- `src/components/` — Logo, Rail, charts, shared UI
- `src/views/` — Observe · Minds · Constellation · Memory · Canon · Engine
- `src/motion/` — framer-motion variant presets
