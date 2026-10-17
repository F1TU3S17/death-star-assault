const REPAIR_ORDER = ['hull', 'engines', 'weapons', 'sensors'];
const DAMAGE_ORDER = ['engines', 'weapons', 'sensors'];
const DAMAGE_THRESHOLD = 18;
const DAMAGE_PER_FAULT = 30;
const MAX_FAULTS_PER_HIT = 3;
const REPAIR_AMOUNT = 40;

const SYSTEM_NAMES = {
  engines: 'Двигатели',
  weapons: 'Оружие',
  sensors: 'Сенсоры',
};

export function createShipSystems() {
  let selected = 'hull';
  let accumulatedDamage = 0;
  let damageCursor = 0;
  let pendingFaults = 0;
  let systems;

  function reset() {
    selected = 'hull';
    accumulatedDamage = 0;
    damageCursor = 0;
    pendingFaults = 0;
    systems = {
      engines: 100,
      weapons: 100,
      sensors: 100,
    };
  }

  function damage(hullDamage, { source = 'impact' } = {}) {
    void source;
    if (typeof hullDamage !== 'number' || !Number.isFinite(hullDamage) || hullDamage <= 0) {
      return null;
    }

    const totalDamage = accumulatedDamage + hullDamage;
    if (!Number.isFinite(totalDamage)) {
      accumulatedDamage = 0;
      pendingFaults = Number.MAX_VALUE;
    } else {
      const crossedThresholds = Math.floor(totalDamage / DAMAGE_THRESHOLD);
      accumulatedDamage = totalDamage % DAMAGE_THRESHOLD;
      pendingFaults = Math.min(Number.MAX_VALUE, pendingFaults + crossedThresholds);
    }

    let newlyDamaged = null;
    const faultsToApply = Math.min(pendingFaults, MAX_FAULTS_PER_HIT);
    for (let i = 0; i < faultsToApply; i += 1) {
      const id = DAMAGE_ORDER[damageCursor];
      damageCursor = (damageCursor + 1) % DAMAGE_ORDER.length;
      systems[id] = Math.max(0, systems[id] - DAMAGE_PER_FAULT);
      newlyDamaged = id;
    }
    pendingFaults -= faultsToApply;
    return newlyDamaged;
  }

  function selectRepair(id) {
    if (!REPAIR_ORDER.includes(id)) return false;
    selected = id;
    return true;
  }

  function cycleRepair() {
    const index = REPAIR_ORDER.indexOf(selected);
    selected = REPAIR_ORDER[(index + 1) % REPAIR_ORDER.length];
    return selected;
  }

  function repair(amount = REPAIR_AMOUNT) {
    if (selected === 'hull' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const previous = systems[selected];
    systems[selected] = Math.min(100, previous + amount);
    return systems[selected] - previous;
  }

  function snapshot() {
    const ratio = (id) => systems[id] / 100;
    const engineRatio = ratio('engines');
    const weaponRatio = ratio('weapons');
    const sensorRatio = ratio('sensors');

    return {
      selected,
      systems: DAMAGE_ORDER.map((id) => ({
        id,
        name: SYSTEM_NAMES[id],
        integrity: systems[id],
      })),
      effects: {
        thrust: 0.7 + 0.3 * engineRatio,
        acceleration: 0.65 + 0.35 * engineRatio,
        weaponCooldown: 1 + 0.5 * (1 - weaponRatio),
        weaponCooling: 0.65 + 0.35 * weaponRatio,
        sensorLockRate: 0.65 + 0.35 * sensorRatio,
      },
    };
  }

  reset();
  return { reset, damage, selectRepair, cycleRepair, repair, snapshot };
}
