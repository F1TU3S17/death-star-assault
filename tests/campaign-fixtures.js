import assert from 'node:assert/strict';

/** State-machine fixtures, independent of the number/order of configured mission beats. */
export function completeCampaignMission(campaign) {
  const state = campaign.getSnapshot();
  const events = {
    combat: () => campaign.recordKill('tie'),
    surface: () => campaign.recordKill('turret'),
    escort: () => campaign.recordEscortCheckpoint(),
    defend: () => campaign.recordKill('tie'),
    trench: () => campaign.recordCheckpoint(),
  };
  assert.ok(events[state.phase], `No objective fixture for ${state.phase}`);
  for (let i = state.progress; i < state.target; i++) events[state.phase]();
}

export function reachQte(campaign) {
  for (let guard = 0; guard < 12 && campaign.getSnapshot().phase !== 'qte'; guard++) completeCampaignMission(campaign);
  assert.equal(campaign.getSnapshot().phase, 'qte');
}

export function engineReachPhase(debug, phase) {
  for (let guard = 0; guard < 12 && debug.snapshot().phase !== phase; guard++) debug.advanceMission();
  assert.equal(debug.snapshot().phase, phase);
}
