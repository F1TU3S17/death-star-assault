// Reproduce the local FBX -> glTF conversion. Requires installed Three.js.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const folder = new URL('../public/models/y-wing/', import.meta.url);
const source = await fs.readFile(new URL('y-wing.fbx', folder));
const parsed = new FBXLoader().parse(
  source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
  '',
);
const intact = parsed.getObjectByName('y_wing__P1');
if (!intact?.isMesh) throw new Error('Expected intact First Strike Y-wing mesh');
intact.material = (Array.isArray(intact.material) ? intact.material : [intact.material])
  .map(() => new THREE.MeshStandardMaterial({
    name: 'First Strike Y-wing hull', color: 0xffffff,
    roughness: 0.82, metalness: 0.12,
  }));
const scene = new THREE.Scene();
scene.add(intact);

// GLTFExporter uses the browser FileReader API for its packed buffer.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(value => {
      this.result = value;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then(value => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const gltf = await new GLTFExporter().parseAsync(scene, { binary: false });
const binary = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64');
gltf.buffers[0].uri = 'scene.bin';
gltf.images = [{ uri: 'y-wing_c.png' }];
gltf.textures = [{ source: 0 }];
for (const material of gltf.materials) {
  material.pbrMetallicRoughness.baseColorTexture = { index: 0 };
}
gltf.asset.extras = {
  source: 'First Strike Development Team; FBX conversion by MichaelEGA/Open Galaxy',
  license: 'Noncommercial reuse with attribution; see LICENSE.txt',
  modifications: 'Intact y_wing__P1 extracted; wrecks and alternative LODs removed; FBX converted to glTF 2.0; original diffuse assigned',
};
await fs.writeFile(new URL('scene.bin', folder), binary);
await fs.writeFile(new URL('scene.gltf', folder), JSON.stringify(gltf, null, 2));
console.log(`Converted Y-wing into ${fileURLToPath(folder)} (${binary.length} geometry bytes)`);
