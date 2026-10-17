import * as THREE from 'three';

const OPEN_ANGLE = 0.255;
const MOVING_MATERIAL = /^(Ailes_auv|Armes_auv|Moteurs_auv)$/i;

function partitionGeometry(source, triangles) {
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new attribute.array.constructor(triangles.length * 3 * attribute.itemSize);
    let cursor = 0;
    for (const { offset } of triangles) {
      for (let vertex = 0; vertex < 3; vertex++) {
        const start = (offset + vertex) * attribute.itemSize;
        for (let component = 0; component < attribute.itemSize; component++) values[cursor++] = attribute.array[start + component];
      }
    }
    result.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  let material = -1;
  triangles.forEach((triangle, index) => {
    if (triangle.materialIndex !== material) {
      material = triangle.materialIndex;
      result.addGroup(index * 3, 3, material);
    } else result.groups[result.groups.length - 1].count += 3;
  });
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/**
 * Adapt the locally attributed static glTF without changing its source buffers.
 * Meshes are baked into normalized ship space before their four disconnected
 * wing/gun/engine assemblies are placed on independent longitudinal hinges.
 */
export function createXWingSfoilRig(root, normalizedAsset) {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const rig = new THREE.Group();
  rig.name = 'X-wing articulated S-foils';
  const body = new THREE.Group();
  body.name = 'Stationary fuselage and cockpit';
  rig.add(body);
  const wings = new Map();
  for (const side of [-1, 1]) for (const upper of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.name = `S-foil ${side < 0 ? 'port' : 'starboard'} ${upper > 0 ? 'upper' : 'lower'}`;
    hinge.position.set(side * 1.2, upper * 0.8, 0);
    hinge.userData.side = side;
    hinge.userData.upper = upper;
    rig.add(hinge);
    wings.set(`${side}:${upper}`, hinge);
  }
  const counts = { sourceMeshes: 0, movingTriangles: 0, stationaryTriangles: 0 };
  normalizedAsset.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
    counts.sourceMeshes++;
    const transformed = mesh.geometry.clone();
    transformed.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
    const source = transformed.index ? transformed.toNonIndexed() : transformed;
    const position = source.attributes.position;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const buckets = new Map();
    for (let offset = 0; offset < position.count; offset += 3) {
      const materialIndex = source.groups.find(group => offset >= group.start && offset < group.start + group.count)?.materialIndex || 0;
      const isWing = MOVING_MATERIAL.test(materials[materialIndex]?.name || '');
      const x = (position.getX(offset) + position.getX(offset + 1) + position.getX(offset + 2)) / 3;
      const y = (position.getY(offset) + position.getY(offset + 1) + position.getY(offset + 2)) / 3;
      const bucket = isWing && Math.abs(x) > 1.2 ? `${x < 0 ? -1 : 1}:${y < 0 ? -1 : 1}` : 'body';
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push({ offset, materialIndex });
      counts[bucket === 'body' ? 'stationaryTriangles' : 'movingTriangles']++;
    }
    for (const [bucket, triangles] of buckets) {
      const geometry = partitionGeometry(source, triangles);
      const parent = bucket === 'body' ? body : wings.get(bucket);
      // Positions were baked in root space. Rebase around each hinge so that
      // openness=1 exactly reproduces the original downloaded model.
      if (bucket !== 'body') geometry.translate(-parent.position.x, -parent.position.y, 0);
      const part = new THREE.Mesh(geometry, mesh.material);
      part.name = `${mesh.name} / ${bucket}`;
      part.castShadow = mesh.castShadow;
      part.receiveShadow = mesh.receiveShadow;
      parent.add(part);
    }
    if (source !== transformed) source.dispose();
    transformed.dispose();
  });
  if (![...wings.values()].every(wing => wing.children.length > 0)) {
    rig.traverse(object => object.geometry?.dispose());
    throw new Error('The X-wing asset does not contain four separable S-foils.');
  }
  return {
    group: rig, wings, body, counts,
    set(openness) {
      for (const hinge of wings.values()) hinge.rotation.z = (openness - 1) * hinge.userData.side * hinge.userData.upper * OPEN_ANGLE;
    },
  };
}
