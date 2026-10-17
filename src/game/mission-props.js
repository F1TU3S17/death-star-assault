import * as THREE from 'three';

const clamp01 = (value) => Math.max(0, Math.min(1, value || 0));

function materialSet() {
  return { geometries: [], materials: [] };
}

function geometry(owned, value) {
  owned.geometries.push(value);
  return value;
}

function material(owned, value) {
  owned.materials.push(value);
  return value;
}

function mesh(root, owned, shape, finish, x, y, z) {
  const node = new THREE.Mesh(shape, finish);
  node.position.set(x, y, z);
  root.add(node);
  return node;
}

function makeScanner(root, owned) {
  const steel = material(owned, new THREE.MeshStandardMaterial({ color: 0x53616b, metalness: 0.82, roughness: 0.32 }));
  const blue = material(owned, new THREE.MeshStandardMaterial({ color: 0x55c9ff, emissive: 0x128dff, emissiveIntensity: 1.5, metalness: 0.35, roughness: 0.22 }));
  const dark = material(owned, new THREE.MeshStandardMaterial({ color: 0x19232b, metalness: 0.74, roughness: 0.42 }));
  mesh(root, owned, geometry(owned, new THREE.CylinderGeometry(2.4, 3.2, 1.2, 16)), dark, 0, 0.6, 0);
  mesh(root, owned, geometry(owned, new THREE.CylinderGeometry(0.65, 0.95, 8, 12)), steel, 0, 5.2, 0);
  const mast = new THREE.Group();
  mast.position.set(0, 9.2, 0);
  root.add(mast);
  mesh(mast, owned, geometry(owned, new THREE.CircleGeometry(2.6, 24)), blue, 0, 0, 0);
  mast.children[0].rotation.x = -0.58;
  const rim = mesh(mast, owned, geometry(owned, new THREE.TorusGeometry(2.55, 0.17, 8, 24)), steel, 0, 0, 0);
  rim.rotation.x = -0.58;
  mesh(mast, owned, geometry(owned, new THREE.SphereGeometry(0.48, 12, 8)), blue, 0, 0, 0.1);
  const rings = [];
  for (const radius of [1.2, 1.8]) {
    const ring = mesh(root, owned, geometry(owned, new THREE.TorusGeometry(radius, 0.075, 6, 24)), blue, 0, 3.1, 0);
    ring.rotation.x = Math.PI / 2;
    rings.push(ring);
  }
  return { mast, rings, blue };
}

function makeBeacon(root, owned) {
  const metal = material(owned, new THREE.MeshStandardMaterial({ color: 0x756342, metalness: 0.84, roughness: 0.3 }));
  const gold = material(owned, new THREE.MeshStandardMaterial({ color: 0xffd779, emissive: 0xe79222, emissiveIntensity: 1.5, metalness: 0.45, roughness: 0.2 }));
  const hologram = material(owned, new THREE.MeshBasicMaterial({ color: 0xffd878, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }));
  mesh(root, owned, geometry(owned, new THREE.CylinderGeometry(2.4, 2.9, 1.2, 12)), metal, 0, 0.6, 0);
  mesh(root, owned, geometry(owned, new THREE.CylinderGeometry(1.25, 1.7, 4.5, 8)), metal, 0, 3.3, 0);
  mesh(root, owned, geometry(owned, new THREE.BoxGeometry(3.5, 2.2, 3.5)), gold, 0, 6.3, 0);
  mesh(root, owned, geometry(owned, new THREE.OctahedronGeometry(1.2, 0)), gold, 0, 8.2, 0);
  const halo = new THREE.Group();
  halo.position.y = 8.2;
  root.add(halo);
  for (const radius of [1.7, 2.35]) {
    const ring = mesh(halo, owned, geometry(owned, new THREE.TorusGeometry(radius, 0.065, 6, 24)), hologram, 0, 0, 0);
    ring.rotation.x = radius > 2 ? 0.75 : -0.55;
  }
  return { core: root.children[3], halo, gold, hologram };
}

function makeVent(root, owned) {
  const metal = material(owned, new THREE.MeshStandardMaterial({ color: 0x27333b, metalness: 0.86, roughness: 0.38 }));
  const amber = material(owned, new THREE.MeshStandardMaterial({ color: 0xff9a32, emissive: 0xff631b, emissiveIntensity: 0, metalness: 0.2, roughness: 0.3 }));
  const grilleMaterial = material(owned, new THREE.MeshStandardMaterial({ color: 0x71808a, metalness: 0.88, roughness: 0.27 }));
  const plumeMaterial = material(owned, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uActive: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float t = uv.y;
        p.xz *= 1.0 + sin(uTime * 7.0 + t * 15.0) * t * 0.08;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uActive;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
        float base = 1.0 - smoothstep(0.0, 0.22, vUv.y);
        float tip = smoothstep(0.54, 0.9, vUv.y);
        float flicker = 0.88 + 0.12 * sin(uTime * 19.0 + vUv.y * 31.0);
        vec3 warm = vec3(1.0, 0.24, 0.035);
        vec3 blue = vec3(0.16, 0.48, 1.0);
        vec3 cold = vec3(0.72, 0.9, 1.0);
        vec3 color = mix(warm, blue, smoothstep(0.08, 0.46, vUv.y));
        color = mix(color, cold, tip * 0.84);
        float alpha = (0.13 + base * 0.24 + tip * 0.08) * edge * flicker * uActive;
        gl_FragColor = vec4(color, alpha);
      }`,
  }));
  mesh(root, owned, geometry(owned, new THREE.BoxGeometry(12, 0.7, 8)), metal, 0, 0.35, 0);
  const slats = [];
  for (let i = -3; i <= 3; i++) slats.push(mesh(root, owned, geometry(owned, new THREE.BoxGeometry(0.45, 0.24, 6.4)), grilleMaterial, i * 1.55, 0.8, 0));
  const lamp = mesh(root, owned, geometry(owned, new THREE.SphereGeometry(0.65, 12, 8)), amber, 4.8, 1.1, 0);
  const plume = mesh(root, owned, geometry(owned, new THREE.CylinderGeometry(0.55, 10, 110, 16, 12, true)), plumeMaterial, 0, 55, 0);
  plume.visible = false;
  plume.scale.set(1, 1, 1);
  return { lamp, plumeMaterial, plume };
}

/** Create an authored mission marker; placement, collision and ownership stay with the caller. */
export function createMissionProp(kind, { position = { x: 0, y: 0, z: 0 }, label = '' } = {}) {
  const root = new THREE.Group();
  root.position.set(position.x || 0, position.y || 0, position.z || 0);
  root.userData.kind = kind;
  root.userData.label = label;
  const owned = materialSet();
  const parts = kind === 'scan' ? makeScanner(root, owned) : kind === 'beacon' ? makeBeacon(root, owned) : kind === 'vent' ? makeVent(root, owned) : null;
  if (!parts) throw new Error(`Unknown mission prop: ${kind}`);

  function update({ time = 0, active = false, warning = false, progress = 0 } = {}) {
    const t = Number.isFinite(time) ? time : 0;
    const p = clamp01(progress);
    if (kind === 'scan') {
      parts.mast.rotation.y = t * 0.45;
      parts.rings[0].scale.setScalar(0.82 + 0.16 * Math.sin(t * 3.2));
      parts.rings[1].scale.setScalar(0.82 + 0.16 * Math.sin(t * 3.2 + Math.PI));
      parts.blue.emissiveIntensity = active ? 2.1 : 1.1 + 0.35 * Math.sin(t * 2.1);
    } else if (kind === 'beacon') {
      parts.core.rotation.y = t * 0.8;
      parts.halo.rotation.y = t * 0.48;
      parts.halo.rotation.z = 0.12 * Math.sin(t * 1.4);
      parts.halo.scale.setScalar(0.94 + p * 0.12 + 0.025 * Math.sin(t * 2.5));
      parts.gold.emissiveIntensity = active ? 2.4 : 1.2 + p * 0.6;
      parts.hologram.opacity = 0.52 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2.8));
    } else {
      parts.lamp.material.emissiveIntensity = warning && !active ? 1.2 + 2.2 * (0.5 + 0.5 * Math.sin(t * 7.5)) : active ? 0.5 : 0;
      parts.plume.visible = !!active;
      parts.plumeMaterial.uniforms.uTime.value = t;
      parts.plumeMaterial.uniforms.uActive.value = active ? 1 : 0;
    }
  }

  return {
    mesh: root,
    update,
    dispose() {
      root.clear();
      for (const value of owned.geometries) value.dispose();
      for (const value of owned.materials) value.dispose();
    },
  };
}
