import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseEnemyTarget, getEnemyUnitSpec } from '../src/game/enemy-units.js';

test('returns all established enemy variant stats and aliases Vader', () => {
  assert.deepEqual(getEnemyUnitSpec(), {
    health: 48, radius: 10, modelKind: 'tie', movement: 'fighter', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('tie', 'ace'), {
    health: 68, radius: 10, modelKind: 'tie', movement: 'fighter', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('vader'), {
    health: 220, radius: 12, modelKind: 'vader', movement: 'fighter', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('turret', 'light'), {
    health: 78, radius: 22, modelKind: 'turret', movement: 'stationary', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('turret', 'heavy'), {
    health: 138, radius: 22, modelKind: 'turret', movement: 'stationary', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('relay'), {
    health: 35, radius: 16, modelKind: 'relay', movement: 'stationary', canFire: false,
  });
});

test('spec results are isolated snapshots and do not depend on episode ids', () => {
  const first = getEnemyUnitSpec('tie', 'line');
  first.health = -1;
  first.nested = { changed: true };
  assert.deepEqual(getEnemyUnitSpec('tie', 'line'), {
    health: 48, radius: 10, modelKind: 'tie', movement: 'fighter', canFire: true,
  });
  assert.deepEqual(getEnemyUnitSpec('unrecognized-episode', 'line'), getEnemyUnitSpec());
});

test('known kinds use their own default variant for omitted or unknown variants', () => {
  assert.deepEqual(getEnemyUnitSpec('turret'), getEnemyUnitSpec('turret', 'light'));
  assert.deepEqual(getEnemyUnitSpec('turret', 'unknown'), getEnemyUnitSpec('turret', 'light'));
  assert.deepEqual(getEnemyUnitSpec('tie', 'unknown'), getEnemyUnitSpec('tie', 'line'));
  assert.deepEqual(getEnemyUnitSpec('relay', 'unknown'), getEnemyUnitSpec('relay', 'relay'));
  assert.deepEqual(getEnemyUnitSpec('vader', 'unknown'), getEnemyUnitSpec('vader', 'vader'));
});

test('defenders and turrets choose seeded living allies in stable order', () => {
  const player = { id: 'player', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const dead = { id: 'dead', health: 0, position: { x: 1, y: 0, z: 0 } };
  const invalid = { id: 'invalid', health: 10, position: { x: NaN, y: 0, z: 0 } };
  const first = { id: 'first', health: 10, position: { x: 1, y: 0, z: 0 } };
  const second = { id: 'second', health: 10, position: { x: 2, y: 0, z: 0 } };
  const allies = [dead, invalid, first, second];

  assert.equal(chooseEnemyTarget({ defendAllies: true, seed: 0, player, allies }), first);
  assert.equal(chooseEnemyTarget({ defendAllies: true, seed: 1, player, allies }), second);
  assert.equal(chooseEnemyTarget({ kind: 'turret', seed: 1, player, allies }), second);
  assert.equal(chooseEnemyTarget({ defendAllies: true, seed: NaN, player, allies }), first);
});

test('ace prefers the player in range; invalid or unavailable allies fall back to player', () => {
  const player = { id: 'player', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const ally = { id: 'ally', position: { x: 1, y: 0, z: 0 } };
  assert.equal(chooseEnemyTarget({ kind: 'tie', variant: 'ace', position: { x: 200, y: 0, z: 0 }, player, allies: [ally], defendAllies: true }), player);
  assert.equal(chooseEnemyTarget({ defendAllies: true, player, allies: [{ id: 'dead', health: 0, position: ally.position }] }), player);
  assert.equal(chooseEnemyTarget({ defendAllies: true, player, allies: [{ id: 'bad', position: { x: Infinity, y: 0, z: 0 } }] }), player);
  assert.equal(chooseEnemyTarget({ player, allies: [ally] }), player);
});
