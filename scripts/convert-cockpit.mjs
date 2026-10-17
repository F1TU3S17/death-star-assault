import fs from 'node:fs/promises';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
// Download the original OBJ from the creator URL in docs/MODEL-RESEARCH.md.
// Usage: node scripts/convert-cockpit.mjs <path-to-original-xwing_cockpit.obj>
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Pass the original xwing_cockpit.obj path');
const folder = new URL('../public/models/xwing-cockpit/', import.meta.url);
const text = await fs.readFile(sourcePath, 'utf8');
const model = new OBJLoader().parse(text.split(/\r?\n/).filter(line => !line.startsWith('l ')).join('\n'));
model.traverse(node => {
  if (!node.isMesh) return;
  // OBJ/TextureLoader samples with flipY=true. Local glTF images use flipY=false.
  // Exporter cannot flip manually attached images, so preserve sampling in UVs.
  const uv = node.geometry.getAttribute('uv');
  if (uv) for (let vertex = 0; vertex < uv.count; vertex++) uv.setY(vertex, 1 - uv.getY(vertex));
  node.material = new THREE.MeshStandardMaterial({name:node.material.name,color:0xffffff,roughness:0.75,metalness:0.15});
  if(node.name.startsWith('windows')) {node.material.transparent=true;node.material.opacity=.06;node.material.roughness=.18;node.material.metalness=0;}
});
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
  readAsDataURL(blob) {blob.arrayBuffer().then(result=>{this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`;this.onloadend?.();});}
};
const gltf = await new GLTFExporter().parseAsync(model, {binary:false});
const buffer = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64');
gltf.buffers[0].uri='scene.bin';
gltf.images=[{uri:'cockpit.png'},{uri:'cockpit_light.png'}];
gltf.textures=[{source:0},{source:1}];
const hull=gltf.materials.find(mat=>mat.name==='cockpit');
hull.pbrMetallicRoughness.baseColorTexture={index:0};
hull.emissiveTexture={index:1};
hull.emissiveFactor=[.7,.7,.7];
gltf.asset.extras={author:'MichaelEGA / Open Galaxy',permission:'Free to use, just credit the Open Galaxy project.',source:'https://www.moddb.com/games/open-galaxy/addons/xwing-cockpit',modifications:'Removed four loose OBJ line edges; faces retained; UV V inverted to preserve source TextureLoader sampling in glTF; basecolor/emission mapped; windows hidden by runtime; source metal texture unassigned because Unity metal/gloss channels differ from glTF metallic-roughness.'};
await fs.writeFile(new URL('scene.bin',folder),buffer);
await fs.writeFile(new URL('scene.gltf',folder),JSON.stringify(gltf,null,2));
console.log('Staged geometry',buffer.length,'bytes',gltf.meshes.length,'meshes');
