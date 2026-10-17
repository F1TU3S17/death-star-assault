import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign } from '../src/game/campaign.js';
import { SHIPS, EPISODES } from '../src/game/data.js';
import { reachQte, completeCampaignMission } from './campaign-fixtures.js';

test('objectives require matching events; time alone cannot clear combat or trench', () => {
  const campaign = createCampaign();
  campaign.recordKill('turret');
  campaign.recordCheckpoint();
  campaign.update(1000);
  assert.equal(campaign.getSnapshot().phase, 'combat');
  assert.equal(campaign.getSnapshot().progress, 0);
  for (let i = 0; i < 5; i += 1) campaign.recordKill('tie');
  assert.equal(campaign.getSnapshot().phase, 'surface');
  campaign.recordKill('tie');
  assert.equal(campaign.getSnapshot().progress, 0);
  for (let i = 0; i < 4; i += 1) campaign.recordKill('turret');
  assert.equal(campaign.getSnapshot().phase, 'escort');
  campaign.recordCheckpoint();
  campaign.recordKill('tie');
  campaign.update(1000);
  assert.equal(campaign.getSnapshot().progress, 0);
  completeCampaignMission(campaign);
  assert.equal(campaign.getSnapshot().phase, 'defend');
  campaign.recordEscortCheckpoint();
  campaign.recordKill('turret');
  assert.equal(campaign.getSnapshot().progress, 0);
  completeCampaignMission(campaign);
  assert.equal(campaign.getSnapshot().phase, 'trench');
  for (let i = 0; i < 5; i += 1) campaign.recordCheckpoint();
  assert.equal(campaign.getSnapshot().phase, 'trench');
  campaign.recordCheckpoint();
  assert.equal(campaign.getSnapshot().phase, 'qte');
});

test('optional energy relays track independently, clamp completion and cannot skip a mission', () => {
  const campaign = createCampaign();
  completeCampaignMission(campaign);
  assert.equal(campaign.getSnapshot().phase, 'surface');
  campaign.recordSideObjective('missing');
  for (const amount of [0, -1, NaN, Infinity]) campaign.recordSideObjective('surface-relays', amount);
  assert.equal(campaign.getSnapshot().sideObjectives[0].progress, 0);
  campaign.recordSideObjective('surface-relays');
  assert.equal(campaign.getSnapshot().sideObjectives[0].complete, false);
  campaign.recordSideObjective('surface-relays', 100);
  assert.equal(campaign.getSnapshot().sideObjectives[0].progress, 2);
  assert.equal(campaign.getSnapshot().sideObjectives[0].complete, true);
  assert.equal(campaign.getSnapshot().progress, 0);
  assert.equal(campaign.getSnapshot().phase, 'surface');
  const snapshot = campaign.getSnapshot();
  snapshot.sideObjectives[0].title = 'Mutated';
  snapshot.mission.sideObjectives[0].title = 'Mutated';
  assert.notEqual(campaign.getSnapshot().sideObjectives[0].title, 'Mutated');
  completeCampaignMission(campaign);
  assert.deepEqual(campaign.getSnapshot().sideObjectives, []);
});

test('the final shot belongs to Luke in an X-wing and requires the full sequence', () => {
  const campaign = createCampaign();
  reachQte(campaign);
  assert.equal(campaign.getSnapshot().mission.forceShipId, 'xwing');
  assert.equal(campaign.qteInput('Escape'), false);
  assert.equal(campaign.getSnapshot().qte.progress, 0);
  for (const key of ['KeyA', 'KeyD', 'KeyW', 'Space']) assert.equal(campaign.qteInput(key), true);
  assert.equal(campaign.getSnapshot().phase, 'cinematic');
  campaign.update(11.9);
  assert.equal(campaign.getSnapshot().complete, false);
  campaign.update(0.1);
  assert.equal(campaign.getSnapshot().phase, 'victory');
  assert.equal(campaign.getSnapshot().complete, true);
  campaign.fail('Cannot undo victory');
  assert.equal(campaign.getSnapshot().failed, false);
});

test('wrong or expired prompts reset sequence with a penalty and eventually fail', () => {
  const campaign = createCampaign();
  reachQte(campaign);
  campaign.qteInput('KeyA');
  assert.equal(campaign.qteInput('Space'), false);
  assert.equal(campaign.getSnapshot().qte.key, 'KeyA');
  assert.equal(campaign.getSnapshot().qte.totalRemaining, 34);
  campaign.update(2);
  assert.equal(campaign.getSnapshot().qte.totalRemaining, 26);
  campaign.update(100);
  assert.equal(campaign.getSnapshot().failed, true);
  assert.equal(campaign.getSnapshot().complete, false);
  assert.equal(campaign.qteInput('KeyA'), false);
});

test('failure freezes campaign; reset and snapshot isolation work', () => {
  const campaign = createCampaign();
  const snapshot = campaign.getSnapshot();
  snapshot.mission.title = 'Changed';
  snapshot.radio.text = 'Changed';
  assert.notEqual(campaign.getSnapshot().mission.title, 'Changed');
  assert.notEqual(campaign.getSnapshot().radio.text, 'Changed');
  campaign.fail('Корпус разрушен');
  campaign.recordKill('tie');
  campaign.update(50);
  assert.equal(campaign.getSnapshot().progress, 0);
  assert.equal(campaign.getSnapshot().reason, 'Корпус разрушен');
  campaign.reset();
  assert.equal(campaign.getSnapshot().failed, false);
  assert.equal(campaign.getSnapshot().phase, 'combat');
  assert.equal(campaign.getSnapshot().reason, '');
});

test('invalid time and episode inputs cannot corrupt state', () => {
  const campaign = createCampaign();
  reachQte(campaign);
  for (const dt of [NaN, Infinity, -1, 0]) campaign.update(dt);
  assert.equal(campaign.getSnapshot().qte.totalRemaining, 40);
  assert.throws(() => createCampaign('missing'), /Unknown or empty episode/);
  assert.deepEqual(EPISODES.episode4.ships, ['xwing', 'ywing']);
  assert.ok(SHIPS.ywing.hull > SHIPS.xwing.hull);
  assert.ok(SHIPS.xwing.speed > SHIPS.ywing.speed);
});
