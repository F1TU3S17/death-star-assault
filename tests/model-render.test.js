import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

async function findBrowser() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
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

const comparisonHtml = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#040811;color:#cad4dc;font:18px monospace}header{height:48px;display:flex;align-items:center;text-align:center}header span{width:50%}canvas{display:block}</style>
<header><span>Existing TIE · same normalized size</span><span>Candidate TIE · same normalized size</span></header>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1440,852);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;document.body.append(renderer.domElement);
// Match scene-lighting.js's broad procedural reflection cards and intensity.
const environment=new THREE.Scene();environment.background=new THREE.Color(0x101a28);
for(const [position,size,color] of [[[-18,7,20],[32,12],[.8,1.28,1.92]],[[8,18,-16],[27,5],[1.36,.76,.36]],[[21,-7,-10],[30,9],[.48,.96,1.6]],[[-8,-19,-12],[24,4],[1,1.12,1.28]]]){
 const card=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(...color),side:THREE.DoubleSide,toneMapped:false}));card.position.set(...position);card.lookAt(0,0,0);environment.add(card);
}
const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(environment,.12,.1,80);
const scenes=[],roots=[],metrics=[];
for(const [url,rotate] of [['/models/tie-fighter.glb',0],['/models/tie-fighter-detailed/scene.gltf',Math.PI]]){
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x040811);scene.environment=env.texture;scene.environmentIntensity=.42;
 scene.add(new THREE.HemisphereLight(0xc4d0de,0x555961,1.1));
 for(const [color,intensity,position] of [[0xf2e9d3,3,[-2000,3000,2500]],[0xaab8ce,.45,[1000,-300,-2000]]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(...position);scene.add(light);}
 const asset=(await new GLTFLoader().loadAsync(url)).scene;asset.rotation.y=rotate;asset.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(asset),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const root=new THREE.Group();asset.position.sub(center);root.add(asset);root.scale.setScalar(19/Math.max(...size.toArray()));scene.add(root);
 let triangles=0,maps=0,normals=0;asset.traverse(node=>{if(!node.isMesh)return;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
  for(const material of Array.isArray(node.material)?node.material:[node.material]){maps+=Boolean(material.map?.image?.width);normals+=Boolean(material.normalMap?.image?.width);}
 });
 roots.push(root);scenes.push(scene);metrics.push({url,size:size.toArray(),triangles,maps,normals});
}
const camera=new THREE.PerspectiveCamera(48,720/852,.1,200);camera.lookAt(0,0,0);
window.__comparison={metrics,render(back=false){camera.position.set(21,12,back?28:-28);camera.lookAt(0,0,0);renderer.setScissorTest(true);
 scenes.forEach((scene,index)=>{renderer.setViewport(index*720,0,720,852);renderer.setScissor(index*720,0,720,852);renderer.render(scene,camera);});return renderer.info.render.triangles;
},dispose(){for(const scene of [...scenes,environment])scene.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){for(const value of Object.values(material))if(value?.isTexture&&value!==env.texture)value.dispose();material.dispose();}});env.dispose();pmrem.dispose();renderer.dispose();}};
window.__comparison.render();
</script>`;

test('TIE candidates render real geometry and textures under identical close lighting', { timeout: 100000 }, async t => {
  const executable = await findBrowser();
  if (!executable) { t.skip('Model comparison needs an installed Playwright Chromium'); return; }
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const mime = { '.js': 'text/javascript', '.png': 'image/png', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(comparisonHtml); return; }
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    const vendor = pathname.startsWith('/vendor/');
    const root = resolve(projectRoot, vendor ? 'node_modules' : 'public');
    const path = resolve(root, `.${vendor ? pathname.slice(7) : pathname}`);
    if (!path.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    try { browser = await chromium.launch({ headless: true, executablePath: executable, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); }
    catch (error) {
      if (/EPERM|Access is denied|Operation not permitted|Executable doesn't exist|mojo.*pipe/i.test(String(error))) { t.skip(`Browser unavailable: ${error.message.split('\n')[0]}`); return; }
      throw error;
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' || /shader error|context lost/i.test(message.text())) errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__comparison?.metrics.length === 2, { timeout: 30000 });
    const metrics = await page.evaluate(() => window.__comparison.metrics);
    for (const model of metrics) assert.ok(model.size.every(value => Number.isFinite(value) && value > 0) && model.triangles > 100, JSON.stringify(model));
    assert.ok(metrics[1].maps > 0 && metrics[1].normals > 0, 'Candidate must decode actual base-color and normal textures');
    const output = process.env.GAME_SCREENSHOT_DIR || resolve(tmpdir(), 'death-star-assault-qa');
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'tie-comparison.png') });
    assert.ok(await page.evaluate(() => window.__comparison.render(true)) > 0);
    await page.screenshot({ path: resolve(output, 'tie-comparison-rear.png') });
    await page.evaluate(() => window.__comparison.dispose());
    assert.deepEqual(errors, [], 'Comparison must load without model, texture or renderer failures');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
