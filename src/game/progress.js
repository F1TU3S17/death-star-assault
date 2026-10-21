// Durable sortie progress: accumulates run statistics across sessions in
// localStorage and degrades silently to memory-only mode when storage is
// unavailable or broken. Kept pure and synchronous so tests can drive it with
// a fake storage backend.

const KEY = 'death-star-assault:progress';
export const VERSION = 1;

function freshProgress() {
  return {
    version: VERSION,
    runCount: 0,
    victoryCount: 0,
    bestScore: 0,
    bestAccuracy: null,
    perMission: {},
    last: null,
  };
}

function freshMissionStats() {
  return { bestScore: 0, bestTime: null, bestKills: 0, victories: 0 };
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function createProgress({ storage = null, key = KEY } = {}) {
  // Accept any { getItem, setItem, removeItem } surface (same as localStorage).
  // When omitted, probe globalThis.localStorage inside try/catch — browsers may
  // throw on access (privacy mode). If nothing works, stay memory-only.
  let backing = storage;
  if (!backing) {
    try {
      backing = globalThis.localStorage || null;
    } catch {
      /* Storage is optional. */
      backing = null;
    }
  }

  if (backing && typeof backing.getItem !== 'function') backing = null;
  if (backing && typeof backing.setItem !== 'function') backing = null;

  let progress = null;
  let stored = null;
  try {
    stored = backing ? backing.getItem(key) : null;
  } catch {
    /* Storage is optional. */
    backing = null;
  }
  if (typeof stored === 'string' && stored.length > 0) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.version === VERSION) {
        progress = {
          ...freshProgress(),
          ...parsed,
          perMission: { ...parsed.perMission },
        };
      }
    } catch {
      progress = null; // Corrupt payload: fall through to fresh defaults.
    }
  }

  function save() {
    if (!backing) return;
    try {
      backing.setItem(key, JSON.stringify(progress));
    } catch {
      /* Storage is optional. */
    }
  }

  if (!progress) progress = freshProgress();

  // Missing numeric fields default to 0; non-finite values count as missing.
  // accuracy = hits / shots, but only when shots were actually fired.
  function recordSortie({ victory = false, missionId = '', score = 0, elapsed = 0, kills = 0, shots = 0, hits = 0 } = {}) {
    const entry = {
      victory: Boolean(victory),
      missionId: typeof missionId === 'string' ? missionId : String(missionId),
      score: Number.isFinite(score) ? score : 0,
      elapsed: Number.isFinite(elapsed) ? elapsed : 0,
      kills: Number.isFinite(kills) ? kills : 0,
      shots: Number.isFinite(shots) ? shots : 0,
      hits: Number.isFinite(hits) ? hits : 0,
    };
    const accuracy = entry.shots > 0 ? round3(entry.hits / entry.shots) : null;

    progress.runCount += 1;
    if (entry.victory) progress.victoryCount += 1;
    progress.bestScore = Math.max(progress.bestScore, entry.score);
    if (accuracy !== null) {
      progress.bestAccuracy = progress.bestAccuracy === null
        ? accuracy
        : Math.max(progress.bestAccuracy, accuracy);
    }

    const id = entry.missionId;
    if (!progress.perMission[id] || typeof progress.perMission[id] !== 'object') {
      progress.perMission[id] = freshMissionStats();
    }
    const mission = progress.perMission[id];
    mission.bestScore = Math.max(mission.bestScore, entry.score);
    mission.bestKills = Math.max(mission.bestKills, entry.kills);
    // Best time is a victory-only record: defeats never set or overwrite it.
    if (entry.victory) {
      if (mission.bestTime === null || entry.elapsed < mission.bestTime) {
        mission.bestTime = entry.elapsed;
      }
      mission.victories += 1;
    }

    progress.last = {
      victory: entry.victory,
      missionId: entry.missionId,
      score: entry.score,
      elapsed: entry.elapsed,
      kills: entry.kills,
      accuracy,
    };

    save();
    return { ...progress, perMission: { ...progress.perMission } };
  }

  return {
    version: VERSION,
    get() {
      return {
        ...progress,
        perMission: { ...progress.perMission },
      };
    },
    record(entry) {
      return recordSortie(entry || {});
    },
    recordSortie,
    reset() {
      progress = freshProgress();
      if (backing) {
        try {
          backing.removeItem(key);
        } catch {
          /* Storage is optional. */
        }
      }
      return progress;
    },
  };
}
