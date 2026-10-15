import * as THREE from "three";

// Textures générées par le code (pas d'images à télécharger). Elles sont presque blanches
// avec des variations : la couleur du sol ou du meuble les teinte par multiplication.

export type FloorMaterial = "wood" | "tiles" | "concrete" | "carpet" | "deck";

/** Taille réelle (m) couverte par une répétition de chaque texture. */
const TILE_SIZE: Record<FloorMaterial | "grain" | "fabric", number> = {
  wood: 2,
  tiles: 1.2,
  concrete: 2,
  carpet: 1,
  deck: 2,
  grain: 1,
  fabric: 0.5,
};

// Générateur pseudo-aléatoire déterministe : mêmes textures à chaque chargement.
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number, rand: () => number) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  draw(g, size, rng(key.length * 7919 + 17));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

const shade = (v: number) => {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${c},${c},${c})`;
};

/** Fines veines de bois sur une zone. */
function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number, vertical: boolean) {
  const n = Math.round((vertical ? w : h) / 3);
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `rgba(80,60,40,${0.03 + rand() * 0.07})`;
    g.lineWidth = 0.6 + rand() * 1.2;
    g.beginPath();
    const off = rand() * (vertical ? w : h);
    const wave = 1 + rand() * 3;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const along = (vertical ? h : w) * t;
      const across = off + Math.sin(t * Math.PI * wave + i) * 2;
      const px = vertical ? x + across : x + along;
      const py = vertical ? y + along : y + across;
      if (t === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
}

export function floorTexture(kind: FloorMaterial): THREE.CanvasTexture {
  switch (kind) {
    case "wood":
      // Parquet : lames de 20 cm × 1 à 1,5 m, joints décalés.
      return make("wood", 1024, (g, s, rand) => {
        const px = s / TILE_SIZE.wood;
        const plankW = 0.2 * px;
        for (let col = 0; col * plankW < s; col++) {
          let y = -rand() * 1.2 * px;
          while (y < s) {
            const len = (1 + rand() * 0.5) * px;
            g.fillStyle = shade(225 + rand() * 30);
            g.fillRect(col * plankW, y, plankW, len);
            grain(g, col * plankW, y, plankW, len, rand, true);
            g.fillStyle = "rgba(70,50,35,0.35)";
            g.fillRect(col * plankW, y, plankW, 1.5);
            y += len;
          }
          g.fillStyle = "rgba(70,50,35,0.3)";
          g.fillRect(col * plankW, 0, 1.5, s);
        }
      });
    case "deck":
      // Lames de terrasse : larges, avec un vrai jour entre elles.
      return make("deck", 1024, (g, s, rand) => {
        const px = s / TILE_SIZE.deck;
        const plankW = 0.145 * px;
        g.fillStyle = "rgb(90,80,70)";
        g.fillRect(0, 0, s, s);
        for (let col = 0; col * plankW < s; col++) {
          g.fillStyle = shade(205 + rand() * 40);
          g.fillRect(col * plankW + 3, 0, plankW - 6, s);
          grain(g, col * plankW + 3, 0, plankW - 6, s, rand, true);
        }
      });
    case "tiles":
      // Carrelage 60 × 60 cm, joints fins.
      return make("tiles", 512, (g, s, rand) => {
        const n = 2;
        const t = s / n;
        g.fillStyle = "rgb(185,185,182)";
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            g.fillStyle = shade(238 + rand() * 14);
            g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
            for (let k = 0; k < 120; k++) {
              g.fillStyle = `rgba(0,0,0,${rand() * 0.035})`;
              g.fillRect(i * t + rand() * t, j * t + rand() * t, 2 + rand() * 6, 2 + rand() * 6);
            }
          }
      });
    case "carpet":
    case "concrete":
      return make(kind, 512, (g, s, rand) => {
        g.fillStyle = shade(kind === "carpet" ? 236 : 228);
        g.fillRect(0, 0, s, s);
        const dots = kind === "carpet" ? 9000 : 4000;
        for (let k = 0; k < dots; k++) {
          g.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${rand() * (kind === "carpet" ? 0.08 : 0.06)})`;
          const r = kind === "carpet" ? 1 + rand() * 1.5 : 1 + rand() * 4;
          g.fillRect(rand() * s, rand() * s, r, r);
        }
      });
  }
}

/** Bois de meuble : veinage fin sans lames. */
export function woodGrainTexture(): THREE.CanvasTexture {
  return make("grain", 512, (g, s, rand) => {
    g.fillStyle = shade(238);
    g.fillRect(0, 0, s, s);
    grain(g, 0, 0, s, s, rand, false);
    grain(g, 0, 0, s, s, rand, false);
  });
}

/** Tissu (canapé, tapis, couette) : trame fine. */
export function fabricTexture(): THREE.CanvasTexture {
  return make("fabric", 256, (g, s, rand) => {
    g.fillStyle = shade(240);
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.03})`;
      g.fillRect(0, y, s, 1);
    }
    for (let x = 0; x < s; x += 2) {
      g.fillStyle = `rgba(0,0,0,${0.015 + rand() * 0.025})`;
      g.fillRect(x, 0, 1, s);
    }
  });
}

/** Copie de la texture répétée pour couvrir w × d mètres. */
export function repeated(tex: THREE.Texture, kind: keyof typeof TILE_SIZE, w: number, d: number): THREE.Texture {
  const t = tex.clone();
  t.repeat.set(w / TILE_SIZE[kind], d / TILE_SIZE[kind]);
  t.needsUpdate = true;
  return t;
}

/** Matière par défaut d'une pièce, devinée d'après son nom. */
export function guessFloor(name: string, outdoor?: boolean): FloorMaterial {
  if (outdoor) return "deck";
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/(sde|sdb|salle (de|d'eau)|bain|douche|wc|toilet|cuisine|kitchen|bath|cellier|buanderie|laundry|garage)/.test(n)) return "tiles";
  return "wood";
}
