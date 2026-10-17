import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemySquadron } from '../src/game/enemy-squadron.js';

const fighter = (id, extra = {}) => ({ id, position: { x: 0, y: 0, z: 0 }, variant: 'line', health: 100, ...extra });
const step = (squadron, fighters, dt = 0, extra = {}) => squadron.update({ fighters, playerPosition: { x: 0, y: 0, z: 0 }, dt, ...extra });
const byId = result => new Map(result.directives.map(directive => [directive.id, directive]));

test('pairs use opposing bait/flank approaches and stable deterministic pilot ranks', () => {
  const squadron = createEnemySquadron();
  const roster = ['a', 'b', 'c', 'd'].map(id => fighter(id));
  const first = step(squadron, roster);
  assert.deepEqual(first.directives.map(item => item.pilotRole), ['leader', 'novice', 'veteran', 'novice']);
  assert.deepEqual(first.directives.map(item => item.role), ['bait', 'flank', 'bait', 'flank']);
  assert.equal(first.events.filter(item => item.code === 'formation').length, 2);
  for (let index = 0; index < 4; index += 2) {
    const bait = first.directives[index];
    const flank = first.directives[index + 1];
    assert.ok(bait.targetOffset.z > 0 && flank.targetOffset.z < 0);
    assert.ok(bait.targetOffset.x * flank.targetOffset.x < 0);
    assert.ok(Math.abs(flank.targetOffset.x) > Math.abs(bait.targetOffset.x));
  }
  const reordered = step(squadron, [...roster].reverse(), 1);
  assert.deepEqual(byId(reordered), byId(first));
  assert.deepEqual(reordered.events, []);
  assert.ok(first.directives[0].cooldownScale < first.directives[1].cooldownScale);
  assert.ok(first.directives[0].aimScale > first.directives[1].aimScale);
});

test('an initially lone fighter and Vader never create a false wingman loss', () => {
  const squadron = createEnemySquadron();
  assert.deepEqual(step(squadron, [fighter('vader', { variant: 'vader' })]).directives, []);
  const lone = step(squadron, [fighter('a'), fighter('vader', { variant: 'vader' })], 20);
  assert.equal(lone.directives[0].pilotRole, 'leader');
  assert.equal(lone.directives[0].role, 'solo');
  assert.deepEqual(lone.events, []);
  assert.deepEqual(step(squadron, [fighter('a')], 20).events, []);
  assert.equal(step(squadron, [fighter('a'), fighter('b')]).events[0].code, 'formation');
});

test('a novice retreats once only after its real paired fighter disappears', () => {
  const squadron = createEnemySquadron();
  step(squadron, [fighter('a'), fighter('b')]);
  const survivor = step(squadron, [fighter('b')], 1);
  assert.equal(survivor.directives[0].retreat, true);
  assert.deepEqual(survivor.events.map(item => item.code), ['retreat']);
  assert.equal(survivor.events[0].enemyId, 'b');
  assert.equal(survivor.events[0].type, 'squadron');
  assert.ok(survivor.events[0].text.length > 0);
  assert.deepEqual(step(squadron, [fighter('b')], 100).events, []);
  assert.equal(squadron.snapshot().reinforcementRequests, 0);
});

test('leader requests one finite reinforcement after four simulation seconds and extra survivors retreat', () => {
  const squadron = createEnemySquadron();
  step(squadron, ['a', 'b', 'c', 'd'].map(id => fighter(id)));
  const losses = step(squadron, [fighter('a'), fighter('c')], 1);
  assert.deepEqual(losses.events.map(item => item.code), ['reinforcement-called', 'retreat']);
  assert.equal(byId(losses).get('c').retreat, true);
  assert.equal(byId(losses).get('a').retreat, false);
  assert.deepEqual(step(squadron, [fighter('a'), fighter('c')], 3.9).events, []);
  const request = step(squadron, [fighter('a'), fighter('c')], 0.11);
  assert.deepEqual(request.events.map(item => item.code), ['reinforcement-request']);
  assert.equal(request.events[0].enemyId, 'a');
  step(squadron, [fighter('a'), fighter('c'), fighter('e'), fighter('f')], 10);
  const laterLoss = step(squadron, [fighter('a'), fighter('c'), fighter('e')], 20);
  assert.deepEqual(laterLoss.events.map(item => item.code), ['retreat']);
  assert.equal(squadron.snapshot().reinforcementRequests, 1);
  assert.deepEqual(step(squadron, [fighter('a'), fighter('c'), fighter('e')], 100).events, []);
});

test('pause freezes observations, role assignments, timers and emitted events', () => {
  const squadron = createEnemySquadron();
  step(squadron, [fighter('a'), fighter('b')]);
  const before = squadron.snapshot();
  assert.deepEqual(step(squadron, [fighter('a'), fighter('new')], 99, { paused: true }).events, []);
  assert.deepEqual(squadron.snapshot(), before);
  step(squadron, [fighter('a')]);
  step(squadron, [fighter('a')], 2);
  const pending = squadron.snapshot();
  step(squadron, [], 99, { paused: true });
  assert.deepEqual(squadron.snapshot(), pending);
  assert.deepEqual(step(squadron, [fighter('a')], 1.9).events, []);
  assert.equal(step(squadron, [fighter('a')], 0.2).events[0].code, 'reinforcement-request');
});

test('dead callers cancel their request and reset restores ranks, IDs and the finite budget', () => {
  const squadron = createEnemySquadron();
  step(squadron, [fighter('a'), fighter('b')]);
  step(squadron, [fighter('a'), fighter('b', { health: 0 })]);
  assert.deepEqual(step(squadron, [], 10).events, []);
  assert.equal(squadron.snapshot().pendingReinforcement, null);
  step(squadron, [fighter('c'), fighter('d')]);
  assert.equal(step(squadron, [fighter('c')]).events[0].code, 'retreat');
  const reset = squadron.reset();
  assert.deepEqual(reset.members, []);
  assert.equal(reset.elapsed, 0);
  step(squadron, [fighter('c'), fighter('d')]);
  assert.equal(step(squadron, [fighter('c')]).events[0].code, 'reinforcement-called');
  assert.equal(step(squadron, [fighter('c')], 4).events[0].code, 'reinforcement-request');
  assert.equal(squadron.snapshot().reinforcementRequests, 1);
});

test('inputs and returned values are isolated, malformed vectors and deltas stay finite', () => {
  const squadron = createEnemySquadron();
  const roster = Object.freeze([
    Object.freeze(fighter(0, { position: Object.freeze({ x: NaN, y: Infinity, z: -Infinity }) })),
    Object.freeze(fighter(1)),
  ]);
  const first = step(squadron, roster, NaN, { playerPosition: { x: NaN } });
  assert.equal(first.directives.length, 2);
  first.directives[0].targetOffset.x = NaN;
  const snapshot = squadron.snapshot();
  snapshot.members[0].pilotRole = 'changed';
  const paused = step(squadron, roster, Infinity, { paused: true });
  assert.equal(paused.directives[0].pilotRole, 'leader');
  for (const item of paused.directives) {
    assert.ok(Object.values(item.targetOffset).every(Number.isFinite));
  }
  step(squadron, roster, -10);
  assert.equal(squadron.snapshot().elapsed, 0);
  assert.equal(step(squadron, [null, fighter(''), fighter(2, { health: 0 }), fighter(0), fighter(0)]).directives.length, 1);
});
