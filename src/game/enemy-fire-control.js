import { steerDirection } from './simulation.js';

const ZERO = { x: 0, y: 0, z: 0 };
const FORWARD = { x: 0, y: 0, z: -1 };
const finiteVector = value => value && [value.x, value.y, value.z].every(Number.isFinite);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, amount) => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = a => Math.hypot(a.x, a.y, a.z);
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const unit = value => finiteVector(value) && Number.isFinite(length(value)) && length(value) > 1e-9 ? mul(value, 1 / length(value)) : { ...FORWARD };

/** Projectile physics and accuracy belong to weapons, independently of flight tactics. */
export function getEnemyWeaponProfile(kind = 'tie', variant = 'line', { pilotRole, allyTarget = false, relayBonus = false } = {}) {
  if (kind === 'turret') {
    const heavy = variant === 'heavy';
    return {
      speed: heavy ? 520 : 420,
      damage: (heavy ? 24 : 14) * (relayBonus ? 0.65 : 1),
      interval: (heavy ? 2.3 : 2.8) * (relayBonus ? 1.4 : 1),
      range: 1500, lifetime: 4.5,
      turnRate: heavy ? 0.65 : 0.9,
      telegraph: heavy ? 0.85 : 0.7,
      dispersion: heavy ? 0.0015 : 0.0025,
      muzzleDistance: heavy ? 43 : 29,
    };
  }
  const vader = kind === 'vader' || variant === 'vader';
  const roleDispersion = { novice: 0.009, line: 0.004, veteran: 0.0025, leader: 0.0015 };
  return {
    speed: 245, damage: vader ? 13 : allyTarget ? 6 : 10,
    interval: vader ? 1.15 : variant === 'ace' ? 1 : 1.25,
    range: 650, lifetime: 4.5, turnRate: 0,
    telegraph: vader ? 0.75 : variant === 'ace' ? 0.6 : 0.85,
    dispersion: roleDispersion[pilotRole] ?? (vader ? 0.0015 : variant === 'ace' ? 0.0025 : 0.004),
    muzzleDistance: 14,
  };
}

/** Solve |target + velocity*t - base| = speed*t + muzzleDistance. */
export function solveFireSolution({ origin, targetPosition, targetVelocity = ZERO, profile, muzzleDistance = profile?.muzzleDistance ?? 14, sampleX = 0, sampleY = 0, precision = 1 } = {}) {
  const base = finiteVector(origin) ? { ...origin } : { ...ZERO };
  const target = finiteVector(targetPosition) ? { ...targetPosition } : { ...base };
  const offset = sub(target, base);
  const fallback = { direction: unit(offset), origin: base, interceptPoint: target, flightTime: 0, reachable: false };
  if (!finiteVector(origin) || !finiteVector(targetPosition) || !finiteVector(targetVelocity)
    || !profile || ![profile.speed, profile.lifetime, profile.range, muzzleDistance].every(Number.isFinite)
    || profile.speed <= 0 || profile.lifetime <= 0 || profile.range <= 0 || muzzleDistance < 0) return fallback;
  const distance = length(offset);
  if (!Number.isFinite(distance) || distance <= muzzleDistance || distance > profile.range) return fallback;
  const a = dot(targetVelocity, targetVelocity) - profile.speed ** 2;
  const b = 2 * (dot(offset, targetVelocity) - profile.speed * muzzleDistance);
  const c = dot(offset, offset) - muzzleDistance ** 2;
  if (![a, b, c].every(Number.isFinite)) return fallback;
  let roots = [];
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) roots = [-c / b];
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      // Stable quadratic roots also cover almost equal target and bolt speeds.
      const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
      roots = q === 0 ? [-b / (2 * a)] : [q / a, c / q];
    }
  }
  const flightTime = Math.min(...roots.filter(time => Number.isFinite(time) && time > 0));
  if (!Number.isFinite(flightTime) || flightTime > profile.lifetime) return fallback;
  const interceptPoint = add(target, mul(targetVelocity, flightTime));
  if (!finiteVector(interceptPoint)) return fallback;
  const aim = unit(sub(interceptPoint, base));
  const horizontal = finiteVector(aim) ? unit(cross(aim, Math.abs(aim.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 })) : FORWARD;
  const vertical = unit(cross(horizontal, aim));
  let x = Number.isFinite(sampleX) ? clamp(sampleX, -1, 1) : 0;
  let y = Number.isFinite(sampleY) ? clamp(sampleY, -1, 1) : 0;
  const sampleLength = Math.hypot(x, y);
  if (sampleLength > 1) { x /= sampleLength; y /= sampleLength; }
  const dispersion = Math.max(0, Number.isFinite(profile.dispersion) ? profile.dispersion : 0)
    * clamp(Number.isFinite(precision) ? precision : 1, 0, 1);
  const tangent = Math.tan(Math.min(dispersion, Math.PI / 4));
  const direction = unit(add(aim, add(mul(horizontal, x * tangent), mul(vertical, y * tangent))));
  return { direction, origin: add(base, mul(direction, muzzleDistance)), interceptPoint, flightTime, reachable: true };
}

/** A visible rotating barrel must acquire and warn before each ordinary bolt. */
export function createTurretBrain(variant = 'light', initialCooldown = 1.6) {
  const startingCooldown = Number.isFinite(initialCooldown) ? Math.max(0, initialCooldown) : 1.6;
  let direction, targetId, cooldown, charge, initialized;
  function reset() {
    direction = { ...FORWARD };
    targetId = null;
    cooldown = startingCooldown;
    charge = 0;
    initialized = false;
  }
  function update({ position, forward = FORWARD, target, relayBonus = false } = {}, delta) {
    const dt = Number.isFinite(delta) && delta > 0 ? Math.min(delta, 0.1) : 0;
    const profile = getEnemyWeaponProfile('turret', variant, { relayBonus });
    const validTarget = target && target.id != null && finiteVector(target.position) && finiteVector(target.velocity ?? ZERO) && finiteVector(position);
    const solution = solveFireSolution({ origin: position, targetPosition: target?.position, targetVelocity: target?.velocity ?? ZERO, profile });
    const aimDirection = solution.direction;
    if (!initialized && finiteVector(forward)) {
      direction = unit(forward);
      initialized = true;
    }
    if (dt === 0) return { direction: { ...direction }, aimDirection, fire: false, telegraph: charge / profile.telegraph, state: targetId === null ? 'idle' : 'tracking', profile, solution };
    cooldown = Math.max(0, cooldown - dt);
    if (!validTarget || !solution.reachable) {
      targetId = null;
      charge = 0;
      return { direction: { ...direction }, aimDirection, fire: false, telegraph: 0, state: 'idle', profile, solution };
    }
    if (targetId !== target.id) {
      targetId = target.id;
      charge = 0;
    }
    direction = unit(steerDirection(direction, aimDirection, profile.turnRate * dt));
    if (cooldown <= profile.telegraph) charge = Math.min(profile.telegraph, charge + dt);
    const aligned = dot(direction, aimDirection) >= Math.cos(0.012);
    const telegraph = cooldown <= profile.telegraph ? clamp(charge / profile.telegraph, 0, 1) : 0;
    const fire = aligned && cooldown <= 1e-8 && charge >= profile.telegraph - 1e-8;
    const state = fire ? 'attack' : telegraph > 0 ? 'telegraph' : 'tracking';
    if (fire) {
      cooldown = profile.interval;
      charge = 0;
    }
    return { direction: { ...direction }, aimDirection, fire, telegraph, state, profile, solution };
  }
  reset();
  return { update, reset };
}
