const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const HANDLING = {
  xwing: { acceleration: 2.8, braking: 4.5, grip: 5.2, coastGrip: 1.65 },
  ywing: { acceleration: 1.55, braking: 2.8, grip: 3.5, coastGrip: 1.1 },
};

export function createFlightState() {
  return { velocity: { x: 0, y: 0, z: 0 }, speed: 0, throttleSpeed: 0, slip: 0, turnAuthority: .58, drifting: false };
}

/** Teleports and mission changes must not carry momentum from the previous set. */
export function resetFlightState(state, heading = { x: 0, y: 0, z: -1 }, speed = 0) {
  const length = Math.hypot(heading.x, heading.y, heading.z) || 1;
  state.speed = state.throttleSpeed = Math.max(0, speed);
  state.velocity.x = heading.x / length * state.speed;
  state.velocity.y = heading.y / length * state.speed;
  state.velocity.z = heading.z / length * state.speed;
  state.slip = 0;
  state.turnAuthority = .58;
  state.drifting = false;
  return state;
}

/** A deliberate mid-throttle sweet spot rewards braking into a dogfight turn. */
export function getFlightTurnAuthority(speed, cruiseSpeed) {
  const ratio = Math.max(0, speed) / Math.max(1, cruiseSpeed);
  return ratio <= .7
    ? .58 + ratio / .7 * .6
    : clamp(1.18 - (ratio - .7) * .72, .48, 1.18);
}

/** Inertial arcade flight: heading changes immediately, momentum catches up. */
export function stepFlight(state, { dt, heading, stats, power = { speed: 1, boost: 1 }, boosting = false, braking = false, turning = false, trench = false, active = true }) {
  if (!active || !Number.isFinite(dt) || dt <= 0) return state;
  dt = Math.min(.05, dt);
  const handling = HANDLING[stats.id] || HANDLING.xwing;
  const cruiseSpeed = stats.speed * power.speed;
  const targetSpeed = braking ? cruiseSpeed * .42 : boosting ? stats.boostSpeed * power.boost : cruiseSpeed;
  const response = targetSpeed < state.throttleSpeed ? handling.braking : handling.acceleration;
  state.throttleSpeed += (targetSpeed - state.throttleSpeed) * (1 - Math.exp(-response * dt));
  let hx = heading.x;
  let hy = heading.y;
  let hz = heading.z;
  if (trench) {
    // The final run remains a forward route. Aiming off-axis cannot strand the
    // ship facing an already passed gate or preserve drift into a canyon wall.
    hx = clamp(hx, -.62, .62);
    hy = clamp(hy, -.62, .62);
    hz = Math.min(-.62, hz);
  }
  const length = Math.hypot(hx, hy, hz) || 1;
  hx /= length; hy /= length; hz /= length;
  state.drifting = braking && turning && !trench;
  const grip = trench ? 10 : state.drifting ? handling.coastGrip : boosting ? handling.grip * 1.12 : handling.grip;
  const blend = 1 - Math.exp(-grip * dt);
  state.velocity.x += (hx * state.throttleSpeed - state.velocity.x) * blend;
  state.velocity.y += (hy * state.throttleSpeed - state.velocity.y) * blend;
  state.velocity.z += (hz * state.throttleSpeed - state.velocity.z) * blend;
  state.speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z);
  const alignment = state.speed > .01 ? clamp((hx * state.velocity.x + hy * state.velocity.y + hz * state.velocity.z) / state.speed, -1, 1) : 1;
  state.slip = Math.acos(alignment);
  state.turnAuthority = getFlightTurnAuthority(state.speed, cruiseSpeed);
  return state;
}
