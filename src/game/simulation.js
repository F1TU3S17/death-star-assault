/** Pure arithmetic shared by combat and deterministic tests. */
export function absorbDamage(health, shields, amount) {
  const damage = Math.max(0, Number(amount) || 0);
  const absorbed = Math.min(Math.max(0, shields), damage);
  return { health: Math.max(0, health - (damage - absorbed)), shields: Math.max(0, shields - absorbed) };
}

/** Segment collision avoids fast bolts tunnelling between render frames. */
export function segmentSphereHit(start, end, center, radius) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1,
    ((center.x - start.x) * dx + (center.y - start.y) * dy + (center.z - start.z) * dz) / length));
  const x = start.x + dx * t - center.x;
  const y = start.y + dy * t - center.y;
  const z = start.z + dz * t - center.z;
  return x * x + y * y + z * z <= radius * radius;
}

export const clampFrameDelta = delta => Math.max(0, Math.min(Number(delta) || 0, 0.05));

/** Independent per-weapon magazines and clocks prevent switch/reselect cooldown bypasses. */
export function createArmament(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) throw new Error('At least one weapon profile is required');
  const loadout = profiles.map(profile => ({ ...profile }));
  let selectedIndex = 0;
  let ammunition;
  let cooldowns;
  const current = () => loadout[selectedIndex];
  function reset() {
    selectedIndex = 0;
    ammunition = Object.fromEntries(loadout.map(profile => [profile.id, profile.ammo == null ? null : Math.max(0, Math.floor(profile.ammo))]));
    cooldowns = Object.fromEntries(loadout.map(profile => [profile.id, 0]));
  }
  function select(id) {
    const index = loadout.findIndex(profile => profile.id === id);
    if (index < 0) return false;
    selectedIndex = index;
    return true;
  }
  function cycle(direction = 1) {
    selectedIndex = (selectedIndex + (direction < 0 ? -1 : 1) + loadout.length) % loadout.length;
    return current().id;
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - dt);
  }
  function consumeShot() {
    const profile = current();
    if (cooldowns[profile.id] > 0 || ammunition[profile.id] === 0) return false;
    cooldowns[profile.id] = profile.cooldown;
    if (ammunition[profile.id] !== null) ammunition[profile.id] -= 1;
    return true;
  }
  const getSnapshot = () => loadout.map((profile, index) => ({ ...profile, ammo: ammunition[profile.id], cooldown: cooldowns[profile.id], selected: index === selectedIndex }));
  reset();
  return { reset, select, cycle, update, consumeShot, current: () => ({ ...current() }), getSnapshot };
}

export function insideLockCone(origin, forward, target, minDot = 0.94, maxDistance = 1700) {
  const x = target.x - origin.x;
  const y = target.y - origin.y;
  const z = target.z - origin.z;
  const distance = Math.hypot(x, y, z);
  const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
  if (distance === 0 || distance > maxDistance || forwardLength === 0) return false;
  return (x * forward.x + y * forward.y + z * forward.z) / (distance * forwardLength) >= minDot;
}

/** Spherical interpolation limits a guided projectile to its actual turn rate. */
export function steerDirection(current, desired, maxRadians) {
  const aLength = Math.hypot(current.x, current.y, current.z);
  const bLength = Math.hypot(desired.x, desired.y, desired.z);
  if (aLength === 0 || bLength === 0) return { x: current.x, y: current.y, z: current.z };
  const a = { x: current.x / aLength, y: current.y / aLength, z: current.z / aLength };
  const b = { x: desired.x / bLength, y: desired.y / bLength, z: desired.z / bLength };
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const angle = Math.acos(dot);
  const step = Math.max(0, Number(maxRadians) || 0);
  if (step >= angle || angle < 0.00001) return b;
  if (step === 0) return a;
  if (dot < -0.9999) {
    const axis = Math.abs(a.x) < 0.9 ? { x: 0, y: a.z, z: -a.y } : { x: -a.z, y: 0, z: a.x };
    const axisLength = Math.hypot(axis.x, axis.y, axis.z);
    return { x: a.x * Math.cos(step) + axis.x / axisLength * Math.sin(step), y: a.y * Math.cos(step) + axis.y / axisLength * Math.sin(step), z: a.z * Math.cos(step) + axis.z / axisLength * Math.sin(step) };
  }
  const ratio = step / angle;
  const factorA = Math.sin((1 - ratio) * angle) / Math.sin(angle);
  const factorB = Math.sin(ratio * angle) / Math.sin(angle);
  return { x: a.x * factorA + b.x * factorB, y: a.y * factorA + b.y * factorB, z: a.z * factorA + b.z * factorB };
}

export function splashDamage(distance, radius, damage) {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0 || distance >= radius) return 0;
  return Math.max(0, Number(damage) || 0) * (1 - Math.max(0, distance) / radius);
}
