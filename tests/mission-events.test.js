import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionDirector } from '../src/game/mission-events.js';
import { createCampaign } from '../src/game/campaign.js';
import { MISSIONS } from '../src/game/missions.js';

const sensor = { x: -150, y: -20, z: -430 };
const scanFacts = { dt: 1, playerPosition: sensor, targetId: 'tactical-sensor', speedRatio: 0.6 };

test('narrative waits for observed battle events and emits each line once', () => {
  const director = createMissionDirector();
  director.enterPhase('combat');
  assert.deepEqual(director.update({ dt: 1 }), []);
  assert.equal(director.update({ dt: 4 }).filter(event => event.id.endsWith('gold-descent')).length, 1);
  assert.equal(director.update({ dt: 1, killCount: 3 }).filter(event => event.id.endsWith('tie-reinforcements')).length, 1);
  const repeats = director.update({ dt: 1, killCount: 4 });
  assert.equal(repeats.length, 0);
  director.enterPhase('combat');
  assert.equal(director.getSnapshot().elapsed, 7, 'repeated phase observations must not restart timers');
});

test('sensor scan requires proximity, a held facing lock and low speed', () => {
  const director = createMissionDirector();
  director.enterPhase('surface');
  for (const facts of [
    { ...scanFacts, playerPosition: { ...sensor, x: sensor.x + 300 } },
    { ...scanFacts, targetId: null },
    { ...scanFacts, speedRatio: 1 },
  ]) director.update(facts);
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 0);
  director.update(scanFacts);
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 1);
  director.update({ ...scanFacts, targetId: null });
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 0, 'breaking lock resets the dwell');
  director.update(scanFacts);
  director.update(scanFacts);
  const completion = director.update(scanFacts);
  assert.equal(completion.filter(event => event.type === 'side-complete').length, 1);
  assert.equal(director.getSnapshot().bonusScore, 150);
  assert.equal(director.getSnapshot().sideObjectives[0].status, 'completed');
  assert.equal(director.update(scanFacts).filter(event => event.type === 'side-complete').length, 0);
  assert.equal(director.getSnapshot().bonusScore, 150);
});

test('checkpoint ambush spawns once and only marked interceptors count for its bonus', () => {
  const director = createMissionDirector();
  director.enterPhase('escort');
  assert.equal(director.getSnapshot().sideObjectives[0].status, 'pending');
  assert.equal(director.update({ dt: 1, escortCheckpoint: 0 }).some(event => event.type === 'spawn-wave'), false);
  const first = director.update({ dt: 1, escortCheckpoint: 1 });
  const wave = first.find(event => event.type === 'spawn-wave');
  assert.deepEqual(wave.targetIds, ['escort-ace-1', 'escort-ace-2']);
  assert.equal(wave.bonusOnly, true);
  assert.equal(director.update({ dt: 1, escortCheckpoint: 1, destroyedTargetIds: ['normal-tie'] }).some(event => event.type === 'spawn-wave'), false);
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 0);
  director.update({ dt: 1, destroyedTargetIds: ['escort-ace-1'] });
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 1);
  director.update({ dt: 1, destroyedTargetIds: ['escort-ace-1'] });
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 1, 'repeated kill reports are not new kills');
  director.update({ dt: 1, destroyedTargetIds: ['escort-ace-2'] });
  assert.equal(director.getSnapshot().bonusScore, 200);
});

test('thermal vent warns before opening, closes, and repeats with unique ordered events', () => {
  const director = createMissionDirector();
  director.enterPhase('trench');
  const warning = director.update({ dt: 3 }).find(event => event.type === 'vent-warning');
  assert.ok(warning);
  assert.equal(director.getSnapshot().vent.telegraph, true);
  assert.equal(director.getSnapshot().vent.active, false);
  director.update({ dt: 2 });
  assert.equal(director.getSnapshot().vent.telegraph, false);
  assert.equal(director.getSnapshot().vent.active, true);
  const boundaryEvents = director.update({ dt: 12 }).filter(event => event.type.startsWith('vent-'));
  assert.deepEqual(boundaryEvents.map(event => event.type), ['vent-close', 'vent-warning', 'vent-open', 'vent-close']);
  assert.equal(new Set(boundaryEvents.map(event => event.id)).size, 4);
  assert.equal(director.getSnapshot().vent.active, false);
});

test('shooting the coolant regulator permanently disables the hazard and awards once', () => {
  const director = createMissionDirector();
  director.enterPhase('trench');
  director.update({ dt: 5 });
  assert.equal(director.getSnapshot().vent.active, true);
  const events = director.update({ dt: 0.1, destroyedTargetIds: ['trench-coolant-regulator'] });
  assert.equal(events.find(event => event.type === 'vent-close').disabled, true);
  assert.equal(director.getSnapshot().vent.disabled, true);
  assert.equal(director.getSnapshot().vent.active, false);
  assert.equal(director.getSnapshot().bonusScore, 200);
  assert.equal(director.update({ dt: 100, destroyedTargetIds: ['trench-coolant-regulator'] }).some(event => event.type.startsWith('vent-')), false);
  assert.equal(director.getSnapshot().bonusScore, 200);
});

test('immediate final kill completes and archives an optional goal without advancing time', () => {
  const director = createMissionDirector();
  director.enterPhase('escort');
  director.update({ dt: 1, escortCheckpoint: 1 });
  director.recordTargetDestroyed('escort-ace-1');
  const beforeKill = director.getSnapshot().elapsed;
  const finalKill = director.recordTargetDestroyed('escort-ace-2');
  assert.equal(finalKill.filter(event => event.type === 'side-complete').length, 1);
  assert.equal(director.getSnapshot().elapsed, beforeKill);
  assert.equal(director.getSnapshot().bonusScore, 200);
  assert.deepEqual(director.recordTargetDestroyed('escort-ace-2'), []);
  assert.equal(director.getSnapshot().bonusScore, 200);
  director.enterPhase('defend');
  assert.equal(director.getSnapshot().history[0].status, 'completed');

  director.enterPhase('trench');
  director.update({ dt: 5 });
  const events = director.recordTargetDestroyed('trench-coolant-regulator');
  assert.equal(director.getSnapshot().elapsed, 5);
  assert.equal(director.getSnapshot().vent.active, false);
  assert.equal(director.getSnapshot().vent.disabled, true);
  assert.equal(events.find(event => event.type === 'vent-close').disabled, true);
  assert.equal(events.filter(event => event.type === 'side-complete').length, 1);
});

test('pause freezes timers, observed kills, scan dwell, rewards and hazards', () => {
  const director = createMissionDirector();
  director.enterPhase('surface');
  director.update(scanFacts);
  const before = director.getSnapshot();
  assert.deepEqual(director.update({ ...scanFacts, paused: true, dt: 100 }), []);
  assert.deepEqual(director.getSnapshot(), before);
  for (const dt of [0, -1, NaN, Infinity]) director.update({ ...scanFacts, dt });
  assert.deepEqual(director.getSnapshot(), before);
  director.enterPhase('trench');
  director.update({ dt: 3 });
  const warning = director.getSnapshot();
  director.update({ paused: true, dt: 100, destroyedTargetIds: ['trench-coolant-regulator'] });
  assert.deepEqual(director.getSnapshot(), warning);
});

test('phase change archives optional outcomes, preserves points and reset clears a sortie', () => {
  const director = createMissionDirector();
  director.enterPhase('surface');
  director.update({ ...scanFacts, dt: 3 });
  director.enterPhase('escort');
  assert.equal(director.getSnapshot().bonusScore, 150);
  assert.equal(director.getSnapshot().history[0].status, 'completed');
  director.enterPhase('defend');
  assert.equal(director.getSnapshot().history[1].status, 'missed');
  director.reset();
  assert.equal(director.getSnapshot().phase, null);
  assert.equal(director.getSnapshot().bonusScore, 0);
  assert.deepEqual(director.getSnapshot().history, []);
  director.enterPhase('surface');
  assert.equal(director.getSnapshot().sideObjectives[0].progress, 0);
  assert.ok(director.update({ dt: 2 }).some(event => event.id.endsWith('sensor-contact')), 'reset allows narrative to play again');
});

test('optional director never changes canonical main mission order or completes campaign goals', () => {
  assert.deepEqual(MISSIONS.map(mission => mission.type), ['combat', 'surface', 'escort', 'defend', 'trench', 'qte', 'cinematic']);
  const campaign = createCampaign();
  const director = createMissionDirector();
  director.enterPhase('surface');
  director.update({ ...scanFacts, dt: 3 });
  assert.equal(campaign.getSnapshot().phase, 'combat');
  assert.equal(campaign.getSnapshot().progress, 0);
  const snapshot = director.getSnapshot();
  snapshot.sideObjectives[0].position.x = 999;
  assert.equal(director.getSnapshot().sideObjectives[0].position.x, -150);
  for (let i = 0; i < 5; i++) campaign.recordKill('tie');
  const mission = campaign.getSnapshot().mission;
  mission.fieldObjectives[0].position.x = 999;
  mission.events[0].text = 'Changed';
  assert.equal(campaign.getSnapshot().mission.fieldObjectives[0].position.x, -150);
  assert.notEqual(campaign.getSnapshot().mission.events[0].text, 'Changed');
});
