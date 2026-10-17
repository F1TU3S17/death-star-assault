import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const modelUrl = '/models/xwing-cockpit/scene.gltf';

// Each cockpit owns its loaded resources. No shared template is handed to the
// world's disposal traversal, and a load finishing after teardown is freed here.
function disposeLoadedModel(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of node.material ? [].concat(node.material) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

export function createDetailedCockpit(fallback) {
  const group = new THREE.Group();
  group.name = 'player-cockpit';
  group.add(fallback);
  let detailedModel;
  let selectedShip = 'xwing';
  const syncVisibility = () => {
    const showDetailed = selectedShip === 'xwing' && Boolean(detailedModel);
    fallback.visible = !showDetailed;
    if (detailedModel) detailedModel.visible = showDetailed;
  };
  Object.assign(group.userData, {
    modelStatus: 'loading',
    loading: true,
    error: null,
    modelUrl,
    triangleCount: 0,
    setShip(shipId) {
      selectedShip = shipId;
      group.userData.shipId = shipId;
      syncVisibility();
    },
  });
  group.userData.setShip(selectedShip);

  new GLTFLoader().loadAsync(modelUrl).then(({ scene: model }) => {
    if (group.userData.disposed) {
      disposeLoadedModel(model);
      group.userData.loading = false;
      group.userData.modelStatus = 'disposed';
      return;
    }
    model.name = 'open-galaxy-xwing-cockpit';
    model.rotation.y = Math.PI;
    // Keep the authored pilot origin; a bounds recenter moves the eye outside.
    model.position.set(0.033203125, -0.03557968, -0.072753906);
    let triangleCount = 0;
    model.traverse(node => {
      if (!node.isMesh) return;
      if (node.name === 'windows_window') node.visible = false;
      else triangleCount += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      node.frustumCulled = false;
      for (const material of [].concat(node.material)) {
        material.side = THREE.DoubleSide;
        material.roughness = 0.6;
        material.metalness = 0.15;
        material.emissiveIntensity = 0.6;
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
        if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        material.needsUpdate = true;
      }
    });
    detailedModel = model;
    group.add(model);
    Object.assign(group.userData, { modelStatus: 'loaded', loading: false, triangleCount });
    syncVisibility();
  }).catch(error => {
    group.userData.loading = false;
    group.userData.modelStatus = group.userData.disposed ? 'disposed' : 'error';
    group.userData.error = error.message || String(error);
  });
  return group;
}
