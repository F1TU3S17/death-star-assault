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

This is an engineering workflow, not a claim of database transactions or automatic rollback. Shared-file integration already started before the ownership change was saved outside the repository, then removed from the visual baseline. It will be reintroduced sequentially after review.
