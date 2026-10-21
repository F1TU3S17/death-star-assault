import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtAtUnit, solveLegPose, AT_AT_PART_MULTIPLIERS } from '../src/game/at-at.js';

const PLAYER = { x: 0, y: 3, z: -120 };
const BASE = { x: 0, y: 0, z: -400 };

const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = vector => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length > 0 ? { x: vector.x / length, y: vector.y / length, z: vector.z / length } : { x: 0, y: 0, z: -1 };
};
const isFiniteVector = vector => [vector.x, vector.y, vector.z].every(Number.isFinite);

test('leg inverse kinematics solves a reachable pose with law of cosines angles', () => {
  const hip = { x: 0, y: 0, z: 0 };
  const foot = { x: 2.475, y: -5.6, z: 0 };
  const distance = Math.hypot(foot.x - hip.x, foot.y - hip.y);
  const pose = solveLegPose({
    hip,
    foot,
    upperLength: 3.4,
    lowerLength: 3.6,
    bend: 1,
    forward: { x: 1, y: 0, z: 0 },
  });

  assert.equal(pose.reachable, true);
  assert.ok(Number.isFinite(pose.hipAngle));
  assert.ok(Number.isFinite(pose.kneeAngle));
  assert.ok(isFiniteVector(pose.knee));

  const thigh = Math.hypot(pose.knee.x - hip.x, pose.knee.y - hip.y, pose.knee.z - hip.z);
  const shin = Math.hypot(pose.knee.x - foot.x, pose.knee.y - foot.y, pose.knee.z - foot.z);
  assert.ok(Math.abs(thigh - 3.4) < 1e-9, `thigh ${thigh}`);
  assert.ok(Math.abs(shin - 3.6) < 1e-9, `shin ${shin}`);

  const expectedGamma = Math.acos((3.4 ** 2 + 3.6 ** 2 - distance ** 2) / (2 * 3.4 * 3.6));
  assert.ok(Math.abs(pose.kneeAngle - expectedGamma) < 1e-9);
  assert.equal(pose.knee.z, 0, 'the knee stays inside the forward/up plane');
});

test('leg inverse kinematics reports unreachable poses and straightens the leg', () => {
  const stretched = solveLegPose({
    hip: { x: 0, y: 0, z: 0 },
    foot: { x: 30, y: 0, z: 0 },
    upperLength: 3.4,
    lowerLength: 3.6,
    bend: 1,
    forward: { x: 1, y: 0, z: 0 },
  });
  assert.equal(stretched.reachable, false);
  assert.ok(Number.isFinite(stretched.hipAngle));
  assert.ok(Number.isFinite(stretched.kneeAngle));
  assert.ok(Math.abs(stretched.knee.x - 3.4) < 1e-3, 'the leg straightens towards the foot');

  const folded = solveLegPose({
    hip: { x: 0, y: 0, z: 0 },
    foot: { x: 0.05, y: 0, z: 0 },
    upperLength: 3.4,
    lowerLength: 3.6,
    bend: 1,
    forward: { x: 1, y: 0, z: 0 },
  });
  assert.equal(folded.reachable, false);
  assert.ok(Number.isFinite(folded.hipAngle));
  assert.ok(Number.isFinite(folded.kneeAngle));
});

test('leg inverse kinematics accepts the reach limits and survives broken input', () => {
  const maxReach = solveLegPose({
    hip: { x: 0, y: 0, z: 0 },
    foot: { x: 7, y: 0, z: 0 },
    upperLength: 3.4,
    lowerLength: 3.6,
    forward: { x: 1, y: 0, z: 0 },
  });
  assert.equal(maxReach.reachable, true);
  assert.ok(Math.abs(maxReach.knee.x - 3.4) < 1e-3);

  const minReach = solveLegPose({
    hip: { x: 0, y: 0, z: 0 },
    foot: { x: 0.2, y: 0, z: 0 },
    upperLength: 3.4,
    lowerLength: 3.6,
    forward: { x: 1, y: 0, z: 0 },
  });
  assert.equal(minReach.reachable, true);
  assert.ok(Math.abs(Math.hypot(minReach.knee.x, minReach.knee.y) - 3.4) < 1e-9);

  const broken = solveLegPose({
    hip: { x: NaN, y: undefined, z: null },
    foot: undefined,
    upperLength: NaN,
    lowerLength: -5,
    bend: 0,
    forward: { x: 0, y: 0, z: 0 },
  });
  assert.equal(broken.reachable, false);
  assert.ok(Number.isFinite(broken.hipAngle));
  assert.ok(Number.isFinite(broken.kneeAngle));
  assert.ok(isFiniteVector(broken.knee));
});

test('the walker marches towards the base and keeps four legs in four phases', () => {
  const unit = createAtAtUnit({ variant: 'assault', seed: 7 });
  let travelled = { x: 0, z: 0 };
  for (let i = 0; i < 10; i++) {
    const result = unit.update(0.1, { playerPosition: PLAYER, basePosition: BASE });
    travelled.x += result.move.x * 0.1;
    travelled.z += result.move.z * 0.1;
  }

  assert.ok(travelled.z < -17.9 && travelled.z > -18.1, `travelled ${travelled.z}`);
  assert.equal(travelled.x, 0);
  assert.ok(Math.abs(unit.getPosition().z - travelled.z) < 1e-9, 'the hull moved exactly as reported');

  const poses = unit.getLegPoses();
  assert.equal(poses.length, 4);
  assert.deepEqual(poses.map(pose => pose.id), ['FL', 'FR', 'BR', 'BL']);
  const phases = poses.map(pose => pose.phase);
  assert.equal(new Set(phases.map(phase => phase.toFixed(6))).size, 4, 'four different leg phases');
  assert.ok(poses.every(pose => pose.pose.reachable), 'the normal gait stays inside the leg reach');
  assert.ok(poses.every(pose => isFiniteVector(pose.hip) && isFiniteVector(pose.foot) && isFiniteVector(pose.pose.knee)));

  const step = unit.update(0.1, { playerPosition: PLAYER, basePosition: BASE });
  assert.ok(Math.abs(Math.hypot(step.move.x, step.move.z) - 18) < 1e-9, 'move is a ground velocity in m/s');

  const snapshot = unit.getSnapshot();
  assert.ok(snapshot.stepPhase > 0 && snapshot.stepPhase < 1);
  assert.equal(snapshot.phase, 'advance');
  assert.equal(snapshot.speed, 18);
});

test('stance feet stay planted while swing feet arc forward', () => {
  const unit = createAtAtUnit({ seed: 3 });
  const before = unit.getLegPoses();
  const stance = before.find(pose => pose.planted);
  const swing = before.find(pose => !pose.planted);
  assert.ok(stance, 'a leg starts in stance');
  assert.ok(swing, 'a leg starts in swing');

  unit.update(0.1, { playerPosition: PLAYER, basePosition: BASE });
  const after = unit.getLegPoses();
  const stanceAfter = after.find(pose => pose.id === stance.id);
  const swingAfter = after.find(pose => pose.id === swing.id);

  assert.deepEqual(stanceAfter.foot, stance.foot, 'the planted foot does not slide');
  assert.ok(swingAfter.foot.y > swing.foot.y, 'the swinging foot is lifted');
  assert.ok(swingAfter.foot.z < swing.foot.z, 'the swinging foot travels forward');
});

test('armour eats frontal fire while legs and turret take the full damage', () => {
  const unit = createAtAtUnit();
  assert.deepEqual(AT_AT_PART_MULTIPLIERS, {
    armor: 0.05, leg: 1.6, turret: 2.2, rear: 1.2, body: 1,
  });

  const armour = unit.applyDamage(100, { part: 'armor' });
  assert.equal(armour.blocked, true);
  assert.equal(armour.applied, 5);
  assert.equal(armour.part, 'armor');
  assert.equal(armour.health, 895);

  const leg = unit.applyDamage(100, { part: 'leg' });
  assert.equal(leg.blocked, false);
  assert.equal(leg.applied, 160);
  assert.ok(leg.applied > armour.applied);

  const turret = unit.applyDamage(100, { part: 'turret' });
  assert.ok(Math.abs(turret.applied - 220) < 1e-9);
  assert.ok(turret.applied > leg.applied);
  assert.equal(turret.health, 895 - 160 - 220);

  const rear = unit.applyDamage(100, { part: 'rear' });
  assert.ok(Math.abs(rear.applied - 120) < 1e-9);
  assert.equal(unit.applyDamage(100, { part: 'body' }).applied, 100);

  const defaultPart = unit.applyDamage(100);
  assert.equal(defaultPart.part, 'armor');
  assert.equal(defaultPart.blocked, true);

  const unknownPart = unit.applyDamage(100, { part: null });
  assert.equal(unknownPart.part, 'armor');
  assert.equal(unknownPart.blocked, true);

  unit.applyDamage(9999, { part: 'turret' });
  const snapshot = unit.getSnapshot();
  assert.equal(snapshot.health, 0);
  assert.equal(snapshot.phase, 'down');
  assert.equal(unit.applyDamage(50, { part: 'leg' }).health, 0, 'health never drops below zero');
});

test('the turret telegraphs before releasing a finite shell towards the target', () => {
  const unit = createAtAtUnit({ seed: 5 });
  let fired = null;
  let telegraphed = false;

  for (let i = 0; i < 12; i++) {
    const result = unit.update(0.1, { playerPosition: PLAYER, basePosition: BASE });
    if (result.phase === 'telegraph') telegraphed = true;
    if (i < 11) assert.equal(result.fire, null, 'no shot before the telegraph finishes');
    if (result.fire) fired = result.fire;
  }

  assert.ok(telegraphed, 'the machine warns before firing');
  assert.ok(fired);
  assert.equal(fired.speed, 220);
  assert.equal(fired.damage, 22);
  assert.equal(fired.flightTime, 2.4);
  assert.ok(isFiniteVector(fired.position));
  assert.ok(isFiniteVector(fired.direction));
  assert.ok(Math.abs(Math.hypot(fired.direction.x, fired.direction.y, fired.direction.z) - 1) < 1e-9);

  const toTarget = normalize(subtract(PLAYER, fired.position));
  assert.ok(dot(fired.direction, toTarget) > 0.99, 'the shell flies towards the player');
});

test('the tow cable can only be attached once and silences the turret', () => {
  const unit = createAtAtUnit();
  assert.equal(unit.isCabled, false);
  assert.equal(unit.attachTowCable(), true);
  assert.equal(unit.attachTowCable(), false);
  assert.equal(unit.isCabled, true);

  let fired = null;
  for (let i = 0; i < 40; i++) {
    const result = unit.update(0.1, { playerPosition: PLAYER, basePosition: BASE });
    if (result.fire) fired = result.fire;
  }
  assert.equal(fired, null, 'a tethered machine does not shoot');
  assert.equal(unit.getSnapshot().phase, 'cabled');
  assert.equal(unit.getSnapshot().cabled, true);
});

test('the topple sequence tips, falls and reports the impact exactly once', () => {
  const unit = createAtAtUnit();
  unit.attachTowCable();

  const tipping = unit.collapse(0.5);
  assert.equal(tipping.phase, 'tip');
  assert.ok(tipping.progress > 0 && tipping.progress < 1);
  assert.equal(tipping.impact, false);
  assert.equal(unit.getSnapshot().phase, 'falling');

  const falling = unit.collapse(2);
  assert.equal(falling.phase, 'fall');
  assert.ok(falling.progress > tipping.progress);

  const down = unit.collapse(1.4);
  assert.equal(down.phase, 'down');
  assert.equal(down.progress, 1);
  assert.equal(down.impact, true);
  assert.equal(unit.getSnapshot().phase, 'down');

  const afterwards = unit.collapse(0.5);
  assert.equal(afterwards.impact, false);
  assert.equal(afterwards.phase, 'down');
  assert.equal(afterwards.progress, 1);
});

test('broken frame deltas and missing targets keep the machine finite', () => {
  const unit = createAtAtUnit();
  for (const delta of [NaN, 0, -5, undefined, 1e9]) {
    const result = unit.update(delta, { playerPosition: null, basePosition: null });
    assert.ok(Number.isFinite(result.move.x) && Number.isFinite(result.move.z));
    assert.ok(isFiniteVector(result.aim));
    assert.equal(result.fire, null);
    assert.ok(['advance', 'telegraph', 'fire', 'cabled', 'falling', 'down'].includes(result.phase));
  }

  const snapshot = unit.getSnapshot();
  assert.ok(Number.isFinite(snapshot.health));
  assert.ok(Number.isFinite(snapshot.maxHealth));
  assert.ok(Number.isFinite(snapshot.stepPhase));
  assert.ok(isFiniteVector(snapshot.aim));
  assert.equal(snapshot.fire, null);
  assert.equal(snapshot.part, 'armor');

  const broken = unit.update(0.5, { playerPosition: { x: NaN, y: 0, z: 0 }, basePosition: { x: 'nope' } });
  assert.ok(Number.isFinite(broken.move.x) && Number.isFinite(broken.move.z));
  assert.ok(isFiniteVector(broken.aim));

  unit.applyDamage(NaN);
  assert.ok(Number.isFinite(unit.getSnapshot().health));
});

test('reset restores the freshly created machine', () => {
  const unit = createAtAtUnit({ stats: { position: { x: 10, y: 0, z: 10 } } });
  unit.update(1, { playerPosition: PLAYER, basePosition: BASE });
  unit.applyDamage(300, { part: 'leg' });
  unit.attachTowCable();
  unit.collapse(1);

  unit.reset();

  const snapshot = unit.getSnapshot();
  assert.equal(snapshot.health, 900);
  assert.equal(snapshot.maxHealth, 900);
  assert.equal(snapshot.phase, 'advance');
  assert.equal(snapshot.cabled, false);
  assert.equal(snapshot.part, 'armor');
  assert.equal(snapshot.fire, null);
  assert.equal(snapshot.stepPhase, 0);
  assert.equal(unit.isCabled, false);
  assert.deepEqual(unit.getPosition(), { x: 10, y: 0, z: 10 });
});
