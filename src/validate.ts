import { FURNITURE_TYPES, type SceneConfig, type CardConfig, type DeviceConfig, type FurnitureConfig, type OpeningConfig, type RoomConfig } from "./types";

// Nettoyage de la config : une faute de frappe dans le YAML ne doit pas faire planter la carte,
// et rien d'inattendu (types, tailles absurdes) ne doit arriver jusqu'au rendu.

const MAX_SIZE = 200; // m
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return fin(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const str = (v: unknown, max = 200): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);
const color = (v: unknown): string | undefined => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
/** entity_id Home Assistant : domaine.objet, en minuscules. */
const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const MAX_LEVELS = 10;
/** Recopie un numéro d'étage valide (entier ≥ 1 ; 0 est implicite). */
function keepLevel<T extends { level?: number }>(src: unknown, out: T): T {
  const l = (src as { level?: unknown })?.level;
  if (typeof l === "number" && Number.isInteger(l) && l > 0 && l < MAX_LEVELS) out.level = l;
  return out;
}

export function sanitizeConfig(input: CardConfig): { config: CardConfig; warnings: string[] } {
  const warnings: string[] = [];
  const c: CardConfig = { ...input };
  if (c.levels !== undefined) {
    c.levels = arr<{ name: string }>(c.levels)
      .slice(0, MAX_LEVELS)
      .map((l, i) => ({ name: str((l as { name?: unknown })?.name, 30) || `Niveau ${i}` }));
    if (!c.levels.length) delete c.levels;
  }

  if (c.height !== undefined) c.height = num(c.height, 150, 3000);
  if (c.wall_height !== undefined) c.wall_height = num(c.wall_height, 1.5, 6);
  if (c.max_labels !== undefined) c.max_labels = num(c.max_labels, 0, 200);
  if (c.north !== undefined) c.north = num(c.north, -360, 360);
  if (c.title !== undefined) c.title = str(c.title);
  if (c.quality !== undefined && !["auto", "high", "low"].includes(c.quality)) delete c.quality;
  if (c.sun_entity !== undefined && !(typeof c.sun_entity === "string" && ENTITY_RE.test(c.sun_entity))) {
    warnings.push(`sun_entity invalide : ${String(c.sun_entity)}`);
    delete c.sun_entity;
  }

  if (c.rooms !== undefined) {
    c.rooms = arr<RoomConfig>(c.rooms).flatMap((r, i) => {
      const x = num(r?.x, -MAX_SIZE, MAX_SIZE);
      const y = num(r?.y, -MAX_SIZE, MAX_SIZE);
      const w = num(r?.w, 0.1, MAX_SIZE);
      const d = num(r?.d, 0.1, MAX_SIZE);
      if (x === undefined || y === undefined || w === undefined || d === undefined) {
        warnings.push(`pièce n°${i + 1} ignorée (x, y, w, d requis)`);
        return [];
      }
      const room: RoomConfig = { name: str(r.name, 60) || `Pièce ${i + 1}`, x, y, w, d };
      if (color(r.floor)) room.floor = color(r.floor);
      if (r.outdoor === true) room.outdoor = true;
      if (["wood", "tiles", "concrete", "carpet", "deck"].includes(r.material as string)) room.material = r.material;
      return [keepLevel(r, room)];
    });
  }

  if (c.openings !== undefined) {
    c.openings = arr<OpeningConfig>(c.openings).flatMap((o, i) => {
      const x = num(o?.x, -MAX_SIZE, MAX_SIZE);
      const y = num(o?.y, -MAX_SIZE, MAX_SIZE);
      const type = o?.type === "door" || o?.type === "window" || o?.type === "glass_door" ? o.type : undefined;
      if (x === undefined || y === undefined || !type) {
        warnings.push(`ouverture n°${i + 1} ignorée`);
        return [];
      }
      const op: OpeningConfig = { type, x, y };
      const width = num(o.width, 0.2, 20);
      if (width !== undefined) op.width = width;
      if (typeof o.sensor === "string" && ENTITY_RE.test(o.sensor)) op.sensor = o.sensor;
      return [keepLevel(o, op)];
    });
  }

  if (c.furniture !== undefined) {
    c.furniture = arr<FurnitureConfig>(c.furniture).flatMap((f, i) => {
      const x = num(f?.x, -MAX_SIZE, MAX_SIZE);
      const y = num(f?.y, -MAX_SIZE, MAX_SIZE);
      const w = num(f?.w, 0.05, 50);
      const d = num(f?.d, 0.05, 50);
      if (x === undefined || y === undefined || w === undefined || d === undefined) {
        warnings.push(`meuble n°${i + 1} ignoré`);
        return [];
      }
      const out: FurnitureConfig = { x, y, w, d };
      if ((FURNITURE_TYPES as readonly string[]).includes(f.type as string)) out.type = f.type;
      const h = num(f.h, 0.005, 6);
      if (h !== undefined) out.h = h;
      if (color(f.color)) out.color = color(f.color);
      return [keepLevel(f, out)];
    });
  }

  if (c.devices !== undefined) {
    c.devices = arr<DeviceConfig>(c.devices).flatMap((d, i) => {
      const entity = typeof d?.entity === "string" ? d.entity.trim() : "";
      const pos = Array.isArray(d?.position) ? d.position : [];
      const x = num(pos[0], -MAX_SIZE, MAX_SIZE);
      const y = num(pos[1], -MAX_SIZE, MAX_SIZE);
      if ((entity && !ENTITY_RE.test(entity)) || x === undefined || y === undefined) {
        warnings.push(`appareil n°${i + 1} ignoré (${entity || "sans entité"})`);
        return [];
      }
      const out: DeviceConfig = { entity, position: [x, y] };
      if (typeof d.model === "string" && /^[a-z0-9_]{1,40}$/.test(d.model)) out.model = d.model;
      if (typeof d.type === "string" && /^[a-z_]{1,20}$/.test(d.type)) out.type = d.type as DeviceConfig["type"];
      const h = num(d.height, 0, 6);
      if (h !== undefined) out.height = h;
      // Rotation ramenée entre -180° et 180°.
      const rot = num(d.rotation, -1e6, 1e6);
      const r = rot === undefined ? 0 : ((((Math.round(rot) + 180) % 360) + 360) % 360) - 180;
      if (r) out.rotation = r;
      const len = num(d.length, 0.1, 30);
      if (len !== undefined) out.length = len;
      if (d.name !== undefined) out.name = str(d.name, 60);
      if (d.confirm === true) out.confirm = true;
      if (typeof d.power === "string" && /^sensor\.[a-z0-9_]+$/.test(d.power)) out.power = d.power;
      if (typeof d.position_entity === "string" && ENTITY_RE.test(d.position_entity)) out.position_entity = d.position_entity;
      if ([0, 90, 180, 270].includes(d.map_rotation as number)) out.map_rotation = d.map_rotation;
      if (d.map_flip === true) out.map_flip = true;
      return [keepLevel(d, out)];
    });
  }

  if (c.show_persons !== undefined && typeof c.show_persons !== "boolean") delete c.show_persons;
  if (c.power_entity !== undefined && !(typeof c.power_entity === "string" && /^sensor\.[a-z0-9_]+$/.test(c.power_entity))) delete c.power_entity;
  if (c.weather_entity !== undefined && !(typeof c.weather_entity === "string" && /^weather\.[a-z0-9_]+$/.test(c.weather_entity))) delete c.weather_entity;
  if (c.scenes !== undefined) {
    c.scenes = arr<SceneConfig>(c.scenes).flatMap((sc, i) => {
      if (!(typeof sc?.entity === "string" && /^(scene|script)\.[a-z0-9_]+$/.test(sc.entity))) {
        warnings.push(`scène n°${i + 1} ignorée (scene.* ou script.* attendu)`);
        return [];
      }
      const out: SceneConfig = { entity: sc.entity };
      if (sc.name !== undefined) out.name = str(sc.name, 40);
      if (typeof sc.icon === "string") out.icon = /^mdi:[a-z0-9-]{1,60}$/.test(sc.icon) ? sc.icon : [...sc.icon].slice(0, 2).join("");
      return [out];
    });
  }

  if (c.background !== undefined) {
    const b = c.background;
    const x = num(b?.x, -MAX_SIZE, MAX_SIZE);
    const y = num(b?.y, -MAX_SIZE, MAX_SIZE);
    const w = num(b?.w, 0.1, MAX_SIZE);
    const d = num(b?.d, 0.1, MAX_SIZE);
    // Image : data:image/… (chargée depuis la carte) ou chemin http(s)/relatif. Jamais javascript:.
    const image = typeof b?.image === "string" && /^(data:image\/(png|jpeg|webp|gif);base64,|https?:\/\/|\/)/i.test(b.image) ? b.image : undefined;
    if (x === undefined || y === undefined || w === undefined || d === undefined || !image) {
      warnings.push("calque ignoré");
      delete c.background;
    } else {
      c.background = { image, x, y, w, d, opacity: num(b.opacity, 0.05, 1) ?? 0.5 };
    }
  }
  return { config: c, warnings };
}
