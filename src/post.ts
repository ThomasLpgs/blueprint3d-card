import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

// Post-traitement « qualité haute » : occlusion ambiante (ombres de contact dans les coins
// et sous les meubles) et léger halo autour des sources lumineuses.

export type Quality = "auto" | "high" | "low";

/** Qualité effective : « auto » passe en basse qualité sur les petits écrans tactiles. */
export function resolveQuality(q: Quality | undefined): "high" | "low" {
  if (q === "high" || q === "low") return q;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 900;
  return coarse && small ? "low" : "high";
}

export class PostFX {
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, w, h);
    // L'occlusion ne doit voir que les surfaces opaques : sinon les halos (sprites), vitres,
    // garde-corps et gouttes de pluie apparaissent comme des rectangles sombres.
    const gtaoRender = this.gtao.render.bind(this.gtao);
    this.gtao.render = (...args: Parameters<GTAOPass["render"]>) => {
      const hidden: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const transparent = Array.isArray(mat) ? mat.some((m) => m.transparent) : !!mat?.transparent;
        if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || transparent) hidden.push(o);
      });
      for (const o of hidden) o.visible = false;
      try {
        gtaoRender(...args);
      } finally {
        for (const o of hidden) o.visible = true;
      }
    };
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.composer.addPass(this.gtao);
    // Seuil au-dessus du blanc (1.0) : le fond et les murs clairs ne « bavent » pas, seules les sources lumineuses.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.5, 1.25);
    // Le halo ajoute de la lumière sans toucher à la transparence : le fond de la carte reste visible.
    const blend = (this.bloom as unknown as { blendMaterial: THREE.ShaderMaterial }).blendMaterial;
    blend.blending = THREE.CustomBlending;
    blend.blendEquation = THREE.AddEquation;
    blend.blendSrc = THREE.SrcAlphaFactor;
    blend.blendDst = THREE.OneFactor;
    blend.blendSrcAlpha = THREE.ZeroFactor;
    blend.blendDstAlpha = THREE.OneFactor;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(w, h);
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(w, h);
  }

  /** La nuit, le halo des lampes est un peu plus présent. */
  setNight(night: number): void {
    this.bloom.strength = 0.25 + 0.3 * night;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.gtao.dispose();
    this.bloom.dispose();
    this.composer.dispose();
  }
}
