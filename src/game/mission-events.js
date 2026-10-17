import { MISSIONS } from './missions.js';

const clone = value => JSON.parse(JSON.stringify(value));
const matches = (condition = {}, facts) => Object.entries(condition).every(([key, value]) =>
  key === 'allyHealthBelow' ? Number.isFinite(facts.allyHealth) && facts.allyHealth < value
    : Number.isFinite(facts[key]) && facts[key] >= value);

/** Pure optional mission director. Only observed engine facts can complete field tasks.
 * dt is simulation seconds; enterPhase is idempotent and reset starts a fresh sortie.
 * Events never advance the campaign or award ordinary kill points.
 */
export function createMissionDirector(missions = MISSIONS) {
  let phase = null;
  let mission = null;
  let elapsed = 0;
  let bonusScore = 0;
  let objectives = [];
  let history = [];
  let emitted = new Set();
  let destroyed = new Set();
  let ventDisabled = false;

  function radio(id, line) {
    return { id: `${phase}:${id}`, type: 'radio', ...line, cue: 'radio' };
  }

  function enterPhase(nextPhase) {
    if (nextPhase === phase) return [];
    history.push(...objectives.map(objective => ({ ...objective, status: objective.complete ? 'completed' : 'missed' })));
    phase = nextPhase;
    mission = missions.find(entry => entry.type === phase) || null;
    elapsed = 0;
    emitted = new Set();
    destroyed = new Set();
    ventDisabled = false;
    objectives = (mission?.fieldObjectives || []).map(definition => ({
      ...clone(definition), progress: 0, complete: false, optional: true,
      status: definition.activateWhen ? 'pending' : 'active',
    }));
    return [];
  }

  function ventSnapshot() {
    const config = mission?.vent;
    if (!config) return null;
    const localTime = elapsed % config.period;
    return { ...config, cycle: Math.floor(elapsed / config.period), disabled: ventDisabled,
      telegraph: !ventDisabled && localTime >= config.warningAt && localTime < config.openAt,
      active: !ventDisabled && localTime >= config.openAt && localTime < config.closeAt };
  }

  function getSnapshot() {
    return clone({ phase, elapsed, bonusScore, sideObjectives: objectives, history, vent: ventSnapshot() });
  }

  function completeObjective(objective, events) {
    objective.progress = objective.target;
    objective.complete = true;
    objective.status = 'completed';
    bonusScore += objective.bonus;
    events.push({ id: `${phase}:${objective.id}:complete`, type: 'side-complete',
      objectiveId: objective.id, bonus: objective.bonus, cue: 'objective' });
    if (objective.completeRadio) events.push(radio(`${objective.id}:report`, objective.completeRadio));
  }

  function updateDestructionObjectives(events) {
    for (const objective of objectives) {
      if (objective.status !== 'active' || !['eliminate', 'destroy'].includes(objective.kind)) continue;
      objective.progress = objective.kind === 'eliminate'
        ? objective.targetIds.filter(id => destroyed.has(id)).length
        : destroyed.has(objective.targetId) ? 1 : 0;
      if (objective.progress < objective.target) continue;
      completeObjective(objective, events);
      if (objective.id === 'coolant-regulator') {
        ventDisabled = true;
        events.push({ id: `${phase}:vent-disabled`, type: 'vent-close', ...mission.vent, disabled: true });
      }
    }
  }

  /** Combat reports are immediate, so the final primary kill may change phase safely. */
  function recordTargetDestroyed(id) {
    if (!mission || typeof id !== 'string' || !id || destroyed.has(id)) return [];
    destroyed.add(id);
    const events = [];
    updateDestructionObjectives(events);
    return events;
  }

  function update(facts = {}) {
    if (facts.paused || !mission || !Number.isFinite(facts.dt) || facts.dt <= 0) return [];
    const previousElapsed = elapsed;
    elapsed += facts.dt;
    const events = [];
    for (const id of facts.destroyedTargetIds || []) destroyed.add(id);

    for (const event of mission.events || []) {
      if (emitted.has(event.id) || (event.at !== undefined && elapsed < event.at) || !matches(event.when, facts)) continue;
      emitted.add(event.id);
      events.push(radio(event.id, { speaker: event.speaker, text: event.text }));
    }

    for (const objective of objectives) {
      if (objective.complete) continue;
      if (objective.status === 'pending') {
        if (!matches(objective.activateWhen, facts)) continue;
        objective.status = 'active';
        if (objective.wave) events.push({ id: `${phase}:${objective.id}:wave`, type: 'spawn-wave', ...clone(objective.wave) });
      }
      if (objective.kind === 'scan') {
        const point = facts.playerPosition;
        const distance = point ? Math.hypot(point.x - objective.position.x, point.y - objective.position.y, point.z - objective.position.z) : Infinity;
        const scanning = distance <= objective.radius && facts.targetId === objective.targetId
          && Number.isFinite(facts.speedRatio) && facts.speedRatio <= objective.maxSpeedRatio;
        // A broken lock restarts the dwell, rather than completing through brief passes.
        objective.progress = scanning ? Math.min(objective.target, objective.progress + facts.dt) : 0;
      }
      if (objective.kind === 'scan' && objective.progress >= objective.target) {
        completeObjective(objective, events);
      }
    }
    updateDestructionObjectives(events);

    const config = mission.vent;
    if (config && !ventDisabled) {
      // Emit every crossed boundary in time order, even when a frame spans a cycle.
      for (let cycle = Math.floor(previousElapsed / config.period); cycle <= Math.floor(elapsed / config.period); cycle++) {
        for (const [at, type] of [[config.warningAt, 'vent-warning'], [config.openAt, 'vent-open'], [config.closeAt, 'vent-close']]) {
          const time = cycle * config.period + at;
          if (time <= previousElapsed || time > elapsed) continue;
          events.push({ id: `${phase}:vent:${cycle}:${type}`, type, laneX: config.laneX, width: config.width, cycle, cue: type === 'vent-warning' ? 'warning' : 'vent' });
          if (type === 'vent-warning' && cycle === 0) events.push(radio('vent-warning-report', {
            speaker: 'Бортовой астромеханик', text: 'Рост температуры слева! Оранжевая полоса отмечает сброс — уходите вправо до открытия клапанов.',
          }));
        }
      }
    }
    return events;
  }

  function reset() {
    phase = null;
    mission = null;
    elapsed = 0;
    bonusScore = 0;
    objectives = [];
    history = [];
    emitted = new Set();
    destroyed = new Set();
    ventDisabled = false;
    return getSnapshot();
  }

  return { enterPhase, update, recordTargetDestroyed, getSnapshot, reset };
}
