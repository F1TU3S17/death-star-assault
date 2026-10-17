import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { acquireBrowserQaLock } from './browser-qa-lock.js';

async function findBrowser() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const cache = resolve(process.env.LOCALAPPDATA, 'ms-playwright');
    const { readdir } = await import('node:fs/promises');
    for (const entry of (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const executable = resolve(cache, entry, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
      if (existsSync(executable)) return executable;
    }
  }
  return null;
}

test('responsive browser renders portrait, landscape and touch HUD controls', { timeout: 180000 }, async t => {
  const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
  const executable = await findBrowser();
  if (!executable || !existsSync(resolve(root, 'index.html'))) {
    t.skip('Responsive browser smoke needs an installed Playwright Chromium and npm run build');
    return;
  }
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.json': 'application/json' };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const releaseBrowserQa = await acquireBrowserQaLock();
  let browser;
  const errors = [];
  const renderingErrors = [];
  const failedResources = [];
  let stage = 'launch';
  const output = process.env.GAME_SCREENSHOT_DIR || resolve(tmpdir(), 'death-star-assault-qa');
  await mkdir(output, { recursive: true });
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

    const inspectPage = page => {
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' || /shader error|context lost|model unavailable|failed to load/i.test(message.text())) renderingErrors.push(message.text());
      });
      page.on('response', response => {
        if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`);
      });
    };
    const capture = async (page, name) => {
      stage = `capture ${name}`;
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const expectedTarget = await page.evaluate(() => {
        const scale = Math.min(devicePixelRatio, 1.5);
        return { width: Math.floor(innerWidth * scale), height: Math.floor(innerHeight * scale) };
      });
      await page.waitForFunction(target => {
        const graphics = window.__gameDebug.inspect().graphics;
        return graphics.width === target.width && graphics.height === target.height;
      }, expectedTarget, { timeout: 10000 });
      const frame = await page.evaluate(() => window.__gameDebug.inspect());
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      assert.equal(frame.graphics.quality, 'hd');
      assert.equal(frame.graphics.antialias, 'SMAA');
      assert.ok(frame.graphics.width >= viewport.width && frame.graphics.height >= viewport.height);
      assert.ok(frame.graphics.renderScale >= 1 && frame.graphics.renderScale <= 1.5);
      assert.ok(frame.renderStats.calls > 0 && frame.renderStats.triangles > 0);
      for (const value of Object.values(frame.renderStats)) assert.ok(Number.isFinite(value) && value >= 0);
      await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
    };
    const url = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    inspectPage(page);
    stage = 'load portrait menu';
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    await capture(page, 'menu-mobile');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile menu must fit viewport horizontally');
    stage = 'start portrait gameplay';
    await page.locator('#start').click();
    await capture(page, 'hud-mobile');
    let weaponPanel = await page.locator('#weapon-panel').boundingBox();
    assert.ok(weaponPanel.x >= 0 && weaponPanel.x + weaponPanel.width <= 390 && weaponPanel.y >= 0 && weaponPanel.y + weaponPanel.height <= 844, 'Mobile weapon controls must remain inside the viewport');
    stage = 'capture landscape desktop HUD';
    await page.setViewportSize({ width: 760, height: 430 });
    await capture(page, 'hud-landscape');
    const landscapeWeapons = await page.locator('#weapon-panel').boundingBox();
    assert.ok(landscapeWeapons.x >= 0 && landscapeWeapons.x + landscapeWeapons.width <= 760 && landscapeWeapons.y >= 0 && landscapeWeapons.y + landscapeWeapons.height <= 430, 'Landscape weapon controls must remain inside the viewport');
    await page.evaluate(() => window.__gameDebug.game.dispose());
    await page.close();

    const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    inspectPage(touchPage);
    stage = 'load touch page';
    await touchPage.goto(url, { waitUntil: 'networkidle' });
    await touchPage.waitForFunction(() => window.__gameDebug?.inspect().playerModel === 'loaded');
    await touchPage.evaluate(() => document.fonts.ready.then(() => true));
    stage = 'start touch gameplay';
    await touchPage.locator('#start').tap();
    assert.equal(await touchPage.locator('.touch-controls').isVisible(), true);
    stage = 'capture landscape touch HUD';
    await touchPage.setViewportSize({ width: 760, height: 430 });
    await capture(touchPage, 'hud-touch-landscape');
    const landscapeTouchControls = await touchPage.locator('.touch-controls').boundingBox();
    assert.ok(landscapeTouchControls.x >= 0 && landscapeTouchControls.x + landscapeTouchControls.width <= 760 && landscapeTouchControls.y >= 0 && landscapeTouchControls.y + landscapeTouchControls.height <= 430, 'Landscape touch controls must remain inside the viewport');
    await touchPage.setViewportSize({ width: 390, height: 844 });
    stage = 'fire from portrait touch controls';
    const fireButton = await touchPage.locator('[data-hold="Space"]').boundingBox();
    const touch = await touchPage.context().newCDPSession(touchPage);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireButton.x + fireButton.width / 2, y: fireButton.y + fireButton.height / 2 }] });
    await touchPage.waitForFunction(() => window.__gameDebug.snapshot().heat > 0, null, { timeout: 30000 });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.screenshot({ path: resolve(output, 'hud-touch.png'), fullPage: true });
    const touchWeapons = await touchPage.locator('#weapon-panel').boundingBox();
    assert.ok(touchWeapons.y + touchWeapons.height < fireButton.y, 'Weapon selectors must not cover touch flight/fire controls');
    stage = 'cycle touch weapon and power controls';
    await touchPage.locator('#weapon-next').tap();
    assert.equal(await touchPage.evaluate(() => window.__gameDebug.snapshot().weapon.id), 'proton-torpedo');
    assert.equal(await touchPage.locator('#tactics').evaluate(element => element.open), false);
    await touchPage.locator('#tactics summary').tap();
    await touchPage.locator('[data-power="shields"]').tap();
    assert.equal(await touchPage.evaluate(() => window.__gameDebug.snapshot().powerMode), 'shields');
    await touchPage.screenshot({ path: resolve(output, 'tactics-touch.png'), fullPage: true });
    const touchTactics = await touchPage.locator('#tactics').boundingBox();
    assert.ok(touchTactics.x >= 0 && touchTactics.y >= 0 && touchTactics.x + touchTactics.width <= 390 && touchTactics.y + touchTactics.height <= 844);
    stage = 'check touch tactical repair and wing orders';
    assert.equal(await touchPage.evaluate(() => window.__gameDebug.snapshot().mode), 'playing');
    assert.equal(await touchPage.locator('#tactics').evaluate(element => element.open), true);
    assert.equal(await touchPage.locator('#repair-target').isVisible(), true);
    assert.equal(await touchPage.locator('#wing-order').isVisible(), true);
    assert.equal(await touchPage.locator('#systems-status > span').count(), 3);
    await touchPage.locator('#repair-target').selectOption('engines');
    await touchPage.waitForFunction(() => window.__gameDebug.snapshot().systems.selected === 'engines');
    await touchPage.locator('#wing-order').selectOption('escort');
    await touchPage.waitForFunction(() => window.__gameDebug.snapshot().wingOrder.order === 'escort');
    await touchPage.screenshot({ path: resolve(output, 'tactical-orders-touch.png'), fullPage: true });
    await touchPage.locator('#repair-target').selectOption('hull');
    await touchPage.locator('#wing-order').selectOption('cover');
    await touchPage.waitForFunction(() => window.__gameDebug.snapshot().systems.selected === 'hull' && window.__gameDebug.snapshot().wingOrder.order === 'cover');
    await touchPage.locator('#tactics summary').tap();
    assert.equal(await touchPage.locator('#tactics').evaluate(element => element.open), false);
    await touchPage.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(renderingErrors, []);
    assert.deepEqual(failedResources, []);
    t.diagnostic(`Responsive browser stage completed: ${stage}`);
    t.diagnostic(`Responsive screenshots: ${output}`);
  } catch (error) {
    t.diagnostic(`Responsive browser stopped at stage: ${stage}`);
    throw error;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    releaseBrowserQa();
  }
});
