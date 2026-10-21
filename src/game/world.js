import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { createXWingSfoilRig } from './sfoils.js';
import { addTrenchDetail, panelNormalTexture, makeStationSurfaceTexture, makeTrenchMetalTextures } from './world-detail.js';
import { createDetailedCockpit } from './detailed-cockpit.js';
import { createHothScene } from './hoth-scene.js';

const silver = new THREE.MeshStandardMaterial({ color: 0xa3a9b0, roughness: 0.82, metalness: 0.35 });
const dark = new THREE.MeshStandardMaterial({ color: 0x242c38, roughness: 0.72, metalness: 0.65 });
const red = new THREE.MeshStandardMaterial({ color: 0x9e3328, roughness: 0.7 });
const glow = new THREE.MeshBasicMaterial({ color: 0xff80d6 });
const glass = new THREE.MeshStandardMaterial({ color: 0x111a28, metalness: 0.8, roughness: 0.15 });
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const engineRoots = new Set();
const plumeGeometry = new THREE.ConeGeometry(0.46, 2.2, 20, 8, true);
let glowTexture;
function radialGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.48)');
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.10)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function addEngineLights(root, kind) {
  if (kind === 'tie' || kind === 'vader') return;
  root.userData.engineMaterials = [];
  root.userData.engineNodes = [];
  root.userData.engineGlows = [];
  root.userData.engineBoost = 0;
  engineRoots.add(root);
  const points = kind === 'ywing'
    ? [[-4.05, 0.1, 9.25], [4.05, 0.1, 9.25]]
    : [[-2.4, -1.6, 9.35], [-2.4, 1.65, 9.35], [2.4, -1.6, 9.35], [2.4, 1.65, 9.35]];
  for (const point of points) {
    const plasma = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, boost: { value: 0 }, seed: { value: point[0] * 3.7 + point[1] * 7.1 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
      vertexShader: `
        uniform float time;
        uniform float boost;
        uniform float seed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float tail = (p.y + 1.1) / 2.2;
          p.xz *= 1.0 + boost * 0.17 + sin(time * 31.0 + seed + tail * 12.0) * tail * 0.035;
          p.y = (p.y + 1.1) * (1.0 + boost * 0.6) - 1.1;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float time;
        uniform float boost;
        uniform float seed;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }
        void main() {
          vec2 flow = vec2(vUv.x * 7.0 + seed, vUv.y * 10.0 - time * (9.0 + boost * 10.0));
          float turbulence = noise(flow) * 0.67 + noise(flow * 2.3) * 0.33;
          float core = pow(1.0 - vUv.y, 2.0);
          vec3 plasma = mix(vec3(0.35, 0.015, 0.38), vec3(1.15, 0.12, 0.53), turbulence);
          plasma = mix(plasma, vec3(1.8, 0.9, 1.45), core * 0.7);
          float flicker = 0.88 + 0.12 * sin(time * 47.0 + seed);
          float alpha = pow(1.0 - vUv.y, 1.35) * (0.12 + turbulence * 0.16 + boost * 0.07) * flicker;
          gl_FragColor = vec4(plasma * (1.0 + boost * 0.15), alpha);
        }`,
    });
    const plume = new THREE.Mesh(plumeGeometry, plasma);
    plume.rotation.x = Math.PI / 2;
    plume.position.set(point[0], point[1], point[2] + 1.1);
    if (kind === 'ywing') plume.scale.set(1.4, 1.05, 1.4);
    root.add(plume);
    root.userData.engineNodes.push({ node: plume, side: Math.sign(point[0]), upper: Math.sign(point[1]) });
    root.userData.engineMaterials.push(plasma);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlowTexture(), color: new THREE.Color(1.5, 0.15, 0.66), blending: THREE.AdditiveBlending, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false, fog: false }));
    halo.position.set(point[0], point[1], point[2] + 0.08);
    const haloSize = kind === 'ywing' ? 2.2 : 1.65;
    halo.scale.setScalar(haloSize);
    root.add(halo);
    root.userData.engineNodes.push({ node: halo, side: Math.sign(point[0]), upper: Math.sign(point[1]) });
    root.userData.engineGlows.push({ node: halo, size: haloSize });
    const core = new THREE.Mesh(new THREE.CircleGeometry(kind === 'ywing' ? 0.52 : 0.32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.25, 1.75), transparent: true, opacity: 0.97, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false }));
    core.position.set(...point);
    root.add(core);
    root.userData.engineNodes.push({ node: core, side: Math.sign(point[0]), upper: Math.sign(point[1]) });
  }
}

function box(parent, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, material, radius, length, x, y, z, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function fallbackShip(kind) {
  const ship = new THREE.Group();
  if (kind === 'vader') {
    // Authored TIE Advanced x1: broad rear drive housing and inward-bent
    // solar arrays distinguish Vader's fighter from a standard TIE.
    ship.add(new THREE.Mesh(new THREE.SphereGeometry(2.65, 20, 14), dark));
    cylinder(ship, silver, 2.0, 0.35, 0, 0, -2.2, 16);
    cylinder(ship, glass, 1.65, 0.45, 0, 0, -2.45, 16);
    box(ship, dark, 0, 0, 2.5, 6.3, 3.5, 6.5);
    box(ship, silver, 0, 1.85, 2.0, 5.5, 0.3, 4.5);
    for (const side of [-1, 1]) {
      box(ship, silver, side * 4.5, 0, 0.7, 5.1, 0.7, 2.1);
      box(ship, dark, side * 7, 0, 0.3, 0.32, 3.5, 9.5);
      box(ship, silver, side * 7, 0, 0.3, 0.4, 0.22, 9.8);
      for (const upper of [-1, 1]) {
        const foldedPanel = new THREE.Group();
        foldedPanel.position.set(side * 6.22, upper * 3.1, 0.3);
        foldedPanel.rotation.z = side * upper * 0.48;
        box(foldedPanel, dark, 0, 0, 0, 0.3, 3.4, 9.5);
        for (const edge of [-1, 1]) {
          box(foldedPanel, silver, 0, edge * 1.65, 0, 0.39, 0.19, 9.7);
          box(foldedPanel, silver, 0, 0, edge * 4.7, 0.39, 3.4, 0.17);
        }
        for (let z = -3; z <= 3; z += 1.5) box(foldedPanel, silver, 0, 0, z, 0.34, 3.1, 0.055);
        ship.add(foldedPanel);
      }
      cylinder(ship, silver, 0.18, 2.3, side * 1.25, -1.7, -2.1, 6);
    }
    ship.userData.design = 'TIE Advanced x1 — authored geometric model';
  } else if (kind === 'tie') {
    ship.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 14, 10), silver));
    cylinder(ship, glass, 1.6, 0.4, 0, 0, -2.2);
    for (const sign of [-1, 1]) {
      box(ship, silver, sign * 4, 0, 0, 5, 0.6, 0.7);
      const wing = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.25, 6), dark);
      wing.rotation.z = Math.PI / 2;
      wing.rotation.y = Math.PI / 2;
      wing.position.x = sign * 6;
      ship.add(wing);
      box(ship, silver, sign * 6, 0, 0, 0.4, 11, 0.35);
      box(ship, silver, sign * 6, 0, 0, 0.4, 0.35, 10);
    }
  } else if (kind === 'ywing') {
    box(ship, silver, 0, 0, -3, 4, 1.5, 9);
    box(ship, red, 0, 0.85, -5, 2.5, 0.1, 3);
    box(ship, glass, 0, 1, -3.5, 2, 1, 3);
    box(ship, dark, 0, 0, 1.5, 10, 0.7, 1.5);
    for (const sign of [-1, 1]) {
      cylinder(ship, silver, 1.35, 10, sign * 5, 0, 2);
      cylinder(ship, glow, 0.8, 0.1, sign * 5, 0, 7.1);
      box(ship, dark, sign * 5, 0, 11, 0.2, 0.2, 8);
    }
  } else {
    box(ship, silver, 0, 0, -2, 2, 1.4, 12);
    box(ship, red, 0, 0.72, -5, 1.8, 0.08, 5);
    box(ship, glass, 0, 1, -0.8, 1.5, 1.2, 3.3);
    for (const sign of [-1, 1]) {
      for (const up of [-1, 1]) {
        const wing = new THREE.Group();
        wing.rotation.z = sign * up * 0.22;
        wing.userData.sfoil = { side: sign, upper: up };
        box(wing, silver, sign * 5, up * 0.5, 1, 9, 0.35, 2.8);
        box(wing, red, sign * 6, up * 0.72, 0.5, 3, 0.07, 1.3);
        cylinder(wing, silver, 0.65, 6, sign * 2.3, up * 0.4, 1.5);
        cylinder(wing, glow, 0.48, 0.12, sign * 2.3, up * 0.4, 4.6);
        cylinder(wing, silver, 0.16, 9, sign * 9.1, up * 0.5, -1.5);
        ship.add(wing);
      }
    }
  }
  return ship;
}

const modelCache = new Map();
function loadModel(url) {
  if (!modelCache.has(url)) {
    const loader = /\.obj(?:\?|$)/i.test(url) ? new OBJLoader() : new GLTFLoader();
    modelCache.set(url, loader.loadAsync(url).then(result => result.scene || result));
  }
  return modelCache.get(url);
}

/** Local-model wrapper with a usable silhouette while a mesh is loading. */
export function createShip(kind = 'xwing', modelUrl, modelOptions = {}) {
  const root = new THREE.Group();
  const fallback = fallbackShip(kind);
  // The world shadow map covers hundreds of metres. Its texels cannot resolve
  // thin wing panels: self-shadowing makes them crawl as the chase camera moves.
  // Ships retain their PBR/normal-map shading and environment reflections.
  fallback.traverse(object => { if (object.isMesh) { object.castShadow = false; object.receiveShadow = false; } });
  root.add(fallback);
  root.userData.kind = kind;
  addEngineLights(root, kind);
  let sfoilRig = null;
  if (kind === 'xwing') {
    const fallbackWings = fallback.children.filter(child => child.userData.sfoil);
    const effectsHinges = new Map();
    for (const side of [-1, 1]) for (const upper of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 1.2, upper * 0.8, 0);
      root.add(hinge);
      effectsHinges.set(`${side}:${upper}`, hinge);
    }
    // Nozzles and plasma belong to the same moving assembly as their engines.
    for (const { node, side, upper } of root.userData.engineNodes) {
      const hinge = effectsHinges.get(`${side}:${upper}`);
      node.position.sub(hinge.position);
      hinge.add(node);
    }
    root.userData.sfoils = { openness: 1, loadedRig: false, wingCount: 4, sourceMeshes: 0, movingTriangles: 0, stationaryTriangles: 0 };
    root.userData.setSfoils = (value) => {
      const openness = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
      root.userData.sfoils.openness = openness;
      for (const wing of fallbackWings) wing.rotation.z = wing.userData.sfoil.side * wing.userData.sfoil.upper * 0.22 * openness;
      for (const [key, hinge] of effectsHinges) {
        const [side, upper] = key.split(':').map(Number);
        hinge.rotation.z = (openness - 1) * side * upper * 0.255;
      }
      sfoilRig?.set(openness);
      root.userData.sfoils.angles = sfoilRig ? [...sfoilRig.wings.values()].map(hinge => hinge.rotation.z) : [];
    };
  }
  root.userData.modelStatus = modelUrl ? 'loading' : 'fallback';
  if (modelUrl) {
    loadModel(modelUrl).then(template => {
      if (root.userData.disposed) return;
      const asset = template.clone(true);
      const tunedMaterials = new Map();
      asset.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
        const tune = (original) => {
          if (tunedMaterials.has(original)) return tunedMaterials.get(original);
          const material = original.clone();
          const rebel = kind === 'xwing' || kind === 'ywing';
          // Keep authored paint/metal maps, but avoid clean white hulls under
          // the trench key and fill. Rougher paint retains the red markings.
          if (material.color) material.color.multiplyScalar(rebel ? 0.8 : kind === 'tie' ? 0.96 : 0.98);
          if ('roughness' in material) material.roughness = material.roughnessMap ? (rebel ? 1 : 0.9) : kind === 'tie' ? 0.58 : rebel ? 0.82 : 0.72;
          if ('metalness' in material) material.metalness = material.metalnessMap ? 0.75 : Math.min(0.4, material.metalness);
          material.envMapIntensity = rebel ? 0.58 : kind === 'tie' ? 0.65 : 0.72;
          for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) {
            if (texture) texture.anisotropy = 8;
          }
          if ('emissiveIntensity' in material) material.emissiveIntensity = Math.min(0.18, material.emissiveIntensity);
          tunedMaterials.set(original, material);
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(tune) : tune(object.material);
      });
      if (modelOptions.rotation) asset.rotation.set(...modelOptions.rotation);
      else if (kind === 'tie' && modelUrl.includes('/tie-fighter-detailed/')) asset.rotation.y = Math.PI;
      asset.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(asset);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const factor = (kind === 'tie' || kind === 'vader' ? 12 : 19) / Math.max(size.x, size.y, size.z, 0.001);
      const pivot = new THREE.Group();
      asset.position.sub(center);
      pivot.add(asset);
      pivot.scale.setScalar(factor);
      root.add(pivot);
      if (kind === 'xwing') {
        sfoilRig = createXWingSfoilRig(root, pivot);
        root.add(sfoilRig.group);
        root.remove(pivot);
        Object.assign(root.userData.sfoils, sfoilRig.counts, { loadedRig: true });
        root.userData.setSfoils(root.userData.sfoils.openness);
      }
      fallback.visible = false;
      root.userData.modelStatus = 'loaded';
      root.userData.modelUrl = modelUrl;
    }).catch(error => {
      root.userData.modelStatus = 'fallback';
      root.userData.modelError = error.message;
      console.warn(`Model unavailable: ${modelUrl}. Using geometric ship.`, error.message);
    });
  }
  return root;
}

export function createWorld(scene) {
  let disposed = false;
  const graphics = {
    style: 'machined-metal-service-districts', phase: 'menu', stationTexture: [4096, 2048],
    generatedPanelNormal: false, plumeLength: 2.2, boostedPlumeLength: 3.52,
    roundEngineCores: true, materialTuning: 'neutral worn metal; distinct albedo, normal and roughness; preserved ship markings',
    trench: null, cinemaTrench: null, stationVisible: true,
  };
  scene.userData.worldGraphics = graphics;
  const space = new THREE.Group();
  const surface = new THREE.Group();
  const trench = new THREE.Group();
  const cinematic = new THREE.Group();
  scene.add(space, surface, trench, cinematic);
  // Episode V lives on its own ice plain; the hangar hides it until a Hoth phase starts.
  const hoth = createHothScene(scene);
  scene.add(hoth.root);
  hoth.setPhase('menu');
  const stars = new Float32Array(5000 * 3);
  for (let i = 0; i < stars.length; i += 3) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = 10000 + Math.random() * 8000;
    stars[i] = r * Math.sin(v) * Math.cos(u);
    stars[i + 1] = r * Math.cos(v);
    stars[i + 2] = r * Math.sin(v) * Math.sin(u);
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  const starfield = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xd0ddf5, size: 1.3, sizeAttenuation: false, fog: false, toneMapped: false }));
  scene.add(starfield);

  const stationTexture = makeStationSurfaceTexture();
  const stationMaterial = new THREE.MeshStandardMaterial({ color: 0x9eaab3, map: stationTexture, bumpMap: stationTexture, bumpScale: 1.5, roughness: 0.91, metalness: 0.28 });
  function deathStar(radius) {
    const group = new THREE.Group();
    const dishNormal = new THREE.Vector3(-0.31, 0.38, 0.87).normalize();
    const sphereGeometry = new THREE.SphereGeometry(radius, 128, 96);
    const positions = sphereGeometry.attributes.position;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const angle = Math.acos(THREE.MathUtils.clamp(vertex.clone().normalize().dot(dishNormal), -1, 1));
      if (angle < 0.19) {
        const u = angle / 0.19;
        vertex.multiplyScalar(1 - 0.066 * (1 - u * u));
        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
    }
    sphereGeometry.computeVertexNormals();
    const sphere = new THREE.Mesh(sphereGeometry, stationMaterial);
    group.add(sphere);
    const dish = new THREE.Group();
    const dishMat = new THREE.MeshStandardMaterial({ color: 0x65727e, map: stationTexture, bumpMap: stationTexture, bumpScale: radius * 0.00014, roughness: 0.9, metalness: 0.24, side: THREE.DoubleSide });
    const dishRadius = radius * 0.182;
    const dishZ = r => -radius * 0.066 + (r / dishRadius) ** 2 * radius * 0.049;
    const dishPoints = Array.from({ length: 33 }, (_, i) => new THREE.Vector2(dishRadius * i / 32, dishZ(dishRadius * i / 32)));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(dishPoints, 96), dishMat);
    bowl.rotation.x = Math.PI / 2;
    // Lathe's Y axis becomes local +Z, with the centre sunk into the hull.
    dish.add(bowl);
    const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x505b64, roughness: 0.7, metalness: 0.34 });
    for (let i = 1; i <= 3; i++) {
      const r = dishRadius * i / 3;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, radius * (i === 3 ? 0.0011 : 0.0004), 5, 96), ribMaterial);
      ring.position.z = dishZ(r) + radius * 0.0007;
      dish.add(ring);
    }
    const spokes = [];
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      for (let step = 0; step < 10; step++) {
        for (const s of [step, step + 1]) {
          const r = dishRadius * (0.13 + s / 10 * 0.87);
          spokes.push(Math.cos(angle) * r, Math.sin(angle) * r, dishZ(r) + radius * 0.0008);
        }
      }
    }
    const spokeGeometry = new THREE.BufferGeometry();
    spokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3));
    dish.add(new THREE.LineSegments(spokeGeometry, new THREE.LineBasicMaterial({ color: 0x505c66 })));
    const focus = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.024, 32), new THREE.MeshStandardMaterial({ color: 0x28313a, roughness: 1 }));
    focus.position.z = dishZ(0) + radius * 0.0007;
    dish.add(focus);
    dish.position.copy(dishNormal).multiplyScalar(radius);
    dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dishNormal);
    group.add(dish);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.0005, radius * 0.0035, 8, 192), new THREE.MeshStandardMaterial({ color: 0x18222f, roughness: 0.95 }));
    belt.rotation.x = Math.PI / 2;
    group.add(belt);
    for (const side of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.001, radius * 0.0007, 4, 192), ribMaterial);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = side * radius * 0.0047;
      group.add(lip);
    }
    group.userData.modelStatus = 'procedural-detailed';
    return group;
  }
  const station = deathStar(2000);
  station.position.set(2200, 1300, -6200);
  space.add(station);

  const textureCopies = [];
  const panelTexture = new THREE.TextureLoader().load('/textures/station-panels.png', texture => {
    if (disposed) { texture.dispose(); return; }
    for (const copy of textureCopies) { copy.image = texture.image; copy.needsUpdate = true; }
    const normal = panelNormalTexture(texture.image);
    for (const [index, [material, repeat]] of [[floorMaterial, floorTexture.repeat], [wallMaterial, wallTexture.repeat]].entries()) {
      material.normalMap = index === 0 ? normal : normal.clone();
      material.normalMap.repeat.copy(repeat);
      material.normalScale.setScalar(material === floorMaterial ? 0.32 : 0.28);
      material.needsUpdate = true;
    }
    graphics.generatedPanelNormal = true;
  });
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.wrapS = panelTexture.wrapT = THREE.RepeatWrapping;
  panelTexture.repeat.set(2, 2);
  panelTexture.anisotropy = 8;
  const floorTexture = panelTexture.clone();
  floorTexture.repeat.set(120, 120);
  const wallTexture = panelTexture.clone();
  wallTexture.repeat.set(48, 1.6);
  textureCopies.push(floorTexture, wallTexture);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x73818b, map: floorTexture, roughness: 0.88, metalness: 0.38 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x87939d, map: wallTexture, roughness: 0.92, metalness: 0.25 });
  const trenchMetal = makeTrenchMetalTextures();
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xb2b8ba, map: trenchMetal.color, normalMap: trenchMetal.normal, normalScale: new THREE.Vector2(.34, .34), roughnessMap: trenchMetal.roughness, roughness: 0.94, metalness: 0.36, envMapIntensity: .65 });
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(22000, 22000), floorMaterial);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = -150;
  deck.receiveShadow = true;
  surface.add(deck);
  const greebleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const greebles = new THREE.InstancedMesh(greebleGeometry, panelMaterial, 650);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 650; i++) {
    let x = (Math.random() - 0.5) * 9000;
    if (Math.abs(x) < 125) x += x < 0 ? -200 : 200;
    const height = 4 + Math.random() * 95;
    dummy.position.set(x, -150 + height / 2, (Math.random() - 0.5) * 11000);
    dummy.scale.set(20 + Math.random() * 80, height, 20 + Math.random() * 100);
    dummy.updateMatrix();
    greebles.setMatrixAt(i, dummy.matrix);
  }
  surface.add(greebles);
  greebles.receiveShadow = true;

  // Small fixed sets communicate separate industrial districts. Repeated
  // details share instance buffers instead of creating hundreds of draw calls.
  const architectureBoxes = [];
  const darkBoxes = [];
  const amberBoxes = [];
  const blueBoxes = [];
  const addBlock = (list, x, y, z, sx, sy, sz) => list.push([x, y, z, sx, sy, sz]);
  const hangarLocations = [
    [-680, -650], [680, -650], [-1100, -2000], [1100, -2000],
    [-1650, -3450], [1650, -3450], [-2600, 1000], [2600, 1000],
  ];
  for (const [x, z] of hangarLocations) {
    addBlock(architectureBoxes, x, -77, z - 65, 215, 145, 18);
    addBlock(architectureBoxes, x - 108, -83, z, 20, 134, 150);
    addBlock(architectureBoxes, x + 108, -83, z, 20, 134, 150);
    addBlock(architectureBoxes, x, -13, z, 235, 14, 160);
    addBlock(darkBoxes, x, -88, z - 54, 195, 110, 2);
    addBlock(blueBoxes, x, -30, z + 83, 185, 2, 2);
    for (const side of [-1, 1]) {
      addBlock(architectureBoxes, x + side * 100, -84, z + 78, 8, 120, 14);
      addBlock(amberBoxes, x + side * 79, -148.6, z + 230, 2.5, 0.8, 250);
      for (let lane = 0; lane < 6; lane++) addBlock(amberBoxes, x + side * 72, -148, z + 120 + lane * 38, 9, 1, 8);
    }
    for (let roof = 0; roof < 6; roof++) addBlock(darkBoxes, x - 85 + roof * 34, 0, z - 20, 14, 15, 70);
  }
  for (let index = 0; index < 36; index++) {
    const side = index % 2 ? -1 : 1;
    const x = side * (350 + (index % 6) * 230);
    const z = 900 - Math.floor(index / 6) * 820;
    const height = 55 + (index % 4) * 21;
    addBlock(architectureBoxes, x, -150 + height / 2, z, 65, height, 65);
    addBlock(architectureBoxes, x, -150 + height + 8, z, 83, 16, 83);
    addBlock(darkBoxes, x, -150 + height + 21, z, 48, 12, 48);
    for (const sign of [-1, 1]) {
      addBlock(architectureBoxes, x + sign * 12, -150 + height + 29, z - 32, 6, 6, 65);
      addBlock(amberBoxes, x + sign * 25, -150 + height + 18, z + 42.1, 3, 2, 1);
    }
    // Slender antenna arrays break up the skyline above the low deck.
    addBlock(darkBoxes, x + 24, -150 + height + 42, z + 20, 2, 58, 2);
    addBlock(architectureBoxes, x + 24, -150 + height + 55, z + 20, 22, 1.2, 1.2);
    addBlock(architectureBoxes, x + 24, -150 + height + 64, z + 20, 13, 1.2, 1.2);
  }
  // Large recognizable relay compounds flank the tactical central corridor.
  for (const [x, z] of [[-410, -1200], [410, -1200], [-560, -2800], [560, -2800]]) {
    addBlock(architectureBoxes, x, -140, z, 150, 20, 150);
    addBlock(darkBoxes, x, -110, z, 85, 40, 85);
    addBlock(architectureBoxes, x, -82, z, 45, 18, 45);
    for (const sign of [-1, 1]) {
      addBlock(architectureBoxes, x + sign * 54, -94, z, 13, 90, 20);
      addBlock(blueBoxes, x + sign * 54, -91, z - 11, 4, 61, 2);
      addBlock(amberBoxes, x, -71, z + sign * 28, 55, 2, 2);
    }
  }
  function instanceBlocks(entries, material) {
    const mesh = new THREE.InstancedMesh(greebleGeometry, material, entries.length);
    mesh.castShadow = material === panelMaterial;
    mesh.receiveShadow = true;
    entries.forEach(([x, y, z, sx, sy, sz], index) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    surface.add(mesh);
  }
  instanceBlocks(architectureBoxes, panelMaterial);
  instanceBlocks(darkBoxes, dark);
  instanceBlocks(amberBoxes, new THREE.MeshBasicMaterial({ color: 0xedbb66, toneMapped: false }));
  instanceBlocks(blueBoxes, new THREE.MeshBasicMaterial({ color: 0x679cc0, toneMapped: false }));
  const pipeGeometry = new THREE.CylinderGeometry(1, 1, 1, 7);
  const pipes = new THREE.InstancedMesh(pipeGeometry, silver, 96);
  for (let index = 0; index < 96; index++) {
    const side = index % 2 ? -1 : 1;
    dummy.position.set(side * (190 + index % 8 * 19), -143 + index % 3 * 3.5, 700 - Math.floor(index / 8) * 400);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.scale.set(2 + index % 3, 350, 2 + index % 3);
    dummy.updateMatrix();
    pipes.setMatrixAt(index, dummy.matrix);
  }
  surface.add(pipes);
  pipes.receiveShadow = true;
  dummy.rotation.set(0, 0, 0);

  const distantBattle = new THREE.Group();
  scene.add(distantBattle);
  const distantShips = [
    createShip('xwing', '/models/x-wing/scene.gltf', { rotation: [0, Math.PI, 0] }),
    createShip('ywing', '/models/y-wing/scene.gltf'),
    createShip('tie', '/models/tie-fighter-detailed/scene.gltf'),
    createShip('tie', '/models/tie-fighter-detailed/scene.gltf'),
  ];
  distantShips.forEach(ship => distantBattle.add(ship));
  const distantBoltGeometry = new THREE.CylinderGeometry(0.7, 0.7, 20, 5);
  distantBoltGeometry.rotateX(Math.PI / 2);
  const distantBolts = [0xff5a45, 0x68ff5f].map(color => {
    const mesh = new THREE.InstancedMesh(distantBoltGeometry, new THREE.MeshBasicMaterial({ color, toneMapped: false }), 18);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    distantBattle.add(mesh);
    return mesh;
  });

  for (const side of [-1, 1]) {
    const wall = box(trench, wallMaterial, side * 155, -40, -1700, 145, 220, 7000);
    wall.castShadow = true;
  }
  graphics.trench = addTrenchDetail(trench, { wallX: 81, floorY: -150, topY: 70, startZ: 1700, endZ: -5100, material: panelMaterial, seed: 1977 });
  const trenchAccent = new THREE.PointLight(0xffb46d, 110, 180, 2);
  trenchAccent.position.set(-73, -20, -1700);
  trench.add(trenchAccent);
  // Small raised exhaust at the end of the actual playable trench.
  const exhaust = new THREE.Group();
  cylinder(exhaust, dark, 13, 3, 0, -65, -3400, 24);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(13, 1.7, 8, 32), silver);
  rim.position.set(0, -65, -3398);
  exhaust.add(rim);
  trench.add(exhaust);

  const cinemaStation = deathStar(320);
  cinemaStation.position.set(0, 0, -720);
  cinematic.add(cinemaStation);
  const cinemaFighter = createShip('xwing', '/models/x-wing/scene.gltf', { rotation: [0, Math.PI, 0] });
  cinematic.add(cinemaFighter);
  // A separate close-up set makes the two-metre exhaust readable before the orbital cut.
  const cinemaTrench = new THREE.Group();
  cinematic.add(cinemaTrench);
  box(cinemaTrench, floorMaterial, 0, -5, -250, 135, 10, 1900);
  for (const side of [-1, 1]) {
    const wall = box(cinemaTrench, wallMaterial, side * 78, 35, -250, 36, 85, 1900);
    wall.castShadow = true;
  }
  graphics.cinemaTrench = addTrenchDetail(cinemaTrench, { wallX: 59, floorY: 0, topY: 77, startZ: 650, endZ: -1200, material: panelMaterial, seed: 1983 });
  const cinemaAccent = new THREE.PointLight(0xffb979, 100, 150, 2);
  cinemaAccent.position.set(48, 30, 70);
  cinemaTrench.add(cinemaAccent);
  const vent = new THREE.Group();
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x01040a, side: THREE.DoubleSide });
  const ventHole = new THREE.Mesh(new THREE.CircleGeometry(5.1, 24), holeMat);
  ventHole.rotation.x = -Math.PI / 2;
  ventHole.position.y = 0.15;
  vent.add(ventHole);
  const ventRim = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.7, 8, 32), silver);
  ventRim.rotation.x = Math.PI / 2;
  ventRim.position.y = 0.5;
  vent.add(ventRim);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 45, 24, 1, true), holeMat);
  shaft.position.y = -22;
  vent.add(shaft);
  box(vent, dark, 0, 0.1, 0, 18, 0.12, 18);
  // The black opening and rim sit above this inset service panel.
  ventHole.position.y = 0.22;
  vent.position.set(0, 0, -330);
  cinemaTrench.add(vent);
  const ventBeaconMaterial = new THREE.MeshBasicMaterial({ color: 0xedbb66, toneMapped: false });
  for (const side of [-1, 1]) {
    box(vent, ventBeaconMaterial, side * 9.8, 0.7, 0, 0.5, 0.4, 14);
    box(vent, silver, side * 12, 1.2, 0, 2, 2.4, 20);
  }
  const qtePursuit = new THREE.Group();
  cinematic.add(qtePursuit);
  const pursuitFighters = [-1, 1].map(side => {
    const fighter = createShip('tie', '/models/tie-fighter-detailed/scene.gltf');
    fighter.userData.side = side;
    qtePursuit.add(fighter);
    return fighter;
  });
  const pursuitBolts = Array.from({ length: 6 }, (_, index) => {
    const bolt = cylinder(qtePursuit, new THREE.MeshBasicMaterial({ color: 0x67ff68, toneMapped: false }), 0.16, 11, 0, 0, 0, 5);
    bolt.userData.side = index % 2 ? -1 : 1;
    bolt.userData.offset = index / 6;
    return bolt;
  });
  let qteInitialized = false;
  let previousQteTime = 0;
  let previousQteStage = -1;
  let qteStageChangedAt = 0;
  let qteBank = 0;
  const lastQtePosition = new THREE.Vector3(0, 15, 80);
  const lastQteRotation = new THREE.Euler();
  const qteCameraPosition = new THREE.Vector3();
  const qteLookAt = new THREE.Vector3();
  const qteUp = new THREE.Vector3();
  const qteForward = new THREE.Vector3();
  const torpedoMaterial = new THREE.MeshBasicMaterial({ color: 0xc6edff });
  const torpedoes = [-1, 1].map(side => {
    const torpedo = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), torpedoMaterial);
    torpedo.userData.side = side;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.6, 9, 8), new THREE.MeshBasicMaterial({ color: 0x75cfff, transparent: true, opacity: 0.5 }));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = 4;
    torpedo.add(tail);
    cinematic.add(torpedo);
    return torpedo;
  });
  const fireMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { time: { value: 0 }, alpha: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec3 vPoint;
      varying vec3 vNormal;
      void main() {
        vPoint = position;
        vNormal = normalize(normalMatrix * normal);
        float billow = sin(position.x*9.0+time*3.0)*sin(position.y*11.0-time*2.0)*sin(position.z*8.0+time);
        vec3 p = position * (1.0 + billow*0.13);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform float alpha;
      varying vec3 vPoint;
      varying vec3 vNormal;
      float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float noise(vec3 p) {
        vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 p=vPoint*6.0+vec3(time*0.35,-time*0.7,time*0.25);
        float n=noise(p)*0.6+noise(p*2.1)*0.28+noise(p*4.2)*0.12;
        float heat=smoothstep(0.12,0.88,n);
        vec3 color=mix(vec3(0.95,0.035,0.001),vec3(1.7,0.65,0.035),heat);
        color=mix(color,vec3(2.5,2.1,1.2),smoothstep(0.62,0.95,heat));
        float edge=smoothstep(0.0,0.32,abs(vNormal.z));
        gl_FragColor=vec4(color,alpha*edge*(0.55+heat*0.45));
      }`,
  });
  const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), fireMaterial);
  blast.position.copy(cinemaStation.position);
  cinematic.add(blast);
  const billows = new THREE.Group();
  billows.position.copy(cinemaStation.position);
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), fireMaterial);
    const a = i / 16 * Math.PI * 2;
    cloud.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.64, Math.sin(i * 3.6) * 0.3);
    cloud.scale.setScalar(0.3 + (i % 4) * 0.045);
    billows.add(cloud);
  }
  cinematic.add(billows);
  const blastHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlowTexture(), color: 0xff9d28, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  blastHalo.position.copy(cinemaStation.position);
  cinematic.add(blastHalo);
  const flashCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlowTexture(), color: 0xfff7df, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  flashCore.position.copy(cinemaStation.position);
  cinematic.add(flashCore);
  const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.007, 8, 192), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  shockwave.rotation.x = Math.PI / 2.6;
  shockwave.position.copy(cinemaStation.position);
  cinematic.add(shockwave);

  const checkpointGeometry = new THREE.TorusGeometry(30, 0.45, 6, 48);
  const checkpointMaterial = new THREE.MeshBasicMaterial({ color: 0xe9b961, transparent: true, opacity: 0.75 });
  const checkpoints = Array.from({ length: 6 }, (_, i) => {
    const mesh = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
    mesh.position.set(Math.sin(i * 1.3) * 12, -45, 500 - i * 550);
    trench.add(mesh);
    return mesh;
  });

  function setPhase(phase) {
    const isCinema = phase === 'cinematic' || phase === 'victory';
    hoth.setPhase(phase);
    space.visible = ['menu', 'combat'].includes(phase);
    surface.visible = ['surface', 'escort', 'assault', 'defend', 'trench'].includes(phase);
    distantBattle.visible = ['combat', 'surface', 'escort', 'assault', 'defend'].includes(phase);
    trench.visible = phase === 'trench';
    cinematic.visible = isCinema || phase === 'qte';
    qtePursuit.visible = phase === 'qte';
    graphics.phase = phase;
    graphics.stationVisible = space.visible;
    graphics.surfaceVisible = surface.visible;
    graphics.trenchVisible = trench.visible;
    if (phase === 'qte') {
      qteInitialized = false;
      cinemaStation.visible = false;
      cinemaFighter.visible = false;
      cinemaTrench.visible = true;
      vent.visible = true;
      torpedoes.forEach(torpedo => { torpedo.visible = false; });
      fireMaterial.uniforms.alpha.value = 0;
      blastHalo.material.opacity = 0;
      flashCore.material.opacity = 0;
      billows.visible = false;
      shockwave.material.opacity = 0;
    }
    if (phase === 'cinematic') {
      cinemaStation.visible = true;
      cinemaFighter.visible = true;
      cinemaTrench.visible = true;
      vent.visible = true;
      torpedoes.forEach(torpedo => { torpedo.visible = false; });
      fireMaterial.uniforms.alpha.value = 0;
      blastHalo.material.opacity = 0;
      flashCore.material.opacity = 0;
      billows.visible = false;
      shockwave.material.opacity = 0;
    }
  }
  setPhase('menu');

  return {
    space, surface, trench, station, cinematic, checkpoints, setPhase, graphics, hoth,
    update(time, dt = 0) {
      hoth.update(dt, { phase: graphics.phase });
      station.rotation.y = Math.sin(time * 0.02) * 0.04;
      for (const root of engineRoots) {
        if (root.userData.disposed) { engineRoots.delete(root); continue; }
        const boost = THREE.MathUtils.clamp(root.userData.engineBoost || 0, 0, 1);
        for (const material of root.userData.engineMaterials || []) {
          material.uniforms.time.value = time;
          material.uniforms.boost.value = boost;
        }
        for (const { node, size } of root.userData.engineGlows || []) {
          node.scale.setScalar(size * (1 + boost * 0.12));
          node.material.opacity = 0.76 + boost * 0.08;
        }
      }
      if (distantBattle.visible) {
        distantShips.forEach((ship, index) => {
          const phase = time * 0.12 + index * 1.8;
          ship.position.set(Math.cos(phase) * 430 + (index % 2 ? -900 : 900), 100 + Math.sin(phase * 1.3) * 150, -1600 + Math.sin(phase) * 700);
          ship.rotation.set(Math.sin(phase) * 0.1, Math.atan2(-Math.sin(phase), Math.cos(phase)), Math.sin(phase) * 0.2);
          ship.scale.setScalar(index < 2 ? 1.7 : 1.4);
        });
        distantBolts.forEach((mesh, faction) => {
          for (let index = 0; index < mesh.count; index++) {
            const cycle = (time * 0.26 + index / mesh.count) % 1;
            const lane = index % 6;
            dummy.position.set((faction ? -1 : 1) * (620 + lane * 130), 40 + lane * 36, -600 - cycle * 2300);
            dummy.rotation.set(0, faction ? 0.23 : -0.23, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        });
      }
    },
    updateQte(time, qte, camera, player, cameraMode = 'chase') {
      if (!qte) return;
      const stage = Math.min(3, Math.max(0, qte.stage || 0));
      const delta = qteInitialized ? Math.min(0.1, Math.max(0, time - previousQteTime)) : 0;
      const blend = 1 - Math.exp(-delta * 5);
      const firstFrame = !qteInitialized;
      if (firstFrame || stage !== previousQteStage) {
        qteStageChangedAt = time;
        previousQteStage = stage;
      }
      const stageTime = Math.max(0, time - qteStageChangedAt);
      const targetZ = 440 - stage * 120 - Math.min(stageTime, 1.5) * 6;
      // Advancing the accepted-input stage makes A bank left, D bank right,
      // and W settle the ship before the final torpedo release.
      const bankTarget = [0.035, 0.27, -0.30, 0][stage];
      qteBank = firstFrame ? bankTarget : THREE.MathUtils.lerp(qteBank, bankTarget, blend);
      const targetX = [0, 8, -9, 0][stage] + Math.sin(time * 1.1) * 1.2;
      if (firstFrame) player.position.set(targetX, 15, targetZ);
      else {
        player.position.x = THREE.MathUtils.lerp(player.position.x, targetX, blend);
        player.position.z = THREE.MathUtils.lerp(player.position.z, targetZ, blend);
        player.position.y = 15 + Math.sin(time * 2.7) * 0.35;
      }
      player.rotation.set(Math.sin(time * 1.4) * 0.008, -qteBank * 0.13, qteBank);
      cinemaAccent.position.z = player.position.z - 35;
      lastQtePosition.copy(player.position);
      lastQteRotation.copy(player.rotation);
      for (const fighter of pursuitFighters) {
        const side = fighter.userData.side;
        fighter.position.set(player.position.x + side * (21 + Math.sin(time * 0.8 + side) * 4), 17 + Math.sin(time * 1.7 + side) * 3, player.position.z + 48 + (side === 1 ? 16 : 0));
        fighter.rotation.set(0, Math.sin(time * 0.7) * 0.025, side * 0.08 + Math.sin(time) * 0.04);
      }
      for (const bolt of pursuitBolts) {
        const p = (time * 0.65 + bolt.userData.offset) % 1;
        bolt.position.set(player.position.x + bolt.userData.side * (20 - p * 13), 15 + bolt.userData.side * 1.3, player.position.z + 62 - p * 160);
      }
      // A moving texture provides continuous forward motion while retries keep
      // the player on the same safe approach rail, short of the exhaust.
      floorTexture.offset.y = time * 0.09;
      wallTexture.offset.x = time * 0.04;
      camera.up.set(0, 1, 0);
      if (cameraMode === 'cockpit') {
        qteUp.set(0, 1, 0).applyQuaternion(player.quaternion);
        qteForward.set(0, 0, -1).applyQuaternion(player.quaternion);
        camera.position.copy(player.position).addScaledVector(qteUp, 1.8).addScaledVector(qteForward, 1.8);
        camera.up.copy(qteUp);
        camera.lookAt(qteLookAt.copy(camera.position).addScaledVector(qteForward, 250));
      } else {
        if (stage === 3 && stageTime < 0.72) {
          // Brief insert identifies the actual vulnerable opening, then cuts
          // back to Luke for the player's final Space input.
          qteCameraPosition.set(19, 27, -286);
          qteLookAt.set(0, 0.2, -330);
          camera.position.copy(qteCameraPosition);
        } else {
          const offsets = [[22, 23, 106], [-43, 13, 29], [31, 17, 92], [11, 22, 48]][stage];
          qteCameraPosition.copy(player.position).add(new THREE.Vector3(...offsets));
          qteLookAt.copy(player.position).add(new THREE.Vector3(0, stage === 3 ? -4 : 1, stage === 3 ? -150 : -17));
          if (firstFrame || (stage === 3 && stageTime < 0.86)) camera.position.copy(qteCameraPosition);
          else camera.position.lerp(qteCameraPosition, 1 - Math.exp(-delta * 7));
        }
        camera.lookAt(qteLookAt);
      }
      previousQteTime = time;
      qteInitialized = true;
    },
    updateCinema(time, camera) {
      camera.up.set(0, 1, 0);
      floorTexture.offset.y = 0;
      wallTexture.offset.x = 0;
      if (time < 4.6) {
        cinemaStation.visible = false;
        cinemaTrench.visible = true;
        cinemaFighter.visible = true;
        cinemaFighter.scale.setScalar(0.8);
        const attackTime = Math.min(time, 2);
        const launchZ = qteInitialized ? lastQtePosition.z : 80;
        cinemaFighter.position.set((qteInitialized ? lastQtePosition.x : 0) * Math.max(0, 1 - time) - (time > 2 ? ((time - 2) ** 2) * 30 : 0), 15 + Math.max(0, time - 2) ** 2 * 18, launchZ - attackTime * ((launchZ + 140) / 2));
        cinemaFighter.rotation.set(0, 0, (qteInitialized ? lastQteRotation.z * Math.max(0, 1 - time) : 0) + Math.max(0, time - 2) * 0.6);
        for (const torpedo of torpedoes) {
          torpedo.visible = time >= 1.85;
          const p = Math.min(Math.max((time - 1.85) / 2.75, 0), 1);
          const side = torpedo.userData.side;
          if (p < 0.75) {
            torpedo.position.set(side * 2.2, 11, -120 - p / 0.75 * 204);
            torpedo.rotation.x = 0;
          } else {
            const drop = (p - 0.75) / 0.25;
            torpedo.position.set(side * 2.2 * (1 - drop), 11 - drop * drop * 47, -324 - Math.sin(drop * Math.PI / 2) * 6);
            torpedo.rotation.x = -drop * Math.PI / 2;
          }
        }
        if (time < 2) {
          camera.position.set(12, 24, cinemaFighter.position.z + 43);
          camera.lookAt(0, 12, cinemaFighter.position.z - 85);
        } else {
          const p = Math.min(Math.max((time - 1.85) / 2.75, 0), 1);
          const torpedoZ = torpedoes[0].position.z;
          camera.position.set(12 + Math.max(0, p - 0.65) * 35, 25 + Math.max(0, p - 0.65) * 55, torpedoZ + 42);
          camera.lookAt(0, 0, -330);
        }
      } else {
        torpedoes.forEach(torpedo => { torpedo.visible = false; });
        cinemaTrench.visible = false;
        vent.visible = false;
        const p = Math.min((time - 4.6) / 3.4, 1);
        cinemaStation.visible = p < 0.09;
        const fireRadius = 40 + p * 530;
        blast.scale.setScalar(fireRadius);
        billows.visible = true;
        billows.scale.setScalar(fireRadius * 1.15);
        billows.rotation.z = (time - 4.6) * 0.06;
        fireMaterial.uniforms.time.value = time - 4.6;
        fireMaterial.uniforms.alpha.value = Math.max(0, 1 - Math.max(0, p - 0.5) / 0.5);
        blastHalo.scale.setScalar(350 + p * 1700);
        blastHalo.material.opacity = Math.max(0, 0.9 - p * 0.9);
        flashCore.scale.setScalar(180 + p * 900);
        flashCore.material.opacity = Math.max(0, 1 - p * 1.4);
        const shockTime = time - 4.6;
        shockwave.scale.setScalar(25 + shockTime * 550);
        shockwave.material.opacity = Math.max(0, 0.8 - shockTime * 0.09);
        cinemaFighter.visible = time >= 7.5;
        if (time < 7.5) {
          camera.position.set(90, 110, 250 + p * 500);
          camera.lookAt(0, 0, -650);
        } else {
          const escape = time - 7.5;
          cinemaFighter.position.set(-40 + escape * 16, 30 + escape * 7, 80 + escape * 140);
          cinemaFighter.rotation.set(-0.05, Math.PI, 0.12);
          cinemaFighter.scale.setScalar(1.8);
          camera.position.copy(cinemaFighter.position).add(new THREE.Vector3(35, 15, 80));
          camera.lookAt(cinemaFighter.position.clone().add(new THREE.Vector3(-15, -4, -35)));
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hoth.dispose();
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      scene.traverse(object => {
        object.userData.disposed = true;
        if (object.geometry) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
          if (!material) continue;
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const root of engineRoots) if (root.userData.disposed) engineRoots.delete(root);
    },
  };
}

export function createTurret(kind = 'light') {
  const root = new THREE.Group();
  const head = new THREE.Group();
  if (kind === 'relay') {
    box(root, dark, 0, 0, 0, 28, 9, 28);
    box(root, silver, 0, 6, 0, 21, 4, 21);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0x284a5c, emissive: 0x1d7198, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5 }));
    coil.position.y = 21;
    root.add(coil);
    for (let level = 0; level < 5; level++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.6, 5, 20), silver);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 11 + level * 5;
      root.add(ring);
    }
    for (const x of [-9, 9]) for (const z of [-9, 9]) box(root, silver, x, 21, z, 2.2, 30, 2.2);
    box(root, dark, 0, 37, 0, 24, 5, 24);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xedbb66, toneMapped: false }));
    beacon.position.y = 41;
    root.add(beacon);
  } else {
    const heavy = kind === 'heavy';
    box(root, dark, 0, 0, 0, heavy ? 35 : 20, heavy ? 15 : 10, heavy ? 35 : 20);
    if (heavy) {
      box(root, silver, 0, 9, 0, 29, 5, 29);
      for (const side of [-1, 1]) box(root, silver, side * 16, -1, 0, 3, 12, 29);
    }
    head.position.y = heavy ? 17 : 8;
    box(head, silver, 0, 0, 0, heavy ? 25 : 16, heavy ? 14 : 10, heavy ? 22 : 14);
    for (const side of [-1, 1]) {
      cylinder(head, dark, heavy ? 1.8 : 1.2, heavy ? 38 : 26, side * (heavy ? 7 : 4), heavy ? 4 : 3, heavy ? -24 : -16);
      if (heavy) {
        cylinder(head, silver, 2.7, 9, side * 7, 4, -10);
        box(head, dark, side * 13, 0, 3, 4, 10, 13);
      }
    }
  }
  root.add(head);
  root.userData.head = head;
  root.userData.kind = kind;
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return root;
}

/**
 * Imperial snow walker: squat hull, sloped cockpit, twin chin blasters and two
 * reverse-jointed legs. The model faces local -Z, like every other ship here,
 * and its feet rest on y = 0.
 */
export function createAtSt() {
  const root = new THREE.Group();
  const head = new THREE.Group();
  const visor = new THREE.MeshStandardMaterial({ color: 0x8f2418, emissive: 0xc03a22, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.2 });
  const engineGlow = new THREE.MeshStandardMaterial({ color: 0x3d4c52, emissive: 0x6fd0ff, emissiveIntensity: 0.55, roughness: 0.6 });

  // Hull: armoured slab, sloped roof and the engine deck at the rear (+Z).
  box(root, dark, 0, 9.2, 0, 7, 3.2, 8);
  box(root, silver, 0, 11.1, 0.4, 6, 1.2, 6.4);
  box(root, dark, 0, 7.7, 0.2, 5.2, 1, 6.6);
  box(root, silver, 0, 9.7, 4.1, 4.6, 2.2, 2);
  for (const x of [-1.4, 0, 1.4]) box(root, engineGlow, x, 9.8, 5.12, 0.7, 1.1, 0.12);
  for (const side of [-1, 1]) {
    box(root, silver, side * 4, 9.3, -0.4, 1.5, 2, 4.4);
    box(root, dark, side * 4, 10.3, -2.2, 1.1, 0.7, 1.6);
  }

  // Cockpit: forward is local -Z, with the red viewport slit and chin guns.
  head.position.set(0, 10.1, -3);
  box(head, silver, 0, 0, 0, 5.2, 2.6, 4.2);
  box(head, dark, 0, 1.35, 0.4, 4.4, 0.7, 3.2);
  box(head, visor, 0, 0.35, -2.14, 4, 0.85, 0.3);
  box(head, dark, 0, -1.05, -1.3, 1.1, 0.9, 2.4);
  for (const side of [-1, 1]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 8), dark);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(side * 1.25, -0.75, -2.7);
    head.add(gun);
    box(head, silver, side * 1.9, -0.15, -0.6, 0.5, 1.1, 2.2);
  }
  box(head, silver, 1.9, 2.05, 0.5, 0.12, 2.2, 0.12);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 3.1, 7.4, 0);
    box(hip, silver, 0, -0.1, 0, 1.8, 1.4, 2.2);
    box(hip, silver, side * 0.2, -1.9, 0, 1.5, 3.6, 1.7);
    const knee = new THREE.Group();
    knee.position.set(side * 0.2, -3.8, 0);
    box(knee, dark, 0, -0.1, 0, 1.9, 1.3, 1.9);
    box(knee, silver, 0, -1.5, -0.2, 1.2, 3, 1.3);
    const foot = new THREE.Group();
    foot.position.set(0, -3, -0.5);
    box(foot, dark, 0, -0.15, -0.3, 2.6, 0.7, 3.4);
    box(foot, silver, 0, -0.5, -0.1, 3, 0.35, 4);
    for (const toe of [-0.9, 0, 0.9]) box(foot, dark, toe, -0.25, -2, 0.5, 0.45, 1.2);
    knee.add(foot);
    hip.add(knee);
    root.add(hip);
    legs.push({ hip, knee, foot });
  }
  root.add(head);
  root.userData.head = head;
  root.userData.legs = legs;
  root.userData.kind = 'at-st';
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return root;
}

export function createCockpit() {
  const group = new THREE.Group();
  const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x18212c, roughness: 0.6, metalness: 0.65 });
  box(group, cockpitMat, 0, -0.72, -1.6, 3.4, 0.6, 1.3);
  box(group, dark, 0, -0.37, -1.35, 0.8, 0.18, 0.5);
  const instrumentCanvas = document.createElement('canvas');
  instrumentCanvas.width = 512;
  instrumentCanvas.height = 256;
  const display = instrumentCanvas.getContext('2d');
  display.fillStyle = '#051114';
  display.fillRect(0, 0, 512, 256);
  display.strokeStyle = '#163e43';
  display.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) { display.beginPath(); display.moveTo(x, 0); display.lineTo(x, 256); display.stroke(); }
  for (let y = 0; y < 256; y += 32) { display.beginPath(); display.moveTo(0, y); display.lineTo(512, y); display.stroke(); }
  display.strokeStyle = '#73b7ad';
  display.lineWidth = 2;
  for (const radius of [32, 64, 94]) { display.beginPath(); display.arc(256, 130, radius, 0, Math.PI * 2); display.stroke(); }
  display.beginPath(); display.moveTo(145, 130); display.lineTo(367, 130); display.moveTo(256, 25); display.lineTo(256, 235); display.stroke();
  display.strokeStyle = '#edbb66';
  display.beginPath(); display.moveTo(256, 115); display.lineTo(247, 143); display.lineTo(256, 137); display.lineTo(265, 143); display.closePath(); display.stroke();
  display.fillStyle = '#edbb66';
  for (const [x, y] of [[225, 67], [293, 97], [323, 173]]) display.fillRect(x, y, 5, 5);
  display.font = '16px monospace';
  display.fillText('T-65 / NAV', 16, 23);
  display.fillText('SYS OK', 425, 23);
  display.fillStyle = '#80b9b5';
  display.font = '12px monospace';
  for (let i = 0; i < 6; i++) {
    display.fillRect(18, 72 + i * 23, 72 - i * 4, 8);
    display.fillText(String(98 - i * 7), 105, 80 + i * 23);
    display.fillRect(405, 72 + i * 23, 80 - (i % 3) * 12, 8);
  }
  const instrumentTexture = new THREE.CanvasTexture(instrumentCanvas);
  instrumentTexture.colorSpace = THREE.SRGBColorSpace;
  const instrumentMaterial = new THREE.MeshBasicMaterial({ map: instrumentTexture, toneMapped: false, fog: false });
  const instrument = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.29), instrumentMaterial);
  instrument.position.set(0, -0.26, -1.2);
  instrument.rotation.x = -0.18;
  group.add(instrument);
  for (const side of [-1, 1]) {
    box(group, dark, side * 0.83, -0.44, -1.3, 0.54, 0.25, 0.18);
    const sideScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), instrumentMaterial);
    sideScreen.position.set(side * 0.83, -0.4, -1.19);
    sideScreen.rotation.set(-0.18, side * -0.15, 0);
    group.add(sideScreen);
  }
  for (const side of [-1, 1]) {
    const strut = box(group, cockpitMat, side * 1.55, 0.1, -1.2, 0.11, 3.5, 0.11);
    strut.rotation.z = side * -0.28;
    box(group, cockpitMat, side * 1.75, -0.45, 0, 0.2, 0.25, 5);
    for (let i = 0; i < 5; i++) box(group, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xdcaa59 : 0x82c0d1 }), side * (0.8 + i * 0.12), -0.36, -1.15, 0.055, 0.025, 0.1);
  }
  box(group, cockpitMat, 0, 1.65, -1.15, 3, 0.1, 0.12);
  return createDetailedCockpit(group);
}
