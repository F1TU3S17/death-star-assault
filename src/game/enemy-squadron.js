const REINFORCEMENT_DELAY = 4;
const PILOTS = {
  leader: { speedMultiplier: 1.08, aimScale: 1.08, cooldownScale: 0.9 },
  veteran: { speedMultiplier: 1.03, aimScale: 1, cooldownScale: 1 },
  novice: { speedMultiplier: 0.93, aimScale: 0.8, cooldownScale: 1.25 },
};

const copyDirective = directive => ({ ...directive, targetOffset: { ...directive.targetOffset } });
const validId = id => (typeof id === 'string' && id.length > 0)
  || (typeof id === 'number' && Number.isFinite(id));

/**
 * Pure coordination for ordinary TIEs. Feed the complete living fighter roster
 * each simulation tick; omission or health <= 0 means a confirmed loss. Vader is
 * excluded. IDs, pilot ranks and pairs remain stable until reset().
 *
 * targetOffset is a world-space offset from the player, not an absolute point.
 * aimScale multiplies the brain's aim precision (larger is better), while
 * cooldownScale multiplies its shot interval (smaller is faster). These modest
 * pilot modifiers never award damage, create projectiles, or spawn ships.
 * A reinforcement-request asks the caller to spawn ONE real fighter, at most
 * once per reset; the caller owns mission spawn limits and may decline it.
 */
export function createEnemySquadron() {
  let members;
  let elapsed;
  let pairCount;
  let pendingReinforcement;
  let reinforcementReserved;
  let reinforcementRequests;
  let lastDirectives;

  function reset() {
    members = new Map();
    elapsed = 0;
    pairCount = 0;
    pendingReinforcement = null;
    reinforcementReserved = false;
    reinforcementRequests = 0;
    lastDirectives = [];
    return snapshot();
  }

  function snapshot() {
    return {
      elapsed,
      reinforcementRequests,
      pendingReinforcement: pendingReinforcement ? {
        enemyId: pendingReinforcement.enemyId,
        remaining: Math.max(0, REINFORCEMENT_DELAY - (elapsed - pendingReinforcement.startedAt)),
      } : null,
      members: Array.from(members.values(), member => ({ ...member })),
    };
  }

  function update({ fighters = [], playerPosition, dt = 0, paused = false } = {}) {
    // Do not observe roster changes or consume event budgets during a pause.
    if (paused) return { directives: lastDirectives.map(copyDirective), events: [] };
    elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const events = [];
    const alive = new Map();
    for (const fighter of Array.isArray(fighters) ? fighters : []) {
      if (!fighter || !validId(fighter.id) || fighter.variant === 'vader'
        || (Number.isFinite(fighter.health) && fighter.health <= 0)) continue;
      if (!alive.has(fighter.id)) alive.set(fighter.id, fighter);
    }
    const emit = (code, text, enemyId) => events.push({ type: 'squadron', code, text, enemyId });

    // A single pass gives deterministic first-seen ranks without sorting or
    // searching neighbors. Input order may change freely on later updates.
    for (const directive of lastDirectives) members.get(directive.id).alive = false;
    for (const id of alive.keys()) {
      if (members.has(id)) {
        members.get(id).alive = true;
        continue;
      }
      const index = members.size;
      members.set(id, {
        id,
        pilotRole: index === 0 ? 'leader' : index % 2 ? 'novice' : 'veteran',
        role: 'solo', partnerId: null, side: index % 4 < 2 ? 1 : -1,
        retreat: false, lossHandled: false, alive: true,
      });
    }

    let waiting = null;
    for (const id of alive.keys()) {
      const member = members.get(id);
      if (member.partnerId !== null || member.lossHandled) continue;
      if (!waiting) {
        waiting = member;
        continue;
      }
      waiting.role = 'bait';
      member.role = 'flank';
      waiting.partnerId = member.id;
      member.partnerId = waiting.id;
      waiting.side = member.side = pairCount++ % 2 ? -1 : 1;
      emit('formation', 'Пара TIE: ведущий отвлекает, ведомый обходит с фланга.', waiting.id);
      waiting = null;
    }

    for (const id of alive.keys()) {
      const member = members.get(id);
      if (member.partnerId === null || member.lossHandled || alive.has(member.partnerId)) continue;
      member.lossHandled = true;
      if (member.pilotRole !== 'novice' && !reinforcementReserved) {
        reinforcementReserved = true;
        pendingReinforcement = { enemyId: member.id, startedAt: elapsed };
        emit('reinforcement-called', 'TIE потерял ведомого и вызывает подкрепление.', member.id);
      } else {
        member.retreat = true;
        emit('retreat', 'Оставшийся без напарника TIE выходит из боя.', member.id);
      }
    }

    if (pendingReinforcement) {
      const { enemyId, startedAt } = pendingReinforcement;
      if (!alive.has(enemyId)) {
        // A destroyed caller cannot summon another wave; the finite reservation
        // stays consumed so replacement IDs cannot repeatedly request a spawn.
        pendingReinforcement = null;
      } else if (elapsed - startedAt >= REINFORCEMENT_DELAY) {
        pendingReinforcement = null;
        reinforcementRequests++;
        emit('reinforcement-request', 'Подкрепление TIE выходит на перехват.', enemyId);
      }
    }

    lastDirectives = [];
    for (const id of alive.keys()) {
      const member = members.get(id);
      const pilot = PILOTS[member.pilotRole];
      const targetOffset = member.retreat
        ? { x: member.side * 850, y: 160, z: 900 }
        : member.role === 'bait'
          ? { x: member.side * -70, y: 15, z: 180 }
          : member.role === 'flank'
            ? { x: member.side * 230, y: -15, z: -180 }
            : { x: member.side * 100, y: 0, z: 0 };
      lastDirectives.push({
        id, role: member.role, pilotRole: member.pilotRole, targetOffset,
        ...pilot, speedMultiplier: member.retreat ? 1.2 : pilot.speedMultiplier,
        retreat: member.retreat,
      });
    }
    return { directives: lastDirectives.map(copyDirective), events };
  }

  reset();
  return { reset, update, snapshot };
}
