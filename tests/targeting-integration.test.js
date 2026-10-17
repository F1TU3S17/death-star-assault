import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';

test('manual laser fire keeps its axis even with an eligible offset target and a visible lead cue', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    const target = debug.inspect().enemies[1];
    fixture.player().position.fromArray(target.position).add(new THREE.Vector3(40, 0, 300));
    fixture.player().quaternion.identity();
    game.setCamera('cockpit');
    fixture.key('Space'); debug.step(.025); fixture.key('Space', false);
    const bolts = debug.inspect().projectileDetails.filter(projectile => projectile.owner === 'player');
    assert.equal(bolts.length, 2);
    for (const bolt of bolts) assert.ok(new THREE.Vector3(...bolt.velocity).normalize().dot(new THREE.Vector3(0, 0, -1)) > .999999);
    const snapshot = game.getSnapshot();
    assert.ok(snapshot.lead && Number.isFinite(snapshot.lead.x));
    assert.ok(Math.abs(snapshot.lead.x - snapshot.reticle.x) > .01, 'the pilot must aim toward the separate lead marker');
    assert.equal(snapshot.kills, 0);
  } finally { fixture.close(); }
});

test('premature torpedo launch is unguided; a tracked lock freezes on pause and visibly decays on loss', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); game.selectWeapon('proton-torpedo');
    assert.equal(game.getSnapshot().weapon.locked, false);
    fixture.key('Space'); debug.step(.025); fixture.key('Space', false);
    assert.equal(game.getSnapshot().weapon.ammo, 5);
    assert.equal(debug.inspect().projectileDetails.find(projectile => projectile.type === 'torpedo').locked, false);
    game.restart(); game.selectWeapon('proton-torpedo');
    const targetId = game.getSnapshot().weapon.lockTargetId;
    assert.ok(targetId);
    const track = seconds => {
      for (let elapsed = 0; elapsed < seconds - .001; elapsed += .025) {
        const target = debug.inspect().enemies.find(enemy => enemy.id === targetId);
        const direction = new THREE.Vector3(...target.position).sub(fixture.player().position).normalize();
        fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        debug.step(.025);
      }
    };
    track(1);
    assert.ok(game.getSnapshot().weapon.lockProgress > .4);
    assert.equal(game.getSnapshot().weapon.locked, false);
    game.pause();
    const progress = game.getSnapshot().weapon.lockProgress;
    debug.step(5);
    assert.equal(game.getSnapshot().weapon.lockProgress, progress);
    game.resume(); track(.8);
    assert.equal(game.getSnapshot().weapon.locked, true);
    fixture.player().rotateY(Math.PI);
    debug.step(.1);
    const lost = game.getSnapshot().weapon;
    assert.equal(lost.locked, false);
    assert.equal(lost.lockStatus, 'losing');
    assert.ok(lost.lockProgress > 0 && lost.lockProgress < 1);
    game.selectWeapon('laser'); game.selectWeapon('proton-torpedo');
    assert.equal(game.getSnapshot().weapon.lockProgress, 0);
  } finally { fixture.close(); }
});
