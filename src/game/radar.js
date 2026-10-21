// Pure layout helper for the flight radar strip: converts engine contact
// bearings (radians, 0 = nose) into horizontal tick positions on a -1..1
// strip. Kept free of imports and DOM access so tests can drive it directly.

const HALF_VIEW = Math.PI / 2; // contacts beyond ±90° are pinned to the strip edges

export function layoutRadar(contacts) {
  // contacts: [{ bearing, distance, kind, ally }] from the engine snapshot;
  // contacts with a missing or non-finite bearing are dropped, input order
  // is preserved.
  const rows = Array.isArray(contacts) ? contacts : [];
  const ticks = [];
  for (const contact of rows) {
    if (!contact) continue;
    const bearing = Number(contact.bearing);
    if (!Number.isFinite(bearing)) continue;
    const behind = Math.abs(bearing) > HALF_VIEW;
    const x = behind ? (bearing < 0 ? -1 : 1) : bearing / HALF_VIEW;
    ticks.push({
      x, // -1..1, 0 = nose, clipped to ±1 when behind
      behind,
      marker: contact.ally ? 'ally' : contact.kind === 'vader' ? 'vader' : 'enemy',
      distance: contact.distance,
    });
  }
  return ticks;
}
