import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';

const aim = (player, target) => {
  const direction = target.clone().sub(player.position).normalize();
  player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
};

const walkerPosition = snapshot => {
  const position = snapshot.atAt?.position;
  return position ? new THREE.Vector3(position.x, position.y, position.z) : new THREE.Vector3(90, 0, 120);
};

test('Episode V: the Hoth chronicle runs from the ice plain to the evacuation', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();

    assert.equal(game.getSnapshot().phase, 'hoth-arrival', 'the chronicle opens on the ice plain');
    assert.equal(game.getSnapshot().mission.title, 'Ледяная равнина');

    debug.advanceMission();
    assert.equal(game.getSnapshot().phase, 'hoth-assault', 'the ground assault follows the arrival');
    debug.advanceMission();
    assert.equal(game.getSnapshot().phase, 'hoth-atat', 'the walker walks in after the ground assault');

    const walker = game.getSnapshot().atAt;
    assert.ok(walker, 'the AT-AT is a live target during its phase');
    assert.ok(walker.maxHealth > 0 && walker.health === walker.maxHealth);
    assert.equal(game.getSnapshot().weapon.id, 'laser', 'the X-wing opens with its laser cannons');
  } finally { fixture.close(); }
});

test('Episode V: the frontal plate deflects the walker while its legs take real damage', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();
    debug.advanceMission();
    debug.advanceMission();
    assert.equal(game.getSnapshot().phase, 'hoth-atat');

    const player = fixture.player();
    // The walker marches towards the base, so "in front" means a smaller z.
    const holdFire = (offset, aimPoint, steps) => {
      fixture.key('Space');
      for (let step = 0; step < steps; step += 1) {
        const walker = walkerPosition(game.getSnapshot());
        const parts = debug.inspect().walkerParts;
        const target = aimPoint(parts, walker);
        player.position.set(walker.x + offset.x, walker.y + offset.y, walker.z + offset.z);
        aim(player, target);
        debug.step(0.025);
      }
      fixture.key('Space', false);
    };

    // The hull between the joints: the frontal plate has to turn the shot away.
    const hull = (parts, walker) => new THREE.Vector3(walker.x, walker.y + 18, walker.z - 4);
    // A real leg joint, led by the walker's own march.
    const joint = parts => new THREE.Vector3(parts.legs[0].x, parts.legs[0].y, parts.legs[0].z - 8);

    const before = game.getSnapshot().atAt.health;
    holdFire({ x: 0, y: 18, z: -340 }, hull, 24);
    const blocked = game.getSnapshot().atAt;
    assert.equal(blocked.blocked, true, 'the frontal plate must deflect the shot');
    assert.equal(blocked.health, before, 'a deflected shot does no damage');

    holdFire({ x: 300, y: 12, z: 0 }, joint, 24);
    const bitten = game.getSnapshot().atAt;
    assert.equal(bitten.blocked, false, 'the leg joint is not armoured');
    assert.ok(bitten.health < before, `the leg must take damage (${bitten.health} < ${before})`);
    assert.equal(bitten.part, 'leg');
  } finally { fixture.close(); }
});

test('Episode V: the tow QTE cables the walker and the machine falls', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();
    debug.advanceMission();
    debug.advanceMission();
    assert.equal(game.getSnapshot().phase, 'hoth-atat');

    debug.advanceMission();
    assert.equal(game.getSnapshot().phase, 'hoth-tow', 'the tow-cable QTE follows the walker phase');
    assert.equal(game.getSnapshot().mode, 'qte');

    for (const key of ['KeyA', 'KeyD', 'KeyW', 'Space']) {
      game.submitQte(key);
      debug.step(0.05);
    }
    assert.equal(game.getSnapshot().phase, 'hoth-fall', 'the last command drops the tow and the walker falls');
    assert.equal(game.getSnapshot().mode, 'cinematic');

    debug.step(6);
    const walker = game.getSnapshot().atAt;
    assert.ok(walker, 'the walker stays on the field during the fall');
    assert.equal(walker.cabled, true, 'the cable keeps the walker held until it drops');
  } finally { fixture.close(); }
});

test('Episode V: the ground phase reads as a defence of Echo Base', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();
    debug.advanceMission();
    debug.step(0.05);
    const state = game.getSnapshot();
    assert.equal(state.phase, 'hoth-assault');
    assert.match(state.mission.title, /Оборон/i, 'the phase is a defence, not an assault on the base');
    assert.match(state.mission.objective, /Отбейте/i);
    assert.doesNotMatch(`${state.mission.title} ${state.mission.objective}`, /Уничтожьте|Штурм/i);
    const ids = state.sideObjectives.map(objective => objective.id);
    assert.deepEqual([...ids].sort(), ['hoth-shield-generator', 'hoth-siege-gun']);
    assert.equal(ids.includes('hoth-gun-posts'), false, 'the unreachable side objective is gone');
    const labels = Object.fromEntries(state.worldMarkers.map(marker => [marker.id, marker.label]));
    assert.equal(labels['hoth-siege-gun'], 'ОСАДНОЕ ОРУДИЕ');
    assert.equal(labels['hoth-shield-generator'], 'ГЕНЕРАТОР ЩИТА · CTRL / СКАН');
  } finally { fixture.close(); }
});

test('Episode V: AT-STs advance on the shield line from the Imperial side', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();
    debug.advanceMission();
    const walkers = () => debug.inspect().enemies.filter(enemy => enemy.kind === 'at-st');
    const before = walkers().map(enemy => enemy.position);
    assert.equal(before.length, 5);
    assert.ok(before.every(position => position[2] > -520), 'no walker starts on the landing pad or inside the base');
    const turrets = debug.inspect().enemies.filter(enemy => enemy.kind === 'turret');
    assert.ok(turrets.length >= 2);
    assert.ok(turrets.every(enemy => enemy.position[1] > -1), 'Hoth turrets stand on the snow, not below it');
    debug.step(1);
    const after = walkers().map(enemy => enemy.position);
    assert.ok(after.every((position, index) => position[2] < before[index][2] - 4), 'every walker marches towards the base');
    const shield = new THREE.Vector3(0, 0, -560);
    after.forEach((position, index) => {
      const moved = new THREE.Vector3(position[0] - before[index][0], 0, position[2] - before[index][2]).normalize();
      const intended = shield.clone().sub(new THREE.Vector3(before[index][0], 0, before[index][2])).normalize();
      assert.ok(moved.dot(intended) > 0.995, 'walkers head for the shield line, not through the base');
    });
  } finally { fixture.close(); }
});

test('Episode V: the transports leave the pad and the chronicle ends in victory', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.setEpisode('episode5');
    game.start();
    for (let step = 0; step < 5; step += 1) {
      debug.advanceMission();
      debug.step(0.2);
    }
    assert.equal(game.getSnapshot().phase, 'hoth-evacuation', 'the evacuation is the last playable phase');

    debug.step(4);
    const victory = debug.advanceMission();
    assert.ok(victory, 'the chronicle can be completed');
    assert.equal(game.getSnapshot().phase, 'victory', 'the last transport away ends the chronicle');
  } finally { fixture.close(); }
});
