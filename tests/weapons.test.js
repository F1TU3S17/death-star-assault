import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SHIPS } from '../src/game/data.js';
import { createArmament, insideLockCone, steerDirection, splashDamage } from '../src/game/simulation.js';
import { engineHarness } from './engine-harness.js';

test('canonical loadouts, finite torpedo magazines and independent cooldowns survive switching', () => {
  assert.deepEqual(SHIPS.xwing.weapons.map(weapon => weapon.id), ['laser', 'proton-torpedo']);
  assert.deepEqual(SHIPS.ywing.weapons.map(weapon => weapon.id), ['laser', 'ion-cannon', 'proton-torpedo']);
  const weapons = createArmament(SHIPS.xwing.weapons);
  assert.equal(weapons.consumeShot(), true);
  weapons.cycle(1);
  assert.equal(weapons.current().id, 'proton-torpedo');
  assert.equal(weapons.consumeShot(), true);
  weapons.cycle(-1);
  assert.equal(weapons.consumeShot(), false, 'switching must not reset a firing clock');
  weapons.select('proton-torpedo');
  for (let i = 0; i < 5; i++) { weapons.update(1.3); assert.equal(weapons.consumeShot(), true); }
  weapons.update(10);
  assert.equal(weapons.consumeShot(), false);
  assert.equal(weapons.getSnapshot().find(weapon => weapon.id === 'proton-torpedo').ammo, 0);
  assert.equal(weapons.select('concussion-missile'), false);
  weapons.reset();
  assert.equal(weapons.current().id, 'laser');
  assert.equal(weapons.getSnapshot()[1].ammo, 6);
});

test('torpedo reload transfers only missing rounds and repeated R cannot restart its clock', () => {
  const weapons = createArmament(SHIPS.xwing.weapons);
  assert.equal(weapons.reload(), false, 'energy weapons do not reload');
  weapons.select('proton-torpedo');
  assert.equal(weapons.reload(), false, 'a full launcher does not waste reserve');
  weapons.consumeShot();
  assert.equal(weapons.reload(), true);
  let torpedo = weapons.getSnapshot()[1];
  assert.equal(torpedo.ammo, 5);
  assert.equal(torpedo.reserve, 12);
  assert.equal(torpedo.reloadDuration, 4.5);
  assert.equal(torpedo.reloadRemaining, 4.5);
  assert.equal(weapons.consumeShot(), false, 'launching during reload is blocked');
  weapons.update(2);
  assert.equal(weapons.reload(), false);
  assert.equal(weapons.getSnapshot()[1].reloadRemaining, 2.5);
  assert.deepEqual(weapons.update(2.5), ['proton-torpedo']);
  torpedo = weapons.getSnapshot()[1];
  assert.equal(torpedo.ammo, 6);
  assert.equal(torpedo.reserve, 11);
  assert.equal(torpedo.reloading, false);
  assert.deepEqual(weapons.update(10), [], 'completion is emitted only once');
  weapons.consumeShot();
  assert.equal(weapons.reload(), true);
  for (let frame = 0; frame < 180; frame++) weapons.update(0.025);
  assert.equal(weapons.getSnapshot()[1].reloading, false, '4.5 seconds of render steps completes despite floating-point roundoff');
});

test('background reload survives weapon changes while finite reserves run out and reset restores them', () => {
  const weapons = createArmament(SHIPS.xwing.weapons);
  const emptyMagazine = () => {
    weapons.select('proton-torpedo');
    for (let i = 0; i < 6; i++) { weapons.update(1.3); assert.equal(weapons.consumeShot(), true); }
  };
  for (const reserveAfterReload of [6, 0]) {
    emptyMagazine();
    assert.equal(weapons.reload(), true);
    weapons.update(1);
    weapons.select('laser');
    assert.equal(weapons.consumeShot(), true, 'a torpedo reload must not block lasers');
    weapons.update(NaN);
    weapons.update(-1);
    assert.equal(weapons.getSnapshot()[1].reloadRemaining, 3.5);
    weapons.update(3.5);
    assert.equal(weapons.current().id, 'laser');
    assert.equal(weapons.getSnapshot()[1].ammo, 6);
    assert.equal(weapons.getSnapshot()[1].reserve, reserveAfterReload);
  }
  emptyMagazine();
  assert.equal(weapons.reload(), false, 'the reserve cannot create unlimited torpedoes');
  assert.equal(weapons.getSnapshot()[1].ammo, 0);
  weapons.reset();
  assert.equal(weapons.getSnapshot()[1].ammo, 6);
  assert.equal(weapons.getSnapshot()[1].reserve, 12);
  assert.equal(weapons.getSnapshot()[1].reloading, false);
  assert.equal(SHIPS.ywing.weapons.find(weapon => weapon.id === 'proton-torpedo').reserve, 16);
});

test('targeting rejects rear/out-of-range targets and steering respects turn rate', () => {
  const origin = { x: 0, y: 0, z: 0 }, forward = { x: 0, y: 0, z: -1 };
  assert.equal(insideLockCone(origin, forward, { x: 10, y: 0, z: -500 }), true);
  assert.equal(insideLockCone(origin, forward, { x: 0, y: 0, z: 100 }), false);
  assert.equal(insideLockCone(origin, forward, { x: 300, y: 0, z: -200 }), false);
  assert.equal(insideLockCone(origin, forward, { x: 0, y: 0, z: -1800 }), false);
  const steered = steerDirection(forward, { x: 1, y: 0, z: 0 }, 0.1);
  assert.ok(Math.abs(Math.hypot(steered.x, steered.y, steered.z) - 1) < 1e-8);
  assert.ok(Math.abs(Math.acos(-steered.z) - 0.1) < 1e-8);
  assert.equal(splashDamage(50, 48, 55), 0);
  assert.equal(splashDamage(0, 48, 55), 55);
  assert.equal(splashDamage(24, 48, 55), 27.5);
});

test('arrow keys select weapons without turning; pause freezes weapon clocks and restart restores magazines', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'ywing' });
    const orientation = fixture.player().quaternion.clone();
    fixture.key('ArrowRight');
    debug.step(0.2);
    fixture.key('ArrowRight', false);
    assert.equal(game.getSnapshot().weapon.id, 'ion-cannon');
    assert.ok(fixture.player().quaternion.angleTo(orientation) < 1e-8);
    fixture.key('ArrowUp'); fixture.key('ArrowUp', false);
    assert.equal(game.getSnapshot().weapon.id, 'proton-torpedo');
    fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
    assert.equal(game.getSnapshot().weapon.ammo, 7);
    game.pause();
    const paused = game.getSnapshot().weapon;
    debug.step(5);
    assert.deepEqual(game.getSnapshot().weapon, paused);
    assert.equal(game.selectWeapon('laser'), false);
    game.resume();
    fixture.key('ArrowDown'); fixture.key('ArrowDown', false);
    assert.equal(game.getSnapshot().weapon.id, 'ion-cannon');
    game.restart();
    assert.equal(game.getSnapshot().weapon.id, 'laser');
    assert.equal(game.getSnapshot().weapons.find(weapon => weapon.id === 'proton-torpedo').ammo, 8);
  } finally { fixture.close(); }
});

test('a launched proton torpedo physically homes to a front target and detonates', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    game.selectWeapon('proton-torpedo');
    assert.equal(game.getSnapshot().weapon.locked, false, 'a fresh target requires deliberate tracking before guidance');
    const targetId = game.getSnapshot().weapon.lockTargetId;
    assert.ok(targetId, 'the initial nose direction should identify the target being tracked');
    const track = seconds => {
      for (let elapsed = 0; elapsed < seconds - 0.001; elapsed += 0.025) {
        const target = debug.inspect().enemies.find(enemy => enemy.id === targetId);
        assert.ok(target?.health > 0, 'the same live target must remain available while tracking');
        const direction = new THREE.Vector3(...target.position).sub(fixture.player().position).normalize();
        fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        debug.step(0.025);
        assert.equal(game.getSnapshot().weapon.lockTargetId, targetId, 'lock progress must stay bound to the same target');
      }
    };
    track(1.65);
    assert.equal(game.getSnapshot().weapon.locked, false, 'the torpedo must remain unguided before 1.7 seconds');
    assert.ok(game.getSnapshot().weapon.lockProgress < 1);
    track(0.1);
    assert.equal(game.getSnapshot().weapon.locked, true, 'continuous nose tracking acquires guidance after 1.7 seconds');
    fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
    const launched = debug.inspect().projectileDetails.find(projectile => projectile.type === 'torpedo');
    assert.ok(launched?.locked);
    assert.equal(game.getSnapshot().weapon.ammo, 5);
    debug.step(3);
    assert.ok(game.getSnapshot().kills >= 1, 'damage must come from physical projectile collision');
  } finally { fixture.close(); }
});

test('blue Y-wing ion projectiles stun only after impact and preserve the target', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'ywing' });
    game.selectWeapon('ion-cannon');
    const target = debug.inspect().enemies[1];
    const direction = new THREE.Vector3(...target.position).sub(fixture.player().position).normalize();
    fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
    fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
    assert.ok(debug.inspect().projectileDetails.some(projectile => projectile.type === 'ion'));
    assert.equal(debug.inspect().enemies.some(enemy => enemy.stunned > 0), false, 'no instantaneous stun on firing');
    // Track observed movement: coordinated fighters no longer fly a fixed approach.
    let stunned = false;
    for (let elapsed = 0; elapsed < 3 && !stunned; elapsed += 0.025) {
      const moving = debug.inspect().enemies.find(enemy => enemy.id === target.id);
      assert.ok(moving, 'ion fire must preserve the tracked fighter');
      const distance = new THREE.Vector3(...moving.position).distanceTo(fixture.player().position);
      const lead = new THREE.Vector3(...moving.position).addScaledVector(new THREE.Vector3(...moving.velocity), distance / SHIPS.ywing.weapons.find(weapon => weapon.id === 'ion-cannon').speed);
      fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lead.sub(fixture.player().position).normalize());
      fixture.key('Space'); debug.step(0.025);
      stunned = debug.inspect().enemies.some(enemy => enemy.stunned > 2);
    }
    fixture.key('Space', false);
    assert.ok(stunned, 'a manually led ion bolt must physically hit the maneuvering target');
    assert.equal(game.getSnapshot().kills, 0);
  } finally { fixture.close(); }
});
