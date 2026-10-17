import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';
import { engineReachPhase } from './campaign-fixtures.js';

const enemyBolts = fixture => fixture.debug.inspect().projectileDetails.filter(bolt => bolt.owner === 'enemy');

async function isolatedBattery(variant) {
  const fixture = await engineHarness();
  fixture.game.start();
  engineReachPhase(fixture.debug, 'surface');
  const scene = fixture.player().parent;
  const enemies = fixture.debug.inspect().enemies;
  const selected = enemies.find(enemy => enemy.kind === 'turret' && enemy.variant === variant);
  assert.ok(selected, `Surface must contain a real ${variant} battery`);
  let battery;
  for (const [index, enemy] of enemies.entries()) {
    const mesh = scene.children.find(object => object.position.distanceTo(new THREE.Vector3(...enemy.position)) < 0.001);
    assert.ok(mesh, `Missing scene mesh for ${enemy.kind}`);
    if (enemy.id === selected.id) battery = mesh;
    // Pose-only isolation: preserve health, fire control and the actual projectile path.
    mesh.position.set(20000 + index * 2000, 0, 0);
    // The GPU-free harness omits the rendered barrel hierarchy.
    if (mesh.userData.head && !mesh.userData.head.parent) mesh.add(mesh.userData.head);
  }
  fixture.player().quaternion.identity();
  fixture.debug.input('ControlLeft');
  fixture.debug.step(3);
  fixture.player().position.set(1200, 100, 0);
  battery.position.set(0, 0, 0);
  return { fixture, battery, selected, inspect: () => fixture.debug.inspect().enemies.find(enemy => enemy.id === selected.id) };
}

for (const variant of ['light', 'heavy']) {
  test(`${variant} turret physically intercepts steady lateral flight after its visible warning`, async () => {
    const { fixture, inspect } = await isolatedBattery(variant);
    try {
      const initial = fixture.game.getSnapshot();
      const velocity = fixture.debug.inspect().playerVelocity;
      let warningAt = null;
      let firstShotAt = null;
      for (let frame = 0; frame < 480 && fixture.game.getSnapshot().shields === initial.shields; frame++) {
        fixture.debug.step(0.025);
        const enemy = inspect();
        const elapsed = fixture.game.getSnapshot().elapsed;
        if (enemy.telegraph && warningAt === null) warningAt = elapsed;
        if (enemy.lastShotAt !== null && firstShotAt === null) {
          firstShotAt = elapsed;
          assert.ok(warningAt !== null && warningAt < firstShotAt, 'A real telegraph must precede the first bolt');
          assert.ok(firstShotAt - warningAt >= (variant === 'heavy' ? 0.80 : 0.65), 'Battery must finish its charge before shooting');
        }
        assert.ok(Math.abs(fixture.debug.inspect().playerVelocity[2] - velocity[2]) < 0.02, 'The target must keep constant lateral velocity');
      }
      const final = fixture.game.getSnapshot();
      assert.ok(firstShotAt !== null, 'The actual turret must launch a bolt within twelve seconds');
      assert.ok(final.shields < initial.shields, `${variant} battery must hit a target over 1200 m away: ${JSON.stringify(inspect())}`);
      assert.equal(final.health, initial.health, 'This test needs no hull damage or resource cheats');
      assert.equal(final.kills, 0);
      assert.ok(fixture.events.some(event => event.type === 'damage'));
    } finally { fixture.close(); }
  });

  test(`${variant} turret bolts freeze on pause and miss after a post-launch course change`, async () => {
    const { fixture, battery, inspect } = await isolatedBattery(variant);
    try {
      for (let frame = 0; frame < 240 && !enemyBolts(fixture).length; frame++) fixture.debug.step(0.025);
      assert.ok(enemyBolts(fixture).length > 0, 'A real enemy bolt must be in flight');
      const paused = { snapshot: fixture.game.getSnapshot(), enemy: inspect(), bolts: enemyBolts(fixture), position: fixture.player().position.toArray() };
      fixture.game.pause();
      fixture.debug.step(20);
      assert.equal(fixture.game.getSnapshot().shields, paused.snapshot.shields);
      assert.equal(fixture.game.getSnapshot().elapsed, paused.snapshot.elapsed);
      assert.deepEqual(fixture.player().position.toArray(), paused.position);
      assert.deepEqual(inspect(), paused.enemy);
      assert.deepEqual(enemyBolts(fixture), paused.bolts);
      fixture.game.resume();
      // Remove only subsequent firing opportunities. The already launched shot stays live.
      battery.position.set(20000, 0, 0);
      fixture.debug.input('KeyW');
      const shotVelocity = enemyBolts(fixture)[0].velocity;
      for (let frame = 0; frame < 160; frame++) {
        fixture.debug.step(0.025);
        if (frame === 36) fixture.debug.input('KeyW', false);
        for (const bolt of enemyBolts(fixture)) assert.deepEqual(bolt.velocity, shotVelocity, 'Ordinary enemy bolts must never home after launch');
      }
      fixture.debug.input('KeyW', false);
      assert.equal(fixture.game.getSnapshot().shields, paused.snapshot.shields, 'A deliberate turn after launch must evade the original intercept');
      assert.equal(fixture.game.getSnapshot().health, paused.snapshot.health);
      assert.equal(inspect().lastShotAt, paused.enemy.lastShotAt, 'The isolated battery must not fire out of range');
      assert.equal(fixture.events.filter(event => event.type === 'damage').length, 0);
    } finally { fixture.close(); }
  });
}
