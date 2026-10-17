const THREATS = [
  { id: 'escort-route-battery', decision: 'battery-suppressed', pressure: 1 },
  { id: 'escort-power-node', decision: 'relay-destroyed', pressure: 1 },
];

const clone = value => JSON.parse(JSON.stringify(value));

/**
 * Pure tactical state for the Gold Squadron escort. Call begin() on escort entry.
 * The caller reports only confirmed physical TIE/target destructions; this module
 * describes their effects but never applies hull/shield damage or advances missions.
 */
export function createEscortTactics() {
  let active = false;
  let allyHealth = null;
  let checkpoint = 0;
  let pressure = 5;
  let threats = new Set(THREATS.map(threat => threat.id));
  let destroyed = new Set();
  let decisions = [];
  let emitted = new Set();

  function emitOnce(id, event) {
    if (emitted.has(id)) return null;
    emitted.add(id);
    return { id: `escort-tactics:${id}`, ...event };
  }

  function begin() {
    active = true;
    allyHealth = null;
    checkpoint = 0;
    pressure = 5;
    threats = new Set(THREATS.map(threat => threat.id));
    destroyed = new Set();
    decisions = [];
    emitted = new Set();
    return snapshot();
  }

  function update(facts = {}) {
    if (!active || facts.paused) return [];
    const events = [];
    if (Number.isFinite(facts.allyHealth)) {
      allyHealth = Math.max(0, facts.allyHealth);
      if (allyHealth <= 60) {
        const event = emitOnce('ally-damage-warning', {
          type: 'radio', speaker: 'Золотой Лидер',
          text: 'Золотая группа теряет щиты. Снимите ближайшую угрозу с маршрута.', cue: 'warning',
        });
        if (event) events.push(event);
      }
      if (allyHealth <= 0) {
        const event = emitOnce('ally-lost', {
          type: 'radio', speaker: 'Золотой Лидер',
          text: 'Потеряли строй! Операция сорвана.', cue: 'warning',
        });
        if (event) events.push(event);
      }
    }
    if (Number.isFinite(facts.escortCheckpoint)) {
      checkpoint = Math.max(checkpoint, Math.max(0, Math.floor(facts.escortCheckpoint)));
      if (checkpoint >= 1 && threats.has('escort-route-battery')) {
        const event = emitOnce('battery-blocks-route', {
          type: 'radio', speaker: 'Золотой Два',
          text: 'Зенитная батарея перекрывает наш коридор! Подавите её или уничтожьте питающий узел.', cue: 'warning',
        });
        if (event) events.push(event);
      }
      if (checkpoint >= 2 && threats.has('escort-power-node')) {
        const event = emitOnce('relay-threat-warning', {
          type: 'radio', speaker: 'Золотой Лидер',
          text: 'Энергетический узел всё ещё питает батарею. Его уничтожение ослабит огонь и восстановит часть щитов группы.', cue: 'warning',
        });
        if (event) events.push(event);
      }
    }
    return events;
  }

  /** Report an actual collision-confirmed kill. Non-threat IDs count only when
   * kind is 'tie'; turret/other IDs are ignored. Duplicate and paused reports are ignored.
   */
  function recordDestroyed(id, { kind = 'tie', paused = false } = {}) {
    if (!active || paused || typeof id !== 'string' || !id || destroyed.has(id)) return [];
    const knownThreat = THREATS.find(item => item.id === id);
    if (!knownThreat && kind !== 'tie') return [];
    if (knownThreat && !threats.has(id)) return [];
    destroyed.add(id);
    const events = [];
    const threat = knownThreat;
    const previousPressure = pressure;
    if (threat) {
      threats.delete(id);
      pressure = Math.max(0, pressure - threat.pressure);
      decisions.push(threat.decision);
      if (id === 'escort-power-node') {
        // Root integration applies this finite reward to the ally's real shield pool.
        events.push({ id: 'escort-tactics:relay-destroyed', type: 'escort-threat-disabled', targetId: id,
          disableTargetIds: ['escort-route-battery'], allyShieldRestore: 25, once: true });
        threats.delete('escort-route-battery');
        if (!decisions.includes('battery-disabled-by-relay')) decisions.push('battery-disabled-by-relay');
      } else {
        events.push({ id: 'escort-tactics:battery-disabled', type: 'escort-battery-disabled', targetId: id,
          disableTargetIds: [id], once: true });
      }
    } else {
      pressure = Math.max(0, pressure - 1);
      decisions.push('tie-destroyed');
      events.push({ id: `escort-tactics:tie-destroyed:${id}`, type: 'escort-pressure-reduced', targetId: id,
        pressure });
    }
    if (previousPressure > 0 && pressure === 0) {
      const event = emitOnce('pressure-eased', {
        type: 'radio', speaker: 'Золотой Лидер',
        text: 'Огонь по группе ослаб. Держите строй до следующей точки.', cue: 'radio',
      });
      if (event) events.push(event);
    }
    return events;
  }

  function snapshot() {
    const threatsSnapshot = THREATS.map(threat => ({
      id: threat.id,
      alive: threats.has(threat.id),
      disabled: !threats.has(threat.id),
    }));
    return clone({ active, checkpoint, allyHealth, pressure, threats: threatsSnapshot,
      decisions, outcome: !active ? 'inactive' : allyHealth === 0 ? 'ally-lost' : 'active' });
  }

  function reset() {
    active = false;
    allyHealth = null;
    checkpoint = 0;
    pressure = 5;
    threats = new Set(THREATS.map(threat => threat.id));
    destroyed = new Set();
    decisions = [];
    emitted = new Set();
    return snapshot();
  }

  return { begin, update, recordDestroyed, snapshot, reset };
}
