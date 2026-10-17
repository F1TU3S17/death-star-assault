# Audio source research: Death Star Assault

Research/download date: 2026-10-17. Scope: use real creator-made sci-fi sound effects for a public, noncommercial Star Wars-inspired fan game. The audio below is generic sci-fi material, not Star Wars film recordings or licensed Lucasfilm assets. I did not find an official Lucasfilm source explicitly permitting reuse of film audio during this pass.

## Downloaded and integrated

All ten shortlisted OGG files are integrated under `public/audio/kenney/` and `public/audio/rubberduck/`. `public/audio/manifest.json` maps game events to these local files with controlled gain. Kenney's original `License.txt` is included alongside the effects; `public/audio/CREDITS.txt` records both creators and source/license URLs, and `public/audio/sources.json` records file sizes and SHA-256 hashes. The source archives remain in the research staging directory, outside the game delivery.

| Local asset | Suggested game use | Creator and license |
|---|---|---|
| `kenney/laserSmall_000.ogg` | Rapid blaster shot | Kenney, CC0 |
| `kenney/laserSmall_001.ogg` | Alternate rapid blaster shot | Kenney, CC0 |
| `kenney/laserLarge_000.ogg` | Heavy cannon or torpedo shot | Kenney, CC0 |
| `kenney/explosionCrunch_000.ogg` | Ship hit / explosion | Kenney, CC0 |
| `kenney/lowFrequency_explosion_000.ogg` | Heavy explosion layer | Kenney, CC0 |
| `kenney/forceField_000.ogg` | Shield impact / energy hit | Kenney, CC0 |
| `kenney/spaceEngineLarge_000.ogg` | Large ship engine bed | Kenney, CC0 |
| `kenney/thrusterFire_000.ogg` | Engine boost / pass cue | Kenney, CC0 |
| `rubberduck/beep_01.ogg` | Target lock / droid-like generic beep | rubberduck, CC0 |
| `rubberduck/terminal_01.ogg` | Console / targeting UI sound | rubberduck, CC0 |

The table above describes the source palette. The actual runtime mapping is listed below; continuous engine throttle and the additional radio, astromech, alarm, vent and outcome phrases retain original synthesis. The OGG container signatures were verified. Kenney's archive itself describes the pack as 70 normalized OGG files with engines, explosions and lasers; its included `License.txt` says CC0 and identifies Kenney as creator. Kenney's attribution request is optional. The rubberduck archive's OpenGameArt entry explicitly states CC0 and describes the 50-file set as including beeps, explosions, retro laser, rocket, shooting, and terminal sounds.

## Source and license records

- Kenney: [official asset page](https://kenney.nl/assets/sci-fi-sounds), [OpenGameArt source listing](https://opengameart.org/content/sci-fi-sounds), direct archive `https://opengameart.org/sites/default/files/sci-fi_sounds.zip`. The listing says 70 separate OGG files and a 5.9 MB archive. Staged archive: `kenney-sci-fi-sounds.zip`.
- rubberduck: [OpenGameArt source listing](https://opengameart.org/content/50-cc0-sci-fi-sfx), direct archive `https://opengameart.org/sites/default/files/sci-fi-sfx.zip`. The listing says CC0 and describes 50 effects including beeps and terminal sounds. Staged archive: `rubberduck-50cc0.zip`.
- An additional creator-made pack was downloaded for optional follow-up but not extracted into the shortlist: [messersm — Space Sound Effects](https://opengameart.org/content/space-sound-effects), CC0, 6 laser sounds, 6 explosions, warp-out, and message sound; archive `messersm-space-sfx.zip`.

## Staged file integrity

| File | Bytes | SHA-256 |
|---|---:|---|
| `kenney/explosionCrunch_000.ogg` | 28274 | `4B597D658D0AE101F0A030FBEEA5FC3A4292AB85F017470A8254A8E7959CBD69` |
| `kenney/forceField_000.ogg` | 25672 | `C2916F2A062C8DDD1ACA2826D134FE90847037DB31342726FFB0F9097AFE339C` |
| `kenney/laserLarge_000.ogg` | 25566 | `A56D95794CD732D6C2D66CE488C14CF557FE526C282897C9A77675C2BD9B77E6` |
| `kenney/laserSmall_000.ogg` | 7286 | `72B589EADD41781257AC859E4F4D030222E623390E4A1A83F6D05329A6E026F1` |
| `kenney/laserSmall_001.ogg` | 7448 | `AB87913ABA9790A0C5FA173D086267BA521AD522FCAD2252271DB49988313CF5` |
| `kenney/lowFrequency_explosion_000.ogg` | 14317 | `3CB48D86DAB63140CFB9AAEEA4D4A6846ABACA5831D157D8ADBEC0490DA26343` |
| `kenney/spaceEngineLarge_000.ogg` | 189900 | `885AEDA16116B715BE5E8FD03D0D77959761015E1CA5823FD3B53D4FD965107F` |
| `kenney/thrusterFire_000.ogg` | 201216 | `0FDC474D93F209DEBF1FC4EA77765A669DCB7676DB31B4D8A0A509685BCCF374` |
| `rubberduck/beep_01.ogg` | 9764 | `6D82719549FC522A25D572A14BC4F204E39B78F28A6CA8CFC3E0FC95C4A1B738` |
| `rubberduck/terminal_01.ogg` | 12708 | `CDE6464D6DC78EA0A96CD06E2D2777E98F202B30A82C3F5295DFEE11A284446E` |


## Runtime mapping

| Event | Bundled file | Gain |
|---|---|---:|
| `laser` | `kenney/laserSmall_000.ogg` | 0.48 |
| `enemyLaser` | `kenney/laserSmall_001.ogg` | 0.40 |
| `turbolaser` | `kenney/laserLarge_000.ogg` | 0.52 |
| `torpedo` | `kenney/thrusterFire_000.ogg` | 0.35 |
| `ion`, `shieldHit` | `kenney/forceField_000.ogg` | 0.45 / 0.38 |
| `hullHit` | `kenney/explosionCrunch_000.ogg` | 0.46 |
| `explosion` | `kenney/lowFrequency_explosion_000.ogg` | 0.65 |
| `ability` (non-ion) | `kenney/spaceEngineLarge_000.ogg` | 0.28 |
| `lock-search` | `rubberduck/beep_01.ogg` | 0.22 |
| `lock-locked`, `cue` | `rubberduck/terminal_01.ogg` | 0.30 / 0.28 |

All bundled recordings are short (0.239–5 seconds). They replace, rather than double, the corresponding synthetic effect after successful Web Audio decoding. Until decoding completes or if it fails, the synthetic version remains available. These samples do not contain the film's actors, music, R2-D2 voice, or authentic Lucasfilm blaster recordings.
