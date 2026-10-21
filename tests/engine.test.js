import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { engineHarness } from './engine-harness.js';
import { engineReachPhase } from './campaign-fixtures.js';
import { lethalImpact } from '../src/game/simulation.js';

test('actual engine flies, turns, fires, changes camera, pauses and freezes cooldowns', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    assert.equal(game.getSnapshot().mode, 'menu');
    game.start();
    debug.step(2);
    assert.ok(game.getSnapshot().position.z < 700);
    assert.ok(game.getSnapshot().speed > 90);
    fixture.key('ShiftLeft');
    debug.step(2);
    fixture.key('ShiftLeft', false);
    assert.ok(game.getSnapshot().speed > 150);
    fixture.key('KeyA');
    debug.step(0.5);
    fixture.key('KeyA', false);
    assert.ok(game.getSnapshot().position.x < 0);
    fixture.key('Space');
    for (let frame = 0; frame < 40 && !debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'); frame++) debug.step(0.025);
    fixture.key('Space', false);
    assert.ok(debug.inspect().projectileDetails.some(projectile => projectile.owner === 'player'));
    fixture.key('KeyC'); fixture.key('KeyC', false);
    assert.equal(game.getSnapshot().camera, 'cockpit');
    assert.equal(game.useAbility(), true);
    assert.equal(game.useAbility(), false);
    game.pause();
    const paused = game.getSnapshot();
    debug.step(20);
    assert.deepEqual(game.getSnapshot().position, paused.position);
    assert.equal(game.getSnapshot().elapsed, paused.elapsed);
    assert.equal(game.getSnapshot().abilityCooldown, paused.abilityCooldown);
    game.resume();
    assert.equal(game.getSnapshot().mode, 'playing');
    const before = game.getSnapshot().elapsed;
    fixture.frame(100);
    assert.ok(game.getSnapshot().elapsed - before <= 0.051);
    fixture.window.dispatch('blur');
    assert.equal(game.getSnapshot().mode, 'paused');
  } finally { fixture.close(); }
});

test('shield power allocation changes actual regeneration rather than only the displayed profile', async () => {
  const restored = {};
  for (const power of ['balanced', 'engines', 'shields']) {
    const fixture = await engineHarness();
    try {
      const { game, debug } = fixture;
      game.start();
      // Isolate regeneration from incoming fire without changing resources outside the damage API.
      fixture.player().position.set(0, 1800, 600);
      debug.damage(50);
      game.setPowerMode(power);
      debug.step(8);
      restored[power] = game.getSnapshot().shields;
    } finally { fixture.close(); }
  }
  assert.ok(restored.shields > restored.balanced, JSON.stringify(restored));
  assert.ok(restored.engines < restored.balanced, JSON.stringify(restored));
});

test('QTE pause, wrong input, timeout defeat, final shot and Y-wing restart remain consistent', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'ywing' });
    // FSM fixtures only: physical mission completion is exercised independently below.
    engineReachPhase(debug, 'qte');
    assert.equal(game.getSnapshot().mode, 'qte');
    assert.equal(game.getSnapshot().shipId, 'xwing');
    game.pause();
    debug.step(20);
    assert.equal(game.submitQte('KeyA'), false);
    game.resume();
    assert.equal(game.getSnapshot().qte.remaining, 2);
    assert.equal(game.submitQte('KeyA'), true);
    assert.equal(game.submitQte('Space'), false);
    assert.equal(game.getSnapshot().qte.key, 'KeyA');
    assert.equal(game.getSnapshot().qte.totalRemaining, 34);
    debug.step(30);
    assert.equal(game.getSnapshot().mode, 'defeat');
    game.restart();
    assert.equal(game.getSnapshot().shipId, 'ywing');
    assert.equal(game.getSnapshot().phase, 'combat');
    assert.equal(game.getSnapshot().kills, 0);
    assert.equal(game.getSnapshot().health, 100);
    engineReachPhase(debug, 'qte');
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'Space']) { fixture.key(code); fixture.key(code, false); }
    assert.equal(game.getSnapshot().mode, 'cinematic');
    game.pause(); debug.step(20); game.resume();
    assert.equal(game.getSnapshot().mode, 'cinematic');
    debug.step(12.1);
    assert.equal(game.getSnapshot().mode, 'victory');
    assert.equal(fixture.events.filter(event => event.type === 'victory').length, 1);
    game.restart();
    assert.equal(game.getSnapshot().shipId, 'ywing');
    game.returnToMenu();
    game.selectShip('xwing');
    assert.equal(game.getSnapshot().mode, 'menu');
    assert.equal(game.getSnapshot().shipId, 'xwing');
  } finally { fixture.close(); }
});

test('combat damage uses shields, focused defense, fatal defeat and clean restart resources', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    debug.damage(100);
    assert.equal(game.getSnapshot().shields, 0);
    assert.equal(game.getSnapshot().health, 100);
    game.pause();
    debug.damage(1000);
    assert.equal(game.getSnapshot().health, 100);
    game.resume();
    assert.equal(game.useAbility(), true);
    assert.equal(game.getSnapshot().shields, 40);
    debug.damage(100);
    assert.equal(game.getSnapshot().health, 85);
    assert.equal(game.getSnapshot().shields, 0);
    debug.damage(1000);
    assert.equal(game.getSnapshot().mode, 'defeat');
    assert.equal(game.getSnapshot().health, 0);
    assert.equal(fixture.events.filter(event => event.type === 'defeat').length, 1);
    game.restart();
    assert.equal(game.getSnapshot().health, 100);
    assert.equal(game.getSnapshot().shields, 100);
    assert.equal(game.getSnapshot().abilityCooldown, 0);
    assert.equal(game.getSnapshot().heat, 0);
  } finally { fixture.close(); }
});

test('Y-wing ion equipment temporarily stuns an enemy in front within range', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'ywing' });
    debug.step(2.5);
    assert.equal(game.useAbility(), true);
    assert.ok(debug.inspect().enemies.some(enemy => enemy.stunned > 4.9));
    assert.equal(game.useAbility(), false);
    assert.ok(game.getSnapshot().abilityCooldown > 15);
  } finally { fixture.close(); }
});

test('R reloads torpedoes from finite reserves, continues after weapon switching and freezes while paused', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); game.selectWeapon('proton-torpedo');
    const initial = game.getSnapshot().weapon;
    assert.equal(game.reloadWeapon(), false, 'A full launcher must not consume reserves');
    fixture.key('Space'); debug.step(0.025); fixture.key('Space', false);
    assert.equal(game.getSnapshot().weapon.ammo, initial.ammo - 1);
    fixture.key('KeyR'); fixture.key('KeyR', false);
    assert.equal(game.getSnapshot().weapon.reloading, true);
    assert.equal(game.reloadWeapon(), false, 'Repeated reload cannot restart or duplicate the transaction');
    game.selectWeapon('laser');
    debug.step(1);
    const reloading = game.getSnapshot().weapons.find(weapon => weapon.id === 'proton-torpedo');
    assert.ok(reloading.reloading && reloading.reloadRemaining < initial.reloadDuration);
    game.pause(); debug.step(10);
    assert.equal(game.reloadWeapon(), false);
    assert.deepEqual(game.getSnapshot().weapons.find(weapon => weapon.id === 'proton-torpedo'), reloading);
    game.resume(); debug.step(3.6);
    const loaded = game.getSnapshot().weapons.find(weapon => weapon.id === 'proton-torpedo');
    assert.equal(game.getSnapshot().weapon.id, 'laser', 'A background reload must not force a weapon change');
    assert.equal(loaded.reloading, false);
    assert.equal(loaded.ammo, initial.ammo);
    assert.equal(loaded.reserve, initial.reserve - 1);
    assert.equal(loaded.ammo + loaded.reserve, initial.ammo + initial.reserve - 1);
    game.restart(); game.selectWeapon('proton-torpedo');
    assert.equal(game.getSnapshot().weapon.ammo, initial.ammo);
    assert.equal(game.getSnapshot().weapon.reserve, initial.reserve);
    assert.equal(game.getSnapshot().weapon.reloading, false);
  } finally { fixture.close(); }
});

test('physical relay hits complete only the optional objective and strengthen the escort fleet', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'surface');
    const batteries = debug.inspect().enemies.filter(enemy => enemy.kind === 'turret');
    const light = batteries.find(enemy => enemy.variant === 'light');
    const heavy = batteries.find(enemy => enemy.variant === 'heavy');
    assert.ok(light?.health > 0 && heavy?.health > light.health);
    fixture.key('ControlLeft'); fixture.key('Space');
    for (let index = 0; index < 2; index++) {
      const relay = debug.inspect().enemies.find(enemy => enemy.kind === 'relay');
      // This is a targeted collision fixture; the full campaign test below uses only flight inputs.
      fixture.player().position.set(relay.position[0], relay.position[1] + 60, relay.position[2] + 200);
      for (let frame = 0; frame < 120 && debug.inspect().enemies.some(enemy => enemy.kind === 'relay' && enemy.position.join() === relay.position.join()); frame++) {
        const direction = new THREE.Vector3(...relay.position).sub(fixture.player().position).normalize();
        fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
        game.useAbility(); debug.step(0.025);
      }
    }
    fixture.key('Space', false); fixture.key('ControlLeft', false);
    assert.equal(game.getSnapshot().phase, 'surface');
    assert.equal(game.getSnapshot().mission.count, 0);
    assert.equal(game.getSnapshot().sideObjectives[0].complete, true);
    assert.equal(debug.inspect().relayBonus, true);
    engineReachPhase(debug, 'escort');
    assert.ok(debug.inspect().allies.every(ally => ally.shields === 115));
  } finally { fixture.close(); }
});

test('unopposed enemy projectiles can destroy Wedge and fail the defense objective', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'defend');
    // Place the observer outside incoming fire, then let the actual enemy AI and shots run.
    fixture.player().position.x = 350;
    fixture.key('ControlLeft');
    for (let i = 0; i < 12 && game.getSnapshot().mode === 'playing'; i++) debug.step(10);
    assert.equal(game.getSnapshot().mode, 'defeat');
    assert.match(game.getSnapshot().reason, /Красный Два/);
    assert.equal(game.getSnapshot().kills, 0);
    assert.ok(fixture.events.some(event => event.type === 'ally-lost' && event.allyId === 'wedge'));
  } finally { fixture.close(); }
});

test('unopposed physical enemy fire can kill Red Leader before the assault rally', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'assault');
    assert.ok(debug.inspect().allies.some(ally => ally.id === 'red-leader'));
    // Observe from outside the firing approach and rally; all damage comes from ordinary AI bolts.
    fixture.player().position.set(900, 250, 700);
    fixture.key('ControlLeft');
    for (let frame = 0; frame < 1200 && game.getSnapshot().mode === 'playing'; frame++) debug.step(0.1);
    assert.equal(game.getSnapshot().mode, 'defeat');
    assert.match(game.getSnapshot().reason, /Красный Лидер/);
    assert.equal(game.getSnapshot().kills, 0);
    assert.ok(fixture.events.some(event => event.type === 'ally-lost' && event.allyId === 'red-leader'));
    assert.equal(fixture.events.some(event => event.type === 'red-leader-launch'), false);
  } finally { fixture.close(); }
});

test('losing every escort ship to enemy fire fails the campaign rather than granting an escort checkpoint', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'escort');
    for (let frame = 0; frame < 9000 && game.getSnapshot().mode === 'playing'; frame++) {
      // Observe outside the 700 m checkpoint radius without moving opponents or changing health.
      fixture.player().position.copy(new THREE.Vector3(...debug.inspect().escortAnchor)).add(new THREE.Vector3(900, 60, 0));
      debug.step(0.1);
    }
    assert.equal(game.getSnapshot().mode, 'defeat');
    assert.match(game.getSnapshot().reason, /Золотая группа потеряна/);
    assert.equal(game.getSnapshot().mission.count, 0);
    assert.equal(game.getSnapshot().allies.length, 0);
    assert.equal(fixture.events.filter(event => event.type === 'ally-lost').length, 3);
  } finally { fixture.close(); }
});

test('Vader retreats after physical hits and is never counted as a canonical kill', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start(); engineReachPhase(debug, 'trench');
    fixture.player().position.set(0, -43, 1580);
    fixture.key('ControlLeft'); fixture.key('Space');
    for (let frame = 0; frame < 1200 && !debug.inspect().enemies.find(enemy => enemy.kind === 'vader')?.retreat; frame++) {
      const vader = debug.inspect().enemies.find(enemy => enemy.kind === 'vader');
      if (!vader) break;
      const direction = new THREE.Vector3(...vader.position).sub(fixture.player().position).normalize();
      fixture.player().quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
      game.useAbility(); debug.step(0.025);
    }
    const vader = debug.inspect().enemies.find(enemy => enemy.kind === 'vader');
    assert.ok(vader?.retreat);
    assert.equal(game.getSnapshot().kills, 0);
    assert.equal(fixture.events.some(event => event.type === 'kill' && event.kind === 'vader'), false);
  } finally { fixture.close(); }
});

test('physical combat, surface, escort, assault, defense and trench can be completed without progression cheats', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start({ shipId: 'xwing' });
    const held = new Set();
    const setKeys = desired => {
      for (const key of held) if (!desired.has(key)) fixture.key(key, false);
      for (const key of desired) if (!held.has(key)) fixture.key(key);
      held.clear(); desired.forEach(key => held.add(key));
    };
    let target;
    const phases = new Set();
    let escortedAllies = 0;
    let assaultKills = 0;
    let assaultRallyApproach = false;
    for (let frame = 0; frame < 16000 && game.getSnapshot().mode === 'playing'; frame++) {
      const snapshot = game.getSnapshot();
      phases.add(snapshot.phase);
      const desired = new Set();
      if (snapshot.phase !== 'trench') {
        const enemies = debug.inspect().enemies;
        target = enemies.find(enemy => enemy.id === target?.id && !enemy.disabled && !enemy.retreat)
          || enemies.find(enemy => !enemy.bonusOnly && !enemy.disabled && !enemy.retreat);
        let aimPosition = target?.position;
        let braking = true;
        if (snapshot.phase === 'assault') {
          assaultKills = Math.max(assaultKills, snapshot.assault.kills);
          if (snapshot.assault.kills >= snapshot.assault.targetKills) {
            const point = snapshot.mission.combatRoute.point;
            aimPosition = [point.x, point.y, point.z];
            braking = fixture.player().position.distanceTo(new THREE.Vector3(...aimPosition)) < 250;
            assaultRallyApproach = true;
          }
        }
        if (snapshot.phase === 'escort' && snapshot.allies.length) {
          escortedAllies = snapshot.allies.length;
          const fleet = snapshot.allies.reduce((sum, ally) => sum.add(new THREE.Vector3(ally.position.x, ally.position.y, ally.position.z)), new THREE.Vector3()).divideScalar(snapshot.allies.length);
          const distance = fleet.distanceTo(fixture.player().position);
          if (distance > 520 || !target) aimPosition = fleet.toArray();
          if (distance > 350) braking = false;
        }
        if (aimPosition) {
          const direction = new THREE.Vector3(...aimPosition).sub(fixture.player().position)
            .applyQuaternion(fixture.player().quaternion.clone().invert()).normalize();
          if (direction.z > 0) desired.add('KeyA');
          else {
            if (direction.x > 0.012) desired.add('KeyD');
            if (direction.x < -0.012) desired.add('KeyA');
            if (direction.y > 0.012) desired.add('KeyW');
            if (direction.y < -0.012) desired.add('KeyS');
          }
        }
        desired.add('Space'); if (braking) desired.add('ControlLeft');
        game.useAbility();
      }
      setKeys(desired);
      debug.step(0.025);
    }
    setKeys(new Set());
    const final = game.getSnapshot();
    assert.equal(final.mode, 'qte', `Physical run stalled or failed: ${JSON.stringify(final)}; ${JSON.stringify(debug.inspect())}`);
    assert.equal(final.mission.type, 'qte');
    assert.deepEqual([...phases], ['combat', 'surface', 'escort', 'assault', 'defend', 'trench']);
    assert.ok(escortedAllies > 0);
    assert.equal(assaultKills, 3);
    assert.ok(assaultRallyApproach, 'Three real kills must be followed by a flight to the rally point');
    assert.ok(final.kills >= 16);
    assert.ok(final.health > 0);
    const redLeaderStory = fixture.events.filter(event => ['red-leader-launch', 'red-leader-miss', 'red-leader-lost'].includes(event.type));
    assert.deepEqual(redLeaderStory.map(event => event.type), ['red-leader-launch', 'red-leader-miss', 'red-leader-lost'], 'A real assault completion must play the canonical failed attack in order');
  } finally { fixture.close(); }
});

test('entering the trench announces the run with the station klaxon', async () => {
  const fixture = await engineHarness();
  try {
    const { debug } = fixture;
    fixture.game.start();
    assert.equal(fixture.audioCalls.filter(call => call.name === 'klaxon').length, 0);
    engineReachPhase(debug, 'trench');
    assert.equal(debug.snapshot().phase, 'trench');
    assert.equal(fixture.audioCalls.filter(call => call.name === 'klaxon').length, 1);
  } finally { fixture.close(); }
});

test('the trench run charges the superlaser in the last seconds and fires it on timeout', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'qte');
    assert.equal(game.getSnapshot().mode, 'qte');
    assert.equal(fixture.audioCalls.some(call => call.name === 'superlaserCharge'), false, 'A fresh window must not start charging');
    // Each wrong key spends the retry penalty without advancing the shot: six of them leave four seconds.
    for (let attempt = 0; attempt < 6; attempt++) assert.equal(game.submitQte('KeyD'), false);
    assert.equal(game.getSnapshot().qte.totalRemaining, 4);
    debug.step(0.05);
    const charge = fixture.audioCalls.findIndex(call => call.name === 'superlaserCharge');
    assert.ok(charge > -1, 'The gun must start charging once the window drops to six seconds');
    assert.ok(fixture.audioCalls[charge].args[0] <= 6);
    assert.equal(fixture.audioCalls.filter(call => call.name === 'superlaserCharge').length, 1, 'A charge in progress must not retrigger');
    debug.step(30);
    assert.equal(game.getSnapshot().mode, 'defeat');
    const fire = fixture.audioCalls.findIndex(call => call.name === 'superlaserFire');
    assert.ok(fire > charge, 'The station must open fire only after the charge');
  } finally { fixture.close(); }
});

test('the death star cine lands the torpedo impact before the station explosion', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'qte');
    for (const code of ['KeyA', 'KeyD', 'KeyW', 'Space']) { fixture.key(code); fixture.key(code, false); }
    assert.equal(game.getSnapshot().mode, 'cinematic');
    debug.step(12.1);
    const impact = fixture.audioCalls.findIndex(call => call.name === 'torpedoImpact');
    const station = fixture.audioCalls.findIndex(call => call.name === 'stationExplosion');
    assert.ok(impact > -1, 'The torpedoes must strike the shaft');
    assert.ok(station > -1, 'The station must detonate');
    assert.ok(impact < station, 'The impact must land before the chain reaction');
  } finally { fixture.close(); }
});

test('lethalImpact makes floor hits always fatal and gates walls and ground by speed', () => {
  assert.equal(lethalImpact({ speed: 0, maxSpeed: 300, kind: 'floor' }), true);
  assert.equal(lethalImpact({ speed: 300 * 0.69, maxSpeed: 300, kind: 'wall' }), false);
  assert.equal(lethalImpact({ speed: 300 * 0.72, maxSpeed: 300, kind: 'wall' }), true);
  assert.equal(lethalImpact({ speed: 300 * 0.75, maxSpeed: 300, kind: 'wall' }), true);
  assert.equal(lethalImpact({ speed: 300 * 0.55, maxSpeed: 300, kind: 'ground' }), true);
  assert.equal(lethalImpact({ speed: 300 * 0.54, maxSpeed: 300, kind: 'ground' }), false);
  assert.equal(lethalImpact({ speed: 300, maxSpeed: 0, kind: 'wall' }), false);
  assert.equal(lethalImpact({ speed: 300, maxSpeed: 0, kind: 'floor' }), false);
});

test('a trench floor impact is an instant crash with its own sound and reason', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'trench');
    fixture.player().position.y = -130;
    for (let frame = 0; frame < 6; frame++) debug.step(0.025);
    assert.equal(game.getSnapshot().mode, 'defeat');
    assert.match(game.getSnapshot().reason, /пол траншеи/);
    assert.ok(fixture.audioCalls.some(call => call.name === 'crash'), 'A crash needs its own audio cue');
  } finally { fixture.close(); }
});

test('scraping the trench ceiling from inside stays survivable', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    engineReachPhase(debug, 'trench');
    fixture.player().position.x = 0;
    fixture.player().position.y = 110;
    for (let frame = 0; frame < 12; frame++) debug.step(0.025);
    assert.equal(game.getSnapshot().mode, 'playing');
  } finally { fixture.close(); }
});

test('the snapshot exposes session firing accuracy counters', async () => {
  const fixture = await engineHarness();
  try {
    const { game, debug } = fixture;
    game.start();
    debug.step(1);
    fixture.key('Space');
    for (let frame = 0; frame < 40 && game.getSnapshot().accuracy.shots < 1; frame++) debug.step(0.025);
    fixture.key('Space', false);
    const accuracy = game.getSnapshot().accuracy;
    assert.ok(accuracy.shots >= 1);
    assert.ok(Number.isFinite(accuracy.shots) && Number.isFinite(accuracy.hits));
    assert.ok(accuracy.hits >= 0);
    // A fresh sortie resets both counters together with the kills.
    game.restart();
    assert.deepEqual(game.getSnapshot().accuracy, { shots: 0, hits: 0 });
  } finally { fixture.close(); }
});
