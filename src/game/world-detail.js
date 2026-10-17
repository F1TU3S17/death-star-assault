import * as THREE from 'three';

function seededRandom(seed) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Derive a reusable tangent-space normal map from the local panel photograph. */
export function panelNormalTexture(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 1024, 1024);
  const source = context.getImageData(0, 0, 1024, 1024);
  const result = context.createImageData(1024, 1024);
  const luminance = (x, y) => source.data[((y + 1024) % 1024 * 1024 + (x + 1024) % 1024) * 4] / 255;
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const dx = (luminance(x - 1, y) - luminance(x + 1, y)) * 2.8;
    const dy = (luminance(x, y - 1) - luminance(x, y + 1)) * 2.8;
    const length = Math.hypot(dx, dy, 1);
    const offset = (y * 1024 + x) * 4;
    result.data[offset] = (dx / length * 0.5 + 0.5) * 255;
    result.data[offset + 1] = (dy / length * 0.5 + 0.5) * 255;
    result.data[offset + 2] = (1 / length * 0.5 + 0.5) * 255;
    result.data[offset + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Thousands of layered details rendered by seven bounded instance batches. */
export function addTrenchDetail(parent, { wallX, floorY, topY, startZ, endZ, material, seed = 1977 }) {
  const random = seededRandom(seed);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const height = topY - floorY;
  const length = startZ - endZ;
  const plates = [];
  const recesses = [];
  const machinery = [];
  const ribs = [];
  const pipes = [];
  const lights = [];
  const floor = [];
  const add = (list, x, y, z, sx, sy, sz, rotation = 0) => list.push({ x, y, z, sx, sy, sz, rotation, tint: 0.69 + random() * 0.35 });
  for (const side of [-1, 1]) {
    const rows = Math.max(5, Math.round(height / 19));
    for (let z = startZ; z > endZ; z -= 25) {
      for (let row = 0; row < rows; row++) {
        const y = floorY + (row + 0.5) * height / rows;
        const span = 10 + random() * 13;
        const blockHeight = 7 + random() * (height / rows - 8);
        const offsetZ = z - random() * 7 - (row % 2 ? 8 : 0);
        add(recesses, side * (wallX - 0.8), y, offsetZ, 0.9, blockHeight + 2.5, span + 2.5);
        add(plates, side * (wallX - 1.7 - random() * 1.5), y + 0.5, offsetZ, 1.1 + random() * 2.3, blockHeight, span);
        if (random() > 0.35) {
          add(machinery, side * (wallX - 4), y - blockHeight * 0.12, offsetZ + span * 0.15, 1.2 + random() * 1.2, 1.5 + random() * 4, 2 + random() * 5);
          add(machinery, side * (wallX - 4.4), y + blockHeight * 0.23, offsetZ - span * 0.2, 0.8, 0.7, span * 0.55);
        }
      }
    }
    for (let z = startZ - 8; z > endZ; z -= 120) {
      add(ribs, side * (wallX - 3), floorY + height * 0.5, z, 4.5, height - 8, 3.2);
      add(ribs, side * (wallX - 5.5), floorY + 9, z - 6, 2.5, 13, 17);
      for (let row = 0; row < 5; row++) {
        add(pipes, side * (wallX - 5 - row % 2), floorY + 17 + row * height * 0.18, z - 34, 0.45 + random() * 0.55, 36 + random() * 64, 0.45 + random() * 0.55, Math.PI / 2);
      }
      if (Math.floor((startZ - z) / 120) % 2 === 0) add(lights, side * (wallX - 6), floorY + height * 0.66, z + 10, 0.3, 0.65, 7);
    }
    for (let z = startZ; z > endZ; z -= 42) {
      add(floor, side * (wallX - 15), floorY + 0.6, z, 17, 1.2, 29);
      add(machinery, side * (wallX - 9), floorY + 3, z, 7, 5, 12);
    }
    // Tall parapet machinery continues the canyon silhouette into the sky.
    for (let z = startZ - 20; z > endZ; z -= 95) {
      const h = 6 + random() * 15;
      add(ribs, side * (wallX + 9), topY + h / 2, z, 21, h, 22 + random() * 27);
      add(machinery, side * (wallX + 9), topY + h + 1.3, z - 2, 14, 2.6, 16);
    }
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const pipeGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const dark = new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.92, metalness: 0.45 });
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x75818a, roughness: 0.56, metalness: 0.65 });
  const warm = new THREE.MeshStandardMaterial({ color: 0x6c4b24, emissive: 0xffaa52, emissiveIntensity: 2.25, roughness: 0.5, metalness: 0.2 });
  let total = 0;
  let shadowInstances = 0;
  for (const [entries, geometry, mat, castShadow] of [
    [recesses, boxGeometry, dark, false], [plates, boxGeometry, material, true],
    [machinery, boxGeometry, pipeMaterial, false], [ribs, boxGeometry, material, true],
    [pipes, pipeGeometry, pipeMaterial, false], [lights, boxGeometry, warm, false],
    [floor, boxGeometry, material, false],
  ]) {
    const mesh = new THREE.InstancedMesh(geometry, mat, entries.length);
    mesh.name = 'Industrial trench detail';
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    entries.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      dummy.rotation.set(entry.rotation, 0, 0);
      dummy.scale.set(entry.sx, entry.sy, entry.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (mat !== warm) mesh.setColorAt(index, tint.setRGB(entry.tint, entry.tint * 1.015, entry.tint * 1.025));
    });
    parent.add(mesh);
    total += entries.length;
    if (castShadow) shadowInstances += entries.length;
  }
  return { instances: total, batches: 7, shadowInstances, length, layeredPanels: plates.length, pipes: pipes.length, warmLights: lights.length };
}
