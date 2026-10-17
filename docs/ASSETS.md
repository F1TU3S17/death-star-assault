# Asset Sources and Integration

All gameplay ship models are downloaded assets stored locally. The game does
not contact the model providers at runtime. Download date: **16 October 2026**.

| Asset | Author and source | License | Runtime file |
| --- | --- | --- | --- |
| X- Wings | [perceval-66 / Sketchfab](https://sketchfab.com/3d-models/x-wings-5dc24fdbc09544df9388890bab2434ad), [download mirror](https://github.com/BoyuanTian/threejs-xwing-lasttry.github.io/tree/main/xwings) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), original attribution retained in `license.txt` | `public/models/x-wing/scene.gltf` |
| BTL Y-wing | First Strike Development Team; FBX conversion by MichaelEGA / [Open Galaxy](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/ships/firststrike/y-wing) | [Explicit noncommercial reuse permission with credit](https://www.moddb.com/mods/first-strike/news/public-release-of-first-strike-models); see `y-wing/LICENSE.txt` | `public/models/y-wing/scene.gltf` |
| TIE fighter | [Alberto Calvo / Poly Pizza](https://poly.pizza/m/aba7TBlKyJE) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | `public/models/tie-fighter.glb` |
| Death Star 1 V1 (reference only) | [Joe Scalise / Poly Pizza](https://poly.pizza/m/8MIVor30XoN) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Archived at `public/models/death-star.glb`; not rendered |

The Y-wing permission is asset specific; Open Galaxy's Apache code license
does not supersede it. Keep this project noncommercial while using that model.
Model licenses do not grant rights to Star Wars trademarks or franchise IP.

## Loader and Orientation

Use Three.js `GLTFLoader` for every runtime model. They require neither Draco
nor KTX decoders. Center the loaded object with its world `Box3`, then scale
uniformly to the chosen gameplay size. Keep a parent group for movement.

| Model | Geometry | Original bounds / direction | Integration |
| --- | --- | --- | --- |
| X-wing | 45,866 triangles; 11 meshes; 16 PNGs | Root already converts source Z-up to Y-up; nose points +Z | Rotate Y by π to face the game's −Z direction; maximum dimension about 6.53 |
| Y-wing | 5,496 triangles; 1 mesh, 2 primitives; original diffuse PNG | About 88.2 × 26.6 × 168.8; +Y up, nose −Z | No extra rotation; target length roughly 14 units |
| TIE | 2,146 triangles; 5 material primitives; no texture files | About 3.04 × 2.43 × 2.72; +Y up, viewport −Z | No extra rotation; normalize overall size |
| Death Star reference | 1,166 triangles; embedded flat materials | Diameter about 0.284, off-center origin | Retained source reference; runtime station uses original procedural geometry |

The Y-wing glTF was converted from the supplied FBX, extracting the intact
`y_wing__P1` mesh and excluding overlapping wreck/LOD meshes. Original source
files remain beside the conversion. Rebuild with
`node scripts/convert-y-wing.mjs`. Original X-wing and Poly Pizza files are
unmodified. `public/models/manifest.json` records file hashes and provenance.

The rendered Death Star is project-authored Three.js geometry: a 192 × 128
segmented sphere with a recessed concave superlaser dish, concentric ribs,
radial dividers, a narrow equatorial trench, and a deterministic 2048 × 1024
panel/bump map. It replaces the downloaded low-poly reference in both gameplay
and the cinematic. Trench hull textures remain the generated asset below.
Ship engine flares, cockpit instrument screens, and the procedural fireball
and luminous shockwave are project-authored code and textures; no film footage
or third-party effects are used.

## Project-created Images

- `public/textures/station-panels.png`: generated with built-in ImageGen on
  16 October 2026. Prompt: seamless grayscale orthographic Death Star machine
  panels, modular hull greebles, recessed seams, cold grey metal, no text.
  Used for the station surface and trench walls.
- `docs/concepts/gameplay.png`: project-generated ImageGen visual reference.

These two images are project-created, not downloaded third-party assets.

## Asset Validation

Offline validation passed: both glTF dependency trees are complete, buffer
byte lengths match declarations, and both GLB headers/chunk lengths are valid.
The Y-wing conversion reruns successfully and produces the same SHA-256 hash.
Mesh bounds, counts, materials, and front direction were inspected from source
geometry. Final Chromium/WebGL smoke tests passed through `npm run test`: actual
X-wing, Y-wing and TIE models loaded with their local materials/textures, with
no failed requests, shader errors or uncaught page errors. Desktop (1440×900)
and narrow (390×844) PNG screenshots were visually inspected. The reference
Death Star file also passed GLTFLoader parsing; runtime station geometry is
project-authored as explained above. Physical mobile devices and hardware GPU
performance were not measured.
