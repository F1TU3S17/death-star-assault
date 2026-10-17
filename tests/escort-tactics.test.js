import test from 'node:test';
import assert from 'node:assert/strict';
import { createEscortTactics } from '../src/game/escort-tactics.js';

test('escort choices are inactive until explicit begin and reset cleanly for a new sortie', () => {
  const tactics = createEscortTactics();
  assert.deepEqual(tactics.update({ dt: 1, allyHealth: 10, escortCheckpoint: 2 }), []);
  assert.deepEqual(tactics.recordDestroyed('tie-a'), []);
  assert.equal(tactics.snapshot().outcome, 'inactive');
  tactics.begin();
  assert.deepEqual(tactics.recordDestroyed('turret-1', { kind: 'turret' }), []);
  assert.deepEqual(tactics.recordDestroyed('paused-tie', { paused: true }), []);
  assert.equal(tactics.snapshot().pressure, 5);
  tactics.recordDestroyed('tie-a');
  tactics.reset();
  assert.equal(tactics.snapshot().pressure, 5);
  assert.deepEqual(tactics.snapshot().decisions, []);
  assert.deepEqual(tactics.recordDestroyed('escort-power-node'), []);
  tactics.begin();
  assert.equal(tactics.snapshot().active, true);
  assert.equal(tactics.snapshot().threats.every(threat => threat.alive), true);
});

test('destroying the power node disables the route battery and grants one finite shield event', () => {
  const tactics = createEscortTactics();
  tactics.begin();
  const events = tactics.recordDestroyed('escort-power-node');
  assert.deepEqual(events, [{
    id: 'escort-tactics:relay-destroyed', type: 'escort-threat-disabled', targetId: 'escort-power-node',
    disableTargetIds: ['escort-route-battery'], allyShieldRestore: 25, once: true,
  }]);
  assert.deepEqual(tactics.recordDestroyed('escort-power-node'), []);
  assert.deepEqual(tactics.recordDestroyed('escort-route-battery'), [], 'a relay-disabled battery cannot award another effect');
  assert.equal(tactics.snapshot().threats.every(threat => threat.disabled), true);
  assert.deepEqual(tactics.snapshot().decisions, ['relay-destroyed', 'battery-disabled-by-relay']);
});

test('destroying the battery directly produces one shutdown effect and records the player choice', () => {
  const tactics = createEscortTactics();
  tactics.begin();
  const events = tactics.recordDestroyed('escort-route-battery');
  assert.deepEqual(events, [{
    id: 'escort-tactics:battery-disabled', type: 'escort-battery-disabled', targetId: 'escort-route-battery',
    disableTargetIds: ['escort-route-battery'], once: true,
  }]);
  assert.deepEqual(tactics.recordDestroyed('escort-route-battery'), []);
  assert.deepEqual(tactics.snapshot().decisions, ['battery-suppressed']);
  assert.equal(tactics.snapshot().threats.find(threat => threat.id === 'escort-power-node').alive, true);
});

test('confirmed TIE kills reduce pressure once and emit one radio report when the route is clear', () => {
  const tactics = createEscortTactics();
  tactics.begin();
  assert.equal(tactics.recordDestroyed('tie-1')[0].pressure, 4);
  assert.deepEqual(tactics.recordDestroyed('tie-1'), []);
  tactics.recordDestroyed('tie-2');
  tactics.recordDestroyed('tie-3');
  tactics.recordDestroyed('tie-4');
  const finalKill = tactics.recordDestroyed('tie-5');
  assert.equal(tactics.snapshot().pressure, 0);
  assert.ok(finalKill.some(event => event.id === 'escort-tactics:pressure-eased'));
  assert.deepEqual(tactics.recordDestroyed('tie-4').filter(event => event.id === 'escort-tactics:pressure-eased'), []);
  assert.equal(tactics.snapshot().pressure, 0);
});

test('health and checkpoint warnings emit once, pause freezes observations, and losses do not finish campaign', () => {
  const tactics = createEscortTactics();
  tactics.begin();
  assert.deepEqual(tactics.update({ paused: true, allyHealth: 40, escortCheckpoint: 2 }), []);
  assert.equal(tactics.snapshot().allyHealth, null);
  const first = tactics.update({ dt: 1, allyHealth: 55, escortCheckpoint: 1 });
  assert.deepEqual(first.map(event => event.id), [
    'escort-tactics:ally-damage-warning', 'escort-tactics:battery-blocks-route',
  ]);
  assert.deepEqual(tactics.update({ dt: 1, allyHealth: 50, escortCheckpoint: 1 }), []);
  const secondLeg = tactics.update({ dt: 1, allyHealth: 0, escortCheckpoint: 2 });
  assert.deepEqual(secondLeg.map(event => event.id), [
    'escort-tactics:ally-lost', 'escort-tactics:relay-threat-warning',
  ]);
  assert.equal(tactics.snapshot().outcome, 'ally-lost');
  assert.equal(tactics.snapshot().active, true, 'campaign phase completion remains owned by the campaign');
});
