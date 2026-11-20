// The studio: a pale backdrop, four soft boxes for the anodised aluminium to catch, one directional light casting a
// wide soft shadow onto an invisible floor, and GTAO to seat the parts against each other. frame(cam) draws a frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {buildLaptop} from './laptop.js';

const V3 = THREE.Vector3;
export const BG = {top: '#f2f3f4', mid: '#e6e7ea', low: '#dcdee1'};
export const FLOOR_Y = -0.0014;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, BG.top);
    gr.addColorStop(0.58, BG.mid);
    gr.addColorStop(1, BG.low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }

  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.02, 40);

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.72;
  gtao.updateGtaoMaterial({radius: 0.035, distanceExponent: 1.5, thickness: 0.5, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  composer.addPass(new Toggle(() => (shade.visible = false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(() => (shade.visible = true)));
  composer.addPass(new OutputPass());

  // the environment the metal reflects
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#dbdcdf');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(3.0, 3.0, new V3(0, 2.6, 0.4), 2.5);
    box(0.7, 3.2, new V3(-2.4, 0.9, 1.2), 3.2);
    box(0.7, 3.2, new V3(2.4, 0.9, -0.8), 2.0);
    box(3.6, 0.5, new V3(0, 0.45, 2.8), 1.5);
    const g = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({color: '#c8c9cc', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.4;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 1.0;
    pm.dispose();
  }

  const sun = new THREE.DirectionalLight('#ffffff', 2.3);
  sun.position.set(-0.26, 0.62, 0.34);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -0.3, right: 0.3, top: 0.26, bottom: -0.26, near: 0.05, far: 1.6});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 11;
  sun.shadow.blurSamples = 24;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.0012;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#ced0d4', 0.72));

  const shade = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.ShadowMaterial({color: '#4e555d', opacity: 0.36, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}),
  );
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = FLOOR_Y;
  shade.receiveShadow = true;
  scene.add(shade);

  const nb = buildLaptop();
  scene.add(nb.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  /** cam: target (tx, ty, tz) in metres, azimuth from +z toward +x, elevation, distance, screen shift sx/sy. */
  const frame = (cam) => {
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    composer.render();
  };

  const pv = new V3();
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };

  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };

  const setClip = (on, xmm) => {
    nb.setClip(on, xmm);
    gtao.normalMaterial.clippingPlanes = on ? [nb.clipPlane] : null;
    gtao.normalMaterial.needsUpdate = true;
  };

  return {renderer, scene, camera, composer, gtao, sun, nb, size, resize, frame, project, setQuality, setClip};
}
