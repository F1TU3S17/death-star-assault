const LOCK = Symbol.for('death-star-assault.browser-qa-lock');

export async function acquireBrowserQaLock() {
  const previous = globalThis[LOCK] || Promise.resolve();
  let release;
  globalThis[LOCK] = new Promise(resolve => { release = resolve; });
  await previous;
  return release;
}
