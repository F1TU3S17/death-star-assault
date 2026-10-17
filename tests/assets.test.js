import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

test('downloaded assets match recorded hashes and include real glTF geometry', async () => {
  const manifest = JSON.parse(await readFile(resolve(publicRoot, 'models/manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const bytes = await readFile(resolve(publicRoot, file.file));
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.file);
  }
  for (const relative of ['models/x-wing/scene.gltf', 'models/y-wing/scene.gltf', 'models/tie-fighter.glb', 'models/death-star.glb']) {
    const path = resolve(publicRoot, relative);
    const bytes = await readFile(path);
    let input;
    if (relative.endsWith('.glb')) {
      assert.equal(bytes.readUInt32LE(0), 0x46546c67, relative);
      assert.equal(bytes.readUInt32LE(4), 2, relative);
      assert.equal(bytes.readUInt32LE(8), bytes.length, relative);
      input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else {
      const gltf = JSON.parse(bytes.toString('utf8'));
      for (const image of gltf.images || []) {
        if (!image.uri || image.uri.startsWith('data:')) continue;
        const imageBytes = await readFile(resolve(dirname(path), decodeURIComponent(image.uri)));
        assert.ok(imageBytes.length > 8, image.uri);
        assert.equal(imageBytes.readUInt32BE(0), 0x89504e47, `PNG signature: ${image.uri}`);
      }
      for (const buffer of gltf.buffers) {
        const data = await readFile(resolve(dirname(path), decodeURIComponent(buffer.uri)));
        assert.equal(data.length, buffer.byteLength, relative);
        buffer.uri = `data:application/octet-stream;base64,${data.toString('base64')}`;
      }
      // Node does not decode images. Browser smoke separately loads actual materials/textures.
      delete gltf.images; delete gltf.textures; delete gltf.materials;
      for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
      input = JSON.stringify(gltf);
    }
    const originalProgressEvent = globalThis.ProgressEvent;
    if (!originalProgressEvent) globalThis.ProgressEvent = class { constructor(type, fields) { Object.assign(this, { type }, fields); } };
    try {
      const parsed = await new GLTFLoader().parseAsync(input, '');
      parsed.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(parsed.scene);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(!bounds.isEmpty() && Number.isFinite(size.length()) && size.length() > 0, relative);
      let vertices = 0;
      parsed.scene.traverse(node => { if (node.isMesh) vertices += node.geometry.getAttribute('position').count; });
      assert.ok(vertices > 100, `${relative} must contain a detailed downloaded mesh`);
    } finally {
      if (!originalProgressEvent) delete globalThis.ProgressEvent;
    }
  }
});
