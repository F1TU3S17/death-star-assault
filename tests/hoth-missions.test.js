import test from 'node:test';
import assert from 'node:assert/strict';
import { HOTH_MISSIONS } from '../src/game/missions-hoth.js';

const EXPECTED_TYPES = ['hoth-arrival', 'hoth-assault', 'hoth-atat', 'hoth-tow', 'hoth-fall', 'hoth-evacuation'];
const EXPECTED_RULES = {
  'hoth-arrival': { rule: 'kills', kind: 'tie', target: 4 },
  'hoth-assault': { rule: 'kills', kind: 'at-st', target: 5 },
  'hoth-atat': { rule: 'kills', kind: 'at-at', target: 1 },
  'hoth-tow': { rule: 'qte', target: 4 },
  'hoth-fall': { rule: 'cinematic', target: 12 },
  'hoth-evacuation': { rule: 'escort', target: 3 },
};
const missionByType = (type) => HOTH_MISSIONS.find(mission => mission.type === type);
const sentences = (text) => text.split(/[.!?]+/).map(part => part.trim()).filter(Boolean);
const walk = (value, visit, path = '$') => {
  visit(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walk(item, visit, `${path}.${key}`);
  }
};

test('episode V ships six uniquely typed phases in the canonical order', () => {
  assert.equal(HOTH_MISSIONS.length, 6);
  assert.deepEqual(HOTH_MISSIONS.map(mission => mission.type), EXPECTED_TYPES);
  assert.equal(new Set(HOTH_MISSIONS.map(mission => mission.type)).size, HOTH_MISSIONS.length);
  assert.equal(new Set(HOTH_MISSIONS.map(mission => mission.id)).size, HOTH_MISSIONS.length);
  for (const mission of HOTH_MISSIONS) {
    assert.match(mission.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(mission.id, mission.type, 'phase id must match its type so the director finds it');
  }
});

test('every phase carries the fields the HUD and the campaign need', () => {
  for (const mission of HOTH_MISSIONS) {
    assert.equal(typeof mission.id, 'string');
    assert.equal(typeof mission.type, 'string');
    assert.ok(mission.title.trim().length > 0, `${mission.id} needs a title`);
    assert.ok(mission.objective.trim().length > 0, `${mission.id} needs an objective`);
    assert.ok(mission.briefing.trim().length > 0, `${mission.id} needs a briefing`);
    const count = sentences(mission.briefing).length;
    assert.ok(count >= 2 && count <= 4, `${mission.id} briefing must hold 2-4 sentences, got ${count}`);
    assert.equal(typeof mission.radio?.speaker, 'string');
    assert.ok(mission.radio.speaker.trim().length > 0, `${mission.id} needs a radio speaker`);
    assert.ok(mission.radio.text.trim().length > 0, `${mission.id} needs a radio line`);
    assert.ok(Array.isArray(mission.events) && mission.events.length >= 2, `${mission.id} needs events`);
    assert.ok(mission.events.length <= 4, `${mission.id} must not exceed four events`);
    for (const event of mission.events) {
      assert.ok(typeof event.id === 'string' && event.id.trim().length > 0);
      assert.ok(typeof event.speaker === 'string' && event.speaker.trim().length > 0);
      assert.ok(typeof event.text === 'string' && event.text.trim().length > 0);
      const timed = event.at !== undefined;
      const conditional = event.when !== undefined;
      assert.ok(timed !== conditional, `${event.id} needs exactly one of at or when`);
    }
    assert.ok(Array.isArray(mission.sideObjectives), `${mission.id} needs a side objective list`);
    assert.equal(typeof mission.progress?.rule, 'string');
    assert.ok(mission.progress.rule.trim().length > 0, `${mission.id} needs a progress rule`);
    assert.equal(typeof mission.progress.target, 'number');
  }
});

test('progress rules match the specification table of episode V', () => {
  for (const [type, rule] of Object.entries(EXPECTED_RULES)) {
    const mission = missionByType(type);
    assert.ok(mission, `missing phase ${type}`);
    assert.deepEqual(mission.progress, rule, `${type} progress rule`);
  }
});

test('progress targets match the phase target', () => {
  for (const mission of HOTH_MISSIONS) {
    assert.equal(mission.progress.target, mission.target, `${mission.id} target`);
    assert.ok(Number.isFinite(mission.target) && mission.target > 0, `${mission.id} target must be a positive number`);
  }
});

test('the tow phase ships four ordered stages inside its time window', () => {
  const tow = missionByType('hoth-tow');
  assert.ok(tow);
  assert.deepEqual(tow.qteKeys, ['KeyA', 'KeyD', 'KeyW', 'Space']);
  assert.equal(tow.qte.length, 4);
  assert.equal(tow.forceShipId, 'xwing');
  assert.ok(tow.retryPenalty > 0, 'a failed stage must cost time');
  const keys = tow.qte.map(stage => stage.key);
  assert.equal(new Set(keys).size, keys.length, 'stage keys must be unique');
  for (const stage of tow.qte) {
    assert.ok(tow.qteKeys.includes(stage.key), `${stage.key} is not an allowed key`);
    assert.ok(typeof stage.label === 'string' && stage.label.trim().length > 0);
    assert.ok(Number.isFinite(stage.duration) && stage.duration > 0, `${stage.key} needs a positive duration`);
  }
  assert.deepEqual(keys, ['KeyA', 'KeyD', 'KeyW', 'Space']);
  const total = tow.qte.reduce((sum, stage) => sum + stage.duration, 0);
  assert.ok(total <= tow.duration, 'stages must fit into the phase duration');
});

test('mission, event and objective ids stay unique inside the episode', () => {
  const missionIds = HOTH_MISSIONS.map(mission => mission.id);
  const eventIds = HOTH_MISSIONS.flatMap(mission => mission.events.map(event => event.id));
  const fieldIds = HOTH_MISSIONS.flatMap(mission => (mission.fieldObjectives || []).map(objective => objective.id));
  const sideIds = HOTH_MISSIONS.flatMap(mission => (mission.sideObjectives || []).map(objective => objective.id));
  for (const [label, ids] of Object.entries({ missionIds, eventIds, fieldIds, sideIds })) {
    assert.equal(new Set(ids).size, ids.length, `${label} must be unique`);
  }
  const everything = [...missionIds, ...eventIds, ...fieldIds, ...sideIds];
  assert.equal(new Set(everything).size, everything.length, 'ids must not collide across groups');
  for (const id of everything) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('every text is filled and every number is finite', () => {
  for (const mission of HOTH_MISSIONS) {
    walk(mission, (value, path) => {
      if (typeof value === 'string') assert.ok(value.trim().length > 0, `empty text at ${path}`);
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `non-finite number at ${path}`);
    });
  }
});

test('the walker is never promised to fall to frontal fire', () => {
  const atAt = missionByType('hoth-atat');
  assert.match(atAt.briefing, /брон/i);
  assert.match(atAt.radio.text, /брон/i);
  assert.match(atAt.radio.text, /не пробивается/i);
  const tow = missionByType('hoth-tow');
  assert.match(tow.briefing, /трос/i);
  assert.match(tow.radio.text, /трос/i);
  const indexOfAtAt = HOTH_MISSIONS.indexOf(atAt);
  const indexOfTow = HOTH_MISSIONS.indexOf(tow);
  assert.ok(indexOfAtAt >= 0 && indexOfTow === indexOfAtAt + 1, 'the cable phase follows the walker phase');
});

test('the episode ends with an evacuation and no separate victory phase', () => {
  const last = HOTH_MISSIONS[HOTH_MISSIONS.length - 1];
  assert.equal(last.type, 'hoth-evacuation');
  assert.equal(last.progress.rule, 'escort');
  assert.equal(last.target, 3);
  assert.equal(last.distance, 2200);
  assert.equal(HOTH_MISSIONS.some(mission => mission.type === 'victory'), false, 'victory is reached automatically');
  assert.match(last.radio.text, /транспорт/i);
  assert.match(last.radio.text, /база потеряна/i);
  const fall = missionByType('hoth-fall');
  assert.match(fall.radio.text, /машин/i);
  assert.ok(fall.duration > 0 && fall.target === fall.duration);
});
