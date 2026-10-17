/** Original synthesized space-opera sound. No recordings or network audio. */
export function createAudio() {
  const STORAGE_KEY = 'death-star-assault:muted';
  const MAX_VOICES = 24;
  let context, bus, noiseBuffer, flightGain, engineLow, engineHigh, engineFilter;
  let disposed = false;
  let muted = false;
  let flight = { speed: 0, boost: false, active: false };
  let lastFlyby = -Infinity;
  const nodes = new Set();
  const sources = new Set();
  const voices = new Set();
  try { muted = globalThis.localStorage?.getItem(STORAGE_KEY) === 'true'; } catch { /* Storage is optional. */ }
  const track = (node) => { nodes.add(node); return node; };
  const smooth = (param, value, seconds = 0.065) => param.setTargetAtTime(value, context.currentTime, seconds);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, Number.isFinite(value) ? value : low));

  function voice(priority = false) {
    if (!context || disposed || muted || context.state !== 'running') return null;
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
      return context.resume().then(() => true).catch(() => false);
    } catch { return Promise.resolve(false); }
  }
  function setFlight({ speed = 0, boost = false, active = false } = {}) {
    const next = { speed: clamp(speed, 0, 1.7), boost: Boolean(boost), active: Boolean(active) };
    const speedChanged = Math.abs(next.speed - flight.speed) > 0.012 || next.boost !== flight.boost;
    if (context && !disposed) {
      if (next.active !== flight.active) smooth(flightGain.gain, next.active ? 0.24 : 0, 0.09);
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
    const v = voice();
    tone(v, 1150, 110, 0.18, 'sawtooth', 0.22);
    tone(v, 620, 90, 0.13, 'square', 0.09, 0.008);
    noise(v, 2900, 430, 0.095, 0.3, 0, 'bandpass', 2.5);
  }
  function enemyLaser() {
    const v = voice();
    tone(v, 1740, 310, 0.12, 'square', 0.1);
    tone(v, 920, 180, 0.17, 'sawtooth', 0.14, 0.008);
    noise(v, 3500, 700, 0.065, 0.17, 0, 'highpass');
  }
  function torpedo() {
    const v = voice(true);
    noise(v, 550, 95, 0.42, 0.64, 0, 'lowpass');
    tone(v, 180, 40, 0.23, 'triangle', 0.34);
    tone(v, 470, 1650, 0.6, 'sine', 0.14, 0.08);
    tone(v, 1900, 520, 0.65, 'triangle', 0.1, 0.2);
    noise(v, 1700, 3900, 0.55, 0.2, 0.09, 'bandpass', 2);
  }
  function ion() {
    const v = voice(true);
    tone(v, 190, 1400, 0.22, 'triangle', 0.25);
    tone(v, 1250, 65, 0.65, 'sine', 0.25, 0.1);
    tone(v, 670, 85, 0.45, 'square', 0.07, 0.12);
    noise(v, 2700, 180, 0.55, 0.48, 0, 'bandpass', 4);
  }
  function hit(shielded = true) {
    const shield = typeof shielded === 'object' ? Boolean(shielded?.shield ?? shielded?.shielded) : Boolean(shielded);
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
    const v = voice(true);
    noise(v, 5300, 70, 1.2, 1.05, 0, 'lowpass');
    noise(v, 2200, 150, 0.75, 0.48, 0.06, 'bandpass', 0.7);
    tone(v, 92, 22, 1.1, 'sine', 0.8);
    tone(v, 170, 27, 0.55, 'sawtooth', 0.2);
  }
  function cue() {
    const v = voice();
    tone(v, 1250, 1790, 0.07, 'sine', 0.13);
    tone(v, 2100, 1480, 0.1, 'triangle', 0.12, 0.09);
    tone(v, 870, 1280, 0.11, 'sine', 0.11, 0.23);
    noise(v, 1900, 2100, 0.055, 0.1, 0, 'bandpass');
  }
  function ability(kind) {
    if (kind === 'ion' || kind === 'ion-pulse') { ion(); return; }
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
  function setMuted(value) {
    muted = Boolean(value);
    try { globalThis.localStorage?.setItem(STORAGE_KEY, String(muted)); } catch { /* Storage is optional. */ }
    if (bus && !disposed) smooth(bus.gain, muted ? 0 : 0.65, 0.025);
    return muted;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
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
    engine: setFlight,
    updateEngine: (speed, maxSpeed = 1, active = true) => setFlight({ speed: speed / Math.max(1, maxSpeed), active, boost: speed > maxSpeed * 1.12 }),
    getmuted: () => muted,
    getMuted: () => muted,
    get muted() { return muted; },
  };
}
