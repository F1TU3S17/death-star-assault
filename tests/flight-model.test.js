import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIPS } from '../src/game/data.js';
import { createFlightState, resetFlightState, getFlightTurnAuthority, stepFlight } from '../src/game/flight-model.js';

const forward = { x: 0, y: 0, z: -1 };
const left = { x: -1, y: 0, z: 0 };
const power = { speed: 1, boost: 1 };

function fly(state, seconds, options = {}) {
  for (let time = 0; time < seconds - .0001; time += .025) {
    stepFlight(state, { dt: .025, heading: forward, stats: SHIPS.xwing, power, ...options });
  }
  return state;
}

test('mid-speed turns have more authority than low-speed and boost turns', () => {
  for (const stats of Object.values(SHIPS)) {
    const sweetSpot = getFlightTurnAuthority(stats.speed * .7, stats.speed);
    assert.ok(sweetSpot > getFlightTurnAuthority(stats.speed * .2, stats.speed));
    assert.ok(sweetSpot > getFlightTurnAuthority(stats.speed, stats.speed));
    assert.ok(sweetSpot > getFlightTurnAuthority(stats.boostSpeed, stats.speed) * 1.5);
    assert.ok(getFlightTurnAuthority(0, stats.speed) > .4, 'Stopped ships can still turn');
  }
});

test('turning changes heading before actual momentum catches up', () => {
  const state = resetFlightState(createFlightState(), forward, 95);
  fly(state, .1, { heading: left, turning: true });
  assert.ok(state.velocity.x < -20, 'The ship begins moving into its turn');
  assert.ok(state.velocity.z < -40, 'Previous forward momentum survives a sharp turn');
  assert.ok(state.slip > .5, 'The flight path differs visibly from the nose');
  fly(state, 1.5, { heading: left });
  assert.ok(state.velocity.x < -93);
  assert.ok(Math.abs(state.velocity.z) < 1);
  assert.ok(state.slip < .02, 'Momentum eventually aligns with the nose');
});

test('brake plus turn enables a brief coast while braking alone stays responsive', () => {
  const coast = resetFlightState(createFlightState(), forward, 95);
  const normal = resetFlightState(createFlightState(), forward, 95);
  fly(coast, .2, { heading: left, braking: true, turning: true });
  fly(normal, .2, { heading: left, braking: true });
  assert.equal(coast.drifting, true);
  assert.equal(normal.drifting, false);
  assert.ok(Math.abs(coast.velocity.z) > Math.abs(normal.velocity.z) * 1.6);
  assert.ok(coast.slip > normal.slip);
  fly(coast, 2, { heading: left, braking: true });
  assert.equal(coast.drifting, false);
  assert.ok(coast.speed < 42 && coast.speed > 37, 'Brake settles at a useful combat speed');
  assert.ok(Math.abs(coast.velocity.z) < .02, 'Coasting is bounded after the maneuver');
});

test('X-wing accelerates, brakes and realigns faster than the heavier Y-wing', () => {
  const x = fly(createFlightState(), .5, { stats: SHIPS.xwing });
  const y = fly(createFlightState(), .5, { stats: SHIPS.ywing });
  assert.ok(x.speed / SHIPS.xwing.speed > y.speed / SHIPS.ywing.speed);
  resetFlightState(x, forward, 100);
  resetFlightState(y, forward, 100);
  fly(x, .3, { stats: SHIPS.xwing, braking: true });
  fly(y, .3, { stats: SHIPS.ywing, braking: true });
  assert.ok(x.speed < y.speed, 'X-wing sheds the same entry velocity sooner');
  resetFlightState(x, forward, 95);
  resetFlightState(y, forward, 77);
  fly(x, .3, { stats: SHIPS.xwing, heading: left, turning: true });
  fly(y, .3, { stats: SHIPS.ywing, heading: left, turning: true });
  assert.ok(x.slip < y.slip);
});

test('boost preserves each ship top speed and power allocation affects actual velocity', () => {
  for (const stats of Object.values(SHIPS)) {
    const normal = fly(createFlightState(), 5, { stats, boosting: true });
    const engines = fly(createFlightState(), 5, { stats, boosting: true, power: { speed: 1.18, boost: 1.18 } });
    assert.ok(Math.abs(normal.speed - stats.boostSpeed) < .3);
    assert.ok(engines.speed > normal.speed * 1.17);
  }
});

test('the trench suppresses coast and preserves forward progress when aiming backwards', () => {
  const state = resetFlightState(createFlightState(), forward, 95);
  fly(state, .8, { trench: true, braking: true, turning: true, heading: { x: 1, y: .5, z: 1 } });
  assert.equal(state.drifting, false);
  assert.ok(state.velocity.z < -20);
  assert.ok(Math.abs(state.velocity.x) < 35);
});

test('paused or zero-time steps freeze momentum; reset clears drift and old velocity', () => {
  const state = resetFlightState(createFlightState(), forward, 95);
  fly(state, .3, { heading: left, turning: true, braking: true });
  const before = structuredClone(state);
  for (const dt of [0, -1, Number.NaN]) stepFlight(state, { dt, heading: forward, stats: SHIPS.xwing });
  stepFlight(state, { dt: .05, heading: forward, stats: SHIPS.xwing, active: false });
  assert.deepEqual(state, before);
  resetFlightState(state);
  assert.deepEqual(state.velocity, { x: 0, y: 0, z: -0 });
  assert.equal(state.speed, 0);
  assert.equal(state.throttleSpeed, 0);
  assert.equal(state.slip, 0);
  assert.equal(state.drifting, false);
  resetFlightState(state, left, 50);
  assert.deepEqual(state.velocity, { x: -50, y: 0, z: 0 });
});
