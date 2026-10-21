import * as THREE from 'three';
import { createCampaign, resolveProgressRule } from './campaign.js';
import { createMissionDirector } from './mission-events.js';
import { createEscortTactics } from './escort-tactics.js';
import { createEnemySquadron } from './enemy-squadron.js';
import { createShipSystems } from './ship-systems.js';
import { createWingOrders, createEscortBonus } from './wing-orders.js';
import { createMissionProp } from './mission-props.js';
import { createEnemyBrain, updateEnemyBrain } from './enemy-ai.js';
import { getEnemyWeaponProfile, solveFireSolution, createTurretBrain } from './enemy-fire-control.js';
import { getEnemyUnitSpec, chooseEnemyTarget } from './enemy-units.js';
import { createAtAtUnit } from './at-at.js';
import { SHIPS, EPISODES } from './data.js';
import { createWorld, createShip, createTurret, createAtSt, createCockpit } from './world.js';
import { createAudio } from './audio.js';
import { createRenderPipeline } from './render-pipeline.js';
import { createSceneLighting } from './scene-lighting.js';
import { createTargetLock, stationLineOfSight, getLeadSolution } from './targeting.js';
import { createFlightState, resetFlightState, stepFlight, getFlightTurnAuthority } from './flight-model.js';
import { absorbDamage, segmentSphereHit, clampFrameDelta, createArmament, insideLockCone, steerDirection, splashDamage, getPowerProfile, createRepairSystem, createSupportSystem, lethalImpact } from './simulation.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
// Squadron radio is attributed to the leader who commands the phase in progress.
const SQUADRON_SPEAKERS = {
  combat: 'Красный Лидер', surface: 'Золотой Лидер', escort: 'Золотой Два',
  assault: 'Красный Лидер', defend: 'Управление Явина', trench: 'Управление Явина', qte: 'Управление Явина',
};
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const DEFAULT_MODELS = {
  xwing: '/models/x-wing/scene.gltf',
  ywing: '/models/y-wing/scene.gltf',
  tie: '/models/tie-fighter-detailed/scene.gltf',
};

function createBoltMaterial(color, { ion = false, beamWidth = 2, beamLength = 22, intensity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(color) }, ion: { value: ion ? 1 : 0 }, beamWidth: { value: beamWidth }, beamLength: { value: beamLength }, intensity: { value: intensity } },
    vertexShader: `uniform float beamWidth; uniform float beamLength; varying vec2 vUv;
      void main(){ vUv=uv;
        vec4 center=modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
        vec3 axis=(modelViewMatrix*vec4(0.0,0.0,1.0,0.0)).xyz;
        float axisLength=length(axis);
        axis=axisLength>1e-5?axis/axisLength:vec3(0.0,0.0,1.0);
        vec4 centerClip=projectionMatrix*center;
        vec4 tailClip=projectionMatrix*(center+vec4(axis,0.0)*beamLength);
        vec2 ndc=centerClip.xy/centerClip.w;
        vec2 delta=tailClip.xy/tailClip.w-ndc;
        float projected=length(delta);
        vec2 dir=projected>1e-6?delta/projected:vec2(0.0,1.0);
        // A perspective-correct streak that never falls below a readable size.
        float lengthNdc=max(projected,0.07);
        float widthNdc=max(projected*(beamWidth/max(1e-4,beamLength)),0.0075);
        float taper=mix(1.0,0.5,uv.y);
        vec2 along=dir*(lengthNdc*0.5);
        vec2 across=vec2(-dir.y,dir.x)*(widthNdc*0.5)*taper;
        vec2 finalNdc=ndc+along*(position.y*2.0)+across*(position.x*2.0);
        gl_Position=vec4(finalNdc,centerClip.z/centerClip.w,1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 tint; uniform float ion; uniform float intensity; varying vec2 vUv;
      void main(){
        float across=abs(vUv.x-0.5)*2.0;
        float along=vUv.y;
        float glow=pow(max(0.0,1.0-across),2.6);
        float core=pow(max(0.0,1.0-across*2.2),8.0);
        float pulse=0.78+0.22*sin(along*30.0-time*62.0);
        float head=1.0-smoothstep(0.0,0.38,along);
        float tail=1.0-smoothstep(0.68,1.0,along);
        vec3 color=mix(tint*1.25,vec3(2.4),core);
        float alpha=(glow*0.42+core)*pulse*tail*(0.6+head*0.8)*intensity;
        if(ion>0.5){
          float spiral=0.5+0.5*sin(across*7.0+along*20.0-time*26.0);
          color=mix(tint*1.5,vec3(1.9,2.2,3.0),core)*(0.9+0.3*spiral);
          alpha*=0.85+0.3*spiral;
        }
        gl_FragColor=vec4(color*intensity,alpha); }`,
  });
}

function createBurstTexture() {
  const pixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
    const offset = (y * 64 + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round(Math.max(0, 1 - radius) ** 2.4 * 255);
  }
  const texture = new THREE.DataTexture(pixels, 64, 64);
  texture.needsUpdate = true;
  return texture;
}

/** Engine owns all simulation. UI receives plain snapshots and narrative events. */
export function createGame({ canvas, ships = SHIPS, onSnapshot = () => {}, onEvent = () => {} } = {}) {
  if (!canvas) throw new Error('createGame requires a canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040811);
  scene.fog = new THREE.FogExp2(0x060b16, 0.000018);
  const camera = new THREE.PerspectiveCamera(63, 1, 1.5, 24000);
  scene.add(camera);
  const ambient = new THREE.HemisphereLight(0xc4d0de, 0x555961, 1.1);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xf2e9d3, 3);
  keyLight.position.set(-2000, 3000, 2500);
  scene.add(keyLight);
  keyLight.castShadow = true;
  const shadowResolution = window.innerWidth < 760 ? 512 : 1024;
  keyLight.shadow.mapSize.set(shadowResolution, shadowResolution);
  Object.assign(keyLight.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 100, far: 2200 });
  keyLight.shadow.bias = -0.00015;
  keyLight.shadow.normalBias = 0.35;
  scene.add(keyLight.target);
  const rimLight = new THREE.DirectionalLight(0xaab8ce, 0.45);
  rimLight.position.set(1000, -300, -2000);
  scene.add(rimLight);
  const world = createWorld(scene);
  const renderPipeline = createRenderPipeline(renderer, scene, camera);
  if (renderPipeline.inspect().softwareRenderer) keyLight.castShadow = false;
  const shadowOffset = new THREE.Vector3(-800, 1100, 500);
  const shadowDirection = shadowOffset.clone().negate().normalize();
  const shadowRight = shadowDirection.clone().cross(UP).normalize();
  const shadowUp = shadowRight.clone().cross(shadowDirection).normalize();
  const shadowCenter = new THREE.Vector3();
  const sceneLighting = createSceneLighting(renderer, scene, camera);
  const audio = createAudio();
  const publishEvent = onEvent;
  onEvent = (event) => {
    if (event.type === 'radio') {
      audio.radio?.('in');
      if (/астро|R2/i.test(event.speaker || '')) audio.astromech?.();
    } else if (event.type === 'mission-complete') audio.missionCue?.('success');
    else if (event.type === 'side-complete') audio.missionCue?.('objective');
    else if (event.type === 'defeat') audio.missionCue?.('fail');
    else if (event.type === 'victory') audio.missionCue?.('victory');
    else if (event.type === 'enemy-attack' && event.targetId === 'player') audio.incoming?.();
    publishEvent(event);
  };
  let campaign = createCampaign('episode4');
  let missionDirector = createMissionDirector();
  const escortTactics = createEscortTactics();
  const squadron = createEnemySquadron();
  const shipSystems = createShipSystems();
  const wingOrders = createWingOrders();
  const escortBonus = createEscortBonus();
  let tacticalScore = 0;
  let repairTarget = 'hull';
  let weaponFaultDelay = 0;
  let escortChoicePending = false;
  const missionProps = [];
  let entitySerial = 0;
  let ventDamageCooldown = 0;
  let lastAudioLock = 'none';
  const shipDefinitions = Array.isArray(ships) ? Object.fromEntries(ships.map(ship => [ship.id, ship])) : ships;
  const keys = new Set();
  const enemies = [];
  const allies = [];
  const supportWingmen = [];
  let redLeaderDeparture = null;
  const repairSystem = createRepairSystem();
  const supportSystem = createSupportSystem();
  const projectiles = [];
  const effects = [];
  const flashes = [];
  const listeners = [];
  const temporary = new THREE.Vector3();
  const temporary2 = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  // A unit quad is stretched by the bolt shader into a camera-facing beam.
  const boltGeometry = new THREE.PlaneGeometry(1, 1);
  const playerBoltMaterial = createBoltMaterial(0xff303e, { beamWidth: 2, beamLength: 24, intensity: 1.2 });
  const enemyBoltMaterial = createBoltMaterial(0x59ff77, { beamWidth: 2, beamLength: 24, intensity: 1.05 });
  const ionBoltMaterial = createBoltMaterial(0x43afff, { ion: true, beamWidth: 2.8, beamLength: 28, intensity: 1.1 });
  const shellBoltMaterial = createBoltMaterial(0xff9a4a, { beamWidth: 3.4, beamLength: 12, intensity: 1.35 });
  const torpedoGeometry = new THREE.CapsuleGeometry(0.45, 2, 3, 8);
  torpedoGeometry.rotateX(Math.PI / 2);
  const torpedoMaterial = new THREE.MeshStandardMaterial({ color: 0xc0d6e3, emissive: 0x558bb2, emissiveIntensity: 1.8, roughness: 0.4, metalness: 0.65 });
  const torpedoTailGeometry = new THREE.ConeGeometry(0.65, 12, 8);
  torpedoTailGeometry.rotateX(Math.PI / 2);
  const torpedoGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xb1e6ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, fog: false });
  const effectGeometry = new THREE.BoxGeometry(0.45, 0.24, 0.8);
  const effectTexture = createBurstTexture();
  const effectMaterials = [0xffb96a, 0xff5d28, 0xffe6c2, 0x82d2ff].map(color => new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  // A glowing head keeps a shot readable even when it flies straight away from the camera.
  const boltHeadMaterials = [0xff5a4a, 0x74ff8c, 0x7cc8ff].map(color => new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  const flashMaterials = {
    laser: new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(0xffd9b4).multiplyScalar(2.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    ion: new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(0xa8dcff).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    enemy: new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(0xb6ffbe).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
    torpedo: new THREE.SpriteMaterial({ map: effectTexture, color: new THREE.Color(0xcdefff).multiplyScalar(2.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }),
  };
  const debrisMaterial = new THREE.MeshStandardMaterial({ color: 0x34363b, roughness: 0.58, metalness: 0.6, transparent: true });

  let disposed = false;
  let frameId;
  let lastFrame = performance.now();
  let emitTimer = 0;
  let totalElapsed = 0;
  let backdropElapsed = 0;
  let mode = 'menu';
  let pausedMode = 'playing';
  let cameraMode = 'chase';
  let snapChaseCamera = true;
  let selectedShipId = 'xwing';
  let sortieShipId = 'xwing';
  let stats = shipDefinitions[selectedShipId] || SHIPS.xwing;
  let hull = stats.hull;
  let shields = stats.shield;
  let speed = 0;
  const flight = createFlightState();
  let armament = createArmament(stats.weapons || SHIPS.xwing.weapons);
  const targetLock = createTargetLock();
  let heat = 0;
  let abilityCooldown = 0;
  let abilityRemaining = 0;
  let kills = 0;
  let shotsFired = 0;
  let shotsHit = 0;
  let lastDamage = -10;
  let lastPhase = 'menu';
  let lastRadio = '';
  let lastQteStage = -1;
  let explosionPlayed = false;
  let torpedoImpactPlayed = false;
  let superlaserCharging = false;
  let audioUnlocked = false;
  let mouseYaw = 0;
  let mousePitch = 0;
  let mouseFiring = false;
  let lockRequested = false;
  let collisionCooldown = 0;
  let tieSoundTimer = 0;
  let relaysDestroyed = 0;
  let relayBonus = false;
  let atAt = null;
  let atAtState = null;
  // The walker is scaled up so it reads as a walking fortress next to the fighters.
  const AT_AT_SCALE = 1.9;
  const AT_AT_RADIUS = { leg: 6, turret: 10.5, body: 26 };
  // The Rebel base stands on the ice plain ahead of the arrival vector.
  const hothBase = new THREE.Vector3(0, 0, -1500);
  let powerMode = 'balanced';
  let sfoilsMode = 'auto';
  let sfoilsOpenness = 1;
  let escortWaveTimer = 0;
  const escortAnchor = new THREE.Vector3(0, 90, 700);
  const escortWaypoints = [0, -650, -1300];
  const player = new THREE.Group();
  player.position.set(0, 80, 600);
  scene.add(player);
  let shipMesh;
  const cockpit = createCockpit();
  cockpit.visible = false;
  camera.add(cockpit);

  function modelFor(kind) {
    const definition = shipDefinitions[kind];
    return definition?.modelUrl || definition?.modelPath || DEFAULT_MODELS[kind];
  }

  function replaceShip(id, keepResources = false) {
    selectedShipId = shipDefinitions[id] ? id : 'xwing';
    stats = shipDefinitions[selectedShipId] || SHIPS.xwing;
    armament = createArmament(stats.weapons || SHIPS[selectedShipId]?.weapons || SHIPS.xwing.weapons);
    if (shipMesh) {
      shipMesh.userData.disposed = true;
      player.remove(shipMesh);
    }
    const modelOptions = stats.modelOptions || (selectedShipId === 'xwing' ? { rotation: [0, Math.PI, 0] } : {});
    shipMesh = createShip(stats.model || selectedShipId, modelFor(selectedShipId), modelOptions);
    player.add(shipMesh);
    cockpit.userData.setShip?.(selectedShipId);
    if (!keepResources) { hull = stats.hull; shields = stats.shield; }
    else { hull = Math.min(hull, stats.hull); shields = Math.min(shields, stats.shield); }
    shipMesh.visible = cameraMode !== 'cockpit';
  }
  replaceShip('xwing');

  function addListener(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push(() => target.removeEventListener(event, handler, options));
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    renderPipeline.resize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  addListener(window, 'resize', resize);
  resize();

  function clearInput() { keys.clear(); mouseYaw = 0; mousePitch = 0; mouseFiring = false; }
  function exitPointerLock() {
    lockRequested = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  function removeEntity(entity) {
    entity.mesh.userData.disposed = true;
    scene.remove(entity.mesh);
  }
  function clearCombat() {
    targetLock.reset();
    if (redLeaderDeparture) { removeEntity(redLeaderDeparture); redLeaderDeparture = null; }
    escortTactics.reset();
    squadron.reset();
    escortChoicePending = false;
    for (const prop of missionProps) { scene.remove(prop.mesh); prop.dispose(); }
    missionProps.length = 0;
    if (atAt) {
      atAtState = { health: atAt.health, maxHealth: atAt.maxHealth };
      atAt.mesh.visible = false;
      atAt = null;
    }
    for (const entity of enemies) removeEntity(entity);
    for (const ally of allies) removeEntity(ally);
    for (const wingman of supportWingmen) removeEntity(wingman);
    for (const projectile of projectiles) scene.remove(projectile.mesh);
    for (const effect of effects) { scene.remove(effect.mesh); effect.mesh.material.dispose(); }
    for (const flash of flashes) { scene.remove(flash.sprite); flash.material.dispose(); }
    flashes.length = 0;
    enemies.length = 0;
    allies.length = 0;
    supportWingmen.length = 0;
    projectiles.length = 0;
    effects.length = 0;
  }

  function spawnTie(position, variant = 'line') {
    const unitSpec = getEnemyUnitSpec(variant === 'vader' ? 'vader' : 'tie', variant);
    const mesh = createShip(unitSpec.modelKind, variant === 'vader' ? undefined : DEFAULT_MODELS.tie);
    mesh.position.copy(position);
    const targetDirection = campaign.getSnapshot().phase === 'trench' ? FORWARD.clone() : player.position.clone().sub(position).normalize();
    mesh.quaternion.setFromUnitVectors(FORWARD, targetDirection);
    scene.add(mesh);
    const entity = {
      id: `fighter-${++entitySerial}`,
      kind: variant === 'vader' ? 'vader' : 'tie', variant, mesh, health: unitSpec.health, radius: unitSpec.radius,
      velocity: new THREE.Vector3(), fireTimer: 1.2 + Math.random() * 1.6,
      seed: Math.random() * 20, stun: 0, evade: 0,
    };
    entity.brain = createEnemyBrain(variant, entity.seed);
    entity.aiState = 'approach';
    entity.aiTarget = 'player';
    enemies.push(entity);
    return entity;
  }

  function spawnTurret(x, z, variant = 'light') {
    const mesh = createTurret(variant);
    mesh.position.set(x, -115, z);
    scene.add(mesh);
    const unitSpec = getEnemyUnitSpec(variant === 'relay' ? 'relay' : 'turret', variant);
    const entity = { id: `battery-${++entitySerial}`, kind: variant === 'relay' ? 'relay' : 'turret', variant, mesh, health: unitSpec.health, radius: unitSpec.radius, velocity: new THREE.Vector3(), fireTimer: 1.6 + Math.random() * 1.6, seed: Math.random() * 20, stun: 0 };
    if (unitSpec.canFire) entity.brain = createTurretBrain(variant, entity.fireTimer);
    enemies.push(entity);
    return entity;
  }

  function handleMissionEvents(events) {
    for (const event of events) {
      if (event.type === 'spawn-wave') {
        for (const [index, id] of event.targetIds.entries()) {
          const position = escortAnchor.clone().add(new THREE.Vector3(290 + index * 65, 70, 260 + index * 110));
          const enemy = spawnTie(position, 'ace');
          enemy.id = id;
          enemy.bonusOnly = true;
        }
      } else if (event.type === 'vent-warning') audio.incoming?.();
      else if (event.type === 'vent-open') audio.vent?.();
      onEvent(event);
    }
  }

  function handleEscortTactics(events) {
    for (const event of events) {
      for (const id of event.disableTargetIds || []) {
        const battery = enemies.find(enemy => enemy.id === id);
        if (!battery || battery.disabled) continue;
        battery.disabled = true;
        battery.aiState = 'disabled';
        battery.telegraph = false;
        battery.mesh.userData.attackTelegraph = false;
        battery.velocity.set(0, 0, 0);
        targetLock.invalidate(id);
        burst(battery.mesh.position, 3, 3);
      }
      if (event.allyShieldRestore) {
        for (const ally of allies) ally.shields = Math.min(ally.maxShields, ally.shields + event.allyShieldRestore);
      }
      if (event.type === 'escort-threat-disabled' || event.type === 'escort-battery-disabled') {
        audio.cue();
        onEvent({ type: 'radio', speaker: 'Золотой Два', text: event.allyShieldRestore
          ? 'Питание батареи снято! Золотая группа, перераспределяем энергию на щиты.'
          : 'Батарея уничтожена. TIE и питающий узел остаются вашими целями.' });
      }
      onEvent(event);
    }
  }

  function setupMissionContent(phase) {
    missionDirector.enterPhase(phase);
    ventDamageCooldown = 0;
    const content = missionDirector.getSnapshot();
    for (const objective of content.sideObjectives) {
      if (objective.kind === 'scan') {
        const prop = createMissionProp('scan', { position: objective.position, label: objective.title });
        Object.assign(prop, { id: objective.targetId, objectiveId: objective.id, kind: 'scan' });
        scene.add(prop.mesh);
        missionProps.push(prop);
      } else if (objective.kind === 'destroy') {
        const enemy = spawnTurret(objective.position.x, objective.position.z, 'relay');
        enemy.mesh.position.set(objective.position.x, objective.position.y, objective.position.z);
        enemy.id = objective.targetId;
        enemy.bonusOnly = true;
      }
    }
    if (content.vent) for (const z of content.vent.zPositions) {
      const prop = createMissionProp('vent', { position: { x: content.vent.laneX, y: content.vent.floorY, z }, label: 'Тепловой сброс' });
      Object.assign(prop, { id: `vent-${z}`, kind: 'vent' });
      scene.add(prop.mesh);
      missionProps.push(prop);
    }
  }

  function updateMissionContent(dt) {
    const state = campaign.getSnapshot();
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    const sensor = missionProps.find(prop => prop.kind === 'scan');
    const sensorDirection = sensor ? sensor.mesh.position.clone().sub(player.position).normalize() : null;
    handleMissionEvents(missionDirector.update({
      dt, playerPosition: player.position, targetId: sensorDirection && sensorDirection.dot(forward) > 0.85 ? sensor.id : null,
      speedRatio: speed / stats.speed, killCount: state.assault?.kills ?? state.progress, escortCheckpoint: state.phase === 'escort' ? state.progress : 0,
      allyHealth: allies.length ? Math.min(...allies.map(ally => ally.health / ally.maxHealth * 100)) : NaN,
    }));
    if (state.phase === 'escort') {
      if (escortChoicePending) {
        escortChoicePending = false;
        onEvent({ id: 'escort-tactics:priority-choice', type: 'radio', speaker: 'Золотой Лидер',
          text: 'Три угрозы: TIE атакуют строй; тяжёлая батарея держит маршрут; дальний питающий узел отключит её и даст время восстановить щиты. Выберите приоритет.' });
      }
      handleEscortTactics(escortTactics.update({
        allyHealth: allies.length ? Math.min(...allies.map(ally => ally.health / ally.maxHealth * 100)) : 0,
        escortCheckpoint: state.progress,
      }));
    }
    const content = missionDirector.getSnapshot();
    ventDamageCooldown = Math.max(0, ventDamageCooldown - dt);
    for (const prop of missionProps) {
      const objective = content.sideObjectives.find(entry => entry.id === prop.objectiveId);
      prop.update({ time: content.elapsed, active: prop.kind === 'vent' ? content.vent?.active : true,
        warning: prop.kind === 'vent' && content.vent?.telegraph,
        progress: objective ? objective.progress / objective.target : 0 });
      if (prop.kind === 'vent' && content.vent?.active && ventDamageCooldown === 0
        && Math.abs(player.position.x - content.vent.laneX) < content.vent.width / 2
        && Math.abs(player.position.z - prop.mesh.position.z) < 22
        && player.position.y > content.vent.floorY && player.position.y < content.vent.floorY + content.vent.height) {
        ventDamageCooldown = 1;
        damagePlayer(18);
        onEvent({ type: 'vent-hit' });
      }
    }
  }

  function spawnAlly(id, name, kind, position, damaged = false) {
    const mesh = createShip(kind, modelFor(kind), kind === 'xwing' ? { rotation: [0, Math.PI, 0] } : {});
    mesh.position.copy(position);
    scene.add(mesh);
    const ally = { id, name, kind, mesh, health: damaged ? 90 : 125, maxHealth: damaged ? 100 : 125, shields: damaged ? 35 : relayBonus ? 115 : 85, maxShields: damaged ? 100 : relayBonus ? 115 : 85, velocity: new THREE.Vector3(), lastDamage: -10, offset: position.clone().sub(escortAnchor) };
    allies.push(ally);
    return ally;
  }

  /** The walker is its own kind of enemy: armour, legs, a turret and a tow cable. */
  function spawnAtAt(position, variant = 'assault') {
    const mesh = world.hoth?.atAt?.group;
    if (!mesh) return null;
    mesh.visible = true;
    mesh.position.copy(position);
    mesh.quaternion.identity();
    mesh.scale.setScalar(AT_AT_SCALE);
    const unit = createAtAtUnit({ variant, seed: 11, stats: { position: { x: position.x, y: position.y, z: position.z } } });
    const snapshot = unit.getSnapshot();
    atAt = { mesh, unit, variant, health: snapshot.health, maxHealth: snapshot.maxHealth, part: 'armor', blocked: false, cableAttached: false, shellCooldown: 0, impactDone: false };
    if (atAtState) {
      atAt.health = atAtState.health;
      atAt.maxHealth = atAtState.maxHealth;
      atAtState = null;
    }
    return atAt;
  }

  /** Distance from a point to a segment: a swept bolt cannot slip past a joint. */
  function distanceToSegment(from, to, point) {
    const segment = to.clone().sub(from);
    const lengthSquared = segment.lengthSq();
    if (lengthSquared < 1e-8) return point.distanceTo(from);
    const t = Math.min(1, Math.max(0, point.clone().sub(from).dot(segment) / lengthSquared));
    return point.distanceTo(from.clone().addScaledVector(segment, t));
  }

  /** Which part of the walker a shot touches: frontal armour deflects, legs and turret do not. */
  function atAtHitPart(from, to) {
    if (!atAt || !atAt.mesh.visible) return null;
    const center = atAt.mesh.position;
    const forward = FORWARD.clone().applyQuaternion(atAt.mesh.quaternion);
    const hit = to.clone().sub(center);
    const distance = hit.length();
    if (distance > 60) return null;
    // The plate is frontal: it depends on where the shot came from, not where it landed.
    const along = from.clone().sub(center).normalize().dot(forward);
    const legs = atAt.mesh.userData.legs || [];
    for (const leg of legs) {
      // A leg is three vulnerable joints: the hip, the knee and the foot on the snow.
      for (const node of [leg.hip, leg.knee, leg.foot]) {
        if (!node) continue;
        const world = node.getWorldPosition(new THREE.Vector3());
        if (distanceToSegment(from, to, world) < AT_AT_RADIUS.leg) return 'leg';
      }
    }
    const head = atAt.mesh.userData.head;
    if (head) {
      const world = head.getWorldPosition(new THREE.Vector3());
      if (distanceToSegment(from, to, world) < AT_AT_RADIUS.turret) return 'turret';
    }
    if (distance < AT_AT_RADIUS.body) return along > 0.25 ? 'armor' : 'rear';
    return null;
  }

  function updateAtAt(dt) {
    if (!atAt) return;
    const unit = atAt.unit;
    const decision = unit.update(dt, { playerPosition: player.position, basePosition: hothBase, targetId: 'player', position: atAt.mesh.position });
    const snapshot = unit.getSnapshot();
    atAt.health = snapshot.health;
    atAt.part = snapshot.part || atAt.part;
    atAt.cableAttached = Boolean(unit.isCabled);
    if (decision.move) {
      atAt.mesh.position.x += decision.move.x * dt;
      atAt.mesh.position.z += decision.move.z * dt;
    }
    if (decision.move && (decision.move.x || decision.move.z)) {
      const heading = new THREE.Vector3(decision.move.x, 0, decision.move.z).normalize();
      atAt.mesh.quaternion.setFromUnitVectors(FORWARD, heading);
    }
    animateAtAtLegs(snapshot);
    if (atAt.unit.isCabled) {
      const collapse = atAt.unit.collapse(dt);
      const fall = Math.min(1, collapse.progress);
      atAt.mesh.rotation.z = fall * 1.25;
      atAt.mesh.rotation.x = fall * 0.22;
      atAt.mesh.position.y = -fall * fall * 4;
      if (collapse.impact && !atAt.impactDone) {
        atAt.impactDone = true;
        burst(atAt.mesh.position, 0, 7);
        audio.explosion();
        audio.stationExplosion?.();
      }
      return;
    }
    if (decision.fire) {
      const origin = atAt.mesh.position.clone().addScaledVector(FORWARD.clone().applyQuaternion(atAt.mesh.quaternion), 9);
      origin.y += 8;
      const direction = new THREE.Vector3(decision.aim.x, decision.aim.y, decision.aim.z).normalize();
      fireBolt(origin, direction, 'enemy', decision.fire.damage || 22, decision.fire.speed || 220, { type: 'shell', life: 4.5 });
      audio.turbolaser?.();
    }
  }

  /** Procedural walk cycle: four legs, diagonal synchronisation, body sway. */
  function animateAtAtLegs(snapshot) {
    const legs = atAt?.mesh?.userData?.legs || [];
    const phase = Number.isFinite(snapshot?.stepPhase) ? snapshot.stepPhase : 0;
    const offsets = [0, 0.5, 0.75, 0.25];
    legs.forEach((leg, index) => {
      const cycle = (phase + (offsets[index] ?? 0)) % 1;
      const swing = Math.sin(cycle * Math.PI * 2);
      const lift = Math.max(0, Math.cos(cycle * Math.PI * 2));
      if (leg.hip) leg.hip.rotation.x = swing * 0.3;
      if (leg.knee) leg.knee.rotation.x = -0.2 - lift * 0.55;
      if (leg.foot) leg.foot.rotation.x = 0.25 + swing * 0.18;
    });
    if (atAt?.mesh?.userData?.body) {
      atAt.mesh.userData.body.position.y = Math.sin(phase * Math.PI * 4) * 0.35;
      atAt.mesh.userData.body.rotation.z = Math.sin(phase * Math.PI * 2) * 0.02;
    }
  }

  /** A two-legged snow trooper walker: a squat body, a gun and two legs. */
  function spawnAtSt(position) {
    const mesh = createAtSt();
    mesh.position.copy(position);
    scene.add(mesh);
    const entity = { id: `at-st-${++entitySerial}`, kind: 'at-st', variant: 'walker', mesh, health: 90, radius: 9, velocity: new THREE.Vector3(), fireTimer: 1.4 + Math.random() * 1.4, seed: Math.random() * 20, stun: 0 };
    entity.brain = createTurretBrain('light', entity.fireTimer);
    enemies.push(entity);
    return entity;
  }

  function setupPhase(phase) {
    const previous = lastPhase;
    lastPhase = phase;
    clearCombat();
    world.setPhase(phase);
    collisionCooldown = 1;
    if (phase === 'combat') {
      player.position.set(0, 100, 800);
      player.quaternion.identity();
      for (let i = 0; i < 6; i++) {
        spawnTie(new THREE.Vector3((i % 3 - 1) * 130, 90 + Math.sin(i * 2) * 80, 280 - i * 100), i === 4 ? 'ace' : 'line');
      }
    } else if (phase === 'surface') {
      player.position.set(0, 55, 650);
      player.quaternion.identity();
      // A shallow initial descent puts the first gun battery in the reticle.
      player.rotateX(-0.14);
      spawnTurret(-90, -300);
      spawnTurret(100, -850, 'heavy');
      spawnTurret(-65, -1350);
      spawnTurret(75, -1800, 'heavy');
      spawnTurret(-190, -620, 'relay');
      spawnTurret(200, -1450, 'relay');
      relaysDestroyed = 0;
      shields = Math.max(shields, stats.shield * 0.8);
    } else if (phase === 'escort') {
      escortTactics.begin();
      escortChoicePending = true;
      const routeBattery = spawnTurret(190, 250, 'heavy');
      Object.assign(routeBattery, { id: 'escort-route-battery', bonusOnly: true, disabled: false });
      const powerNode = spawnTurret(-580, -650, 'relay');
      Object.assign(powerNode, { id: 'escort-power-node', bonusOnly: true, health: 85, radius: 14 });
      player.position.set(0, 125, 1100);
      player.quaternion.identity();
      escortAnchor.set(0, 90, 700);
      escortWaveTimer = 6;
      spawnAlly('gold-2', 'Золотой Два', 'ywing', new THREE.Vector3(-55, 90, 730));
      spawnAlly('gold-3', 'Золотой Три', 'ywing', new THREE.Vector3(55, 90, 730));
      spawnAlly('gold-5', 'Золотой Пять', 'ywing', new THREE.Vector3(0, 110, 680));
      for (let i = 0; i < 4; i++) spawnTie(new THREE.Vector3((i - 1.5) * 140, 135 + (i % 2) * 50, 210 - i * 100), i === 3 ? 'ace' : 'line');
      shields = Math.max(shields, stats.shield * 0.8);
    } else if (phase === 'assault') {
      player.position.set(0, 120, 650);
      player.quaternion.identity();
      escortAnchor.set(-65, 85, 250);
      spawnAlly('red-leader', 'Красный Лидер / Гарвен Дрейс', 'xwing', escortAnchor.clone());
      for (let i = 0; i < 3; i++) spawnTie(new THREE.Vector3((i - 1) * 180, 130 + i * 25, -120 - i * 170), i === 2 ? 'ace' : 'line');
    } else if (phase === 'defend') {
      player.position.set(0, 130, 700);
      player.quaternion.identity();
      escortAnchor.set(0, 100, 200);
      spawnAlly('wedge', 'Клин / Красный Два', 'xwing', new THREE.Vector3(0, 100, 200), true);
      for (let i = 0; i < 4; i++) spawnTie(new THREE.Vector3((i - 1.5) * 105, 115 + Math.sin(i) * 45, 390 - i * 45), i === 3 ? 'ace' : 'line');
      if (previous === 'assault') beginRedLeaderDeparture();
    } else if (phase === 'trench') {
      player.position.set(0, -45, 1000);
      player.quaternion.identity();
      shields = stats.shield;
      hull = Math.max(hull, stats.hull * 0.65);
      world.checkpoints.forEach(checkpoint => { checkpoint.visible = true; });
      spawnTie(new THREE.Vector3(0, -40, 400));
      spawnTie(new THREE.Vector3(25, -30, -800));
      spawnTie(new THREE.Vector3(0, -43, 1280), 'vader');
      audio.klaxon?.();
    } else if (phase === 'qte') {
      const forced = campaign.getSnapshot().mission.forceShipId;
      if (forced && selectedShipId !== forced) replaceShip(forced);
      player.position.set(0, -45, -2900);
      player.quaternion.identity();
      speed = 0;
      mode = 'qte';
      lastQteStage = -1;
      superlaserCharging = false;
      clearInput();
      exitPointerLock();
    } else if (phase === 'cinematic') {
      mode = 'cinematic';
      cockpit.visible = false;
      player.visible = false;
      explosionPlayed = false;
      torpedoImpactPlayed = false;
      clearInput();
      exitPointerLock();
    } else if (phase === 'hoth-arrival') {
      player.position.set(0, 150, 950);
      player.quaternion.identity();
      for (let i = 0; i < 4; i++) spawnTie(new THREE.Vector3((i % 2 - 0.5) * 260, 130 + i * 25, 380 - i * 190));
      shields = Math.max(shields, stats.shield * 0.9);
    } else if (phase === 'hoth-assault') {
      player.position.set(0, 80, 780);
      player.quaternion.identity();
      spawnAtSt(new THREE.Vector3(-120, 0, 120));
      spawnAtSt(new THREE.Vector3(300, 0, -320));
      spawnAtSt(new THREE.Vector3(160, 0, -180));
      spawnAtSt(new THREE.Vector3(-40, 0, -520));
      spawnAtSt(new THREE.Vector3(220, 0, -760));
      spawnTurret(-260, -260);
      spawnTurret(280, -980, 'heavy');
      for (let i = 0; i < 2; i++) spawnTie(new THREE.Vector3((i - 0.5) * 320, 120, 200 - i * 320));
    } else if (phase === 'hoth-atat') {
      player.position.set(0, 34, 620);
      player.quaternion.identity();
      spawnAtAt(new THREE.Vector3(90, 0, 120));
      shields = Math.max(shields, stats.shield * 0.85);
    } else if (phase === 'hoth-tow') {
      const forced = campaign.getSnapshot().mission.forceShipId;
      if (forced && selectedShipId !== forced) replaceShip(forced);
      if (!atAt) spawnAtAt(new THREE.Vector3(60, 0, 120));
      player.position.set(0, 16, 420);
      player.quaternion.identity();
      speed = 0;
      mode = 'qte';
      lastQteStage = -1;
      superlaserCharging = false;
      clearInput();
      exitPointerLock();
    } else if (phase === 'hoth-fall') {
      if (!atAt) spawnAtAt(new THREE.Vector3(60, 0, 60));
      atAt?.unit.attachTowCable('leg');
      mode = 'cinematic';
      cockpit.visible = false;
      player.visible = false;
      explosionPlayed = false;
      torpedoImpactPlayed = false;
      clearInput();
      exitPointerLock();
    } else if (phase === 'hoth-evacuation') {
      player.position.set(0, 120, 900);
      player.quaternion.identity();
      escortAnchor.set(0, 90, 520);
      spawnAlly('gold-2', 'Золотой Два', 'ywing', new THREE.Vector3(-70, 95, 560));
      spawnAlly('gold-3', 'Золотой Три', 'ywing', new THREE.Vector3(70, 95, 560));
      for (let i = 0; i < 3; i++) spawnTie(new THREE.Vector3((i - 1) * 240, 140 + i * 20, 120 - i * 240));
      shields = Math.max(shields, stats.shield * 0.8);
    } else if (phase === 'victory') {
      mode = 'victory';
      onEvent({ type: 'victory', elapsed: totalElapsed, kills });
    }
    resetFlightState(flight, FORWARD.clone().applyQuaternion(player.quaternion), speed);
    setupMissionContent(phase);
    if (previous !== 'menu' && previous !== phase) {
      onEvent({ type: 'mission-complete', missionId: previous });
    }
    // The Hoth tow run and the fall are scripted phases: they own the camera and the input.
    if (!['qte', 'hoth-tow', 'cinematic', 'hoth-fall', 'victory'].includes(phase)) mode = 'playing';
    camera.position.copy(player.position).add(new THREE.Vector3(0, 9, 30));
    snapChaseCamera = true;
    emitSnapshot();
  }

  function projectTarget(enemy) {
    temporary.copy(enemy.mesh.position).project(camera);
    if (temporary.z < -1 || temporary.z > 1 || Math.abs(temporary.x) > 1.2 || Math.abs(temporary.y) > 1.2) return null;
    return {
      x: temporary.x * 0.5 + 0.5, y: 0.5 - temporary.y * 0.5,
      distance: Math.round(enemy.mesh.position.distanceTo(player.position)), kind: enemy.kind,
      pilotRole: enemy.pilotRole, squadRole: enemy.squadRole,
      variant: enemy.variant, aiState: enemy.aiState || 'tracking', telegraph: Boolean(enemy.telegraph),
    };
  }

  function findAimTarget(profile = armament.current()) {
    camera.updateMatrixWorld();
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    let best = null;
    let score = profile.lockDot ?? 0.96;
    const trackedId = targetLock.snapshot().targetId;
    for (const enemy of enemies) {
      if (enemy.health <= 0 || enemy.disabled || enemy.retreat || !insideLockCone(player.position, forward, enemy.mesh.position, profile.lockDot ?? 0.96, profile.range || 1400)) continue;
      const projected = projectTarget(enemy);
      if (!projected || projected.x < 0 || projected.x > 1 || projected.y < 0 || projected.y > 1 || !stationLineOfSight(player.position, enemy.mesh.position, campaign.getSnapshot().phase)) continue;
      if (enemy.id === trackedId) return enemy;
      const dot = enemy.mesh.position.clone().sub(player.position).normalize().dot(forward);
      if (dot >= score) { best = enemy; score = dot; }
    }
    return best;
  }

  function updateTargetLock(dt) {
    const weapon = armament.current();
    const candidate = weapon.type === 'torpedo' ? findAimTarget(weapon) : null;
    targetLock.update(candidate?.id, dt * shipSystems.snapshot().effects.sensorLockRate, { enabled: weapon.type === 'torpedo' });
  }

  function getSnapshot() {
    const state = campaign.getSnapshot();
    const content = missionDirector.getSnapshot();
    const completed = [...content.history, ...content.sideObjectives];
    content.completedObjectives = completed.filter(objective => objective.complete).length;
    content.totalObjectives = completed.length;
    content.bonusScore = (content.bonusScore || 0) + tacticalScore;
    const coordination = squadron.snapshot();
    const active = mode !== 'menu';
    const availableWeapons = armament.getSnapshot();
    const selectedWeapon = availableWeapons.find(weapon => weapon.selected);
    const lock = targetLock.snapshot();
    const lockCandidate = selectedWeapon.type === 'torpedo' ? findAimTarget() : null;
    const locked = lock.acquired && lock.targetId === lockCandidate?.id;
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    // Project the firing axis through the current camera: the exterior offset,
    // camera lag and cockpit view cannot share a fixed HUD percentage.
    camera.updateMatrixWorld();
    const reticlePoint = player.position.clone().addScaledVector(forward, 1000).project(camera);
    const target = enemies.filter(enemy => enemy.health > 0 && !enemy.disabled)
      .map(enemy => ({ enemy, dot: enemy.mesh.position.clone().sub(player.position).normalize().dot(forward) }))
      .sort((a, b) => b.dot - a.dot)[0];
    const displayedTarget = lockCandidate || target?.enemy;
    const visibleTarget = displayedTarget ? projectTarget(displayedTarget) : null;
    let lead = null;
    if (mode === 'playing' && selectedWeapon.type !== 'torpedo' && target?.dot > .8 && displayedTarget?.mesh.position.distanceTo(player.position) <= (selectedWeapon.range || 1400)) {
      const prediction = getLeadSolution({ origin: player.position, targetPosition: displayedTarget.mesh.position, targetVelocity: displayedTarget.velocity, projectileSpeed: selectedWeapon.speed || 670 }).point;
      const point = new THREE.Vector3(prediction.x, prediction.y, prediction.z).project(camera);
      if (point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1) lead = { x: point.x * .5 + .5, y: .5 - point.y * .5, targetId: displayedTarget.id };
    }
    let objectiveMarker = null;
    if (state.phase === 'trench') {
      const checkpoint = world.checkpoints[state.progress];
      if (checkpoint) {
        temporary.copy(checkpoint.position).project(camera);
        objectiveMarker = { x: temporary.x * 0.5 + 0.5, y: 0.5 - temporary.y * 0.5, distance: Math.round(checkpoint.position.distanceTo(player.position)) };
      }
    } else if (state.phase === 'assault') {
      const point = state.mission.combatRoute.point;
      temporary.set(point.x, point.y, point.z).project(camera);
      objectiveMarker = { x: temporary.x * .5 + .5, y: .5 - temporary.y * .5, distance: Math.round(player.position.distanceTo(new THREE.Vector3(point.x, point.y, point.z))) };
    } else if (state.phase === 'escort' || state.phase === 'defend') {
      const markerPosition = state.phase === 'escort' ? escortAnchor : allies[0]?.mesh.position;
      if (markerPosition) {
        temporary.copy(markerPosition).project(camera);
        objectiveMarker = { x: temporary.x * 0.5 + 0.5, y: 0.5 - temporary.y * 0.5, distance: Math.round(markerPosition.distanceTo(player.position)) };
      }
    }
    return {
      assault: state.assault,
      mode, phase: active ? state.phase : 'menu', shipId: selectedShipId, camera: cameraMode, graphicsQuality: renderPipeline.inspect().quality,
      reticle: { x: reticlePoint.x * 0.5 + 0.5, y: 0.5 - reticlePoint.y * 0.5 },
      health: Math.round(hull / stats.hull * 100), shields: Math.round(shields / stats.shield * 100),
      speed: Math.round(speed), maxSpeed: stats.boostSpeed * getPowerProfile(powerMode).boost,
      flight: { velocity: { ...flight.velocity }, slip: flight.slip, turnAuthority: flight.turnAuthority, drifting: flight.drifting, throttleSpeed: flight.throttleSpeed },
      powerMode, powerProfile: getPowerProfile(powerMode),
      squadron: coordination, systems: shipSystems.snapshot(), tacticalScore, wingOrder: wingOrders.snapshot(),
      repair: { ...repairSystem.getSnapshot(), target: repairTarget },
      support: { ...supportSystem.getSnapshot(), active: supportWingmen.length > 0 },
      sfoils: { mode: sfoilsMode, openness: sfoilsOpenness, available: selectedShipId === 'xwing' },
      heat: Math.round(heat * 100), abilityCooldown: Math.max(0, abilityCooldown), abilityActive: abilityRemaining > 0,
      weapon: { id: selectedWeapon.id, name: selectedWeapon.name, ammo: selectedWeapon.ammo, reserve: selectedWeapon.reserve, cooldown: Math.max(selectedWeapon.cooldown, weaponFaultDelay), reloading: selectedWeapon.reloading, reloadRemaining: selectedWeapon.reloadRemaining, reloadDuration: selectedWeapon.reloadDuration, locked, lockProgress: lock.progress, lockStatus: lock.status, lockDuration: lock.duration / shipSystems.snapshot().effects.sensorLockRate, lockTargetId: lockCandidate?.id || null, guidance: locked ? 'guided' : 'unguided' },
      weapons: availableWeapons,
      kills, targetCount: enemies.filter(enemy => !enemy.disabled).length, accuracy: { shots: shotsFired, hits: shotsHit }, elapsed: totalElapsed,
      mission: active ? { ...state.mission, progress: Math.round(state.progress / state.target * 100), count: state.progress, target: state.target } : null,
      qte: mode === 'qte' ? state.qte : null,
      targeting: visibleTarget && (lockCandidate || target?.dot > .3) ? { ...visibleTarget, id: displayedTarget.id, lockProgress: lockCandidate?.id === lock.targetId ? lock.progress : 0, locked } : null,
      lead,
      targets: enemies.filter(enemy => !enemy.disabled).map(projectTarget).filter(Boolean), objectiveMarker,
      allies: allies.map(ally => {
        const relative = ally.mesh.position.clone().sub(player.position).applyQuaternion(player.quaternion.clone().invert());
        return { id: ally.id, name: ally.name, kind: ally.kind, health: Math.round(ally.health / ally.maxHealth * 100), shields: Math.round(ally.shields / ally.maxShields * 100), distance: Math.round(ally.mesh.position.distanceTo(player.position)), position: { x: ally.mesh.position.x, y: ally.mesh.position.y, z: ally.mesh.position.z }, bearing: Math.atan2(relative.x, -relative.z) };
      }),
      fleetHealth: allies.length ? Math.round(allies.reduce((total, ally) => total + ally.health / ally.maxHealth, 0) / allies.length * 100) : null,
      escortTactics: state.phase === 'escort' ? escortTactics.snapshot() : null,
      escortDistance: state.phase === 'escort' ? Math.max(0, escortAnchor.z - (escortWaypoints[state.progress] ?? escortAnchor.z)) : null,
      sideObjectives: [...(state.sideObjectives || []), ...content.sideObjectives], content,
      worldMarkers: [...(coordination.pendingReinforcement ? enemies.filter(enemy => enemy.id === coordination.pendingReinforcement.enemyId).map(enemy => ({ id: 'reinforcement-caller', position: enemy.mesh.position, label: `ВЫЗОВ ПОДКРЕПЛЕНИЯ · ${coordination.pendingReinforcement.remaining.toFixed(1)} С` })) : []), ...(state.phase === 'escort' ? enemies.filter(enemy => !enemy.disabled && ['escort-route-battery', 'escort-power-node'].includes(enemy.id)).map(enemy => ({ id: enemy.id, position: enemy.mesh.position, label: enemy.id === 'escort-route-battery' ? 'ТЯЖЁЛАЯ БАТАРЕЯ' : 'ПИТАЮЩИЙ УЗЕЛ · ЩИТЫ +25' })) : []), ...content.sideObjectives.flatMap(objective => {
        if (objective.status !== 'active') return [];
        if (objective.kind === 'scan') return [{ id: objective.id, position: objective.position, label: 'ДАТЧИК · CTRL / СКАН', progress: objective.progress / objective.target }];
        const ids = objective.targetIds || [objective.targetId];
        return enemies.filter(enemy => ids.includes(enemy.id)).map(enemy => ({ id: enemy.id, position: enemy.mesh.position, label: objective.kind === 'destroy' ? 'РЕГУЛЯТОР' : 'ФЛАНГОВЫЙ TIE' }));
      }), ...missionProps.filter(prop => prop.kind === 'vent' && (content.vent?.active || content.vent?.telegraph)).map(prop => ({ id: prop.id, position: { x: prop.mesh.position.x, y: -45, z: prop.mesh.position.z }, label: content.vent.active ? 'ОПАСНО · СБРОС' : 'СБРОС · УЙДИТЕ ВПРАВО' }))].flatMap(marker => {
        const point = new THREE.Vector3(marker.position.x, marker.position.y, marker.position.z);
        const distance = point.distanceTo(player.position);
        point.project(camera);
        return distance < 1800 && point.z > -1 && point.z < 1 && Math.abs(point.x) < 1 && Math.abs(point.y) < 1
          ? [{ id: marker.id, x: point.x * 0.5 + 0.5, y: 0.5 - point.y * 0.5, distance: Math.round(distance), label: marker.label, status: 'active', progress: marker.progress || 0 }] : [];
      }),
      enemies: enemies.filter(enemy => !enemy.disabled).map(enemy => {
        const relative = enemy.mesh.position.clone().sub(player.position).applyQuaternion(player.quaternion.clone().invert());
        return { bearing: Math.atan2(relative.x, -relative.z), distance: relative.length(), kind: enemy.kind, aiState: enemy.aiState || 'tracking', aiTarget: enemy.aiTarget || 'player', telegraph: Boolean(enemy.telegraph), evading: Boolean(enemy.evading) };
      }),
      radio: state.radio, reason: state.reason || '', muted: audio.muted,
      atAt: atAt ? { health: atAt.health, maxHealth: atAt.maxHealth, part: atAt.part, blocked: atAt.blocked, cabled: atAt.cableAttached, phase: atAt.unit.getSnapshot().phase, position: { x: atAt.mesh.position.x, y: atAt.mesh.position.y, z: atAt.mesh.position.z } } : null,
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
    };
  }
  function emitSnapshot() { onSnapshot(getSnapshot()); }

  function syncCampaign() {
    const state = campaign.getSnapshot();
    if (state.failed && mode !== 'defeat') {
      if (lastPhase === 'qte') audio.superlaserFire?.();
      mode = 'defeat';
      clearInput();
      exitPointerLock();
      onEvent({ type: 'defeat', reason: state.reason });
    } else if (state.phase !== lastPhase && !state.failed) setupPhase(state.phase);
    const radioKey = state.radio ? `${state.radio.speaker}:${state.radio.text}` : '';
    if (radioKey && radioKey !== lastRadio) {
      lastRadio = radioKey;
      onEvent({ type: 'radio', ...state.radio });
    }
    if (state.qte && state.qte.stage !== lastQteStage) {
      lastQteStage = state.qte.stage;
      audio.cue();
    }
  }

  function burst(position, colorIndex = 0, size = 1) {
    for (let i = 0; i < 13; i++) {
      const debris = i > 9 && colorIndex !== 3;
      const mesh = debris ? new THREE.Mesh(effectGeometry, debrisMaterial.clone()) : new THREE.Sprite(effectMaterials[(colorIndex + i % 3) % effectMaterials.length].clone());
      mesh.position.copy(position);
      mesh.scale.setScalar(size * (1 + Math.random() * 2) * (debris ? 0.5 : 3));
      scene.add(mesh);
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
      const life = 0.3 + Math.random() * 0.45;
      effects.push({ mesh, velocity, life, maxLife: life, debris });
    }
  }

  /** A short, bright flare where a weapon discharges. */
  function muzzleFlash(position, kind = 'laser', size = 1) {
    const base = flashMaterials[kind] || flashMaterials.laser;
    const material = base.clone();
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(2 * size);
    scene.add(sprite);
    flashes.push({ sprite, material, life: 0.12, maxLife: 0.12, size });
  }

  function updateFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i];
      flash.life -= dt;
      const ratio = Math.max(0, flash.life / flash.maxLife);
      flash.sprite.scale.setScalar((1.6 + (1 - ratio) * 3.4) * flash.size);
      flash.material.opacity = ratio * ratio;
      if (flash.life <= 0) {
        scene.remove(flash.sprite);
        flash.material.dispose();
        flashes.splice(i, 1);
      }
    }
  }

  function damagePlayer(amount) {
    if (!['playing', 'qte'].includes(mode)) return;
    const shielded = shields > 0;
    const next = absorbDamage(hull, shields, abilityRemaining > 0 && stats.ability.id === 'shield-focus' ? amount * 0.55 : amount);
    const hullDamage = hull - next.health;
    hull = next.health;
    const fault = shipSystems.damage(hullDamage);
    if (fault) {
      const system = shipSystems.snapshot().systems.find(item => item.id === fault);
      onEvent({ type: 'system-damage', system: fault, name: system?.name });
      onEvent({ type: 'radio', speaker: 'R2-D2', text: `Повреждение: ${system?.name || fault}. B — выбрать систему, V — ремонт. Корпус и системы ремонтируются отдельно.` });
    }
    shields = next.shields;
    if (amount > 0 && repairSystem.interrupt()) onEvent({ type: 'repair', status: 'interrupted' });
    lastDamage = totalElapsed;
    audio.hit(shielded);
    onEvent({ type: 'damage', amount });
    if (hull <= 0) {
      burst(player.position, 0, 3);
      audio.explosion();
      campaign.fail('Истребитель потерян. Явин ждёт нового захода.');
      syncCampaign();
      emitSnapshot();
    }
  }

  // A true crash kills the fighter outright regardless of remaining hull.
  function crashPlayer(reason) {
    if (!['playing', 'qte'].includes(mode)) return;
    hull = 0;
    shields = 0;
    burst(player.position, 0, 3);
    audio.crash?.();
    campaign.fail(reason);
    syncCampaign();
    emitSnapshot();
  }

  function destroyEnemy(enemy) {
    if (!enemies.includes(enemy)) return;
    targetLock.invalidate(enemy.id);
    if (enemy.kind === 'vader') {
      enemy.health = 1;
      enemy.retreat = true;
      enemy.stun = 0;
      enemy.mesh.userData.engineBoost = 1;
      onEvent({ type: 'radio', speaker: 'Красный Пять', text: 'TIE Advanced вышел из захода. Продолжаю к шахте!' });
      return;
    }
    burst(enemy.mesh.position, 0, enemy.kind === 'turret' ? 5 : 2.5);
    audio.explosion();
    removeEntity(enemy);
    enemies.splice(enemies.indexOf(enemy), 1);
    kills += 1;
    if (campaign.getSnapshot().phase === 'escort') handleEscortTactics(escortTactics.recordDestroyed(enemy.id, { kind: enemy.kind }));
    handleMissionEvents(missionDirector.recordTargetDestroyed(enemy.id));
    if (enemy.kind === 'relay' && !enemy.bonusOnly) {
      relaysDestroyed += 1;
      campaign.recordSideObjective?.('surface-relays', 1);
      if (relaysDestroyed >= 2) {
        relayBonus = true;
        onEvent({ type: 'radio', speaker: 'Золотой Два', text: 'Энергетические узлы уничтожены. Батареи ослабли, щиты группы заряжаются.' });
      }
    } else if (!enemy.bonusOnly) campaign.recordKill(enemy.kind);
    onEvent({ type: 'kill', kind: enemy.kind, kills });
  }

  function damageAlly(ally, amount) {
    if (mode !== 'playing' || !allies.includes(ally)) return;
    const next = absorbDamage(ally.health, ally.shields, amount);
    ally.health = next.health;
    ally.shields = next.shields;
    ally.lastDamage = totalElapsed;
    burst(ally.mesh.position, 3, 0.5);
    if (ally.health > 0) return;
    burst(ally.mesh.position, 0, 3);
    audio.explosion();
    removeEntity(ally);
    allies.splice(allies.indexOf(ally), 1);
    onEvent({ type: 'ally-lost', allyId: ally.id, name: ally.name });
    const phase = campaign.getSnapshot().phase;
    if (phase === 'assault' && ally.id === 'red-leader') { campaign.fail('Красный Лидер сбит до выхода на торпедный вектор. Прикройте его заход.'); syncCampaign(); }
    if ((phase === 'escort' && allies.length === 0) || (phase === 'defend' && ally.id === 'wedge')) {
      campaign.fail(phase === 'escort' ? 'Золотая группа потеряна. Ударная операция сорвана.' : 'Красный Два потерян. Прикрытие отхода не удалось.');
      syncCampaign();
    }
  }

  function updateAllies(dt) {
    const state = campaign.getSnapshot();
    if (!['escort', 'defend', 'assault'].includes(state.phase)) return;
    if (state.phase === 'escort') {
      const goalZ = escortWaypoints[state.progress];
      if (goalZ !== undefined) escortAnchor.z = Math.max(goalZ, escortAnchor.z - 52 * dt);
      escortWaveTimer -= dt;
      if (escortWaveTimer <= 0 && enemies.filter(enemy => enemy.kind === 'tie').length < 3) {
        spawnTie(escortAnchor.clone().add(new THREE.Vector3((Math.random() - 0.5) * 250, 65, 650)), Math.random() > 0.65 ? 'ace' : 'line');
        escortWaveTimer = 7;
      }
    } else if (state.phase === 'assault') {
      escortAnchor.z = Math.max(state.mission.combatRoute.point.z - 80, escortAnchor.z - 52 * dt);
    } else {
      escortAnchor.z -= 36 * dt;
      escortAnchor.x = Math.sin(state.elapsed * 0.28) * 40;
      escortAnchor.y = 100 + Math.sin(state.elapsed * 0.6) * 13;
    }
    for (const ally of allies) {
      const before = ally.mesh.position.clone();
      const desired = escortAnchor.clone().add(state.phase === 'escort' ? ally.offset : new THREE.Vector3());
      ally.mesh.position.lerp(desired, 1 - Math.exp(-dt * 2.3));
      ally.velocity.copy(ally.mesh.position).sub(before).divideScalar(Math.max(dt, 0.001));
      ally.mesh.rotation.z = Math.sin(state.elapsed * 0.4 + ally.offset.x) * 0.025;
      if (totalElapsed - ally.lastDamage > 6) ally.shields = Math.min(ally.maxShields, ally.shields + dt * (relayBonus ? 4 : 2));
    }
    if (state.phase === 'escort') {
      const goalZ = escortWaypoints[state.progress];
      const arrived = goalZ !== undefined && escortAnchor.z <= goalZ && allies.length > 0 && allies.every(ally => ally.mesh.position.distanceTo(escortAnchor.clone().add(ally.offset)) < 12);
      if (arrived && player.position.distanceTo(escortAnchor) <= 700) {
        campaign.recordEscortCheckpoint();
        const reward = escortBonus.update({ phase: 'escort', allyHealth: allies.map(ally => ally.health / ally.maxHealth * 100), checkpoint: state.progress + 1 });
        tacticalScore += reward.score;
        for (const event of reward.events) onEvent({ ...event, type: 'side-complete', title: 'Золотая группа сохранена', bonus: reward.score });
        audio.cue();
      }
    }
  }

  /** The tow-cable run is a scripted low pass under the walker. */
  const HOTH_TOW_PATH = [
    { from: new THREE.Vector3(60, 46, 420), to: new THREE.Vector3(60, 6, 300) },
    { from: new THREE.Vector3(60, 6, 300), to: new THREE.Vector3(60, 6, 40) },
    { from: new THREE.Vector3(60, 6, 40), to: new THREE.Vector3(150, 30, 150) },
    { from: new THREE.Vector3(150, 30, 150), to: new THREE.Vector3(220, 150, 320) },
  ];

  function updateHothTow(dt) {
    const state = campaign.getSnapshot();
    const qte = state.qte;
    if (!qte) return;
    const stage = Math.min(HOTH_TOW_PATH.length - 1, qte.stage);
    const leg = HOTH_TOW_PATH[stage];
    const duration = state.mission?.qte?.[stage]?.duration || 2;
    const elapsed = duration - Math.max(0, qte.remaining);
    const t = Math.min(1, Math.max(0, elapsed / Math.max(0.1, duration)));
    player.position.lerpVectors(leg.from, leg.to, t);
    const walker = atAt?.mesh?.position || new THREE.Vector3(60, 0, 120);
    const heading = walker.clone().sub(player.position).normalize();
    player.quaternion.setFromUnitVectors(FORWARD, heading);
    speed = 120;
  }

  /** Rebel transports leave the pad one by one; the player shepherds them out. */
  function updateHothEvacuation() {
    const state = campaign.getSnapshot();
    if (state.phase !== 'hoth-evacuation') return;
    const transports = world.hoth?.transports || [];
    const next = transports[state.progress];
    if (next && next.state === 'parked') world.hoth.launchTransport(next.id);
    const airborne = transports.filter(transport => transport.state !== 'parked');
    const last = airborne[airborne.length - 1];
    if (!last || state.progress >= state.target) return;
    if (last.group.position.y > 90 && player.position.distanceTo(last.group.position) < 1200) {
      campaign.recordEscortCheckpoint();
      audio.cue();
      onEvent({ type: 'radio', speaker: 'Штурман транспорта', text: `Транспорт ${state.progress + 1} ушёл с площадки. Держим курс на флот.` });
    }
  }

  function updateSupportWingmen(dt) {
    const retired = [];
    for (const wingman of supportWingmen) {
      wingman.life -= dt;
      wingman.age += dt;
      wingman.fireTimer -= dt;
      const targetId = wingOrders.selectTarget({ wingmanId: wingman.id,
        enemies: enemies.map(enemy => ({ id: enemy.id, kind: enemy.kind, disabled: enemy.disabled, retreat: enemy.retreat, health: enemy.health, position: enemy.mesh.position })),
        playerPosition: player.position, playerTargetId: findAimTarget({ lockDot: 0.88, range: 2200 })?.id,
        escortAllies: allies.map(ally => ({ id: ally.id, health: ally.health / ally.maxHealth, position: ally.mesh.position })) });
      wingman.target = enemies.find(enemy => enemy.id === targetId) || null;
      const target = wingman.target && enemies.includes(wingman.target) && wingman.target.health > 0 && !wingman.target.disabled && !wingman.target.retreat ? wingman.target : null;
      if (!target) wingman.target = null;
      let direction;
      if (target && wingman.mesh.position.distanceTo(target.mesh.position) > 105) {
        direction = target.mesh.position.clone().sub(wingman.mesh.position).normalize();
      } else {
        const anchor = wingOrders.snapshot().order === 'escort' && allies.length ? allies[0].mesh.position : player.position;
        const formation = anchor.clone().add(new THREE.Vector3(wingman.side * 45, 20, 65));
        direction = formation.sub(wingman.mesh.position).normalize();
      }
      wingman.velocity.copy(direction).multiplyScalar(190);
      wingman.mesh.position.addScaledVector(wingman.velocity, dt);
      const attitude = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
      wingman.mesh.quaternion.slerp(attitude, Math.min(1, dt * 3));
      wingman.mesh.userData.setSfoils?.(1);
      if (target && wingman.age > 0.25 && wingman.fireTimer <= 0 && wingman.mesh.position.distanceTo(target.mesh.position) < 1500) {
        const distance = target.mesh.position.distanceTo(wingman.mesh.position);
        const aim = target.mesh.position.clone().addScaledVector(target.velocity, distance / 720).sub(wingman.mesh.position).normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(wingman.mesh.quaternion);
        for (const sign of [-1, 1]) {
          const muzzle = wingman.mesh.position.clone().addScaledVector(right, sign * 3).addScaledVector(aim, 8);
          fireBolt(muzzle, aim, 'friendly', 14, 720, { type: 'laser' });
          muzzleFlash(muzzle, 'laser', 0.8);
        }
        audio.laser();
        wingman.fireTimer = 0.6;
      }
      if (wingman.life <= 0) retired.push(wingman);
    }
    for (const wingman of retired) {
      removeEntity(wingman);
      supportWingmen.splice(supportWingmen.indexOf(wingman), 1);
    }
  }

  function updateSfoils(dt) {
    if (selectedShipId !== 'xwing') { sfoilsOpenness = 1; return; }
    const forcedOpen = ['qte', 'cinematic', 'victory'].includes(mode);
    const target = forcedOpen || sfoilsMode === 'open' || (sfoilsMode === 'auto' && mode !== 'menu') ? 1 : 0;
    sfoilsOpenness = THREE.MathUtils.damp(sfoilsOpenness, target, 2.5, dt);
    if (Math.abs(sfoilsOpenness - target) < 0.002) sfoilsOpenness = target;
    shipMesh.userData.setSfoils?.(sfoilsOpenness);
  }

  function fireBolt(position, direction, owner, damage, velocity = 670, options = {}) {
    if (projectiles.length > 130) return;
    const ion = options.type === 'ion';
    const mesh = new THREE.Mesh(boltGeometry, options.type === 'shell' ? shellBoltMaterial : ion ? ionBoltMaterial : owner !== 'enemy' ? playerBoltMaterial : enemyBoltMaterial);
    const head = new THREE.Sprite(options.type === 'shell' ? boltHeadMaterials[1] : ion ? boltHeadMaterials[2] : owner !== 'enemy' ? boltHeadMaterials[0] : boltHeadMaterials[1]);
    head.scale.setScalar(options.type === 'shell' ? 2.6 : ion ? 1.9 : 1.5);
    mesh.add(head);
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(FORWARD, direction);
    scene.add(mesh);
    const projectile = { mesh, owner, damage, velocity: direction.clone().multiplyScalar(velocity), life: owner !== 'enemy' ? 2.3 : 4.5, ...options };
    projectiles.push(projectile);
    return projectile;
  }

  function firePlayer() {
    const weapon = armament.current();
    if (mode !== 'playing' || weaponFaultDelay > 0 || repairSystem.getSnapshot().active || projectiles.length >= 128 || (weapon.heat > 0 && heat >= 0.97)) return;
    if (selectedShipId === 'xwing') {
      if (sfoilsMode === 'closed' || sfoilsOpenness < 1) return;
    }
    if (!armament.consumeShot()) return;
    weaponFaultDelay = weapon.cooldown * shipSystems.snapshot().effects.weaponCooldown;
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    const candidate = weapon.type === 'torpedo' ? findAimTarget(weapon) : null;
    const lock = targetLock.snapshot();
    const best = lock.acquired && lock.targetId === candidate?.id ? candidate : null;
    const direction = forward.clone();
    if (weapon.type === 'torpedo') {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(torpedoGeometry, torpedoMaterial));
      const tail = new THREE.Mesh(torpedoTailGeometry, torpedoGlowMaterial);
      tail.position.z = 7;
      mesh.add(tail);
      mesh.position.copy(player.position).addScaledVector(forward, 10);
      mesh.quaternion.copy(player.quaternion);
      scene.add(mesh);
      projectiles.push({ mesh, owner: 'player', type: 'torpedo', damage: weapon.damage, velocity: forward.multiplyScalar(weapon.speed), life: 6.5, target: best, profile: weapon });
      muzzleFlash(mesh.position, 'torpedo', 1.8);
      shotsFired += 1;
      audio.torpedo?.();
    } else {
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
      for (const sign of [-1, 1]) {
        const origin = player.position.clone().addScaledVector(side, sign * 4).addScaledVector(forward, 7);
        fireBolt(origin, direction, 'player', (weapon.type === 'ion' ? weapon.damage * 0.5 : weapon.damage * 0.6) * getPowerProfile(powerMode).damage, weapon.speed, { type: weapon.type, stun: weapon.stun || 0 });
        muzzleFlash(origin, weapon.type === 'ion' ? 'ion' : 'laser', weapon.type === 'ion' ? 1.3 : 1);
        shotsFired += 1;
      }
      if (weapon.type === 'ion') audio.ion?.();
      else audio.laser();
    }
    heat = Math.min(1, heat + (weapon.heat || 0));
  }

  function updateFlight(dt) {
    const pitch = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const yaw = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const roll = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
    const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const braking = keys.has('ControlLeft') || keys.has('ControlRight');
    const power = getPowerProfile(powerMode);
    const authority = getFlightTurnAuthority(speed, stats.speed * power.speed);
    const turnRate = stats.turnRate * authority;
    rotation.setFromAxisAngle(AXIS_X, pitch * turnRate * dt + THREE.MathUtils.clamp(mousePitch, -.16, .16) * authority);
    player.quaternion.multiply(rotation);
    rotation.setFromAxisAngle(UP, yaw * turnRate * dt + THREE.MathUtils.clamp(mouseYaw, -.16, .16) * authority);
    player.quaternion.multiply(rotation);
    rotation.setFromAxisAngle(AXIS_Z, roll * stats.turnRate * dt);
    player.quaternion.multiply(rotation).normalize();
    const turning = Boolean(pitch || yaw || Math.abs(mouseYaw) + Math.abs(mousePitch) > .0001);
    mouseYaw = 0;
    mousePitch = 0;
    temporary.copy(FORWARD).applyQuaternion(player.quaternion);
    const phase = campaign.getSnapshot().phase;
    const systems = shipSystems.snapshot().effects;
    const flightStats = { ...stats, accelerationScale: systems.acceleration };
    const flightPower = { ...power, speed: power.speed * systems.thrust, boost: power.boost * systems.thrust };
    stepFlight(flight, { dt, heading: temporary, stats: flightStats, power: flightPower, boosting, braking, turning, trench: phase === 'trench' });
    speed = flight.speed;
    player.position.x += flight.velocity.x * dt;
    player.position.y += flight.velocity.y * dt;
    player.position.z += flight.velocity.z * dt;
    collisionCooldown = Math.max(0, collisionCooldown - dt);
    if (phase === 'trench') {
      const inWall = Math.abs(player.position.x) > 66 && player.position.y < 75;
      const inFloor = player.position.y < -127;
      // Floor hits are instant wrecks; walls only at race pace. Everything
      // below that threshold keeps the forgiving scrape behaviour.
      const hardContact = inFloor || (inWall && lethalImpact({ speed, maxSpeed: stats.speed, kind: 'wall' }));
      if (inFloor) {
        crashPlayer('Удар о пол траншеи.');
      } else if (inWall && hardContact && collisionCooldown === 0) {
        crashPlayer('Влет в стену траншеи.');
      } else if ((inWall || player.position.y > 105) && collisionCooldown === 0) {
        damagePlayer(24);
        collisionCooldown = 1.2;
        player.position.x = THREE.MathUtils.clamp(player.position.x, -50, 50);
        player.position.y = THREE.MathUtils.clamp(player.position.y, -105, 25);
        player.quaternion.slerp(new THREE.Quaternion(), 0.8);
        speed *= 0.6;
        resetFlightState(flight, FORWARD.clone().applyQuaternion(player.quaternion), speed);
        onEvent({ type: 'radio', speaker: 'Управление Явина', text: 'Держитесь внутри траншеи. Не заденьте стену!' });
      }
      // Scraping a wall or the floor adds a rushing pass-by.
      const wallGap = Math.min(66 - Math.abs(player.position.x), player.position.y + 127, 105 - player.position.y);
      if (wallGap < 26 && speed > stats.speed * 0.45) audio.whoosh?.(Math.max(0, wallGap * 34));
      const state = campaign.getSnapshot();
      const gate = world.checkpoints[state.progress];
      if (gate && player.position.z < gate.position.z + 16 && Math.abs(player.position.x - gate.position.x) < 48 && Math.abs(player.position.y - gate.position.y) < 48) {
        gate.visible = false;
        campaign.recordCheckpoint();
        audio.cue();
      } else if (gate && player.position.z < gate.position.z - 100) {
        // A missed gate must be flown through; bring the route back into view.
        player.position.set(gate.position.x, -45, gate.position.z + 180);
        player.quaternion.identity();
        resetFlightState(flight, FORWARD, speed * .6);
        speed = flight.speed;
        damagePlayer(12);
      }
    } else if (phase === 'surface' && player.position.y < -120) {
      // Ploughing into the Death Star's hull at speed is fatal; a slow graze
      // keeps its forgiving scrape.
      if (lethalImpact({ speed, maxSpeed: stats.speed, kind: 'ground' })) {
        crashPlayer('Врезался в поверхность Звезды Смерти.');
      } else if (collisionCooldown === 0) {
        damagePlayer(28);
        collisionCooldown = 1.5;
        player.position.y = -65;
        player.quaternion.slerp(new THREE.Quaternion(), 0.8);
        resetFlightState(flight, FORWARD.clone().applyQuaternion(player.quaternion), speed * .6);
        speed = flight.speed;
      }
    }
    // Long-distance free flight stays navigable: mission targets never disappear forever.
    if (phase === 'combat' && player.position.length() > 4500) {
      temporary.copy(player.position).normalize();
      player.quaternion.setFromUnitVectors(FORWARD, temporary.negate());
      resetFlightState(flight, FORWARD.clone().applyQuaternion(player.quaternion), speed);
      onEvent({ type: 'radio', speaker: 'Управление Явина', text: 'Вы покидаете зону прикрытия. Возвращайтесь к группе.' });
    }
    if (['surface', 'assault'].includes(phase) && player.position.length() > 5500) {
      player.position.set(0, 70, 650);
      player.quaternion.identity();
      resetFlightState(flight, FORWARD, speed);
    }
    if (phase === 'assault') {
      const route = campaign.getSnapshot().mission.combatRoute;
      if (player.position.distanceTo(new THREE.Vector3(route.point.x, route.point.y, route.point.z)) <= route.radius) campaign.recordCheckpoint();
    }
    if (keys.has('Space') || mouseFiring) firePlayer();
  }

  function updateEnemies(dt) {
    const phase = campaign.getSnapshot().phase;
    const retired = [];
    const formation = phase === 'trench' ? { directives: [], events: [] } : squadron.update({
      fighters: enemies.filter(enemy => enemy.kind === 'tie' && !enemy.disabled).map(enemy => ({ id: enemy.id, position: enemy.mesh.position, variant: enemy.variant, health: enemy.health })),
      playerPosition: player.position, dt });
    const directives = new Map(formation.directives.map(item => [item.id, item]));
    for (const event of formation.events) {
      onEvent(event);
      onEvent({ type: 'radio', speaker: SQUADRON_SPEAKERS[phase] || 'Управление Явина', text: event.text });
      if (event.code === 'reinforcement-request') {
        const reinforcement = spawnTie(player.position.clone().add(new THREE.Vector3(600, 120, -800)), 'ace');
        reinforcement.bonusOnly = true;
      }
    }
    const incoming = projectiles.filter(bolt => bolt.owner !== 'enemy').map(bolt => ({ owner: bolt.owner, position: bolt.mesh.position, velocity: bolt.velocity }));
    for (const enemy of enemies) {
      if (enemy.kind === 'relay' || enemy.disabled) continue;
      if (enemy.retreat) {
        enemy.aiState = 'retreat';
        enemy.telegraph = false;
        enemy.mesh.userData.attackTelegraph = false;
        enemy.velocity.set(65, 30, 180);
        enemy.mesh.position.addScaledVector(enemy.velocity, dt);
        enemy.mesh.quaternion.setFromUnitVectors(FORWARD, enemy.velocity.clone().normalize());
        if (enemy.mesh.position.distanceTo(player.position) > 1700) retired.push(enemy);
        continue;
      }
      const tactics = directives.get(enemy.id);
      enemy.pilotRole = tactics?.pilotRole;
      enemy.squadRole = tactics?.role;
      // Temporary withdrawal never removes a mandatory kill from campaign objectives.
      if (tactics?.retreat && !enemy.withdrew) { enemy.withdrawRemaining = 3; enemy.withdrew = true; }
      if (enemy.withdrawRemaining > 0) {
        enemy.withdrawRemaining -= dt;
        enemy.aiState = 'withdraw'; enemy.telegraph = false;
        enemy.mesh.userData.attackTelegraph = false;
        enemy.velocity.copy(enemy.mesh.position).sub(player.position).normalize().multiplyScalar(150);
        enemy.mesh.position.addScaledVector(enemy.velocity, dt);
        enemy.mesh.quaternion.setFromUnitVectors(FORWARD, enemy.velocity.clone().normalize());
        continue;
      }
      enemy.stun = Math.max(0, enemy.stun - dt);
      if (enemy.stun > 0) { enemy.aiState = 'disabled'; enemy.telegraph = false; enemy.mesh.userData.attackTelegraph = false; enemy.velocity.set(0, 0, 0); enemy.mesh.rotation.z += dt * 0.5; continue; }
      const selectedTarget = chooseEnemyTarget({ kind: enemy.kind, variant: enemy.variant, seed: enemy.seed, position: enemy.mesh.position,
        player: { id: 'player', position: player.position, velocity: flight.velocity },
        allies: allies.map(ally => ({ id: ally.id, health: ally.health, position: ally.mesh.position, velocity: ally.velocity })),
        defendAllies: ['escort', 'defend', 'assault'].includes(phase) });
      const allyTarget = allies.find(ally => ally.id === selectedTarget.id) || null;
      const targetPosition = selectedTarget.position;
      const targetVelocity = selectedTarget.velocity;
      const weaponProfile = getEnemyWeaponProfile(enemy.kind, enemy.variant, { pilotRole: enemy.pilotRole, allyTarget: Boolean(allyTarget), relayBonus });
      let firingOrigin = enemy.mesh.position.clone();
      const previousTelegraph = enemy.telegraph;
      enemy.aiTarget = allyTarget?.id || 'player';
      let direction;
      let shouldFire = false;
      enemy.fireTimer -= dt;
      if (enemy.kind === 'tie' || enemy.kind === 'vader') {
        const decision = updateEnemyBrain(enemy.brain, {
          weaponProfile,
          tactics: allyTarget || enemy.withdrew ? { ...tactics, targetOffset: null, speedMultiplier: enemy.withdrew ? 1 : tactics?.speedMultiplier } : tactics,
          position: enemy.mesh.position,
          forward: FORWARD.clone().applyQuaternion(enemy.mesh.quaternion),
          velocity: enemy.velocity,
          target: { id: enemy.aiTarget, position: targetPosition, velocity: targetVelocity },
          neighbors: [...enemies.filter(other => other !== enemy), ...allies].map(other => ({ position: other.mesh.position })),
          projectiles: incoming,
          corridor: phase === 'trench' ? { minX: -56, maxX: 56, minY: -112, maxY: 25 } : null,
          cruiseSpeed: phase === 'trench' ? stats.speed * (enemy.kind === 'vader' ? 1.03 : 0.85) : undefined,
        }, dt);
        const heading = new THREE.Vector3(decision.direction.x, decision.direction.y, decision.direction.z);
        enemy.mesh.quaternion.setFromUnitVectors(FORWARD, heading);
        enemy.velocity.copy(heading).multiplyScalar(decision.speed);
        enemy.mesh.position.addScaledVector(enemy.velocity, dt);
        direction = new THREE.Vector3(decision.aimDirection.x, decision.aimDirection.y, decision.aimDirection.z);
        shouldFire = decision.fire;
        enemy.aiState = decision.state;
        enemy.telegraph = decision.telegraph;
        enemy.evading = decision.evading;
        enemy.aiAim = decision.aimDirection;
      } else {
        const head = enemy.mesh.userData.head;
        enemy.mesh.updateMatrixWorld(true);
        if (head) firingOrigin.copy(head.localToWorld(new THREE.Vector3(0, enemy.variant === 'heavy' ? 4 : 3, 0)));
        const barrelQuaternion = head ? head.getWorldQuaternion(new THREE.Quaternion()) : enemy.mesh.quaternion;
        const decision = enemy.brain.update({ position: firingOrigin,
          forward: FORWARD.clone().applyQuaternion(barrelQuaternion),
          target: { id: enemy.aiTarget, position: targetPosition, velocity: targetVelocity }, relayBonus }, dt);
        direction = new THREE.Vector3(decision.aimDirection.x, decision.aimDirection.y, decision.aimDirection.z);
        if (head) {
          const attitude = new THREE.Quaternion().setFromUnitVectors(FORWARD, new THREE.Vector3(decision.direction.x, decision.direction.y, decision.direction.z));
          head.quaternion.copy(enemy.mesh.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(attitude));
        }
        enemy.telegraph = decision.telegraph > 0;
        enemy.aiState = decision.state;
        enemy.aiAim = decision.aimDirection;
        shouldFire = decision.fire;
      }
      if (enemy.telegraph && !previousTelegraph) onEvent({ type: 'enemy-attack', variant: enemy.variant, targetId: enemy.aiTarget });
      enemy.mesh.userData.attackTelegraph = Boolean(enemy.telegraph);
      if (shouldFire && phase !== 'qte' && stationLineOfSight(firingOrigin, targetPosition, phase)) {
        // Fire control solves the same origin, speed and lifetime used by the real bolt.
        const solution = solveFireSolution({ origin: firingOrigin, targetPosition, targetVelocity, profile: weaponProfile,
          sampleX: Math.random() * 2 - 1, sampleY: Math.random() * 2 - 1 });
        if (solution.reachable) {
          direction.set(solution.direction.x, solution.direction.y, solution.direction.z);
          const muzzle = new THREE.Vector3(solution.origin.x, solution.origin.y, solution.origin.z);
          fireBolt(muzzle, direction, 'enemy', weaponProfile.damage, weaponProfile.speed, { life: weaponProfile.lifetime });
          muzzleFlash(muzzle, 'enemy', 0.9);
          enemy.lastShotAt = totalElapsed;
        }
        if (enemy.kind === 'turret' && enemy.variant === 'heavy') audio.turbolaser?.();
        else audio.enemyLaser?.();

      }
      if (enemy.mesh.position.distanceTo(player.position) < 15 && collisionCooldown === 0) {
        damagePlayer(18);
        collisionCooldown = 1.1;
        enemy.mesh.position.addScaledVector(direction, -45);
      }
    }
    for (const enemy of retired) { removeEntity(enemy); enemies.splice(enemies.indexOf(enemy), 1); }
  }

  function updateProjectiles(dt) {
    const destroyed = [];
    const detonate = (bolt, directTarget = null) => {
      burst(bolt.mesh.position, 0, 7);
      audio.explosion();
      for (const enemy of enemies) {
        if (enemy.health <= 0 || enemy.disabled || enemy.retreat) continue;
        const damage = enemy === directTarget ? bolt.damage : splashDamage(enemy.mesh.position.distanceTo(bolt.mesh.position), bolt.profile.splashRadius, bolt.profile.splashDamage);
        enemy.health -= damage;
        if (enemy.health <= 0) destroyed.push(enemy);
      }
      bolt.life = 0;
    };
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const bolt = projectiles[i];
      const previous = bolt.mesh.position.clone();
      if (bolt.type === 'torpedo' && bolt.target) {
        if (!enemies.includes(bolt.target) || bolt.target.health <= 0 || bolt.target.disabled) bolt.target = null;
        else {
          const desired = bolt.target.mesh.position.clone().addScaledVector(bolt.target.velocity, Math.min(0.4, bolt.target.mesh.position.distanceTo(bolt.mesh.position) / bolt.profile.speed)).sub(bolt.mesh.position).normalize();
          const current = bolt.velocity.clone().normalize();
          // A lock can be broken: torpedoes do not reverse to chase targets behind them.
          if (current.dot(desired) < 0.4) bolt.target = null;
          else {
            const guided = steerDirection(current, desired, bolt.profile.turnRate * dt);
            bolt.velocity.set(guided.x, guided.y, guided.z).multiplyScalar(bolt.profile.speed);
            bolt.mesh.quaternion.setFromUnitVectors(FORWARD, bolt.velocity.clone().normalize());
          }
        }
      }
      bolt.mesh.position.addScaledVector(bolt.velocity, dt);
      bolt.life -= dt;
      if (bolt.storyImpact) {
        if (bolt.life <= 0) {
          burst(bolt.storyImpact, 0, 5);
          audio.explosion();
          if (!redLeaderDeparture?.missAnnounced) {
            if (redLeaderDeparture) redLeaderDeparture.missAnnounced = true;
            onEvent({ type: 'radio', speaker: 'Красный Лидер', text: 'Торпеды ударили в обшивку. Шахта не поражена. Красный Пять, готовьте следующий заход!' });
            onEvent({ type: 'red-leader-miss' });
          }
        }
      } else if (bolt.owner === 'player' || bolt.owner === 'friendly') {
        const walkerPart = atAtHitPart(previous, bolt.mesh.position);
        if (walkerPart) {
          // The frontal plate deflects the shot outright; only open parts take damage.
          const result = walkerPart === 'armor'
            ? { applied: 0, blocked: true, part: walkerPart, health: atAt.health }
            : atAt.unit.applyDamage(bolt.damage, { part: walkerPart });
          atAt.health = result.health;
          atAt.part = walkerPart;
          atAt.blocked = Boolean(result.blocked);
          bolt.life = 0;
          if (result.blocked) {
            burst(bolt.mesh.position, 3, 0.5);
            audio.hit?.();
          } else {
            burst(bolt.mesh.position, 1, 0.7);
            audio.hit?.();
            if (atAt.health <= atAt.maxHealth * 0.35 && campaign.getSnapshot().phase === 'hoth-atat') {
              atAtState = { health: atAt.health, maxHealth: atAt.maxHealth };
              campaign.recordKill('at-at');
            }
          }
          bolt.life = 0;
        }
        for (const enemy of enemies) {
          if (enemy.health <= 0 || enemy.disabled || enemy.retreat || !segmentSphereHit(previous, bolt.mesh.position, enemy.mesh.position, enemy.radius)) continue;
          if (bolt.owner === 'player') shotsHit += 1;
          if (bolt.type === 'torpedo') detonate(bolt, enemy);
          else {
            enemy.health -= bolt.damage;
            if (bolt.stun > 0) { enemy.stun = Math.max(enemy.stun, bolt.stun); enemy.velocity.set(0, 0, 0); }
            bolt.life = 0;
            burst(bolt.mesh.position, bolt.type === 'ion' ? 3 : 2, bolt.type === 'ion' ? 1.3 : 0.5);
            if (enemy.health <= 0) destroyed.push(enemy);
          }
          break;
        }
      } else if (segmentSphereHit(previous, bolt.mesh.position, player.position, 7)) {
        damagePlayer(bolt.damage);
        bolt.life = 0;
      } else if (bolt.owner === 'enemy') {
        const ally = allies.find(friend => segmentSphereHit(previous, bolt.mesh.position, friend.mesh.position, 8));
        if (ally) { damageAlly(ally, bolt.damage); bolt.life = 0; }
      }
      if (bolt.life > 0 && bolt.type === 'torpedo' && ['surface', 'trench'].includes(campaign.getSnapshot().phase) && bolt.mesh.position.y < -146) detonate(bolt);
      if (bolt.life <= 0) {
        scene.remove(bolt.mesh);
        projectiles.splice(i, 1);
      }
    }
    for (const enemy of new Set(destroyed)) destroyEnemy(enemy);
  }

  function beginRedLeaderDeparture() {
    const mesh = createShip('xwing', modelFor('xwing'), { rotation: [0, Math.PI, 0] });
    mesh.position.set(-85, 100, 350);
    mesh.userData.setSfoils?.(1);
    scene.add(mesh);
    redLeaderDeparture = { mesh, remaining: 3.2, missAnnounced: false };
    for (const side of [-1, 1]) {
      const torpedo = new THREE.Group();
      torpedo.add(new THREE.Mesh(torpedoGeometry, torpedoMaterial));
      const tail = new THREE.Mesh(torpedoTailGeometry, torpedoGlowMaterial);
      tail.position.z = 7; torpedo.add(tail);
      torpedo.position.copy(mesh.position).add(new THREE.Vector3(side * 3, -2, -10));
      // This authored shot hits beside the shaft; it cannot damage combat entities or advance objectives.
      const impact = new THREE.Vector3(34 + side * 4, -144, -650);
      const direction = impact.clone().sub(torpedo.position).normalize();
      torpedo.quaternion.setFromUnitVectors(FORWARD, direction);
      const life = torpedo.position.distanceTo(impact) / 600;
      scene.add(torpedo);
      projectiles.push({ mesh: torpedo, owner: 'story', type: 'story-torpedo', damage: 0, velocity: direction.multiplyScalar(600), life, storyImpact: impact });
    }
    audio.torpedo?.();
    onEvent({ type: 'red-leader-launch' });
  }

  function updateRedLeaderDeparture(dt) {
    if (!redLeaderDeparture) return;
    redLeaderDeparture.remaining -= dt;
    redLeaderDeparture.mesh.position.z -= 110 * dt;
    if (redLeaderDeparture.remaining <= 0) {
      burst(redLeaderDeparture.mesh.position, 0, 3);
      audio.explosion();
      removeEntity(redLeaderDeparture); redLeaderDeparture = null;
      onEvent({ type: 'radio', speaker: 'Управление Явина', text: 'Красный Лидер потерян. Красный Два повреждён. Прикройте его отход и готовьте последний заход.' });
      onEvent({ type: 'red-leader-lost' });
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      const cameraFade = THREE.MathUtils.smoothstep(effect.mesh.position.distanceTo(camera.position), 3, 11);
      effect.mesh.material.opacity = Math.max(0, effect.life / effect.maxLife) * cameraFade;
      effect.mesh.scale.multiplyScalar(1 + dt * (effect.debris ? 0 : 1.2));
      if (effect.debris) { effect.mesh.rotation.x += dt * 5; effect.mesh.rotation.z += dt * 3; }
      if (effect.life <= 0) {
        scene.remove(effect.mesh);
        effect.mesh.material.dispose();
        effects.splice(i, 1);
      }
    }
  }

  function updateCamera(dt) {
    const near = cameraMode === 'cockpit' && mode !== 'menu' && mode !== 'cinematic' && mode !== 'victory' ? 0.05 : 1.5;
    let projectionChanged = camera.near !== near;
    camera.near = near;
    const boostLens = mode === 'playing' && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const lens = THREE.MathUtils.damp(camera.fov, boostLens ? 70 : 63, 3.5, dt);
    if (Math.abs(lens - camera.fov) > 0.005) { camera.fov = lens; projectionChanged = true; }
    if (projectionChanged) camera.updateProjectionMatrix();
    if (mode === 'menu') {
      player.position.set(0, 60 + Math.sin(backdropElapsed * 0.25) * 2, 600);
      player.rotation.set(0.04, Math.sin(backdropElapsed * 0.13) * 0.06, -0.08);
      camera.position.set(16 + Math.sin(backdropElapsed * 0.08) * 3, 68, window.innerWidth <= 760 ? 645 : 633);
      camera.lookAt(window.innerWidth <= 760 ? 0 : -20, 61, 589);
      cockpit.visible = false;
      shipMesh.visible = true;
      return;
    }
    if (mode === 'qte' && campaign.getSnapshot().phase === 'hoth-tow') {
      const walker = atAt?.mesh?.position || new THREE.Vector3(60, 0, 120);
      const forward = FORWARD.clone().applyQuaternion(player.quaternion);
      camera.position.copy(player.position).addScaledVector(forward, -16).add(new THREE.Vector3(0, 4.5, 0));
      camera.up.copy(UP);
      camera.lookAt(walker.x, walker.y + 9, walker.z);
      cockpit.visible = cameraMode === 'cockpit';
      shipMesh.visible = cameraMode !== 'cockpit';
      return;
    }
    if (mode === 'cinematic' && campaign.getSnapshot().phase === 'hoth-fall') {
      const walker = atAt?.mesh?.position || new THREE.Vector3(60, 0, 0);
      const offset = new THREE.Vector3(150, 70, 190);
      camera.position.lerp(walker.clone().add(offset), 1 - Math.exp(-dt * 1.6));
      camera.up.copy(UP);
      camera.lookAt(walker.x, walker.y + 6, walker.z);
      cockpit.visible = false;
      shipMesh.visible = false;
      return;
    }
    if (mode === 'cinematic' || mode === 'victory') {
      const t = mode === 'victory' ? 12 : campaign.getSnapshot().elapsed;
      world.updateCinema(t, camera);
      if (t > 0.35 && !torpedoImpactPlayed) { torpedoImpactPlayed = true; audio.torpedoImpact?.(); }
      if (t > 4.6 && !explosionPlayed) { explosionPlayed = true; audio.stationExplosion?.(); }
      return;
    }
    if (mode === 'qte' && typeof world.updateQte === 'function') {
      const state = campaign.getSnapshot();
      cockpit.visible = cameraMode === 'cockpit';
      shipMesh.visible = cameraMode !== 'cockpit';
      world.updateQte(state.elapsed, state.qte, camera, player, cameraMode);
      return;
    }
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    const up = UP.clone().applyQuaternion(player.quaternion);
    if (cameraMode === 'cockpit') {
      camera.position.copy(player.position).addScaledVector(up, 1.8).addScaledVector(forward, 1.8);
      camera.quaternion.copy(player.quaternion);
      cockpit.visible = true;
      shipMesh.visible = false;
    } else {
      const chaseDistance = camera.aspect < 1 ? 25.5 / camera.aspect : 25.5;
      const desired = player.position.clone().addScaledVector(forward, -chaseDistance).addScaledVector(up, 6.5);
      if (snapChaseCamera || camera.position.distanceToSquared(player.position) < 16 * 16) {
        camera.position.copy(desired);
        snapChaseCamera = false;
      } else {
        camera.position.lerp(desired, 1 - Math.exp(-dt * 8));
        // Keep the detailed ship the same size while accelerating.
        const offset = camera.position.clone().sub(player.position);
        const radius = Math.hypot(chaseDistance, 6.5);
        if (offset.lengthSq() > radius * radius) camera.position.copy(player.position).add(offset.setLength(radius));
        // Abrupt collision/route corrections must never pull the camera through the hull.
        if (camera.position.distanceToSquared(player.position) < 16 * 16) camera.position.copy(desired);
      }
      camera.up.copy(up);
      camera.lookAt(player.position.clone().addScaledVector(forward, 65));
      cockpit.visible = false;
      shipMesh.visible = true;
    }
    if (mode === 'playing' && (keys.has('ShiftLeft') || keys.has('ShiftRight'))) {
      // Subtle angular engine vibration keeps speed feedback sharp, without image blur.
      camera.rotateX(Math.sin(totalElapsed * 43) * 0.0014);
      camera.rotateZ(Math.sin(totalElapsed * 57) * 0.0008);
    }
  }

  function update(dt) {
    if (mode !== 'paused') {
      backdropElapsed += dt;
      world.update(backdropElapsed, dt);
      for (const material of [playerBoltMaterial, enemyBoltMaterial, ionBoltMaterial]) material.uniforms.time.value = backdropElapsed;
      updateSfoils(dt);
    }
    if (mode === 'playing') {
      totalElapsed += dt;
      const reloadsCompleted = armament.update(dt);
      for (const id of reloadsCompleted) {
        const weapon = armament.getSnapshot().find(profile => profile.id === id);
        onEvent({ type: 'weapon-reload', phase: 'complete', status: 'complete', weaponId: id, name: weapon.name });
        audio.cue();
        emitSnapshot();
      }
      abilityCooldown = Math.max(0, abilityCooldown - dt);
      abilityRemaining = Math.max(0, abilityRemaining - dt);
      const power = getPowerProfile(powerMode);
      weaponFaultDelay = Math.max(0, weaponFaultDelay - dt);
      heat = Math.max(0, heat - dt * 0.26 * power.cooling * shipSystems.snapshot().effects.weaponCooling);
      if (totalElapsed - lastDamage > 6) shields = Math.min(stats.shield, shields + stats.shieldRegen * power.shieldRegen * dt);
      const repaired = repairSystem.update(dt);
      supportSystem.update(dt);
      if (repaired > 0) {
        const restored = repairTarget === 'hull' ? Math.min(repaired, stats.hull - hull) : shipSystems.repair(40);
        if (repairTarget === 'hull') hull += restored;
        audio.cue();
        onEvent({ type: 'repair', status: 'complete', amount: restored, target: repairTarget });
      }
      updateFlight(dt);
      if (mode === 'playing') {
        updateAtAt(dt);
        updateHothEvacuation();
        updateMissionContent(dt);
        updateAllies(dt);
        updateSupportWingmen(dt);
        updateEnemies(dt);
        updateTargetLock(dt);
        updateProjectiles(dt);
        updateRedLeaderDeparture(dt);
        campaign.update(dt);
        syncCampaign();
      } else if (mode === 'cinematic' && campaign.getSnapshot().phase === 'hoth-fall') {
        updateAtAt(dt);
      }
      updateEffects(dt);
      updateFlashes(dt);
      tieSoundTimer = Math.max(0, tieSoundTimer - dt);
      if (tieSoundTimer === 0) {
        const nearestTie = enemies.filter(enemy => enemy.kind === 'tie').reduce((nearest, enemy) => Math.min(nearest, enemy.mesh.position.distanceTo(player.position)), Infinity);
        if (nearestTie < 650) { audio.tie?.(nearestTie); tieSoundTimer = 3.5; }
      }
    } else if (mode === 'qte' || mode === 'cinematic') {
      totalElapsed += dt;
      if (mode === 'qte' && campaign.getSnapshot().phase === 'hoth-tow') updateHothTow(dt);
      if (mode === 'cinematic' && campaign.getSnapshot().phase === 'hoth-fall') updateAtAt(dt);
      handleMissionEvents(missionDirector.update({ dt }));
      campaign.update(dt);
      syncCampaign();
      if (mode === 'qte') {
        const qte = campaign.getSnapshot().qte;
        if (qte && qte.totalRemaining <= 6 && !superlaserCharging) {
          superlaserCharging = true;
          audio.superlaserCharge?.(qte.totalRemaining);
        }
      }
    }
    if (mode !== 'paused') updateCamera(dt);
    shipMesh.userData.engineBoost = mode === 'playing' && (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 1 : 0;
    const audioLock = mode === 'playing' && armament.current().type === 'torpedo' ? (targetLock.snapshot().acquired && targetLock.snapshot().targetId === findAimTarget()?.id ? 'locked' : 'search') : 'none';
    if (audioLock !== lastAudioLock) {
      if (audioLock !== 'none') audio.lock?.(audioLock);
      else if (lastAudioLock === 'locked') audio.lock?.('lost');
      lastAudioLock = audioLock;
    }
    audio.setFlight?.({ speed: mode === 'qte' ? 0.9 : speed / stats.speed, boost: keys.has('ShiftLeft') || keys.has('ShiftRight'), active: ['playing', 'qte', 'cinematic'].includes(mode) });
    // Adaptive original score: the menu theme needs the same gesture that starts the score.
    audio.setMusic?.({
      phase: mode === 'defeat' ? 'defeat' : lastPhase,
      intensity: mode === 'qte' ? 1 : mode === 'playing' ? 0.72 : 0.5,
      menace: enemies.some(enemy => enemy.kind === 'vader' && enemy.health > 0 && !enemy.disabled),
      active: (mode !== 'menu' && !disposed) || audioUnlocked,
    });
    emitTimer += dt;
    if (emitTimer >= 0.1) { emitTimer = 0; emitSnapshot(); }
  }

  function drawFrame() {
    // Keep the moving shadow projection on whole texels rather than crawling over the hull.
    const texel = 320 / shadowResolution;
    shadowCenter.copy(player.position);
    for (const axis of [shadowRight, shadowUp]) {
      const coordinate = shadowCenter.dot(axis);
      shadowCenter.addScaledVector(axis, Math.round(coordinate / texel) * texel - coordinate);
    }
    keyLight.position.copy(shadowCenter).add(shadowOffset);
    keyLight.target.position.copy(shadowCenter);
    sceneLighting.update(player, campaign.getSnapshot().phase, mode);
    renderPipeline.render();
  }

  function frame(now) {
    if (disposed) return;
    const delta = clampFrameDelta((now - lastFrame) / 1000);
    lastFrame = now;
    update(delta);
    drawFrame();
    frameId = requestAnimationFrame(frame);
  }

  function start({ shipId = selectedShipId } = {}) {
    if (disposed) return;
    audioUnlocked = true;
    audio.setPaused?.(false);
    audio.start();
    clearInput();
    clearCombat();
    campaign.reset();
    missionDirector.reset();
    lastAudioLock = 'none';
    sortieShipId = shipId;
    replaceShip(shipId);
    player.visible = true;
    totalElapsed = 0;
    kills = 0;
    shotsFired = 0;
    shotsHit = 0;
    speed = 0;
    resetFlightState(flight);
    armament.reset();
    tieSoundTimer = 1;
    relaysDestroyed = 0;
    relayBonus = false;
    powerMode = 'balanced';
    repairSystem.reset();
    shipSystems.reset(); wingOrders.reset(); escortBonus.reset(); tacticalScore = 0; weaponFaultDelay = 0; repairTarget = 'hull';
    supportSystem.reset();
    sfoilsMode = 'auto';
    sfoilsOpenness = 1;
    shipMesh.userData.setSfoils?.(1);
    heat = 0;
    abilityCooldown = 0;
    abilityRemaining = 0;
    lastDamage = -10;
    lastRadio = '';
    camera.up.copy(UP);
    mode = 'playing';
    lastPhase = 'menu';
    syncCampaign();
    emitSnapshot();
  }

  function pause() {
    if (!['playing', 'qte', 'cinematic'].includes(mode)) return;
    pausedMode = mode;
    mode = 'paused';
    audio.setPaused?.(true);
    clearInput();
    exitPointerLock();
    emitSnapshot();
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = pausedMode;
    audio.setPaused?.(false);
    lastFrame = performance.now();
    audio.start();
    emitSnapshot();
  }
  function setCamera(value) {
    cameraMode = value === 'cockpit' ? 'cockpit' : 'chase';
    snapChaseCamera = true;
    camera.up.copy(UP);
    updateCamera(0);
    emitSnapshot();
  }
  function setPowerMode(value) {
    if (!['menu', 'playing'].includes(mode) || !['balanced', 'engines', 'weapons', 'shields'].includes(value)) return false;
    powerMode = value;
    onEvent({ type: 'power-change', powerMode });
    emitSnapshot();
    return true;
  }
  function repair() {
    if (mode !== 'playing') return false;
    const system = shipSystems.snapshot();
    const integrity = system.selected === 'hull' ? hull / stats.hull * 100 : system.systems.find(item => item.id === system.selected)?.integrity;
    if (!repairSystem.start(integrity, 100)) return false;
    repairTarget = system.selected;
    audio.cue();
    onEvent({ type: 'repair', status: 'start', duration: 3 });
    emitSnapshot();
    return true;
  }
  function selectRepair(id) {
    if (mode !== 'playing' || repairSystem.getSnapshot().active) return false;
    const result = id ? shipSystems.selectRepair(id) : shipSystems.cycleRepair();
    emitSnapshot(); return Boolean(result);
  }
  function setWingOrder(order) {
    if (mode !== 'playing') return false;
    const result = order ? wingOrders.setOrder(order) : wingOrders.cycleOrder();
    if (result) onEvent({ type: 'radio', speaker: 'Красная группа', text: wingOrders.snapshot().description });
    emitSnapshot(); return Boolean(result);
  }
  function requestSupport() {
    if (mode !== 'playing') return false;
    const orderTargetId = wingOrders.selectTarget({ enemies: enemies.map(enemy => ({ ...enemy, position: enemy.mesh.position })), playerPosition: player.position, escortAllies: allies.map(ally => ({ ...ally, position: ally.mesh.position })), playerTargetId: findAimTarget({ lockDot: 0.88, range: 2200 })?.id });
    const target = enemies.find(enemy => enemy.id === orderTargetId);
    if (!target) { onEvent({ type: 'support', status: 'no-target' }); return false; }
    if (!supportSystem.request()) return false;
    const forward = FORWARD.clone().applyQuaternion(player.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
    const up = UP.clone().applyQuaternion(player.quaternion);
    for (const side of [-1, 1]) {
      const mesh = createShip('xwing', modelFor('xwing'), { rotation: [0, Math.PI, 0] });
      mesh.position.copy(player.position).addScaledVector(forward, -65).addScaledVector(right, side * 35).addScaledVector(up, 14);
      mesh.quaternion.copy(player.quaternion);
      mesh.userData.setSfoils?.(1);
      scene.add(mesh);
      supportWingmen.push({ id: `support-${side}`, mesh, side, target, life: 10, age: 0, fireTimer: 0.25, velocity: forward.clone().multiplyScalar(190), attackDirection: forward.clone() });
    }
    onEvent({ type: 'support', status: 'launched' });
    onEvent({ type: 'radio', speaker: 'Красная группа', text: 'Цель вижу. Два истребителя заходят вам на помощь.' });
    audio.cue();
    emitSnapshot();
    return true;
  }
  function toggleSfoils() {
    if (selectedShipId !== 'xwing' || !['menu', 'playing'].includes(mode)) return false;
    sfoilsMode = sfoilsMode === 'auto' ? sfoilsOpenness > 0.5 ? 'closed' : 'open' : sfoilsMode === 'open' ? 'closed' : 'open';
    onEvent({ type: 'sfoils-change', sfoilsMode });
    emitSnapshot();
    return true;
  }
  function selectWeapon(id) {
    if (!['menu', 'playing'].includes(mode)) return false;
    const previous = armament.current().id;
    if (!armament.select(id)) return false;
    const weapon = armament.current();
    if (weapon.id !== previous) targetLock.reset();
    if (weapon.id !== previous) onEvent({ type: 'weapon-change', weaponId: weapon.id, name: weapon.name });
    emitSnapshot();
    return true;
  }
  function cycleWeapon(direction = 1) {
    if (!['menu', 'playing'].includes(mode)) return false;
    const id = armament.cycle(direction);
    targetLock.reset();
    const weapon = armament.current();
    onEvent({ type: 'weapon-change', weaponId: id, name: weapon.name });
    emitSnapshot();
    return true;
  }
  function reloadWeapon() {
    if (mode !== 'playing' || !armament.reload()) return false;
    const weapon = armament.getSnapshot().find(profile => profile.selected);
    onEvent({ type: 'weapon-reload', phase: 'start', status: 'start', weaponId: weapon.id, name: weapon.name, duration: weapon.reloadDuration });
    audio.cue();
    emitSnapshot();
    return true;
  }
  function useAbility() {
    if (mode !== 'playing' || abilityCooldown > 0) return false;
    abilityCooldown = stats.ability.cooldown;
    abilityRemaining = stats.ability.duration;
    audio.ability();
    if (stats.ability.id === 'shield-focus') {
      shields = Math.min(stats.shield, shields + (stats.ability.shieldRestore || 40));
      burst(player.position, 3, 2);
    } else {
      const forward = FORWARD.clone().applyQuaternion(player.quaternion);
      const nearest = enemies.filter(enemy => !enemy.disabled && enemy.mesh.position.distanceTo(player.position) < (stats.ability.radius || 320))
        .filter(enemy => enemy.mesh.position.clone().sub(player.position).normalize().dot(forward) > 0.4)
        .sort((a, b) => a.mesh.position.distanceToSquared(player.position) - b.mesh.position.distanceToSquared(player.position))[0];
      if (nearest) {
        nearest.stun = stats.ability.duration;
        burst(nearest.mesh.position, 3, 3);
        const direction = nearest.mesh.position.clone().sub(player.position).normalize();
        const bolt = new THREE.Mesh(boltGeometry, ionBoltMaterial);
        bolt.position.copy(player.position);
        bolt.quaternion.setFromUnitVectors(FORWARD, direction);
        scene.add(bolt);
        projectiles.push({ mesh: bolt, owner: 'player', damage: 10, velocity: direction.multiplyScalar(800), life: 1 });
      }
    }
    emitSnapshot();
    return true;
  }
  function submitQte(key) {
    if (mode !== 'qte') return false;
    const finalShot = campaign.getSnapshot().qte?.stage === 3;
    const result = campaign.qteInput(key);
    if (result) audio.cue();
    if (result && finalShot) audio.torpedo?.();
    syncCampaign();
    emitSnapshot();
    return result;
  }

  const consumedKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyF', 'KeyR', 'KeyV', 'KeyT', 'KeyB', 'KeyG', 'KeyX', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Escape']);
  addListener(window, 'keydown', event => {
    const targetTag = event.target?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
    // A focused dropdown would swallow the trigger: release it so the shot goes off.
    if (targetTag === 'SELECT' && event.code === 'Space') event.target.blur?.();
    if (consumedKeys.has(event.code) && mode !== 'menu') event.preventDefault();
    if (event.code === 'Escape' && !event.repeat) { mode === 'paused' ? resume() : pause(); return; }
    if (!['playing', 'qte'].includes(mode)) return;
    if (event.code === 'KeyC' && !event.repeat) setCamera(cameraMode === 'chase' ? 'cockpit' : 'chase');
    if (mode === 'qte') { if (!event.repeat && event.code !== 'KeyC') submitQte(event.code); return; }
    if (event.code.startsWith('Arrow')) {
      if (!event.repeat) cycleWeapon(event.code === 'ArrowLeft' || event.code === 'ArrowDown' ? -1 : 1);
      return;
    }
    if (event.code === 'KeyF' && !event.repeat) useAbility();
    if (event.code === 'KeyR') { if (!event.repeat) reloadWeapon(); return; }
    if (event.code === 'KeyB') { if (!event.repeat) selectRepair(); return; }
    if (event.code === 'KeyG') { if (!event.repeat) setWingOrder(); return; }
    if (event.code === 'KeyV') { if (!event.repeat) repair(); return; }
    if (event.code === 'KeyT') { if (!event.repeat) requestSupport(); return; }
    if (event.code === 'KeyX') { if (!event.repeat) toggleSfoils(); return; }
    if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code)) {
      if (!event.repeat) setPowerMode({ Digit1: 'engines', Digit2: 'weapons', Digit3: 'shields', Digit4: 'balanced' }[event.code]);
      return;
    }
    keys.add(event.code);
  });
  addListener(window, 'keyup', event => keys.delete(event.code));
  addListener(window, 'blur', pause);
  addListener(document, 'visibilitychange', () => { if (document.hidden) pause(); });
  // The menu score may only begin after a real gesture; the first one arms audio for good.
  const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    audio.start();
  };
  addListener(window, 'pointerdown', unlockAudio);
  addListener(window, 'keydown', unlockAudio);
  addListener(canvas, 'mousedown', event => {
    if (event.button !== 0 || mode !== 'playing') return;
    mouseFiring = true;
    audio.start();
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      lockRequested = true;
      const promise = canvas.requestPointerLock();
      if (promise?.catch) promise.catch(() => { lockRequested = false; });
    }
  });
  addListener(window, 'mouseup', () => { mouseFiring = false; });
  addListener(document, 'mousemove', event => {
    if (mode !== 'playing' || document.pointerLockElement !== canvas) return;
    mouseYaw -= THREE.MathUtils.clamp(event.movementX * 0.0018, -0.12, 0.12);
    mousePitch -= THREE.MathUtils.clamp(event.movementY * 0.0018, -0.12, 0.12);
  });
  addListener(document, 'pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && lockRequested) { lockRequested = false; pause(); }
  });

  const api = {
    start, pause, resume, restart: () => start({ shipId: sortieShipId }), setCamera, setPowerMode, repair, selectRepair, setWingOrder, requestSupport, toggleSfoils, selectWeapon, cycleWeapon, reloadWeapon, useAbility, submitQte,
    setEpisode(id) {
      const episodeId = EPISODES[id] ? id : 'episode4';
      if (campaign.getSnapshot().episodeId === episodeId) return episodeId;
      campaign = createCampaign(episodeId);
      missionDirector = createMissionDirector(EPISODES[episodeId].missions);
      lastPhase = 'menu';
      return episodeId;
    },
    getSnapshot,
    setGraphicsQuality(value) {
      if (!['hd', 'performance'].includes(value)) return false;
      renderPipeline.setQuality(value);
      emitSnapshot();
      return true;
    },
    setMuted(value) { const result = audio.setMuted(value); emitSnapshot(); return result; },
    selectShip(id) { if (mode === 'menu') { replaceShip(id); emitSnapshot(); } },
    previewShip(id) { if (mode === 'menu') { replaceShip(id); emitSnapshot(); } },
    returnToMenu() {
      audio.setPaused?.(true);
      clearInput(); clearCombat(); exitPointerLock();
      repairSystem.interrupt();
      mode = 'menu'; lastPhase = 'menu'; player.visible = true;
      cameraMode = 'chase'; camera.up.copy(UP); world.setPhase('menu');
      emitSnapshot();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      listeners.forEach(remove => remove());
      exitPointerLock();
      clearCombat();
      world.dispose();
      boltGeometry.dispose();
      torpedoGeometry.dispose(); torpedoTailGeometry.dispose(); torpedoMaterial.dispose(); torpedoGlowMaterial.dispose();
      effectGeometry.dispose();
      effectTexture.dispose(); debrisMaterial.dispose();
      playerBoltMaterial.dispose(); enemyBoltMaterial.dispose(); ionBoltMaterial.dispose();
      boltHeadMaterials.forEach(material => material.dispose());
      Object.values(flashMaterials).forEach(material => material.dispose());
      for (const flash of flashes) flash.material.dispose();
      effectMaterials.forEach(material => material.dispose());
      sceneLighting.dispose(); renderPipeline.dispose(); renderer.dispose(); audio.dispose();
      if (window.__gameDebug?.game === api) delete window.__gameDebug;
    },
  };

  // Programmatic QA hooks are deliberately separate from all visible game controls.
  window.__gameDebug = {
    game: api,
    snapshot: getSnapshot,
    inspect: () => ({
      mode, phase: campaign.getSnapshot().phase, projectiles: projectiles.length,
      content: missionDirector.getSnapshot(),
      missionProps: missionProps.map(prop => ({ id: prop.id, kind: prop.kind, position: prop.mesh.position.toArray() })),
      audio: audio.getSampleStatus?.() || { state: 'unavailable', events: [] },
      enemies: enemies.map(enemy => ({ id: enemy.id, bonusOnly: Boolean(enemy.bonusOnly), disabled: Boolean(enemy.disabled), kind: enemy.kind, pilotRole: enemy.pilotRole, squadRole: enemy.squadRole, variant: enemy.variant, health: enemy.health, stunned: enemy.stun, retreat: Boolean(enemy.retreat), position: enemy.mesh.position.toArray(), quaternion: enemy.mesh.quaternion.toArray(), velocity: enemy.velocity.toArray(), aiState: enemy.aiState || 'tracking', aiTarget: enemy.aiTarget || 'player', telegraph: Boolean(enemy.telegraph), evading: Boolean(enemy.evading), lastShotAt: enemy.lastShotAt ?? null, aimDirection: enemy.aiAim ? [enemy.aiAim.x, enemy.aiAim.y, enemy.aiAim.z] : null, model: enemy.mesh.userData.modelStatus })),
      allies: allies.map(ally => ({ id: ally.id, name: ally.name, kind: ally.kind, health: ally.health, shields: ally.shields, position: ally.mesh.position.toArray(), velocity: ally.velocity.toArray() })),
      supportWingmen: supportWingmen.map(wingman => ({ id: wingman.id, position: wingman.mesh.position.toArray(), life: wingman.life, targetId: wingman.target?.id || null, targetPosition: wingman.target?.mesh.position.toArray() || null })),
      sfoilsRig: shipMesh.userData.sfoils ? { ...shipMesh.userData.sfoils } : null,
      escortAnchor: escortAnchor.toArray(), relayBonus,
      playerPosition: player.position.toArray(), playerQuaternion: player.quaternion.toArray(),
      playerVelocity: [flight.velocity.x, flight.velocity.y, flight.velocity.z],
      flight: { speed: flight.speed, throttleSpeed: flight.throttleSpeed, slip: flight.slip, turnAuthority: flight.turnAuthority, drifting: flight.drifting },
      cameraPosition: camera.position.toArray(), cameraQuaternion: camera.quaternion.toArray(), cameraNear: camera.near,
      orbitalStationVisible: Boolean(world.space?.visible),
      projectileDetails: projectiles.map(projectile => ({ type: projectile.type || 'laser', owner: projectile.owner, damage: projectile.damage, locked: Boolean(projectile.target), position: projectile.mesh.position.toArray(), velocity: projectile.velocity.toArray() })),
      walkerParts: atAt ? {
        legs: (atAt.mesh.userData.legs || []).map(leg => {
          const point = (leg.hip || leg.knee || leg.foot).getWorldPosition(new THREE.Vector3());
          return { x: point.x, y: point.y, z: point.z };
        }),
        head: atAt.mesh.userData.head ? (() => { const point = atAt.mesh.userData.head.getWorldPosition(new THREE.Vector3()); return { x: point.x, y: point.y, z: point.z }; })() : null,
      } : null,
      playerModel: shipMesh.userData.modelStatus, playerModelUrl: shipMesh.userData.modelUrl,
      camera: cameraMode, renderCalls: renderer.info.render.calls,
      renderStats: { ...renderer.info.render },
      graphics: renderPipeline.inspect(), worldGraphics: world.graphics || null, lighting: sceneLighting.inspect(), cockpitModel: cockpit.userData.modelStatus || 'fallback',
      cockpitDetails: { triangles: cockpit.userData.triangleCount || 0, shipId: cockpit.userData.shipId || selectedShipId, error: cockpit.userData.error || null },
    }),
    advanceMission() {
      const state = campaign.getSnapshot();
      const rule = state.mission?.progressRule || resolveProgressRule(state.mission);
      if (rule?.rule === 'kills') {
        const needed = state.target - state.progress;
        for (let i = 0; i < needed; i++) campaign.recordKill(rule.kind);
      } else if (rule?.rule === 'escort') {
        const needed = state.target - state.progress;
        for (let i = 0; i < needed; i++) campaign.recordEscortCheckpoint();
      } else if (rule?.rule === 'checkpoints') {
        const needed = state.target - state.progress;
        for (let i = 0; i < needed; i++) campaign.recordCheckpoint();
      } else if (rule?.rule === 'qte') {
        for (const stage of state.mission?.qte || []) campaign.qteInput(stage.key);
      } else if (rule?.rule === 'cinematic') {
        campaign.update(13);
      } else if (rule?.rule === 'assault') {
        for (let i = state.assault.kills; i < state.assault.targetKills; i++) campaign.recordKill('tie');
        if (campaign.getSnapshot().phase === 'assault') campaign.recordCheckpoint();
      }
      syncCampaign(); emitSnapshot();
      return getSnapshot();
    },
    damage: damagePlayer,
    step(seconds) { const count = Math.ceil(Math.min(30, Math.max(0, seconds)) / 0.025); for (let i = 0; i < count; i++) update(0.025); drawFrame(); return getSnapshot(); },
    input(code, held = true) { held ? keys.add(code) : keys.delete(code); },
  };

  emitSnapshot();
  frameId = requestAnimationFrame(frame);
  return api;
}
