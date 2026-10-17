import test from 'node:test';
import assert from 'node:assert/strict';
import { engineHarness } from './engine-harness.js';
import { engineReachPhase } from './campaign-fixtures.js';

const integrity = snapshot => Object.fromEntries(snapshot.systems.systems.map(system => [system.id, system.integrity]));

test('hull faults reduce real flight acceleration and speed and delay the next physical laser salvo', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    const measure = damaged => {
      game.start();
      // Both runs begin at the same safe pose and zero velocity, with the same controls.
      fixture.player().position.set(0, 2000, 0);
      fixture.player().quaternion.identity();
      if (damaged) { debug.damage(100); debug.damage(54); }
      debug.step(.25);
      const accelerating = debug.inspect().flight.speed;
      debug.step(4);
      const cruising = debug.inspect().flight.speed;
      const laserCount = () => fixture.audioCalls.filter(call => call.name === 'laser').length;
      const initialShots = laserCount();
      fixture.key('Space');
      debug.step(.025);
      assert.equal(laserCount() - initialShots, 1, 'the first physical salvo must fire in both conditions');
      assert.equal(debug.inspect().projectileDetails.filter(bolt => bolt.owner === 'player').length, 2);
      debug.step(.2);
      fixture.key('Space', false);
      const salvos = laserCount() - initialShots;
      assert.equal(game.getSnapshot().health, damaged ? 46 : 100, 'the comparison must not take incidental hull damage');
      return { accelerating, cruising, salvos };
    };
    const intact = measure(false);
    const damaged = measure(true);
    assert.ok(damaged.accelerating < intact.accelerating * .95, `faulty acceleration ${damaged.accelerating} must trail intact ${intact.accelerating}`);
    assert.ok(damaged.cruising < intact.cruising * .95, `faulty speed ${damaged.cruising} must trail intact ${intact.cruising}`);
    assert.equal(intact.salvos, 2, 'intact guns can fire a second salvo after their ordinary cooldown');
    assert.equal(damaged.salvos, 1, 'damaged guns must still be waiting at the same elapsed time');
    debug.step(.025);
    fixture.key('Space');
    debug.step(.025);
    fixture.key('Space', false);
    assert.equal(debug.inspect().projectileDetails.filter(bolt => bolt.owner === 'player').length, 4, 'damaged guns eventually fire a second real salvo');
  } finally { fixture.close(); }
});

test('real shield absorption gates system faults; selected engine repair freezes on pause and repairs only engines', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    debug.damage(100);
    assert.equal(game.getSnapshot().health, 100);
    assert.equal(game.getSnapshot().shields, 0);
    assert.deepEqual(integrity(game.getSnapshot()), { engines: 100, weapons: 100, sensors: 100 });
    assert.equal(fixture.events.filter(event => event.type === 'system-damage').length, 0);

    debug.damage(54);
    const damaged = game.getSnapshot();
    assert.equal(damaged.health, 46);
    assert.deepEqual(integrity(damaged), { engines: 70, weapons: 70, sensors: 70 });
    assert.ok(fixture.events.some(event => event.type === 'system-damage'));
    assert.ok(fixture.events.some(event => event.type === 'radio' && event.speaker === 'R2-D2'));
    assert.equal(game.selectRepair('engines'), true);
    fixture.key('KeyV');
    assert.equal(game.getSnapshot().repair.active, true);
    assert.equal(game.getSnapshot().repair.target, 'engines');
    assert.equal(game.selectRepair('weapons'), false, 'an active repair cannot be redirected');
    fixture.key('KeyB');
    assert.equal(game.getSnapshot().systems.selected, 'engines', 'the keyboard cannot redirect an active repair either');

    // Move only the player pose away from live enemies so incoming fire cannot interrupt this channel.
    fixture.player().position.set(12000, 12000, 12000);
    debug.step(1);
    game.pause();
    const paused = game.getSnapshot();
    const eventCount = fixture.events.length;
    debug.step(8);
    assert.deepEqual(game.getSnapshot().repair, paused.repair);
    assert.deepEqual(game.getSnapshot().systems, paused.systems);
    assert.equal(fixture.events.length, eventCount);
    assert.equal(game.selectRepair('sensors'), false);
    game.resume();
    debug.step(2.1);
    const repaired = game.getSnapshot();
    assert.equal(repaired.repair.active, false);
    assert.deepEqual(integrity(repaired), { engines: 100, weapons: 70, sensors: 70 });
    assert.equal(repaired.health, damaged.health, 'system repair does not restore hull');
    assert.equal(fixture.events.filter(event => event.type === 'repair' && event.status === 'complete').length, 1);
    assert.equal(repaired.repair.charges, 1);

    game.setWingOrder('escort');
    game.restart();
    const reset = game.getSnapshot();
    assert.deepEqual(integrity(reset), { engines: 100, weapons: 100, sensors: 100 });
    assert.equal(reset.systems.selected, 'hull');
    assert.equal(reset.repair.target, 'hull');
    assert.equal(reset.repair.charges, 2);
    assert.equal(reset.wingOrder.order, 'cover');
    assert.equal(reset.tacticalScore, 0);
    assert.equal(debug.inspect().supportWingmen.length, 0);
  } finally { fixture.close(); }
});

test('G cycles real wing commands and an active support pair retargets from aimed battery to escort threat', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'escort');
    assert.equal(game.getSnapshot().wingOrder.order, 'cover');
    for (const order of ['attack', 'escort', 'cover']) {
      fixture.key('KeyG');
      assert.equal(game.getSnapshot().wingOrder.order, order);
    }
    const before = debug.inspect();
    const scene = fixture.player().parent;
    // Existing meshes are the physical fixture; no enemy records or target-selection results are injected.
    const meshFor = enemy => scene.children.find(mesh => mesh.position.toArray().every((value, index) => value === enemy.position[index]));
    const battery = before.enemies.find(enemy => enemy.id === 'escort-route-battery');
    meshFor(battery).position.set(0, 500, 0);
    const fighters = before.enemies.filter(enemy => enemy.kind === 'tie');
    assert.ok(fighters.length >= 2);
    for (const [index, enemy] of fighters.entries()) meshFor(enemy).position.set(600 + index * 80, 90, 700);
    fixture.player().position.set(0, 500, 200);
    fixture.player().quaternion.identity();
    game.setWingOrder('attack');
    assert.equal(game.requestSupport(), true);
    assert.equal(debug.inspect().supportWingmen.length, 2);
    assert.ok(debug.inspect().supportWingmen.every(wingman => wingman.targetId === battery.id));
    game.setWingOrder('escort');
    debug.step(.025);
    const escorted = debug.inspect();
    assert.ok(escorted.supportWingmen.every(wingman => fighters.some(enemy => enemy.id === wingman.targetId)), 'escort orders choose a living fighter near the allied formation');
    assert.ok(escorted.supportWingmen.every(wingman => wingman.targetId !== battery.id));
    const pausedTargets = escorted.supportWingmen;
    game.pause();
    const count = fixture.events.length;
    fixture.key('KeyG');
    debug.step(2);
    assert.equal(game.getSnapshot().wingOrder.order, 'escort');
    assert.deepEqual(debug.inspect().supportWingmen, pausedTargets);
    assert.equal(fixture.events.length, count);
  } finally { fixture.close(); }
});

test('real enemy pairs expose pilot and squad roles and deliver formation radio once across pause', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    debug.step(.025);
    const fighters = debug.inspect().enemies.filter(enemy => enemy.kind === 'tie');
    assert.ok(fighters.length >= 2);
    assert.deepEqual(fighters.slice(0, 2).map(enemy => enemy.pilotRole), ['leader', 'novice']);
    assert.deepEqual(fighters.slice(0, 2).map(enemy => enemy.squadRole), ['bait', 'flank']);
    const formations = fixture.events.filter(event => event.type === 'squadron' && event.code === 'formation');
    assert.ok(formations.length > 0);
    assert.ok(fixture.events.some(event => event.type === 'radio' && event.speaker === 'Красный Лидер' && event.text === formations[0].text));
    game.pause();
    const paused = debug.inspect().enemies;
    const count = fixture.events.length;
    debug.step(10);
    assert.deepEqual(debug.inspect().enemies, paused);
    assert.equal(fixture.events.length, count);
    game.resume();
    debug.step(.025);
    assert.equal(fixture.events.filter(event => event.type === 'squadron' && event.code === 'formation').length, formations.length);
    game.restart();
    debug.step(.025);
    assert.deepEqual(debug.inspect().enemies.filter(enemy => enemy.kind === 'tie').slice(0, 2).map(enemy => enemy.pilotRole), ['leader', 'novice']);
  } finally { fixture.close(); }
});

test('three physical escort checkpoints award tactical score once and restart clears the earned score', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'escort');
    const scene = fixture.player().parent;
    // Isolate preservation scoring from combat by keeping real threat meshes away from the route.
    // The formation, its health, moving anchor and checkpoint decisions remain engine-owned.
    for (let frame = 0; frame < 600 && game.getSnapshot().phase === 'escort'; frame++) {
      const state = debug.inspect();
      for (const [index, enemy] of state.enemies.entries()) {
        const mesh = scene.children.find(object => object.position.toArray().every((value, axis) => value === enemy.position[axis]));
        assert.ok(mesh);
        mesh.position.set(100000 + index * 1000, 100000, 100000);
      }
      fixture.player().position.fromArray(state.escortAnchor);
      fixture.player().position.y += 40;
      fixture.player().position.z += 300;
      fixture.player().quaternion.identity();
      debug.step(.1);
    }
    assert.notEqual(game.getSnapshot().phase, 'escort', 'the formation must physically reach all three route checkpoints');
    assert.equal(game.getSnapshot().tacticalScore, 150);
    assert.ok(game.getSnapshot().content.bonusScore >= 150);
    const bonuses = () => fixture.events.filter(event => event.id === 'escort-bonus:preserved-formation');
    assert.equal(bonuses().length, 1);
    assert.equal(bonuses()[0].bonus, 150);
    game.pause();
    debug.step(5);
    assert.equal(game.getSnapshot().tacticalScore, 150);
    assert.equal(bonuses().length, 1);
    game.restart();
    assert.equal(game.getSnapshot().tacticalScore, 0);
    assert.equal(game.getSnapshot().content.bonusScore, 0);
  } finally { fixture.close(); }
});
