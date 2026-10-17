const ORDERS = [
  { id: 'cover', label: 'Прикрытие', description: 'Атакуют ближайший к вам истребитель.' },
  { id: 'attack', label: 'Атака', description: 'Атакуют вашу цель или ближайшего противника.' },
  { id: 'escort', label: 'Эскорт', description: 'Атакуют противника у наиболее уязвимого союзника.' },
];

const ORDER_IDS = new Set(ORDERS.map(order => order.id));
const validPosition = position => position
  && Number.isFinite(position.x)
  && Number.isFinite(position.y)
  && Number.isFinite(position.z);
const distanceSquared = (left, right) => {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return dx * dx + dy * dy + dz * dz;
};
const alive = item => item && item.disabled !== true && item.retreat !== true
  && item.dead !== true && !(Number.isFinite(item.health) && item.health <= 0);

/** Pure wingman command state and target selection. Targeting never mutates input entities. */
export function createWingOrders() {
  let orderId = 'cover';

  function reset() {
    orderId = 'cover';
    return snapshot();
  }

  function setOrder(order) {
    if (!ORDER_IDS.has(order)) return false;
    orderId = order;
    return true;
  }

  function cycleOrder() {
    const index = ORDERS.findIndex(order => order.id === orderId);
    orderId = ORDERS[(index + 1) % ORDERS.length].id;
    return orderId;
  }

  function selectTarget({ enemies = [], playerPosition, escortAllies = [], playerTargetId } = {}) {
    if (!Array.isArray(enemies)) return null;
    const eligible = enemies.filter(enemy => alive(enemy)
      && enemy.id !== null && enemy.id !== undefined
      && validPosition(enemy.position)
      && (orderId === 'attack' || enemy.kind === 'tie'));
    if (!eligible.length) return null;

    if (orderId === 'attack') {
      const playerTarget = eligible.find(enemy => enemy.id === playerTargetId);
      if (playerTarget) return playerTarget.id;
    }

    let origin = validPosition(playerPosition) ? playerPosition : null;
    if (orderId === 'escort') {
      const mostVulnerable = Array.isArray(escortAllies)
        ? escortAllies.filter(ally => alive(ally) && validPosition(ally.position)
          && Number.isFinite(ally.health))
          .reduce((lowest, ally) => !lowest || ally.health < lowest.health ? ally : lowest, null)
        : null;
      if (mostVulnerable) origin = mostVulnerable.position;
    }
    if (!origin) return null;

    let closest = null;
    let closestDistance = Infinity;
    for (const enemy of eligible) {
      const distance = distanceSquared(origin, enemy.position);
      if (Number.isFinite(distance) && distance < closestDistance) {
        closest = enemy;
        closestDistance = distance;
      }
    }
    return closest?.id ?? null;
  }

  function snapshot() {
    const current = ORDERS.find(order => order.id === orderId);
    return { order: current.id, label: current.label, description: current.description };
  }

  return { reset, setOrder, cycleOrder, selectTarget, snapshot };
}

/** Awards one escort preservation bonus at checkpoint three; score is the new award for this update. */
export function createEscortBonus() {
  let awarded = false;

  function reset() {
    awarded = false;
    return { events: [], score: 0 };
  }

  function update({ phase, allyHealth, checkpoint, dt, paused = false } = {}) {
    void dt; // Checkpoint facts are authoritative; elapsed time does not advance the bonus.
    if (paused || awarded || phase !== 'escort' || !Number.isFinite(checkpoint) || checkpoint < 3) {
      return { events: [], score: 0 };
    }
    if (!Array.isArray(allyHealth) || allyHealth.length !== 3
      || allyHealth.some(health => !Number.isFinite(health))) {
      return { events: [], score: 0 };
    }

    const score = allyHealth.every(health => health >= 50) ? 150
      : allyHealth.every(health => health > 0) ? 75 : 0;
    awarded = true;
    if (!score) return { events: [], score: 0 };

    return {
      events: [{ id: 'escort-bonus:preserved-formation', type: 'mission-bonus',
        score, checkpoint: 3, reason: score === 150 ? 'all-allies-above-50' : 'all-allies-survived' }],
      score,
    };
  }

  return { reset, update };
}
