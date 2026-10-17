import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetLock, TORPEDO_LOCK_SECONDS, getLeadSolution, stationLineOfSight, isLockCandidate } from '../src/game/targeting.js';

const closeTo = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);

test('guidance needs 1.7 seconds observing the same eligible entity', () => {
  const lock = createTargetLock();
  assert.equal(lock.snapshot().acquired, false);
  assert.equal(lock.snapshot().status, 'searching');
  for (let frame = 0; frame < 67; frame++) lock.update('tie-1', .025);
  assert.equal(lock.snapshot().acquired, false);
  assert.equal(lock.snapshot().status, 'acquiring');
  closeTo(lock.snapshot().elapsed, 1.675);
  lock.update('tie-1', .025);
  assert.equal(lock.snapshot().acquired, true);
  assert.equal(lock.snapshot().status, 'locked');
  assert.equal(lock.snapshot().duration, TORPEDO_LOCK_SECONDS);
  assert.equal(lock.snapshot().progress, 1);
});

test('switching targets never transfers an acquired or partial lock', () => {
  const lock = createTargetLock();
  lock.update('tie-1', 1.7);
  const changed = lock.update('tie-2', .025);
  assert.equal(changed.targetId, 'tie-2');
  assert.equal(changed.acquired, false);
  closeTo(changed.elapsed, .025);
  lock.update('tie-2', .8);
  closeTo(lock.update('tie-1', .025).elapsed, .025);
});

test('leaving visibility, range, or cone immediately removes guidance while progress visibly decays', () => {
  const lock = createTargetLock();
  lock.update('tie-1', 1.7);
  const lost = lock.update(null, .2);
  assert.equal(lost.acquired, false);
  assert.equal(lost.status, 'losing');
  assert.equal(lost.targetId, 'tie-1');
  closeTo(lost.elapsed, 1.4);
  closeTo(lost.progress, 1.4 / 1.7);
  const reacquired = lock.update('tie-1', .1);
  assert.equal(reacquired.acquired, false);
  closeTo(reacquired.elapsed, 1.5);
  lock.update('tie-1', .2);
  assert.equal(lock.snapshot().acquired, true);
  lock.update(null, 2);
  assert.equal(lock.snapshot().targetId, null);
  assert.equal(lock.snapshot().progress, 0);
});

test('pause freezes acquisition and decay; destruction, weapon changes and restart invalidate it', () => {
  const lock = createTargetLock();
  lock.update('tie-1', .7);
  const paused = lock.snapshot();
  assert.deepEqual(lock.update(null, 10, { paused: true }), paused);
  assert.deepEqual(lock.update('tie-2', 10, { paused: true }), paused);
  lock.update('tie-1', 1);
  const acquired = lock.snapshot();
  assert.equal(acquired.acquired, true);
  assert.deepEqual(lock.invalidate('other-enemy'), acquired);
  assert.equal(lock.invalidate('tie-1').targetId, null);
  lock.update('tie-2', 1.7);
  assert.equal(lock.update('tie-2', 0, { enabled: false }).acquired, false);
  lock.update('tie-3', 1.7);
  assert.equal(lock.reset().progress, 0);
});

test('invalid deltas cannot grant instant acquisition or poison the readout', () => {
  const lock = createTargetLock();
  for (const delta of [NaN, Infinity, -Infinity, -1, undefined]) {
    const state = lock.update('tie-1', delta);
    assert.equal(state.elapsed, 0);
    assert.equal(state.acquired, false);
    assert.ok(Number.isFinite(state.progress));
  }
});

test('only a living, visible, in-range target in the forward cone may advance a lock', () => {
  const base = { origin: { x: 0, y: 0, z: 0 }, forward: { x: 0, y: 0, z: -1 }, targetPosition: { x: 0, y: 0, z: -600 } };
  assert.equal(isLockCandidate(base), true);
  assert.equal(isLockCandidate({ ...base, visible: false }), false);
  assert.equal(isLockCandidate({ ...base, alive: false }), false);
  assert.equal(isLockCandidate({ ...base, targetPosition: { x: 0, y: 0, z: 100 } }), false);
  assert.equal(isLockCandidate({ ...base, targetPosition: { x: 0, y: 0, z: -1701 } }), false);
  assert.equal(isLockCandidate({ ...base, targetPosition: { x: 500, y: 0, z: -100 } }), false);
  assert.equal(isLockCandidate({ ...base, targetPosition: { x: 10, y: -160, z: -600 }, phase: 'surface' }), false);
});

test('the lead marker predicts a crossing target without changing supplied vectors', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const targetPosition = { x: 0, y: 0, z: -600 };
  const targetVelocity = { x: 100, y: 0, z: 0 };
  const before = structuredClone({ origin, targetPosition, targetVelocity });
  const solution = getLeadSolution({ origin, targetPosition, targetVelocity, projectileSpeed: 600 });
  const flightTime = solution.distance / 600;
  closeTo(solution.point.x, 100 * flightTime);
  assert.equal(solution.point.z, -600);
  assert.ok(solution.direction.x > .1, 'the visual lead lies ahead of the crossing target');
  closeTo(Math.hypot(...Object.values(solution.direction)), 1);
  assert.deepEqual({ origin, targetPosition, targetVelocity }, before);
});

test('lead prediction is capped for extreme distances and stationary targets stay centered', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const far = getLeadSolution({ origin, targetPosition: { x: 0, y: 0, z: -20000 }, targetVelocity: { x: 100, y: 0, z: 0 }, maxLead: 2.2 });
  closeTo(far.point.x, 220);
  const stationary = getLeadSolution({ origin, targetPosition: { x: 0, y: 0, z: -600 } });
  assert.deepEqual(stationary.direction, { x: 0, y: 0, z: -1 });
});

test('station cover rejects buried targets and wall occlusion, but keeps open corridor and overhead sightlines', () => {
  assert.equal(stationLineOfSight({ x: 0, y: 90, z: 0 }, { x: 20, y: 50, z: -600 }, 'surface'), true);
  assert.equal(stationLineOfSight({ x: 0, y: 90, z: 0 }, { x: 20, y: -160, z: -600 }, 'surface'), false);
  assert.equal(stationLineOfSight({ x: 0, y: -40, z: 0 }, { x: 20, y: -50, z: -600 }, 'trench'), true);
  assert.equal(stationLineOfSight({ x: 0, y: -40, z: 0 }, { x: 100, y: -50, z: -600 }, 'trench'), false);
  assert.equal(stationLineOfSight({ x: 100, y: 100, z: 0 }, { x: 110, y: 90, z: -600 }, 'trench'), true);
  assert.equal(stationLineOfSight({ x: 150, y: 100, z: 0 }, { x: 0, y: -50, z: -600 }, 'trench'), false);
  assert.equal(stationLineOfSight({ x: 0, y: 0, z: 0 }, { x: 500, y: -500, z: -600 }, 'combat'), true);
});
