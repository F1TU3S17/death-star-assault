/** HD never silently lowers scene resolution. Lower resolution is an explicit choice. */
export function resolveGraphicsSettings(quality = 'hd', width = 1, height = 1, devicePixelRatio = 1) {
  const mode = quality === 'performance' ? 'performance' : 'hd';
  const viewportWidth = Math.max(1, Math.floor(Number(width) || 1));
  const viewportHeight = Math.max(1, Math.floor(Number(height) || 1));
  const dpr = Math.max(1, Math.min(1.5, Number(devicePixelRatio) || 1));
  const renderScale = mode === 'hd' ? dpr : 0.75;
  return {
    quality: mode, renderScale, displayPixelRatio: mode === 'hd' ? dpr : 1,
    width: Math.max(1, Math.floor(viewportWidth * renderScale)),
    height: Math.max(1, Math.floor(viewportHeight * renderScale)),
    antialias: mode === 'hd' ? 'SMAA' : 'FXAA',
  };
}
