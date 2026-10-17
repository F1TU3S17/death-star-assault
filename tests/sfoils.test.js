import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createXWingSfoilRig } from '../src/game/sfoils.js';

test('the downloaded X-wing articulates four independent wings without altering its source geometry or fuselage', async () => {
  const source = new URL('../public/models/x-wing/scene.gltf', import.meta.url);
  const gltf = JSON.parse(await readFile(source, 'utf8'));
  const stripTextureReferences = value => {
    for (const key of Object.keys(value)) {
      if (/Texture$/.test(key)) delete value[key];
      else if (value[key] && typeof value[key] === 'object') stripTextureReferences(value[key]);
    }
  };
  for (const material of gltf.materials || []) stripTextureReferences(material);
  delete gltf.images; delete gltf.textures;
  for (const buffer of gltf.buffers) {
    const data = await readFile(new URL(buffer.uri, source));
    buffer.uri = `data:application/octet-stream;base64,${data.toString('base64')}`;
  }
  const originalProgressEvent = globalThis.ProgressEvent;
  if (!originalProgressEvent) globalThis.ProgressEvent = class { constructor(type, fields) { Object.assign(this, { type }, fields); } };
  try {
    const parsed = await new GLTFLoader().parseAsync(JSON.stringify(gltf), '');
    const asset = parsed.scene;
    asset.rotation.y = Math.PI;
    asset.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(asset);
    asset.position.sub(bounds.getCenter(new THREE.Vector3()));
    const normalized = new THREE.Group(); normalized.add(asset);
    const size = bounds.getSize(new THREE.Vector3());
    normalized.scale.setScalar(19 / Math.max(size.x, size.y, size.z));
    const root = new THREE.Group(); root.add(normalized);
    root.position.set(5, 3, 10); root.rotation.set(0.1, -0.2, 0.3);
    root.updateWorldMatrix(true, true);
    const originalBounds = new THREE.Box3().setFromObject(normalized, true);
    const geometries = [];
    asset.traverse(node => { if (node.isMesh) geometries.push(node.geometry); });
    const geometryHash = () => {
      const hash = createHash('sha256');
      for (const geometry of geometries) for (const attribute of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) {
        hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
      }
      return hash.digest('hex');
    };
    const originalHash = geometryHash();
    const originalTriangles = geometries.reduce((sum, geometry) => sum + (geometry.index?.count || geometry.attributes.position.count) / 3, 0);
    const rig = createXWingSfoilRig(root, normalized);
    root.add(rig.group); root.remove(normalized);
    rig.set(1); root.updateWorldMatrix(true, true);
    assert.equal(rig.wings.size, 4);
    assert.ok(rig.counts.movingTriangles > 0 && rig.counts.stationaryTriangles > 0);
    assert.equal(rig.counts.movingTriangles + rig.counts.stationaryTriangles, originalTriangles);
    const openBounds = new THREE.Box3().setFromObject(rig.group, true);
    assert.ok(openBounds.min.distanceTo(originalBounds.min) < 0.0001, JSON.stringify({ original: originalBounds.min, rig: openBounds.min }));
    assert.ok(openBounds.max.distanceTo(originalBounds.max) < 0.0001, JSON.stringify({ original: originalBounds.max, rig: openBounds.max }));
    const vertex = mesh => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0).applyMatrix4(mesh.matrixWorld);
    const wingPoints = [...rig.wings.values()].map(wing => vertex(wing.children[0]));
    const bodyPoint = vertex(rig.body.children[0]);
    rig.set(0); root.updateWorldMatrix(true, true);
    [...rig.wings.values()].forEach((wing, index) => {
      assert.ok(Math.abs(wing.rotation.z) > 0.2);
      assert.ok(vertex(wing.children[0]).distanceTo(wingPoints[index]) > 0.001, wing.name);
    });
    assert.ok(vertex(rig.body.children[0]).distanceTo(bodyPoint) < 0.000001);
    root.add(normalized); root.updateWorldMatrix(true, true);
    const second = createXWingSfoilRig(root, normalized);
    root.add(second.group); second.set(1);
    assert.ok([...second.wings.values()].every(wing => wing.rotation.z === 0));
    assert.ok([...rig.wings.values()].every(wing => Math.abs(wing.rotation.z) > 0.2));
    assert.equal(geometryHash(), originalHash, 'Cached glTF buffers must remain unchanged across independent ship rigs');
    for (const group of [rig.group, second.group]) group.traverse(node => node.geometry?.dispose());
  } finally {
    if (!originalProgressEvent) delete globalThis.ProgressEvent;
  }
});
