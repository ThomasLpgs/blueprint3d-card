import * as THREE from "three";
import type { DeviceView } from "./devices";
import type { House } from "./house";
import type { DeviceConfig, HassEntity, HomeAssistant } from "./types";

// Ce que l'on sait de chaque pièce à partir des appareils qui y sont placés.

export interface RoomStats {
  name: string;
  area: number;
  outdoor: boolean;
  devices: DeviceConfig[];
  temp?: number;
  hum?: number;
  /** Un détecteur de mouvement / présence de la pièce est actif. */
  motion: boolean;
  /** Puissance totale des appareils suivis de la pièce (W). */
  power?: number;
}

export type HeatMode = "off" | "temperature" | "humidity" | "power";

const avg = (l: number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : undefined);

export function isTemperature(e: HassEntity): boolean {
  const unit = e.attributes.unit_of_measurement;
  return e.attributes.device_class === "temperature" || unit === "°C" || unit === "°F";
}

export function isHumidity(e: HassEntity): boolean {
  return e.attributes.device_class === "humidity";
}

export function isMotion(e: HassEntity): boolean {
  return ["motion", "occupancy", "presence"].includes(e.attributes.device_class) && e.entity_id.startsWith("binary_sensor.");
}

/** Pièce d'un appareil : on prend sa position 3D réelle (accroché au mur, côté pièce). */
export function roomOfView(house: House, view: DeviceView): string | undefined {
  const p = view.group.position;
  return house.roomAt(p.x, p.z)?.name;
}

export function computeRoomStats(
  house: House,
  views: DeviceView[],
  hass: HomeAssistant | undefined,
  powerOf: (cfg: DeviceConfig) => number | undefined = () => undefined,
): Map<string, RoomStats> {
  const stats = new Map<string, RoomStats>();
  for (const name of house.roomNames) {
    stats.set(name, { name, area: house.roomArea(name), outdoor: house.isOutdoor(name), devices: [], motion: false });
  }
  const temps = new Map<string, number[]>();
  const hums = new Map<string, number[]>();
  for (const view of views) {
    const room = roomOfView(house, view);
    const s = room ? stats.get(room) : undefined;
    if (!s) continue;
    s.devices.push(view.cfg);
    const w = powerOf(view.cfg);
    if (w !== undefined) s.power = (s.power ?? 0) + w;
    const e = hass?.states[view.cfg.entity];
    if (!e) continue;
    const value = Number(e.state);
    if (e.entity_id.startsWith("sensor.") && Number.isFinite(value)) {
      if (isTemperature(e)) temps.set(s.name, [...(temps.get(s.name) ?? []), value]);
      else if (isHumidity(e)) hums.set(s.name, [...(hums.get(s.name) ?? []), value]);
    }
    // À défaut de thermomètre, la température mesurée par la clim.
    if (e.entity_id.startsWith("climate.") && Number.isFinite(Number(e.attributes.current_temperature)) && !temps.has(s.name)) {
      temps.set(s.name, [Number(e.attributes.current_temperature)]);
    }
    if (typeof e.attributes.current_humidity === "number" && !hums.has(s.name)) hums.set(s.name, [e.attributes.current_humidity]);
    if (isMotion(e) && e.state === "on") s.motion = true;
  }
  for (const s of stats.values()) {
    s.temp = avg(temps.get(s.name) ?? []);
    s.hum = avg(hums.get(s.name) ?? []);
  }
  return stats;
}

// ---------- Couleurs de la carte de chaleur ----------

const SCALES: Record<Exclude<HeatMode, "off">, [number, string][]> = {
  temperature: [
    [16, "#4a90e2"],
    [19, "#4fc3a1"],
    [21, "#c8d96f"],
    [23, "#f5a25d"],
    [26, "#e5534b"],
  ],
  power: [
    [0, "#4fc3a1"],
    [200, "#c8d96f"],
    [800, "#f5a25d"],
    [2000, "#e5534b"],
  ],
  humidity: [
    [25, "#e5534b"],
    [35, "#f5a25d"],
    [45, "#4fc3a1"],
    [60, "#4a90e2"],
    [75, "#2b4c9b"],
  ],
};

export function heatColor(mode: Exclude<HeatMode, "off">, value: number): THREE.Color {
  const stops = SCALES[mode];
  if (value <= stops[0][0]) return new THREE.Color(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i];
    const [v0, c0] = stops[i - 1];
    if (value <= v1) return new THREE.Color(c0).lerp(new THREE.Color(c1), (value - v0) / (v1 - v0));
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

/** Dégradé CSS de la légende. */
export function heatGradient(mode: Exclude<HeatMode, "off">): { css: string; min: number; max: number; unit: string } {
  const stops = SCALES[mode];
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  const css = `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${Math.round(((v - min) / (max - min)) * 100)}%`).join(", ")})`;
  return { css, min, max, unit: mode === "temperature" ? "°" : mode === "power" ? " W" : "%" };
}

export const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");
