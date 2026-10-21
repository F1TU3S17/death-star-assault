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
    for (const method of ['laser', 'enemyLaser', 'torpedo', 'ion', 'hit', 'explosion', 'cue', 'ability', 'tie', 'superlaserCharge', 'superlaserFire', 'stationExplosion', 'klaxon', 'whoosh', 'torpedoImpact', 'crash']) audio[method]();
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
    // Everything created before the first effect is the persistent engine and score bed.
    const persistent = context.sources.length;
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
    assert.ok(context.sources.slice(persistent).every(source => source.stops.length > 0));
    audio.setPaused(false);
    audio.setMuted(true);
    audio.vent(); audio.turbolaser(); audio.astromech();
    assert.equal(context.sources.length, count);
    audio.setMuted(false);
    audio.laser();
    assert.ok(context.sources.length > count);
  } finally { audio.dispose(); fixture.close(); }
});

test('superlaser, station and impact events sound once, respect pause and mute, then recover', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    const events = [
      ['superlaserCharge', () => audio.superlaserCharge()],
      ['superlaserFire', () => audio.superlaserFire()],
      ['stationExplosion', () => audio.stationExplosion()],
      ['klaxon', () => audio.klaxon()],
      ['whoosh', () => audio.whoosh(120)],
      ['torpedoImpact', () => audio.torpedoImpact()],
      ['crash', () => audio.crash()],
    ];
    for (const [name, action] of events) {
      context.currentTime += 10;
      const before = context.sources.length;
      action();
      const added = context.sources.slice(before);
      assert.ok(added.length > 0, `${name} must synthesise audible sources on the first call`);
      const count = context.sources.length;
      action();
      assert.equal(context.sources.length, count, `${name} must be rate limited on an immediate repeat`);
      for (const source of added) source.end();
    }
    audio.setPaused(true);
    for (const [name, action] of events) {
      context.currentTime += 10;
      const count = context.sources.length;
      action();
      assert.equal(context.sources.length, count, `${name} must stay silent while paused`);
    }
    audio.setPaused(false);
    for (const [name, action] of events) {
      context.currentTime += 10;
      const count = context.sources.length;
      action();
      assert.ok(context.sources.length > count, `${name} must sound again after unpausing`);
      for (const source of context.sources.slice(count)) source.end();
    }
    audio.setMuted(true);
    for (const [name, action] of events) {
      context.currentTime += 10;
      const count = context.sources.length;
      action();
      assert.equal(context.sources.length, count, `${name} must stay silent while muted`);
    }
    audio.setMuted(false);
    for (const [name, action] of events) {
      context.currentTime += 10;
      const count = context.sources.length;
      action();
      assert.ok(context.sources.length > count, `${name} must sound again after unmuting`);
      for (const source of context.sources.slice(count)) source.end();
    }
  } finally { audio.dispose(); fixture.close(); }
});

test('fatal crash is a throttle-gated priority slam that recovers past its cooldown', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    const before = context.sources.length;
    audio.crash();
    const added = context.sources.slice(before);
    assert.ok(added.length > 0, 'The crash must synthesise its impact voice');
    for (const source of added) {
      assert.ok(source.stops.some(time => Number.isFinite(time) && time > context.currentTime), 'Every crash source must have a finite stop');
    }
    const span = Math.max(...added.map(source => Math.max(...source.stops))) - context.currentTime;
    assert.ok(span >= 1.4 && span <= 1.6, `The crash must last roughly one and a half seconds, got ${span}`);
    const count = context.sources.length;
    audio.crash();
    assert.equal(context.sources.length, count, 'An immediate repeat must be gated by the ready() throttle');
    for (const source of added) source.end();
    audio.setPaused(true);
    context.currentTime += 1.3;
    audio.crash();
    assert.equal(context.sources.length, count, 'An expired cooldown must not bypass the pause gate');
    audio.setPaused(false);
    context.currentTime += 1.3;
    audio.crash();
    assert.ok(context.sources.length > count, 'Advancing past the 1.2 second cooldown must allow a new crash');
    for (const source of context.sources.slice(count)) source.end();
  } finally { audio.dispose(); fixture.close(); }
});

test('priority detonations still sound when the ordinary polyphony budget is exhausted', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    for (let i = 0; i < 24; i++) {
      context.currentTime += 10;
      audio.laser();
    }
    const before = context.sources.length;
    context.currentTime += 10;
    audio.whoosh();
    assert.equal(context.sources.length, before, 'A non-priority whoosh must not exceed the voice budget');
    context.currentTime += 10;
    audio.stationExplosion();
    assert.ok(context.sources.length > before, 'The station explosion must evict an ordinary voice and still sound');
    const afterExplosion = context.sources.length;
    context.currentTime += 10;
    audio.torpedoImpact();
    assert.ok(context.sources.length > afterExplosion, 'The torpedo impact must still sound on a full mixer');
    assert.ok(context.sources.some(source => source.stops.includes(undefined)), 'An evicted voice is stopped without a scheduled time');
    audio.dispose(); audio.dispose();
    assert.equal(context.state, 'closed');
    assert.ok(context.sources.every(source => source.stops.length > 0));
    assert.ok(context.nodes.every(node => node.disconnected));
  } finally { audio.dispose(); fixture.close(); }
});

test('superlaser charge clamps its request to a finite one to eight second span', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    context.currentTime = 10;
    const before = context.sources.length;
    audio.superlaserCharge(0);
    const short = context.sources.slice(before);
    assert.ok(short.length > 0, 'A zero-length request must still produce the charging voice');
    for (const source of short) {
      assert.ok(source.stops.some(time => Number.isFinite(time) && time > context.currentTime), 'Every clamped charge source must have a finite closing stop');
    }
    const shortSpan = Math.max(...short.map(source => Math.max(...source.stops))) - context.currentTime;
    assert.ok(shortSpan >= 1, `A zero-length request must clamp up to the one second floor, got ${shortSpan}`);
    for (const source of short) source.end();
    context.currentTime = 100;
    const longStart = context.sources.length;
    audio.superlaserCharge(100);
    const long = context.sources.slice(longStart);
    assert.ok(long.length > 0, 'An over-long request must still produce the charging voice');
    const longSpan = Math.max(...long.map(source => Math.max(...source.stops))) - context.currentTime;
    assert.ok(longSpan <= 8.02, `A charge must never exceed the eight second ceiling, got ${longSpan}`);
  } finally { audio.dispose(); fixture.close(); }
});

test('victory mission cue is a distinct and longer phrase than the success sting', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    await audio.start();
    const context = fixture.contexts[0];
    const cues = [];
    for (const kind of ['success', 'victory']) {
      context.currentTime += 10;
      const at = context.currentTime;
      const before = context.sources.length;
      audio.missionCue(kind);
      const added = context.sources.slice(before);
      assert.ok(added.length > 0, `${kind} must synthesise a mission cue`);
      cues.push({
        signature: JSON.stringify(added.map(source => [source.type, source.frequency?.events, source.startTime])),
        span: Math.max(...added.map(source => Math.max(...source.stops))) - at,
      });
      for (const source of added) source.end();
    }
    assert.notEqual(cues[0].signature, cues[1].signature, 'Victory must not reuse the success sting');
    assert.ok(cues[1].span > cues[0].span, 'The victory fanfare must be longer than the success sting');
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
    assert.ok(context.sources.length > count, 'Synth stack still sounds after media/decode failure');
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


test('original adaptive score follows the mission phase, loops without timers and obeys pause', async () => {
  const fixture = audioFixture();
  const audio = createAudio({ manifest: null });
  try {
    audio.setMusic({ phase: 'menu', intensity: 0.8 });
    assert.equal(fixture.contexts.length, 0, 'The score must wait for the user gesture');
    await audio.start();
    const context = fixture.contexts[0];
    const oscillators = () => context.sources.filter(source => source.nodeKind === 'oscillator');
    const soundsLike = frequency => oscillators().some(source => Math.abs(source.frequency.value - frequency) < 0.06);
    // Four pad voices plus the first phrase of eight notes run as soon as the context is live.
    assert.ok(oscillators().length >= 12, `Pad voices and the opening phrase must exist, got ${oscillators().length}`);
    assert.ok(soundsLike(130.81), 'The menu theme must sound its own root');
    // The score set before the gesture must become audible as soon as the context runs.
    assert.ok(context.nodes.some(node => node.nodeKind === 'gain' && Math.abs(node.gain.value - 0.273) < 0.01), 'The score must reach its menu level after the gesture');
    // A phase change retunes the pad to that theme's modal centre and its mode.
    audio.setMusic({ phase: 'defeat', intensity: 0.6 });
    assert.ok(soundsLike(87.31), 'The defeat theme must retune the pad root');
    assert.ok(soundsLike(103.83), 'The defeat theme must use a minor third');
    audio.setMusic({ phase: 'victory', intensity: 0.9 });
    assert.ok(soundsLike(164.81), 'The victory theme must use a major third');
    // The phrase loops from its own final note, so the score needs no wall-clock timer.
    const before = context.sources.length;
    oscillators().at(-1).end();
    assert.ok(context.sources.length > before, `The phrase must schedule its own successor: ${context.sources.length} vs ${before}`);
    // Pausing stops both the loop and the audible level; resuming restores them.
    audio.setPaused(true);
    const paused = context.sources.length;
    oscillators().at(-1).end();
    audio.setMusic({ phase: 'victory', intensity: 0.9 });
    assert.equal(context.sources.length, paused, 'A paused score must not schedule new phrases');
    audio.setPaused(false);
    assert.ok(context.sources.length > paused, 'Resuming must restart the phrase loop');
    audio.setMuted(true);
    audio.setMuted(false);
    audio.dispose();
    assert.ok(context.nodes.every(node => node.disconnected));
    assert.ok(context.sources.every(source => source.stops.length > 0));
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
