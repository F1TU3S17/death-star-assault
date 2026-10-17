import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/game/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push({ value, time, type: 'set' }); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push({ value, time, duration, type: 'target' }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ value, time, type: 'ramp' }); }
}

function audioFixture(storedMute = false) {
  const originalContext = globalThis.AudioContext;
  const originalStorage = globalThis.localStorage;
  const contexts = [];
  const storage = new Map([['death-star-assault:muted', String(storedMute)]]);
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 8000; nodes = []; sources = []; destination = {};
    constructor() { contexts.push(this); }
    node(type) {
      const node = { type, nodeKind: type, connections: [], disconnected: false,
        connect(target) { this.connections.push(target); }, disconnect() { this.disconnected = true; },
      };
      this.nodes.push(node);
      return node;
    }
    createGain() { return Object.assign(this.node('gain'), { gain: new Param(1) }); }
    createBiquadFilter() { return Object.assign(this.node('filter'), { frequency: new Param(350), Q: new Param(1) }); }
    createDynamicsCompressor() { return Object.assign(this.node('compressor'), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new Param()]))); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    source(type) {
      const source = Object.assign(this.node(type), {
        stops: [], start(when) { this.started = true; this.startTime = when; },
        stop(when) { this.stops.push(when); }, end() { this.onended?.(); },
      });
      this.sources.push(source);
      return source;
    }
    createOscillator() { return Object.assign(this.source('oscillator'), { frequency: new Param(440) }); }
    createBufferSource() { return this.source('noise'); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  globalThis.AudioContext = Context;
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  return { contexts, storage, close() {
    if (originalContext === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = originalContext;
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  } };
}

test('sound waits for user start, uses one context and safely supports unavailable Web Audio', async () => {
  const fixture = audioFixture();
  let audio;
  try {
    audio = createAudio();
    audio.laser(); audio.setFlight({ speed: 1, active: true });
    assert.equal(fixture.contexts.length, 0);
    assert.equal(await audio.start(), true);
    assert.equal(await audio.start(), true);
    assert.equal(fixture.contexts.length, 1);
    assert.equal(fixture.contexts[0].state, 'running');
    audio.dispose();
    assert.equal(await audio.start(), false);
    delete globalThis.AudioContext;
    const silent = createAudio();
    assert.equal(await silent.start(), false);
    assert.doesNotThrow(() => { silent.laser(); silent.hit(); silent.setMuted(true); silent.dispose(); });
  } finally { audio?.dispose(); fixture.close(); }
});

test('engine throttle changes pitch, pause silences flight and mute persists across sessions', async () => {
  const fixture = audioFixture(true);
  let audio;
  try {
    audio = createAudio();
    assert.equal(audio.muted, true);
    await audio.start();
    const context = fixture.contexts[0];
    const master = context.nodes.find(node => node.type === 'gain');
    assert.equal(master.gain.value, 0);
    assert.equal(audio.setMuted(false), false);
    assert.ok(master.gain.value > 0);
    const engine = context.sources.find(node => node.nodeKind === 'oscillator');
    const idleFrequency = engine.frequency.value;
    audio.setFlight({ speed: 1.5, boost: true, active: true });
    assert.ok(engine.frequency.value > idleFrequency);
    const flightGain = context.nodes.find(node => node !== master && node.type === 'gain' && node.connections.includes(master));
    assert.ok(flightGain.gain.value > 0);
    const rampCount = engine.frequency.events.length;
    for (let i = 0; i < 100; i++) audio.setFlight({ speed: 1.5, boost: true, active: true });
    assert.equal(engine.frequency.events.length, rampCount, 'A steady throttle must not schedule thousands of redundant ramps');
    audio.setFlight({ speed: 0, active: false });
    assert.equal(flightGain.gain.value, 0);
    audio.setMuted(true);
    assert.equal(master.gain.value, 0);
    assert.equal(fixture.storage.get('death-star-assault:muted'), 'true');
    const restored = createAudio();
    assert.equal(restored.muted, true);
    restored.dispose();
  } finally { audio?.dispose(); fixture.close(); }
});

test('sound effects have finite envelopes, bounded polyphony and dispose stops/disconnects every node', async () => {
  const fixture = audioFixture();
  let audio;
  try {
    audio = createAudio(); await audio.start();
    const context = fixture.contexts[0];
    for (let i = 0; i < 24; i++) audio.laser();
    const before = context.sources.length;
    for (let i = 0; i < 100; i++) audio.enemyLaser();
    assert.equal(context.sources.length, before, 'Excess ordinary effects must respect the polyphony budget');
    audio.explosion();
    assert.ok(context.sources.length > before, 'A priority explosion must still sound when the budget is full');
    assert.ok(context.sources.some(source => source.stops.includes(undefined)), 'The oldest voice must be stopped for the priority effect');
    for (const source of context.sources.filter(source => typeof source.onended === 'function')) source.end();
    for (const method of ['laser', 'enemyLaser', 'torpedo', 'ion', 'hit', 'explosion', 'cue', 'ability', 'tie']) audio[method]();
    for (const source of context.sources.filter(source => typeof source.onended === 'function')) {
      assert.ok(source.stops.some(time => Number.isFinite(time) && time > context.currentTime));
    }
    audio.dispose(); audio.dispose();
    assert.equal(context.state, 'closed');
    assert.ok(context.sources.every(source => source.stops.length > 0));
    assert.ok(context.nodes.every(node => node.disconnected));
    const count = context.nodes.length;
    audio.laser(); audio.explosion(); audio.setFlight({ speed: 1, active: true });
    assert.equal(context.nodes.length, count);
  } finally { audio?.dispose(); fixture.close(); }
});
