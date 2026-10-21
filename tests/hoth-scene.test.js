import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAtAtMesh, createHothScene, HOTH_PHASES } from '../src/game/hoth-scene.js';

function buildScene(options = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060b16, 0.000018);
  const hoth = createHothScene(scene, { seed: 4242, ...options });
  return { scene, hoth };
}

function step(hoth, seconds, phase, elapsed = 0) {
  const frame = 1 / 60;
  const frames = Math.round(seconds / frame);
  for (let index = 0; index < frames; index++) {
    hoth.update(frame, { phase, elapsed: elapsed + index * frame });
  }
}

test('the Hoth scene exposes the documented contract', () => {
  const { scene, hoth } = buildScene();
  assert.equal(typeof hoth.update, 'function');
  assert.equal(typeof hoth.setPhase, 'function');
  assert.equal(typeof hoth.launchTransport, 'function');
  assert.equal(typeof hoth.getSnapshot, 'function');
  assert.equal(typeof hoth.dispose, 'function');
  assert.equal(hoth.atAt.group.isObject3D, true);
  assert.equal(hoth.atAt.legs.length, 4);
  assert.equal(hoth.atAt.head.isObject3D, true);
  assert.ok(hoth.transports.length >= 3 && hoth.transports.length <= 4);
  assert.ok(scene.children.includes(hoth.root));
  hoth.dispose();
});

test('the AT-AT mesh exposes four pivoted leg chains plus head and body', () => {
  const walker = createAtAtMesh();
  assert.equal(walker.userData.legs.length, 4);
  assert.deepEqual(walker.userData.legs.map(leg => leg.id), ['fl', 'fr', 'bl', 'br']);
  for (const leg of walker.userData.legs) {
    for (const node of ['hip', 'knee', 'foot']) {
      assert.equal(leg[node]?.isObject3D, true, `leg ${leg.id} needs a ${node} node`);
    }
    // The chain order must be hip -> thigh -> knee -> shin -> foot.
    assert.equal(leg.hip.children.includes(leg.thigh), true);
    assert.equal(leg.thigh.children.includes(leg.knee), true);
    assert.equal(leg.knee.children.includes(leg.shin), true);
    assert.equal(leg.shin.children.includes(leg.foot), true);
    // The hip pivot sits at the top of the thigh.
    assert.ok(leg.hip.position.y > leg.knee.position.y);
    assert.ok(leg.knee.position.y > leg.foot.position.y);
  }
  assert.equal(walker.userData.head.isObject3D, true);
  assert.equal(walker.userData.body.isObject3D, true);
  assert.equal(walker.userData.legAnchor.isObject3D, true);
  walker.userData.legs[0].hip.rotation.x = 0.4;
  walker.userData.legs[0].knee.rotation.x = -0.8;
  assert.equal(walker.userData.legs[0].hip.rotation.x, 0.4);
  walker.userData.dispose();
});

test('phases are declared and switching phases toggles the scene', () => {
  assert.ok(HOTH_PHASES.includes('hoth-evacuation'));
  const { scene, hoth } = buildScene();
  assert.equal(hoth.root.visible, false, 'the scene waits for the caller to pick a phase');
  hoth.setPhase('hoth-atat');
  assert.equal(hoth.root.visible, true);
  assert.equal(hoth.atAt.group.visible, true);
  assert.equal(scene.fog.density > 0.0001, true);
  hoth.setPhase('hoth-fall');
  assert.equal(hoth.atAt.group.visible, true);
  hoth.setPhase('hoth-evacuation');
  assert.equal(hoth.atAt.group.visible, false);
  hoth.setPhase('combat');
  assert.equal(hoth.root.visible, false, 'a foreign phase hides the Hoth content');
  assert.equal(scene.fog.density, 0.000018, 'the previous fog is restored');
  hoth.dispose();
});

test('update survives zero, negative and NaN time steps', () => {
  const { hoth } = buildScene();
  hoth.setPhase('hoth-atat');
  for (const dt of [0, -3, Number.NaN, undefined]) hoth.update(dt, { phase: 'hoth-atat', elapsed: 1 });
  const snapshot = hoth.getSnapshot();
  for (const transport of snapshot.transports) {
    for (const axis of ['x', 'y', 'z']) {
      assert.equal(Number.isFinite(transport.position[axis]), true, 'transport positions stay finite');
    }
  }
  for (const axis of ['x', 'y', 'z']) {
    assert.equal(Number.isFinite(snapshot.atAt.position[axis]), true);
  }
  assert.equal(snapshot.atAt.cabled, false);
  hoth.dispose();
});

test('launchTransport lifts a transport and removes it from the scene', () => {
  const { hoth } = buildScene();
  hoth.setPhase('hoth-evacuation');
  assert.equal(hoth.transports[0].state, 'parked');
  assert.equal(hoth.launchTransport(hoth.transports[0].id), true);
  assert.equal(hoth.getSnapshot().transports[0].state, 'launching');
  assert.equal(hoth.launchTransport(hoth.transports[0].id), false, 'a transport launches only once');
  step(hoth, 1, 'hoth-evacuation');
  const climbing = hoth.getSnapshot().transports[0];
  assert.ok(climbing.position.y > 1.6, 'the transport leaves the pad');
  step(hoth, 12, 'hoth-evacuation');
  const departed = hoth.getSnapshot().transports[0];
  assert.equal(departed.state, 'departed');
  assert.equal(hoth.transports[0].group.visible, false);
  hoth.dispose();
});

test('auto launch releases the column with a 2.5 second gap', () => {
  const { hoth } = buildScene({ autoLaunch: true, transportCount: 3 });
  hoth.setPhase('hoth-evacuation');
  hoth.update(1 / 60, { phase: 'hoth-evacuation', elapsed: 0 });
  assert.equal(hoth.getSnapshot().transports[0].state, 'launching');
  assert.equal(hoth.getSnapshot().transports[1].state, 'parked');
  step(hoth, 2.6, 'hoth-evacuation');
  assert.equal(hoth.getSnapshot().transports[1].state, 'launching');
  assert.equal(hoth.getSnapshot().transports[2].state, 'parked');
  step(hoth, 2.6, 'hoth-evacuation');
  assert.equal(hoth.getSnapshot().transports[2].state, 'launching');
  hoth.dispose();
});

test('the Hoth phases dim the warm engine light and give it back', () => {
  const scene = new THREE.Scene();
  const keyLight = new THREE.DirectionalLight(0xf2e9d3, 3);
  scene.add(keyLight);
  const hoth = createHothScene(scene, { seed: 11 });
  assert.equal(keyLight.intensity, 3, 'the engine light is untouched before a Hoth phase');
  hoth.setPhase('hoth-atat');
  assert.ok(keyLight.intensity < 3, 'the warm key light steps aside for the cold Hoth light');
  hoth.setPhase('combat');
  assert.equal(keyLight.intensity, 3, 'the engine light comes back for the other episodes');
  hoth.dispose();
});

test('the snapshot is plain data and dispose clears the scene', () => {
  const { scene, hoth } = buildScene();
  hoth.setPhase('hoth-assault');
  const snapshot = hoth.getSnapshot();
  assert.equal(snapshot.phase, 'hoth-assault');
  assert.equal(Array.isArray(snapshot.transports), true);
  assert.equal(snapshot.transports.length, hoth.transports.length);
  assert.equal(JSON.stringify(snapshot).includes('THREE'), false);
  for (const transport of snapshot.transports) {
    assert.deepEqual(Object.keys(transport).sort(), ['id', 'position', 'state']);
  }
  assert.deepEqual(Object.keys(snapshot.atAt).sort(), ['cabled', 'position', 'visible']);
  hoth.dispose();
  assert.equal(scene.children.length, 0, 'the Hoth content leaves the scene');
  hoth.dispose();
});
