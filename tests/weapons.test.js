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
    assert.equal(game.getSnapshot().weapon.locked, true);
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
    debug.step(1.2);
    assert.ok(debug.inspect().enemies.some(enemy => enemy.stunned > 2));
    assert.equal(game.getSnapshot().kills, 0);
  } finally { fixture.close(); }
});
