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
  let reserves;
  let reloadClocks;
  const current = () => loadout[selectedIndex];
  function reset() {
    selectedIndex = 0;
    ammunition = Object.fromEntries(loadout.map(profile => [profile.id, profile.ammo == null ? null : Math.max(0, Math.floor(profile.ammo))]));
    cooldowns = Object.fromEntries(loadout.map(profile => [profile.id, 0]));
    reserves = Object.fromEntries(loadout.map(profile => [profile.id, profile.ammo == null ? null : Math.max(0, Math.floor(profile.reserve || 0))]));
    reloadClocks = Object.fromEntries(loadout.map(profile => [profile.id, 0]));
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
    if (!Number.isFinite(dt) || dt <= 0) return [];
    const completed = [];
    for (const id of Object.keys(cooldowns)) cooldowns[id] = Math.max(0, cooldowns[id] - dt);
    for (const profile of loadout) {
      if (reloadClocks[profile.id] <= 0) continue;
      reloadClocks[profile.id] = Math.max(0, reloadClocks[profile.id] - dt);
      if (reloadClocks[profile.id] < 1e-8) reloadClocks[profile.id] = 0;
      if (reloadClocks[profile.id] === 0) {
        const loaded = Math.min(Math.max(0, Math.floor(profile.ammo) - ammunition[profile.id]), reserves[profile.id]);
        ammunition[profile.id] += loaded;
        reserves[profile.id] -= loaded;
        completed.push(profile.id);
      }
    }
    return completed;
  }
  function reload() {
    const profile = current();
    if (profile.ammo == null || ammunition[profile.id] >= profile.ammo || reserves[profile.id] <= 0 || reloadClocks[profile.id] > 0) return false;
    reloadClocks[profile.id] = Math.max(0.1, profile.reloadDuration || 4.5);
    return true;
  }
  function consumeShot() {
    const profile = current();
    if (cooldowns[profile.id] > 0 || reloadClocks[profile.id] > 0 || ammunition[profile.id] === 0) return false;
    cooldowns[profile.id] = profile.cooldown;
    if (ammunition[profile.id] !== null) ammunition[profile.id] -= 1;
    return true;
  }
  const getSnapshot = () => loadout.map((profile, index) => ({ ...profile, ammo: ammunition[profile.id], reserve: reserves[profile.id], cooldown: cooldowns[profile.id], reloading: reloadClocks[profile.id] > 0, reloadRemaining: reloadClocks[profile.id], reloadDuration: profile.ammo == null ? 0 : profile.reloadDuration || 4.5, selected: index === selectedIndex }));
  reset();
  return { reset, select, cycle, update, reload, consumeShot, current: () => ({ ...current() }), getSnapshot };
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

const POWER_PROFILES = {
  balanced: { speed: 1, boost: 1, damage: 1, cooling: 1, shieldRegen: 1 },
  engines: { speed: 1.18, boost: 1.18, damage: 1, cooling: 0.75, shieldRegen: 0.6 },
  weapons: { speed: 0.9, boost: 0.9, damage: 1.2, cooling: 1.2, shieldRegen: 1 },
  shields: { speed: 0.88, boost: 0.88, damage: 1, cooling: 0.72, shieldRegen: 2 },
};

/** Arcade multipliers model diverting power between the ship's existing systems. */
export function getPowerProfile(mode = 'balanced') {
  return { ...(POWER_PROFILES[mode] || POWER_PROFILES.balanced) };
}

export function createRepairSystem() {
  let charges, active, remaining, cooldown;
  function reset() { charges = 2; active = false; remaining = 0; cooldown = 0; }
  function start(health, maxHealth) {
    if (active || cooldown > 0 || charges <= 0 || health >= maxHealth) return false;
    charges -= 1;
    active = true;
    remaining = 3;
    cooldown = 20;
    return true;
  }
  function interrupt() {
    if (!active) return false;
    active = false;
    remaining = 0;
    return true;
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    cooldown = Math.max(0, cooldown - dt);
    if (cooldown < 1e-8) cooldown = 0;
    if (!active) return 0;
    remaining = Math.max(0, remaining - dt);
    if (remaining > 1e-8) return 0;
    remaining = 0;
    active = false;
    return 25;
  }
  const getSnapshot = () => ({ charges, active, remaining, cooldown });
  reset();
  return { reset, start, interrupt, update, getSnapshot };
}

export function createSupportSystem() {
  let charges, cooldown;
  function reset() { charges = 3; cooldown = 0; }
  function request() {
    if (charges <= 0 || cooldown > 0) return false;
    charges -= 1;
    cooldown = 25;
    return true;
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    cooldown = Math.max(0, cooldown - dt);
    if (cooldown < 1e-8) cooldown = 0;
  }
  const getSnapshot = () => ({ charges, cooldown });
  reset();
  return { reset, request, update, getSnapshot };
}
