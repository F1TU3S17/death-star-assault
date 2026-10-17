# Flight HUD

The HUD keeps the spatial hierarchy of `concepts/gameplay.png`: mission at the upper left, a small stage rail, an unobstructed firing axis, ship condition at the lower left, radio below the action, and a circular scanner at the lower right. The weapon console extends the accepted concept to expose the game's real finite ammunition, weapon switching, reloads, and S-foil interlock.

## Reference and adaptation

- [EA: You'll Feel the Difference in Starfighter Assault](https://www.ea.com/games/starwars/battlefront/news/feel): the official Battlefront II space-combat reference, including ship-specific weapons, leading targets, and multi-stage objectives.
- [EA: Starfighter Assault gameplay trailer](https://www.youtube.com/watch?v=nWHQ77BZDZg): reference for sparse overlays, clear white pictograms, compact equipment slots, and space left around the ship and aiming area.

The design borrows this hierarchy, not EA's assets. All HUD text and controls are HTML; weapon, shield, hull, and chevron pictograms are original inline SVG in `src/hud-icons.js`. Existing portraits remain the game's licensed atlas.

## Tokens and behavior

- White `#e7ecee`: labels, hull, selected equipment; muted blue-gray `#a0b0b9`: secondary readouts.
- Cyan `#a0d3e4`: shield and ion systems; gold `#ecc17b`: mission, aiming, torpedo readiness and radio identification; coral `#ed8b79`: empty, blocked or overheated systems.
- One-pixel rails, translucent edge fades, square geometry, condensed type, and no enclosing HUD cards. Oswald is reserved for mission labels and numeric readouts.
- Laser and ion slots have different silhouettes. Their segmented bar reflects actual weapon heat. Torpedoes show one cell per launcher round, reserve count, cooldown readiness and reload time/progress. No decorative ammunition is displayed.
- Weapon IDs, arrow controls, reload control, `aria-pressed`, and keyboard mappings are retained. The state is exposed as `data-weapon` and `data-state` on the weapon console.
- On touch portrait screens, flight controls have their own bottom lane. An open systems panel moves the radio into the left lane to keep both readable. On a short landscape screen the systems panel scrolls and overlays the equipment area only while explicitly opened.

The pause screen offers explicit HD and performance modes. The HUD does not change quality automatically.
