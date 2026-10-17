import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';
import { getLeadSolution } from '../src/game/targeting.js';

test('Space and left mouse fire physical shots that destroy TIEs during normal flight in both views', async () => {
  for (const camera of ['chase', 'cockpit']) for (const input of ['keyboard', 'mouse']) {
    const fixture = await engineHarness();
    try {
      const { game, debug } = fixture;
      game.start();
      game.setCamera(camera);
      debug.step(0.025);
      const player = fixture.player();
      const startingPosition = player.position.clone();
      const targets = debug.inspect().enemies.filter(enemy => enemy.health > 0);
      const target = targets.sort((a, b) => {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
        const dot = candidate => new THREE.Vector3(...candidate.position).sub(player.position).normalize().dot(forward);
        return dot(b) - dot(a);
      })[0];
      assert.ok(target, 'a live TIE is available for manual aiming');
      const targetId = target.id;
      const initialTargetHealth = target.health;
      const laser = game.getSnapshot().weapons.find(weapon => weapon.id === 'laser');
      assert.ok(laser?.speed > 0);
      let observedTargetMotion = false;
      let firstShot = true;
      if (input === 'keyboard') fixture.key('Space');
      else fixture.canvas.dispatch('mousedown', { button: 0 });
      for (let frame = 0; frame < 260 && game.getSnapshot().kills === 0; frame++) {
        const current = debug.inspect().enemies.find(enemy => enemy.id === targetId);
        assert.ok(current?.health > 0, 'manual fire must defeat the tracked TIE rather than a replacement');
        const origin = player.position;
        const targetPosition = new THREE.Vector3(...current.position);
        const targetVelocity = new THREE.Vector3(...current.velocity);
        if (targetVelocity.lengthSq() > 1e-6) observedTargetMotion = true;
        const lead = getLeadSolution({ origin, targetPosition, targetVelocity, projectileSpeed: laser.speed });
        player.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(lead.direction.x, lead.direction.y, lead.direction.z));
        debug.step(0.025);
        if (firstShot) {
          assert.ok(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'), `${camera}/${input} must launch`);
          assert.equal(game.getSnapshot().kills, 0, 'pulling the trigger cannot deal instant damage');
          assert.equal(debug.inspect().enemies.find(enemy => enemy.id === targetId).health, initialTargetHealth, 'the initial laser frame must not apply damage before collision');
          firstShot = false;
        }
      }
      if (input === 'keyboard') fixture.key('Space', false);
      else fixture.canvas.dispatch('mouseup', { button: 0 });
      assert.ok(observedTargetMotion, 'lead aiming must use the TIE’s observed in-flight velocity');
      assert.ok(game.getSnapshot().kills >= 1, `${camera}/${input} must kill through projectile collisions`);
      assert.ok(player.position.distanceTo(startingPosition) > 0.1, 'the player continues moving through normal flight while firing');
      assert.equal(game.getSnapshot().sfoils.openness, 1);
    } finally { fixture.close(); }
  }
});

test('reticle follows the real firing axis across exterior, portrait and cockpit cameras', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.player().position.y = 3000;
    for (const view of ['chase', 'portrait', 'cockpit']) {
      if (view === 'portrait') {
        fixture.canvas.clientWidth = 720;
        fixture.canvas.clientHeight = 1280;
        fixture.window.dispatch('resize');
      }
      game.setCamera(view === 'cockpit' ? 'cockpit' : 'chase');
      debug.step(1);
      const state = debug.inspect();
      const camera = new THREE.PerspectiveCamera(63, fixture.canvas.clientWidth / fixture.canvas.clientHeight, state.cameraNear, 24000);
      camera.position.fromArray(state.cameraPosition);
      camera.quaternion.fromArray(state.cameraQuaternion);
      camera.updateMatrixWorld();
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(fixture.player().quaternion);
      const point = fixture.player().position.clone().addScaledVector(forward, 1000).project(camera);
      const reticle = game.getSnapshot().reticle;
      assert.ok(Math.abs(reticle.x - (point.x * 0.5 + 0.5)) < 1e-8, view);
      assert.ok(Math.abs(reticle.y - (0.5 - point.y * 0.5)) < 1e-8, view);
      if (view === 'cockpit') assert.ok(Math.abs(reticle.y - 0.5) < 0.005, 'cockpit fire is aimed near the screen center');
      fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
      const bolt = debug.inspect().projectileDetails.find(projectile => projectile.owner === 'player');
      assert.ok(bolt);
      assert.ok(new THREE.Vector3(...bolt.velocity).normalize().dot(forward) > 0.999999, 'unassisted shots follow the displayed firing axis');
    }
  } finally { fixture.close(); }
});

test('mouse firing obeys manual S-foil interlock and pause clears the held trigger', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.player().position.y = 3000;
    game.selectWeapon('proton-torpedo');
    fixture.key('KeyX'); fixture.key('KeyX', false);
    fixture.canvas.dispatch('mousedown', { button: 0 });
    debug.step(3);
    assert.equal(game.getSnapshot().sfoils.mode, 'closed');
    assert.equal(game.getSnapshot().weapon.ammo, 6);
    fixture.key('KeyX'); fixture.key('KeyX', false);
    debug.step(0.2);
    assert.equal(game.getSnapshot().weapon.ammo, 6, 'moving S-foils cannot launch a torpedo');
    debug.step(2.8);
    assert.ok(game.getSnapshot().weapon.ammo < 6, 'the held mouse trigger resumes only after wings lock open');
    game.pause();
    const pausedAmmo = game.getSnapshot().weapon.ammo;
    debug.step(5);
    game.resume();
    debug.step(2);
    assert.equal(game.getSnapshot().weapon.ammo, pausedAmmo, 'resume needs a fresh trigger input');
    fixture.canvas.dispatch('mousedown', { button: 0 });
    debug.step(0.025);
    assert.equal(game.getSnapshot().weapon.ammo, pausedAmmo - 1);
  } finally { fixture.close(); }
});
