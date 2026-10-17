import { steerDirection } from './simulation.js';
import { solveFireSolution, getEnemyWeaponProfile } from './enemy-fire-control.js';

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, n) => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => { const size = length(a); return size > 1e-6 ? mul(a, 1 / size) : { x: 0, y: 0, z: -1 }; };
const ZERO = { x: 0, y: 0, z: 0 };
const PROFILES = {
  line: { speed: 92, turnRate: 1.12, approachRange: 520, attack: 2.6, break: 2.1, reposition: 2, breakRange: 155, fireCone: 0.13, reaction: 0.24, threatRange: 260, threatWindow: 0.55, evadeGain: 0.65 },
  ace: { speed: 115, turnRate: 1.65, approachRange: 480, attack: 2.1, break: 1.7, reposition: 1.5, breakRange: 145, fireCone: 0.105, reaction: 0.12, threatRange: 340, threatWindow: 0.75, evadeGain: 1.15 },
  vader: { speed: 105, turnRate: 1.25, approachRange: 580, attack: 1.9, break: 1.5, reposition: 1.5, breakRange: 125, fireCone: 0.14, reaction: 0.16, threatRange: 320, threatWindow: 0.65, evadeGain: 0.85 },
};

export function getEnemyProfile(variant = 'line') {
  const weapon = getEnemyWeaponProfile(variant === 'vader' ? 'vader' : 'tie', variant);
  return { ...(PROFILES[variant] || PROFILES.line), shotInterval: weapon.interval, telegraph: weapon.telegraph, fireRange: weapon.range };
}

/** Solve observed constant-velocity interception, capped to avoid perfect long-range prediction. */
export function interceptPoint(origin, targetPosition, targetVelocity = ZERO, projectileSpeed = 245, maxLead = 1.4) {
  const offset = sub(targetPosition, origin);
  const a = dot(targetVelocity, targetVelocity) - projectileSpeed * projectileSpeed;
  const b = 2 * dot(offset, targetVelocity);
  const c = dot(offset, offset);
  let time = length(offset) / Math.max(1, projectileSpeed);
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6 && -c / b > 0) time = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(value => value > 0);
      if (roots.length) time = Math.min(...roots);
    }
  }
  return add(targetPosition, mul(targetVelocity, Math.min(Math.max(time, 0), maxLead)));
}

/** Only a nearby, visible bolt on an intersecting course can trigger a reaction. */
export function detectIncomingBolt(position, forward, velocity, projectiles, profile) {
  let closest = null;
  for (const bolt of projectiles || []) {
    if (bolt.owner !== 'player' && bolt.owner !== 'friendly') continue;
    const offset = sub(bolt.position, position);
    if (length(offset) > profile.threatRange || dot(unit(offset), forward) < -0.35) continue;
    const relativeVelocity = sub(bolt.velocity, velocity);
    const square = dot(relativeVelocity, relativeVelocity);
    if (square < 1) continue;
    const time = -dot(offset, relativeVelocity) / square;
    if (time <= 0 || time > profile.threatWindow) continue;
    const miss = length(add(offset, mul(relativeVelocity, time)));
    if (miss < 19 && (!closest || time < closest.time)) closest = { time, offset };
  }
  return closest;
}

export function createEnemyBrain(variant = 'line', seed = 0) {
  return { variant, seed, state: 'approach', stateTime: 0, elapsed: 0, shotCooldown: 0.2 + (Math.abs(seed) % 1) * 0.3, threatTime: 0, evadeRemaining: 0, targetId: null, breakDirection: null };
}

export function updateEnemyBrain(brain, context, delta) {
  const dt = Math.min(0.1, Math.max(0, Number(delta) || 0));
  const profile = getEnemyProfile(brain.variant);
  if (context.weaponProfile) { profile.shotInterval = context.weaponProfile.interval; profile.fireRange = context.weaponProfile.range; }
  const tactics = context.tactics;
  if (tactics?.pilotRole === 'novice') { profile.turnRate *= .82; profile.reaction *= 1.5; }
  if (tactics?.pilotRole === 'veteran' || tactics?.pilotRole === 'leader') profile.turnRate *= 1.12;
  profile.shotInterval *= tactics?.cooldownScale || 1;
  const { position, target, corridor } = context;
  const forward = unit(context.forward);
  const velocity = context.velocity || ZERO;
  const targetVelocity = target.velocity || ZERO;
  const offset = sub(target.position, position);
  const distance = length(offset);
  const side = Math.sin(brain.seed * 3.7) < 0 ? -1 : 1;
  const right = unit({ x: -forward.z, y: 0, z: forward.x });
  const enter = state => {
    brain.state = state;
    brain.stateTime = 0;
    if (state === 'break') brain.breakDirection = corridor
      ? unit({ x: side * 0.23, y: (-45 - position.y) * 0.006, z: -1 })
      : unit(add(mul(unit(offset), -1), add(mul(right, side * 0.9), { x: 0, y: 0.2, z: 0 })));
  };
  if (brain.targetId !== target.id) { brain.targetId = target.id; enter('approach'); }
  brain.elapsed += dt;
  brain.stateTime += dt;
  brain.shotCooldown = Math.max(0, brain.shotCooldown - dt);
  brain.evadeRemaining = Math.max(0, brain.evadeRemaining - dt);
  // A pass at 650 m needs up to three seconds of lead with these visible, slow bolts.
  // Use observed motion for every target, including the ships the player must defend.
  const firingSolution = solveFireSolution({ origin: position, targetPosition: target.position, targetVelocity, profile: context.weaponProfile || getEnemyWeaponProfile(brain.variant === 'vader' ? 'vader' : 'tie', brain.variant) });
  const prediction = firingSolution.reachable ? firingSolution.interceptPoint : interceptPoint(position, target.position, targetVelocity, 245, 3);
  const aimDirection = unit(sub(prediction, position));
  const alignment = dot(forward, unit(offset));

  if (distance < profile.breakRange && !['break', 'reposition'].includes(brain.state)) enter('break');
  if (brain.state === 'approach' && distance < profile.approachRange && alignment > 0.78 && brain.stateTime > 0.3) enter('telegraph');
  else if (brain.state === 'telegraph') {
    if (alignment < 0.1 || distance > 1400) enter('approach');
    else if (brain.stateTime >= profile.telegraph) enter('attack');
  } else if (brain.state === 'attack' && (brain.stateTime >= profile.attack || alignment < 0.1)) enter('break');
  else if (brain.state === 'break' && brain.stateTime >= profile.break) enter('reposition');
  else if (brain.state === 'reposition' && brain.stateTime >= profile.reposition) enter('approach');

  let desired = aimDirection;
  if (brain.state === 'break') desired = brain.breakDirection;
  else if (brain.state === 'reposition') {
    const targetHeading = length(targetVelocity) > 1 ? unit(targetVelocity) : unit(offset);
    const flank = add(sub(target.position, mul(targetHeading, 260)), mul(right, side * 210));
    desired = unit(sub(flank, position));
  }
  if (tactics?.targetOffset && ['approach', 'reposition'].includes(brain.state) && distance > 300) {
    desired = unit(sub(add(target.position, tactics.targetOffset), position));
  }
  if (tactics?.pilotRole === 'novice' && brain.state === 'approach') {
    desired = unit(add(desired, { x: Math.sin(brain.elapsed * 1.7 + brain.seed) * .085, y: Math.cos(brain.elapsed * 1.3) * .055, z: 0 }));
  }
  if (corridor) {
    // A trench is a forward pass, never an impossible U-turn through the walls.
    desired = unit({ x: Math.max(-0.24, Math.min(0.24, desired.x * 0.35)), y: Math.max(-0.15, Math.min(0.15, (-45 - position.y) * 0.008)), z: -1 });
  }

  const threat = detectIncomingBolt(position, forward, velocity, context.projectiles, profile);
  brain.threatTime = threat ? brain.threatTime + dt : 0;
  if (brain.threatTime >= profile.reaction && brain.evadeRemaining === 0) { brain.evadeRemaining = 0.65; brain.threatTime = 0; }
  if (brain.evadeRemaining > 0) desired = unit(add(desired, mul(right, side * profile.evadeGain)));

  let avoidance = { ...ZERO };
  for (const neighbor of context.neighbors || []) {
    const away = sub(position, neighbor.position);
    const separation = length(away);
    if (separation > 0.001 && separation < 70) avoidance = add(avoidance, mul(unit(away), (1 - separation / 70) * 1.8));
  }
  if (distance < 100) avoidance = add(avoidance, mul(unit(offset), -1.4));
  if (corridor) {
    if (position.x > corridor.maxX - 18) avoidance.x -= (position.x - corridor.maxX + 18) * 0.12;
    if (position.x < corridor.minX + 18) avoidance.x += (corridor.minX + 18 - position.x) * 0.12;
    if (position.y < corridor.minY + 18) avoidance.y += 1;
    if (position.y > corridor.maxY - 18) avoidance.y -= 1;
  }
  desired = unit(add(desired, avoidance));
  const direction = steerDirection(forward, desired, profile.turnRate * dt);
  const fire = firingSolution.reachable && brain.state === 'attack' && brain.shotCooldown <= 0 && distance > 160 && distance < profile.fireRange && dot(direction, aimDirection) >= Math.cos(profile.fireCone) && brain.evadeRemaining === 0;
  if (fire) brain.shotCooldown = profile.shotInterval;
  let speed = context.cruiseSpeed || profile.speed;
  speed *= tactics?.speedMultiplier || 1;
  if (brain.state === 'break') speed *= 1.08;
  if (distance < 95) speed *= 0.7;
  return { direction, aimDirection, speed, fire, state: brain.state, telegraph: brain.state === 'telegraph', evading: brain.evadeRemaining > 0 };
}
