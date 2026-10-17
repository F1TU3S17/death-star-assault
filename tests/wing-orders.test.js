import test from 'node:test';
import assert from 'node:assert/strict';
import { createEscortBonus, createWingOrders } from '../src/game/wing-orders.js';

const position = (x, y = 0, z = 0) => ({ x, y, z });

test('orders default to cover, reject unknown IDs, cycle deterministically, and reset', () => {
  const orders = createWingOrders();
  assert.deepEqual(orders.snapshot(), {
    order: 'cover', label: 'Прикрытие', description: 'Атакуют ближайший к вам истребитель.',
  });
  assert.equal(orders.setOrder('invalid'), false);
  assert.equal(orders.cycleOrder(), 'attack');
  assert.equal(orders.cycleOrder(), 'escort');
  assert.equal(orders.cycleOrder(), 'cover');
  assert.equal(orders.setOrder('escort'), true);
  assert.equal(orders.reset().order, 'cover');
});

test('attack favors the player target, accepts turrets, and otherwise chooses the nearest enemy', () => {
  const orders = createWingOrders();
  const enemies = [
    { id: 'far-tie', kind: 'tie', position: position(30) },
    { id: 'near-turret', kind: 'turret', position: position(2) },
    { id: 'player-target', kind: 'tie', position: position(20) },
  ];
  orders.setOrder('attack');
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0), playerTargetId: 'player-target' }), 'player-target');
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0), playerTargetId: 'missing' }), 'near-turret');
});

test('cover chooses the closest eligible fighter and keeps stable ties', () => {
  const orders = createWingOrders();
  const enemies = [
    { id: 'first', kind: 'tie', position: position(-4) },
    { id: 'disabled', kind: 'tie', disabled: true, position: position(1) },
    { id: 'retreating', kind: 'tie', retreat: true, position: position(1) },
    { id: 'dead', kind: 'tie', health: 0, position: position(1) },
    { id: 'turret', kind: 'turret', position: position(1) },
    { id: 'second', kind: 'tie', position: position(4) },
  ];
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0) }), 'first');
  assert.equal(orders.selectTarget({ enemies: [], playerPosition: position(0) }), null);
  assert.equal(orders.selectTarget({
    enemies: [
      { id: 'relay', kind: 'relay', position: position(0.5) },
      { id: 'tie', kind: 'tie', position: position(5) },
    ], playerPosition: position(0),
  }), 'tie');
});

test('escort chooses the threat closest to the lowest-health living ally', () => {
  const orders = createWingOrders();
  orders.setOrder('escort');
  const enemies = [
    { id: 'by-player', kind: 'tie', position: position(1) },
    { id: 'by-ally', kind: 'tie', position: position(98) },
    { id: 'escort-turret', kind: 'turret', position: position(100) },
  ];
  const escortAllies = [
    { id: 'healthy', health: 90, position: position(100) },
    { id: 'lost', health: 0, position: position(1) },
    { id: 'vulnerable', health: 25, position: position(100) },
  ];
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0), escortAllies }), 'by-ally');
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0), escortAllies: [] }), 'by-player');
  assert.equal(orders.selectTarget({
    enemies: [
      { id: 'relay', kind: 'relay', position: position(100) },
      { id: 'tie', kind: 'tie', position: position(120) },
    ], playerPosition: position(0), escortAllies: [{ id: 'ally', health: 10, position: position(100) }],
  }), 'tie');
});

test('invalid geometry returns null without mutating selection inputs', () => {
  const orders = createWingOrders();
  const enemies = [{ id: 'bad', kind: 'tie', position: position(Infinity) }];
  assert.equal(orders.selectTarget({ enemies, playerPosition: position(0) }), null);
  assert.deepEqual(enemies, [{ id: 'bad', kind: 'tie', position: position(Infinity) }]);
  assert.equal(orders.selectTarget({ enemies: [{ id: 'target', position: position(0) }] }), null);
});

test('escort preservation awards one 150-point bonus for three healthy allies', () => {
  const bonus = createEscortBonus();
  assert.deepEqual(bonus.update({ phase: 'escort', allyHealth: [100, 50, 80], checkpoint: 2, dt: 1 }), { events: [], score: 0 });
  const result = bonus.update({ phase: 'escort', allyHealth: [100, 50, 80], checkpoint: 3, dt: 1 });
  assert.equal(result.score, 150);
  assert.equal(result.events.length, 1);
  assert.deepEqual(bonus.update({ phase: 'escort', allyHealth: [100, 100, 100], checkpoint: 3, dt: 1 }), { events: [], score: 0 });
  assert.deepEqual(bonus.reset(), { events: [], score: 0 });
  assert.equal(bonus.update({ phase: 'escort', allyHealth: [100, 50, 80], checkpoint: 3 }).score, 150);
});

test('escort bonus falls back to 75 for survivors, skips lost or incomplete groups, and pauses cleanly', () => {
  const noBonus = createEscortBonus();
  assert.deepEqual(noBonus.update({ phase: 'escort', allyHealth: [100, 40, 0], checkpoint: 3 }), { events: [], score: 0 });
  assert.deepEqual(noBonus.update({ phase: 'escort', allyHealth: [100, 40, 20], checkpoint: 3 }), { events: [], score: 0 });

  const bonus = createEscortBonus();
  assert.deepEqual(bonus.update({ phase: 'escort', allyHealth: [100, 40], checkpoint: 3 }), { events: [], score: 0 });
  assert.deepEqual(bonus.update({ phase: 'escort', allyHealth: [100, 40, 20], checkpoint: 3, paused: true }), { events: [], score: 0 });
  const result = bonus.update({ phase: 'escort', allyHealth: [100, 40, 20], checkpoint: 3 });
  assert.equal(result.score, 75);
  assert.equal(result.events.length, 1);
  assert.deepEqual(bonus.update({ phase: 'escort', allyHealth: [100, 40, 20], checkpoint: 3 }), { events: [], score: 0 });
});
