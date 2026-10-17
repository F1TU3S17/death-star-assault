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
  const hardwareMsaa = gpuName && !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpuName);
  const maxSamples = hardwareMsaa ? Math.min(2, renderer.capabilities.maxSamples || 0) : 0;
  target.samples = maxSamples;
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
  let width = 1, height = 1;
  return {
    resize(w, h) {
      width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h));
      for (const buffer of [composer.renderTarget1, composer.renderTarget2]) buffer.samples = width < 760 ? 0 : maxSamples;
      composer.setSize(width, height);
      antialias.uniforms.resolution.value.set(1 / width, 1 / height);
      finish.uniforms.aspect.value = width / height;
      bloom.strength = width < 760 ? 0.24 : 0.32;
    },
    render() { renderer.info.autoReset = false; renderer.info.reset(); composer.render(); },
    inspect: () => ({ enabled: true, hdr: true, bloom: true, antialias: 'FXAA', multisample: target.samples, width, height }),
    dispose() { for (const pass of composer.passes) pass.dispose?.(); composer.dispose(); },
  };
}
