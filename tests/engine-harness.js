import { readFile } from 'node:fs/promises';
import * as Three from 'three';

let harnessSequence = 0;

class Surface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, fields = {}) {
    for (const listener of this.listeners.get(type) || []) listener({ code: '', repeat: false, preventDefault() {}, ...fields });
  }
}

/** Runs the actual engine and Three's math. Only GPU drawing, asset loading and sound are replaced. */
export async function engineHarness() {
  let scene;
  let pendingFrame;
  let now = performance.now();
  const originalRandom = Math.random;
  let randomSeed = 42;
  Math.random = () => { randomSeed = (1664525 * randomSeed + 1013904223) >>> 0; return randomSeed / 4294967296; };
  const originals = Object.fromEntries(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', '__engineTestDependencies'].map(key => [key, globalThis[key]]));
  const window = new Surface();
  Object.assign(window, { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 });
  const document = new Surface();
  Object.assign(document, { hidden: false, pointerLockElement: null });
  const canvas = new Surface();
  Object.assign(canvas, { clientWidth: 1280, clientHeight: 720 });
  class Renderer {
    info = { render: { calls: 0 } };
    setPixelRatio() {}
    setSize() {}
    render(nextScene, camera) {
      scene = nextScene;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      this.info.render.calls++;
    }
    dispose() {}
  }
  function createShip(kind) {
    const root = new Three.Group();
    root.userData = { kind, modelStatus: 'test' };
    return root;
  }
  function createWorld() {
    return {
      checkpoints: Array.from({ length: 6 }, (_, i) => {
        const gate = new Three.Object3D();
        gate.position.set(Math.sin(i * 1.3) * 12, -45, 500 - i * 550);
        return gate;
      }),
      // Episode V needs a walker with addressable legs and a transport column.
      hoth: (() => {
        const walker = new Three.Group();
        const legs = [];
        for (let index = 0; index < 4; index += 1) {
          const hip = new Three.Group();
          hip.position.set(index % 2 ? 3.2 : -3.2, 6, index < 2 ? 4.4 : -4.4);
          const knee = new Three.Group();
          knee.position.y = -3.4;
          const foot = new Three.Group();
          foot.position.y = -3.6;
          knee.add(foot);
          hip.add(knee);
          walker.add(hip);
          legs.push({ hip, knee, foot });
        }
        const head = new Three.Group();
        head.position.set(0, 12, 5);
        const body = new Three.Group();
        walker.add(head, body);
        walker.scale.setScalar(1.9);
      walker.userData.legs = legs;
        walker.userData.head = head;
        walker.userData.body = body;
        const transports = Array.from({ length: 3 }, (_, index) => {
          const group = new Three.Group();
          group.position.set(0, 0, 70 - index * 40);
          return { id: `transport-${index + 1}`, group, state: 'parked', progress: 0 };
        });
        return {
          root: new Three.Group(),
          atAt: { group: walker, legs, head, body },
          transports,
          update() {}, setPhase() {},
          launchTransport(id) { const transport = transports.find(entry => entry.id === id); if (!transport) return false; transport.state = 'launching'; return true; },
          getSnapshot() { return { phase: 'hoth', transports: transports.map(entry => ({ id: entry.id, state: entry.state })) }; },
          dispose() {},
        };
      })(),
      setPhase() {}, update() {}, updateCinema() {}, dispose() {},
    };
  }
  const audioCalls = [];
  const record = name => (...args) => { audioCalls.push({ name, args }); };
  const dependencies = {
    Renderer, createShip, createWorld,
    createAtSt() {
      const root = new Three.Group();
      const head = new Three.Group();
      head.position.y = 8;
      root.add(head);
      root.userData.head = head;
      root.userData.kind = 'at-st';
      return root;
    },
    createTurret(kind) {
      const mesh = new Three.Group();
      const head = new Three.Group();
      head.position.y = kind === 'heavy' ? 17 : 8;
      mesh.add(head); mesh.userData.head = head;
      return mesh;
    },
    createCockpit: () => new Three.Group(),
    // The real mixer is replaced: every engine hook is recorded so tests can assert playback order.
    createAudio() {
      return {
        muted: false,
        start: record('start'), cue: record('cue'), hit: record('hit'), laser: record('laser'),
        explosion: record('explosion'), crash: record('crash'), ability: record('ability'), radio: record('radio'), astromech: record('astromech'),
        incoming: record('incoming'), vent: record('vent'), ion: record('ion'), tie: record('tie'), lock: record('lock'),
        turbolaser: record('turbolaser'), enemyLaser: record('enemyLaser'),
        torpedo: record('torpedo'), torpedoImpact: record('torpedoImpact'), stationExplosion: record('stationExplosion'),
        superlaserCharge: record('superlaserCharge'), superlaserFire: record('superlaserFire'), klaxon: record('klaxon'),
        whoosh: record('whoosh'), missionCue: record('missionCue'), setPaused: record('setPaused'), setFlight: record('setFlight'),
        loadManifest: record('loadManifest'), dispose: record('dispose'),
        getSampleStatus: () => ({ state: 'unavailable', events: [] }),
        setMuted(value) { this.muted = !!value; return this.muted; },
      };
    },
  };
  Object.assign(globalThis, { window, document, requestAnimationFrame: callback => { pendingFrame = callback; return 1; }, cancelAnimationFrame() {}, __engineTestDependencies: dependencies });
  let source = await readFile(new URL('../src/game/engine.js', import.meta.url), 'utf8');
  source = source.replace("import * as THREE from 'three';", `import * as ThreeCore from ${JSON.stringify(import.meta.resolve('three'))};\nconst THREE = { ...ThreeCore, WebGLRenderer: globalThis.__engineTestDependencies.Renderer };`);
  source = source.replace(/import \{ createWorld, createShip, createTurret, createAtSt, createCockpit \} from '.\/world.js';/, 'const { createWorld, createShip, createTurret, createAtSt, createCockpit } = globalThis.__engineTestDependencies;');
  source = source.replace(/import \{ createAudio \} from '.\/audio.js';/, 'const { createAudio } = globalThis.__engineTestDependencies;');
  source = source.replace(/from '(\.\/[^']+)'/g, (_, relative) => `from ${JSON.stringify(new URL(`../src/game/${relative.slice(2)}`, import.meta.url).href)}`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${++harnessSequence}`);
  const events = [];
  const game = module.createGame({ canvas, onEvent: event => events.push(event) });
  const debug = window.__gameDebug;
  const frame = (delta = 0.025) => { now += delta * 1000; pendingFrame(now); };
  frame(0);
  return {
    game, debug, events, window, document, canvas, frame, audioCalls,
    player: () => scene.children.find(object => object.children.some(child => ['xwing', 'ywing'].includes(child.userData.kind))),
    key(code, held = true) { window.dispatch(held ? 'keydown' : 'keyup', { code }); },
    close() {
      game.dispose();
      Math.random = originalRandom;
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    },
  };
}
