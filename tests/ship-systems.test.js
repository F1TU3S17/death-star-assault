import test from 'node:test';
import assert from 'node:assert/strict';
import { createShipSystems } from '../src/game/ship-systems.js';

const integrityById = (snapshot, id) => snapshot.systems.find((system) => system.id === id).integrity;

test('damage creates deterministic subsystem faults at cumulative hull thresholds', () => {
  const ship = createShipSystems();

  assert.equal(ship.damage(17), null);
  assert.equal(ship.damage(1), 'engines');
  assert.equal(integrityById(ship.snapshot(), 'engines'), 70);
  assert.equal(ship.damage(36, { source: 'laser' }), 'sensors');
  assert.deepEqual(ship.snapshot().systems.map(({ id, integrity }) => [id, integrity]), [
    ['engines', 70],
    ['weapons', 70],
    ['sensors', 70],
  ]);
});

test('large hits process several bounded faults and preserve queued threshold work', () => {
  const ship = createShipSystems();

  assert.equal(ship.damage(18 * 8), 'sensors');
  assert.deepEqual(ship.snapshot().systems.map(({ integrity }) => integrity), [70, 70, 70]);
  assert.equal(ship.damage(0), null);
  assert.equal(ship.damage(1), 'sensors');
  assert.deepEqual(ship.snapshot().systems.map(({ integrity }) => integrity), [40, 40, 40]);
});

test('repair selection cycles from hull and repairs only the selected subsystem', () => {
  const ship = createShipSystems();
  ship.damage(54);

  assert.equal(ship.snapshot().selected, 'hull');
  assert.equal(ship.repair(), 0);
  assert.equal(ship.cycleRepair(), 'engines');
  assert.equal(ship.repair(), 30);
  assert.equal(ship.selectRepair('sensors'), true);
  assert.equal(ship.repair(12), 12);
  assert.equal(integrityById(ship.snapshot(), 'weapons'), 70);
  assert.equal(integrityById(ship.snapshot(), 'sensors'), 82);
  assert.equal(ship.selectRepair('hull'), true);
  assert.equal(ship.cycleRepair(), 'engines');
  assert.equal(ship.selectRepair('hyperdrive'), false);
});

test('reset restores systems, thresholds, cursor, and default hull selection', () => {
  const ship = createShipSystems();
  ship.damage(18 * 2);
  ship.selectRepair('sensors');
  ship.reset();

  assert.deepEqual(ship.snapshot(), {
    selected: 'hull',
    systems: [
      { id: 'engines', name: 'Двигатели', integrity: 100 },
      { id: 'weapons', name: 'Оружие', integrity: 100 },
      { id: 'sensors', name: 'Сенсоры', integrity: 100 },
    ],
    effects: {
      thrust: 1,
      acceleration: 1,
      weaponCooldown: 1,
      weaponCooling: 1,
      sensorLockRate: 1,
    },
  });
  assert.equal(ship.damage(18), 'engines');
});

test('invalid numeric inputs never create NaN state and effects stay within bounds', () => {
  const ship = createShipSystems();
  for (const input of [NaN, Infinity, -Infinity, '12', 0, -2]) {
    assert.equal(ship.damage(input), null);
  }
  assert.equal(ship.damage(Number.MAX_VALUE), 'sensors');
  for (const id of ['engines', 'weapons', 'sensors']) {
    ship.selectRepair(id);
    ship.repair(Number.MAX_VALUE);
  }
  const { systems, effects } = ship.snapshot();
  assert.ok(systems.every(({ integrity }) => Number.isFinite(integrity) && integrity >= 0 && integrity <= 100));
  assert.ok(effects.thrust >= 0.7 && effects.thrust <= 1);
  assert.ok(effects.acceleration >= 0.65 && effects.acceleration <= 1);
  assert.ok(effects.weaponCooldown >= 1 && effects.weaponCooldown <= 1.5);
  assert.ok(effects.weaponCooling >= 0.65 && effects.weaponCooling <= 1);
  assert.ok(effects.sensorLockRate >= 0.65 && effects.sensorLockRate <= 1);
});

test('module stays pure and exposes independent snapshots', () => {
  const ship = createShipSystems();
  const first = ship.snapshot();
  first.systems[0].integrity = 0;
  first.effects.thrust = 0;

  assert.equal(ship.snapshot().systems[0].integrity, 100);
  assert.equal(ship.snapshot().effects.thrust, 1);
  assert.equal(typeof globalThis.document, 'undefined');
});
