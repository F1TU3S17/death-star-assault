import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyBrain, updateEnemyBrain, getEnemyProfile, interceptPoint, detectIncomingBolt } from '../src/game/enemy-ai.js';
import { engineHarness } from './engine-harness.js';

const forward = { x: 0, y: 0, z: -1 };
const zero = { x: 0, y: 0, z: 0 };
const target = { id: 'player', position: { x: 0, y: 0, z: -600 }, velocity: zero };
const context = overrides => ({ position: zero, forward, velocity: zero, target, neighbors: [], projectiles: [], ...overrides });

test('attack passes telegraph, fire in a bounded cone, break, flank and re-approach at finite turn rates', () => {
  const brain = createEnemyBrain('line', 0.3);
  const profile = getEnemyProfile('line');
  let position = { ...zero }, heading = { ...forward };
  const states = new Set();
  let firstShot = null, shots = 0;
  for (let frame = 0; frame < 1000; frame++) {
    const decision = updateEnemyBrain(brain, context({ position, forward: heading }), 0.025);
    const cosine = Math.max(-1, Math.min(1, heading.x * decision.direction.x + heading.y * decision.direction.y + heading.z * decision.direction.z));
    assert.ok(Math.acos(cosine) <= profile.turnRate * 0.025 + 1e-7);
    states.add(decision.state);
    if (decision.fire) {
      assert.equal(decision.state, 'attack');
      const range = Math.hypot(position.x - target.position.x, position.y - target.position.y, position.z - target.position.z);
      assert.ok(range > 160 && range < 650, `a firing pass must close to combat range, got ${range}`);
      const alignment = decision.direction.x * decision.aimDirection.x + decision.direction.y * decision.aimDirection.y + decision.direction.z * decision.aimDirection.z;
      assert.ok(alignment >= Math.cos(profile.fireCone) - 1e-8);
      firstShot ??= frame * 0.025;
      shots++;
    }
    heading = decision.direction;
    position = { x: position.x + heading.x * decision.speed * 0.025, y: position.y + heading.y * decision.speed * 0.025, z: position.z + heading.z * decision.speed * 0.025 };
  }
  for (const state of ['approach', 'telegraph', 'attack', 'break', 'reposition']) assert.ok(states.has(state), `missing ${state}`);
  assert.ok(firstShot >= 1.1, 'the pilot must give a readable warning before the first pass');
  assert.ok(shots > 0 && shots < 20, 'attack windows and shot cooldowns prevent continuous firing');
});

test('fighters commit to close passes rather than firing from afar or through an unannounced target change', () => {
  for (const range of [150, 650, 1000]) {
    const brain = { ...createEnemyBrain(), state: 'attack', targetId: 'player', shotCooldown: 0 };
    const decision = updateEnemyBrain(brain, context({ target: { ...target, position: { x: 0, y: 0, z: -range } } }), 0.025);
    assert.equal(decision.fire, false, `must not fire at ${range} m`);
  }
  const brain = { ...createEnemyBrain(), state: 'attack', targetId: 'player', shotCooldown: 0 };
  const decision = updateEnemyBrain(brain, context({ target: { ...target, id: 'gold-2', position: { x: 0, y: 0, z: -350 } } }), 0.025);
  assert.equal(decision.state, 'approach');
  assert.equal(decision.fire, false, 'changing prey starts another readable approach');
});

test('a fighter catches a moving escort and leads its real bolt travel time during the attack', () => {
  const brain = createEnemyBrain('line', 0.3);
  const escortVelocity = { x: 0, y: 0, z: -52 };
  let position = { ...zero }, heading = { ...forward };
  let fired = false;
  for (let frame = 0; frame < 800; frame++) {
    const targetPosition = { x: 0, y: 0, z: -600 - frame * 0.025 * 52 };
    const decision = updateEnemyBrain(brain, context({ position, forward: heading, target: { ...target, id: 'gold-2', position: targetPosition, velocity: escortVelocity } }), 0.025);
    if (decision.fire) {
      const range = Math.hypot(position.x - targetPosition.x, position.y - targetPosition.y, position.z - targetPosition.z);
      assert.ok(range > 160 && range < 650);
      const interception = interceptPoint(position, targetPosition, escortVelocity, 245, 3);
      const flightTime = Math.hypot(interception.x - position.x, interception.y - position.y, interception.z - position.z) / 245;
      assert.ok(Math.abs(interception.z - (targetPosition.z - 52 * flightTime)) < 1e-7);
      fired = true;
      break;
    }
    heading = decision.direction;
    position = { x: position.x + heading.x * decision.speed * 0.025, y: position.y + heading.y * decision.speed * 0.025, z: position.z + heading.z * decision.speed * 0.025 };
  }
  assert.ok(fired, 'pursuit must reach the escort instead of losing ground after each break');
});

test('a rear target cannot be shot before the fighter physically turns toward it', () => {
  const brain = createEnemyBrain('ace', 1);
  let heading = { ...forward };
  for (let frame = 0; frame < 15; frame++) {
    const decision = updateEnemyBrain(brain, context({ forward: heading, target: { ...target, position: { x: 0, y: 0, z: 500 } } }), 0.025);
    assert.equal(decision.fire, false);
    heading = decision.direction;
  }
  assert.ok(heading.z < 0, 'the ship cannot turn 180 degrees in a fraction of a second');
});

test('interception predicts observed motion and respects its finite prediction horizon', () => {
  const point = interceptPoint(zero, { x: 100, y: 0, z: -300 }, { x: 40, y: 0, z: 0 }, 200, 10);
  const travelTime = Math.hypot(point.x, point.y, point.z) / 200;
  assert.ok(Math.abs((point.x - 100) / 40 - travelTime) < 1e-8);
  const protectedPoint = interceptPoint(zero, { x: 100, y: 0, z: -300 }, { x: 40, y: 0, z: 0 }, 200, 0.45);
  assert.equal(protectedPoint.x, 118);
  assert.ok(Object.values(interceptPoint(zero, target.position, { x: 0, y: 0, z: -500 })).every(Number.isFinite));
});

test('only visible incoming shots trigger evasion, with a human-scale reaction delay and faster aces', () => {
  const profile = getEnemyProfile('line');
  const bolt = (position, velocity, owner = 'player') => ({ position, velocity, owner });
  assert.equal(detectIncomingBolt(zero, forward, zero, [bolt({ x: 0, y: 0, z: -100 }, { x: 0, y: 0, z: -670 })], profile), null);
  assert.equal(detectIncomingBolt(zero, forward, zero, [bolt({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -670 })], profile), null);
  assert.equal(detectIncomingBolt(zero, forward, zero, [bolt({ x: 0, y: 0, z: -1000 }, { x: 0, y: 0, z: 670 })], profile), null);
  assert.equal(detectIncomingBolt(zero, forward, zero, [bolt({ x: 0, y: 0, z: -100 }, { x: 0, y: 0, z: 670 }, 'enemy')], profile), null);
  const reactions = {};
  for (const variant of ['line', 'ace']) {
    const brain = createEnemyBrain(variant, 0.4);
    for (let frame = 0; frame < 18; frame++) {
      const elapsed = frame * 0.025;
      const decision = updateEnemyBrain(brain, context({ projectiles: [bolt({ x: 0, y: 0, z: -300 + elapsed * 670 }, { x: 0, y: 0, z: 670 })] }), 0.025);
      if (decision.evading) { reactions[variant] = elapsed; break; }
    }
  }
  assert.ok(reactions.line >= 0.24);
  assert.ok(reactions.ace >= 0.1);
  assert.ok(reactions.ace < reactions.line);
});

test('separation and trench boundaries steer away without teleporting or making corridor U-turns', () => {
  const crowded = updateEnemyBrain(createEnemyBrain('line', 0.2), context({ neighbors: [{ position: { x: 20, y: 0, z: 0 } }] }), 0.05);
  assert.ok(crowded.direction.x < 0);
  const corridor = { minX: -56, maxX: 56, minY: -112, maxY: 25 };
  const position = { x: 54, y: -45, z: 500 };
  const trench = updateEnemyBrain(createEnemyBrain('vader', 2), context({ position, corridor, target: { ...target, position: { x: 0, y: -45, z: 900 } } }), 0.05);
  assert.ok(trench.direction.x < 0);
  assert.ok(trench.direction.z < 0, 'a trench fighter cannot reverse through its walls');
  assert.deepEqual(position, { x: 54, y: -45, z: 500 });
  assert.ok(getEnemyProfile('ace').turnRate > getEnemyProfile('line').turnRate);
});

test('actual engine exposes telegraphed attack states and physical enemy bolts with finite transforms', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    debug.step(0.5);
    assert.ok(debug.inspect().enemies.some(enemy => enemy.aiState === 'telegraph' && enemy.telegraph));
    assert.equal(debug.inspect().projectileDetails.filter(projectile => projectile.owner === 'enemy').length, 0);
    assert.equal(game.getSnapshot().shields, 100, 'warnings do not apply direct damage');
    const states = new Set();
    let sawBolt = false;
    for (let frame = 0; frame < 260; frame++) {
      debug.step(0.025);
      const inspect = debug.inspect();
      for (const enemy of inspect.enemies) {
        states.add(enemy.aiState);
        assert.equal(enemy.aiTarget, 'player');
        assert.ok([...enemy.position, ...enemy.quaternion, ...enemy.velocity].every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...enemy.quaternion) - 1) < 1e-6);
      }
      sawBolt ||= inspect.projectileDetails.some(projectile => projectile.owner === 'enemy');
    }
    assert.ok(sawBolt);
    assert.ok(states.has('attack') && states.has('break') && states.has('reposition'));
    assert.equal(debug.inspect().enemies.find(enemy => enemy.variant === 'line').health, 48);
    assert.equal(debug.inspect().enemies.find(enemy => enemy.variant === 'ace').health, 68);
  } finally { fixture.close(); }
});
