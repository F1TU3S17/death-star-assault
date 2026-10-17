# Technical Architecture

## Runtime and launch

Use vanilla ES modules, Three.js, and Vite. The checked workstation has Node **24.13.1** and npm **11.8.0**; dependencies live inside this project. Node **22.7+** is required for the test runner configuration. Commit the lockfile. No backend, account, CDN, or runtime model downloads are required.

- `START.bat`: change to its own directory, verify Node, build only if `dist/index.html` is missing (installing dependencies when necessary), then run `npm start`. The static server opens the default Windows browser. An existing build needs no npm dependencies or internet.
- `npm start`: serve `dist/` on `127.0.0.1:4173`; `npm run dev`: Vite on that address; `npm run build`: update production `dist/`; `npm run preview`: Vite build preview; `npm test`: mission, simulation, asset and browser tests. Browser tests skip when no build or compatible installed Chromium is available.
- Require a modern browser with WebGL2. Opening `index.html` through `file://` is unsupported because ES modules and model fetches need HTTP.

## File ownership and boundaries

```text
index.html                 HTML entry point
src/main.js                UI, menus, HUD, accessible buttons, input help
src/style.css              UI styling and responsive layout
src/game/engine.js         createGame, Three scene, render loop, flight and combat
src/game/simulation.js     Pure mission/combat/QTE helpers; no DOM or Three imports
src/game/data.js           Ship/episode/mission configuration (plain exported data)
src/game/campaign.js       Pure campaign progression and QTE state machine
src/game/world.js          Model loading, station geometry and cinematic sets
src/game/audio.js          Original synthesized Web Audio effects
public/models/             Downloaded local GLB/OBJ/MTL and textures
docs/ASSETS.md             Exact sources, authors, licenses and model orientation
docs/DESIGN.md             Plot, mission progression and canon references
tests/                     *.test.js for simulation and state transitions
```

Engine owns simulation state, keyboard/mouse controls, resize, camera, and animation. UI owns DOM, ship selection and buttons. Do not pass Three objects to UI. A second episode is configuration plus episode-specific world setup, not a replacement main loop.

## Frozen engine/UI contract

Export `createGame` from `src/game/engine.js`:

```js
const game = createGame({ canvas, ships, missions, onSnapshot, onEvent });
game.start({ shipId: 'xwing' });
game.pause();
game.resume();
game.restart();
game.setCamera('cockpit'); // 'cockpit' | 'chase'
game.useAbility();
game.cycleWeapon(1); // arrows: right/up next, left/down previous
game.selectWeapon('proton-torpedo');
game.submitQte('Space');   // KeyboardEvent.code
game.getSnapshot();
game.previewShip('ywing'); // menu only; selectShip is an alias
game.returnToMenu();
game.setMuted(true);
game.dispose();
```

Creation renders the hangar/space backdrop in `menu` mode. `start` resets a complete sortie and enters its first mission. `restart` resets using the last chosen ship. Pause freezes mission clocks, projectiles, AI and QTE windows; resume restores the previous playing/QTE mode. Tab/window blur clears held inputs and pauses active play. `dispose` removes listeners, cancels RAF and frees GPU resources.

Emit plain snapshots at approximately 10 Hz and immediately after transitions:

```js
{
  mode: 'menu', // menu | playing | paused | qte | cinematic | victory | defeat
  shipId: 'xwing', camera: 'chase', elapsed: 0,
  health: 100, shields: 100, speed: 0, maxSpeed: 180,
  abilityCooldown: 0, abilityActive: false,
  kills: 0, targetCount: 0,
  mission: { id: 'red-squadron', index: 0, title: '', objective: '', progress: 0, count: 0, target: 5 },
  qte: null // or { key: 'Space', label: '', remaining: 2, progress: 0 }
}
```

`health`, `shields`, and mission `progress` are percentages (0–100); mission `count` and `target` are raw counters. `speed` is game distance units per second; timers are seconds. UI must tolerate `mission: null` in menu. Snapshot objects are fresh read-only views, never live mutable engine state. `targets` and `targeting` use screen coordinates from 0 to 1. `enemies` supplies relative `bearing` in radians plus `distance` and `kind` for radar. Extra fields include `heat`, `phase`, `position`, `muted`, and `reason`.

Events use `{ type, ...payload }`: `radio` has `{ speaker, text }`; `mission-complete` has `{ missionId }`; `victory` has `{ elapsed, kills }`; `defeat` has `{ reason }`; `damage` has `{ amount }`; `kill` has `{ kind, kills }`. Engine must not rely on a callback return value. Audio begins only after a user's Start action.

## Campaign data contract

`src/game/data.js` exports `SHIPS` and `EPISODES` objects keyed by ID plus the `MISSIONS` array. Ship IDs are `xwing` and `ywing`; fields include `id`, `name`, `role`, `description`, `model`, `hull`, `shield`, `speed`, `boostSpeed`, `turnRate`, `laserDamage`, `laserCooldown`, `laserHeat`, `shieldRegen`, `ability: { id, name, description, cooldown, duration }`. An optional `modelUrl` and `modelOptions.rotation` override the loader defaults. Mission entries have `id`, `title`, `objective`, `type` (`combat`, `surface`, `escort`, `defend`, `trench`, `qte`, `cinematic`), `target`, optional `duration`, and `radio`. Episodes have `id`, `number`, `title`, `subtitle`, `ships`, `missions`, `briefing`. Default episode ID: `episode4`.

`createCampaign('episode4')` exposes `getSnapshot`, `recordKill('tie'|'turret')`, `recordCheckpoint`, `recordEscortCheckpoint`, `recordSideObjective(id, amount)`, `update(dtSeconds)`, `qteInput(KeyboardEvent.code)`, `fail(reason)`, and `reset`. Snapshot phases are `combat`, `surface`, `escort`, `defend`, `trench`, `qte`, `cinematic`, `victory`; `failed` is separate. The engine maps raw counters into UI percentages. QTE steps expose `key`, `label`, `duration`, `remaining`, `totalRemaining`, `stage`, `progress`, and `total`.

Episode IV admits X-wing and Y-wing. A-wing may be displayed as locked for a future Episode VI; its later history and gameplay abilities must not be silently presented as Yavin participants. Gameplay values are explicitly balance abstractions; equipment descriptions require canon sources.

## Simulation requirements

Use delta time with a maximum frame step of 0.05 seconds. Flight uses quaternion orientation, local forward velocity, pitch/yaw and roll. Support WASD turning, arrow weapon switching, Q/E roll, Shift boost, Ctrl brake, Space/left mouse fire, C camera toggle, F ability, Escape pause. Mouse aiming uses optional pointer lock; keyboard flight is available immediately. Cockpit camera is attached to the ship and hides the external hull; chase camera follows smoothly. Engine ignores input while menus or form controls own focus.

TIE fighters pursue/intercept and fire at the player with visible bolts. Segment/sphere weapon checks prevent tunnelling; shields absorb damage before hull damage. Campaign order is 5 TIE kills, 4 gun batteries with 2 optional relays, 3 physical escort checkpoints, protection of Wedge while destroying 4 pursuers, 6 trench gates, a four-step targeting QTE, and a 12-second cinematic. Missed gates require another approach; wall/floor impacts damage the ship. Final targeting QTE supports retries. The cinematic shows Luke's X-wing, two torpedoes bending down a narrow shaft, the orbital explosion, and escape from a shockwave. A Y-wing sortie transfers control to Luke's X-wing for the final targeting stage; restart restores the originally selected ship.

Downloaded models load asynchronously; failure preserves play with clearly documented geometric fallback. Include local textures/materials and keep every source/license in `docs/ASSETS.md`. No silent remote hotlinks. Cap pixel ratio to 1.5–2, reuse geometry/materials, pool frequent effects, and keep explosions finite.

## Verification and references

Test damage/shield arithmetic, mission order and conditions, pause clocks, QTE failure/retry/success, and final victory timing. Browser smoke tests cover menu selection, launch, both cameras, turning/boost/fire/ability, pause/resume, mission HUD, restart and downloaded model requests. Record real failures separately from test shortcuts; debug controls must not be the only way to finish a mission. Browser QA can inspect `window.__gameDebug.snapshot()` and `.inspect()`, hold/release keys with `.input(code, held)`, advance simulation via `.step(seconds)`, and isolate stages through `.advanceMission()`; no debug shortcuts appear in the UI.

Build/launch reference: [official Vite guide](https://vite.dev/guide/). Rendering/model-loader reference: [official Three.js documentation](https://threejs.org/docs/).
