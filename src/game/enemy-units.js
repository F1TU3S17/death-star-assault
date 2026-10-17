const SPECS = {
  tie: {
    line: { health: 48, radius: 10, modelKind: 'tie', movement: 'fighter', canFire: true },
    ace: { health: 68, radius: 10, modelKind: 'tie', movement: 'fighter', canFire: true },
  },
  vader: {
    vader: { health: 220, radius: 12, modelKind: 'vader', movement: 'fighter', canFire: true },
  },
  turret: {
    light: { health: 78, radius: 22, modelKind: 'turret', movement: 'stationary', canFire: true },
    heavy: { health: 138, radius: 22, modelKind: 'turret', movement: 'stationary', canFire: true },
  },
  relay: {
    relay: { health: 35, radius: 16, modelKind: 'relay', movement: 'stationary', canFire: false },
  },
};

/** Return a fresh, episode-agnostic specification for an enemy unit. */
export function getEnemyUnitSpec(kind = 'tie', variant = 'line') {
  const resolvedKind = Object.hasOwn(SPECS, kind) ? kind : 'tie';
  const resolvedVariant = resolvedKind === 'vader'
    ? 'vader'
    : resolvedKind === 'relay'
      ? 'relay'
      : Object.hasOwn(SPECS[resolvedKind], variant)
        ? variant
        : resolvedKind === 'turret'
          ? 'light'
          : 'line';
  const spec = SPECS[resolvedKind]?.[resolvedVariant] ?? SPECS.tie.line;
  return { ...spec };
}

const hasValidPosition = entity => {
  const point = entity?.position;
  return point != null
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Choose an enemy's target without mutating any supplied entities.
 * Defenders and turrets select a living, positioned ally by stable seed;
 * otherwise the player remains the fallback target.
 */
export function chooseEnemyTarget({
  kind = 'tie',
  variant = 'line',
  seed = 0,
  position,
  player = { id: 'player', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
  allies = [],
  defendAllies = false,
  acePlayerRange = 300,
} = {}) {
  const safePlayer = player ?? { id: 'player', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const livingAllies = Array.isArray(allies)
    ? allies.filter(ally => ally && !(ally.health <= 0) && hasValidPosition(ally))
    : [];

  const isAce = kind === 'ace' || variant === 'ace';
  if (isAce && hasValidPosition({ position }) && hasValidPosition(safePlayer)
      && Number.isFinite(acePlayerRange) && acePlayerRange >= 0
      && distance(position, safePlayer.position) <= acePlayerRange) {
    return safePlayer;
  }

  const targetsAllies = defendAllies || kind === 'turret';
  if (!targetsAllies || livingAllies.length === 0) return safePlayer;

  const numericSeed = Number.isFinite(seed) ? Math.floor(seed) : 0;
  const index = ((numericSeed % livingAllies.length) + livingAllies.length) % livingAllies.length;
  return livingAllies[index];
}
