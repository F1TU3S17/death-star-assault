import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';

test('chase camera stays outside the hull on cockpit switches and flight corrections', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    for (let turn = 0; turn < 4; turn++) {
      game.setCamera('cockpit');
      debug.step(0.025);
      assert.equal(debug.inspect().cameraNear, 0.05);
      game.setCamera('chase');
      fixture.player().position.add(new THREE.Vector3(100 * turn, -30, 180));
      fixture.player().rotateY(Math.PI * 0.7);
      debug.step(0.025);
      const state = debug.inspect();
      const distance = new THREE.Vector3(...state.cameraPosition).distanceTo(new THREE.Vector3(...state.playerPosition));
      assert.ok(distance >= 16, `chase camera must not enter the hull: ${distance}`);
      assert.equal(state.cameraNear, 1.5, 'exterior view retains distant surface depth precision');
    }
  } finally { fixture.close(); }
});

test('boost does not push the chase camera away and shrink the ship', async () => {
  const fixture = await engineHarness();
  try {
    fixture.game.start();
    fixture.player().position.y = 3000;
    fixture.key('ShiftLeft');
    for (let index = 0; index < 60; index++) {
      fixture.debug.step(0.1);
      const state = fixture.debug.inspect();
      const distance = new THREE.Vector3(...state.cameraPosition).distanceTo(new THREE.Vector3(...state.playerPosition));
      assert.ok(distance <= Math.hypot(25.5, 6.5) + 0.001, `chase framing must remain consistent at speed: ${distance}`);
      assert.ok(distance >= 16);
    }
  } finally { fixture.close(); }
});
