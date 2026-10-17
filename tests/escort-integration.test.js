import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';
import { engineReachPhase } from './campaign-fixtures.js';

const BATTERY = 'escort-route-battery';
const NODE = 'escort-power-node';

function escort(fixture) {
  fixture.game.start();
  engineReachPhase(fixture.debug, 'escort');
  fixture.key('ControlLeft');
}

function fireAt(fixture, id, onFrame = () => {}) {
  fixture.game.selectWeapon('laser');
  fixture.key('Space');
  for (let frame = 0; frame < 240; frame++) {
    const target = fixture.debug.inspect().enemies.find(enemy => enemy.id === id);
    if (!target) break;
    // Only the player's pose is a fixture: actual bolts must traverse and hit the real target.
    fixture.player().position.copy(new THREE.Vector3(...target.position)).add(new THREE.Vector3(0, 0, 180));
    fixture.player().quaternion.identity();
    const before = fixture.debug.inspect();
    fixture.debug.step(.025);
    onFrame(before, fixture.debug.inspect());
  }
  fixture.key('Space', false);
  assert.equal(fixture.debug.inspect().enemies.some(enemy => enemy.id === id), false, 'physical laser hits destroy the chosen target');
}

test('escort creates three simultaneous priorities; intro choice waits one tick, pause and restart preserve lifecycle', async () => {
  const fixture = await engineHarness();
  try {
    escort(fixture);
    const threats = fixture.debug.inspect().enemies;
    const battery = threats.find(enemy => enemy.id === BATTERY);
    const node = threats.find(enemy => enemy.id === NODE);
    assert.ok(threats.filter(enemy => enemy.kind === 'tie').length >= 4);
    assert.deepEqual([battery.health, battery.position, battery.bonusOnly, battery.disabled], [138, [190, -115, 250], true, false]);
    assert.deepEqual([node.health, node.position, node.bonusOnly], [85, [-580, -115, -650], true]);
    const choices = () => fixture.events.filter(event => event.id === 'escort-tactics:priority-choice');
    assert.equal(choices().length, 0, 'phase introduction is delivered before tactical priorities');
    fixture.game.pause();
    const paused = fixture.game.getSnapshot().escortTactics;
    const entities = fixture.debug.inspect().enemies;
    fixture.debug.step(5);
    assert.deepEqual(fixture.game.getSnapshot().escortTactics, paused);
    assert.deepEqual(fixture.debug.inspect().enemies, entities);
    assert.equal(choices().length, 0);
    fixture.game.resume(); fixture.debug.step(.025);
    assert.equal(choices().length, 1);
    fixture.debug.step(.25);
    assert.equal(choices().length, 1);
    fixture.game.restart();
    assert.equal(fixture.game.getSnapshot().escortTactics, null);
    engineReachPhase(fixture.debug, 'escort');
    assert.deepEqual(fixture.game.getSnapshot().escortTactics.decisions, []);
    assert.ok(fixture.debug.inspect().enemies.find(enemy => enemy.id === BATTERY && !enemy.disabled));
  } finally { fixture.close(); }
});

test('physical power-node destruction shuts down live battery, restores finite real shields once and never grants checkpoints', async () => {
  const fixture = await engineHarness();
  try {
    escort(fixture);
    for (let frame = 0; frame < 480; frame++) {
      const inspection = fixture.debug.inspect();
      if (inspection.allies.some(ally => ally.shields < 85) && inspection.enemies.find(enemy => enemy.id === BATTERY).lastShotAt !== null) break;
      fixture.player().position.set(0, 250, 1300);
      fixture.player().quaternion.identity();
      fixture.debug.step(.025);
    }
    assert.ok(fixture.debug.inspect().allies.some(ally => ally.shields < 85), 'real enemy bolts must damage escort shields before the reward');
    const checkpoint = fixture.game.getSnapshot().mission.count;
    let restored = false;
    fireAt(fixture, NODE, (before, after) => {
      if (before.enemies.some(enemy => enemy.id === NODE) && !after.enemies.some(enemy => enemy.id === NODE)) {
        for (const ally of after.allies) {
          const previous = before.allies.find(entry => entry.id === ally.id);
          assert.ok(Math.abs(ally.shields - Math.min(85, previous.shields + 25)) < .051, 'reward is +25 actual shield units, clamped to the physical maximum');
          if (ally.shields > previous.shields + 1) restored = true;
        }
      }
    });
    assert.ok(restored);
    assert.equal(fixture.game.getSnapshot().mission.count, checkpoint);
    const battery = fixture.debug.inspect().enemies.find(enemy => enemy.id === BATTERY);
    assert.equal(battery.disabled, true);
    assert.equal(battery.health, 138, 'relay cuts power without inventing battery damage');
    assert.ok(battery.lastShotAt !== null, 'battery was a live firing threat before shutdown');
    assert.equal(fixture.events.filter(event => event.type === 'escort-threat-disabled').length, 1);
    fixture.player().position.fromArray(battery.position).add(new THREE.Vector3(0, 0, 180));
    fixture.player().quaternion.identity();
    fixture.game.setCamera('cockpit'); fixture.game.selectWeapon('proton-torpedo');
    fixture.debug.step(.025);
    assert.notEqual(fixture.game.getSnapshot().weapon.lockTargetId, BATTERY);
    assert.notEqual(fixture.game.getSnapshot().targeting?.id, BATTERY);
    assert.equal(fixture.game.getSnapshot().worldMarkers.some(marker => [BATTERY, NODE].includes(marker.id)), false);
    fixture.debug.step(5);
    assert.equal(fixture.debug.inspect().enemies.find(enemy => enemy.id === BATTERY).lastShotAt, battery.lastShotAt, 'disabled battery cannot fire any further shots');
    assert.equal(fixture.events.filter(event => event.type === 'escort-threat-disabled').length, 1);
    assert.equal(fixture.game.getSnapshot().mission.count, checkpoint);
  } finally { fixture.close(); }
});

test('physical battery kill stops only the battery and leaves node choice and shield reward available', async () => {
  const fixture = await engineHarness();
  try {
    escort(fixture);
    fireAt(fixture, BATTERY);
    assert.equal(fixture.game.getSnapshot().mission.count, 0);
    assert.equal(fixture.debug.inspect().enemies.find(enemy => enemy.id === NODE).health, 85);
    assert.equal(fixture.events.filter(event => event.type === 'escort-battery-disabled').length, 1);
    assert.equal(fixture.events.filter(event => event.allyShieldRestore).length, 0);
    assert.deepEqual(fixture.game.getSnapshot().escortTactics.decisions, ['battery-suppressed']);
    fireAt(fixture, NODE);
    assert.equal(fixture.events.filter(event => event.allyShieldRestore === 25).length, 1);
    assert.equal(fixture.game.getSnapshot().mission.count, 0);
    assert.ok(fixture.game.getSnapshot().escortTactics.decisions.includes('relay-destroyed'));
  } finally { fixture.close(); }
});
