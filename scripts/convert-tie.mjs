// Rebuild the Jeroenimo TIE glTF from an original FBX and its adjacent source PNGs.
// Usage: node scripts/convert-tie.mjs <original-fbx-path> [output-directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/convert-tie.mjs <original-fbx-path> [output-directory]');
const resolvedSource = path.resolve(sourcePath);
const sourceDirectory = path.dirname(resolvedSource);
const outputDirectory = path.resolve(process.argv[3] ?? fileURLToPath(new URL('../public/models/tie-fighter-detailed/', import.meta.url)));
const inputDiffuse = path.join(sourceDirectory, 'Empire_TIE_Fighter.png');
const inputNormal = path.join(sourceDirectory, 'Empire_TIE_Fighter_B.png');
await fs.access(inputDiffuse);
await fs.access(inputNormal);
await fs.mkdir(outputDirectory, { recursive: true });

const source = await fs.readFile(resolvedSource);
// FBXLoader requests its Unity-referenced images while parsing. Keep those requests inert;
// attach the exact source maps as local glTF images below.
globalThis.document ??= { createElementNS: () => ({ style: {}, addEventListener(){}, removeEventListener(){}, set src(_value){}, get src(){ return ''; } }) };
const fbx = new FBXLoader().parse(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
fbx.updateMatrixWorld(true);
const scene = new THREE.Scene();
const summaries = [];

for (const mesh of [
  fbx.getObjectByName('TIE_Fighter'),
  fbx.getObjectByName('Twin_Ion_Engines'),
]) {
  if (!mesh?.isSkinnedMesh) throw new Error(`Expected skinned source mesh: ${mesh?.name}`);
  const geometry = mesh.geometry.clone();
  const position = geometry.attributes.position;
  const sourceNormal = geometry.attributes.normal;
  const sourceUv = geometry.attributes.uv;
  if (!position || !sourceNormal || !sourceUv) throw new Error(`${mesh.name} lacks position, normal, or UV`);

  const transformedPositions = new Float32Array(position.count * 3);
  const transformedNormals = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    mesh.getVertexPosition(i, p);
    p.applyMatrix4(mesh.matrixWorld);
    transformedPositions.set(p.toArray(), i * 3);

    const origin = zero.clone();
    mesh.applyBoneTransform(i, origin);
    n.fromBufferAttribute(sourceNormal, i);
    mesh.applyBoneTransform(i, n);
    n.sub(origin).transformDirection(mesh.matrixWorld).normalize();
    transformedNormals.set(n.toArray(), i * 3);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(transformedPositions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(transformedNormals, 3));
  // FBXLoader's Unity texture path uses TextureLoader.flipY=true. glTF images use
  // flipY=false, so invert V to retain the source texture lookup.
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  geometry.deleteAttribute('color');
  geometry.deleteAttribute('uv1');
  geometry.deleteAttribute('skinIndex');
  geometry.deleteAttribute('skinWeight');
  geometry.index = null;
  const indexed = mergeVertices(geometry);
  indexed.computeTangents();
  if (!indexed.attributes.tangent) throw new Error(`${mesh.name}: tangent generation failed`);
  for (let i = 0; i < indexed.attributes.position.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(indexed.attributes.normal, i);
    const tangent = new THREE.Vector3().fromBufferAttribute(indexed.attributes.tangent, i);
    const handedness = indexed.attributes.tangent.getW(i);
    if (!Number.isFinite(normal.length()) || Math.abs(normal.length() - 1) > 0.002 || !Number.isFinite(tangent.length()) || Math.abs(tangent.length() - 1) > 0.002 || Math.abs(normal.dot(tangent)) > 0.002 || Math.abs(handedness) !== 1) throw new Error(`${mesh.name}: invalid tangent basis at ${i}`);
  }
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < indexed.attributes.position.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(indexed.attributes.position, i);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
  }
  const material = new THREE.MeshStandardMaterial({
    name: mesh.name === 'TIE_Fighter' ? 'Jeroenimo TIE hull' : 'Jeroenimo TIE engines',
    color: 0xffffff,
    roughness: mesh.name === 'TIE_Fighter' ? 0.5 : 0.72,
    metalness: 0,
    side: THREE.FrontSide,
  });
  const staticMesh = new THREE.Mesh(indexed, material);
  staticMesh.name = mesh.name;
  scene.add(staticMesh);
  summaries.push({ name: mesh.name, triangles: (indexed.index?.count ?? indexed.attributes.position.count) / 3, vertices: indexed.attributes.position.count, bounds: { min, max } });
}

// GLTFExporter uses FileReader for its packed binary buffer in Node.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};
const gltf = await new GLTFExporter().parseAsync(scene, { binary: false });
const binary = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64');
gltf.buffers[0].uri = 'scene.bin';
gltf.images = [{ uri: 'Empire_TIE_Fighter.png' }, { uri: 'Empire_TIE_Fighter_B.png' }];
gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
gltf.textures = [{ sampler: 0, source: 0 }, { sampler: 0, source: 1 }];
for (const material of gltf.materials) {
  if (material.name === 'Jeroenimo TIE hull') {
    material.pbrMetallicRoughness.baseColorTexture = { index: 0, texCoord: 0 };
    material.normalTexture = { index: 1, texCoord: 0, scale: 1 };
  }
}
gltf.asset.extras = {
  author: 'Jeroenimo (The Dutchman)',
  source: 'https://www.moddb.com/mods/empire-at-war-re/addons/tie-series-freerelease',
  payloadMirror: 'https://github.com/MichaelEGA/Open-Galaxy/tree/main/Assets/Data/objects/ships/Jeroenimo/Tie%20Fighters',
  permission: 'Creator permits non-monetary reuse with proper credit; proprietary page license. Not a Creative Commons license.',
  modifications: 'Removed baked Shadow mesh; baked each source mesh’s bind-pose bone transform into static geometry; retained TIE_Fighter and Twin_Ion_Engines; generated UV tangent attributes using Three.js BufferGeometry.computeTangents; inverted V to preserve Unity TextureLoader flipY sampling with glTF flipY=false; attached original diffuse PNG and Unity normal-map PNG as local external images; no source silhouette or scale edits.',
};
await fs.writeFile(path.join(outputDirectory, 'scene.bin'), binary);
await fs.writeFile(path.join(outputDirectory, 'scene.gltf'), JSON.stringify(gltf, null, 2));
await fs.copyFile(inputDiffuse, path.join(outputDirectory, path.basename(inputDiffuse)));
await fs.copyFile(inputNormal, path.join(outputDirectory, path.basename(inputNormal)));
console.log(JSON.stringify({ outputDirectory, meshes: summaries, geometryBytes: binary.length }, null, 2));

