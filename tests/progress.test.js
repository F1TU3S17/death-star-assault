import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, createProgress } from '../src/game/progress.js';

const KEY = 'death-star-assault:progress';

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

function makeThrowingStorage() {
  return {
    getItem() { throw new Error('access denied'); },
    setItem() { throw new Error('quota exceeded'); },
    removeItem() { throw new Error('access denied'); },
  };
}

test('records accumulate; bests and victory count update', () => {
  const progress = createProgress();
  let state = progress.record({ victory: true, missionId: 'trench', score: 1500, elapsed: 90, kills: 7, shots: 100, hits: 60 });
  assert.equal(state.runCount, 1);
  assert.equal(state.victoryCount, 1);
  assert.equal(state.bestScore, 1500);
  assert.equal(state.bestAccuracy, 0.6);
  state = progress.record({ victory: false, missionId: 'trench', score: 2200, elapsed: 80, kills: 4, shots: 80, hits: 30 });
  assert.equal(state.runCount, 2);
  assert.equal(state.victoryCount, 1);
  assert.equal(state.bestScore, 2200);
  assert.equal(state.bestAccuracy, 0.6);
  assert.deepEqual(state.last, { victory: false, missionId: 'trench', score: 2200, elapsed: 80, kills: 4, accuracy: 0.375 });
  const mission = state.perMission.trench;
  assert.equal(mission.bestScore, 2200);
  assert.equal(mission.bestKills, 7);
  // Defeat elapsed 80 must not overwrite the 90s victory time... in the other
  // direction: defeat elapsed can never set bestTime regardless of value.
  assert.equal(mission.bestTime, 90);
  assert.equal(mission.victories, 1);
});

test('accuracy is null when no shots fired', () => {
  const progress = createProgress();
  const state = progress.record({ victory: false, missionId: 'm', score: 10, elapsed: 5, kills: 1, shots: 0, hits: 0 });
  assert.equal(state.bestAccuracy, null);
  assert.equal(state.last.accuracy, null);
});

test('perMission isolation; fastest victory time wins', () => {
  const progress = createProgress();
  progress.record({ victory: true, missionId: 'alpha', score: 100, elapsed: 60, kills: 3 });
  progress.record({ victory: true, missionId: 'beta', score: 50, elapsed: 40, kills: 2 });
  let state = progress.record({ victory: true, missionId: 'alpha', score: 200, elapsed: 45, kills: 5 });
  assert.equal(state.perMission.alpha.bestTime, 45);
  assert.equal(state.perMission.alpha.victories, 2);
  assert.equal(state.perMission.beta.bestTime, 40);
  assert.equal(state.perMission.beta.victories, 1);
  state = progress.record({ victory: true, missionId: 'alpha', score: 300, elapsed: 70, kills: 6 });
  assert.equal(state.perMission.alpha.bestTime, 45);
  assert.equal(state.perMission.beta.bestScore, 50);
  // gamma never existed
  assert.equal(state.perMission.gamma, undefined);
});

test('persistence round-trip across two instances with a fake storage', () => {
  const fake = makeFakeStorage();
  const first = createProgress({ storage: fake });
  first.record({ victory: true, missionId: 'trench', score: 900, elapsed: 75, kills: 6, shots: 50, hits: 25 });
  const second = createProgress({ storage: fake });
  const state = second.get();
  assert.equal(state.runCount, 1);
  assert.equal(state.victoryCount, 1);
  assert.equal(state.bestScore, 900);
  assert.equal(state.bestAccuracy, 0.5);
  assert.equal(state.perMission.trench.bestTime, 75);
  assert.equal(state.last.kills, 6);
});

test('corrupt JSON in storage yields fresh defaults without throwing', () => {
  const fake = makeFakeStorage();
  fake.setItem(KEY, '{not valid json');
  const progress = createProgress({ storage: fake });
  const state = progress.get();
  assert.equal(state.runCount, 0);
  assert.equal(state.bestScore, 0);
  assert.equal(state.bestAccuracy, null);
  assert.deepEqual(state.perMission, {});
  assert.equal(state.last, null);
  // Next record overwrites the corrupt payload with a fresh state.
  progress.record({ victory: false, missionId: 'm', score: 5, elapsed: 1, kills: 0 });
  const recovered = createProgress({ storage: fake, key: KEY }).get();
  assert.equal(recovered.runCount, 1);
  assert.equal(recovered.bestScore, 5);
  assert.match(fake.map.get(KEY), /"runCount":1/);
});

test('unknown version behaves like a reset and does not throw', () => {
  const fake = makeFakeStorage();
  fake.setItem(KEY, JSON.stringify({ version: VERSION + 100, runCount: 99, bestScore: 9999, perMission: { x: {} } }));
  const progress = createProgress({ storage: fake, key: KEY });
  const state = progress.get();
  assert.equal(state.version, VERSION);
  assert.equal(state.runCount, 0);
  assert.equal(state.bestScore, 0);
  assert.deepEqual(state.perMission, {});
  progress.record({ victory: true, missionId: 'm', score: 3, elapsed: 9, kills: 1 });
  const reloaded = createProgress({ storage: fake, key: KEY }).get();
  assert.equal(reloaded.runCount, 1);
  assert.equal(reloaded.bestScore, 3);
});

test('throwing storage degrades to memory-only and keeps instance bests', () => {
  const progress = createProgress({ storage: makeThrowingStorage() });
  let state = progress.record({ victory: true, missionId: 'trench', score: 420, elapsed: 55, kills: 4 });
  assert.equal(state.runCount, 1);
  state = progress.record({ victory: false, missionId: 'trench', score: 500, elapsed: 10, kills: 1 });
  assert.equal(state.bestScore, 500);
  assert.equal(state.victoryCount, 1);
  assert.equal(state.perMission.trench.bestTime, 55);
  const memory = progress.get();
  assert.equal(memory.runCount, 2);
  assert.equal(memory.bestScore, 500);
});

test('reset clears and round-trips alongside persistence', () => {
  const fake = makeFakeStorage();
  const progress = createProgress({ storage: fake });
  progress.record({ victory: true, missionId: 'm', score: 77, elapsed: 12, kills: 2 });
  const cleared = progress.reset();
  assert.equal(cleared.runCount, 0);
  assert.equal(cleared.bestScore, 0);
  assert.deepEqual(cleared.perMission, {});
  const reloaded = createProgress({ storage: fake }).get();
  assert.equal(reloaded.runCount, 0);
  assert.equal(reloaded.bestScore, 0);
  assert.equal(reloaded.last, null);
});

test('record clamps non-finite fields to zero', () => {
  const progress = createProgress();
  const state = progress.record({
    victory: false,
    missionId: 'm',
    score: NaN,
    elapsed: Infinity,
    kills: -Infinity,
    shots: NaN,
    hits: Infinity,
  });
  assert.deepEqual(state.last, { victory: false, missionId: 'm', score: 0, elapsed: 0, kills: 0, accuracy: null });
  assert.equal(state.bestScore, 0);
  assert.equal(state.bestAccuracy, null);
  assert.equal(state.perMission.m.bestScore, 0);
  assert.equal(state.perMission.m.bestKills, 0);
  assert.equal(state.perMission.m.bestTime, null);
});
