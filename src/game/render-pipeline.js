import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { resolveGraphicsSettings } from './graphics-settings.js';

/** HDR highlights stay local to engines and bolts; the HUD stays sharp in HTML. */
export function createRenderPipeline(renderer, scene, camera) {
  if (!renderer.isWebGLRenderer) {
    let quality = 'hd';
    return { resize() {}, setQuality(value) { quality = value === 'performance' ? 'performance' : 'hd'; }, render: () => renderer.render(scene, camera), dispose() {}, inspect: () => ({ enabled: false, quality }) };
  }
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
  // Use edge-selective SMAA in HD instead of softening the whole frame with FXAA.
  target.samples = 0;
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 1.15);
  const antialias = new ShaderPass(FXAAShader);
  const smaa = new SMAAPass();
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, aspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float aspect; varying vec2 vUv;
      void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
        vec2 p=(vUv-.5)*vec2(min(aspect,1.5),1.0);
        float vignette=1.0-.19*smoothstep(.15,.8,dot(p,p));
        gl_FragColor=vec4(max(vec3(0.),c*vignette),1.0); }`,
  });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(smaa);
  composer.addPass(antialias);
  composer.addPass(new OutputPass());
  composer.addPass(finish);
  let viewportWidth = 1, viewportHeight = 1, quality = 'hd';
  let settings = resolveGraphicsSettings();
  function resizeTargets() {
    settings = resolveGraphicsSettings(quality, viewportWidth, viewportHeight, window.devicePixelRatio);
    renderer.setPixelRatio(settings.displayPixelRatio);
    composer.setPixelRatio(settings.renderScale);
    composer.setSize(viewportWidth, viewportHeight);
    // Glow is low-frequency; it does not need the scene's full resolution.
    bloom.setSize(Math.max(1, settings.width >> 1), Math.max(1, settings.height >> 1));
    antialias.uniforms.resolution.value.set(1 / settings.width, 1 / settings.height);
    smaa.enabled = quality === 'hd';
    antialias.enabled = quality !== 'hd';
    finish.uniforms.aspect.value = viewportWidth / viewportHeight;
    bloom.strength = viewportWidth < 760 ? 0.24 : 0.32;
  }
  return {
    resize(w, h) {
      viewportWidth = Math.max(1, Math.floor(w)); viewportHeight = Math.max(1, Math.floor(h));
      resizeTargets();
    },
    setQuality(value) {
      quality = value === 'performance' ? 'performance' : 'hd';
      resizeTargets();
    },
    render() {
      renderer.info.autoReset = false;
      renderer.info.reset();
      composer.render();
    },
    inspect: () => ({ enabled: true, hdr: true, bloom: true, ...settings, multisample: target.samples, softwareRenderer, adaptiveResolution: false }),
    dispose() { for (const pass of composer.passes) pass.dispose?.(); composer.dispose(); },
  };
}
