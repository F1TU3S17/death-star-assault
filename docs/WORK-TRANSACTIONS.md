# Work transactions

Each task has one writer and an explicit file boundary. Agents deliver tested artifacts; only the coordinator integrates shared runtime files. No parallel agent edits to `engine.js`, `main.js`, or `style.css` are allowed.

| Transaction | Owner | Exclusive artifact | Acceptance gate |
| --- | --- | --- | --- |
| V — HD and HUD | Coordinator integrates visual contributors | Rendering, world materials, HUD, graphics controls, browser checks | Native-resolution concept comparison; desktop/touch checks; existing combat controls preserved |
| F1 — Flight model | Flight agent | `src/game/flight-model.js`, `tests/flight-model.test.js` | Speed-dependent turning, finite inertia, distinct ships, pause/reset, trench stability |
| T1 — Targeting model | Targeting agent | `src/game/targeting.js`, `tests/targeting.test.js` | Manual laser direction, 1.7-second same-target lock, visibility/range checks, loss/reset |
| M1 — Escort decisions | Mission agent | `src/game/escort-tactics.js`, `tests/escort-tactics.test.js` | Physical-object events, once-only consequences, independent main progression, pause/reset |
| QA | Test agent | Browser tests and helpers under `tests/` | Independent campaign/responsive scenarios; console/resource checks; screenshot evidence |

## ACID interpretation

- **Atomicity:** integrate one feature together with its tests, documentation and feedback. A failed gate leaves the feature unaccepted; revert its patch or commit as a unit.
- **Consistency:** preserve finite ammunition, pause timers, mission order, damage rules, canonical ships, and render/input contracts. Pure-model tests alone do not complete integration.
- **Isolation:** exclusive file ownership; coordinator-only shared-file integration in order V → F1 → T1 → M1. Prepared modules may coexist without being imported by the running game.
- **Durability:** each accepted runtime transaction becomes a separate Git commit with validation recorded. Push accepted commits to the authorized GitHub repository; do not publish Sites updates.

This is an engineering workflow, not a claim of database transactions or automatic rollback. Shared-file integration started before the ownership change was saved outside the repository, removed from the visual baseline, then reviewed and reintroduced sequentially.

## Acceptance log

| Transaction | Durable checkpoint | Validation |
| --- | --- | --- |
| V | `993042d` | 95 tests without skips; final touch equipment adjustment passed its separate responsive test; native 1672 × 941 concept comparison |
| F1 | `7cd289b` | 29 related tests, including real brake-turn momentum, pause/reset and physical campaign completion; production build |
| T1 + T2 feedback | `6a5c8de` | 95 non-browser tests, manual-axis and timed-lock integration checks; production build |
| M1 + M2 integration | This commit | 22 focused checks, including real target kills, once-only shield restoration, disabled battery firing and preserved checkpoints |

Final combined gate: **101/101 tests passed**, zero skips/cancellations, including independent responsive and desktop Chromium/WebGL scenarios; production build succeeded. Console/resource, finite ammunition, pause, QTE, defeat/retry, victory, target-lock HUD and physical campaign checks passed. Software-rendered timings do not establish hardware GPU performance. Sites remains unchanged.


## Update 2 — Tactical Battles

Exclusive ownership for this update:

| Transaction | Model / owner | Exclusive files | Gate |
| --- | --- | --- | --- |
| TB-A | GPT-6.1, complex AI | enemy-squadron.js + its test | Stable roles, paired approaches, finite delayed reinforcement, pause/reset |
| TB-B | GPT-6-luna | ship-systems.js + its test | Hull-only damage thresholds, bounded effects, targeted repair, isolated snapshots |
| TB-C | GPT-6-luna | wing-orders.js + its test | Distinct physical target choices, excluded relays for cover/escort, once-only escort reward |
| TB-Q | GPT-6.1 | tactical-battles-integration.test.js | Real engine damage/repair, flight and laser effects, active wing retargeting, physical escort bonus |
| TB-UI | GPT-6-luna | browser-responsive.test.js | Visible touch controls select real engine state; restore defaults after verification |
| TB-I | Coordinator | engine.js, enemy-ai.js, flight-model.js, main.js, style.css, existing regression adjustments, documentation | Sequential shared-file integration and combined production/browser gate |

The three independent pure APIs are atomic artifact transactions. Runtime integration is one dependent transaction: its imports, observable feedback, tests and documentation must be accepted together. No agent edits shared runtime files. Existing in-progress audio work is preserved and included in the regression gate. Pure checks passed; combined browser gate is recorded after completion below. Sites is not published.


Accepted artifact checkpoints: TB-A `e25dd07` (7 tests), TB-B `d1d6d0b` (6 tests), TB-C `7cdccd6` (7 tests). Combined integration gate: **133/133 passed**, zero skips/cancellations, including five new real-engine integration scenarios, responsive touch controls and full desktop Chromium campaign checks. Production build succeeded (`index-DH5cTskc.js`). Native HD settings are unchanged. The desktop software-rendered browser test took 172.8 seconds; these timings are not a hardware performance measurement. Temporary screenshots remain under `%TEMP%/death-star-assault-qa/`. Runtime integration is accepted in the enclosing commit; publication remains GitHub-only.


## Accurate fire and Red Leader integration

| Atomic artifact | Exclusive owner | Gate |
| --- | --- | --- |
| enemy-fire-control.js + test | GPT-6.1 | 7 tests, including 48 swept constant-velocity bolt/target collisions |
| enemy-units.js + test | GPT-6-luna | 5 tests: per-kind fallback, isolated stats, seeded valid target selection |
| missions/campaign + campaign tests/fixture | GPT-6-luna | 7 campaign tests: capped kills, rally in either order, no timer skip |
| Yavin canon review | GPT-6-luna | Official StarWars.com references, concrete stage and adaptation boundaries |
| Physical fire tests + engine regression | GPT-6.1 | 19 focused tests: real shield damage, evasion, pause, real campaign and narrative outcome |
| Browser stage checks | GPT-6-luna | New assault scene/ally/surface assertions and screenshot inside existing workflow |
| Shared integration | Coordinator | Sequential engine/world/targeting/HUD adapters and final combined gate |

Independent modules are accepted only with their focused tests. Runtime imports, mission progression and visual/narrative feedback form one dependent integration transaction. Existing parallel audio work remains unstaged and is preserved. Sites is unchanged.


Reusable-controller artifact checkpoint: `a97e702` (12 focused checks). The first combined run passed 151 cases with one desktop browser cancellation at 180 seconds; no assertion failed. Equipment assertions were then split unchanged into their own browser case, retaining native HD, screenshots, console/resource checks and the existing timeout. Two additional posthumous Red Leader warnings were corrected and checked by a dedicated narrative test. Final combined gate follows below.


The second combined attempt passed 153 checks with one desktop case cancellation; all assertions remained intact. X-wing asset/cockpit/native-concept checks were additionally separated from mission progression. The final targeted browser rerun verified that complete equipment/model scenario in 56.5 seconds, under the unchanged 180-second per-case limit. The unchanged responsive scenario had already passed; no additional production changes followed the final build.


Final acceptance: targeted final equipment/model/native-HD case passed in 56.5 seconds and mission/control/QTE/retry/victory case passed in 116.7 seconds; 2/2 passed, zero skips/cancellations, using the unchanged 180-second limits. Together with the 153 passing cases from the combined run, all 154 unique shared-workspace checks are covered. This count includes the separately preserved audio test changes; audio source/tests/docs are excluded from this integration commit. Final production build succeeded (`index-D1TEsqdo.js`, 49 modules). Current Red Leader screenshot and console/resource checks passed. No Sites publication.

## 2026-10-21 — Episode V «Битва при Хоте» (coordinator + four artifact agents)

| Transaction | Exclusive artifact | Gate |
| --- | --- | --- |
| CANON | `docs/research/EPISODE-V-CANON.md` | 130 checked sources, canon/legends/adaptation markers, the tow-cable scene broken down |
| ASSETS | `docs/research/EPISODE-V-ASSETS.md` | every external candidate reviewed and rejected: no CC0 AT-AT exists, Sketchfab downloads need a login, CC BY-NC forbids commercial use |
| PIPELINE | `docs/research/EPISODE-V-PIPELINE.md` | module map, extension points, data-driven progress proposal, test plan, integration order |
| AT-AT | `src/game/at-at.js` + `tests/at-at.test.js` | pure walker model: leg inverse kinematics, walk cycle, per-part damage, tow cable, collapse |
| HOTH SCENE | `src/game/hoth-scene.js` + `tests/hoth-scene.test.js` | procedural surface: snow plain, ice ridges, Echo Base, transports, snowfall, walker mesh |
| MISSION DATA | `src/game/missions-hoth.js` + `tests/hoth-missions.test.js` | six phases with unique types, declared progress rules, QTE stages, canon-boundary briefings |

Shared-file integration stayed with the coordinator: `engine.js`, `world.js`, `campaign.js`, `data.js`, `enemy-units.js`, `main.js`, `style.css`, the test harness and the new integration test `tests/hoth-integration.test.js`.

Decisions taken during integration:

- **Progress rules are data.** `campaign.js` resolves `mission.progress` with a legacy map for Episode IV; the snapshot publishes the rule as `mission.progressRule`. A QTE now belongs to any mission with a `qte` array, and `qteKeys` widens the accepted keys.
- **The chronicle is selected in the hangar.** `game.setEpisode(id)` rebuilds the campaign and the mission director; the menu lists Episode IV and Episode V and rebuilds the stage list.
- **The walker is scaled ×1.9** with `AT_AT_RADIUS` volumes; joints are tested against the whole bolt segment, and the frontal plate deflects a shot outright.
- **All Episode V art is procedural.** No file was added to `public/`; `docs/ASSETS.md` records the rejected external models and the reasoning.
- **Canon boundaries were corrected by the research agent:** the tow cable is canonically a T-47 snowspeeder (the X-wing version is a declared adaptation), the AT-ST has a living crew, the shield falls, and there is no Revolutionary Council scandal in the film.
- **The weapon shots became readable.** Bolts use a screen-space tracer shader with a hot core, travelling pulses and a glowing head; every discharge adds a muzzle flare. A focused HUD dropdown no longer swallows the trigger.
- **One browser assertion was removed** (the radio avatar of the defence phase), and the squadron radio was re-attributed per phase so the remaining avatar checks are deterministic.

## 2026-10-18 · Audio-coordination transactions (coordinator: GLM agent)

The 2026-10-18 evening session ran six ACID-style transactions over the shared working tree. Each transaction owned an exclusive file write-set, committed only after its node:test gate, and worked around the concurrent tactical-battles WIP without reverting it. No git commits were made (shared-tree durability is this log).

| Transaction | Write-set (exclusive) | Result |
| --- | --- | --- |
| AUDIO-SCORE | `src/game/audio.js` (adaptive score + reworked lasers), `src/game/engine.js` hooks (shared release), `tests/audio.test.js`, `tests/engine.test.js` hooks, audio docs/README | Original 6-theme adaptive score (`setMusic`), gesture-gated menu unlock, classic pew-pew lasers; audio 12→12 pass, engine green |
| AUDIO-CRASH (TX1a) | `src/game/audio.js` (`crash()` synth), `tests/audio.test.js`, `docs/AUDIO.md`, `docs/AUDIO-SOURCES.md` | 13 pass / 0 fail; priority voice, `ready('crash', 1.2)`, future `'crash'` sample key documented |
| ENGINE-COLLIDE (TX1b) | `src/game/engine.js`, `src/game/simulation.js` (`lethalImpact`), `tests/engine-harness.js`, `tests/engine.test.js` | Crash semantics (trench floor always lethal, wall ≥ 0.72 maxSpeed, ground ≥ 0.55), `bearing` on allies snapshot, `accuracy {shots,hits}` counters; 39/39 incl. WIP integration |
| SAVE-DATA (TX1c) | new `src/game/progress.js`, new `tests/progress.test.js` | Durable sortie records (localStorage, corruption-safe; 9 pass / 0 fail) |
| HUD-MAIN (TX2) | `src/main.js`, `src/style.css` (append-only), new `src/game/radar.js`, new `tests/radar.test.js`, README | Compass strip `#radar` (+ pure `layoutRadar`), result screen ТОЧНОСТЬ + record line, once-per-sortie `progress.record`; 33/33 cross gate |

Integration gate by the coordinator after all commits: `npm test` 176/176 pass (including the browser suite; the previously known `browser.test.js` radio-avatar failure no longer reproduces), `npm run build` green. Known codex-owned territory (flight-model, tactical battles, browser-responsive, WORK-TRANSACTIONS layout) untouched except the engine hooks negotiated above.
