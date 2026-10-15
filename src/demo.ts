import type { CardConfig, DeviceConfig, HomeAssistant } from "./types";

// Appartement de démo (~70 m²), utilisé tant qu'aucune pièce n'est configurée.
export const DEMO_PLAN: Required<Pick<CardConfig, "rooms" | "openings" | "furniture">> = {
  rooms: [
    { name: "Salon", x: 0, y: 0, w: 6, d: 4.5, floor: "#c9a77c" },
    { name: "Cuisine", x: 6, y: 0, w: 3.5, d: 4.5, floor: "#d8d4cc" },
    { name: "Entrée", x: 0, y: 4.5, w: 2.5, d: 3.5, floor: "#bfb6a8" },
    { name: "Chambre", x: 2.5, y: 4.5, w: 4, d: 3.5, floor: "#b89a78" },
    { name: "Salle de bain", x: 6.5, y: 4.5, w: 3, d: 3.5, floor: "#cfd8dc" },
  ],
  openings: [
    { type: "door", x: 1.25, y: 8, width: 0.95 },
    { type: "door", x: 1.25, y: 4.5, width: 0.9 },
    { type: "door", x: 2.5, y: 6.5, width: 0.85 },
    { type: "door", x: 6, y: 2.8, width: 1.2 },
    { type: "door", x: 6.5, y: 7, width: 0.8 },
    { type: "window", x: 2.2, y: 0, width: 2.2 },
    { type: "window", x: 0, y: 2.2, width: 1.6 },
    { type: "window", x: 7.8, y: 0, width: 1.4 },
    { type: "window", x: 5.0, y: 8, width: 1.2 },
    { type: "window", x: 9.5, y: 6, width: 0.8 },
  ],
  furniture: [
    { type: "sofa", x: 0.6, y: 3.2, w: 2.6, d: 0.95, color: "#5b6b7a" },
    { type: "table", x: 1.4, y: 1.8, w: 1.2, d: 0.7, h: 0.42, color: "#8a6a4a" },
    { type: "box", x: 4.6, y: 0.15, w: 1.2, d: 0.45, h: 0.55, color: "#3a3a3a" },
    { type: "table", x: 3.8, y: 2.2, w: 1.6, d: 0.9, color: "#9c7b55" },
    { type: "box", x: 6.1, y: 0.1, w: 3.3, d: 0.65, h: 0.9, color: "#e8e4dc" },
    { type: "table", x: 7.2, y: 2.4, w: 1.2, d: 0.8, color: "#9c7b55" },
    { type: "bed", x: 3.6, y: 4.6, w: 1.6, d: 2.1, color: "#e9e2d6" },
    { type: "box", x: 2.6, y: 7.2, w: 1.5, d: 0.7, h: 2.0, color: "#d9cbb6" },
    { type: "box", x: 8.3, y: 4.6, w: 1.1, d: 1.7, h: 0.55, color: "#f4f7f8" },
    { type: "box", x: 6.6, y: 4.6, w: 1, d: 0.5, h: 0.85, color: "#f4f7f8" },
  ],
};

// Emplacements de démo, remplis avec les vraies entités disponibles quand on en trouve.
const DEMO_SLOTS: { domain: string; position: [number, number]; fallback: string }[] = [
  { domain: "light", position: [2, 1.8], fallback: "light.salon" },
  { domain: "light", position: [4.6, 2.6], fallback: "light.salle_a_manger" },
  { domain: "light", position: [7.7, 2.2], fallback: "light.cuisine" },
  { domain: "light", position: [4.4, 5.9], fallback: "light.chambre" },
  { domain: "light", position: [8, 6.2], fallback: "light.salle_de_bain" },
  { domain: "light", position: [1.25, 6.2], fallback: "light.entree" },
  { domain: "climate", position: [4.2, 0.15], fallback: "climate.salon" },
  { domain: "climate", position: [6.0, 7.85], fallback: "climate.chambre" },
  { domain: "vacuum", position: [1.3, 0.8], fallback: "vacuum.robot" },
  { domain: "cover", position: [2.2, 0], fallback: "cover.volet_salon" },
  { domain: "media_player", position: [5.2, 0.4], fallback: "media_player.tv" },
  { domain: "sensor", position: [0.4, 4.0], fallback: "sensor.temperature_salon" },
];

export function demoDevices(hass?: HomeAssistant): DeviceConfig[] {
  const used = new Set<string>();
  const pick = (domain: string, fallback: string): string => {
    if (!hass) return fallback;
    const found = Object.keys(hass.states).find(
      (id) =>
        id.startsWith(domain + ".") &&
        !used.has(id) &&
        (domain !== "sensor" || hass.states[id].attributes.device_class === "temperature"),
    );
    return found ?? fallback;
  };
  return DEMO_SLOTS.map((slot) => {
    const entity = pick(slot.domain, slot.fallback);
    used.add(entity);
    return { entity, position: [...slot.position] as [number, number] };
  });
}
