import { interceptPoint } from './enemy-ai.js';
import { insideLockCone } from './simulation.js';

export const TORPEDO_LOCK_SECONDS = 1.7;

export function isLockCandidate({ origin, forward, targetPosition, minDot = .94, maxRange = 1700, visible = true, alive = true, phase = 'combat' }) {
  return Boolean(alive && visible && insideLockCone(origin, forward, targetPosition, minDot, maxRange)
    && stationLineOfSight(origin, targetPosition, phase));
}

/** A lock belongs to one entity. Brief losses decay progress, but never permit guidance. */
export function createTargetLock(duration = TORPEDO_LOCK_SECONDS, decayRate = 1.5) {
  duration = Number.isFinite(duration) && duration > 0 ? duration : TORPEDO_LOCK_SECONDS;
  decayRate = Number.isFinite(decayRate) && decayRate > 0 ? decayRate : 1.5;
  let targetId = null;
  let elapsed = 0;
  let tracking = false;
  const snapshot = () => ({
    targetId, elapsed, duration, progress: Math.min(1, elapsed / duration), tracking,
    acquired: tracking && elapsed + 1e-8 >= duration,
    status: !targetId ? 'searching' : !tracking ? 'losing' : elapsed + 1e-8 >= duration ? 'locked' : 'acquiring',
  });
  const reset = () => { targetId = null; elapsed = 0; tracking = false; return snapshot(); };
  return {
    reset,
    snapshot,
    invalidate(id) { return id === targetId ? reset() : snapshot(); },
    update(candidateId, delta, { enabled = true, paused = false } = {}) {
      if (paused) return snapshot();
      if (!enabled) return reset();
      const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
      tracking = candidateId !== null && candidateId !== undefined && candidateId !== '';
      if (!tracking) {
        elapsed = Math.max(0, elapsed - dt * decayRate);
        if (elapsed < 1e-8) return reset();
        return snapshot();
      }
      if (candidateId !== targetId) { targetId = candidateId; elapsed = 0; }
      elapsed = Math.min(duration, elapsed + dt);
      if (elapsed + 1e-8 >= duration) elapsed = duration;
      return snapshot();
    },
  };
}

/** A visual aiming solution only. The projectile must still use the player's firing axis. */
export function getLeadSolution({ origin, targetPosition, targetVelocity = { x: 0, y: 0, z: 0 }, projectileSpeed = 670, maxLead = 2.2 }) {
  const point = interceptPoint(origin, targetPosition, targetVelocity, projectileSpeed, maxLead);
  const offset = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
  const distance = Math.hypot(offset.x, offset.y, offset.z);
  return {
    point,
    direction: distance > 1e-8 ? { x: offset.x / distance, y: offset.y / distance, z: offset.z / distance } : { x: 0, y: 0, z: -1 },
    distance,
  };
}

/** Analytic station cover checks avoid raycasting the station's thousands of detail instances. */
export function stationLineOfSight(origin, target, phase) {
  if (!['surface', 'escort', 'assault', 'defend', 'trench'].includes(phase)) return true;
  if (origin.y < -148 || target.y < -148) return false;
  if (phase !== 'trench') return true;
  const low = Math.min(origin.y, target.y);
  if (low >= 70) return true;
  // Below the trench lip, either endpoint outside the clear corridor is behind a wall.
  if ((origin.y < 70 && Math.abs(origin.x) > 81) || (target.y < 70 && Math.abs(target.x) > 81)) return false;
  // A segment crossing the lip must enter through the open channel, not through a wall.
  if ((origin.y < 70) !== (target.y < 70)) {
    const t = (70 - origin.y) / (target.y - origin.y);
    if (Math.abs(origin.x + (target.x - origin.x) * t) > 81) return false;
  }
  return true;
}
