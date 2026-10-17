import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

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
  timeout: 120000,
}, async t => {
  const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
  const executable = await findBrowser();
  if (!executable || !existsSync(resolve(root, 'index.html'))) {
    t.skip('Browser smoke needs an installed Playwright Chromium and npm run build');
    return;
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
  const server = createServer(async (request, response) => {
    const path = resolve(root, `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname) === '/' ? '/index.html' : decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
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
    const output = process.env.GAME_SCREENSHOT_DIR || resolve(tmpdir(), 'death-star-assault-qa');
    await mkdir(output, { recursive: true });
    const screenshot = name => page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
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
    page.on('response', response => { if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    assert.equal(await page.locator('#fatal').isVisible(), false);
    await screenshot('menu');
    await page.locator('[data-ship="ywing"]').click();
    await page.waitForFunction(() => window.__gameDebug.inspect().playerModel === 'loaded' && window.__gameDebug.snapshot().shipId === 'ywing');
    await page.locator('#start').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), true);
    await page.waitForFunction(() => window.__qaAudioContexts[0]?.state === 'running');
    await page.waitForFunction(() => window.__gameDebug.inspect().enemies.every(enemy => enemy.model === 'loaded'));
    await page.keyboard.press('c');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().camera), 'cockpit');
    await page.waitForTimeout(100);
    await screenshot('cockpit');
    await page.keyboard.press('c');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__gameDebug.snapshot().heat > 0);
    await page.keyboard.up('Space');
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().heat) > 0);
    const audioRms = () => page.evaluate(() => {
      const analyser = window.__qaAudioContexts[0].__qaAnalyser;
      const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    });
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
    await screenshot('weapon-selected');
    const ammoBefore = await page.evaluate(() => window.__gameDebug.snapshot().weapon.ammo);
    await page.keyboard.down('Space');
    await page.waitForFunction(ammo => window.__gameDebug.snapshot().weapon.ammo === ammo - 1, ammoBefore);
    await page.keyboard.up('Space');
    await page.waitForFunction(ammo => document.getElementById('weapon-ammo').textContent.includes(`ПУСКОВЫЕ ${ammo} ·`), ammoBefore - 1);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().weapon.ammo), ammoBefore - 1);
    assert.match(await page.locator('#weapon-ammo').innerText(), new RegExp(String(ammoBefore - 1)));
    const depleted = await page.evaluate(() => window.__gameDebug.snapshot().weapon);
    await page.keyboard.press('r');
    await page.waitForFunction(() => window.__gameDebug.snapshot().weapon.reloading);
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
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().elapsed), pausedTime);
    await page.locator('#resume').click();
    // Only UI/FSM progression uses fixture hooks; engine.test covers honest physical progression.
    await reachPhase('surface');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    await screenshot('surface');
    await reachPhase('escort');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().allies.length) > 0);
    assert.equal(await page.locator('#squad-panel').isVisible(), true);
    assert.equal(await page.locator('#allies-list .ally-row').count(), 3);
    await screenshot('escort');
    await reachPhase('defend');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().allies.length) > 0);
    assert.match(await page.locator('#allies-list').innerText(), /Клин/);
    await reachPhase('trench');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().orbitalStationVisible), false);
    await screenshot('trench');
    await reachPhase('qte');
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
    await page.locator('#result-menu').click();
    assert.equal(await page.locator('#menu').isVisible(), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await screenshot('menu-mobile');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile menu must fit viewport horizontally');
    await page.locator('#start').click();
    await screenshot('hud-mobile');
    const weaponPanel = await page.locator('#weapon-panel').boundingBox();
    assert.ok(weaponPanel.x >= 0 && weaponPanel.x + weaponPanel.width <= 390 && weaponPanel.y >= 0 && weaponPanel.y + weaponPanel.height <= 844, 'Mobile weapon controls must remain inside the viewport');
    const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await touchPage.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    await touchPage.locator('#start').tap();
    assert.equal(await touchPage.locator('.touch-controls').isVisible(), true);
    const fireButton = await touchPage.locator('[data-hold="Space"]').boundingBox();
    const touch = await touchPage.context().newCDPSession(touchPage);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireButton.x + fireButton.width / 2, y: fireButton.y + fireButton.height / 2 }] });
    await touchPage.waitForFunction(() => window.__gameDebug.snapshot().heat > 0);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.screenshot({ path: resolve(output, 'hud-touch.png'), fullPage: true });
    const touchWeapons = await touchPage.locator('#weapon-panel').boundingBox();
    assert.ok(touchWeapons.y + touchWeapons.height < fireButton.y, 'Weapon selectors must not cover touch flight/fire controls');
    await touchPage.locator('#weapon-next').tap();
    assert.equal(await touchPage.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'proton-torpedo');
    await touchPage.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(renderingErrors, []);
    assert.deepEqual(failedResources, []);
    t.diagnostic(`Visual QA images: ${output}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
