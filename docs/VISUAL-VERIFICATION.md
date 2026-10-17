# HD visual verification

Reference: `docs/concepts/gameplay.png`, 1672 × 941. Native-size implementation capture: `concept-trench-hd.png` in the workstation's temporary `death-star-assault-qa` directory. Browser plugin is unavailable; Playwright Chromium rendered the actual local build and downloaded models under SwiftShader.

| Comparison | Implemented treatment |
| --- | --- |
| Sharpness | Native HD render targets, high-DPI output up to 1.5×, edge-selective SMAA; no automatic scene downscaling |
| Ship composition | Bounded chase distance prevents acceleration shrinking the X-wing; darker hull material preserves red paint and source textures |
| Trench depth | Chamfered service housings, recessed sockets, brackets, pipe assemblies and distinct normal/roughness maps |
| Lighting | Neutral metal surfaces, cool fill and compact engine halos; no full-frame motion blur |
| HUD hierarchy | Gold mission/aiming accents, cyan shields, white equipment silhouettes; reduced enclosing panels |
| Weapon feedback | Real ammunition cells, reserve/reload state and heat; keyboard, pointer and touch controls retained |
| Responsive layout | Portrait radio above the fighter, compact touch equipment below it, separate radar and touch-control lanes |

The concept and native screenshot were inspected directly. The full visual baseline passed 95 tests without skips; the final portrait equipment adjustment passed the separate responsive browser scenario. Desktop campaign, QTE, defeat/retry, victory, resource loads, console health, graphics switching and actual weapon states were exercised. Portrait 390 × 844 and landscape 760 × 430 were checked.

Intentional adaptations: the station sphere stays absent inside the trench to preserve physical scene consistency; the game's authored 3D models and readable machinery replace the concept's cinematic surface detail. The seven real campaign stages and added weapon controls extend the concept's four illustrative stage markers. Existing mission text is retained; only requested graphics and equipment labels were added. Film-grade material wear and hardware GPU frame rates remain separate work, not claims made by this verification.
