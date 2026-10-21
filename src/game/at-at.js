/**
 * Pure AT-AT walker model for Episode V "Battle of Hoth".
 *
 * The module owns numbers only: gait, leg inverse kinematics, armour
 * multipliers, tow cable state and the toppling sequence. It never touches
 * Three.js or the DOM, so the whole behaviour is unit testable with node:test.
 *
 * Units: leg segment lengths (`legUpper` / `legLower`) are expressed in
 * "walker units"; one walker unit is `scale` world metres, which keeps the
 * machine roughly 28 m tall and the 18 m/s march consistent with the 1.1 s
 * step cycle. Positions, speeds and shotballs use world metres.
 */

const WORLD_UP = { x: 0, y: 1, z: 0 };
const EPSILON = 1e-6;
const MAX_DELTA = 3600;
const ARRIVAL_EPSILON = 0.5;

/** Damage multipliers per hit zone: the frontal plate eats almost everything. */
export const AT_AT_PART_MULTIPLIERS = Object.freeze({
  armor: 0.05,
  leg: 1.6,
  turret: 2.2,
  rear: 1.2,
  body: 1,
});

/** Baseline numbers from the Episode V specification. */
export const AT_AT_DEFAULTS = Object.freeze({
  health: 900,
  speed: 18,
  stepDuration: 1.1,
  legUpper: 3.4,
  legLower: 3.6,
  telegraph: 1.2,
  shellSpeed: 220,
  shellFlight: 2.4,
  shellDamage: 22,
  shellSplash: 6,
  scale: 4,
  hipHeight: 5.6,
  lift: 1.6,
  turretHeight: 6.6,
  turretForward: 1.2,
  legSpacing: 2.2,
  legBase: 3,
  tipDuration: 2.2,
  fallDuration: 1.4,
});

/** Playable flavours; `arcade` is the faster, more forgiving balance. */
const VARIANTS = Object.freeze({
  assault: { speed: 18, health: 900 },
  arcade: { speed: 24, health: 900 },
});

/**
 * Four legs, quarter cycle apart. Front and rear knees bend in opposite
 * directions so the silhouette reads like the walking canon footage.
 */
const LEG_DEFINITIONS = Object.freeze([
  { id: 'FL', phase: 0, side: -1, front: 1, bend: -1 },
  { id: 'FR', phase: Math.PI, side: 1, front: 1, bend: -1 },
  { id: 'BR', phase: Math.PI / 2, side: 1, front: -1, bend: 1 },
  { id: 'BL', phase: 3 * Math.PI / 2, side: -1, front: -1, bend: 1 },
]);

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const numberOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const minimum = (value, fallback, min) => Math.max(min, numberOr(value, fallback));
const clampDelta = value => (Number.isFinite(value) ? clamp(value, 0, MAX_DELTA) : 0);

/** Reads a world point, tolerating missing or broken coordinates. */
const readPoint = value => {
  if (!value || typeof value !== 'object') return null;
  const x = Number.isFinite(value.x) ? value.x : null;
  const z = Number.isFinite(value.z) ? value.z : null;
  if (x === null || z === null) return null;
  return { x, y: Number.isFinite(value.y) ? value.y : 0, z };
};

const normalize2 = (x, z) => {
  const length = Math.hypot(x, z);
  return length > EPSILON ? { x: x / length, z: z / length } : null;
};

const normalize3 = (x, y, z) => {
  const length = Math.hypot(x, y, z);
  return length > EPSILON ? { x: x / length, y: y / length, z: z / length } : null;
};

/** Right hand side of the walker for a horizontal heading. */
const rightVector = heading => ({ x: -heading.z, z: heading.x });

/** Small deterministic pseudo random generator seeded per machine. */
const createRandom = seed => {
  let state = (Math.floor(numberOr(seed, 1)) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Inverse kinematics of a single leg in the vertical "forward / up" plane of
 * the hull.
 *
 * `hip` and `foot` are world points, `forward` is the unit vector pointing
 * ahead of the hull. The solver projects the hip to foot vector onto that
 * plane, solves the law of cosines triangle (alpha at the hip, gamma at the
 * knee) and places the knee accordingly.
 *
 * @param {object} input
 * @param {{x: number, y: number, z: number}} [input.hip] hip joint position
 * @param {{x: number, y: number, z: number}} [input.foot] foot target position
 * @param {number} [input.upperLength] thigh length
 * @param {number} [input.lowerLength] shin length
 * @param {number} [input.bend] knee bend sign, +1 or -1
 * @param {{x: number, y: number, z: number}} [input.forward] hull forward axis
 * @returns {{reachable: boolean, hipAngle: number, kneeAngle: number, knee: object}}
 *   `hipAngle` is the thigh angle from forward, `kneeAngle` the interior knee
 *   angle (gamma), `knee` the world knee position together with its plane
 *   coordinates `{fwd, up}`. When the pose is out of reach the leg is
 *   straightened and `reachable` is false.
 */
export function solveLegPose({ hip, foot, upperLength, lowerLength, bend = 1, forward } = {}) {
  const hipPoint = readPoint(hip) ?? { x: 0, y: 0, z: 0 };
  const footPoint = readPoint(foot) ?? { x: 0, y: 0, z: 0 };
  const upper = Math.max(0.01, numberOr(upperLength, 1));
  const lower = Math.max(0.01, numberOr(lowerLength, 1));
  const bendSign = Math.sign(numberOr(bend, 1)) || 1;
  const axis = readPoint(forward);
  const axisLength = axis ? Math.hypot(axis.x, axis.z) : 0;
  const heading = axisLength > EPSILON
    ? { x: axis.x / axisLength, z: axis.z / axisLength }
    : { x: 0, z: -1 };

  const deltaX = footPoint.x - hipPoint.x;
  const deltaY = footPoint.y - hipPoint.y;
  const deltaZ = footPoint.z - hipPoint.z;
  const forwardOffset = deltaX * heading.x + deltaZ * heading.z;
  const upOffset = deltaY;
  const distance = Math.hypot(forwardOffset, upOffset);

  const minReach = Math.abs(upper - lower);
  const maxReach = upper + lower;
  const tolerance = 1e-9;
  const reachable = Number.isFinite(distance)
    && distance > EPSILON
    && distance >= minReach - tolerance
    && distance <= maxReach + tolerance;
  const span = Math.max(EPSILON, maxReach - minReach);
  const clamped = reachable
    ? clamp(distance, minReach, maxReach)
    : clamp(distance, minReach + span * 1e-4, maxReach - span * 1e-4);

  const alphaCosine = (upper * upper + clamped * clamped - lower * lower) / (2 * upper * clamped);
  const gammaCosine = (upper * upper + lower * lower - clamped * clamped) / (2 * upper * lower);
  const alpha = Math.acos(clamp(alphaCosine, -1, 1));
  const gamma = Math.acos(clamp(gammaCosine, -1, 1));
  const base = Math.atan2(upOffset, forwardOffset);
  const hipAngle = base + bendSign * alpha;
  const kneeForward = Math.cos(hipAngle) * upper;
  const kneeUp = Math.sin(hipAngle) * upper;

  return {
    reachable,
    hipAngle,
    kneeAngle: gamma,
    knee: {
      x: hipPoint.x + heading.x * kneeForward,
      y: hipPoint.y + kneeUp,
      z: hipPoint.z + heading.z * kneeForward,
      fwd: kneeForward,
      up: kneeUp,
    },
  };
}

/**
 * Creates a pure AT-AT machine: gait, turret, damage zones, tow cable and
 * toppling. The caller owns the rendered mesh and applies the returned
 * `move` delta to it.
 *
 * @param {object} [options]
 * @param {string} [options.variant] 'assault' (default) or 'arcade'
 * @param {number} [options.seed] deterministic seed for the shot spread
 * @param {object} [options.stats] overrides for any default number, plus an
 *   optional `position` ({x, y, z} in world metres) used as the spawn point
 * @returns {object} the machine controller
 */
export function createAtAtUnit({ variant = 'assault', seed = 1, stats = {} } = {}) {
  const variantKey = Object.hasOwn(VARIANTS, variant) ? variant : 'assault';
  const variantStats = VARIANTS[variantKey];
  const overrides = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
  const random = createRandom(seed);

  const config = {
    health: minimum(overrides.health, variantStats.health, 1),
    speed: Math.max(0, numberOr(overrides.speed, variantStats.speed)),
    stepDuration: minimum(overrides.stepDuration, AT_AT_DEFAULTS.stepDuration, 0.05),
    legUpper: minimum(overrides.legUpper, AT_AT_DEFAULTS.legUpper, 0.01),
    legLower: minimum(overrides.legLower, AT_AT_DEFAULTS.legLower, 0.01),
    telegraph: Math.max(0, numberOr(overrides.telegraph, AT_AT_DEFAULTS.telegraph)),
    shellSpeed: Math.max(0, numberOr(overrides.shellSpeed, AT_AT_DEFAULTS.shellSpeed)),
    shellFlight: Math.max(0, numberOr(overrides.shellFlight, AT_AT_DEFAULTS.shellFlight)),
    shellDamage: Math.max(0, numberOr(overrides.shellDamage, AT_AT_DEFAULTS.shellDamage)),
    shellSplash: Math.max(0, numberOr(overrides.shellSplash, AT_AT_DEFAULTS.shellSplash)),
    scale: minimum(overrides.scale, AT_AT_DEFAULTS.scale, 0.01),
    hipHeight: Math.max(0, numberOr(overrides.hipHeight, AT_AT_DEFAULTS.hipHeight)),
    lift: Math.max(0, numberOr(overrides.lift, AT_AT_DEFAULTS.lift)),
    turretHeight: Math.max(0, numberOr(overrides.turretHeight, AT_AT_DEFAULTS.turretHeight)),
    turretForward: numberOr(overrides.turretForward, AT_AT_DEFAULTS.turretForward),
    legSpacing: Math.max(0, numberOr(overrides.legSpacing, AT_AT_DEFAULTS.legSpacing)),
    legBase: numberOr(overrides.legBase, AT_AT_DEFAULTS.legBase),
    tipDuration: Math.max(0, numberOr(overrides.tipDuration, AT_AT_DEFAULTS.tipDuration)),
    fallDuration: Math.max(0, numberOr(overrides.fallDuration, AT_AT_DEFAULTS.fallDuration)),
  };
  const collapseDuration = config.tipDuration + config.fallDuration;
  const maxHealth = config.health;

  let health = maxHealth;
  let destroyed = false;
  let position = readPoint(overrides.position) ?? { x: 0, y: 0, z: 0 };
  let heading = { x: 0, z: -1 };
  let cycleTime = 0;
  let legs = [];
  let charge = 0;
  let cooldown = 0;
  let lastFire = null;
  let lastPart = 'armor';
  let cabled = false;
  let cablePart = null;
  let collapseTime = -1;
  let collapseImpact = false;
  let targetId = 'player';
  let aim = { x: 0, y: 0, z: -1 };

  /** Hip joint of a leg in world metres. */
  const hipPosition = leg => {
    const right = rightVector(heading);
    const forwardOffset = leg.front * config.legBase * config.scale;
    const sideOffset = leg.side * config.legSpacing * config.scale;
    return {
      x: position.x + heading.x * forwardOffset + right.x * sideOffset,
      y: position.y + config.hipHeight * config.scale,
      z: position.z + heading.z * forwardOffset + right.z * sideOffset,
    };
  };

  /** Distance the hull covers during one full step cycle. */
  const strideLength = () => config.speed * config.stepDuration;

  /** Interpolates the swinging foot along its arc. */
  const swingFoot = leg => {
    const progress = clamp(leg.progress, 0, 1);
    const lift = Math.sin(progress * Math.PI) * config.lift * config.scale;
    return {
      x: leg.liftFrom.x + (leg.liftTo.x - leg.liftFrom.x) * progress,
      y: leg.liftFrom.y + (leg.liftTo.y - leg.liftFrom.y) * progress + lift,
      z: leg.liftFrom.z + (leg.liftTo.z - leg.liftFrom.z) * progress,
    };
  };

  /** Places every foot for the current cycle position so the gait starts clean. */
  const resetLegs = () => {
    const stride = strideLength();
    const right = rightVector(heading);
    legs = LEG_DEFINITIONS.map((definition, index) => {
      const cycleOffset = definition.phase / (Math.PI * 2);
      const forwardOffset = definition.front * config.legBase * config.scale;
      const sideOffset = definition.side * config.legSpacing * config.scale;
      const leg = {
        index,
        id: definition.id,
        phase: definition.phase,
        phaseOffset: cycleOffset,
        side: definition.side,
        front: definition.front,
        bend: definition.bend,
        planted: true,
        progress: 0,
        foot: { x: 0, y: 0, z: 0 },
        liftFrom: { x: 0, y: 0, z: 0 },
        liftTo: { x: 0, y: 0, z: 0 },
      };
      if (cycleOffset < 0.5) {
        // Mid swing: the foot already left the snow and travels forward.
        const startX = position.x + heading.x * (forwardOffset - stride * cycleOffset) + right.x * sideOffset;
        const startZ = position.z + heading.z * (forwardOffset - stride * cycleOffset) + right.z * sideOffset;
        leg.planted = false;
        leg.progress = cycleOffset * 2;
        leg.liftFrom = { x: startX, y: position.y, z: startZ };
        leg.liftTo = {
          x: startX + heading.x * stride,
          y: position.y,
          z: startZ + heading.z * stride,
        };
        leg.foot = swingFoot(leg);
      } else {
        // Stance: the foot is planted in the snow and does not slide.
        const plantedForward = forwardOffset + stride * (1 - cycleOffset);
        leg.foot = {
          x: position.x + heading.x * plantedForward + right.x * sideOffset,
          y: position.y,
          z: position.z + heading.z * plantedForward + right.z * sideOffset,
        };
      }
      return leg;
    });
  };

  /** Advances the step cycle: stance feet stay planted, swing feet arc forward. */
  const advanceGait = step => {
    if (step <= 0) return;
    cycleTime += step;
    const cycle = config.stepDuration;
    const stride = strideLength();
    for (const leg of legs) {
      const local = ((cycleTime / cycle) + leg.phaseOffset) % 1;
      leg.local = local;
      if (!leg.planted) {
        if (local >= 0.5) {
          leg.planted = true;
          leg.progress = 1;
          leg.foot = { ...leg.liftTo };
        } else {
          leg.progress = local * 2;
          leg.foot = swingFoot(leg);
        }
      } else if (local < 0.5) {
        leg.planted = false;
        leg.progress = 0;
        leg.liftFrom = { ...leg.foot };
        leg.liftTo = {
          x: leg.foot.x + heading.x * stride,
          y: leg.foot.y,
          z: leg.foot.z + heading.z * stride,
        };
        leg.foot = swingFoot(leg);
      }
    }
  };

  /** Turret muzzle in world metres. */
  const turretPosition = () => ({
    x: position.x + heading.x * config.turretForward * config.scale,
    y: position.y + config.turretHeight * config.scale,
    z: position.z + heading.z * config.turretForward * config.scale,
  });

  /** Slight deterministic spread so two machines never fire identically. */
  const spreadDirection = direction => {
    const angle = (random() - 0.5) * 0.021;
    const side = normalize3(direction.z, 0, -direction.x)
      ?? { x: 1, y: 0, z: 0 };
    const vertical = normalize3(
      side.z * direction.y - side.y * direction.z,
      side.x * direction.z - side.z * direction.x,
      side.y * direction.x - side.x * direction.y,
    ) ?? { x: 0, y: 1, z: 0 };
    const offset = normalize3(
      direction.x + (side.x * Math.cos(angle) + vertical.x * Math.sin(angle)) * 0.01,
      direction.y + (side.y * Math.cos(angle) + vertical.y * Math.sin(angle)) * 0.01,
      direction.z + (side.z * Math.cos(angle) + vertical.z * Math.sin(angle)) * 0.01,
    );
    return offset ?? direction;
  };

  /** Builds the shell payload released by the turret. */
  const createShell = origin => {
    const direction = spreadDirection(aim);
    return {
      position: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      speed: config.shellSpeed,
      damage: config.shellDamage,
      flightTime: config.shellFlight,
    };
  };

  /** Coarse machine state shared by the snapshot and the phase reporting. */
  const basePhase = () => {
    if (destroyed || health <= 0) return 'down';
    if (collapseTime >= 0) return collapseTime >= collapseDuration ? 'down' : 'falling';
    if (cabled) return 'cabled';
    return 'advance';
  };

  /**
   * Advances the machine by one frame.
   *
   * @param {number} dt frame delta in seconds
   * @param {object} [context]
   * @param {{x: number, y: number, z: number}} [context.playerPosition] player target
   * @param {{x: number, y: number, z: number}} [context.basePosition] rebel base target
   * @param {string} [context.targetId] identifier of the current target
   * @param {{x: number, y: number, z: number}} [context.position] optional world
   *   position of the hull, used to keep the internal march in sync
   * @returns {{move: {x: number, z: number}, aim: {x: number, y: number, z: number}, fire: object|null, phase: string}}
   *   `move` is the ground velocity in metres per second, so the renderer can
   *   advance the hull with `position += move * dt`.
   */
  function update(dt, context = {}) {
    const step = clampDelta(dt);
    const settings = context && typeof context === 'object' ? context : {};
    const player = readPoint(settings.playerPosition);
    const base = readPoint(settings.basePosition);
    const hull = readPoint(settings.position);
    const requestedTarget = settings.targetId != null ? String(settings.targetId) : 'player';

    if (hull) {
      position.x = hull.x;
      position.y = hull.y;
      position.z = hull.z;
    }

    let move = { x: 0, z: 0 };
    let fire = null;
    let phase = basePhase();

    if (phase === 'advance') {
      if (base) {
        const deltaX = base.x - position.x;
        const deltaZ = base.z - position.z;
        const direction = normalize2(deltaX, deltaZ);
        if (direction) {
          heading = direction;
          const distance = Math.hypot(deltaX, deltaZ);
          const travel = Math.min(config.speed * step, Math.max(0, distance - ARRIVAL_EPSILON));
          const velocity = step > 0 ? travel / step : config.speed;
          move = { x: heading.x * velocity, z: heading.z * velocity };
          position.x += move.x * step;
          position.z += move.z * step;
        }
      }

      advanceGait(step);

      const target = player ?? base ?? null;
      const turret = turretPosition();
      if (target) {
        const direction = normalize3(target.x - turret.x, target.y - turret.y, target.z - turret.z);
        if (direction) aim = direction;
      } else {
        aim = { x: heading.x, y: 0, z: heading.z };
      }

      if (requestedTarget !== targetId) {
        targetId = requestedTarget;
        charge = 0;
      }

      if (cooldown > 0) {
        cooldown = Math.max(0, cooldown - step);
      } else if (target) {
        charge += step;
        if (charge >= config.telegraph) {
          charge = 0;
          cooldown = config.shellFlight;
          fire = createShell(turret);
          lastFire = fire;
          phase = 'fire';
        } else {
          phase = 'telegraph';
        }
      } else {
        charge = 0;
      }
    } else if (phase === 'cabled') {
      advanceGait(step);
    }

    return { move, aim: { x: aim.x, y: aim.y, z: aim.z }, fire, phase };
  }

  /**
   * Applies a hit to a specific zone of the machine.
   *
   * @param {number} amount raw damage of the shot
   * @param {object} [options]
   * @param {string} [options.part] 'armor', 'leg', 'turret', 'rear' or 'body'
   * @returns {{applied: number, blocked: boolean, part: string, health: number}}
   */
  function applyDamage(amount, { part = 'armor' } = {}) {
    const raw = Math.max(0, numberOr(amount, 0));
    const resolved = Object.hasOwn(AT_AT_PART_MULTIPLIERS, part) ? part : 'armor';
    const multiplier = AT_AT_PART_MULTIPLIERS[resolved];
    const applied = raw * multiplier;
    const blocked = multiplier <= 0.1;
    if (applied > 0) health = Math.max(0, health - applied);
    lastPart = resolved;
    if (health <= 0) destroyed = true;
    return { applied, blocked, part: resolved, health };
  }

  /**
   * Fixes the tow cable around a leg. Only a living machine can be tethered
   * and only once; after that the turret stops firing.
   *
   * @param {string} [part] the body part the cable is wrapped around
   * @returns {boolean} true when the cable was attached
   */
  function attachTowCable(part = 'leg') {
    if (destroyed || health <= 0 || cabled) return false;
    cabled = true;
    cablePart = part != null ? String(part) : 'leg';
    charge = 0;
    return true;
  }

  /**
   * Advances the toppling sequence: the hull rotates around the tethered leg
   * (`tip`), then the body falls (`fall`) and hits the snow (`down`).
   *
   * @param {number} dt frame delta in seconds
   * @returns {{progress: number, phase: string, impact: boolean}} `impact` is
   *   true on the single frame where the hull hits the ground
   */
  function collapse(dt) {
    const step = clampDelta(dt);
    if (collapseTime < 0) collapseTime = 0;
    let impact = false;
    if (collapseTime < collapseDuration) {
      collapseTime = Math.min(collapseDuration, collapseTime + step);
      if (collapseTime >= collapseDuration) {
        impact = true;
        collapseImpact = true;
        charge = 0;
      }
    }
    const phase = collapseTime >= collapseDuration
      ? 'down'
      : collapseTime < config.tipDuration ? 'tip' : 'fall';
    return {
      progress: collapseDuration > 0 ? clamp(collapseTime / collapseDuration, 0, 1) : 1,
      phase,
      impact,
    };
  }

  /** Current pose of the four legs, ready to be applied to the mesh. */
  function getLegPoses() {
    return legs.map(leg => {
      const hip = hipPosition(leg);
      const right = rightVector(heading);
      const deltaX = leg.foot.x - hip.x;
      const deltaY = leg.foot.y - hip.y;
      const deltaZ = leg.foot.z - hip.z;
      const localFoot = {
        x: (deltaX * heading.x + deltaZ * heading.z) / config.scale,
        y: deltaY / config.scale,
        z: (deltaX * right.x + deltaZ * right.z) / config.scale,
      };
      const pose = solveLegPose({
        hip: { x: 0, y: 0, z: 0 },
        foot: localFoot,
        upperLength: config.legUpper,
        lowerLength: config.legLower,
        bend: leg.bend,
        forward: { x: 1, y: 0, z: 0 },
      });
      return {
        index: leg.index,
        id: leg.id,
        phase: Number.isFinite(leg.local) ? leg.local : leg.phaseOffset,
        planted: leg.planted,
        progress: leg.progress,
        hip,
        foot: { ...leg.foot },
        pose: {
          reachable: pose.reachable,
          hipAngle: pose.hipAngle,
          kneeAngle: pose.kneeAngle,
          knee: {
            x: hip.x + heading.x * pose.knee.fwd * config.scale,
            y: hip.y + pose.knee.up * config.scale,
            z: hip.z + heading.z * pose.knee.fwd * config.scale,
          },
        },
      };
    });
  }

  /** Machine position in world metres. */
  const getPosition = () => ({ x: position.x, y: position.y, z: position.z });

  /** Resolved numbers of this machine, useful for HUD and integration. */
  const getStats = () => ({
    variant: variantKey,
    seed: numberOr(seed, 1),
    ...config,
    collapseDuration,
    stride: strideLength(),
    targetId,
    cablePart,
    collapsing: collapseTime >= 0 && collapseTime < collapseDuration,
    impacted: collapseImpact,
  });

  /** Full machine state snapshot. */
  function getSnapshot() {
    return {
      health,
      maxHealth,
      part: lastPart,
      phase: basePhase(),
      cabled,
      stepPhase: (cycleTime / config.stepDuration) % 1,
      aim: { x: aim.x, y: aim.y, z: aim.z },
      fire: lastFire ? { ...lastFire, position: { ...lastFire.position }, direction: { ...lastFire.direction } } : null,
      speed: config.speed,
    };
  }

  /** Restores the machine to its freshly created state. */
  function reset() {
    health = maxHealth;
    destroyed = false;
    position = readPoint(overrides.position) ?? { x: 0, y: 0, z: 0 };
    heading = { x: 0, z: -1 };
    cycleTime = 0;
    charge = 0;
    cooldown = 0;
    lastFire = null;
    lastPart = 'armor';
    cabled = false;
    cablePart = null;
    collapseTime = -1;
    collapseImpact = false;
    targetId = 'player';
    aim = { x: 0, y: 0, z: -1 };
    resetLegs();
  }

  reset();

  return {
    update,
    applyDamage,
    attachTowCable,
    collapse,
    getLegPoses,
    getPosition,
    getStats,
    getSnapshot,
    reset,
    get isCabled() {
      return cabled;
    },
  };
}
