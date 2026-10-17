/** Original space-opera synthesis with optional, locally bundled licensed samples. */
export function createAudio({ manifest = 'audio/manifest.json' } = {}) {
  const STORAGE_KEY = 'death-star-assault:muted';
  const MAX_VOICES = 24;
  let context, bus, noiseBuffer, flightGain, engineLow, engineHigh, engineFilter;
  let disposed = false;
  let muted = false;
  let flight = { speed: 0, boost: false, active: false };
  let lastFlyby = -Infinity;
  let paused = false;
  let sampleManifest = manifest;
  let sampleLoad = null;
  let sampleRevision = 0;
  let sampleState = 'idle';
  const samples = new Map();
  const cooldowns = new Map();
  const nodes = new Set();
  const sources = new Set();
  const voices = new Set();
  try { muted = globalThis.localStorage?.getItem(STORAGE_KEY) === 'true'; } catch { /* Storage is optional. */ }
  const track = (node) => { nodes.add(node); return node; };
  const smooth = (param, value, seconds = 0.065) => param.setTargetAtTime(value, context.currentTime, seconds);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

  function voice(priority = false) {
    if (!context || disposed || muted || paused || context.state !== 'running') return null;
    if (voices.size >= MAX_VOICES) {
      if (!priority) return null;
      voices.values().next().value.cleanup();
    }
    const owned = new Set();
    const playing = new Set();
    const own = (node) => { owned.add(node); track(node); return node; };
    const output = own(context.createGain());
    output.gain.value = 0.7;
    output.connect(bus);
    let dead = false;
    const result = {
      output, own,
      play(source, when, duration) {
        playing.add(source);
        sources.add(source);
        source.onended = () => {
          playing.delete(source);
          sources.delete(source);
          if (!playing.size) result.cleanup();
        };
        source.start(when);
        source.stop(when + duration + 0.015);
      },
      cleanup() {
        if (dead) return;
        dead = true;
        for (const source of playing) {
          source.onended = null;
          try { source.stop(); } catch { /* Source already ended. */ }
          sources.delete(source);
        }
        playing.clear();
        for (const node of owned) { node.disconnect(); nodes.delete(node); }
        voices.delete(result);
      },
    };
    voices.add(result);
    return result;
  }

  function envelope(v, volume, when, duration) {
    const gain = v.own(context.createGain());
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + Math.min(0.012, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    gain.connect(v.output);
    return gain;
  }
  function tone(v, from, to, duration, wave = 'sine', volume = 0.2, delay = 0) {
    if (!v) return;
    const when = context.currentTime + delay;
    const oscillator = v.own(context.createOscillator());
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(20, from), when);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + duration);
    oscillator.connect(envelope(v, volume, when, duration));
    v.play(oscillator, when, duration);
  }
  function noise(v, from, to, duration, volume = 0.25, delay = 0, type = 'bandpass', q = 1) {
    if (!v) return;
    const when = context.currentTime + delay;
    const source = v.own(context.createBufferSource());
    const filter = v.own(context.createBiquadFilter());
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(20, from), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + duration);
    source.connect(filter);
    filter.connect(envelope(v, volume, when, duration));
    v.play(source, when, duration);
  }
  // A manifest is shipped with the game; it is never a remote audio search service.
  function localUrl(path) {
    if (typeof path !== 'string' || !path || /^(?:[a-z]+:|\/\/)/i.test(path) || path.includes('\\')) return null;
    const base = globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/';
    const url = new URL(path, base);
    return url.origin === new URL(base).origin ? url.href : null;
  }
  async function loadManifest(next = sampleManifest) {
    sampleManifest = next;
    if (!context || disposed || !context.decodeAudioData || !globalThis.fetch || !next) return false;
    const revision = ++sampleRevision;
    sampleState = 'loading';
    const fallback = () => {
      if (!disposed && revision === sampleRevision) sampleState = 'fallback';
      return false;
    };
    const decoded = new Map();
    try {
      let entries = next;
      if (typeof next === 'string') {
        const url = localUrl(next);
        if (!url) return fallback();
        const response = await fetch(url);
        if (!response.ok) return fallback();
        entries = await response.json();
      }
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return fallback();
      await Promise.all(Object.entries(entries).slice(0, 24).map(async ([event, entry]) => {
        try {
          const url = localUrl(entry?.url);
          if (!url) return;
          const response = await fetch(url);
          if (!response.ok || Number(response.headers?.get('content-length')) > 4_000_000) return;
          const bytes = await response.arrayBuffer();
          if (!bytes.byteLength || bytes.byteLength > 4_000_000 || disposed || revision !== sampleRevision) return;
          const buffer = await context.decodeAudioData(bytes);
          if (buffer.duration > 0 && buffer.duration <= 12) decoded.set(event, { buffer, gain: clamp(entry.gain ?? 0.5, 0, 1) });
        } catch { /* Missing or unsupported media keeps the original synth available. */ }
      }));
      if (disposed || revision !== sampleRevision) return false;
      samples.clear();
      for (const [event, sample] of decoded) samples.set(event, sample);
      sampleState = samples.size ? 'ready' : 'fallback';
      return samples.size > 0;
    } catch {
      return fallback();
    }
  }
  function sample(event, priority = false) {
    const loaded = samples.get(event);
    if (!loaded) return false;
    const v = voice(priority);
    if (v) {
      const source = v.own(context.createBufferSource());
      source.buffer = loaded.buffer;
      source.connect(envelope(v, loaded.gain, context.currentTime, loaded.buffer.duration));
      v.play(source, context.currentTime, loaded.buffer.duration);
    }
    return true;
  }
  function ready(event, seconds) {
    if (!context || disposed || muted || paused || context.state !== 'running') return false;
    if (context.currentTime - (cooldowns.get(event) ?? -Infinity) < seconds) return false;
    cooldowns.set(event, context.currentTime);
    return true;
  }
  function buildEngine() {
    flightGain = track(context.createGain());
    flightGain.gain.value = 0;
    flightGain.connect(bus);
    engineFilter = track(context.createBiquadFilter());
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 360;
    engineFilter.Q.value = 0.7;
    engineFilter.connect(flightGain);
    const startOscillator = (wave, frequency, volume) => {
      const oscillator = track(context.createOscillator());
      const gain = track(context.createGain());
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(engineFilter);
      sources.add(oscillator);
      oscillator.start();
      return oscillator;
    };
    engineLow = startOscillator('sawtooth', 47, 0.31);
    engineHigh = startOscillator('triangle', 97, 0.26);
    startOscillator('sine', 29, 0.29);
    const rumble = track(context.createBufferSource());
    const rumbleGain = track(context.createGain());
    rumble.buffer = noiseBuffer;
    rumble.loop = true;
    rumbleGain.gain.value = 0.17;
    rumble.connect(rumbleGain);
    rumbleGain.connect(engineFilter);
    sources.add(rumble);
    rumble.start();
  }
  /** Invoke directly from the Start/resume click; never initializes audio in the menu. */
  function start() {
    if (disposed) return Promise.resolve(false);
    try {
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return Promise.resolve(false);
        context = new AudioContext();
        bus = track(context.createGain());
        bus.gain.value = muted ? 0 : 0.65;
        const compressor = track(context.createDynamicsCompressor());
        compressor.threshold.value = -19;
        compressor.knee.value = 15;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;
        bus.connect(compressor);
        compressor.connect(context.destination);
        noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < samples.length; i += 1) {
          previous = (previous + (Math.random() * 2 - 1) * 0.45) / 1.25;
          samples[i] = previous;
        }
        buildEngine();
        const desired = flight;
        flight = { speed: -10, boost: !desired.boost, active: !desired.active };
        setFlight(desired);
      }
      return context.resume().then(() => {
        if (!sampleLoad) sampleLoad = loadManifest();
        return true;
      }).catch(() => false);
    } catch { return Promise.resolve(false); }
  }
  function setFlight({ speed = 0, boost = false, active = false } = {}) {
    const next = { speed: clamp(speed, 0, 1.7), boost: Boolean(boost), active: Boolean(active) };
    const speedChanged = Math.abs(next.speed - flight.speed) > 0.012 || next.boost !== flight.boost;
    if (context && !disposed) {
      if (next.active !== flight.active) smooth(flightGain.gain, next.active && !paused ? 0.24 : 0, 0.09);
      if (speedChanged) {
        const throttle = next.speed + (next.boost ? 0.35 : 0);
        smooth(engineLow.frequency, 43 + throttle * 38, 0.1);
        smooth(engineHigh.frequency, 88 + throttle * 72, 0.1);
        smooth(engineFilter.frequency, 280 + throttle * 610, 0.12);
      }
    }
    // Accumulate tiny frame-to-frame speed changes before scheduling a new ramp.
    if (!context || speedChanged || next.active !== flight.active) flight = next;
  }
  function laser() {
    if (sample('laser', false)) return;
    const v = voice();
    tone(v, 1150, 110, 0.18, 'sawtooth', 0.22);
    tone(v, 620, 90, 0.13, 'square', 0.09, 0.008);
    noise(v, 2900, 430, 0.095, 0.3, 0, 'bandpass', 2.5);
  }
  function enemyLaser() {
    if (sample('enemyLaser', false)) return;
    const v = voice();
    tone(v, 1740, 310, 0.12, 'square', 0.1);
    tone(v, 920, 180, 0.17, 'sawtooth', 0.14, 0.008);
    noise(v, 3500, 700, 0.065, 0.17, 0, 'highpass');
  }
  function torpedo() {
    if (sample('torpedo', true)) return;
    const v = voice(true);
    noise(v, 550, 95, 0.42, 0.64, 0, 'lowpass');
    tone(v, 180, 40, 0.23, 'triangle', 0.34);
    tone(v, 470, 1650, 0.6, 'sine', 0.14, 0.08);
    tone(v, 1900, 520, 0.65, 'triangle', 0.1, 0.2);
    noise(v, 1700, 3900, 0.55, 0.2, 0.09, 'bandpass', 2);
  }
  function ion() {
    if (sample('ion', true)) return;
    const v = voice(true);
    tone(v, 190, 1400, 0.22, 'triangle', 0.25);
    tone(v, 1250, 65, 0.65, 'sine', 0.25, 0.1);
    tone(v, 670, 85, 0.45, 'square', 0.07, 0.12);
    noise(v, 2700, 180, 0.55, 0.48, 0, 'bandpass', 4);
  }
  function hit(shielded = true) {
    const shield = typeof shielded === 'object' ? Boolean(shielded?.shield ?? shielded?.shielded) : Boolean(shielded);
    if (sample(shield ? 'shieldHit' : 'hullHit')) return;
    const v = voice();
    if (shield) {
      tone(v, 1120, 230, 0.22, 'sine', 0.23);
      tone(v, 680, 170, 0.18, 'triangle', 0.19);
      noise(v, 2200, 520, 0.19, 0.36, 0, 'bandpass', 4);
    } else {
      noise(v, 2600, 85, 0.34, 0.64, 0, 'lowpass');
      tone(v, 130, 31, 0.3, 'square', 0.18);
      tone(v, 370, 90, 0.18, 'triangle', 0.13, 0.02);
    }
  }
  function explosion() {
    if (sample('explosion', true)) return;
    const v = voice(true);
    noise(v, 5300, 70, 1.2, 1.05, 0, 'lowpass');
    noise(v, 2200, 150, 0.75, 0.48, 0.06, 'bandpass', 0.7);
    tone(v, 92, 22, 1.1, 'sine', 0.8);
    tone(v, 170, 27, 0.55, 'sawtooth', 0.2);
  }
  function cue() {
    if (sample('cue', false)) return;
    const v = voice();
    tone(v, 1250, 1790, 0.07, 'sine', 0.13);
    tone(v, 2100, 1480, 0.1, 'triangle', 0.12, 0.09);
    tone(v, 870, 1280, 0.11, 'sine', 0.11, 0.23);
    noise(v, 1900, 2100, 0.055, 0.1, 0, 'bandpass');
  }
  function ability(kind) {
    if (kind === 'ion' || kind === 'ion-pulse') { ion(); return; }
    if (sample('ability', true)) return;
    const v = voice(true);
    tone(v, 180, 880, 0.55, 'sine', 0.2);
    tone(v, 245, 1180, 0.48, 'triangle', 0.13, 0.06);
    noise(v, 500, 1900, 0.5, 0.17, 0, 'bandpass', 3);
  }
  function tie(distance = 0) {
    if (!context || context.currentTime - lastFlyby < 0.8 || distance > 1600) return;
    const v = voice();
    if (!v) return;
    lastFlyby = context.currentTime;
    const proximity = 1 / (1 + clamp(distance, 0, 1600) / 180);
    tone(v, 470, 95, 0.8, 'sawtooth', 0.19 * proximity);
    tone(v, 610, 125, 0.75, 'square', 0.065 * proximity, 0.025);
    noise(v, 1500, 190, 0.85, 0.42 * proximity, 0, 'bandpass', 2.2);
  }
  function astromech() {
    if (!ready('astromech', 2.2) || sample('astromech')) return;
    const v = voice();
    // Glides and uneven answers form an original droid-like phrase.
    for (const [from, to, delay, duration] of [[820, 1530, 0, 0.1], [1700, 980, 0.13, 0.08], [660, 1260, 0.26, 0.16], [2100, 1640, 0.46, 0.08]]) {
      tone(v, from, to, duration, 'sine', 0.12, delay);
      tone(v, from * 1.48, to * 1.48, duration, 'triangle', 0.035, delay);
    }
  }
  function radio(kind = 'in') {
    const closing = kind === 'out';
    if (!ready(`radio-${kind}`, 0.25) || sample(closing ? 'radioOut' : 'radioIn')) return;
    const v = voice();
    noise(v, closing ? 1800 : 900, closing ? 600 : 2600, 0.12, 0.19, 0, 'bandpass', 3);
    tone(v, closing ? 1180 : 1650, closing ? 830 : 1250, 0.045, 'sine', 0.07, 0.025);
  }
  function lock(state = 'search') {
    if (!['search', 'locked', 'lost'].includes(state) || !ready(`lock-${state}`, state === 'search' ? 0.55 : 1.4) || sample(`lock-${state}`)) return;
    const v = voice();
    tone(v, state === 'lost' ? 750 : 1100, state === 'lost' ? 330 : 1100, 0.07, 'sine', 0.09);
    if (state === 'locked') tone(v, 1650, 1650, 0.13, 'sine', 0.1, 0.12);
  }
  function incoming() {
    if (!ready('incoming', 1.25) || sample('incoming', true)) return;
    const v = voice(true);
    for (let i = 0; i < 3; i++) tone(v, 710, 1220, 0.13, 'square', 0.055, i * 0.22);
  }
  function turbolaser() {
    if (!ready('turbolaser', 0.08) || sample('turbolaser')) return;
    const v = voice();
    tone(v, 390, 45, 0.36, 'sawtooth', 0.2);
    tone(v, 155, 34, 0.42, 'triangle', 0.21);
    noise(v, 1800, 160, 0.25, 0.25, 0, 'lowpass');
  }
  function vent() {
    if (!ready('vent', 2) || sample('vent')) return;
    const v = voice();
    noise(v, 6500, 650, 1.3, 0.23, 0, 'highpass', 0.6);
    noise(v, 1300, 240, 0.8, 0.12, 0, 'bandpass', 1.4);
  }
  function missionCue(kind = 'objective') {
    if (!ready(`mission-${kind}`, 1.5) || sample(`mission-${kind}`, true)) return;
    const v = voice(true);
    // Newly composed short interval patterns, without a film theme quotation.
    const notes = kind === 'success' ? [392, 523.25, 659.25, 783.99]
      : kind === 'fail' ? [293.66, 277.18, 220, 146.83]
        : kind === 'victory' ? [261.63, 392, 523.25, 659.25, 783.99]
          : [523.25, 698.46];
    // The final fanfare answers the mission-complete sting instead of doubling it.
    const lead = kind === 'victory' ? 0.75 : 0;
    const step = kind === 'victory' ? 0.34 : 0.19;
    const hold = kind === 'victory' ? 0.72 : 0.3;
    notes.forEach((frequency, i) => {
      tone(v, frequency, frequency, hold, 'triangle', 0.12, lead + i * step);
      tone(v, frequency / 2, frequency / 2, hold + 0.04, 'sine', 0.1, lead + i * step);
    });
    if (kind === 'victory') {
      tone(v, 130.81, 130.81, 2.4, 'sine', 0.09, lead);
      noise(v, 700, 3400, 1.8, 0.07, lead, 'bandpass', 1.2);
    }
  }
  /** Death Star superlaser charging: a rising, accelerating charge that never quotes the film. */
  function superlaserCharge(duration = 4.5) {
    if (!ready('superlaser-charge', 1.5) || sample('superlaserCharge', true)) return;
    const v = voice(true);
    if (!v) return;
    const span = clamp(duration, 1, 8);
    tone(v, 38, 210, span, 'sawtooth', 0.22);
    tone(v, 57, 316, span, 'triangle', 0.16);
    tone(v, 900, 3900, span, 'sine', 0.055);
    noise(v, 180, 1700, span, 0.15, 0, 'bandpass', 2.6);
    noise(v, 60, 300, span, 0.2, 0, 'lowpass');
    for (let i = 0; i < 8; i++) {
      const at = span * Math.pow(i / 8, 1.7);
      tone(v, 300 + i * 54, 250 + i * 40, 0.08, 'square', 0.04 + i * 0.006, at);
    }
  }
  /** Superlaser discharge: one colossal slam, a horn-like scream and a rolling tail. */
  function superlaserFire() {
    if (!ready('superlaser-fire', 2.5) || sample('superlaserFire', true)) return;
    const v = voice(true);
    if (!v) return;
    tone(v, 260, 17, 3, 'sine', 0.9);
    tone(v, 430, 30, 1.5, 'sawtooth', 0.32);
    tone(v, 980, 140, 1.25, 'sawtooth', 0.22, 0.04);
    noise(v, 7200, 70, 2.8, 0.95, 0, 'lowpass');
    noise(v, 2600, 150, 1.4, 0.45, 0.05, 'bandpass', 0.8);
    noise(v, 320, 90, 2.2, 0.32, 0.55, 'bandpass', 1.1);
  }
  /** Station destruction: the core detonates, then the hull breaks up in spreading secondary blasts. */
  function stationExplosion() {
    if (!ready('station-explosion', 4) || sample('stationExplosion', true)) return;
    const v = voice(true);
    if (!v) return;
    tone(v, 58, 15, 5.6, 'sine', 0.9);
    tone(v, 31, 19, 5.4, 'sine', 0.5);
    noise(v, 9000, 80, 4.8, 0.85, 0, 'lowpass');
    noise(v, 420, 45, 5.4, 0.4, 0.9, 'lowpass');
    const chain = [0, 0.22, 0.5, 0.86, 1.3, 1.85, 2.5, 3.3, 4.2];
    chain.forEach((at, i) => {
      const falloff = 1 - i / 11;
      noise(v, 3400 - i * 170, 90, 0.9 + i * 0.14, 0.5 * falloff, at, 'lowpass');
      tone(v, 124 - i * 6, 24, 0.8, 'triangle', 0.32 * falloff, at);
    });
  }
  /** Battle-stations alarm: three two-tone sweeps, rate limited for mission phase changes. */
  function klaxon() {
    if (!ready('klaxon', 3) || sample('klaxon', true)) return;
    const v = voice(true);
    if (!v) return;
    for (let i = 0; i < 3; i++) {
      tone(v, 760, 505, 0.34, 'square', 0.085, i * 0.74);
      tone(v, 380, 262, 0.36, 'sawtooth', 0.1, i * 0.74);
      tone(v, 505, 1620, 0.28, 'sine', 0.055, i * 0.74 + 0.36);
    }
  }
  /** Rushing pass-by for scraping a trench wall or flying close to a hull. */
  function whoosh(distance = 260) {
    if (!ready('whoosh', 2.5) || sample('whoosh')) return;
    const v = voice();
    if (!v) return;
    const proximity = 1 / (1 + clamp(distance, 0, 1600) / 300);
    noise(v, 220, 2700, 0.55, 0.5 * proximity, 0, 'bandpass', 1.1);
    noise(v, 900, 170, 0.7, 0.3 * proximity, 0.06, 'lowpass');
    tone(v, 110, 300, 0.45, 'sine', 0.1 * proximity, 0.02);
  }
  /** Magazine detonation: a sharp crack with a metallic ring, distinct from a plain hull hit. */
  function torpedoImpact() {
    if (!ready('torpedo-impact', 2) || sample('torpedoImpact', true)) return;
    const v = voice(true);
    if (!v) return;
    noise(v, 5400, 120, 0.95, 0.8, 0, 'lowpass');
    tone(v, 190, 36, 0.75, 'sine', 0.5);
    tone(v, 1450, 250, 0.5, 'sawtooth', 0.16, 0.02);
    tone(v, 2180, 1860, 0.44, 'triangle', 0.07, 0.05);
    noise(v, 1900, 420, 0.6, 0.24, 0.08, 'bandpass', 3);
  }
  function setPaused(value) {
    paused = Boolean(value);
    if (paused) for (const v of [...voices]) v.cleanup();
    if (flightGain && !disposed) smooth(flightGain.gain, !paused && flight.active ? 0.24 : 0, 0.025);
  }
  function setMuted(value) {
    muted = Boolean(value);
    try { globalThis.localStorage?.setItem(STORAGE_KEY, String(muted)); } catch { /* Storage is optional. */ }
    if (bus && !disposed) smooth(bus.gain, muted ? 0 : 0.65, 0.025);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    sampleRevision++;
    samples.clear();
    sampleState = 'disposed';
    cooldowns.clear();
    for (const v of [...voices]) v.cleanup();
    for (const source of sources) {
      source.onended = null;
      try { source.stop(); } catch { /* Source already ended. */ }
    }
    sources.clear();
    for (const node of nodes) node.disconnect();
    nodes.clear();
    if (context) context.close().catch(() => {});
    noiseBuffer = null;
  }
  return {
    start, laser, enemyLaser, torpedo, ion, hit, explosion, cue, ability, tie, setFlight, setMuted, dispose,
    astromech, radio, lock, incoming, turbolaser, vent, missionCue, setPaused, loadManifest,
    superlaserCharge, superlaserFire, stationExplosion, klaxon, whoosh, torpedoImpact,
    getSampleStatus: () => ({ state: sampleState, events: [...samples.keys()] }),
    engine: setFlight,
    updateEngine: (speed, maxSpeed = 1, active = true) => setFlight({ speed: speed / Math.max(1, maxSpeed), active, boost: speed > maxSpeed * 1.12 }),
    getmuted: () => muted,
    getMuted: () => muted,
    get muted() { return muted; },
  };
}
