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
test('browser renders X-wing cockpit and native HD trench and supports repair, physical S-foils and wingman support', {
  timeout: 180000,
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
    const errors = [];
    const renderingErrors = [];
    const failedResources = [];
    const frameMetrics = {};
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
      if (name === 'xwing-cockpit') frameMetrics[name] = { calls: frame.renderStats.calls, triangles: frame.renderStats.triangles, points: frame.renderStats.points, width: frame.graphics.width, height: frame.graphics.height };
      return page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
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
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    assert.equal(await page.locator('#fatal').isVisible(), false);
    assert.equal(await page.locator('#menu').isVisible(), true);
    await page.locator('[data-ship="xwing"]').click();
    await page.waitForFunction(() => window.__gameDebug.inspect().playerModel === 'loaded' && window.__gameDebug.snapshot().shipId === 'xwing' && window.__gameDebug.inspect().sfoilsRig?.loadedRig);
    await page.locator('#start').click();
    await page.waitForFunction(() => window.__gameDebug.inspect().cockpitModel === 'loaded');
    if (!await page.locator('#tactics').evaluate(element => element.open)) await page.locator('#tactics summary').click();
    const cockpitDetails = await page.evaluate(() => window.__gameDebug.inspect().cockpitDetails);
    assert.equal(cockpitDetails.shipId, 'xwing');
    assert.ok(cockpitDetails.triangles >= 60000, `Detailed X-wing cockpit should contain about 64k triangles, got ${cockpitDetails.triangles}`);
    assert.equal(cockpitDetails.error, null);
    await page.keyboard.press('c');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().camera), 'cockpit');
    await page.waitForTimeout(100);
    await screenshot('xwing-cockpit');
    await page.keyboard.press('c');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().camera), 'chase');
    await page.setViewportSize({ width: 1672, height: 941 });
    if (await page.locator('#tactics').evaluate(element => element.open)) await page.locator('#tactics summary').click();
    await reachPhase('trench');
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().camera), 'chase');
    await page.evaluate(() => window.__gameDebug.step(0.1));
    await screenshot('concept-trench-hd');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.__gameDebug.game.restart());
    await page.waitForFunction(() => window.__gameDebug.inspect().sfoilsRig?.loadedRig);
    if (!await page.locator('#tactics').evaluate(element => element.open)) await page.locator('#tactics summary').click();
    assert.equal(await page.locator('#repair').isDisabled(), true, 'Full hull must not consume a repair charge');
    // A damage fixture exercises the actual repair button and damage interruption UI.
    await page.evaluate(() => window.__gameDebug.damage(125));
    await page.locator('#repair').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().repair.active), true);
    assert.match(await page.locator('#repair-status').innerText(), /РЕМОНТ/);
    await page.locator('#pause').click();
    const pausedRepair = await page.evaluate(() => window.__gameDebug.snapshot().repair.remaining);
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().repair.remaining), pausedRepair);
    await page.locator('#resume').click();
    await page.evaluate(() => window.__gameDebug.damage(1));
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().repair.active), false);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().repair.charges), 1);
    await page.evaluate(() => window.__gameDebug.game.restart());
    await page.waitForFunction(() => window.__gameDebug.inspect().sfoilsRig?.loadedRig);
    await page.keyboard.press('x');
    await page.evaluate(() => window.__gameDebug.step(1.6));
    const closedRig = await page.evaluate(() => window.__gameDebug.inspect().sfoilsRig);
    assert.ok(closedRig.loadedRig && closedRig.wingCount === 4 && closedRig.movingTriangles > 0 && closedRig.openness < 0.1);
    await screenshot('sfoils-closed');
    await page.keyboard.down('Space');
    await page.evaluate(() => window.__gameDebug.step(0.5));
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().projectileDetails.some(projectile => projectile.owner === 'player')), false);
    assert.equal(await page.locator('#weapon-lock').innerText(), 'S-FOILS ЗАКРЫТЫ');
    await page.keyboard.down('Shift');
    await page.keyboard.press('x');
    await page.evaluate(() => window.__gameDebug.step(3));
    await page.keyboard.up('Space');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().sfoilsRig.openness), 1);
    assert.ok(await page.evaluate(() => window.__gameDebug.inspect().projectileDetails.some(projectile => projectile.owner === 'player')));
    await screenshot('sfoils-open');
    await page.evaluate(() => window.__gameDebug.game.restart());
    const killsBeforeSupport = await page.evaluate(() => window.__gameDebug.snapshot().kills);
    await page.locator('#support').click();
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().supportWingmen.length), 2);
    assert.equal(await page.evaluate(() => window.__gameDebug.snapshot().kills), killsBeforeSupport);
    assert.equal(await page.locator('#support').isDisabled(), true);
    await page.evaluate(() => window.__gameDebug.step(0.3));
    assert.ok(await page.evaluate(() => window.__gameDebug.inspect().projectileDetails.some(projectile => projectile.owner === 'friendly')));
    await screenshot('tactics-support');
    await page.evaluate(() => window.__gameDebug.step(4));
    assert.ok(await page.evaluate(() => window.__gameDebug.snapshot().kills) > killsBeforeSupport);
    await page.evaluate(() => window.__gameDebug.step(6));
    assert.equal(await page.evaluate(() => window.__gameDebug.inspect().supportWingmen.length), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(renderingErrors, []);
    assert.deepEqual(failedResources, []);
    t.diagnostic(`Composed X-wing frame metrics: ${JSON.stringify(frameMetrics)}`);
    t.diagnostic(`Equipment visual QA images: ${output}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    releaseBrowserQa();
  }
});
