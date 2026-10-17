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
