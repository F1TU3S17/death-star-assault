import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGraphicsSettings } from '../src/game/graphics-settings.js';
import { engineHarness } from './engine-harness.js';

test('HD preserves native 1080p/4K and high DPI resolution without the former pixel budget', () => {
  for (const [width, height, dpr] of [[1920, 1080, 1], [3840, 2160, 1], [1440, 900, 2]]) {
    const settings = resolveGraphicsSettings('hd', width, height, dpr);
    assert.ok(settings.width >= width && settings.height >= height);
    assert.equal(settings.renderScale, Math.min(dpr, 1.5));
    assert.equal(settings.antialias, 'SMAA');
  }
});

test('lower resolution requires explicit performance choice and returning to HD restores sharpness', async () => {
  assert.equal(resolveGraphicsSettings('performance', 1920, 1080).width, 1440);
  const fixture = await engineHarness();
  try {
    fixture.game.start();
    assert.equal(fixture.game.getSnapshot().graphicsQuality, 'hd');
    fixture.game.pause();
    const before = fixture.game.getSnapshot();
    assert.equal(fixture.game.setGraphicsQuality('performance'), true);
    assert.equal(fixture.game.getSnapshot().graphicsQuality, 'performance');
    assert.equal(fixture.game.getSnapshot().elapsed, before.elapsed);
    assert.equal(fixture.game.setGraphicsQuality('hd'), true);
    assert.equal(fixture.game.getSnapshot().graphicsQuality, 'hd');
    assert.equal(fixture.game.setGraphicsQuality('invalid'), false);
  } finally { fixture.close(); }
});
