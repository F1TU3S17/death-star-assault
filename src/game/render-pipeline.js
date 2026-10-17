import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

/** HDR highlights stay local to engines and bolts; the HUD stays sharp in HTML. */
export function createRenderPipeline(renderer, scene, camera) {
  if (!renderer.isWebGLRenderer) {
    return { resize() {}, render: () => renderer.render(scene, camera), dispose() {}, inspect: () => ({ enabled: false }) };
  }
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
  // FXAA already smooths the final image. Multisampling the HDR intermediate
  // duplicates that work and adds a costly resolve on every composer swap.
  target.samples = 0;
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 1.15);
  const antialias = new ShaderPass(FXAAShader);
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
  composer.addPass(antialias);
  composer.addPass(new OutputPass());
  composer.addPass(finish);
  let width = 1, height = 1, viewportWidth = 1, viewportHeight = 1;
  let resolutionScale = 1, previousFrame = 0, slowFrames = 0, fastFrames = 0;
  function resizeTargets() {
    const pixelBudgetScale = Math.min(1, Math.sqrt(1600 * 900 / (viewportWidth * viewportHeight)));
    width = Math.max(1, Math.floor(viewportWidth * pixelBudgetScale * resolutionScale));
    height = Math.max(1, Math.floor(viewportHeight * pixelBudgetScale * resolutionScale));
    composer.setSize(width, height);
    // Glow is low-frequency; it does not need the scene's full resolution.
    bloom.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    antialias.uniforms.resolution.value.set(1 / width, 1 / height);
    finish.uniforms.aspect.value = viewportWidth / viewportHeight;
    bloom.strength = viewportWidth < 760 ? 0.24 : 0.32;
  }
  return {
    resize(w, h) {
      viewportWidth = Math.max(1, Math.floor(w)); viewportHeight = Math.max(1, Math.floor(h));
      previousFrame = 0;
      slowFrames = fastFrames = 0;
      resizeTargets();
    },
    render() {
      const now = performance.now();
      const frameMs = previousFrame ? now - previousFrame : 0;
      previousFrame = now;
      // Ignore loading, tab switches and synthetic back-to-back renders. A
      // sustained slow frame cadence reduces fill cost without changing models.
      if (frameMs >= 5 && frameMs < 1000) {
        slowFrames = frameMs > 24 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        fastFrames = frameMs < 18 ? fastFrames + 1 : 0;
        if (slowFrames >= 90 && resolutionScale > 0.7) {
          resolutionScale = Math.max(0.7, resolutionScale - 0.15);
          slowFrames = fastFrames = 0;
          resizeTargets();
        } else if (fastFrames >= 600 && resolutionScale < 1) {
          resolutionScale = Math.min(1, resolutionScale + 0.15);
          slowFrames = fastFrames = 0;
          resizeTargets();
        }
      } else {
        slowFrames = fastFrames = 0;
      }
      renderer.info.autoReset = false;
      renderer.info.reset();
      composer.render();
    },
    inspect: () => ({ enabled: true, hdr: true, bloom: true, antialias: 'FXAA', multisample: target.samples, width, height, resolutionScale, softwareRenderer }),
    dispose() { for (const pass of composer.passes) pass.dispose?.(); composer.dispose(); },
  };
}
