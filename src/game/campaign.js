import { EPISODES } from './data.js';

const QTE_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'Space']);
/** Progress rules of Episode IV stay explicit; other episodes declare their own in mission data. */
const LEGACY_RULES = {
  combat: { rule: 'kills', kind: 'tie' },
  defend: { rule: 'kills', kind: 'tie' },
  surface: { rule: 'kills', kind: 'turret' },
  escort: { rule: 'escort' },
  trench: { rule: 'checkpoints' },
  assault: { rule: 'assault' },
  qte: { rule: 'qte' },
  cinematic: { rule: 'cinematic' },
};
const normalizeKey = (key) => ({ a: 'KeyA', A: 'KeyA', d: 'KeyD', D: 'KeyD', w: 'KeyW', W: 'KeyW', ' ': 'Space', Spacebar: 'Space' }[key] || key);

/** The progress rule of a mission: declared by the mission, or inherited from Episode IV. */
export function resolveProgressRule(mission) {
  if (!mission) return null;
  return mission.progress || LEGACY_RULES[mission.type] || null;
}

/** Pure campaign state machine. dt is seconds; geometry and combat stay in the engine. */
export function createCampaign(episodeId = 'episode4') {
  const episode = EPISODES[episodeId];
  if (!episode?.missions?.length) throw new Error(`Unknown or empty episode: ${episodeId}`);
  let missionIndex, progress, elapsed, qteIndex, qteRemaining, qteTotalRemaining;
  let failed, reason, complete, radio, sideProgress, assaultKills, assaultRallyReached;

  const current = () => episode.missions[missionIndex];
  const ruleFor = (mission = current()) => mission.progress || LEGACY_RULES[mission.type] || null;
  const enter = (index) => {
    missionIndex = index;
    progress = 0;
    elapsed = 0;
    qteIndex = 0;
    qteRemaining = current().qte?.[0]?.duration || 0;
    qteTotalRemaining = current().duration || 0;
    radio = { ...current().radio };
    sideProgress = Object.fromEntries((current().sideObjectives || []).map(objective => [objective.id, 0]));
    assaultKills = 0;
    assaultRallyReached = false;
  };
  const active = () => !failed && !complete;
  const advance = () => {
    if (missionIndex + 1 < episode.missions.length) enter(missionIndex + 1);
    else {
      complete = true;
      progress = current().target;
      radio = current().victoryRadio || { speaker: 'Управление Явина', text: 'Звезда Смерти уничтожена. Возвращайтесь домой.' };
    }
  };
  const fail = (message = 'Корабль потерян. Повторите кампанию.') => {
    if (complete || failed) return getSnapshot();
    failed = true;
    reason = message;
    return getSnapshot();
  };
  const retryQte = () => {
    qteTotalRemaining = Math.max(0, qteTotalRemaining - current().retryPenalty);
    qteIndex = 0;
    progress = 0;
    qteRemaining = current().qte[0].duration;
    radio = { speaker: 'Люк / Красный Пять', text: 'Курс сбился. Ещё один заход — времени мало.' };
    if (qteTotalRemaining === 0) fail('Окно атаки закрыто. Повторите кампанию.');
  };

  function getSnapshot() {
    const mission = current();
    const qte = mission.qte && active() ? {
      ...mission.qte[qteIndex], remaining: qteRemaining,
      totalRemaining: qteTotalRemaining, stage: qteIndex,
      progress: qteIndex, total: mission.qte.length,
    } : null;
    return {
      episodeId, missionIndex, phase: complete ? 'victory' : mission.type,
      mission: { ...JSON.parse(JSON.stringify(mission)), index: missionIndex, progress, progressRule: ruleFor() },
      progress, target: mission.target, radio: radio ? { ...radio } : null,
      qte, complete, failed, reason, elapsed,
      assault: mission.type === 'assault' ? {
        kills: assaultKills,
        targetKills: mission.combatRoute.kills,
        rallyReached: assaultRallyReached,
      } : null,
      sideObjectives: (mission.sideObjectives || []).map(objective => ({
        ...objective, progress: sideProgress[objective.id] || 0,
        complete: (sideProgress[objective.id] || 0) >= objective.target,
      })),
    };
  }

  function recordKill(kind) {
    if (!active()) return getSnapshot();
    const rule = ruleFor();
    if (rule?.rule === 'assault' && kind === 'tie') {
      assaultKills = Math.min(current().combatRoute.kills, assaultKills + 1);
      progress = assaultKills + Number(assaultRallyReached);
      if (assaultKills >= current().combatRoute.kills && assaultRallyReached) advance();
    } else if (rule?.rule === 'kills' && rule.kind === kind) {
      progress += 1;
      if (progress >= current().target) advance();
    }
    return getSnapshot();
  }

  function recordCheckpoint() {
    const rule = active() ? ruleFor() : null;
    if (active() && rule?.rule === 'assault') {
      assaultRallyReached = true;
      progress = assaultKills + 1;
      if (assaultKills >= current().combatRoute.kills) advance();
    } else if (active() && rule?.rule === 'checkpoints') {
      progress += 1;
      if (progress >= current().target) advance();
    }
    return getSnapshot();
  }

  function recordEscortCheckpoint() {
    const rule = active() ? ruleFor() : null;
    if (active() && rule?.rule === 'escort') {
      progress += 1;
      if (progress >= current().target) advance();
    }
    return getSnapshot();
  }

  function recordSideObjective(id, amount = 1) {
    const objective = current().sideObjectives?.find(entry => entry.id === id);
    if (active() && objective && Number.isFinite(amount) && amount > 0) {
      sideProgress[id] = Math.min(objective.target, (sideProgress[id] || 0) + amount);
    }
    return getSnapshot();
  }

  function qteInput(input) {
    if (!active() || !current().qte) return false;
    const key = normalizeKey(input);
    const allowed = current().qteKeys ? new Set(current().qteKeys) : QTE_KEYS;
    if (!allowed.has(key)) return false;
    if (key !== current().qte[qteIndex].key) {
      retryQte();
      return false;
    }
    qteIndex += 1;
    progress = qteIndex;
    if (qteIndex === current().qte.length) advance();
    else qteRemaining = current().qte[qteIndex].duration;
    return true;
  }

  function update(dt) {
    if (!active() || !Number.isFinite(dt) || dt <= 0) return getSnapshot();
    elapsed += dt;
    if (current().qte) {
      // Consume all elapsed windows, including long frames; no timeout can be skipped.
      let pending = dt;
      while (pending > 0 && active()) {
        const step = Math.min(pending, qteRemaining, qteTotalRemaining);
        pending -= step;
        qteRemaining = Math.max(0, qteRemaining - step);
        qteTotalRemaining = Math.max(0, qteTotalRemaining - step);
        if (qteTotalRemaining === 0) fail('Время истекло. Звезда Смерти готова открыть огонь.');
        else if (qteRemaining === 0) retryQte();
      }
    } else if (ruleFor()?.rule === 'cinematic') {
      progress = Math.min(elapsed, current().duration);
      if (elapsed >= current().duration) advance();
    }
    return getSnapshot();
  }

  function reset() {
    failed = false;
    reason = '';
    complete = false;
    enter(0);
    return getSnapshot();
  }

  reset();
  return { getSnapshot, recordKill, recordCheckpoint, recordEscortCheckpoint, recordSideObjective, update, qteInput, reset, fail };
}
