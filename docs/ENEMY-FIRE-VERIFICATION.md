# Enemy fire and Red Leader assault verification

## Fixed causes

The old turret lead horizon was 1.1 seconds despite several seconds of projectile travel. Its maximum range was 1500 while ordinary bolts at 245 with 4.5-second lifetime could travel only1102.5 plus muzzle offset (heavy 310:1395). Independent XYZ scatter up to .065 added large errors against a seven-unit target radius. The visible barrel and firing origin also used different heights.

Enemy fire now uses one muzzle-offset interception solution for movement prediction and physical projectiles, reachable-time checks, configured lifetimes, and small radial angular dispersion. Turrets fire 420/520 with unchanged damage, finite turn speed and readable charge. Archetypes, target selection, weapon physics, fighter maneuvers and squadron coordination are separate episode-independent modules. The engine adapts those decisions into meshes/projectiles.

## Evidence

- Seven pure fire-control tests include 48 swept moving-target collisions at 1000–1500 with maximum dispersion and finite lifetime.
- Four real-engine turret scenarios verify light/heavy physical hits on steady lateral player flight beyond 1200, warning before the first bolt, pause freezing, unchanged in-flight velocities and evasion after changing course.
- The real campaign test completes combat → surface → escort → assault → defend → trench using flight/fire controls and physical damage, without injecting progress or resources. Red Leader can fail from ordinary AI fire; successful stage completion launches the authored miss and loss once in order.
- Campaign tests require three kills plus a physical rally in either order, cap duplicate progress, reject timer-only completion and reset state. A narrative test rejects future mission lines assigned to the fallen leader.
- Browser coverage adds `red-leader-run.png` (1440×900): eight stages, correct title/objective, Red Leader ally and surface geometry; no duplicate orbital station. The coordinator inspected this image. Existing camera, model, controls, QTE, retry/victory and responsive checks remain enabled.

## Validation workflow

The first combined desktop browser case reached its 180-second software-rendering limit after the HD concept capture. Equipment assertions were moved intact into `browser-equipment.test.js`; no assertions, screenshots or rendering quality were removed, and each scenario retains the same timeout. Equipment and mission sessions share the browser QA mutex. Final combined results are recorded in WORK-TRANSACTIONS.md.

Production output uses native HD/SMAA. Local screenshots are under `%TEMP%/death-star-assault-qa/`. Software-rendered timings are not hardware GPU FPS measurements. Existing parallel audio edits are preserved separately; Sites is not published.


Final results: the equipment/model case passed in 56.5 seconds and the separate mission/control/QTE/victory case passed in 116.7 seconds (2/2, zero skips/cancellations). Combined with the previously passing cases, all 154 unique working-tree checks are covered, including the independent responsive/model-render cases. Existing audio changes contribute one additional working-tree test and remain outside this commit. Build `index-D1TEsqdo.js` passed; the large-chunk advisory is unchanged. No runtime or rendering edits followed that build.
