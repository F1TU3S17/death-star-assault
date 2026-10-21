import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { acquireBrowserQaLock } from './browser-qa-lock.js';

async function findBrowser() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  // Different Playwright SDK revisions can share an existing compatible local Chromium.
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const cache = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
    const entries = await readdir(cache).catch(() => []);
    for (const entry of entries.filter(name => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const executable = resolve(cache, entry, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (existsSync(executable)) return executable;
    }
  }
  return null;
}

// Uses an existing browser and build; never downloads browsers during a test run.
test('browser renders downloaded models and supports controls, QTE, defeat/replay and victory', {
  timeout: 240000,
}, async t => {
  const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
  const executable = await findBrowser();
  if (!executable || !existsSync(resolve(root, 'index.html'))) {
    t.skip('Browser smoke needs an installed Playwright Chromium and npm run build');
    return;
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.json': 'application/json' };
  const server = createServer(async (request, response) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname) === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const releaseBrowserQa = await acquireBrowserQaLock();
  let browser;
  try {
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: executable,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });
    } catch (error) {
      if (/EPERM|Access is denied|Operation not permitted|Executable doesn't exist|mojo.*pipe/i.test(String(error))) {
        t.skip(`Browser unavailable in this environment: ${error.message.split('\n')[0]}`);
        return;
      }
      throw error;
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      window.__qaAudioContexts = [];
      const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
      if (!NativeAudioContext) return;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__qaAudioContexts.push(this);
          this.__qaGains = [];
          this.__qaDecoded = new Set();
          this.__qaSampleStarts = [];
          const decode = this.decodeAudioData.bind(this);
          this.decodeAudioData = async (...args) => {
            const buffer = await decode(...args);
            this.__qaDecoded.add(buffer);
            return buffer;
          };
          const createBufferSource = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = createBufferSource();
            const start = source.start.bind(source);
            source.start = (...args) => {
              if (this.__qaDecoded.has(source.buffer)) this.__qaSampleStarts.push({ time: this.currentTime, duration: source.buffer.duration });
              return start(...args);
            };
            return source;
          };
          const createGain = this.createGain.bind(this);
          this.createGain = () => { const gain = createGain(); this.__qaGains.push(gain); return gain; };
          const createCompressor = this.createDynamicsCompressor.bind(this);
          this.createDynamicsCompressor = () => {
            const compressor = createCompressor();
            this.__qaAnalyser = this.createAnalyser();
            const silent = createGain(); silent.gain.value = 0;
            compressor.connect(this.__qaAnalyser); this.__qaAnalyser.connect(silent); silent.connect(this.destination);
            return compressor;
          };
        }
      };
    });
    const errors = [];
    const renderingErrors = [];
    const failedResources = [];
    const loadedAudioFiles = new Set();
    const frameMetrics = {};
    const cameraFrameMetrics = {};
    const output = process.env.GAME_SCREENSHOT_DIR || resolve(tmpdir(), 'death-star-assault-qa');
    await mkdir(output, { recursive: true });
    const screenshot = async name => {
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const frame = await page.evaluate(() => window.__gameDebug.inspect());
      assert.ok(frame.graphics.enabled && frame.graphics.hdr && frame.graphics.bloom);
      assert.equal(frame.graphics.quality, 'hd');
      assert.equal(frame.graphics.antialias, 'SMAA');
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      assert.ok(frame.graphics.width >= viewport.width && frame.graphics.height >= viewport.height,
        `HD render target ${frame.graphics.width}x${frame.graphics.height} must cover CSS viewport ${viewport.width}x${viewport.height}`);
      assert.ok(frame.graphics.renderScale >= 1 && frame.graphics.renderScale <= 1.5);
      assert.equal(frame.lighting.enabled, true);
      assert.equal(frame.lighting.environment, 'procedural-pmrem');
      assert.ok(frame.renderStats.calls > 0 && frame.renderStats.triangles > 0);
      assert.ok(Object.values(frame.renderStats).every(value => Number.isFinite(value) && value >= 0));
      for (const values of [frame.playerPosition, frame.playerQuaternion, frame.cameraPosition, frame.cameraQuaternion, ...frame.enemies.map(enemy => enemy.position)]) assert.ok(values.every(Number.isFinite));
      if (name === 'trench') {
        assert.equal(frame.worldGraphics.trench.multiscale, true);
        assert.equal(frame.worldGraphics.trench.batches, 10);
        assert.ok(frame.worldGraphics.trench.instances > 0);
      }
      if (['gameplay', 'trench', 'cockpit', 'xwing-cockpit', 'hud-mobile'].includes(name)) frameMetrics[name] = { calls: frame.renderStats.calls, triangles: frame.renderStats.triangles, points: frame.renderStats.points, width: frame.graphics.width, height: frame.graphics.height };
      return page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
    };
    const measureCameraFrames = async camera => {
      const samples = await page.evaluate(async () => {
        const timestamps = [];
        while (timestamps.length < 17) timestamps.push(await new Promise(requestAnimationFrame));
        return timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
      });
      const sorted = [...samples].sort((a, b) => a - b);
      cameraFrameMetrics[camera] = {
        samples: samples.length,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      };
    };
    const reachPhase = async phase => {
      await page.evaluate(desired => {
        for (let guard = 0; guard < 12 && window.__gameDebug.snapshot().phase !== desired; guard++) window.__gameDebug.advanceMission();
      }, phase);
      assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().phase), phase);
    };
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || /shader error|context lost|model unavailable|failed to load/i.test(message.text())) renderingErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
      if (response.ok() && /\/audio\/.*\.ogg$/.test(response.url())) loadedAudioFiles.add(response.url());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    assert.equal(await page.locator('#fatal').isVisible(), false);
    await screenshot('menu');
    await page.locator('[data-ship="ywing"]').click();
    await page.waitForFunction(() => window.__gameDebug.inspect().playerModel === 'loaded' && window.__gameDebug.snapshot().shipId === 'ywing');
    await page.locator('#start').click();
    assert.equal(await page.locator('#tactics').evaluate(element => element.open), false);
    await page.locator('#tactics summary').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), true);
    assert.equal(await page.locator('#radio-avatar').getAttribute('aria-label'), 'Красный Лидер');
    const portrait = await page.evaluate(async () => {
      const url = getComputedStyle(document.getElementById('radio-avatar')).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
      const image = new Image(); image.src = url; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight, url };
    });
    assert.ok(portrait.width >= 300 && portrait.height >= 200 && Math.abs(portrait.width / portrait.height - 1.5) < 0.01);
    assert.match(portrait.url, /radio-atlas\.png$/);
    for (const [key, power] of [['1', 'engines'], ['2', 'weapons'], ['3', 'shields']]) {
      await page.keyboard.press(key);
      assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().powerMode), power);
      assert.equal(await page.locator(`[data-power="${power}"]`).getAttribute('aria-pressed'), 'true');
    }
    await page.locator('[data-power="balanced"]').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().powerMode), 'balanced');
    await page.locator('#tactics summary').click();
    await page.waitForFunction(() => window.__qaAudioContexts[0]?.state === 'running');
    await page.waitForFunction(() => window.__gameDebug.inspect().audio.state === 'ready');
    const decodedAudio = await page.evaluate(() => window.__gameDebug.inspect().audio);
    for (const event of ['laser', 'enemyLaser', 'torpedo', 'explosion', 'shieldHit', 'hullHit', 'turbolaser', 'ability', 'lock-search', 'lock-locked']) assert.ok(decodedAudio.events.includes(event), `Expected a genuinely decoded local sample for ${event}`);
    assert.ok(decodedAudio.events.length >= 10);
    assert.equal(loadedAudioFiles.size, 10, 'All ten licensed recordings must load successfully');
    assert.ok(await page.evaluate(() => window.__qaAudioContexts[0].__qaDecoded.size >= 10), 'Manifest readiness must represent actual native AudioBuffer decoding');
    await page.waitForFunction(() => window.__gameDebug.inspect().enemies.every(enemy => enemy.model === 'loaded'));
    await page.keyboard.press('c');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().camera), 'cockpit');
    const cockpitCamera = await page.evaluate(() => window.__gameDebug.inspect());
    assert.equal(cockpitCamera.cameraNear, 0.05, 'Cockpit camera should use a near plane close enough for cockpit geometry');
    await measureCameraFrames('cockpit');
    await page.waitForTimeout(100);
    await screenshot('cockpit');
    await page.keyboard.press('c');
    const chaseCamera = await page.evaluate(() => window.__gameDebug.inspect());
    assert.equal(chaseCamera.cameraNear, 1.5, 'Chase camera should retain its safe near plane');
    const chaseHullDistance = Math.hypot(...chaseCamera.cameraPosition.map((value, index) => value - chaseCamera.playerPosition[index]));
    assert.ok(chaseHullDistance >= 16, `Chase camera must clear the player hull by at least 16 units, got ${chaseHullDistance.toFixed(2)}`);
    await measureCameraFrames('chase');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__gameDebug.snapshot().heat > 0);
    await page.keyboard.up('Space');
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().heat) > 0);
    const audioRms = () => page.evaluate(() => {
      const analyser = window.__qaAudioContexts[0].__qaAnalyser;
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    });
    assert.ok(await page.evaluate(() => window.__qaAudioContexts[0].__qaSampleStarts.length > 0), 'Firing must start a real decoded sample, beyond the procedural engine bed');
    const signalPeaks = await page.evaluate(async () => {
      const analyser = window.__qaAudioContexts[0].__qaAnalyser;
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      for (let frame = 0; frame < 8; frame++) {
        analyser.getFloatTimeDomainData(samples);
        for (const value of samples) peak = Math.max(peak, Math.abs(value));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return peak;
    });
    assert.ok(Number.isFinite(signalPeaks) && signalPeaks > 0.00001 && signalPeaks <= 1, `Compressor output must be audible and stay within full scale, peak=${signalPeaks}`);
    const audibleRms = await audioRms();
    assert.ok(audibleRms > 0.00001, `Web Audio should produce an actual signal, RMS=${audibleRms}`);
    await page.locator('#sound').click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().muted), true);
    assert.ok(await audioRms() < audibleRms * 0.1, 'Muting must silence the generated sound signal');
    await page.locator('#sound').click();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'ion-cannon');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'proton-torpedo');
    assert.match(await page.locator('#weapon-name').innerText(), /Протонные торпеды/);
    const torpedoSlot = page.locator('#weapon-slots [data-weapon="proton-torpedo"]');
    const laserSlot = page.locator('#weapon-slots [data-weapon="laser"]');
    assert.equal(await torpedoSlot.getAttribute('aria-pressed'), 'true');
    await laserSlot.click();
    assert.equal(await page.locator('#weapon-panel').getAttribute('data-weapon'), 'laser');
    await torpedoSlot.click();
    assert.equal(await page.locator('#weapon-panel').getAttribute('data-weapon'), 'proton-torpedo');
    assert.equal(await page.locator('.torpedo-lock-cue').isVisible(), true);
    assert.match(await page.locator('.torpedo-lock-caption').innerText(), /ЗАХВАТ|НАВЕДЕНИЯ/);
    assert.equal(await page.locator('.lead-aim-marker').isVisible(), false, 'torpedo selection must not show a laser lead cue');
    await screenshot('weapon-selected');
    const ammoBefore = await page.evaluate(() => window.__gameDebug.snapshot().weapon.ammo);
    await page.keyboard.down('Space');
    await page.waitForFunction(ammo => window.__gameDebug.snapshot().weapon.ammo === ammo - 1, ammoBefore);
    await page.keyboard.up('Space');
    await page.waitForFunction(ammo => document.getElementById('weapon-ammo').textContent.includes(`ПУСКОВЫЕ ${ammo} ·`), ammoBefore - 1);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.ammo), ammoBefore - 1);
    assert.match(await page.locator('#weapon-ammo').innerText(), new RegExp(String(ammoBefore - 1)));
    await page.waitForFunction(ammo => document.querySelectorAll('#weapon-munitions i.loaded').length === ammo, ammoBefore - 1);
    assert.match(await page.locator('#weapon-panel').getAttribute('data-state'), /^(ready|cooldown)$/);
    const depleted = await page.evaluate(() => window.__gameDebug.snapshot().weapon);
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__gameDebug.snapshot().weapon.reloading);
    assert.equal(await page.locator('#weapon-panel').getAttribute('data-state'), 'reloading');
    assert.equal(await page.locator('#weapon-reload').isDisabled(), true);
    assert.match(await page.locator('#weapon-reload').innerText(), /С|с|\d/);
    await screenshot('reload-in-progress');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'laser');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapons.find(weapon => weapon.id === 'proton-torpedo').reloading), true);
    await page.keyboard.press('ArrowLeft');
    await page.locator('#pause').click();
    const pausedReload = await page.evaluate(() => window.__gameDebug.snapshot().weapon.reloadRemaining);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.reloadRemaining), pausedReload);
    await page.locator('#resume').click();
    await page.evaluate(() => window.__gameDebug.step(5));
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.reloading), false);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.ammo), ammoBefore);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.reserve), depleted.reserve - 1);
    await page.waitForFunction(expected => document.getElementById('weapon-ammo').textContent === expected, `ПУСКОВЫЕ ${ammoBefore} · ЗАПАС ${depleted.reserve - 1}`);
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'laser');
    await page.locator('#ability').click();
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().abilityCooldown) > 0);
    await screenshot('gameplay');
    await page.locator('#pause').click();
    assert.equal(await page.locator('#pause-overlay').isVisible(), true);
    const pausedTime = await page.evaluate(() => window.__gameDebug.snapshot().elapsed);
    const qualitySelector = page.locator('#graphics-quality');
    await qualitySelector.selectOption('performance');
    let graphics = await page.evaluate(() => window.__gameDebug.inspect().graphics);
    assert.equal(graphics.quality, 'performance');
    assert.equal(graphics.antialias, 'FXAA');
    assert.ok(graphics.renderScale < 1);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().graphicsQuality), 'performance');
    await qualitySelector.selectOption('hd');
    graphics = await page.evaluate(() => window.__gameDebug.inspect().graphics);
    assert.equal(graphics.quality, 'hd');
    assert.equal(graphics.antialias, 'SMAA');
    assert.ok(graphics.renderScale >= 1 && graphics.renderScale <= 1.5);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().graphicsQuality), 'hd');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().elapsed), pausedTime);
    await page.locator('#resume').click();
    // Only UI/FSM progression uses fixture hooks; engine.test covers honest physical progression.
    await reachPhase('surface');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.equal(await page.locator('#radio-avatar').getAttribute('aria-label'), 'Золотой Лидер');
    assert.ok(await page.evaluate(() => window.__gameDebug.inspect().missionProps.some(prop => prop.kind === 'scan')), 'Surface sensor must be an actual scene prop');
    assert.equal(await page.locator('#side-objectives').isVisible(), true);
    assert.match(await page.locator('#side-objectives').innerText(), /СЕНСОР/);
    await screenshot('surface');
    await screenshot('mission-content-surface');
    await reachPhase('escort');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.equal(await page.locator('#radio-avatar').getAttribute('aria-label'), 'Золотой Два');
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().allies.length) > 0);
    assert.equal(await page.locator('#squad-panel').isVisible(), true);
    assert.equal(await page.locator('#allies-list .ally-row').count(), 3);
    await screenshot('escort');
    await reachPhase('assault');
    const redLeaderAssault = await page.evaluate(() => window.__gameDebug.snapshot());
    assert.equal(redLeaderAssault.mission.id, 'red-leader-run');
    assert.equal(redLeaderAssault.assault.targetKills, 3);
    assert.equal(redLeaderAssault.allies.some(ally => ally.id === 'red-leader'), true);
    const redLeaderWorld = await page.evaluate(() => window.__gameDebug.inspect().worldGraphics);
    assert.equal(redLeaderWorld.surfaceVisible, true);
    assert.equal(redLeaderWorld.stationVisible, false);
    await screenshot('red-leader-run');
    await reachPhase('defend');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().allies.length) > 0);
    assert.match(await page.locator('#allies-list').innerText(), /Клин/);
    await reachPhase('trench');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.equal(await page.locator('#radio-avatar').getAttribute('aria-label'), 'Генерал Додонна');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().missionProps.filter(prop => prop.kind === 'vent').length), 3, 'Three thermal vents must exist in the trench scene');
    await screenshot('trench');
    await page.evaluate(() => {
      const elapsed = window.__gameDebug.snapshot().content.elapsed;
      window.__gameDebug.step(Math.max(0, 3.3 - elapsed));
    });
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().content.vent.telegraph), true);
    assert.equal(await page.locator('#side-objectives').isVisible(), true);
    await screenshot('mission-content-trench-warning');
    await reachPhase('qte');
    assert.equal(await page.locator('#radio-avatar').getAttribute('aria-label'), 'Люк Скайуокер');
    assert.equal(await page.locator('#qte').isVisible(), true);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().shipId), 'xwing');
    await page.keyboard.press('d');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().qte.stage), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#pause-overlay').isVisible(), true);
    await page.locator('#resume').click();
    await page.evaluate(() => window.__gameDebug.step(30));
    assert.equal(await page.locator('#result-overlay').isVisible(), true);
    assert.match(await page.locator('#result-title').innerText(), /Ещё один заход/);
    await page.locator('#replay').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().shipId), 'ywing');
    await reachPhase('qte');
    await page.evaluate(() => window.__gameDebug.step(0.15));
    const startTrace = await page.evaluate(() => window.__gameDebug.inspect());
    await page.evaluate(() => window.__gameDebug.step(0.3));
    const movedTrace = await page.evaluate(() => window.__gameDebug.inspect());
    assert.notDeepEqual(movedTrace.playerPosition, startTrace.playerPosition, 'QTE must move the real fighter');
    assert.notDeepEqual(movedTrace.cameraPosition, startTrace.cameraPosition, 'QTE must move the actual 3D camera');
    await screenshot('qte-stage-0');
    await page.keyboard.press('a');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().qte.stage), 1);
    await page.evaluate(() => window.__gameDebug.step(0.2));
    await screenshot('qte-stage-1');
    await page.keyboard.press('d'); await page.keyboard.press('w');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().qte.stage), 3);
    await page.evaluate(() => window.__gameDebug.step(0.2));
    await screenshot('qte-stage-3');
    const qtePanel = await page.locator('#qte').boundingBox();
    assert.ok(qtePanel.y + qtePanel.height <= 900 && qtePanel.y >= 0, 'QTE controls must stay inside the viewport');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#cinematic').isVisible(), true);
    await page.evaluate(() => window.__gameDebug.step(3.3));
    await screenshot('cinema');
    await page.evaluate(() => window.__gameDebug.step(3.5));
    await screenshot('explosion');
    await page.evaluate(() => window.__gameDebug.step(5.5));
    assert.match(await page.locator('#result-title').innerText(), /Новая надежда/);
    assert.deepEqual(errors, []);
    assert.deepEqual(renderingErrors, []);
    assert.deepEqual(failedResources, []);
    t.diagnostic(`Composed frame metrics: ${JSON.stringify(frameMetrics)}`);
    t.diagnostic(`Camera RAF intervals (16 samples; median/p95 ms): ${JSON.stringify(cameraFrameMetrics)}`);
    t.diagnostic(`Visual QA images: ${output}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    releaseBrowserQa();
  }
});
