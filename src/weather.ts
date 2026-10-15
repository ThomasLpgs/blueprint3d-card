import * as THREE from "three";
import type { RoomConfig } from "./types";

// Météo sur les extérieurs (terrasse, balcon) : pluie ou neige, d'après l'entité weather.*.

export type Precip = "none" | "rain" | "heavy" | "snow";

/** Lecture de l'état HA : précipitations et couverture nuageuse (0 = ciel clair, 1 = couvert). */
export function readWeather(state: string | undefined): { precip: Precip; clouds: number } {
  switch (state) {
    case "pouring":
    case "lightning-rainy":
    case "hail":
      return { precip: "heavy", clouds: 1 };
    case "rainy":
      return { precip: "rain", clouds: 0.85 };
    case "snowy":
    case "snowy-rainy":
      return { precip: "snow", clouds: 0.85 };
    case "cloudy":
    case "fog":
    case "lightning":
      return { precip: "none", clouds: 0.75 };
    case "partlycloudy":
    case "windy-variant":
      return { precip: "none", clouds: 0.35 };
    default:
      return { precip: "none", clouds: 0 };
  }
}

const MAX = 1400;

export class WeatherFX {
  readonly object: THREE.LineSegments;
  private positions: Float32Array;
  private speeds = new Float32Array(MAX);
  private areas: { x: number; z: number; w: number; d: number; weight: number }[];
  private mat: THREE.LineBasicMaterial;
  private precip: Precip = "none";
  private count = 0;
  private top = 3.2;

  constructor(outdoor: RoomConfig[]) {
    const total = outdoor.reduce((s, r) => s + r.w * r.d, 0) || 1;
    this.areas = outdoor.map((r) => ({ x: r.x, z: r.y, w: r.w, d: r.d, weight: (r.w * r.d) / total }));
    this.positions = new Float32Array(MAX * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xaecbe0, transparent: true, opacity: 0.55, depthWrite: false });
    this.object = new THREE.LineSegments(geo, this.mat);
    this.object.frustumCulled = false;
    this.object.visible = false;
    for (let i = 0; i < MAX; i++) this.respawn(i, true);
  }

  get hasArea(): boolean {
    return this.areas.length > 0;
  }

  setPrecip(p: Precip): void {
    if (p === this.precip) return;
    this.precip = p;
    const area = this.areas.reduce((s, a) => s + a.w * a.d, 0);
    // Densité proportionnelle à la surface extérieure, plafonnée.
    const density = p === "heavy" ? 45 : p === "rain" ? 22 : p === "snow" ? 18 : 0;
    this.count = Math.min(MAX, Math.round(area * density));
    this.object.visible = this.count > 0 && this.hasArea;
    this.object.geometry.setDrawRange(0, this.count * 2);
    this.mat.color.set(p === "snow" ? 0xffffff : 0xaecbe0);
    this.mat.opacity = p === "snow" ? 0.9 : p === "heavy" ? 0.65 : 0.5;
  }

  private respawn(i: number, anywhere = false): void {
    let r = Math.random();
    const a = this.areas.find((ar) => (r -= ar.weight) <= 0) ?? this.areas[0];
    if (!a) return;
    const x = a.x + Math.random() * a.w;
    const z = a.z + Math.random() * a.d;
    const y = anywhere ? Math.random() * this.top : this.top;
    this.speeds[i] = 0.7 + Math.random() * 0.6;
    this.write(i, x, y, z);
  }

  private write(i: number, x: number, y: number, z: number): void {
    const len = this.precip === "snow" ? 0.02 : this.precip === "heavy" ? 0.22 : 0.14;
    const p = this.positions;
    p[i * 6] = x;
    p[i * 6 + 1] = y;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + (this.precip === "snow" ? 0.015 : 0.01);
    p[i * 6 + 4] = y - len;
    p[i * 6 + 5] = z;
  }

  tick(dt: number, time: number): void {
    if (!this.object.visible) return;
    const p = this.positions;
    const fall = this.precip === "snow" ? 0.6 : this.precip === "heavy" ? 9 : 6.5;
    for (let i = 0; i < this.count; i++) {
      let x = p[i * 6];
      let y = p[i * 6 + 1] - fall * this.speeds[i] * dt;
      const z = p[i * 6 + 2];
      if (this.precip === "snow") x += Math.sin(time * 1.3 + i) * 0.12 * dt;
      if (y < 0) this.respawn(i);
      else this.write(i, x, y, z);
    }
    (this.object.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.mat.dispose();
  }
}
