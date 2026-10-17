import * as THREE from 'three';

const ACTIVE_MODES = new Set(['playing', 'qte', 'cinematic']);

function createProceduralEnvironment() {
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(0x101a28);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const cards = [
    { position: [-18, 7, 20], size: [32, 12], color: [0.8, 1.28, 1.92] },
    { position: [8, 18, -16], size: [27, 5], color: [1.36, 0.76, 0.36] },
    { position: [21, -7, -10], size: [30, 9], color: [0.48, 0.96, 1.6] },
    { position: [-8, -19, -12], size: [24, 4], color: [1, 1.12, 1.28] },
  ];

  for (const card of cards) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(...card.color),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...card.position);
    mesh.scale.set(card.size[0], card.size[1], 1);
    mesh.lookAt(0, 0, 0);
    environment.add(mesh);
  }
  return environment;
}

function disposeEnvironmentScene(environment) {
  const geometries = new Set();
  const materials = new Set();
  environment.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material) materials.add(material);
      }
    }
  });
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/**
 * Adds a restrained static image-based light and a local trench fill light.
 * The PMREM changes material lighting only; the scene background stays owned
 * by the game. Call update from the frame loop with the current player/state.
 */
export function createSceneLighting(renderer, scene, camera) {
  if (!renderer?.isWebGLRenderer || !scene || !camera) {
    return {
      update() {},
      dispose() {},
      inspect: () => ({ enabled: false }),
    };
  }

  const environment = createProceduralEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, 0.12, 0.1, 80);
  disposeEnvironmentScene(environment);
  const previousEnvironment = scene.environment;
  const previousEnvironmentIntensity = scene.environmentIntensity;
  const environmentIntensity = 0.42;
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = environmentIntensity;

  // One unshadowed, finite-range source adds readable local response without
  // expanding the directional shadow map or adding per-frame light objects.
  const fillIntensity = 350;
  const fillLight = new THREE.PointLight(0xc7dcf1, 0, 80, 2);
  fillLight.name = 'Trench player fill';
  fillLight.castShadow = false;
  scene.add(fillLight);

  const forward = new THREE.Vector3(0, 0, -1);
  const up = new THREE.Vector3(0, 1, 0);
  let active = false;
  let disposed = false;

  function update(player, phase, mode) {
    if (disposed) return;
    const shouldBeActive = Boolean(player?.position && player?.quaternion)
      && phase === 'trench'
      && ACTIVE_MODES.has(mode);
    active = shouldBeActive;
    fillLight.intensity = active ? fillIntensity : 0;
    if (!active) return;

    forward.set(0, 0, -1).applyQuaternion(player.quaternion);
    up.set(0, 1, 0).applyQuaternion(player.quaternion);
    fillLight.position.copy(player.position)
      .addScaledVector(forward, -12)
      .addScaledVector(up, 10);

    // In cockpit view the camera is near the pilot; a small extra lift keeps
    // the local fill outside the cockpit shell while retaining player tracking.
    if (camera.position.distanceToSquared(player.position) < 64) {
      fillLight.position.copy(camera.position)
        .addScaledVector(forward, -0.5)
        .addScaledVector(up, 0.9);
      fillLight.intensity = 0.8;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(fillLight);
    fillLight.dispose?.();
    scene.environment = previousEnvironment;
    scene.environmentIntensity = previousEnvironmentIntensity;
    environmentTarget.dispose();
    pmrem.dispose();
  }

  return {
    update,
    dispose,
    inspect: () => ({
      enabled: true,
      environment: 'procedural-pmrem',
      environmentIntensity,
      fillLight: {
        active,
        intensity: fillLight.intensity,
        distance: fillLight.distance,
        castShadow: fillLight.castShadow,
        position: [fillLight.position.x, fillLight.position.y, fillLight.position.z],
      },
    }),
  };
}
