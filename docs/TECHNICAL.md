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
src/game/mission-events.js Optional objectives, radio triggers and vent schedule
src/game/mission-props.js  Physical sensor and animated coolant vent props
src/game/flight-model.js   Inertial velocity, turning authority and ship handling
src/game/targeting.js      Timed same-target lock, analytic cover and lead solution
src/game/escort-tactics.js Pure escort choices and once-only consequence events
src/game/world.js          Model loading, station geometry and cinematic sets
src/game/world-detail.js   Seeded instanced trench modules, station texture and normal maps
src/game/detailed-cockpit.js Open Galaxy X-wing cockpit loader and Y-wing fallback
src/game/scene-lighting.js Procedural PMREM environment and trench fill light
src/game/render-pipeline.js HDR bloom, FXAA, output transform and subtle vignette
src/game/enemy-ai.js       Pure finite-state attack passes and observed interception
src/game/audio.js          Gesture-gated local samples and synthesized Web Audio fallback
public/audio/              CC0 effects, manifest, hashes and source attribution
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

Flight persists an actual velocity vector; observed enemy interception uses this velocity rather than the nose direction. Turn authority peaks near 70% cruise speed. Brake-turn coasting is suppressed inside the trench, and teleports/collisions reset momentum. Lasers retain the firing axis; the lead solution affects HUD only. Torpedo guidance requires 1.7 simulation seconds on one eligible visible target; loss disables guidance immediately while progress decays. Early launches remain finite-ammunition unguided rounds. The targeting HUD owns reusable lead/ring DOM nodes and no simulation state.

Escort decisions are collision-confirmed events. A physical route battery and remote power node are independent of waypoint progression. Node destruction disables the battery and restores at most 25 actual shield units per surviving ally once; direct battery destruction leaves the node available. Disabled batteries leave targeting/radar and cannot fire. No abstract pressure timer deals damage: enemy projectiles remain authoritative.

`createMissionDirector` observes the campaign without advancing its main goals. It owns optional scan dwell, marked ambush targets, bonus points, radio triggers and the coolant vent warning/open/close cycle. The engine supplies physical position, facing, speed and destroyed target IDs; pause freezes all observations. Destruction is recorded immediately so a final kill cannot lose its optional reward during a phase transition. `mission-props.js` owns disposable sensor/vent geometry; snapshots supply projected `worldMarkers` and objective history to the HUD.

Use delta time with a maximum frame step of 0.05 seconds. Flight uses quaternion orientation, local forward velocity, pitch/yaw and roll. Support WASD turning, arrow weapon switching, Q/E roll, Shift boost, Ctrl brake, Space/left mouse fire, C camera toggle, F ability, Escape pause. Mouse aiming uses optional pointer lock; keyboard flight is available immediately. Cockpit camera is attached to the ship and hides the external hull; chase camera follows smoothly. Engine ignores input while menus or form controls own focus.

TIE fighters pursue/intercept and fire at the player with visible bolts. Segment/sphere weapon checks prevent tunnelling; shields absorb damage before hull damage. Campaign order is 5 TIE kills, 4 gun batteries with 2 optional relays, 3 physical escort checkpoints, Red Leader cover (3 TIE plus a physical rally point), protection of Wedge while destroying 4 pursuers, 6 trench gates, a four-step targeting QTE, and a 12-second cinematic. Missed gates require another approach; wall/floor impacts damage the ship. Final targeting QTE supports retries. The cinematic shows Luke's X-wing, two torpedoes bending down a narrow shaft, the orbital explosion, and escape from a shockwave. A Y-wing sortie transfers control to Luke's X-wing for the final targeting stage; restart restores the originally selected ship.

Downloaded models load asynchronously; failure preserves play with a geometric fallback. The detailed Open Galaxy X-wing cockpit is loaded from `/models/xwing-cockpit/scene.gltf`; `createDetailedCockpit(fallback)` preserves the authored pilot origin, hides the window mesh, and swaps visibility by selected ship. The detailed model is shown for X-wing only; Y-wing retains the procedural cockpit. It reports `modelStatus`, `triangleCount`, and load errors in `userData`; teardown frees geometry, materials, and textures, including a load that finishes after disposal. Do not recenter this cockpit by its bounds because that moves the pilot eye. The runtime TIE uses `/models/tie-fighter-detailed/scene.gltf` (1,412 triangles, 512² color map and normal map); `createShip` rotates this model by π around Y to convert source +Z forward to game −Z. Ship material tuning preserves authored maps and adds environment response. Keep every asset source/license in `docs/ASSETS.md` and avoid remote hotlinks.

## Rendering and fighter AI

The renderer uses half-float HDR composer targets at CSS viewport resolution, bloom, FXAA, output tone mapping and a restrained vignette. HD uses native viewport resolution multiplied by min(devicePixelRatio, 1.5), with SMAA before OutputPass. There is no automatic resolution decrease or 1.44-megapixel cap. Explicit performance mode uses 75% scene resolution and FXAA. Renderer and composer pixel ratios are coordinated so high-DPI output is genuinely sharp. Bloom alone runs at half scene resolution. Software rendering disables directional shadows; ships retain PBR shading without thin-panel self-shadow crawl. Exterior cameras use a 1.5 near plane and bounded chase distance at speed. These are quality settings, not a hardware frame-rate guarantee. `createSceneLighting(renderer, scene, camera)` builds a procedural environment from four broad light cards and captures it once with `PMREMGenerator`; image-based lighting has intensity 0.42 and does not replace the starfield background. One unshadowed PointLight (intensity 350, range 80) follows behind and above the player during active trench flight. In cockpit view it moves just outside the shell and uses intensity 0.8. PMREM remains enabled in all phases; the local fill requires `phase === 'trench'` and `mode === 'playing'`, so it is off in QTE and cinematic phases. `update(player, phase, mode)` runs from the frame loop; `inspect()` exposes lighting state and `dispose()` restores prior scene environment settings and releases the PMREM resources.

`addTrenchDetail(parent, options)` in `world-detail.js` creates seeded, multiscale beveled plates, recesses, machinery, pipe assemblies, lights and floor modules in ten InstancedMesh batches. The playable trench has layered service housings, sockets and mounting brackets in ten instance batches; hard chamfers use 44 triangles instead of subdivided rounded boxes. Separate albedo, normal and roughness maps keep panel edges readable. This replaces the former 23,256 repeated box details. The station uses a generated hierarchical service-panel texture; ship material tuning preserves source maps while setting per-model roughness/metalness for the PBR environment. Bursts in `engine.js` combine additive, camera-faded sprites with rotating debris. Chase distance increases on portrait viewports to fit the ship. During boost, camera FOV is smoothly damped from 63° to 70° and returns when boost ends. Controls and campaign behavior remain as documented above. The DOM HUD remains outside postprocessing; local OFL fonts avoid network requests and fallback-dependent layout.

Enemy brains use approach, telegraph, attack, break and reposition states with finite turn rates and firing cones. Their physical bolts lead observed target velocity. Evasion requires a visible approaching projectile and a reaction delay; aces react sooner. Escort attackers prioritize vulnerable allies, while corridor avoidance prevents trench reversals. Health and projectile damage are unchanged by this AI revision. Debug inspection reports attack states, targets, renderer statistics and world instance counts; tests verify finite transforms, interception, reaction windows and playable campaign progression.

## Verification and references

Test damage/shield arithmetic, mission order and conditions, pause clocks, QTE failure/retry/success, and final victory timing. Browser smoke tests cover menu selection, launch, both cameras, turning/boost/fire/ability, pause/resume, mission HUD, restart and downloaded model requests. Record real failures separately from test shortcuts; debug controls must not be the only way to finish a mission. Browser QA can inspect `window.__gameDebug.snapshot()` and `.inspect()`, hold/release keys with `.input(code, held)`, advance simulation via `.step(seconds)`, and isolate stages through `.advanceMission()`; no debug shortcuts appear in the UI.

Build/launch reference: [official Vite guide](https://vite.dev/guide/). Rendering/model-loader reference: [official Three.js documentation](https://threejs.org/docs/).


## Tactical Battles contracts

`enemy-squadron.js` owns deterministic ID-stable pilot ranks, bait/flank assignments and one reinforcement reservation per combat phase. Engine feeds the complete living TIE roster, applies formation offsets only during approach/reposition, and aims physical shots at the real target. Pilot rank selects dispersion through `enemy-fire-control.js`; `cooldownScale` adjusts the attack cadence. The older `aimScale` directive remains a compatibility field; rank modifiers do not increase hull or projectile damage. A surviving caller must remain alive for four simulation seconds. Its request creates one bonus-only physical ace. Withdrawal lasts three seconds before re-engagement, preserving mandatory campaign kill counts. Trench/Vader retain their existing corridor behavior.

`ship-systems.js` receives only the actual loss of hull after shield absorption. Each cumulative 18 hull damage causes a deterministic 30-point rotating fault. Engine applies bounded thrust/acceleration, weapon interval/cooling, and lock-progress modifiers. Existing repair charges, channel, interruption and cooldown remain authoritative in `simulation.js`; selected repair target is frozen during the channel. System repair restores up to 40 integrity and never hull. Snapshots expose `systems`, `repair.target`, `wingOrder`, `squadron`, and `tacticalScore`.

`wing-orders.js` selects eligible physical targets by the current order. Support lasts ten seconds, retains finite calls, fires friendly projectiles and retargets without spawning another pair. Escort preservation awards 150/75 once at the third real checkpoint. The score is added to the existing result bonus; it cannot advance campaign progress. Reset clears damage, commands, role history, timers and rewards. New controls are inside the existing collapsible avionics panel; ordinary HUD layout and HD rendering remain unchanged.


## Reusable enemy units and fire control

- `enemy-units.js`: cloned archetype specs (`getEnemyUnitSpec`) and episode-independent target policy (`chooseEnemyTarget`). Rendering/model creation remains an adapter in engine; health/radius are unchanged.
- `enemy-fire-control.js`: weapon profiles (`getEnemyWeaponProfile`), muzzle-offset interception (`solveFireSolution`) and stateful finite-turn turrets (`createTurretBrain`). Profiles own speed, lifetime, damage, range, warning duration, cadence and radial angular dispersion. Fighter brains consume the same firing profiles.
- A shot solves `|targetPosition + targetVelocity*t - base| = projectileSpeed*t + muzzleDistance`; only positive roots within lifetime and engagement range are allowed. Origins use turret head height/barrel offset or fighter muzzle offset. The same solution drives the actual finite-speed projectile. No post-launch correction is applied.
- Turrets charge visibly, track within finite angular speed and fire only within .012 radians of their solution. Light/heavy speeds are 420/520, ranges 1500, lifetimes 4.5 seconds. Fighter bolts remain 245, range 650. These are arcade values. Scene-cover checks block firing through station walls.
- Accuracy is configured as a small radial tangent-plane error (not independent random XYZ drift). Pilot ranks have distinct dispersion. Physical swept-collision tests cover constant lateral/incoming motion at 1000–1500 and actual player shields at1200, plus pause and post-launch evasion.

`assault` is a configurable combat/route mission type, defined through `combatRoute` data. Campaign caps kill progress, remembers a separately observed physical rally and requires both. It does not advance on time. Engine renders the Red Leader ally and fails if that ally dies before completion. The authored missed strike runs after those player conditions: narrative torpedoes move visibly to a surface point, cannot damage combat entities or award kills, and respect pause/reset. Surface geometry is used without the duplicate orbital Death Star. Canon sources and remaining compression are recorded in `YAVIN-MISSION-REVIEW.md`.
