# Graphics improvement research

**Checked:** 17 October 2026  
**Target:** Three.js 0.180.0, vanilla ES modules + Vite  
**Original review scope:** Read-only research for the existing renderer and assets. The implementation status below reflects the later graphics pass.

## Baseline before this pass (historical)

The renderer already uses a HalfFloat HDR EffectComposer, UnrealBloomPass, FXAA, OutputPass, restrained vignette, ACES tone mapping, a 1.65 pixel-ratio cap, one 1536 (768 narrow-screen) PCF soft-shadow directional light, and a hemisphere fill. The trench is built from seven instanced batches (about 23k details) plus the local station-panel texture. Wall, floor, and panel materials already use a generated normal map; most trench block instances use shared standard materials. Bloom and engine glow are present, while the HTML HUD stays outside postprocessing.

At the time of the original review, the supplied trench capture had strong geometry and a clear corridor, but the near walls, floor, and ship read very dark; illuminated edges and material response were sparse. The concept image is a different scene, so it served as an art-direction reference rather than a direct render comparison.

## Shipped graphics changes

The lighting proposal is integrated in `scene-lighting.js`: four broad procedural light cards feed a PMREM environment at intensity **0.42**, while the starfield remains the scene background. A cool PointLight (intensity **350**, range **80**, no shadows) follows behind and above the player during active trench flight; in cockpit view it moves just outside the shell and drops to intensity **0.8**. The environment remains active in every phase; the local fill requires `phase === 'trench'` and `mode === 'playing'` (it is not active during QTE or cinematic phases).

The detailed Jeroenimo TIE is now the runtime TIE model. It has 1,412 triangles, a 512² color texture, and a normal map; its source +Z forward axis is rotated by π around Y in `createShip` to match the game's −Z flight direction. The earlier flatter model remains available for comparison. Ship materials retain their authored maps while applying per-model roughness/metalness and environment response.

The HDR composer uses up to **2 MSAA samples on identified hardware GPUs**. MSAA is disabled for software renderers, unknown GPU identities, and viewports narrower than 760 px; FXAA remains active in every case. The earlier 4× setting took more than 180 seconds in a software-rendered browser run, so the cap was reduced before final QA. This is a compatibility observation, not a hardware frame-rate claim. The chase camera follows closer, fits portrait aspect ratios, and smoothly widens its field of view from 63° to 70° while boost is held. GTAO remains deferred because its extra screen-space pass is costly for the expected gain.

## Compatibility and licensing

All listed APIs are in the installed Three.js package or its official three/addons/ exports; no version migration or framework change is needed. GTAOPass and RoomEnvironment are addons maintained in the same upstream repository. Three.js r180 is distributed under the [MIT license](https://github.com/mrdoob/three.js/blob/r180/LICENSE). The project-created panel texture is already documented in [ASSETS.md](ASSETS.md); the recommendations above do not require downloading third-party runtime assets.

### CC0 PBR texture candidate

[ambientCG Metal Plates 008](https://ambientcg.com/view?id=MetalPlates008) is a verified CC0 candidate. ambientCG states that its assets are CC0 on the [license page](https://docs.ambientcg.com/license/); its official asset API lists color, normal, roughness, metalness, and displacement maps. The [1K-JPG archive](https://ambientcg.com/get?file=MetalPlates008_1K-JPG.zip) is 3,608,831 bytes (about 3.6 MB). The download and preview CDNs reset the connection during research, so the maps were not downloaded, previewed, integrated, or render-tested. Keep the bespoke station-panel albedo and authored normal map in place until the provider maps are available and verified.

## Sources

Official Three.js documentation and pinned source checked on **17 October 2026**:

- [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)
- [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html)
- [PointLight](https://threejs.org/docs/pages/PointLight.html)
- [GTAOPass](https://threejs.org/docs/pages/GTAOPass.html)
- [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html)
- [GTAOPass source, r180](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/postprocessing/GTAOPass.js)
- [RoomEnvironment source, r180](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/environments/RoomEnvironment.js)
- [Three.js license, r180](https://github.com/mrdoob/three.js/blob/r180/LICENSE)

