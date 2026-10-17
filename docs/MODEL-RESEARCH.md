# Model research — 17 October 2026

## Usable local candidate

**X-wing cockpit by MichaelEGA / Open Galaxy** is downloaded and converted in
`D:/vibe/death-star-assets-research/open-galaxy-xwing-cockpit/`. Runtime glTF,
geometry, diffuse, emission, permission notice and manifest have been promoted
to `public/models/xwing-cockpit/`. `src/game/detailed-cockpit.js` loads the
cockpit with a procedural fallback and ship-specific visibility. The source comes from the creator's
[repository](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/cockpit/xwing).
The author's [asset release](https://www.moddb.com/games/open-galaxy/addons/xwing-cockpit)
explicitly allows reuse with credit to Open Galaxy, and provides a modifiable
Blender original. ModDB's generic Creative Commons label does not identify a
variant: record the explicit permission, not an invented CC BY version.

Verified from the actual downloaded geometry and PNG headers:

- 64,642 cockpit triangles plus 9 transparent window triangles; 2 meshes.
- OBJ 5,940,991 bytes; converted geometry 6,206,496 bytes.
- Diffuse 10,179,446 bytes, emission 227,186 bytes, metal 615,550 bytes;
  each PNG is 4096 × 4096. Source glass JPEG also retained (321,371 bytes).
- Bounds: X −0.53764…0.53877; Y −0.40432…0.24431;
  Z −0.23510…1.21019. Units and camera eye require rendered calibration.
- `scene.gltf` / `scene.bin` reference local diffuse and emission PNGs.
  No Draco, KTX, external URLs, or authentication needed at runtime.
- Source OBJ has four loose line edges among its faces. Three.js OBJLoader
  consequently classifies the cockpit as LineSegments. The reproducible staged
  converter removes only `l ` entries and preserves every polygon, producing
  an ordinary triangle mesh. Leaving those entries causes a broken import.
- UV V is inverted during conversion to preserve OBJ/TextureLoader sampling
  with glTF's unflipped local images; attaching the original PNGs without this
  conversion misaligns the cockpit and emission atlas.
- Unity metallic/gloss texture is retained but unassigned: glTF uses different
  channel semantics. Base material is conservative roughness .75 / metalness .15.
  Window transparency is a provisional integration value, not a source property.

The diffuse atlas was visually inspected and includes substantial instrument,
pipe, frame, and canopy detail. This is a strong cockpit improvement candidate.
**A rendered camera-fit/canon check remains necessary before final acceptance.** A
4096² RGBA texture costs about 85 MiB with mipmaps, regardless of PNG size;
downsample or transcode the diffuse/emission for a mobile quality tier.

Reproduce geometry with `node scripts/convert-cockpit.mjs <original-OBJ-path>`.
The unmodified source OBJ is staged outside runtime assets. Download it from
[the creator](https://raw.githubusercontent.com/MichaelEGA/Open-Galaxy/main/Assets/Data/objects/cockpit/xwing/xwing_cockpit.obj);
verified original Git blob SHA is `06e183c3c2ed12465c7db23febdb997a234205ba`.
The runtime rotates Y by π and starts at the creator prefab offset transformed
to `(0.033203125, -0.03557968, -0.072753906)` with the pilot eye near the origin.

## Exterior choices

**Selected TIE: Jeroenimo / The Dutchman, standard TIE Fighter.** The staged
FBX candidate was rendered from front and rear three-quarter views and clearly
outperformed the previous Poly Pizza model's flat materials. It keeps the
flight silhouette at 1,412 triangles (1,394 hull + 18 engine) and adds original
512² diffuse and tangent-space normal maps. The old 2,146-triangle Poly Pizza
TIE remains only as a comparison reference. Source forward is +Z; the game
rotates Y by π to face its −Z flight direction.

The creator's [ModDB release](https://www.moddb.com/mods/empire-at-war-re/addons/tie-series-freerelease)
permits non-monetary reuse with credit and identifies Jeroenimo as the author
of the models and textures. ModDB labels the release Proprietary, so this is
not a Creative Commons asset. The original archive download endpoint reset;
the staged FBX and textures came from the [Open Galaxy repository mirror](https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/ships/Jeroenimo/Tie%20Fighters)
and were not hash-compared with the archive. See
`public/models/tie-fighter-detailed/manifest.json` for hashes, conversion,
source orientation evidence, and the exact reuse terms. Rebuild with
`node scripts/convert-tie.mjs <original-fbx-path> [output-directory]`.

Retain the current perceval-66 X-wing exterior (45,866 triangles / working
S-foil rig). A replacement requires redoing the rig and does not guarantee a
better in-game image than improving its current PBR material/lighting.

| Candidate | Verified source facts | Decision / risk |
| --- | --- | --- |
| [DanielAndersson TIE/ln](https://sketchfab.com/3d-models/star-wars-tieln-fighter-79d9403f15334c129ea5454daffe6b5c) | CC Attribution; 90.2k triangles; creator says Blender and updated 2022 | Promising higher-detail canonical exterior, but no locally retrieved authorized download in this pass; do not replace current file with a guessed CDN URL. |
| [born2012 TIE](https://sketchfab.com/3d-models/star-wars-tie-fighter-a823acd4b7f243dd9ae4ab50a1a12b07) | CC Attribution; 19.3k triangles; creator says Blender 3.5.1 | Better browser geometry budget; download, texture quality, and canon fidelity not validated. |
| [nekiv TIE](https://sketchfab.com/3d-models/tie-fighter-be87d79b75be4c06bf7b70f477fceb44) | CC Attribution; 116.5k triangles | Costly for many enemies; no local payload validated. |
| [Daniel X-wing cockpit](https://sketchfab.com/3d-models/star-wars-x-wing-cockpit-7e57fce23c7b4a929f15823d58fcaa27) | CC Attribution; 15.1k triangles; author says only front and partial side views needed | Smaller candidate, incomplete rear views; not downloaded. Locally available Open Galaxy cockpit is preferable for this pass. |
| [charles.woods X-wing](https://sketchfab.com/3d-models/high-poly-x-wing-fighter-f2170d4a3ee04e8588c0ad29d4f91767) | CC Attribution; approximately 1M triangles; detailed cockpit/wings | Exclude from browser fleet without substantial reduction; no animation supplied. |

Sketchfab counts above are provider page values, not inspection of downloaded
files. The Poly Pizza TIE remains archived for comparison and is not the
runtime TIE model.

## Other verified sources

- [Open Galaxy TIE cockpit](https://www.moddb.com/games/open-galaxy/addons/tie-fighter-cockpit):
  creator explicitly permits use with credit, describes two pieces and
  diffuse/emission materials. Not downloaded because the player flies Rebels.
- [First Strike public release](https://www.moddb.com/mods/first-strike/news/public-release-of-first-strike-models):
  explicit noncommercial reuse permission with First Strike Development Team
  credit. Legacy `x-wing.fbx` downloaded in staging for comparison only; the
  separate newer cockpit above is preferred. No broad Apache asset assumption.
- [ambientCG Metal032](https://ambientcg.com/view?id=Metal032): CC0 PBR grey metal,
  1K JPG ZIP about 3 MB / 2K about 12 MB. Appropriate generic material accent,
  not a canonical Death Star greeble replacement; no file promoted or downloaded.

No paid asset, official-game rip, unlicensed mirror, or provider hotlink was
added. Star Wars franchise rights remain separate from the model licenses.
