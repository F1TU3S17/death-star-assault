import test from 'node:test';
import assert from 'node:assert/strict';
import { getPowerProfile, createRepairSystem, createSupportSystem } from '../src/game/simulation.js';
import { engineHarness } from './engine-harness.js';

test('power allocation trades engine output, weapon output and shield regeneration', () => {
  assert.equal(getPowerProfile('engines').speed, 1.18);
  assert.equal(getPowerProfile('engines').boost, 1.18);
  assert.ok(getPowerProfile('engines').cooling < 1);
  assert.ok(getPowerProfile('engines').shieldRegen < 1);
  assert.equal(getPowerProfile('weapons').damage, 1.2);
  assert.equal(getPowerProfile('weapons').cooling, 1.2);
  assert.ok(getPowerProfile('weapons').speed < 1);
  assert.equal(getPowerProfile('shields').shieldRegen, 2);
  assert.ok(getPowerProfile('shields').speed < 1);
  assert.ok(getPowerProfile('shields').cooling < 1);
  const isolated = getPowerProfile('balanced');
  isolated.speed = 900;
  assert.equal(getPowerProfile('balanced').speed, 1);
  assert.deepEqual(getPowerProfile('invalid'), getPowerProfile('balanced'));
});

test('astromech repair has finite charges, a real channel, interruption loss and a cooldown', () => {
  const repair = createRepairSystem();
  assert.equal(repair.start(100, 100), false);
  assert.equal(repair.start(50, 100), true);
  assert.equal(repair.start(50, 100), false);
  assert.equal(repair.getSnapshot().charges, 1);
  assert.equal(repair.update(1), 0);
  assert.equal(repair.interrupt(), true);
  assert.equal(repair.getSnapshot().charges, 1, 'an interrupted channel does not refund its charge');
  assert.equal(repair.update(20), 0);
  assert.equal(repair.start(50, 100), true);
  for (let frame = 0; frame < 119; frame++) assert.equal(repair.update(0.025), 0);
  assert.equal(repair.update(0.025), 25);
  assert.equal(repair.update(30), 0, 'healing can complete only once');
  assert.equal(repair.start(75, 100), false);
  repair.reset();
  assert.deepEqual(repair.getSnapshot(), { charges: 2, active: false, remaining: 0, cooldown: 0 });
});

test('support calls have three charges and cannot bypass the 25-second cooldown', () => {
  const support = createSupportSystem();
  for (let call = 0; call < 3; call++) {
    assert.equal(support.request(), true);
    assert.equal(support.request(), false);
    support.update(24);
    assert.equal(support.request(), false);
    support.update(NaN);
    support.update(-1);
    assert.equal(support.getSnapshot().cooldown, 1);
    support.update(1);
  }
  assert.equal(support.request(), false);
  assert.equal(support.getSnapshot().charges, 0);
  support.reset();
  assert.deepEqual(support.getSnapshot(), { charges: 3, cooldown: 0 });
});

test('power keyboard controls change real flight speed and projectile damage, and restart balances power', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.key('Digit1'); fixture.key('Digit1', false);
    debug.step(2);
    assert.equal(game.getSnapshot().powerMode, 'engines');
    assert.ok(game.getSnapshot().speed >= 111);
    assert.ok(game.getSnapshot().maxSpeed > 182);
    fixture.key('Digit2'); fixture.key('Digit2', false);
    fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
    const bolt = debug.inspect().projectileDetails.find(projectile => projectile.owner === 'player');
    assert.ok(bolt);
    assert.ok(Math.abs(bolt.damage - 19 * 0.6 * 1.2) < 1e-8);
    fixture.key('Digit3'); fixture.key('Digit3', false);
    assert.equal(game.getSnapshot().powerMode, 'shields');
    assert.equal(game.getSnapshot().powerProfile.shieldRegen, 2);
    game.restart();
    assert.equal(game.getSnapshot().powerMode, 'balanced');
  } finally { fixture.close(); }
});

test('repair channels block player fire, freeze on pause and heal hull; incoming damage interrupts', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.player().position.set(0, 3000, 0);
    debug.damage(125);
    assert.equal(game.getSnapshot().health, 75);
    fixture.key('KeyV'); fixture.key('KeyV', false);
    assert.equal(game.getSnapshot().repair.active, true);
    assert.equal(game.getSnapshot().repair.charges, 1);
    fixture.key('Space'); debug.step(1); fixture.key('Space', false);
    assert.equal(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'), false);
    game.pause();
    const paused = game.getSnapshot().repair;
    debug.step(10);
    assert.deepEqual(game.getSnapshot().repair, paused);
    game.resume();
    debug.step(2);
    assert.equal(game.getSnapshot().health, 100);
    assert.equal(game.getSnapshot().repair.active, false);
    game.restart();
    debug.damage(125);
    assert.equal(game.repair(), true);
    debug.damage(1);
    assert.equal(game.getSnapshot().repair.active, false);
    assert.equal(game.getSnapshot().repair.charges, 1);
    assert.equal(game.repair(), false);
    game.restart();
    assert.deepEqual(game.getSnapshot().repair, { charges: 2, active: false, remaining: 0, cooldown: 0 });
  } finally { fixture.close(); }
});

test('requested wingmen create physical friendly bolts and score hits, with no immediate damage or friendly fire', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    const originalHealth = debug.inspect().enemies.map(enemy => enemy.health);
    fixture.key('KeyT'); fixture.key('KeyT', false);
    assert.equal(game.getSnapshot().support.charges, 2);
    assert.equal(game.getSnapshot().support.active, true);
    assert.equal(debug.inspect().supportWingmen.length, 2);
    assert.deepEqual(debug.inspect().enemies.map(enemy => enemy.health), originalHealth);
    assert.equal(game.requestSupport(), false);
    // Keep the player clear of the test's firing lane while the actual wingmen intercept.
    fixture.player().position.y = 1500;
    debug.step(0.3);
    assert.ok(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'friendly'));
    game.pause();
    const life = debug.inspect().supportWingmen.map(wingman => wingman.life);
    const cooldown = game.getSnapshot().support.cooldown;
    debug.step(5);
    assert.deepEqual(debug.inspect().supportWingmen.map(wingman => wingman.life), life);
    assert.equal(game.getSnapshot().support.cooldown, cooldown);
    game.resume();
    debug.step(4);
    assert.ok(game.getSnapshot().kills >= 1, 'only physical collision can count this support kill');
    assert.equal(game.getSnapshot().heat, 0, 'the player has not fired');
    assert.equal(game.getSnapshot().health, 100);
    debug.step(6);
    assert.equal(debug.inspect().supportWingmen.length, 0);
    game.restart();
    assert.deepEqual(game.getSnapshot().support, { charges: 3, cooldown: 0, active: false });
  } finally { fixture.close(); }
});

test('a real support bolt crossing the player cannot damage shields or hull', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    assert.equal(game.requestSupport(), true);
    debug.step(0.3);
    const bolt = debug.inspect().projectileDetails.find(projectile => projectile.owner === 'friendly');
    assert.ok(bolt);
    const length = Math.hypot(...bolt.velocity);
    fixture.player().position.set(...bolt.position.map((coordinate, index) => coordinate + bolt.velocity[index] / length * 8));
    debug.step(0.025);
    assert.equal(game.getSnapshot().health, 100);
    assert.equal(game.getSnapshot().shields, 100);
  } finally { fixture.close(); }
});

test('boost permits fire with locked-open S-foils; closed and moving wings interlock weapons', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.key('ShiftLeft'); debug.step(1.3);
    assert.equal(game.getSnapshot().sfoils.openness, 1);
    const boostSpeed = game.getSnapshot().speed;
    fixture.key('Space'); debug.step(0.2);
    assert.ok(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'));
    assert.ok(game.getSnapshot().speed >= boostSpeed, 'firing must not cancel acceleration');
    fixture.key('Space', false);
    fixture.key('KeyX'); fixture.key('KeyX', false);
    debug.step(3);
    assert.equal(game.getSnapshot().sfoils.mode, 'closed');
    assert.equal(game.getSnapshot().sfoils.openness, 0);
    game.selectWeapon('proton-torpedo');
    const ammo = game.getSnapshot().weapon.ammo;
    fixture.key('Space'); debug.step(0.5);
    assert.equal(game.getSnapshot().sfoils.mode, 'closed');
    assert.equal(game.getSnapshot().weapon.ammo, ammo);
    assert.equal(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'), false);
    fixture.key('KeyX'); fixture.key('KeyX', false);
    debug.step(0.2);
    assert.equal(game.getSnapshot().weapon.ammo, ammo, 'no shot while unfolding');
    debug.step(2.8);
    assert.equal(game.getSnapshot().sfoils.openness, 1);
    assert.ok(game.getSnapshot().weapon.ammo < ammo);
    assert.ok(game.getSnapshot().speed >= boostSpeed, 'boost stays held through the full wing cycle');
    fixture.key('Space', false); fixture.key('ShiftLeft', false);
    game.start({ shipId: 'ywing' });
    assert.equal(game.getSnapshot().sfoils.available, false);
    assert.equal(game.toggleSfoils(), false);
  } finally { fixture.close(); }
});
