import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutRadar } from '../src/game/radar.js';

test('a contact dead ahead sits at the center of the strip', () => {
  const [tick] = layoutRadar([{ bearing: 0, distance: 300, kind: 'tie' }]);
  assert.equal(tick.x, 0);
  assert.equal(tick.behind, false);
  assert.equal(tick.marker, 'enemy');
});

test('contacts at the edge of the forward sector reach x = ±1 without behind', () => {
  const ticks = layoutRadar([
    { bearing: Math.PI / 2, distance: 100, kind: 'tie' },
    { bearing: -Math.PI / 2, distance: 100, kind: 'tie' },
  ]);
  assert.equal(ticks[0].x, 1);
  assert.equal(ticks[0].behind, false);
  assert.equal(ticks[1].x, -1);
  assert.equal(ticks[1].behind, false);
});

test('contacts behind the 90° sector pin to the strip edges', () => {
  const ticks = layoutRadar([
    { bearing: 2 * Math.PI / 3, distance: 400, kind: 'tie' },
    { bearing: -Math.PI, distance: 400, kind: 'tie' },
  ]);
  assert.equal(ticks[0].x, 1);
  assert.equal(ticks[0].behind, true);
  assert.equal(ticks[1].x, -1);
  assert.equal(ticks[1].behind, true);
});

test('allies, vader and common enemies get distinct markers', () => {
  const ticks = layoutRadar([
    { bearing: 0, distance: 100, kind: 'tie', ally: true },
    { bearing: 0, distance: 100, kind: 'vader' },
    { bearing: 0, distance: 100, kind: 'tie' },
  ]);
  assert.deepEqual(ticks.map(tick => tick.marker), ['ally', 'vader', 'enemy']);
});

test('input order is preserved through the layout', () => {
  const contacts = [
    { bearing: 1.2, distance: 500, kind: 'tie' },
    { bearing: -0.4, distance: 200, kind: 'vader', ally: false },
    { bearing: 0.9, distance: 900, kind: 'wingman', ally: true },
  ];
  const ticks = layoutRadar(contacts);
  assert.deepEqual(ticks.map(tick => tick.x), contacts.map(contact => contact.bearing / (Math.PI / 2)));
  assert.deepEqual(ticks.map(tick => tick.distance), contacts.map(contact => contact.distance));
});

test('contacts without a finite bearing are dropped', () => {
  const ticks = layoutRadar([
    { bearing: 0.5, distance: 100, kind: 'tie' },
    { bearing: Number.NaN, distance: 200, kind: 'tie' },
    { distance: 300, kind: 'tie' },
    { bearing: -0.9, distance: 400, kind: 'tie' },
  ]);
  assert.equal(ticks.length, 2);
  assert.deepEqual(ticks.map(tick => tick.x), [0.5 / (Math.PI / 2), -0.9 / (Math.PI / 2)]);
});

test('empty and invalid inputs produce an empty layout', () => {
  assert.deepEqual(layoutRadar([]), []);
  assert.deepEqual(layoutRadar(), []);
});

test('distance passes through to the ticks unchanged', () => {
  const [tick] = layoutRadar([{ bearing: 0.1, distance: 1234, kind: 'tie' }]);
  assert.equal(tick.distance, 1234);
});
