// Sous-ensemble minimal des types Home Assistant utilisés par la carte.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
  last_updated?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language?: string;
  locale?: { language: string };
  user?: { is_admin: boolean };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
  callWS?<T = any>(msg: Record<string, unknown>): Promise<T>;
}

// ---- Configuration de la carte ----
// Le plan est en mètres, vu du dessus : x vers la droite, y vers le bas.

/** Étage d'un élément (0 = premier niveau déclaré). */
interface Leveled {
  level?: number;
}

export interface RoomConfig extends Leveled {
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Couleur du sol, ex. "#c9b18f". */
  floor?: string;
  /** Balcon, terrasse… : un sol sans murs. */
  outdoor?: boolean;
  /** Revêtement : deviné d'après le nom si absent. */
  material?: "wood" | "tiles" | "concrete" | "carpet" | "deck";
}

export interface OpeningConfig extends Leveled {
  /** door : passage ; glass_door : porte-fenêtre ; window : fenêtre avec allège. */
  type: "door" | "glass_door" | "window";
  /** Centre de l'ouverture, posé sur un mur. */
  x: number;
  y: number;
  width?: number;
  /** Capteur d'ouverture (binary_sensor) qui ouvre/ferme le battant en 3D. */
  sensor?: string;
}

export const FURNITURE_TYPES = [
  "sofa",
  "armchair",
  "bed",
  "nightstand",
  "table",
  "desk",
  "chair",
  "wardrobe",
  "bookcase",
  "tv_stand",
  "rug",
  "kitchen",
  "fridge",
  "washer",
  "toilet",
  "washbasin",
  "shower",
  "bathtub",
  "plant",
  "box",
] as const;
export type FurnitureType = (typeof FURNITURE_TYPES)[number];

export interface FurnitureConfig extends Leveled {
  type?: FurnitureType;
  x: number;
  y: number;
  w: number;
  d: number;
  h?: number;
  color?: string;
}

/** Image du plan affichée sous l'éditeur 2D, pour décalquer. */
export interface BackgroundConfig {
  image: string;
  x: number;
  y: number;
  w: number;
  d: number;
  opacity?: number;
}

export type DeviceKind =
  | "light"
  | "climate"
  | "vacuum"
  | "cover"
  | "fan"
  | "switch"
  | "media_player"
  | "camera"
  | "sensor";

export interface DeviceConfig extends Leveled {
  /** Entité HA ; vide tant que l'objet de la bibliothèque n'est pas relié. */
  entity: string;
  /** Modèle de la bibliothèque (forme 3D), ex. "hue_go". */
  model?: string;
  /** Longueur en mètres (rubans LED). */
  length?: number;
  /** Demander confirmation avant d'agir (porte de garage, chauffe-eau…). */
  confirm?: boolean;
  /** Capteur de puissance (W) ; sinon celui du même appareil HA est trouvé automatiquement. */
  power?: string;
  /** Aspirateur : entité qui expose vacuum_position / charger (ex. Xiaomi Cloud Map Extractor). */
  position_entity?: string;
  /** Rotation de la carte du robot par rapport au plan (degrés). */
  map_rotation?: 0 | 90 | 180 | 270;
  /** Carte du robot en miroir. */
  map_flip?: boolean;
  /** Position sur le plan [x, y], en mètres. */
  position: [number, number];
  /** Hauteur en mètres ; une valeur par défaut est choisie selon le type. */
  height?: number;
  /** Rotation en degrés, ajoutée à l'orientation automatique (face à la pièce pour un objet mural). */
  rotation?: number;
  name?: string;
  type?: DeviceKind;
}

export interface CardConfig {
  type: string;
  title?: string;
  height?: number;
  wall_height?: number;
  sun_entity?: string;
  /** Angle (degrés, sens horaire) entre le haut du plan et le nord. */
  north?: number;
  /** Étiquettes réduites à une pastille de couleur. */
  compact_labels?: boolean;
  /** Nombre d'étiquettes dépliées au premier plan (les autres en pastille). Défaut : 3 sur téléphone, toutes sinon. */
  max_labels?: number;
  /** Qualité du rendu : auto (défaut), high (occlusion + halo), low (tablettes modestes). */
  quality?: "auto" | "high" | "low";
  rooms?: RoomConfig[];
  openings?: OpeningConfig[];
  furniture?: FurnitureConfig[];
  devices?: DeviceConfig[];
  background?: BackgroundConfig;
  /** Boutons de scènes / scripts affichés sur la carte. */
  scenes?: SceneConfig[];
  /** Afficher les personnes (person.*) présentes. Par défaut : oui. */
  show_persons?: boolean;
  /** Puissance consommée par le logement (compteur Linky, pince…), en W ou kW. */
  power_entity?: string;
  /** Météo affichée sur les extérieurs (pluie, neige, nuages) ; par défaut la première entité weather.* */
  weather_entity?: string;
  /** Étages (2 ou plus pour afficher le sélecteur). */
  levels?: { name: string }[];
}

export interface SceneConfig {
  entity: string;
  name?: string;
  icon?: string;
}

export const DOMAIN_TO_KIND: Record<string, DeviceKind> = {
  light: "light",
  climate: "climate",
  vacuum: "vacuum",
  cover: "cover",
  fan: "fan",
  switch: "switch",
  input_boolean: "switch",
  media_player: "media_player",
  camera: "camera",
  sensor: "sensor",
  binary_sensor: "sensor",
  event: "sensor",
};

/** Domaines à risque (accès, eau, alarme) : toute action demande confirmation, même sans l'option « confirm ». */
export const SENSITIVE_DOMAINS = new Set(["lock", "alarm_control_panel", "valve", "siren", "water_heater"]);

export function needsConfirm(device: Pick<DeviceConfig, "entity" | "confirm">): boolean {
  return !!device.confirm || SENSITIVE_DOMAINS.has(device.entity.split(".")[0]);
}

export function kindOf(device: Pick<DeviceConfig, "entity" | "type">): DeviceKind {
  return device.type ?? DOMAIN_TO_KIND[device.entity.split(".")[0]] ?? "sensor";
}

export const DEFAULT_HEIGHT: Record<DeviceKind, number> = {
  light: 2.3,
  climate: 2.15,
  vacuum: 0,
  cover: 0,
  fan: 2.35,
  switch: 0.3,
  media_player: 0.95,
  camera: 2.2,
  sensor: 1.5,
};
