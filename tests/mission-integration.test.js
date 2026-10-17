import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';
import { engineReachPhase } from './campaign-fixtures.js';

test('physical sensor flyby scans with braking and facing, freezes during pause and resets on restart', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'surface');
    const sensor = debug.inspect().missionProps.find(prop => prop.id === 'tactical-sensor');
    assert.ok(sensor, 'the scan objective must have a physical world prop');
    fixture.key('ControlLeft');
    debug.step(1.5); // Settle actual flight speed before entering scan range.
    fixture.player().position.copy(new THREE.Vector3(...sensor.position)).add(new THREE.Vector3(0, 0, 250));
    fixture.player().quaternion.identity();
    debug.step(1);
    const progress = game.getSnapshot().content.sideObjectives[0].progress;
    assert.ok(progress > 0.9 && progress < 1.1, `Actual scanning progress: ${progress}`);
    game.pause();
    const paused = game.getSnapshot().content;
    debug.step(5);
    assert.deepEqual(game.getSnapshot().content, paused);
    game.resume(); fixture.key('ControlLeft');
    debug.step(2.1);
    assert.equal(game.getSnapshot().content.sideObjectives[0].complete, true);
    assert.equal(game.getSnapshot().content.bonusScore, 150);
    assert.equal(game.getSnapshot().mission.count, 0, 'a scan must not count as a destroyed battery');
    assert.equal(fixture.events.filter(event => event.type === 'side-complete' && event.objectiveId === 'sensor-scan').length, 1);
    game.restart();
    assert.equal(game.getSnapshot().content.bonusScore, 0);
    assert.deepEqual(game.getSnapshot().content.history, []);
    assert.equal(debug.inspect().missionProps.length, 0);
  } finally { fixture.close(); }
});

test('a physically reached escort waypoint spawns one optional marked interceptor pair', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'escort');
    assert.deepEqual(debug.inspect().enemies.filter(enemy => enemy.bonusOnly).map(enemy => enemy.id).sort(), ['escort-power-node', 'escort-route-battery']);
    fixture.key('ControlLeft');
    // Follow the real moving formation without modifying its ships, health or waypoint state.
    for (let frame = 0; frame < 300 && game.getSnapshot().mission.count === 0; frame++) {
      fixture.player().position.copy(new THREE.Vector3(...debug.inspect().escortAnchor)).add(new THREE.Vector3(0, 40, 300));
      fixture.player().quaternion.identity();
      debug.step(0.1);
    }
    assert.equal(game.getSnapshot().phase, 'escort');
    assert.equal(game.getSnapshot().mission.count, 1);
    const marked = debug.inspect().enemies.filter(enemy => enemy.bonusOnly && enemy.kind === 'tie');
    assert.deepEqual(marked.map(enemy => enemy.id).sort(), ['escort-ace-1', 'escort-ace-2']);
    assert.ok(marked.every(enemy => enemy.kind === 'tie' && enemy.variant === 'ace'));
    const event = fixture.events.find(event => event.type === 'spawn-wave' && event.waveId === 'escort-flank');
    assert.ok(event);
    debug.step(1);
    assert.equal(fixture.events.filter(entry => entry.type === 'spawn-wave' && entry.waveId === 'escort-flank').length, 1);
    assert.equal(game.getSnapshot().content.sideObjectives[0].progress, 0, 'spawning an ambush does not complete it');
    assert.equal(game.getSnapshot().content.bonusScore, 0);
  } finally { fixture.close(); }
});

test('active vent physically damages the player, pauses, and is disabled by real regulator hits', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'trench');
    fixture.key('ControlLeft');
    fixture.player().position.set(34, -45, 800);
    debug.step(5.1);
    const vent = game.getSnapshot().content.vent;
    assert.equal(vent.active, true);
    assert.equal(debug.inspect().missionProps.filter(prop => prop.kind === 'vent').length, 3);
    const before = game.getSnapshot();
    fixture.player().position.set(vent.laneX, vent.floorY + 65, vent.zPositions[0]);
    fixture.player().quaternion.identity();
    debug.step(0.025);
    const after = game.getSnapshot();
    const damage = before.health + before.shields - after.health - after.shields;
    assert.ok(damage >= 17.9 && damage <= 18.1, `Vent damage must be 18, received ${damage}`);
    assert.equal(fixture.events.filter(event => event.type === 'vent-hit').length, 1);
    game.pause();
    const paused = game.getSnapshot();
    debug.step(5);
    assert.deepEqual(game.getSnapshot().content, paused.content);
    assert.equal(game.getSnapshot().shields, paused.shields);
    game.resume(); fixture.key('ControlLeft');

    // Cross the second real gate to keep the collision fixture on the current route segment.
    fixture.player().position.set(0, -45, -45);
    debug.step(0.025);
    assert.equal(game.getSnapshot().mission.count, 2);
    const regulator = debug.inspect().enemies.find(enemy => enemy.id === 'trench-coolant-regulator');
    assert.ok(regulator?.bonusOnly);
    fixture.player().position.copy(new THREE.Vector3(...regulator.position)).add(new THREE.Vector3(0, 0, 200));
    fixture.player().quaternion.identity();
    fixture.key('Space');
    for (let frame = 0; frame < 100 && debug.inspect().enemies.some(enemy => enemy.id === regulator.id); frame++) debug.step(0.025);
    fixture.key('Space', false);
    assert.equal(debug.inspect().enemies.some(enemy => enemy.id === regulator.id), false, 'real laser bolts must destroy the regulator');
    assert.equal(game.getSnapshot().content.vent.disabled, true);
    assert.equal(game.getSnapshot().content.vent.active, false);
    assert.equal(game.getSnapshot().content.bonusScore, 200);
    assert.equal(debug.inspect().relayBonus, false, 'the regulator must not grant the surface relay fleet upgrade');
    assert.equal(game.getSnapshot().kills, 1, 'the destroyed regulator counts in the generic destruction total');
    assert.equal(game.getSnapshot().mission.count, 2, 'the regulator must not advance the main trench objective');
    assert.equal(game.getSnapshot().phase, 'trench');
  } finally { fixture.close(); }
});
