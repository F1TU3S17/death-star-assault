# Repository Guidelines

## Project Structure & Module Organization

This is a browser game built with vanilla JavaScript, Three.js, and Vite. `src/main.js` and `src/style.css` implement the Russian menu and HUD. Gameplay lives in `src/game/`: `engine.js` owns the simulation loop, `world.js` builds scenes and loads models, `sfoils.js` rigs the X-wing, and `campaign.js` tracks mission progression. Define missions in `missions.js` and ship specifications in `data.js`. Keep downloadable assets under `public/`; document their sources and licenses in `docs/ASSETS.md`. Tests belong in `tests/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies using the lockfile.
- `npm run dev`: start Vite at `http://127.0.0.1:4173`.
- `npm run build`: generate the production `dist/` directory.
- `npm test`: run Node tests, including Chromium/WebGL checks when available.
- `npm start`: serve the existing production build locally. Windows users can also run `START.bat`.

Use Node.js 22.7 or later. Do not commit `dist/` or `node_modules/`.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, and descriptive camelCase names. Keep filenames lowercase; tests use `*.test.js`. Follow the surrounding CSS and JavaScript style; no formatter or linter is configured. Keep pure combat calculations separate from rendering. Prefer data-driven mission definitions to additional hard-coded episode branches.

## Testing Guidelines

Tests use `node:test`, strict assertions, and Playwright. Cover observable behavior: mission transitions, finite ammunition, pause timers, damage, and real projectile collisions. Browser checks should load the actual models and detect asset or shader failures. There is no percentage coverage threshold. Run tests and build before submitting gameplay changes.

## Commit & Pull Request Guidelines

Existing history uses concise `feat:` subjects. Follow conventional prefixes such as `fix:` and `docs:`. Pull requests should describe the player-visible change, testing performed, and any balance or canon adaptations. Include screenshots for HUD or visual changes and link related issues when available. Keep credentials out of source and record attribution for every new external asset.
