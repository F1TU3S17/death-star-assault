import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';

test('brake-turn keys create real sideways momentum, while pause and restart preserve their contracts', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    fixture.player().position.y = 3000;
    debug.step(3);
    fixture.key('ControlLeft'); fixture.key('KeyD');
    debug.step(.35);
    const state = debug.inspect();
    const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(fixture.player().quaternion);
    const momentum = new THREE.Vector3(...state.playerVelocity);
    assert.ok(momentum.length() > 20);
    assert.ok(nose.dot(momentum.normalize()) < .99, 'movement must retain the old vector after the nose turns');
    assert.ok(state.flight.drifting && state.flight.slip > .1);
    game.pause();
    const paused = debug.inspect();
    debug.step(5);
    assert.deepEqual(debug.inspect().playerVelocity, paused.playerVelocity);
    assert.deepEqual(debug.inspect().playerPosition, paused.playerPosition);
    game.restart();
    assert.ok(debug.inspect().playerVelocity.every(value => value === 0));
    assert.equal(game.getSnapshot().flight.drifting, false);
  } finally { fixture.close(); }
});
