import test from 'node:test';
import assert from 'node:assert/strict';
import { absorbDamage, segmentSphereHit, clampFrameDelta } from '../src/game/simulation.js';

test('shields absorb damage before hull; lethal damage clamps both resources', () => {
  assert.deepEqual(absorbDamage(100, 40, 25), { health: 100, shields: 15 });
  assert.deepEqual(absorbDamage(100, 15, 40), { health: 75, shields: 0 });
  assert.deepEqual(absorbDamage(20, 10, 999), { health: 0, shields: 0 });
  for (const damage of [0, -1, NaN, undefined]) {
    assert.deepEqual(absorbDamage(80, 30, damage), { health: 80, shields: 30 });
  }
});

test('fast projectiles collide along their segment, including tangent and stationary hits', () => {
  const center = { x: 0, y: 0, z: 0 };
  const point = (x, y = 0, z = 0) => ({ x, y, z });
  assert.equal(segmentSphereHit(point(-100), point(100), center, 7), true);
  assert.equal(segmentSphereHit(point(-100, 7), point(100, 7), center, 7), true);
  assert.equal(segmentSphereHit(point(-100, 7.001), point(100, 7.001), center, 7), false);
  assert.equal(segmentSphereHit(point(20), point(100), center, 7), false);
  assert.equal(segmentSphereHit(point(6), point(6), center, 7), true);
  assert.equal(segmentSphereHit(point(8), point(8), center, 7), false);
  assert.equal(segmentSphereHit(point(0, 0, -100), point(0, 0, 100), center, 7), true);
});

test('frame deltas reject invalid/backward time and limit tab-resume jumps', () => {
  for (const delta of [undefined, NaN, -5, 0]) assert.equal(clampFrameDelta(delta), 0);
  assert.equal(clampFrameDelta(1 / 60), 1 / 60);
  assert.equal(clampFrameDelta(60), 0.05);
  assert.equal(clampFrameDelta(Infinity), 0.05);
});
