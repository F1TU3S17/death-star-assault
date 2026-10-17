import * as THREE from 'three';

// A single flat chamfer catches the key light without a rounded box's subdivided
// corners. Forty-four triangles are enough for these hard industrial housings.
function chamferedBoxGeometry(bevel = .065) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const inner = .5 - bevel;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const normal = new THREE.Vector3();
  function face(vertices) {
    a.fromArray(vertices[1]).sub(new THREE.Vector3().fromArray(vertices[0]));
    b.fromArray(vertices[2]).sub(new THREE.Vector3().fromArray(vertices[0]));
    normal.crossVectors(a, b);
    const center = new THREE.Vector3();
    for (const vertex of vertices) center.add(new THREE.Vector3().fromArray(vertex));
    if (normal.dot(center) < 0) vertices.reverse();
    const offset = positions.length / 3;
    vertices.forEach((vertex, index) => {
      positions.push(...vertex);
      uvs.push(index === 1 || index === 2 ? 1 : 0, index >= 2 ? 1 : 0);
    });
    for (let index = 1; index < vertices.length - 1; index++) indices.push(offset, offset + index, offset + index + 1);
  }
  for (let axis = 0; axis < 3; axis++) {
    const other = [0, 1, 2].filter(value => value !== axis);
    for (const sign of [-1, 1]) {
      face([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const point = [0, 0, 0];
        point[axis] = sign * .5;
        point[other[0]] = u * inner;
        point[other[1]] = v * inner;
        return point;
      }));
    }
    for (const u of [-1, 1]) for (const v of [-1, 1]) {
      face([[-inner, .5, inner], [inner, .5, inner], [inner, inner, .5], [-inner, inner, .5]].map(([length, first, second]) => {
        const point = [0, 0, 0];
        point[axis] = length;
        point[other[0]] = u * first;
        point[other[1]] = v * second;
        return point;
      }));
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    face([[x * .5, y * inner, z * inner], [x * inner, y * .5, z * inner], [x * inner, y * inner, z * .5]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

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

/** Worn sheet metal stays quiet beneath the real, instanced service hardware. */
export function makeTrenchMetalTextures() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(113819);
  ctx.fillStyle = '#a7adb0';
  ctx.fillRect(0, 0, 1024, 1024);
  // Low-contrast machining marks survive mipmapping without becoming a brick grid.
  for (let index = 0; index < 9500; index++) {
    const value = 100 + Math.floor(random() * 115);
    ctx.fillStyle = `rgba(${value},${value + 3},${value + 5},.12)`;
    ctx.fillRect(random() * 1024, random() * 1024, 1 + random() * 40, .4 + random());
  }
  for (let index = 0; index < 65; index++) {
    const x = random() * 1024;
    const y = random() * 1024;
    ctx.fillStyle = 'rgba(31,41,48,.12)';
    ctx.fillRect(x, y, 1 + random() * 2, 6 + random() * 100);
    ctx.fillStyle = 'rgba(225,230,231,.15)';
    ctx.fillRect(x + 1, y, 1, 5 + random() * 60);
  }
  const color = new THREE.CanvasTexture(canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  const normal = panelNormalTexture(canvas);
  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = roughnessCanvas.height = 256;
  const roughnessContext = roughnessCanvas.getContext('2d');
  roughnessContext.fillStyle = '#c3c3c3';
  roughnessContext.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 180; index++) {
    const value = 145 + Math.floor(random() * 65);
    roughnessContext.fillStyle = `rgb(${value},${value},${value})`;
    roughnessContext.fillRect(random() * 256, random() * 256, 4 + random() * 42, 1 + random() * 13);
  }
  const roughness = new THREE.CanvasTexture(roughnessCanvas);
  for (const texture of [color, normal, roughness]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  return { color, normal, roughness };
}

/** Authored districts have nested service panels rather than repeating brick rows. */
export function makeStationSurfaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(197704);
  ctx.fillStyle = '#343c43';
  ctx.fillRect(0, 0, 4096, 2048);
  const panel = (x, y, w, h, value) => {
    ctx.fillStyle = `rgb(${value},${value + 6},${value + 11})`;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = 'rgba(183,194,200,.25)';
    ctx.fillRect(x + 3, y + 3, w - 6, 1);
    ctx.fillRect(x + 3, y + 3, 1, h - 6);
    ctx.fillStyle = 'rgba(8,14,19,.45)';
    ctx.fillRect(x + w - 3, y + 3, 1, h - 5);
  };
  // Independent vertical district spans avoid a latitude-wide masonry grid.
  for (let x = -70; x < 4096;) {
    const w = 180 + Math.floor(random() * 300);
    for (let y = -Math.floor(random() * 170); y < 2048;) {
      const h = 130 + Math.floor(random() * 280);
      const value = 57 + Math.floor(random() * 30);
      panel(x, y, w, h, value);
      for (let sx = x + 9; sx < x + w - 14;) {
        const sw = Math.min(26 + Math.floor(random() * 89), x + w - 8 - sx);
        for (let sy = y + 10; sy < y + h - 12;) {
          const sh = Math.min(20 + Math.floor(random() * 65), y + h - 8 - sy);
          panel(sx, sy, sw, sh, value - 8 + Math.floor(random() * 17));
          for (let detail = 0; detail < 7; detail++) {
            const dx = sx + 5 + random() * Math.max(1, sw - 12);
            const dy = sy + 5 + random() * Math.max(1, sh - 12);
            ctx.fillStyle = detail % 3 ? 'rgba(13,21,28,.40)' : 'rgba(179,191,198,.27)';
            ctx.fillRect(dx, dy, 2 + random() * Math.max(2, sw * .4), 1 + random() * 2);
          }
          sy += sh + 2;
        }
        sx += sw + 3;
      }
      // Occasional exposed conduits and dark machinery bays interrupt panels.
      if (random() > .42) {
        const cy = y + h * (.2 + random() * .6);
        ctx.fillStyle = '#242c33';
        ctx.fillRect(x + 6, cy, w - 12, 7);
        ctx.fillStyle = '#737d84';
        ctx.fillRect(x + 8, cy + 1, w - 16, 1);
      }
      if (random() > .55) {
        ctx.fillStyle = '#252e35';
        ctx.fillRect(x + w * .65, y + 12, w * .24, h * .27);
        for (let vent = 0; vent < 6; vent++) {
          ctx.fillStyle = '#66717a';
          ctx.fillRect(x + w * .67, y + 16 + vent * h * .035, w * .19, 2);
        }
      }
      y += h + 5;
    }
    x += w + 7;
  }
  // The equatorial service trench is the only continuous horizontal band.
  ctx.fillStyle = '#111b24';
  ctx.fillRect(0, 1018, 4096, 12);
  ctx.fillStyle = '#77828a';
  ctx.fillRect(0, 1017, 4096, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Multiscale industrial modules share ten bounded instance batches. */
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
  const insets = [];
  const collars = [];
  const brackets = [];
  // Cinema walls are narrower: detail depth stays proportional to the set.
  const depth = Math.min(1, wallX / 81);
  const add = (list, x, y, z, sx, sy, sz, rotation = 0) => list.push({ x, y, z, sx, sy, sz, rotation, tint: 0.68 + random() * 0.46 });
  for (const side of [-1, 1]) {
    // Each band has its own panel widths/offset: there is no shared brick grid.
    const rows = Math.max(3, Math.round(height / 46));
    const band = height / rows;
    for (let row = 0; row < rows; row++) {
      const y = floorY + (row + .5) * band;
      for (let cursor = startZ; cursor > endZ;) {
        const span = Math.min(38 + random() * 80, cursor - endZ);
        if (span < 4) break;
        const z = cursor - span * .5;
        const panelHeight = band - 3 - random() * 6;
        add(recesses, side * (wallX - .6 * depth), y, z, depth, panelHeight + 2, span - .5);
        add(plates, side * (wallX - 2 * depth), y, z, (1.5 + random() * 2) * depth, panelHeight, span - 1.6);
        // Nested raised housings, mounting ears, conduits and dark sockets give
        // each district a silhouette. These share the existing ten batches.
        const serviceY = y + (random() - .5) * panelHeight * .35;
        const serviceZ = z + (random() - .5) * span * .35;
        const serviceHeight = panelHeight * (.28 + random() * .26);
        const serviceWidth = span * (.19 + random() * .23);
        add(insets, side * (wallX - 3.8 * depth), serviceY, serviceZ, .7 * depth, serviceHeight + 3, serviceWidth + 3);
        add(machinery, side * (wallX - 5.1 * depth), serviceY, serviceZ, (2 + random() * 2.3) * depth, serviceHeight, serviceWidth);
        add(machinery, side * (wallX - 7.3 * depth), serviceY + serviceHeight * .15, serviceZ, .9 * depth, serviceHeight * .42, serviceWidth * .82);
        for (const edge of [-1, 1]) {
          add(brackets, side * (wallX - 6.2 * depth), serviceY + edge * serviceHeight * .45, serviceZ, 1.2 * depth, 1, serviceWidth + 5);
        }
        const modules = 2 + Math.floor(random() * 4);
        for (let module = 0; module < modules; module++) {
          const moduleY = y + (random() - .5) * panelHeight * .78;
          const moduleZ = z + (random() - .5) * span * .83;
          const moduleHeight = 2 + random() * 5;
          const moduleWidth = 3 + random() * 10;
          add(machinery, side * (wallX - (4 + random() * 3) * depth), moduleY, moduleZ, (1.4 + random() * 2) * depth, moduleHeight, moduleWidth);
          if (module % 2 === 0) add(insets, side * (wallX - 7.2 * depth), moduleY, moduleZ, .35 * depth, moduleHeight * .42, moduleWidth * .7);
        }
        // Some districts have a recessed vent; others retain a clean plate field.
        if (random() > .76) {
          const ventZ = z + span * .18;
          add(insets, side * (wallX - 3.5 * depth), y, ventZ, .5 * depth, panelHeight * .55, span * .27);
          for (let slat = 0; slat < 5; slat++) {
            add(machinery, side * (wallX - 4 * depth), y - panelHeight * .21 + slat * panelHeight * .105, ventZ, .8 * depth, .65, span * .24);
          }
        } else if (random() > .5) {
          add(machinery, side * (wallX - 4 * depth), y - panelHeight * .15, z - span * .16, 2 * depth, panelHeight * .4, 7 + random() * 9);
          add(brackets, side * (wallX - 5.2 * depth), y - panelHeight * .15, z - span * .16, .6 * depth, panelHeight * .25, 9 + random() * 8);
        }
        cursor -= span;
      }
    }
    for (let z = startZ - 25 - random() * 50; z > endZ + 100; z -= 115 + random() * 105) {
      const pillarHeight = height * (.48 + random() * .4);
      const pillarY = floorY + pillarHeight * .5;
      add(ribs, side * (wallX - 4 * depth), pillarY, z, 5 * depth, pillarHeight, 4 + random() * 6);
      add(brackets, side * (wallX - 7 * depth), floorY + 9, z, 3 * depth, 16, 21);
      const pipeY = floorY + height * (.22 + random() * .55);
      const run = Math.min(100 + random() * 140, z - endZ);
      for (let lane = 0; lane < 3; lane++) {
        const py = pipeY + lane * 2.6;
        const radius = (.45 + lane * .12) * depth;
        const px = side * (wallX - (6 + lane * .6) * depth);
        add(pipes, px, py, z - run / 2, radius, run, radius, Math.PI / 2);
        // Short vertical risers, sleeves and clamp brackets form actual assemblies.
        add(pipes, px, py + 6, z - run, radius, 12, radius);
        for (const t of [.08, .52, .94]) {
          add(collars, px, py, z - run * t, radius * 1.45, 1.2, radius * 1.45, Math.PI / 2);
        }
      }
      add(brackets, side * (wallX - 5 * depth), pipeY + 2.6, z - run * .52, 3 * depth, 11, 1.8);
      add(lights, side * (wallX - 7 * depth), floorY + height * .66, z + 7, .4 * depth, .8, 9);
      // Small cool service lights sit below their metal hoods; no point lights.
      add(brackets, side * (wallX - 7.1 * depth), floorY + height * .66 + 1, z + 7, 1.1 * depth, .6, 11);
    }
    for (let z = startZ; z > endZ; z -= 67 + random() * 35) {
      // All playable wall decoration remains outside |x|=65.
      add(floor, side * (wallX - 7 * depth), floorY + .6, z, 9 * depth, 1.2, 48);
      add(machinery, side * (wallX - 7 * depth), floorY + 3, z, 7 * depth, 5, 12);
    }
    // Tall parapet machinery continues the canyon silhouette into the sky.
    for (let z = startZ - 20; z > endZ; z -= 150 + random() * 100) {
      const h = 6 + random() * 15;
      add(ribs, side * (wallX + 9), topY + h / 2, z, 21, h, 22 + random() * 27);
      add(machinery, side * (wallX + 9), topY + h + 1.3, z - 2, 14, 2.6, 16);
    }
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bevelGeometry = chamferedBoxGeometry();
  const pipeGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const dark = new THREE.MeshStandardMaterial({ color: 0x17212a, roughness: 0.94, metalness: 0.22 });
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x8b969d, roughness: 0.67, metalness: 0.48, roughnessMap: material.roughnessMap, envMapIntensity: .65 });
  const warm = new THREE.MeshStandardMaterial({ color: 0xa98958, emissive: 0xffc187, emissiveIntensity: 1.8, roughness: 0.5, metalness: 0.2 });
  let total = 0;
  let shadowInstances = 0;
  for (const [entries, geometry, mat, castShadow] of [
    [recesses, boxGeometry, dark, false], [plates, bevelGeometry, material, true],
    [machinery, bevelGeometry, pipeMaterial, false], [ribs, bevelGeometry, material, true],
    [pipes, pipeGeometry, pipeMaterial, false], [lights, boxGeometry, warm, false],
    [floor, boxGeometry, material, false],
    [insets, boxGeometry, dark, false], [collars, pipeGeometry, pipeMaterial, false],
    [brackets, boxGeometry, pipeMaterial, false],
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
  return { instances: total, batches: 10, shadowInstances, length, layeredPanels: plates.length, pipes: pipes.length, warmLights: lights.length, beveledPanels: plates.length, serviceCollars: collars.length, multiscale: true };
}
