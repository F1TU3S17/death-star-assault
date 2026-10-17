import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurretBrain, getEnemyWeaponProfile, solveFireSolution } from '../src/game/enemy-fire-control.js';
import { segmentSphereHit } from '../src/game/simulation.js';

const zero = { x: 0, y: 0, z: 0 };
const forward = { x: 0, y: 0, z: -1 };
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, amount) => ({ x: a.x * amount, y: a.y * amount, z: a.z * amount });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const magnitude = a => Math.hypot(a.x, a.y, a.z);
const alignment = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const context = overrides => ({ position: zero, forward, target: { id: 'player', position: { x: 0, y: 0, z: -1000 }, velocity: zero }, ...overrides });

test('weapon profiles retain damage and cadence while bounding dispersion and travel time', () => {
  const line = getEnemyWeaponProfile();
  assert.equal(line.speed, 245);
  assert.equal(line.damage, 10);
  assert.equal(line.interval, 1.25);
  assert.equal(getEnemyWeaponProfile('tie', 'line', { allyTarget: true }).damage, 6);
  assert.equal(getEnemyWeaponProfile('vader').damage, 13);
  assert.equal(getEnemyWeaponProfile('turret').damage, 14);
  assert.equal(getEnemyWeaponProfile('turret', 'heavy').damage, 24);
  assert.equal(getEnemyWeaponProfile('turret', 'heavy', { relayBonus: true }).damage, 24 * 0.65);
  assert.equal(getEnemyWeaponProfile('turret', 'light', { relayBonus: true }).interval, 2.8 * 1.4);
  assert.deepEqual(['novice', 'line', 'veteran', 'leader'].map(pilotRole => getEnemyWeaponProfile('tie', 'line', { pilotRole }).dispersion), [0.009, 0.004, 0.0025, 0.0015]);
  line.damage = 999;
  assert.equal(getEnemyWeaponProfile().damage, 10, 'profiles are independent values');
});

test('muzzle-offset interception meets moving targets at actual projectile travel time', () => {
  const profile = getEnemyWeaponProfile('turret');
  const targetPosition = { x: 0, y: 0, z: -1500 };
  const targetVelocity = { x: 130, y: 22, z: 0 };
  const solution = solveFireSolution({ origin: zero, targetPosition, targetVelocity, profile });
  assert.equal(solution.reachable, true);
  assert.ok(solution.flightTime > 3 && solution.flightTime < profile.lifetime);
  const boltPosition = add(solution.origin, mul(solution.direction, profile.speed * solution.flightTime));
  const targetAtImpact = add(targetPosition, mul(targetVelocity, solution.flightTime));
  assert.ok(magnitude(sub(boltPosition, targetAtImpact)) < 1e-8);
  assert.ok(Math.abs(magnitude(solution.origin) - profile.muzzleDistance) < 1e-8);
  const override = solveFireSolution({ origin: zero, targetPosition, targetVelocity: zero, profile, muzzleDistance: 40 });
  assert.ok(Math.abs(override.flightTime - 1460 / 420) < 1e-10);
});

test('real finite-speed turret bolts collide with lateral and incoming targets at 1000–1500 metres', () => {
  for (const variant of ['light', 'heavy']) {
    const profile = getEnemyWeaponProfile('turret', variant);
    for (const distance of [1000, 1250, 1500]) {
      for (const velocity of [{ x: 110, y: 28, z: 0 }, { x: 45, y: -12, z: 150 }]) {
        for (const sample of [[0, 0], [1, 1], [-1, 0], [0, -1]]) {
          const position = { x: 0, y: 0, z: -distance };
          const shot = solveFireSolution({ origin: zero, targetPosition: position, targetVelocity: velocity, profile, sampleX: sample[0], sampleY: sample[1] });
          assert.equal(shot.reachable, true, `${variant} at ${distance}`);
          let hit = false;
          const relativeVelocity = sub(mul(shot.direction, profile.speed), velocity);
          const start = sub(shot.origin, position);
          // Swept relative collision follows both moving bodies, using ordinary bolts.
          for (let time = 0; time < profile.lifetime; time += 1 / 120) {
            if (segmentSphereHit(add(start, mul(relativeVelocity, time)), add(start, mul(relativeVelocity, time + 1 / 120)), zero, 7)) { hit = true; break; }
          }
          assert.ok(hit, `${variant} bolt missed at ${distance}, velocity ${JSON.stringify(velocity)}, sample ${sample}`);
        }
      }
    }
  }
});

test('solutions reject impossible, expired, out-of-range and invalid targets without NaNs', () => {
  const profile = getEnemyWeaponProfile('turret');
  const cases = [
    { targetPosition: { x: 0, y: 0, z: -1000 }, targetVelocity: { x: 0, y: 0, z: -900 } },
    { targetPosition: { x: 0, y: 0, z: -1501 } },
    { targetPosition: zero },
    { targetPosition: { x: NaN, y: 0, z: 0 } },
    { targetPosition: { x: 0, y: 0, z: -1000 }, targetVelocity: { x: Infinity, y: 0, z: 0 } },
    { targetPosition: { x: 0, y: 0, z: -1000 }, profile: { ...profile, lifetime: 1 } },
    { targetPosition: { x: 0, y: 0, z: -1000 }, profile: { ...profile, speed: 0 } },
  ];
  for (const input of cases) {
    const shot = solveFireSolution({ origin: zero, profile, ...input });
    assert.equal(shot.reachable, false);
    assert.ok([shot.flightTime, ...Object.values(shot.direction), ...Object.values(shot.origin), ...Object.values(shot.interceptPoint)].every(Number.isFinite));
  }
  const linear = solveFireSolution({ origin: zero, profile, targetPosition: { x: 0, y: 0, z: -1000 }, targetVelocity: { x: 0, y: 0, z: 420 } });
  assert.equal(linear.reachable, true, 'equal target and projectile speeds have a linear solution when approaching');
});

test('deterministic dispersion is radially bounded even for diagonal and invalid samples', () => {
  const profile = getEnemyWeaponProfile('turret');
  const input = { origin: zero, targetPosition: { x: 0, y: -1000, z: 0 }, profile };
  const aim = solveFireSolution(input);
  for (const [sampleX, sampleY] of [[1, 1], [-10, 10], [Infinity, NaN]]) {
    const shot = solveFireSolution({ ...input, sampleX, sampleY });
    assert.deepEqual(shot, solveFireSolution({ ...input, sampleX, sampleY }));
    assert.ok(Math.acos(Math.min(1, alignment(aim.direction, shot.direction))) <= profile.dispersion + 1e-9);
  }
});

test('turret barrels turn at a finite rate and never fire backwards or before the warning', () => {
  const brain = createTurretBrain('light', 0);
  const input = context({ target: { id: 'player', position: { x: 0, y: 0, z: 1000 }, velocity: zero } });
  let previous = forward, firstShot = null;
  for (let frame = 0; frame < 600; frame++) {
    const decision = brain.update(input, 1 / 60);
    assert.ok(Object.values(decision.direction).every(Number.isFinite));
    const turn = Math.acos(Math.max(-1, Math.min(1, alignment(previous, decision.direction))));
    assert.ok(turn <= decision.profile.turnRate / 60 + 1e-7);
    if (frame === 0) assert.ok(decision.direction.z < -0.99, 'a target behind cannot snap the barrel around');
    if (decision.fire) {
      firstShot ??= frame / 60;
      assert.ok(alignment(decision.direction, decision.aimDirection) >= Math.cos(0.012) - 1e-9);
      assert.equal(decision.solution.reachable, true);
      assert.equal(decision.telegraph, 1);
    }
    previous = decision.direction;
  }
  assert.ok(firstShot >= Math.PI / 0.9 - 0.05 && firstShot < 4);
});

test('turret warnings restart on target changes and reset; invalid deltas freeze clocks', () => {
  const brain = createTurretBrain('light', 0);
  const same = context();
  for (let frame = 0; frame < 20; frame++) assert.equal(brain.update(same, 1 / 60).fire, false);
  const changed = context({ target: { ...same.target, id: 'gold-2' } });
  for (let frame = 0; frame < 40; frame++) assert.equal(brain.update(changed, 1 / 60).fire, false);
  assert.equal(brain.update(changed, 1 / 60).fire, false);
  assert.equal(brain.update(changed, 1 / 60).fire, true);
  brain.reset();
  for (let frame = 0; frame < 30; frame++) assert.equal(brain.update(same, 1 / 60).fire, false);
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(brain.update(same, dt).fire, false);
  for (let frame = 0; frame < 11; frame++) assert.equal(brain.update(same, 1 / 60).fire, false);
  assert.equal(brain.update(same, 1 / 60).fire, true);
  assert.equal(brain.update(context({ target: null }), 1 / 60).state, 'idle');
  assert.equal(brain.update(context({ target: { ...same.target, position: { x: 0, y: 0, z: -9000 } } }), 0.1).fire, false);
});
