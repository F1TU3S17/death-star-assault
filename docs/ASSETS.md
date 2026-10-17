# Asset Sources and Integration

All gameplay ship models are downloaded assets stored locally. The game does
not contact the model providers at runtime. Downloaded 16–17 October 2026.

| Asset | Author and source | License | Runtime file |
| --- | --- | --- | --- |
| X-wing cockpit (2025) | [MichaelEGA / Open Galaxy](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/cockpit/xwing), [author's release](https://www.moddb.com/games/open-galaxy/addons/xwing-cockpit) | Explicit reuse permission with Open Galaxy credit; `xwing-cockpit/LICENSE.txt` | `public/models/xwing-cockpit/scene.gltf` |
| X- Wings | [perceval-66 / Sketchfab](https://sketchfab.com/3d-models/x-wings-5dc24fdbc09544df9388890bab2434ad), [download mirror](https://github.com/BoyuanTian/threejs-xwing-lasttry.github.io/tree/main/xwings) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), original attribution retained in `license.txt` | `public/models/x-wing/scene.gltf` |
| BTL Y-wing | First Strike Development Team; FBX conversion by MichaelEGA / [Open Galaxy](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/ships/firststrike/y-wing) | [Explicit noncommercial reuse permission with credit](https://www.moddb.com/mods/first-strike/news/public-release-of-first-strike-models); see `y-wing/LICENSE.txt` | `public/models/y-wing/scene.gltf` |
| TIE fighter (runtime) | [Jeroenimo / The Dutchman](https://www.moddb.com/mods/empire-at-war-re/addons/tie-series-freerelease), [Open Galaxy source mirror](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/ships/Jeroenimo/Tie%20Fighters) | Creator permits non-monetary reuse with credit; ModDB labels the release Proprietary, not Creative Commons. See `tie-fighter-detailed/LICENSE.txt` | `public/models/tie-fighter-detailed/scene.gltf` |
| TIE fighter (comparison reference only) | [Alberto Calvo / Poly Pizza](https://poly.pizza/m/aba7TBlKyJE) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Archived at `public/models/tie-fighter.glb`; not rendered |
| Death Star 1 V1 (reference only) | [Joe Scalise / Poly Pizza](https://poly.pizza/m/8MIVor30XoN) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Archived at `public/models/death-star.glb`; not rendered |

The Y-wing permission is asset specific; Open Galaxy's Apache code license
does not supersede it. Keep this project noncommercial while using that model.
Model licenses do not grant rights to Star Wars trademarks or franchise IP.

## Loader and Orientation

X-Wing cockpit by MichaelEGA / Open Galaxy. The author's release permits reuse
with credit; its generic Creative Commons label does not specify a variant.
Downloaded 17 October 2026. Converted from the original OBJ to glTF, removing
four loose line edges while preserving its 64,651 triangles. The runtime
hides the separate nine-triangle window mesh, maps the original 4096² diffuse
and emission textures, rotates Y by π, and retains the pilot origin. Geometry
is not recentered. Metal/gloss texture is not used as a glTF metalness map.
Files and hashes are recorded in `xwing-cockpit/manifest.json`.
Reproduce geometry with `node scripts/convert-cockpit.mjs <original-OBJ-path>`;
the source URL and original blob hash are in `docs/MODEL-RESEARCH.md`.

Use Three.js `GLTFLoader` for every runtime model. They require neither Draco
nor KTX decoders. Center the loaded object with its world `Box3`, then scale
uniformly to the chosen gameplay size. Keep a parent group for movement.

| Model | Geometry | Original bounds / direction | Integration |
| --- | --- | --- | --- |
| X-wing | 45,866 triangles; 11 meshes; 16 PNGs | Root already converts source Z-up to Y-up; nose points +Z | Rotate Y by π to face the game's −Z direction; normalize maximum dimension to 19 units |
| Y-wing | 5,496 triangles; 1 mesh, 2 primitives; original diffuse PNG | About 88.2 × 26.6 × 168.8; +Y up, nose −Z | No extra rotation; normalize maximum dimension to 19 units |
| TIE | 1,412 triangles (1,394 hull + 18 engines); 512² diffuse and normal maps | Source bounds X −10.22…10.22, Y −13.75…13.75, Z −11.96…11.96; +Z forward | Rotate Y by π to face the game's −Z direction; center and scale from world bounds |
| Death Star reference | 1,166 triangles; embedded flat materials | Diameter about 0.284, off-center origin | Retained source reference; runtime station uses original procedural geometry |

The TIE glTF was converted from Jeroenimo's FBX and local source textures.
The baked shadow mesh was excluded; bind-pose transforms were baked into the
static hull and engines. Source UV orientation was preserved for glTF, and the
original tangent-space normal map is used with its green channel unchanged.
The Unity prefab's gun-bank and engine positions establish source +Z forward;
the world integration rotates it by π around Y. The model is visibly more
detailed than the prior flat Poly Pizza TIE despite its lower triangle count.
Use is limited to the creator's non-monetary permission with credit; the
original ModDB archive was not retrieved, so staged source bytes came from its
Open Galaxy repository mirror. `public/models/tie-fighter-detailed/manifest.json`
records the source, conversion, and file hashes. Reproduce with
`node scripts/convert-tie.mjs <original-fbx-path> [output-directory]`.

The Y-wing glTF was converted from the supplied FBX, extracting the intact
`y_wing__P1` mesh and excluding overlapping wreck/LOD meshes. Original source
files remain beside the conversion. Rebuild with
`node scripts/convert-y-wing.mjs`. Original X-wing and Poly Pizza files are
unmodified. `public/models/manifest.json` records file hashes and provenance.

The rendered Death Star is project-authored Three.js geometry: a 256 × 192
segmented sphere with a recessed concave superlaser dish, concentric ribs,
radial dividers, a narrow equatorial trench, and a deterministic 4096 × 2048
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

## Local Fonts

Oswald Regular and Roboto Condensed Regular/Medium are downloaded from Google
Fonts and served from `public/fonts/`. Both use the SIL Open Font License 1.1;
the original notices are retained as `Oswald-OFL.txt` and
`RobotoCondensed-OFL.txt`. Sources: [Oswald](https://github.com/google/fonts/tree/main/ofl/oswald)
and [Roboto Condensed](https://github.com/google/fonts/tree/main/ofl/robotocondensed).

## Asset Validation

`public/portraits/radio-atlas.png` — единый атлас 3×2 оригинальных портретов,
созданный встроенным ImageGen 17 октября 2026 года. Референсы костюмов:
[General Dodonna](https://www.starwars.com/databank/Jan-Dodonna) и
[Garven Dreis](https://www.starwars.com/databank/garven-dreis), StarWars.com.
Кадры-референсы не включены в игровые ресурсы. Итоговый prompt: “3×2 equal
square cinematic painted portraits on navy: Dodonna, Red Leader, Gold Leader,
Luke, Wedge, Gold Two; centered faces, period Rebel helmets and orange suits;
matching teal rimlight; no text, borders or gaps.”

Offline validation passed: both glTF dependency trees are complete, buffer
byte lengths match declarations, and both GLB headers/chunk lengths are valid.
The Y-wing conversion reruns successfully and produces the same SHA-256 hash.
Mesh bounds, counts, materials, and front direction were inspected from source
geometry. Earlier Chromium/WebGL smoke tests passed for the X-wing, Y-wing, and
former Poly Pizza TIE, with local assets and no failed requests or shader
errors. The selected Jeroenimo TIE replacement was visually compared in front
and rear three-quarter screenshots and is clearly more detailed; its final
runtime integration smoke test passed with the updated scene wiring. The
reference Death Star file also passed GLTFLoader parsing; runtime station
geometry is project-authored as explained above. Physical mobile devices and
hardware GPU performance were not measured.

The final updated build passed all 50 automated checks, including real
Chromium/WebGL loading of the new TIE and X-wing cockpit, campaign controls,
desktop/touch HUDs, and matching model comparisons. Page, shader/render and
resource-error assertions passed. Both converters are reproducible; the TIE
glTF and binary were regenerated and matched byte for byte. Cockpit UV V is
flipped in conversion to preserve the original image sampling in glTF.
