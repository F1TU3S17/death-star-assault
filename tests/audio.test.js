import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  const originalFetch = globalThis.fetch;
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
    globalThis.fetch = originalFetch;
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


test('mission signals are distinct, rate limited and silent while paused or muted', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    const signatures = [];
    for (const action of [() => audio.astromech(), () => audio.radio(), () => audio.radio('out'), () => audio.lock('locked'), () => audio.incoming(), () => audio.turbolaser(), () => audio.vent(), () => audio.missionCue('success'), () => audio.missionCue('fail')]) {
      const before = context.sources.length;
      action();
      const added = context.sources.slice(before);
      assert.ok(added.length > 0);
      signatures.push(JSON.stringify(added.map(source => [source.type, source.frequency?.events, source.startTime])));
      const count = context.sources.length;
      action();
      assert.equal(context.sources.length, count, 'Repeated frame calls must not flood the mixer');
      for (const source of added) source.end();
    }
    assert.equal(new Set(signatures).size, signatures.length);
    audio.setFlight({ speed: 1, active: true });
    audio.laser();
    audio.setPaused(true);
    const count = context.sources.length;
    audio.laser(); audio.incoming(); audio.missionCue('objective');
    assert.equal(context.sources.length, count);
    assert.ok(context.sources.slice(4).every(source => source.stops.length > 0));
    audio.setPaused(false);
    audio.setMuted(true);
    audio.vent(); audio.turbolaser(); audio.astromech();
    assert.equal(context.sources.length, count);
    audio.setMuted(false);
    audio.laser();
    assert.ok(context.sources.length > count);
  } finally { audio.dispose(); fixture.close(); }
});

test('licensed local sample manifest starts only after gesture and replaces synthesis within voice budget', async () => {
  const fixture = audioFixture();
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    return { ok: true, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(16) };
  };
  const manifest = { laser: { url: '/audio/laser.wav', gain: 0.25 }, incoming: { url: '/audio/alarm.wav', gain: 0.3 }, vent: { url: 'https://untrusted.example/file.wav' } };
  const audio = createAudio({ manifest });
  try {
    assert.equal(await audio.loadManifest(manifest), false);
    assert.equal(requests.length, 0, 'Do not download or decode before user audio activation');
    await audio.start();
    const context = fixture.contexts[0];
    const decoded = { duration: 0.4 };
    context.decodeAudioData = async () => decoded;
    assert.equal(await audio.loadManifest(manifest), true);
    assert.deepEqual(audio.getSampleStatus(), { state: 'ready', events: ['laser', 'incoming'] });
    assert.equal(requests.length, 2, 'Remote manifest entries are rejected');
    const before = context.sources.length;
    audio.laser();
    assert.equal(context.sources.length, before + 1, 'Sample replaces the oscillator stack');
    assert.equal(context.sources.at(-1).buffer, decoded);
    for (let i = 0; i < 100; i++) audio.laser();
    assert.equal(context.sources.length, before + 24);
    audio.incoming();
    assert.equal(context.sources.length, before + 25, 'Priority sampled alarm evicts the oldest voice');
    audio.setPaused(true);
    assert.ok(context.sources.slice(before).every(source => source.stops.includes(undefined)));
    const count = context.sources.length;
    audio.laser(); audio.setPaused(false); audio.setMuted(true); audio.laser();
    assert.equal(context.sources.length, count);
    audio.dispose();
    assert.equal(audio.getSampleStatus().state, 'disposed');
    assert.ok(context.nodes.every(node => node.disconnected));
  } finally { audio.dispose(); fixture.close(); }
});

test('missing and invalid samples retain audible synth fallback and late decode cannot outlive disposal', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    context.decodeAudioData = async () => { throw new Error('Unsupported codec'); };
    globalThis.fetch = async () => ({ ok: false });
    assert.equal(await audio.loadManifest({ laser: { url: '/audio/missing.wav' } }), false);
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
    assert.equal(await audio.loadManifest({ laser: { url: '/audio/bad.wav' } }), false);
    const count = context.sources.length;
    audio.laser();
    assert.equal(context.sources.length, count + 3, 'Synth stack still sounds after media/decode failure');
    let resolveDecode;
    let decoding;
    const started = new Promise(resolve => { decoding = resolve; });
    context.decodeAudioData = () => { decoding(); return new Promise(resolve => { resolveDecode = resolve; }); };
    const loading = audio.loadManifest({ laser: { url: '/audio/slow.wav' } });
    await started;
    audio.dispose();
    resolveDecode({ duration: 1 });
    assert.equal(await loading, false);
    assert.deepEqual(audio.getSampleStatus(), { state: 'disposed', events: [] });
  } finally { audio.dispose(); fixture.close(); }
});


test('bundled audio manifest uses all ten attributed CC0 files with matching hashes', () => {
  const audioRoot = new URL('../public/audio/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', audioRoot), 'utf8'));
  const provenance = JSON.parse(readFileSync(new URL('sources.json', audioRoot), 'utf8'));
  const used = new Set(Object.values(manifest).map(entry => entry.url.replace(/^audio\//, '')));
  assert.equal(provenance.assets.length, 10);
  for (const asset of provenance.assets) {
    assert.ok(used.has(asset.file), `Bundled file ${asset.file} must have a runtime event`);
    assert.equal(asset.license, 'CC0-1.0');
    assert.ok(provenance.sources[asset.creator]);
    const bytes = readFileSync(new URL(asset.file, audioRoot));
    assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
  for (const entry of Object.values(manifest)) {
    assert.ok(entry.url.startsWith('audio/'));
    assert.ok(entry.gain > 0 && entry.gain <= 1);
    assert.ok(provenance.assets.some(asset => `audio/${asset.file}` === entry.url));
  }
  assert.match(readFileSync(new URL('kenney/License.txt', audioRoot), 'utf8'), /CC0/);
  assert.match(readFileSync(new URL('CREDITS.txt', audioRoot), 'utf8'), /rubberduck/);
});
