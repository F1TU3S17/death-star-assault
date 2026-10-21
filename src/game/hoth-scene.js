import * as THREE from 'three';

/**
 * Procedural Hoth surface for Episode V.
 *
 * Everything in this module is generated from Three.js primitives: no external
 * model is downloaded, so the scene ships with zero bytes of licensed art
 * (see docs/EPISODE-V-HOTH.md section 6).
 *
 * The module exports two things:
 *
 * - {@link createAtAtMesh} builds the procedural AT-AT walker with separately
 *   addressable legs (`hip` -> `thigh` -> `knee` -> `shin` -> `foot`).
 * - {@link createHothScene} assembles the whole surface (snow field, ice
 *   ridges, Echo Base, Rebel transports, snowfall, AT-AT) and returns a small
 *   controller used by the engine.
 */

/** Phases that switch the Hoth scene look. */
export const HOTH_PHASES = Object.freeze([
  'hoth-arrival',
  'hoth-assault',
  'hoth-atat',
  'hoth-tow',
  'hoth-fall',
  'hoth-evacuation',
  'victory',
]);

const LAUNCH_INTERVAL = 2.5;
const LAUNCH_DURATION = 8;
const MAX_STEP = 0.1;
const TERRAIN_SIZE = 3000;
const TERRAIN_SEGMENTS = 100;
const SNOW_WIDTH = 320;
const SNOW_HEIGHT = 150;
const ROCK_RADIUS_MIN = 600;
const ROCK_RADIUS_MAX = 1400;
const SKY_RADIUS = 6000;
/**
 * Layout anchors shared with the engine: the player enters the surface at
 * z = +950 and flies towards -Z, the shield generator is the mission landmark
 * at (0, 16, -640) and the landing pad sits in front of it.
 */
const BASE_Z = -640;
const PAD_Z = -520;
const PAD_POSITION = new THREE.Vector3(0, 0, PAD_Z);
const AT_AT_SPAWN = new THREE.Vector3(90, 0, 120);

/** Per-phase weather and visibility targets. */
const PHASE_LOOK = {
  'hoth-arrival': { fog: 0.00052, light: 1.5, hemi: 0.5, ambient: 0.2, snow: 0.85, shield: 1, atAt: false, fall: 0 },
  'hoth-assault': { fog: 0.00095, light: 1.15, hemi: 0.42, ambient: 0.17, snow: 1.45, shield: 0.7, atAt: false, fall: 0 },
  'hoth-atat': { fog: 0.00082, light: 1, hemi: 0.4, ambient: 0.16, snow: 1.15, shield: 0.6, atAt: true, fall: 0 },
  'hoth-tow': { fog: 0.00072, light: 0.95, hemi: 0.38, ambient: 0.15, snow: 1, shield: 0.55, atAt: true, fall: 0 },
  'hoth-fall': { fog: 0.00135, light: 0.6, hemi: 0.3, ambient: 0.12, snow: 1.9, shield: 0, atAt: true, fall: 1 },
  'hoth-evacuation': { fog: 0.0006, light: 1.3, hemi: 0.46, ambient: 0.19, snow: 0.8, shield: 0, atAt: false, fall: 0 },
  'victory': { fog: 0.00055, light: 1.25, hemi: 0.44, ambient: 0.18, snow: 0.6, shield: 0, atAt: false, fall: 0 },
};

const DEFAULT_LOOK = PHASE_LOOK['hoth-arrival'];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth 0..1 ramp used for staged launch animation. */
function ramp(value, from, to) {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashNoise(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const bottom = lerp(hashNoise(x0, y0, seed), hashNoise(x0, y0 + 1, seed), sx);
  const top = lerp(hashNoise(x0 + 1, y0, seed), hashNoise(x0 + 1, y0 + 1, seed), sx);
  return lerp(bottom, top, sy);
}

/** Fractal value noise in the 0..1 range. */
function fbm(x, y, seed, octaves = 3) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    value += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 101);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total;
}

/**
 * Height of the procedural snow field at world (x, z).
 *
 * The engine shares this function so walkers, turrets and props stand on the
 * same dunes the mesh is built from instead of floating above or sinking
 * below the surface. The plain is flat around Echo Base.
 */
export function hothTerrainHeight(x, z, seed = 20261021) {
  const dunes = fbm(x * 0.0016, z * 0.0016, seed, 3) - 0.5;
  const ridges = Math.abs(fbm(x * 0.0041 + 31, z * 0.0041 - 17, seed + 7, 2) - 0.5) * 2;
  const plateau = THREE.MathUtils.smoothstep(Math.hypot(x, z - BASE_Z), 150, 430);
  return (dunes * 6.5 + ridges * 1.6) * plateau;
}

/**
 * Merge a list of primitive parts into one non-indexed BufferGeometry.
 * Parts are described as `{ geometry, position, rotation, scale }`.
 */
function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const vertex = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (const part of parts) {
    const source = part.geometry;
    const geometry = source.index ? source.toNonIndexed() : source;
    euler.set(0, 0, 0);
    if (part.rotation) euler.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    quaternion.setFromEuler(euler);
    scale.set(1, 1, 1);
    if (part.scale) scale.set(part.scale[0], part.scale[1], part.scale[2]);
    matrix.compose(
      new THREE.Vector3(
        part.position ? part.position[0] : 0,
        part.position ? part.position[1] : 0,
        part.position ? part.position[2] : 0,
      ),
      quaternion,
      scale,
    );
    normalMatrix.getNormalMatrix(matrix);
    const sourcePosition = geometry.attributes.position;
    const sourceNormal = geometry.attributes.normal;
    const sourceUv = geometry.attributes.uv;
    for (let index = 0; index < sourcePosition.count; index++) {
      vertex.fromBufferAttribute(sourcePosition, index).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      if (sourceNormal) {
        vertex.fromBufferAttribute(sourceNormal, index).applyMatrix3(normalMatrix).normalize();
        normals.push(vertex.x, vertex.y, vertex.z);
      } else {
        normals.push(0, 1, 0);
      }
      if (sourceUv) uvs.push(sourceUv.getX(index), sourceUv.getY(index));
      else uvs.push(0, 0);
    }
    if (geometry !== source) geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

function rectangleShape(width, height) {
  const shape = new THREE.Shape();
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight);
  shape.lineTo(halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.closePath();
  return shape;
}

/**
 * Box with chamfered edges. Width spans X, height spans Y, depth spans Z.
 * The chamfer is produced by the extrude bevel, so no textures are needed:
 * the bevelled cap faces are inset by `bevel` against the full sized body.
 */
function chamferedSlab(width, height, depth, bevel = 0.24) {
  const safeBevel = Math.min(bevel, width / 3, height / 3, depth / 3);
  const geometry = new THREE.ExtrudeGeometry(rectangleShape(width, height), {
    depth: Math.max(0.02, depth - safeBevel * 2),
    bevelEnabled: true,
    bevelSize: safeBevel,
    bevelThickness: safeBevel,
    bevelOffset: -safeBevel,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

/** Dispose every geometry, material and texture reachable from a root object. */
function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/** Soft round sprite for the snowfall. Returns null outside a browser. */
function radialSpriteTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Procedural AT-AT walker.
 *
 * The walker is one group with four independently animated legs. Every leg is a
 * chain of pivoted nodes: `hip` -> `thigh` -> `knee` -> `shin` -> `foot`, and
 * every joint pivots at its top so a two bone IK solver can drive it by
 * writing `hip.rotation.x` and `knee.rotation.x` only.
 *
 * The hull faces local -Z, matching the convention of the rest of the project
 * (the player's ship flies towards -Z).
 *
 * @returns {THREE.Group} Walker with `userData.legs`, `userData.head` and
 *   `userData.body` populated.
 */
export function createAtAtMesh() {
  const group = new THREE.Group();
  group.name = 'at_at';

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x6b6f76, roughness: 0.55, metalness: 0.25 });
  const armorMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.45, metalness: 0.35 });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xa31212,
    roughness: 0.6,
    metalness: 0.2,
    emissive: 0x2c0505,
    emissiveIntensity: 1.1,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a44, toneMapped: false });

  // The body node keeps its origin on the ground so the engine can drive the
  // walk sway by writing `body.position.y` and `body.rotation.z` directly.
  const body = new THREE.Group();
  body.name = 'body';
  group.add(body);

  const hull = new THREE.Group();
  hull.name = 'hull';
  hull.position.set(0, 9.8, 0);
  body.add(hull);

  const hullParts = [
    { geometry: chamferedSlab(8, 4, 14, 0.45), position: [0, 0, 0] },
    { geometry: chamferedSlab(6.2, 1.4, 7.6, 0.3), position: [0, 2.6, 0.6] },
    { geometry: chamferedSlab(6.6, 1, 4.2, 0.22), position: [0, 3.5, 1.4] },
  ];
  const armorParts = [
    { geometry: chamferedSlab(7.6, 3.6, 1, 0.24), position: [0, 0.2, -7], rotation: [-0.34, 0, 0] },
    { geometry: chamferedSlab(7.6, 3.6, 1, 0.24), position: [0, 0.2, 7], rotation: [0.3, 0, 0] },
    { geometry: chamferedSlab(1, 3.4, 10.4, 0.2), position: [4.05, 0.1, 0], rotation: [0, 0, -0.26] },
    { geometry: chamferedSlab(1, 3.4, 10.4, 0.2), position: [-4.05, 0.1, 0], rotation: [0, 0, 0.26] },
    { geometry: chamferedSlab(6.6, 1.2, 11, 0.2), position: [0, -2.2, 0] },
  ];
  const accentParts = [
    { geometry: chamferedSlab(8.3, 0.5, 1.4, 0.1), position: [0, 1.3, 2.6] },
    { geometry: chamferedSlab(8.3, 0.5, 1.4, 0.1), position: [0, 1.3, -2.6] },
    { geometry: chamferedSlab(6.5, 0.35, 1.1, 0.08), position: [0, 3.3, 1.4] },
  ];
  const glowParts = [
    { geometry: new THREE.BoxGeometry(0.22, 0.22, 9), position: [3.35, 1.7, 0] },
    { geometry: new THREE.BoxGeometry(0.22, 0.22, 9), position: [-3.35, 1.7, 0] },
  ];

  hull.add(new THREE.Mesh(mergeParts(hullParts), hullMaterial));
  hull.add(new THREE.Mesh(mergeParts(armorParts), armorMaterial));
  hull.add(new THREE.Mesh(mergeParts(accentParts), accentMaterial));
  hull.add(new THREE.Mesh(mergeParts(glowParts), glowMaterial));

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 10.9, -6.3);
  body.add(head);

  const headHull = [
    { geometry: chamferedSlab(3.4, 2.8, 3.4, 0.3), position: [0, 0.5, -0.5] },
    { geometry: new THREE.CylinderGeometry(1.2, 1.2, 1.8, 10), position: [0, -0.7, 0.7] },
  ];
  const headArmor = [
    { geometry: chamferedSlab(2.4, 1.6, 0.6, 0.12), position: [0, 1.4, -0.2] },
    { geometry: new THREE.CylinderGeometry(0.18, 0.18, 3.4, 8), position: [0.62, 0.35, -2.6], rotation: [Math.PI / 2, 0, 0] },
    { geometry: new THREE.CylinderGeometry(0.18, 0.18, 3.4, 8), position: [-0.62, 0.35, -2.6], rotation: [Math.PI / 2, 0, 0] },
  ];
  const headAccent = [
    { geometry: chamferedSlab(3.5, 0.4, 2.2, 0.08), position: [0, 1.9, -0.5] },
  ];
  const headGlow = [
    { geometry: new THREE.BoxGeometry(2.2, 0.32, 0.2), position: [0, 0.7, -2.28] },
    { geometry: new THREE.CircleGeometry(0.3, 12), position: [0.62, 0.35, -4.32], rotation: [0, Math.PI, 0] },
    { geometry: new THREE.CircleGeometry(0.3, 12), position: [-0.62, 0.35, -4.32], rotation: [0, Math.PI, 0] },
  ];

  head.add(new THREE.Mesh(mergeParts(headHull), hullMaterial));
  head.add(new THREE.Mesh(mergeParts(headArmor), armorMaterial));
  head.add(new THREE.Mesh(mergeParts(headAccent), accentMaterial));
  head.add(new THREE.Mesh(mergeParts(headGlow), glowMaterial));

  const legDefinitions = [
    { id: 'fl', x: -3.3, z: -4.6 },
    { id: 'fr', x: 3.3, z: -4.6 },
    { id: 'bl', x: -3.3, z: 4.6 },
    { id: 'br', x: 3.3, z: 4.6 },
  ];
  const legs = [];
  for (const definition of legDefinitions) {
    const leg = new THREE.Group();
    leg.name = `leg_${definition.id}`;
    leg.position.set(definition.x, 0, definition.z);
    group.add(leg);

    const hip = new THREE.Group();
    hip.name = 'hip';
    hip.position.set(0, 7.8, 0);
    leg.add(hip);

    const thigh = new THREE.Group();
    thigh.name = 'thigh';
    hip.add(thigh);
    thigh.add(new THREE.Mesh(mergeParts([
      { geometry: chamferedSlab(1.2, 3.4, 1.2, 0.16), position: [0, -1.7, 0] },
      { geometry: new THREE.SphereGeometry(0.72, 10, 8), position: [0, 0, 0] },
    ]), hullMaterial));

    const knee = new THREE.Group();
    knee.name = 'knee';
    knee.position.set(0, -3.4, 0);
    thigh.add(knee);

    const shin = new THREE.Group();
    shin.name = 'shin';
    knee.add(shin);
    shin.add(new THREE.Mesh(mergeParts([
      { geometry: chamferedSlab(0.95, 3.6, 0.95, 0.14), position: [0, -1.8, 0] },
    ]), armorMaterial));

    const foot = new THREE.Group();
    foot.name = 'foot';
    foot.position.set(0, -3.6, 0);
    shin.add(foot);
    foot.add(new THREE.Mesh(mergeParts([
      { geometry: chamferedSlab(2.4, 0.8, 2.9, 0.16), position: [0, -0.4, 0.2] },
    ]), hullMaterial));
    foot.add(new THREE.Mesh(mergeParts([
      { geometry: new THREE.ConeGeometry(0.3, 1.05, 6), position: [-0.72, -0.35, -1.55], rotation: [-1.25, 0, 0] },
      { geometry: new THREE.ConeGeometry(0.3, 1.05, 6), position: [0, -0.35, -1.6], rotation: [-1.25, 0, 0] },
      { geometry: new THREE.ConeGeometry(0.3, 1.05, 6), position: [0.72, -0.35, -1.55], rotation: [-1.25, 0, 0] },
    ]), accentMaterial));

    const anchor = new THREE.Object3D();
    anchor.name = 'anchor';
    anchor.position.set(0, -1.2, 0);
    foot.add(anchor);

    legs.push({ id: definition.id, group: leg, hip, thigh, knee, shin, foot, anchor });
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0x2a3b52, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.name = 'contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  shadow.scale.set(1.5, 1, 1);
  group.add(shadow);

  const fallLight = new THREE.PointLight(0xff7a3c, 0, 320, 1.7);
  fallLight.name = 'fall-light';
  fallLight.position.set(0, 12, 0);
  fallLight.visible = false;
  group.add(fallLight);

  group.userData.legs = legs;
  group.userData.head = head;
  group.userData.body = body;
  group.userData.legAnchor = legs[0].anchor;
  group.userData.fallLight = fallLight;
  group.userData.materials = [hullMaterial, armorMaterial, accentMaterial, glowMaterial];
  group.userData.gaitPhases = { fl: 0, fr: Math.PI, bl: Math.PI * 1.5, br: Math.PI * 0.5 };
  group.userData.facing = '-z';
  group.userData.dispose = () => disposeObject3D(group);
  return group;
}

function createTransport(index) {
  const group = new THREE.Group();
  group.name = `transport-${index + 1}`;

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x8d959d, roughness: 0.62, metalness: 0.42 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xc0563a, roughness: 0.6, metalness: 0.2 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a4a, toneMapped: false });

  const bodyParts = [
    { geometry: chamferedSlab(6.2, 4.6, 16, 0.7), position: [0, 3.2, 0] },
    { geometry: new THREE.CylinderGeometry(2.3, 2.3, 2.6, 10), position: [0, 3.2, -8.6], rotation: [Math.PI / 2, 0, 0], scale: [1.35, 1, 1] },
    { geometry: new THREE.CylinderGeometry(2.3, 2.3, 2.2, 10), position: [0, 3.2, 8.5], rotation: [Math.PI / 2, 0, 0], scale: [1.35, 1, 1] },
    { geometry: chamferedSlab(1.6, 0.7, 6.4, 0.2), position: [4.6, 3.2, 1.4] },
    { geometry: chamferedSlab(1.6, 0.7, 6.4, 0.2), position: [-4.6, 3.2, 1.4] },
    { geometry: chamferedSlab(1.4, 0.6, 4.4, 0.18), position: [4.4, 3.2, -4.2] },
    { geometry: chamferedSlab(1.4, 0.6, 4.4, 0.18), position: [-4.4, 3.2, -4.2] },
  ];
  const engineParts = [];
  for (const x of [-2.3, 2.3]) {
    for (const z of [-5.2, 4.6]) {
      bodyParts.push({ geometry: new THREE.CylinderGeometry(0.95, 0.95, 4.6, 10), position: [x, 3.2, z], rotation: [Math.PI / 2, 0, 0] });
      engineParts.push({ geometry: new THREE.CircleGeometry(0.82, 12), position: [x, 3.2, z + 2.35] });
    }
  }
  for (const x of [-2.4, 2.4]) {
    for (const z of [-5.4, 5]) {
      bodyParts.push({ geometry: new THREE.CylinderGeometry(0.28, 0.34, 1.6, 6), position: [x, 0.8, z] });
    }
  }
  bodyParts.push({ geometry: chamferedSlab(3.6, 0.4, 4.4, 0.12), position: [0, 1.2, 8.6], rotation: [0.34, 0, 0] });

  const accentParts = [
    { geometry: chamferedSlab(6.4, 0.45, 1.2, 0.1), position: [0, 5.2, 1.6] },
    { geometry: chamferedSlab(6.4, 0.45, 1.2, 0.1), position: [0, 5.2, -1.6] },
    { geometry: chamferedSlab(1.7, 0.8, 4.2, 0.12), position: [4.6, 3.2, 1.4] },
    { geometry: chamferedSlab(1.7, 0.8, 4.2, 0.12), position: [-4.6, 3.2, 1.4] },
  ];

  group.add(new THREE.Mesh(mergeParts(bodyParts), bodyMaterial));
  group.add(new THREE.Mesh(mergeParts(accentParts), accentMaterial));
  group.add(new THREE.Mesh(mergeParts(engineParts), glowMaterial));
  group.userData.glowMaterial = glowMaterial;
  return group;
}

/**
 * Build the full procedural Hoth scene inside an existing Three.js scene.
 *
 * @param {THREE.Scene} scene Scene that receives the Hoth content.
 * @param {object} [options]
 * @param {number} [options.seed=20261021] Seed for every random placement.
 * @param {boolean} [options.autoLaunch=false] Let the scene launch the
 *   transports on its own (2.5 s apart) once the evacuation phase starts.
 *   Without it the caller drives departures through `launchTransport(id)`.
 * @param {number} [options.transportCount=4] Number of parked transports.
 * @param {number} [options.snowCount=1200] Snow particles.
 * @param {number} [options.rockCount=15] Ice ridge instances.
 * @param {boolean} [options.dimExistingLights=true] Scale down the lights that
 *   were already in the scene (the engine key light is warm) while a Hoth phase
 *   is on screen. The original values are restored for every other phase, so
 *   Episode IV keeps its own lighting.
 * @returns {object} Scene controller.
 */
export function createHothScene(scene, options = {}) {
  const {
    seed = 20261021,
    autoLaunch = false,
    transportCount = 4,
    snowCount = 1200,
    rockCount = 15,
    dimExistingLights = true,
  } = options;

  let disposed = false;
  let currentPhase = 'hoth-arrival';
  let clock = 0;
  let atAtCabled = false;
  let autoLaunchActive = false;
  let autoLaunchTimer = 0;

  const random = seededRandom(seed);
  const root = new THREE.Group();
  root.name = 'hoth-scene';
  root.userData.kind = 'hoth-scene';
  scene.add(root);

  const previousFog = scene.fog;
  const hothFog = new THREE.FogExp2(0x9db4d2, PHASE_LOOK['hoth-arrival'].fog);

  const overriddenLights = [];
  if (dimExistingLights) {
    scene.traverse(object => {
      if (!object.isLight) return;
      overriddenLights.push({ light: object, intensity: object.intensity, color: object.color.clone() });
    });
  }

  /**
   * The engine lights a warm key light for Yavin. While Hoth is on screen the
   * warm key is scaled down so the cold star light of this scene leads, and
   * the original values come back the moment the phase leaves Hoth.
   */
  function applyExistingLights(active) {
    for (const entry of overriddenLights) {
      if (active) {
        entry.light.intensity = entry.intensity * 0.35;
      } else {
        entry.light.intensity = entry.intensity;
        entry.light.color.copy(entry.color);
      }
    }
  }

  // --- lighting rig -------------------------------------------------------
  const starLight = new THREE.DirectionalLight(0xcfe0ff, 1.5);
  starLight.name = 'hoth-star-light';
  starLight.position.set(-900, 1200, 620);
  starLight.target.position.set(0, 0, 0);
  starLight.userData.hothLight = true;
  root.add(starLight, starLight.target);

  const skyFill = new THREE.HemisphereLight(0x7f9ccc, 0x9fb2c9, 0.6);
  skyFill.name = 'hoth-sky-fill';
  skyFill.userData.hothLight = true;
  root.add(skyFill);

  const bounce = new THREE.AmbientLight(0x232c3a, 0.24);
  bounce.name = 'hoth-bounce';
  bounce.userData.hothLight = true;
  root.add(bounce);

  // --- snow field ---------------------------------------------------------
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0x93a9c4, roughness: 0.78, metalness: 0.06 });
  const terrainGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.attributes.position;
  for (let index = 0; index < terrainPositions.count; index++) {
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index);
    terrainPositions.setY(index, hothTerrainHeight(x, z, seed));
  }
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, snowMaterial);
  terrain.name = 'snow-field';
  terrain.receiveShadow = true;
  root.add(terrain);

  // A wide plain under the dunes hides the border of the detailed field.
  const horizonPlain = new THREE.Mesh(
    new THREE.CircleGeometry(9000, 48),
    new THREE.MeshStandardMaterial({ color: 0x8496ad, roughness: 0.82, metalness: 0.05 }),
  );
  horizonPlain.name = 'horizon-plain';
  horizonPlain.rotation.x = -Math.PI / 2;
  horizonPlain.position.y = -1.4;
  root.add(horizonPlain);

  // --- ice ridges ---------------------------------------------------------
  const rockGeometry = new THREE.IcosahedronGeometry(1, 1);
  const rockPositions = rockGeometry.attributes.position;
  const rockVertex = new THREE.Vector3();
  for (let index = 0; index < rockPositions.count; index++) {
    rockVertex.fromBufferAttribute(rockPositions, index);
    const displacement = (fbm(rockVertex.x * 2.1 + 9, rockVertex.z * 2.1 + rockVertex.y * 1.4, seed + 41, 2) - 0.5) * 0.8;
    rockVertex.multiplyScalar(1 + displacement);
    rockVertex.y *= 1.4;
    rockPositions.setXYZ(index, rockVertex.x, rockVertex.y, rockVertex.z);
  }
  rockGeometry.computeVertexNormals();
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7f93ac, roughness: 0.45, metalness: 0.05, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, Math.max(1, rockCount));
  const rockDummy = new THREE.Object3D();
  const rockTint = new THREE.Color();
  for (let index = 0; index < rocks.count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = ROCK_RADIUS_MIN + random() * (ROCK_RADIUS_MAX - ROCK_RADIUS_MIN);
    const scale = 14 + random() * 46;
    rockDummy.position.set(Math.cos(angle) * radius, -scale * 0.22, Math.sin(angle) * radius);
    rockDummy.rotation.set(random() * 0.4, random() * Math.PI * 2, random() * 0.4);
    rockDummy.scale.set(scale * (0.7 + random() * 0.6), scale, scale * (0.7 + random() * 0.6));
    rockDummy.updateMatrix();
    rocks.setMatrixAt(index, rockDummy.matrix);
    rocks.setColorAt(index, rockTint.setRGB(0.86 + random() * 0.22, 0.9 + random() * 0.16, 1));
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.computeBoundingSphere();
  rocks.name = 'ice-ridges';
  root.add(rocks);

  // --- night sky ----------------------------------------------------------
  const skyGroup = new THREE.Group();
  skyGroup.name = 'hoth-sky';
  root.add(skyGroup);
  const skyGeometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16);
  const skyColors = new Float32Array(skyGeometry.attributes.position.count * 3);
  const skyZenith = new THREE.Color(0x050a18);
  const skyHorizon = new THREE.Color(0x2c4468);
  const skyGround = new THREE.Color(0x0a1120);
  const skyColor = new THREE.Color();
  for (let index = 0; index < skyGeometry.attributes.position.count; index++) {
    const elevation = skyGeometry.attributes.position.getY(index) / SKY_RADIUS;
    if (elevation >= 0) skyColor.copy(skyZenith).lerp(skyHorizon, Math.pow(elevation, 0.55));
    else skyColor.copy(skyHorizon).lerp(skyGround, Math.min(1, -elevation * 2.4));
    skyColors[index * 3] = skyColor.r;
    skyColors[index * 3 + 1] = skyColor.g;
    skyColors[index * 3 + 2] = skyColor.b;
  }
  skyGeometry.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
  }));
  sky.name = 'hoth-sky-dome';
  skyGroup.add(sky);

  const starCount = 700;
  const starPositions = new Float32Array(starCount * 3);
  for (let index = 0; index < starCount; index++) {
    const u = random() * Math.PI * 2;
    const v = Math.acos(2 * random() - 1);
    const radius = SKY_RADIUS * (0.72 + random() * 0.16);
    starPositions[index * 3] = radius * Math.sin(v) * Math.cos(u);
    starPositions[index * 3 + 1] = radius * Math.cos(v);
    starPositions[index * 3 + 2] = radius * Math.sin(v) * Math.sin(u);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: 0xd6e4ff,
    size: 1.6,
    sizeAttenuation: false,
    fog: false,
    toneMapped: false,
  }));
  stars.name = 'hoth-stars';
  skyGroup.add(stars);

  // --- Echo Base ----------------------------------------------------------
  const base = new THREE.Group();
  base.name = 'echo-base';
  root.add(base);

  const structureMaterial = new THREE.MeshStandardMaterial({ color: 0x5d6672, roughness: 0.78, metalness: 0.3 });
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x39414c, roughness: 0.85, metalness: 0.22 });
  const accentBaseMaterial = new THREE.MeshStandardMaterial({ color: 0xc0563a, roughness: 0.6, metalness: 0.2 });
  const warmGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false });
  const shieldGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, toneMapped: false });
  const poolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb066,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const structureParts = [];
  const panelParts = [];
  const accentParts = [];
  const warmGlowParts = [];
  const shieldGlowParts = [];
  const poolParts = [];
  const driftParts = [];

  const hangars = [
    { x: -78, z: BASE_Z - 20, w: 46, h: 17, d: 32, rotation: 0 },
    { x: 68, z: BASE_Z - 48, w: 34, h: 13, d: 26, rotation: 0.1 },
    { x: -8, z: BASE_Z - 134, w: 30, h: 11, d: 24, rotation: -0.06 },
  ];
  for (const hangar of hangars) {
    structureParts.push({ geometry: chamferedSlab(hangar.w, hangar.h, hangar.d, 0.5), position: [hangar.x, hangar.h / 2, hangar.z], rotation: [0, hangar.rotation, 0] });
    structureParts.push({ geometry: chamferedSlab(hangar.w * 0.68, 1.6, hangar.d * 0.78, 0.3), position: [hangar.x, hangar.h + 0.8, hangar.z], rotation: [0, hangar.rotation, 0] });
    panelParts.push({ geometry: chamferedSlab(hangar.w * 0.42, hangar.h * 0.6, 0.8, 0.12), position: [hangar.x, hangar.h * 0.3, hangar.z + hangar.d / 2 - 0.2], rotation: [0, hangar.rotation, 0] });
    panelParts.push({ geometry: chamferedSlab(1, hangar.h * 0.55, hangar.d * 0.62, 0.12), position: [hangar.x + hangar.w / 2 + 0.2, hangar.h * 0.42, hangar.z] });
    panelParts.push({ geometry: chamferedSlab(1, hangar.h * 0.55, hangar.d * 0.62, 0.12), position: [hangar.x - hangar.w / 2 - 0.2, hangar.h * 0.42, hangar.z] });
    warmGlowParts.push({ geometry: new THREE.BoxGeometry(hangar.w * 0.44, 0.45, 0.5), position: [hangar.x, hangar.h * 0.63, hangar.z + hangar.d / 2 + 0.1], rotation: [0, hangar.rotation, 0] });
    warmGlowParts.push({ geometry: new THREE.BoxGeometry(0.4, hangar.h * 0.58, 0.5), position: [hangar.x + hangar.w * 0.21, hangar.h * 0.31, hangar.z + hangar.d / 2 + 0.1], rotation: [0, hangar.rotation, 0] });
    warmGlowParts.push({ geometry: new THREE.BoxGeometry(0.4, hangar.h * 0.58, 0.5), position: [hangar.x - hangar.w * 0.21, hangar.h * 0.31, hangar.z + hangar.d / 2 + 0.1], rotation: [0, hangar.rotation, 0] });
    poolParts.push({ geometry: new THREE.CircleGeometry(20, 20), position: [hangar.x, 0.12, hangar.z + hangar.d / 2 + 12], rotation: [-Math.PI / 2, 0, 0] });
  }

  const wallSegments = [
    [-152, BASE_Z + 26, 0], [-152, BASE_Z - 46, 0], [-124, BASE_Z - 112, 0.42], [-62, BASE_Z - 146, 0], [44, BASE_Z - 146, 0],
    [124, BASE_Z - 108, -0.42], [152, BASE_Z - 42, 0], [152, BASE_Z + 44, 0],
  ];
  for (const [x, z, rotation] of wallSegments) {
    structureParts.push({ geometry: chamferedSlab(28, 8, 3.4, 0.4), position: [x, 4, z], rotation: [0, rotation, 0] });
    panelParts.push({ geometry: chamferedSlab(25, 3.4, 3.9, 0.2), position: [x, 8.4, z], rotation: [0, rotation, 0] });
    accentParts.push({ geometry: chamferedSlab(3.2, 0.5, 0.6, 0.1), position: [x, 5.4, z + 2], rotation: [0, rotation, 0] });
  }

  // Landing platform with a glowing rim and marking lights.
  structureParts.push({ geometry: new THREE.CylinderGeometry(48, 50, 1.6, 20), position: [PAD_POSITION.x, 0.8, PAD_POSITION.z] });
  panelParts.push({ geometry: new THREE.CylinderGeometry(40, 40, 0.6, 20), position: [PAD_POSITION.x, 1.7, PAD_POSITION.z] });
  shieldGlowParts.push({ geometry: new THREE.TorusGeometry(48, 0.35, 6, 40), position: [PAD_POSITION.x, 1.7, PAD_POSITION.z], rotation: [Math.PI / 2, 0, 0] });
  for (let index = 0; index < 4; index++) {
    const angle = index * Math.PI / 2;
    shieldGlowParts.push({
      geometry: new THREE.BoxGeometry(2.4, 0.2, 8),
      position: [PAD_POSITION.x + Math.cos(angle) * 34, 2.05, PAD_POSITION.z + Math.sin(angle) * 34],
      rotation: [0, -angle, 0],
    });
  }

  // Shield generator: the mission landmark at (0, 16, -640).
  structureParts.push({ geometry: new THREE.CylinderGeometry(3.4, 4.2, 16, 14), position: [0, 8, BASE_Z] });
  structureParts.push({ geometry: new THREE.TorusGeometry(4.6, 0.5, 6, 20), position: [0, 14.4, BASE_Z], rotation: [Math.PI / 2, 0, 0] });
  structureParts.push({ geometry: new THREE.CylinderGeometry(5.4, 5.4, 1.2, 14), position: [0, 0.6, BASE_Z] });
  for (let index = 0; index < 4; index++) {
    const angle = index * (Math.PI / 2);
    structureParts.push({
      geometry: chamferedSlab(0.8, 12, 0.8, 0.14),
      position: [Math.cos(angle) * 4.6, 6.5, BASE_Z + Math.sin(angle) * 4.6],
      rotation: [0.16 * Math.sin(angle), -angle, 0.16 * Math.cos(angle)],
    });
  }
  for (const height of [3.4, 7.6, 11.8]) {
    shieldGlowParts.push({ geometry: new THREE.TorusGeometry(4, 0.28, 6, 24), position: [0, height, BASE_Z], rotation: [Math.PI / 2, 0, 0] });
  }

  // Supply crates and snow drifts around the walls.
  for (let index = 0; index < 14; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 96 + random() * 54;
    const size = 2.4 + random() * 2.2;
    structureParts.push({
      geometry: chamferedSlab(size * 1.6, size, size * 1.2, 0.2),
      position: [Math.cos(angle) * radius, size / 2, BASE_Z + Math.sin(angle) * radius - 40],
      rotation: [0, random() * Math.PI, 0],
    });
  }
  for (let index = 0; index < 18; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 110 + random() * 70;
    const scale = 5 + random() * 9;
    driftParts.push({
      geometry: new THREE.IcosahedronGeometry(1, 1),
      position: [Math.cos(angle) * radius, -scale * 0.35, BASE_Z + Math.sin(angle) * radius - 30],
      rotation: [0, random() * Math.PI, 0],
      scale: [scale * (1 + random() * 0.5), scale * 0.45, scale],
    });
  }

  base.add(new THREE.Mesh(mergeParts(structureParts), structureMaterial));
  base.add(new THREE.Mesh(mergeParts(panelParts), panelMaterial));
  base.add(new THREE.Mesh(mergeParts(accentParts), accentBaseMaterial));
  base.add(new THREE.Mesh(mergeParts(warmGlowParts), warmGlowMaterial));
  base.add(new THREE.Mesh(mergeParts(shieldGlowParts), shieldGlowMaterial));
  base.add(new THREE.Mesh(mergeParts(poolParts), poolMaterial));
  base.add(new THREE.Mesh(mergeParts(driftParts), snowMaterial));

  // Turrets around the perimeter, each one its own addressable group.
  const turrets = [];
  for (const [x, z] of [[-118, BASE_Z + 64], [118, BASE_Z + 64], [0, BASE_Z - 112]]) {
    const turret = new THREE.Group();
    turret.name = 'turret';
    turret.position.set(x, 0, z);
    turret.add(new THREE.Mesh(mergeParts([
      { geometry: new THREE.CylinderGeometry(2.2, 3, 7, 10), position: [0, 3.5, 0] },
      { geometry: chamferedSlab(3.4, 2.4, 3.4, 0.25), position: [0, 8, 0] },
      { geometry: new THREE.CylinderGeometry(0.22, 0.22, 4.4, 8), position: [0.5, 8, -2.6], rotation: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.CylinderGeometry(0.22, 0.22, 4.4, 8), position: [-0.5, 8, -2.6], rotation: [Math.PI / 2, 0, 0] },
    ]), structureMaterial));
    turret.add(new THREE.Mesh(mergeParts([
      { geometry: new THREE.CircleGeometry(0.42, 12), position: [0.5, 8, -4.85], rotation: [0, Math.PI, 0] },
      { geometry: new THREE.CircleGeometry(0.42, 12), position: [-0.5, 8, -4.85], rotation: [0, Math.PI, 0] },
    ]), warmGlowMaterial));
    base.add(turret);
    turrets.push(turret);
  }

  // Warm hearths at the hangar doors: emissive panels plus two point lights.
  const warmLightA = new THREE.PointLight(0xffb066, 340, 170, 1.8);
  warmLightA.position.set(-78, 7, BASE_Z - 2);
  warmLightA.userData.hothLight = true;
  base.add(warmLightA);
  const warmLightB = new THREE.PointLight(0xffa855, 260, 150, 1.8);
  warmLightB.position.set(68, 6, BASE_Z - 32);
  warmLightB.userData.hothLight = true;
  base.add(warmLightB);

  const shieldDome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x6fd0ff,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  shieldDome.name = 'shield-dome';
  shieldDome.position.z = BASE_Z;
  base.add(shieldDome);

  // --- transports ---------------------------------------------------------
  const transports = [];
  for (let index = 0; index < Math.max(1, transportCount); index++) {
    const group = createTransport(index);
    const slot = index - (Math.max(1, transportCount) - 1) / 2;
    group.position.set(PAD_POSITION.x + slot * 22, 1.6, PAD_POSITION.z + (index % 2) * 6 - 3);
    // The hull nose points at local -Z, so the parked ships face the plain and
    // the departure direction of the evacuation.
    group.rotation.y = 0;
    root.add(group);
    transports.push({
      id: `transport-${index + 1}`,
      group,
      state: 'parked',
      progress: 0,
      duration: LAUNCH_DURATION,
      padPosition: group.position.clone(),
      glowMaterial: group.userData.glowMaterial,
    });
  }

  // --- AT-AT --------------------------------------------------------------
  const atAtGroup = createAtAtMesh();
  atAtGroup.position.copy(AT_AT_SPAWN);
  root.add(atAtGroup);
  const atAt = {
    group: atAtGroup,
    legs: atAtGroup.userData.legs,
    head: atAtGroup.userData.head,
    body: atAtGroup.userData.body,
  };

  // --- snowfall -----------------------------------------------------------
  const snowPositions = new Float32Array(Math.max(1, snowCount) * 3);
  const snowRandom = seededRandom(seed + 99);
  for (let index = 0; index < snowPositions.length; index += 3) {
    snowPositions[index] = (snowRandom() - 0.5) * SNOW_WIDTH;
    snowPositions[index + 1] = snowRandom() * SNOW_HEIGHT;
    snowPositions[index + 2] = (snowRandom() - 0.5) * SNOW_WIDTH;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowSprite = radialSpriteTexture();
  const snowfallMaterial = new THREE.PointsMaterial({
    color: 0xf3f8ff,
    size: 0.9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    map: snowSprite,
    alphaTest: snowSprite ? 0.02 : 0,
  });
  const snowfall = new THREE.Points(snowGeometry, snowfallMaterial);
  snowfall.name = 'snowfall';
  snowfall.frustumCulled = false;
  root.add(snowfall);

  // --- weather state ------------------------------------------------------
  const weather = {
    fog: DEFAULT_LOOK.fog,
    light: DEFAULT_LOOK.light,
    hemi: DEFAULT_LOOK.hemi,
    ambient: DEFAULT_LOOK.ambient,
    snow: DEFAULT_LOOK.snow,
    shield: DEFAULT_LOOK.shield,
    fall: 0,
  };
  const focus = new THREE.Vector3(0, 0, 0);
  let cameraReference = null;

  /** The snowfall and the sky dome follow the camera when the caller gives no focus. */
  function findCamera() {
    if (cameraReference) return cameraReference;
    cameraReference = scene.getObjectByProperty('isCamera', true) || null;
    return cameraReference;
  }

  function applyWeather(step) {
    const look = PHASE_LOOK[currentPhase] || DEFAULT_LOOK;
    const blend = step > 0 ? 1 - Math.exp(-step * 1.6) : 0;
    weather.fog = lerp(weather.fog, look.fog, blend);
    weather.light = lerp(weather.light, look.light, blend);
    weather.hemi = lerp(weather.hemi, look.hemi, blend);
    weather.ambient = lerp(weather.ambient, look.ambient, blend);
    weather.snow = lerp(weather.snow, look.snow, blend);
    weather.shield = lerp(weather.shield, look.shield, blend);
    weather.fall = lerp(weather.fall, look.fall, blend);
    hothFog.density = weather.fog;
    starLight.intensity = weather.light;
    skyFill.intensity = weather.hemi;
    bounce.intensity = weather.ambient;
    snowfallMaterial.opacity = clamp(0.45 + weather.snow * 0.4, 0.2, 0.95);
    snowfallMaterial.size = 0.7 + weather.snow * 0.35;
    shieldDome.visible = weather.shield > 0.03;
    shieldDome.material.opacity = 0.04 * weather.shield;
    const damaged = 1 - weather.shield;
    shieldGlowMaterial.color.setRGB(
      lerp(0.44, 1, damaged),
      lerp(0.82, 0.32, damaged),
      lerp(1, 0.12, damaged),
    );
    atAtGroup.userData.fallLight.visible = weather.fall > 0.02;
    atAtGroup.userData.fallLight.intensity = weather.fall * 420;
  }

  function updateSnow(step) {
    if (step <= 0) return;
    const fall = 7 * weather.snow;
    const windX = 3.6 * weather.snow;
    const windZ = 1.7 * weather.snow;
    for (let index = 0; index < snowPositions.length; index += 3) {
      let x = snowPositions[index] + windX * step;
      let y = snowPositions[index + 1] - fall * step;
      let z = snowPositions[index + 2] + windZ * step;
      if (y < -12) {
        y = SNOW_HEIGHT;
        x = (snowRandom() - 0.5) * SNOW_WIDTH;
        z = (snowRandom() - 0.5) * SNOW_WIDTH;
      }
      if (x > SNOW_WIDTH / 2) x -= SNOW_WIDTH;
      else if (x < -SNOW_WIDTH / 2) x += SNOW_WIDTH;
      if (z > SNOW_WIDTH / 2) z -= SNOW_WIDTH;
      else if (z < -SNOW_WIDTH / 2) z += SNOW_WIDTH;
      snowPositions[index] = x;
      snowPositions[index + 1] = y;
      snowPositions[index + 2] = z;
    }
    snowGeometry.attributes.position.needsUpdate = true;
  }

  function updateTransport(transport, step) {
    if (transport.state !== 'launching') return;
    transport.progress = Math.min(1, transport.progress + step / transport.duration);
    const t = transport.progress;
    const lift = ramp(t, 0, 0.18);
    const climb = ramp(t, 0.16, 0.6);
    const run = ramp(t, 0.58, 1);
    const altitude = lerp(0, 12, lift) + lerp(12, 150, climb) + lerp(150, 285, run);
    const travel = lerp(0, 40, lift) + lerp(40, 430, climb) + lerp(430, 2600, run);
    const position = transport.group.position;
    position.x = transport.padPosition.x;
    position.y = transport.padPosition.y + altitude;
    position.z = transport.padPosition.z - travel;
    transport.group.rotation.set(lerp(0, -0.16, climb) + lerp(0.16, 0, run), run * 0.42, -run * 0.22);
    const boost = 1 + lift * 0.8 + climb * 1.4;
    transport.glowMaterial.color.setRGB(1.6 * boost, 0.6 * boost, 0.28 * boost);
    if (transport.progress >= 1) {
      transport.state = 'departed';
      transport.group.visible = false;
    }
  }

  function setPhase(phase) {
    currentPhase = phase;
    const look = PHASE_LOOK[phase];
    if (!look) {
      root.visible = false;
      if (scene.fog === hothFog) scene.fog = previousFog;
      applyExistingLights(false);
      return;
    }
    root.visible = true;
    if (scene.fog !== hothFog) scene.fog = hothFog;
    applyExistingLights(true);
    atAtGroup.visible = look.atAt;
    if (autoLaunch && (phase === 'hoth-evacuation' || phase === 'victory')) {
      autoLaunchActive = true;
      autoLaunchTimer = 0;
    }
  }

  function launchTransport(id) {
    const transport = transports.find(entry => entry.id === id);
    if (!transport || transport.state !== 'parked') return false;
    transport.state = 'launching';
    transport.progress = 0;
    transport.group.visible = true;
    return true;
  }

  function update(dt = 0, updateOptions = {}) {
    if (disposed) return;
    // A hidden surface (Episode IV, the hangar) must not cost a single frame.
    if (!root.visible) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_STEP) : 0;
    const phase = typeof updateOptions.phase === 'string' ? updateOptions.phase : currentPhase;
    if (phase !== currentPhase) setPhase(phase);
    clock += step;

    const position = updateOptions.position || updateOptions.cameraPosition;
    if (position && Number.isFinite(position.x)) {
      focus.set(position.x, Number.isFinite(position.y) ? position.y : 0, Number.isFinite(position.z) ? position.z : 0);
    } else {
      const camera = findCamera();
      if (camera) focus.set(camera.position.x, camera.position.y, camera.position.z);
    }
    skyGroup.position.copy(focus);
    snowfall.position.copy(focus);

    if (autoLaunch && autoLaunchActive) {
      autoLaunchTimer -= step;
      if (autoLaunchTimer <= 0) {
        const next = transports.find(entry => entry.state === 'parked');
        if (next) {
          launchTransport(next.id);
          autoLaunchTimer = LAUNCH_INTERVAL;
        } else {
          autoLaunchActive = false;
        }
      }
    }

    for (const transport of transports) updateTransport(transport, step);
    updateSnow(step);
    applyWeather(step);

    const pulse = 0.9 + Math.sin(clock * 3.1) * 0.12;
    warmGlowMaterial.color.setRGB(1 * pulse, 0.76 * pulse, 0.48 * pulse);
    warmLightA.intensity = 340 * pulse;
    warmLightB.intensity = 260 * pulse;
  }

  function getSnapshot() {
    return {
      phase: currentPhase,
      transports: transports.map(transport => ({
        id: transport.id,
        state: transport.state,
        position: {
          x: transport.group.position.x,
          y: transport.group.position.y,
          z: transport.group.position.z,
        },
      })),
      atAt: {
        position: {
          x: atAtGroup.position.x,
          y: atAtGroup.position.y,
          z: atAtGroup.position.z,
        },
        visible: atAtGroup.visible,
        cabled: atAtCabled,
      },
    };
  }

  function setAtAtCabled(cabled) {
    atAtCabled = Boolean(cabled);
    atAtGroup.userData.cabled = atAtCabled;
    return atAtCabled;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    if (scene.fog === hothFog) scene.fog = previousFog;
    for (const entry of overriddenLights) {
      entry.light.intensity = entry.intensity;
      entry.light.color.copy(entry.color);
    }
    disposeObject3D(root);
  }

  // The scene stays hidden until the caller switches to a Hoth phase: the
  // caller owns the phase routing, the scene only reacts to it.
  currentPhase = 'hoth-arrival';
  root.visible = false;
  atAtGroup.visible = PHASE_LOOK['hoth-arrival'].atAt;
  applyWeather(1);

  return {
    root,
    atAt,
    transports,
    turrets,
    update,
    setPhase,
    launchTransport,
    setAtAtCabled,
    heightAt: (x, z) => hothTerrainHeight(x, z, seed),
    getSnapshot,
    dispose,
  };
}
