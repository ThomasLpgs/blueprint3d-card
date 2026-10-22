import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { DEFAULT_SHAPE, deviceItem, type DeviceItem, type Shape } from "./catalog";
import { fmtWatts } from "./entities";
import { House, WALL_T } from "./house";
import { t } from "./i18n";
import { icon, type IconName } from "./icons";
import { DEFAULT_HEIGHT, kindOf, type DeviceConfig, type DeviceKind, type HassEntity } from "./types";

// Représentation 3D de chaque type d'appareil, mise à jour à partir de l'état HA.

export interface DeviceContext {
  house: House;
  wallH: number;
  halo: THREE.Texture;
  /** État actuel d'une entité, pour choisir une forme par défaut (porte, mouvement…). */
  stateOf(entityId: string): HassEntity | undefined;
  /** Puissance consommée par l'appareil (W), si un capteur est connu. */
  powerOf?(cfg: DeviceConfig): number | undefined;
}

/** Forme 3D d'un appareil : celle du modèle de bibliothèque, sinon déduite de l'entité. */
export function resolveShape(cfg: DeviceConfig, entity: HassEntity | undefined): Shape {
  const item = deviceItem(cfg.model);
  if (item) return item.shape;
  const kind = kindOf(cfg);
  if (kind === "sensor") {
    const domain = cfg.entity.split(".")[0];
    if (domain === "lock") return "lock";
    if (domain === "lawn_mower") return "mower";
    if (domain === "siren") return "siren";
    const dc = entity?.attributes.device_class;
    if (dc === "moisture") return "leak";
    if (["door", "window", "opening", "garage_door"].includes(dc)) return "contact";
    if (["motion", "occupancy", "presence"].includes(dc)) return "motion";
    if (dc === "smoke") return "smoke";
  }
  return DEFAULT_SHAPE[kind];
}

const UNAVAILABLE = new Set(["unavailable", "unknown"]);

export function kelvinToColor(k: number): THREE.Color {
  const temp = k / 100;
  const r = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  const g = temp <= 66 ? 99.4708025861 * Math.log(temp) - 161.1195681661 : 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  const b = temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

export function lightColor(entity: HassEntity | undefined): THREE.Color {
  const a = entity?.attributes ?? {};
  if (Array.isArray(a.rgb_color)) {
    const [r, g, b] = a.rgb_color as number[];
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  }
  if (typeof a.color_temp_kelvin === "number") return kelvinToColor(a.color_temp_kelvin);
  return kelvinToColor(2900);
}

export function entityName(cfg: DeviceConfig, entity: HassEntity | undefined): string {
  return cfg.name ?? entity?.attributes.friendly_name ?? deviceItem(cfg.model)?.name ?? cfg.entity;
}

export function isActive(kind: DeviceKind, entity: HassEntity | undefined): boolean {
  if (!entity || UNAVAILABLE.has(entity.state)) return false;
  switch (kind) {
    case "climate":
      return entity.state !== "off";
    case "vacuum":
      return entity.state === "cleaning" || entity.state === "returning";
    case "cover":
      return entity.state !== "closed";
    case "media_player":
      return entity.state === "playing" || entity.state === "on";
    case "sensor":
      // Serrure déverrouillée, tondeuse en marche : mis en évidence comme un capteur actif.
      return ["on", "unlocked", "open", "mowing"].includes(entity.state);
    default:
      return entity.state === "on";
  }
}

const KIND_ICON: Record<DeviceKind, IconName> = {
  light: "bulb",
  climate: "climate",
  vacuum: "vacuum",
  cover: "cover",
  fan: "fan",
  switch: "plug",
  media_player: "tv",
  camera: "camera",
  sensor: "gauge",
};

/** Icône de la pastille : celle du type, précisée pour les capteurs (classe de l'entité). */
function labelIcon(kind: DeviceKind, shape: string, entity: HassEntity | undefined): IconName {
  if (kind !== "sensor") return KIND_ICON[kind];
  const dc = entity?.attributes.device_class;
  if (entity?.entity_id.startsWith("lock.")) return "lock";
  if (dc === "temperature") return "thermometer";
  if (dc === "humidity") return "droplet";
  if (dc === "motion" || dc === "occupancy" || dc === "presence") return "walk";
  if (shape === "contact" || dc === "door" || dc === "window" || dc === "opening" || dc === "garage_door") return "door";
  if (dc === "power" || dc === "energy") return "bolt";
  return "gauge";
}

export function stateText(kind: DeviceKind, entity: HassEntity | undefined): string {
  if (!entity) return t("missing");
  if (UNAVAILABLE.has(entity.state)) return t("unavailable");
  const a = entity.attributes;
  switch (kind) {
    case "light":
      if (entity.state !== "on") return t("off");
      return typeof a.brightness === "number" ? `${Math.round((a.brightness / 255) * 100)} %` : t("on");
    case "climate": {
      if (entity.state === "off") return t("off");
      const cur = a.current_temperature != null ? `${a.current_temperature}°` : "";
      const tgt = a.temperature != null ? `${a.temperature}°` : "";
      return [t(entity.state), [cur, tgt].filter(Boolean).join(" → ")].filter(Boolean).join(" · ");
    }
    case "cover":
      if (typeof a.current_position === "number") return `${a.current_position} %`;
      return t(entity.state);
    case "fan":
      if (entity.state !== "on") return t("off");
      return typeof a.percentage === "number" ? `${a.percentage} %` : t("on");
    case "sensor": {
      const dc = a.device_class;
      if (entity.state === "on" || entity.state === "off") {
        const on = entity.state === "on";
        if (["door", "window", "opening", "garage_door"].includes(dc)) return t(on ? "open" : "closed");
        if (["motion", "occupancy", "presence"].includes(dc)) return t(on ? "motion" : "clear");
        if (dc === "moisture") return t(on ? "leak_wet" : "leak_dry");
        return t(on ? "on" : "off");
      }
      const num = Number(entity.state);
      const value = Number.isFinite(num) ? String(Math.round(num * 10) / 10) : t(entity.state);
      return a.unit_of_measurement ? `${value} ${a.unit_of_measurement}` : value;
    }
    default:
      return t(entity.state);
  }
}

// ---------------------------------------------------------------------------

export abstract class DeviceView {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly kind: DeviceKind;
  readonly shape: Shape;
  readonly item?: DeviceItem;
  readonly label: CSS2DObject;
  readonly labelEl: HTMLElement;
  private nameEl: HTMLElement;
  private dotEl: HTMLElement;
  private iconName?: IconName;
  private stateEl: HTMLElement;
  protected entity?: HassEntity;
  protected height: number;

  constructor(
    public cfg: DeviceConfig,
    protected ctx: DeviceContext,
  ) {
    this.kind = kindOf(cfg);
    this.item = deviceItem(cfg.model);
    this.shape = resolveShape(cfg, ctx.stateOf(cfg.entity));
    this.height = cfg.height ?? this.item?.height ?? DEFAULT_HEIGHT[this.kind];
    // L'ancre est placée sur le point 3D ; la pastille est décalée au-dessus pour ne pas masquer l'objet.
    const anchor = document.createElement("div");
    anchor.className = "dev-anchor";
    const el = document.createElement("div");
    el.className = `dev-label kind-${this.kind}`;
    el.innerHTML = `<span class="dot"></span><span class="txt"><span class="n"></span><span class="s"></span></span>`;
    anchor.appendChild(el);
    this.labelEl = el;
    this.nameEl = el.querySelector(".n")!;
    this.dotEl = el.querySelector(".dot")!;
    this.stateEl = el.querySelector(".s")!;
    this.label = new CSS2DObject(anchor);
    this.group.add(this.label);
    this.group.position.set(cfg.position[0], 0, cfg.position[1]);
  }

  /** Zone cliquable invisible, plus large que l'objet. */
  protected addHitArea(radius: number, y: number, offset = new THREE.Vector3()): void {
    const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.position.copy(offset).setY(y);
    this.group.add(hit);
    this.pickables.push(hit);
  }

  update(entity: HassEntity | undefined): void {
    this.entity = entity;
    this.nameEl.textContent = entityName(this.cfg, entity);
    // Objet de la bibliothèque pas encore relié à une entité.
    const unlinked = !this.cfg.entity;
    this.stateEl.textContent = unlinked ? (this.item?.decorative ? this.item.brand : t("unlinked")) : stateText(this.kind, entity);
    const power = unlinked ? undefined : this.ctx.powerOf?.(this.cfg);
    if (power !== undefined && power > 0.5) this.stateEl.textContent += ` · ${fmtWatts(power)}`;
    const ico = labelIcon(this.kind, this.shape, entity);
    if (ico !== this.iconName) {
      this.iconName = ico;
      this.dotEl.innerHTML = icon(ico);
    }
    const el = this.labelEl;
    el.classList.toggle("unlinked", unlinked && !this.item?.decorative);
    el.classList.toggle("on", isActive(this.kind, entity));
    el.classList.toggle("unavailable", !unlinked && (!entity || UNAVAILABLE.has(entity.state)));
    if (this.kind === "light" && entity?.state === "on") {
      el.style.setProperty("--dev-color", `#${lightColor(entity).getHexString()}`);
    } else {
      el.style.removeProperty("--dev-color");
    }
  }

  /** Peut être tourné par l'utilisateur. */
  get rotatable(): boolean {
    return this.kind !== "vacuum" && this.kind !== "cover";
  }

  /** Hauteur effective (m) : réglée, sinon celle du modèle, sinon celle du type. */
  get effectiveHeight(): number {
    return this.height;
  }

  setSelected(selected: boolean): void {
    this.labelEl.classList.toggle("selected", selected);
  }

  tick(_dt: number, _time: number): void {}

  /** Déplace l'appareil sur le plan (mode édition). */
  moveTo(x: number, y: number): void {
    this.cfg.position = [x, y];
    this.group.position.x = x;
    this.group.position.z = y;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite || o instanceof THREE.Line) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.label.element.remove();
  }

  /** Accroche au mur le plus proche : place le groupe contre la face intérieure, tourné vers la pièce. */
  protected mountOnWall(depth: number, maxDist = 0.6) {
    const [x, y] = this.cfg.position;
    const hit = this.ctx.house.nearestWall(x, y, maxDist);
    if (!hit) return undefined;
    const offset = WALL_T / 2 + depth / 2;
    if (hit.axis === "h") this.group.position.set(x, 0, hit.pos + hit.inward.z * offset);
    else this.group.position.set(hit.pos + hit.inward.x * offset, 0, y);
    this.group.rotation.y = Math.atan2(hit.inward.x, hit.inward.z);
    return hit;
  }
}

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

// ---------------------------------------------------------------------------

class LightView extends DeviceView {
  private glows: THREE.MeshStandardMaterial[] = [];
  private washes: THREE.MeshBasicMaterial[] = [];
  private light: THREE.PointLight;
  private halo?: THREE.Sprite;
  private level = 0;
  private targetLevel = 0;
  private power = 9;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const ceil = ctx.wallH;
    const glow = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation = 0xfff4e0, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const m = std(color, { emissive: 0x000000, emissiveIntensity: 2, ...extra });
      this.glows.push(m);
      return mesh(geo, m, false);
    };
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z = 0): T => {
      o.position.set(x, y, z);
      this.group.add(o);
      return o;
    };
    const cord = (from: number) => {
      const len = ceil - from;
      if (len > 0.05) at(mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), std(0x222222), false), 0, from + len / 2);
    };

    let lightY = h - 0.08;
    let lightZ = 0;
    let haloY: number | undefined = h - 0.02;
    let haloScale = 0.9;
    let hitY = h;
    let hitR = 0.28;
    let labelY = h + 0.15;

    switch (this.shape) {
      case "bulb": {
        cord(h + 0.08);
        at(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), std(0x2b2b2b), false), 0, h + 0.07);
        at(glow(new THREE.SphereGeometry(0.065, 24, 16)), 0, h);
        break;
      }
      case "spot": {
        const y = ceil - 0.01;
        at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), std(0xdedede), false), 0, y);
        const lens = at(glow(new THREE.CircleGeometry(0.035, 20)), 0, y - 0.011);
        lens.rotation.x = Math.PI / 2;
        lightY = y - 0.2;
        haloY = y - 0.03;
        haloScale = 0.45;
        hitY = y - 0.05;
        hitR = 0.22;
        labelY = y + 0.05;
        break;
      }
      case "ceiling": {
        const y = ceil - 0.035;
        at(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40), std(0xf5f5f3)), 0, y);
        const diffuser = at(glow(new THREE.CircleGeometry(0.235, 40)), 0, y - 0.026);
        diffuser.rotation.x = Math.PI / 2;
        lightY = y - 0.3;
        haloY = y - 0.06;
        haloScale = 1.3;
        hitY = y - 0.05;
        hitR = 0.32;
        labelY = y + 0.06;
        break;
      }
      case "table_lamp": {
        at(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 24), std(0x8a6a4a)), 0, h + 0.015);
        at(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 8), std(0x8a6a4a), false), 0, h + 0.15);
        at(glow(new THREE.CylinderGeometry(0.08, 0.13, 0.17, 28, 1, true), 0xf3ead8, { side: THREE.DoubleSide }), 0, h + 0.33);
        lightY = h + 0.3;
        haloY = h + 0.32;
        haloScale = 0.75;
        hitY = h + 0.25;
        labelY = h + 0.5;
        break;
      }
      case "floor_lamp": {
        at(mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.02, 32), std(0x2b2b2b)), 0, h + 0.01);
        at(glow(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 12)), 0, h + 0.75);
        lightY = h + 1.1;
        haloY = h + 1.2;
        haloScale = 0.7;
        hitY = h + 0.8;
        hitR = 0.3;
        labelY = h + 1.6;
        break;
      }
      case "go": {
        at(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 32), std(0xdedede)), 0, h + 0.01);
        at(glow(new THREE.SphereGeometry(0.085, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff), 0, h + 0.02);
        lightY = h + 0.15;
        haloY = h + 0.08;
        haloScale = 0.6;
        hitY = h + 0.06;
        hitR = 0.2;
        labelY = h + 0.3;
        break;
      }
      case "bar": {
        at(mesh(new THREE.BoxGeometry(0.08, 0.26, 0.05), std(0x1f1f1f)), 0, h + 0.13);
        at(glow(new THREE.BoxGeometry(0.06, 0.24, 0.01), 0xffffff), 0, h + 0.13, 0.026);
        lightY = h + 0.2;
        haloY = h + 0.14;
        haloScale = 0.55;
        hitY = h + 0.13;
        hitR = 0.2;
        labelY = h + 0.4;
        break;
      }
      case "strip": {
        this.mountOnWall(0.012, 0.8);
        const len = cfg.length ?? this.item?.length ?? 2;
        at(glow(new THREE.BoxGeometry(len, 0.012, 0.012), 0xffffff), 0, h);
        // Lueur douce sur le mur, au-dessus et au-dessous du ruban.
        const wash = new THREE.MeshBasicMaterial({ map: ctx.halo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        this.washes.push(wash);
        at(new THREE.Mesh(new THREE.PlaneGeometry(len * 1.15, 0.7), wash), 0, h, -0.004);
        lightY = h;
        lightZ = 0.25;
        this.power = 5 + len;
        haloY = undefined;
        hitR = 0.25;
        labelY = h + 0.15;
        break;
      }
      case "tube": {
        // Tube lumineux posé (Hue Play Gradient Light Tube) : objet libre, pas aspiré par le mur.
        // Il ne s'accroche au mur que s'il est posé contre (< 15 cm), comme avec son support mural.
        // Sans hauteur réglée, il se pose sur le meuble en dessous (meuble TV…), sinon au sol.
        if (cfg.height === undefined) this.height = ctx.house.surfaceAt(cfg.position[0], cfg.position[1]);
        const y0 = this.height;
        const onWall = !!this.mountOnWall(0.06, 0.15);
        const len = cfg.length ?? this.item?.length ?? 0.75;
        const dark = std(0x26282b, { roughness: 0.35, metalness: 0.5 });
        const yc = y0 + (onWall ? 0 : 0.045);
        const body = at(mesh(new THREE.CapsuleGeometry(0.026, Math.max(0.05, len - 0.052), 4, 12), dark), 0, yc, -0.006);
        body.rotation.z = Math.PI / 2;
        // Diffuseur en 5 zones : chaque zone prend une teinte voisine (effet dégradé).
        const n = 5;
        const seg = (len - 0.06) / n;
        for (let i = 0; i < n; i++) at(glow(new THREE.BoxGeometry(seg - 0.004, 0.036, 0.012), 0xffffff), -len / 2 + 0.03 + (i + 0.5) * seg, yc, 0.018);
        if (!onWall) for (const fx of [-len * 0.35, len * 0.35]) at(mesh(new THREE.BoxGeometry(0.05, 0.02, 0.06), dark), fx, y0 + 0.01);
        lightY = yc;
        lightZ = 0.25;
        this.power = 6 + len * 10;
        haloY = yc;
        haloScale = Math.max(0.6, len);
        hitY = yc;
        hitR = Math.max(0.25, len * 0.45);
        labelY = yc + 0.2;
        break;
      }
      case "hexa": {
        this.mountOnWall(0.02, 0.8);
        const offsets = [
          [0, 0],
          [0.19, 0.11],
          [0.19, -0.11],
          [-0.19, 0.11],
          [-0.19, -0.11],
          [0, 0.22],
        ];
        for (const [x, y] of offsets) {
          const tile = at(glow(new THREE.CylinderGeometry(0.105, 0.105, 0.015, 6), 0xffffff), x, h + y);
          tile.rotation.x = Math.PI / 2;
          tile.rotation.y = Math.PI / 6;
        }
        lightY = h + 0.05;
        lightZ = 0.3;
        haloY = h + 0.05;
        haloScale = 1.1;
        hitY = h + 0.05;
        hitR = 0.4;
        labelY = h + 0.45;
        break;
      }
      case "tv_backlight": {
        this.mountOnWall(0.02, 0.8);
        const wash = new THREE.MeshBasicMaterial({ map: ctx.halo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        this.washes.push(wash);
        at(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), wash), 0, h, -0.005);
        // Le ruban LED autour du dos de la TV.
        for (const [w, d, x, y] of [
          [1.2, 0.012, 0, 0.34],
          [1.2, 0.012, 0, -0.34],
          [0.012, 0.68, 0.6, 0],
          [0.012, 0.68, -0.6, 0],
        ]) {
          at(glow(new THREE.BoxGeometry(w, d, 0.01), 0xffffff), x, h + y, 0.002);
        }
        lightY = h;
        lightZ = 0.3;
        this.power = 6;
        haloY = undefined;
        hitR = 0.5;
        labelY = h + 0.55;
        break;
      }
      case "torchiere": {
        // Lampadaire vasque + liseuse (type TÅGARP) : grande coupe vers le plafond et petit bras de lecture.
        const black = std(0x1e1e1e, { roughness: 0.4, metalness: 0.3 });
        at(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.025, 32), black), 0, h + 0.012);
        at(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.72, 10), black), 0, h + 0.88);
        at(glow(new THREE.CylinderGeometry(0.2, 0.05, 0.13, 32, 1, true), 0xf4f0e6, { side: THREE.DoubleSide }), 0, h + 1.79);
        const arm = at(mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.36, 8), black, false), 0.13, h + 1.32);
        arm.rotation.z = -1.0;
        const shade = at(glow(new THREE.CylinderGeometry(0.035, 0.065, 0.11, 24, 1, true), 0xf4f0e6, { side: THREE.DoubleSide }), 0.28, h + 1.38);
        shade.rotation.z = 0.5;
        lightY = h + 1.75;
        haloY = h + 1.82;
        haloScale = 1.0;
        hitY = h + 1.2;
        hitR = 0.35;
        labelY = h + 2.0;
        this.power = 11;
        break;
      }
      case "corner_lamp": {
        // Colonne LED d'angle (Govee, Hue Signe) : segments multizones.
        at(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.02, 32), std(0x1e1e1e)), 0, h + 0.01);
        at(mesh(new THREE.BoxGeometry(0.035, 1.42, 0.035), std(0x2a2a2a), false), 0, h + 0.73, -0.012);
        const n = 7;
        for (let i = 0; i < n; i++) at(glow(new THREE.BoxGeometry(0.024, 1.36 / n - 0.004, 0.012), 0xffffff), 0, h + 0.07 + (i + 0.5) * (1.36 / n), 0.012);
        lightY = h + 0.8;
        lightZ = 0.1;
        haloY = h + 0.8;
        haloScale = 1.0;
        hitY = h + 0.75;
        hitR = 0.3;
        labelY = h + 1.6;
        break;
      }
      case "lantern": {
        // Hue Go portable : cylindre diffusant, couvercle sombre et poignée.
        at(glow(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 32), 0xffffff), 0, h + 0.075);
        at(mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.02, 32), std(0x2b2b2b)), 0, h + 0.16);
        const handle = at(mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 24, Math.PI), std(0x2b2b2b), false), 0, h + 0.17);
        handle.rotation.y = Math.PI / 2;
        lightY = h + 0.1;
        haloY = h + 0.08;
        haloScale = 0.55;
        hitY = h + 0.08;
        hitR = 0.2;
        labelY = h + 0.32;
        break;
      }
      case "wall_light": {
        this.mountOnWall(0.08, 0.6);
        at(mesh(new THREE.BoxGeometry(0.11, 0.22, 0.02), std(0x2b2b2b)), 0, h, -0.03);
        at(glow(new THREE.BoxGeometry(0.08, 0.16, 0.06), 0xfff4e0), 0, h, 0.01);
        lightY = h;
        lightZ = 0.25;
        haloY = h;
        haloScale = 0.6;
        hitR = 0.22;
        labelY = h + 0.22;
        break;
      }
      case "garden_spot": {
        // Spot sur piquet (Hue Lily) : tête orientée vers le haut.
        at(mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.28, 8), std(0x222222), false), 0, h + 0.14);
        const head = at(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 20), std(0x2b2b2b)), 0, h + 0.3);
        head.rotation.x = -0.5;
        const lens = at(glow(new THREE.CircleGeometry(0.03, 20)), 0, h + 0.34, 0.025);
        lens.rotation.x = -0.5 - Math.PI / 2;
        lightY = h + 0.6;
        lightZ = 0.2;
        haloY = h + 0.36;
        haloScale = 0.45;
        hitY = h + 0.25;
        hitR = 0.22;
        labelY = h + 0.5;
        break;
      }
      case "string_lights": {
        // Guirlande : ampoules suspendues en chaînette le long du mur.
        this.mountOnWall(0.03, 0.8);
        const len = cfg.length ?? this.item?.length ?? 2;
        const n = Math.max(4, Math.min(40, Math.round(len * 5)));
        const wire: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const p = new THREE.Vector3((u - 0.5) * len, h - Math.sin(u * Math.PI) * 0.12 * Math.min(len, 3), 0.02);
          wire.push(p);
          if (i > 0 && i < n) at(glow(new THREE.SphereGeometry(0.018, 10, 8)), p.x, p.y - 0.02, p.z);
        }
        this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x222222 })));
        const wash = new THREE.MeshBasicMaterial({ map: ctx.halo, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        this.washes.push(wash);
        at(new THREE.Mesh(new THREE.PlaneGeometry(len * 1.1, 0.6), wash), 0, h - 0.1, -0.004);
        lightY = h - 0.1;
        lightZ = 0.25;
        this.power = 3 + len;
        haloY = undefined;
        hitR = 0.3;
        hitY = h - 0.1;
        labelY = h + 0.15;
        break;
      }
      case "desk_lamp": {
        // Lampe d'architecte : socle, deux bras, tête orientée vers le bureau.
        const mat = std(0x2b2b2b, { roughness: 0.35, metalness: 0.4 });
        at(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 24), mat), 0, h + 0.01);
        const a1 = at(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), mat, false), -0.05, h + 0.16);
        a1.rotation.z = 0.35;
        const a2 = at(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), mat, false), 0.04, h + 0.36);
        a2.rotation.z = -1.0;
        const head = at(mesh(new THREE.CylinderGeometry(0.03, 0.065, 0.1, 20, 1, true), std(0x2b2b2b, { side: THREE.DoubleSide })), 0.17, h + 0.4);
        head.rotation.z = 0.5;
        at(glow(new THREE.SphereGeometry(0.025, 12, 10)), 0.18, h + 0.38);
        lightY = h + 0.3;
        lightZ = 0;
        haloY = h + 0.38;
        haloScale = 0.45;
        hitY = h + 0.25;
        hitR = 0.25;
        labelY = h + 0.6;
        break;
      }
      default: {
        // Suspension avec abat-jour
        cord(h + 0.1);
        at(mesh(new THREE.CylinderGeometry(0.05, 0.17, 0.15, 28, 1, true), std(0x2b2b2b, { side: THREE.DoubleSide })), 0, h + 0.06);
        at(glow(new THREE.SphereGeometry(0.055, 20, 14)), 0, h);
      }
    }

    this.light = new THREE.PointLight(0xffffff, 0, 8, 1.6);
    this.light.position.set(0, lightY, lightZ);
    this.group.add(this.light);
    if (haloY !== undefined) {
      this.halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: ctx.halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
      );
      this.halo.scale.setScalar(haloScale);
      this.halo.position.y = haloY;
      this.group.add(this.halo);
    }
    this.addHitArea(hitR, hitY);
    this.label.position.y = labelY;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const on = entity?.state === "on";
    const b = typeof entity?.attributes.brightness === "number" ? entity.attributes.brightness / 255 : 1;
    this.targetLevel = on ? 0.15 + 0.85 * b : 0;
    const color = lightColor(entity);
    this.light.color.copy(color);
    this.glows.forEach((m, i) => {
      // Panneaux et rubans multizones : légère variation de teinte d'un élément à l'autre.
      m.emissive.copy(color);
      if (MULTIZONE.has(this.shape) && Array.isArray(entity?.attributes.rgb_color)) m.emissive.offsetHSL((i - 2) * 0.05, 0, 0);
    });
    this.washes.forEach((m) => m.color.copy(color));
    this.halo?.material.color.copy(color);
  }

  tick(dt: number): void {
    if (this.level === this.targetLevel) return;
    const k = 1 - Math.exp(-dt * 8);
    this.level += (this.targetLevel - this.level) * k;
    if (Math.abs(this.level - this.targetLevel) < 0.002) this.level = this.targetLevel;
    this.light.intensity = this.level * this.power;
    for (const m of this.glows) m.emissiveIntensity = this.level * 3;
    for (const m of this.washes) m.opacity = this.level * 0.8;
    if (this.halo) this.halo.material.opacity = Math.min(1, this.level * 1.1);
  }
}

/** Formes à plusieurs zones de couleur (RGBIC) : petite variation de teinte d'une zone à l'autre. */
const MULTIZONE = new Set<Shape>(["hexa", "corner_lamp", "string_lights"]);

/** Sonnette vidéo murale (vue caméra ou capteur de sonnerie). */
function buildDoorbell(group: THREE.Group, h: number, led: THREE.Material): void {
  const body = mesh(new THREE.BoxGeometry(0.045, 0.13, 0.025), std(0x1e2125, { roughness: 0.3 }));
  body.position.y = h;
  const lens = mesh(new THREE.CircleGeometry(0.011, 16), std(0x050505, { roughness: 0.1 }), false);
  lens.position.set(0, h + 0.035, 0.0126);
  const button = mesh(new THREE.CircleGeometry(0.014, 20), led, false);
  button.position.set(0, h - 0.035, 0.0126);
  group.add(body, lens, button);
}

// ---------------------------------------------------------------------------

class CameraView extends DeviceView {
  private led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 3 });

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const white = std(0xf4f4f2, { roughness: 0.35 });
    const lensMat = std(0x0d0d0f, { roughness: 0.1, metalness: 0.4 });
    if (this.shape === "doorbell") {
      this.mountOnWall(0.025, 0.6);
      buildDoorbell(this.group, h, this.led);
      this.addHitArea(0.18, h);
      this.label.position.y = h + 0.15;
    } else if (this.shape === "camera_dome") {
      const base = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 28), white);
      base.position.y = h + 0.025;
      const head = mesh(new THREE.SphereGeometry(0.055, 28, 20), white);
      head.position.y = h + 0.1;
      const lens = mesh(new THREE.CircleGeometry(0.025, 20), lensMat, false);
      lens.position.set(0, h + 0.1, 0.054);
      const led = mesh(new THREE.SphereGeometry(0.006, 8, 6), this.led, false);
      led.position.set(0, h + 0.135, 0.046);
      this.group.add(base, head, lens, led);
      this.addHitArea(0.2, h + 0.08);
      this.label.position.y = h + 0.22;
    } else {
      this.mountOnWall(0.12, 0.6);
      const arm = mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), white, false);
      arm.position.set(0, h, -0.03);
      const body = mesh(new THREE.BoxGeometry(0.07, 0.07, 0.11), white);
      body.position.set(0, h, 0.02);
      body.rotation.x = 0.25;
      const lens = mesh(new THREE.CircleGeometry(0.022, 20), lensMat, false);
      lens.position.set(0, h - 0.015, 0.077);
      lens.rotation.x = 0.25;
      const led = mesh(new THREE.SphereGeometry(0.006, 8, 6), this.led, false);
      led.position.set(0.025, h + 0.02, 0.07);
      this.group.add(arm, body, lens, led);
      this.addHitArea(0.2, h);
      this.label.position.y = h + 0.15;
    }
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const s = entity?.state;
    this.led.emissive.set(s === "recording" || s === "streaming" ? 0xff3b30 : s === "idle" ? 0x4cd97b : 0x000000);
  }
}

// ---------------------------------------------------------------------------

class ClimateView extends DeviceView {
  private led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 2 });
  private flow: THREE.Points;
  private flowMat: THREE.PointsMaterial;
  private seeds: Float32Array;
  private active = false;
  private strength = 0;
  private airflow = true;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const white = std(0xf7f7f5, { roughness: 0.35 });
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
      const m = mesh(geo, mat, shadow);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    let hitR = 0.4;
    let labelY = h + 0.2;
    // Flux d'air : sous la clim, au-dessus du radiateur ; rien pour un thermostat ou une tête thermostatique.
    let flowAt = new THREE.Vector3(0, h - 0.12, 0.12);
    this.airflow = this.shape === "ac" || this.shape === "heater";
    switch (this.shape) {
      case "thermostat":
        this.mountOnWall(0.025, 0.5);
        put(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 32), white, 0, h, 0).rotation.x = Math.PI / 2;
        put(new THREE.TorusGeometry(0.038, 0.003, 6, 32), this.led, 0, h, 0.0135, false);
        hitR = 0.18;
        labelY = h + 0.12;
        break;
      case "valve":
        // Tête thermostatique sur le radiateur : petit cylindre vertical.
        this.mountOnWall(0.06, 0.5);
        put(new THREE.CylinderGeometry(0.028, 0.03, 0.09, 24), white, 0, h, 0);
        put(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), std(0xb0b5ba), 0, h - 0.06, 0, false);
        put(new THREE.SphereGeometry(0.005, 8, 6), this.led, 0, h + 0.03, 0.029, false);
        hitR = 0.18;
        labelY = h + 0.12;
        break;
      case "heater": {
        this.mountOnWall(0.08, 0.6);
        put(new THREE.BoxGeometry(0.8, 0.5, 0.07), white, 0, h, 0);
        for (let i = -3; i <= 3; i++) put(new THREE.BoxGeometry(0.09, 0.44, 0.005), std(0xe6e6e3), i * 0.105, h, 0.037, false);
        put(new THREE.SphereGeometry(0.008, 8, 6), this.led, 0.34, h + 0.2, 0.038, false);
        flowAt = new THREE.Vector3(0, h + 0.25, 0.05);
        labelY = h + 0.4;
        break;
      }
      default: {
        this.mountOnWall(0.22);
        put(new THREE.BoxGeometry(0.86, 0.28, 0.22), white, 0, h, 0);
        put(new THREE.BoxGeometry(0.7, 0.04, 0.02), std(0x2c2f33), 0, h - 0.1, 0.105, false);
        put(new THREE.SphereGeometry(0.012, 8, 6), this.led, 0.33, h + 0.05, 0.112, false);
      }
    }

    const N = 90;
    this.seeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.seeds[i * 3] = Math.random();
      this.seeds[i * 3 + 1] = Math.random() * 2 - 1;
      this.seeds[i * 3 + 2] = 0.7 + Math.random() * 0.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.flowMat = new THREE.PointsMaterial({
      size: 0.07,
      map: ctx.halo,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flow = new THREE.Points(geo, this.flowMat);
    this.flow.frustumCulled = false;
    this.flow.position.copy(flowAt);
    this.group.add(this.flow);

    this.addHitArea(hitR, h);
    this.label.position.y = labelY;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    this.active = isActive("climate", entity);
    const mode = entity?.state ?? "off";
    const action = entity?.attributes.hvac_action as string | undefined;
    const heating = mode === "heat" || action === "heating";
    const color = !this.active ? 0x333333 : heating ? 0xff8a4c : mode === "fan_only" || mode === "dry" ? 0xd8ecff : 0x6cc4ff;
    this.led.emissive.set(this.active ? color : 0x000000);
    this.flowMat.color.set(color);
  }

  tick(dt: number, time: number): void {
    const target = this.active && this.airflow ? 1 : 0;
    this.strength += (target - this.strength) * (1 - Math.exp(-dt * 3));
    this.flowMat.opacity = this.strength * 0.75;
    this.flow.visible = this.strength > 0.01;
    if (!this.flow.visible) return;
    const pos = this.flow.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const s = (time * 0.35 * this.seeds[i * 3 + 2] + this.seeds[i * 3]) % 1;
      const lateral = this.seeds[i * 3 + 1];
      // Radiateur : l'air chaud monte le long du mur ; clim : l'air descend vers la pièce.
      if (this.shape === "heater") pos.setXYZ(i, lateral * 0.36, s * 0.7, 0.02 + s * 0.12);
      else pos.setXYZ(i, lateral * (0.33 + s * 0.35), -s * s * 1.1, s * 1.7);
    }
    pos.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------

/** Position (mm) lue dans un attribut { x, y }, sinon undefined. */
function xy(v: unknown): { x: number; y: number } | undefined {
  const o = v as { x?: unknown; y?: unknown } | undefined;
  return o && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y)) ? { x: Number(o.x), y: Number(o.y) } : undefined;
}

/** Points { x, y } trouvés dans l'attribut « path » (formats variables selon l'intégration). */
function pathPoints(v: unknown, depth = 0, out: { x: number; y: number }[] = []): { x: number; y: number }[] {
  if (depth > 4 || !v || typeof v !== "object" || out.length > 5000) return out;
  const p = xy(v);
  if (p && !Array.isArray(v)) {
    out.push(p);
    return out;
  }
  for (const child of Object.values(v as object)) pathPoints(child, depth + 1, out);
  return out;
}

class VacuumView extends DeviceView {
  private robot = new THREE.Group();
  private trail?: THREE.Line;
  private trailCount = -1;
  private led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 2.5 });
  private dock = new THREE.Vector3();
  private area = new THREE.Box2();
  private phase = Math.random() * 10;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const [x, y] = cfg.position;
    const hit = ctx.house.nearestWall(x, y, 1.2);
    const inward = hit?.inward ?? new THREE.Vector3(0, 0, 1);

    const base = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.12), std(0x1f2226));
    base.position.y = 0.05;
    base.rotation.y = Math.atan2(inward.x, inward.z);
    this.group.add(base);

    const body = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 36), std(0x2a2d31, { roughness: 0.3 }));
    body.position.y = 0.045;
    const top = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), std(0x4a4f56), false);
    top.position.set(0, 0.095, -0.05);
    const led = mesh(new THREE.SphereGeometry(0.014, 8, 6), this.led, false);
    led.position.set(0, 0.09, 0.12);
    this.robot.add(body, top, led);
    this.group.add(this.robot);

    this.dock.copy(inward).multiplyScalar(0.3);
    this.robot.position.copy(this.dock);
    this.robot.rotation.y = Math.atan2(inward.x, inward.z);

    // Zone de balade : la pièce de la base, en coordonnées locales.
    const room = ctx.house.roomAt(x + inward.x * 0.3, y + inward.z * 0.3);
    if (room) {
      this.area.set(
        new THREE.Vector2(room.x - x + 0.25, room.y - y + 0.25),
        new THREE.Vector2(room.x + room.w - x - 0.25, room.y + room.d - y - 0.25),
      );
    } else {
      this.area.set(new THREE.Vector2(-1.5, -1.5), new THREE.Vector2(1.5, 1.5));
    }

    const hitArea = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial());
    hitArea.visible = false;
    this.robot.add(hitArea);
    this.pickables.push(hitArea);
    this.robot.add(this.label);
    this.label.position.y = 0.2;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const s = entity?.state;
    this.led.emissive.set(s === "cleaning" ? 0x4cd97b : s === "returning" ? 0x6cc4ff : s === "error" ? 0xff4c4c : 0x000000);
  }

  /** Position réelle (repère local) d'après la carte du robot, si elle est disponible. */
  private realTarget(): THREE.Vector3 | undefined {
    if (!this.cfg.position_entity) return undefined;
    const a = this.ctx.stateOf(this.cfg.position_entity)?.attributes;
    const pos = xy(a?.vacuum_position);
    const charger = xy(a?.charger);
    if (!pos || !charger) return undefined;
    this.updateTrail(a?.path, charger);
    return this.toLocal(pos, charger);
  }

  /** Coordonnées du robot (mm, y vers le haut, origine quelconque) → repère local, base = dock. */
  private toLocal(p: { x: number; y: number }, charger: { x: number; y: number }): THREE.Vector3 {
    let dx = (p.x - charger.x) / 1000;
    const dy = -(p.y - charger.y) / 1000;
    if (this.cfg.map_flip) dx = -dx;
    const r = THREE.MathUtils.degToRad(this.cfg.map_rotation ?? 0);
    return new THREE.Vector3(this.dock.x + dx * Math.cos(r) - dy * Math.sin(r), 0, this.dock.z + dx * Math.sin(r) + dy * Math.cos(r));
  }

  /** Trajet du nettoyage tracé au sol. */
  private updateTrail(path: unknown, charger: { x: number; y: number }): void {
    const pts = pathPoints(path);
    if (pts.length === this.trailCount) return;
    this.trailCount = pts.length;
    if (this.trail) {
      this.group.remove(this.trail);
      this.trail.geometry.dispose();
      (this.trail.material as THREE.Material).dispose();
      this.trail = undefined;
    }
    if (pts.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => this.toLocal(p, charger).setY(0.012)));
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4cd97b, transparent: true, opacity: 0.6 }));
    this.group.add(this.trail);
  }

  tick(dt: number, time: number): void {
    const s = this.entity?.state;
    const p = this.robot.position;
    const real = this.realTarget();
    let target: THREE.Vector3 | undefined;
    if (real) {
      // Position réelle : on la rejoint vite, sans simulation.
      const delta = new THREE.Vector3().subVectors(real, p).setY(0);
      if (delta.length() > 0.005) {
        p.addScaledVector(delta, Math.min(1, dt * 4));
        let diff = Math.atan2(delta.x, delta.z) - this.robot.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (delta.length() > 0.03) this.robot.rotation.y += diff * Math.min(1, dt * 6);
      }
      return;
    }
    if (s === "cleaning") {
      const c = this.area.getCenter(new THREE.Vector2());
      const half = this.area.getSize(new THREE.Vector2()).multiplyScalar(0.5);
      const k = time * 0.18 + this.phase;
      target = new THREE.Vector3(c.x + Math.sin(k) * half.x, 0, c.y + Math.sin(k * 1.7) * half.y);
    } else if (s === "returning" || s === "docked") {
      target = this.dock;
    }
    if (!target) return;
    const delta = new THREE.Vector3().subVectors(target, p).setY(0);
    const dist = delta.length();
    if (dist < 0.005) return;
    const step = Math.min(dist, dt * (s === "docked" ? 0.8 : 0.35));
    p.addScaledVector(delta.normalize(), step);
    const heading = Math.atan2(delta.x, delta.z);
    let diff = heading - this.robot.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.robot.rotation.y += diff * Math.min(1, dt * 6);
  }
}

// ---------------------------------------------------------------------------

class CoverView extends DeviceView {
  /** Tablier du volet / toile du store (déroulé vers le bas), ou les deux pans de rideau. */
  private panels: THREE.Mesh[] = [];
  private boxMesh?: THREE.Mesh;
  private span: number;
  private width: number;
  private pieceIndex = -1;
  private open = 1;
  private targetOpen = 1;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const hit = this.mountOnWall(0.04);
    const opening = hit?.opening;
    const width = opening ? opening.b - opening.a + 0.06 : 1;
    const isDoor = !!opening && opening.cfg.type !== "window";
    const top = isDoor ? 2.05 : 2.1;
    const bottom = isDoor ? 0 : 0.9;
    this.span = top - bottom;
    this.width = width;
    this.pieceIndex = hit?.pieceIndex ?? -1;
    if (hit) {
      // Volet : côté extérieur (on recule de toute l'épaisseur du mur). Store et rideaux : côté pièce.
      if (this.shape === "shutter") this.group.position.addScaledVector(hit.inward, -(WALL_T + 0.04));
      else this.group.position.addScaledVector(hit.inward, this.shape === "curtain" ? 0.08 : 0.03);
      if (opening) {
        const mid = (opening.a + opening.b) / 2;
        if (hit.axis === "h") this.group.position.x = mid;
        else this.group.position.z = mid;
      }
    }
    if (this.shape === "curtain") {
      // Deux pans de rideau sur une tringle, jusqu'au sol.
      const rodY = Math.min(ctx.wallH - 0.08, top + 0.25);
      const fabric = std(0xd9cbb5, { roughness: 0.95, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const geo = new THREE.BoxGeometry(1, rodY - 0.02, 0.03);
        // Ancré sur le bord extérieur : le pan se replie vers son côté.
        geo.translate(-side * 0.5, (rodY - 0.02) / 2 + 0.02, 0);
        const panel = mesh(geo, fabric);
        panel.position.x = side * (width / 2 + 0.15);
        this.panels.push(panel);
        this.group.add(panel);
      }
      this.boxMesh = mesh(new THREE.CylinderGeometry(0.012, 0.012, width + 0.4, 8), std(0x2b2b2b), false);
      this.boxMesh.rotation.z = Math.PI / 2;
      this.boxMesh.position.y = rodY;
      this.group.add(this.boxMesh);
      this.span = rodY;
      this.addHitArea(0.45, rodY / 2);
      this.label.position.y = rodY + 0.15;
      return;
    }
    const geo = new THREE.BoxGeometry(width, 1, this.shape === "blind" ? 0.006 : 0.025);
    geo.translate(0, -0.5, 0);
    const mat = this.shape === "blind" ? std(0xefe9df, { roughness: 0.95 }) : std(0x8f989f, { roughness: 0.7 });
    const panel = mesh(geo, mat);
    panel.position.y = top;
    this.panels.push(panel);
    this.boxMesh =
      this.shape === "blind"
        ? mesh(new THREE.CylinderGeometry(0.025, 0.025, width + 0.04, 16), std(0xf2f2f0))
        : mesh(new THREE.BoxGeometry(width + 0.04, 0.14, 0.14), std(0xe9e9e6));
    if (this.shape === "blind") this.boxMesh.rotation.z = Math.PI / 2;
    this.boxMesh.position.set(0, top + (this.shape === "blind" ? 0.03 : 0.07), this.shape === "blind" ? 0 : -0.03);
    this.group.add(panel, this.boxMesh);
    this.addHitArea(0.45, bottom + this.span / 2);
    this.label.position.y = top + 0.2;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const pos = entity?.attributes.current_position;
    this.targetOpen = typeof pos === "number" ? pos / 100 : entity?.state === "closed" ? 0 : 1;
  }

  tick(dt: number): void {
    this.open += (this.targetOpen - this.open) * (1 - Math.exp(-dt * 4));
    if (this.shape === "curtain") {
      // Ouvert : pans repliés sur les côtés ; fermé : ils se rejoignent au milieu.
      const w = 0.2 + (1 - this.open) * (this.width / 2 + 0.15 - 0.2);
      for (const p of this.panels) p.scale.x = w;
    } else {
      for (const p of this.panels) p.scale.y = Math.max(0.03, (1 - this.open) * this.span);
    }
    // Si le mur est rabaissé, on masque l'élément pour ne pas gêner la vue.
    const hidden = this.ctx.house.pieceLowness(this.pieceIndex) > 0.5;
    for (const p of this.panels) p.visible = !hidden;
    if (this.boxMesh) this.boxMesh.visible = !hidden;
  }
}

// ---------------------------------------------------------------------------

class FanView extends DeviceView {
  private rotor = new THREE.Group();
  private speed = 0;
  private targetSpeed = 0;
  private led?: THREE.MeshStandardMaterial;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const white = std(0xf2f2f0, { roughness: 0.4 });
    if (this.shape === "purifier") {
      // Purificateur / humidificateur : colonne, grille en haut, anneau lumineux.
      const body = mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.55, 32), white);
      body.position.y = h + 0.275;
      const grille = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 32), std(0x3a3d42), false);
      grille.position.y = h + 0.555;
      this.led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 2 });
      const ring = mesh(new THREE.TorusGeometry(0.105, 0.005, 6, 40), this.led, false);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h + 0.556;
      this.rotor.position.y = h + 0.562;
      for (let i = 0; i < 3; i++) {
        const blade = mesh(new THREE.BoxGeometry(0.08, 0.004, 0.02), std(0x6a6f76), false);
        blade.position.x = 0.04;
        const arm = new THREE.Group();
        arm.rotation.y = (i * Math.PI * 2) / 3;
        arm.add(blade);
        this.rotor.add(arm);
      }
      this.group.add(body, grille, ring, this.rotor);
      this.addHitArea(0.3, h + 0.3);
      this.label.position.y = h + 0.75;
      return;
    }
    if (this.shape === "fan_stand") {
      // Ventilateur sur pied : socle, mât, hélice verticale dans une grille.
      const base = mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.03, 32), white);
      base.position.y = h + 0.015;
      const pole = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 10), white, false);
      pole.position.y = h + 0.5;
      const head = new THREE.Group();
      head.position.y = h + 1.05;
      const cage = mesh(new THREE.TorusGeometry(0.2, 0.006, 6, 40), std(0xdedede), false);
      const motor = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 20), white);
      motor.rotation.x = Math.PI / 2;
      motor.position.z = -0.06;
      this.rotor.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const blade = mesh(new THREE.BoxGeometry(0.17, 0.006, 0.06), std(0xcfd5da, { transparent: true, opacity: 0.85 }), false);
        blade.position.x = 0.09;
        const arm = new THREE.Group();
        arm.rotation.y = (i * Math.PI * 2) / 5;
        arm.add(blade);
        this.rotor.add(arm);
      }
      head.add(cage, motor, this.rotor);
      this.group.add(base, pole, head);
      this.addHitArea(0.35, h + 0.9);
      this.label.position.y = h + 1.35;
      return;
    }
    const rod = mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.max(0.05, ctx.wallH - h), 6), std(0x333333), false);
    rod.position.y = (ctx.wallH + h) / 2;
    const hub = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 20), std(0xdedede));
    this.rotor.position.y = h;
    this.rotor.add(hub);
    for (let i = 0; i < 4; i++) {
      const blade = mesh(new THREE.BoxGeometry(0.5, 0.012, 0.11), std(0x9c7b55));
      blade.position.x = 0.3;
      const arm = new THREE.Group();
      arm.rotation.y = (i * Math.PI) / 2;
      arm.add(blade);
      this.rotor.add(arm);
    }
    this.group.add(rod, this.rotor);
    this.addHitArea(0.45, h);
    this.label.position.y = h + 0.15;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const pct = entity?.attributes.percentage;
    const on = entity?.state === "on";
    this.targetSpeed = on ? (typeof pct === "number" ? pct / 100 : 0.6) * 14 : 0;
    this.led?.emissive.set(on ? 0x38b6ff : 0x000000);
  }

  tick(dt: number): void {
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.exp(-dt * 1.5));
    this.rotor.rotation.y += this.speed * dt;
  }
}

// ---------------------------------------------------------------------------

class SwitchView extends DeviceView {
  private led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 3 });

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const white = std(0xf5f5f3, { roughness: 0.4 });
    const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = mesh(geo, mat, false);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    let labelY = h + 0.12;
    switch (this.shape) {
      case "wall_switch":
        this.mountOnWall(0.012, 0.4);
        put(new THREE.BoxGeometry(0.086, 0.086, 0.012), white, 0, h, 0);
        put(new THREE.BoxGeometry(0.06, 0.06, 0.006), std(0xeaeaea), 0, h, 0.008);
        put(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0, h - 0.035, 0.008);
        break;
      case "module":
        // Micromodule ou relais : petit boîtier (souvent caché dans le mur).
        this.mountOnWall(0.02, 0.4);
        put(new THREE.BoxGeometry(0.045, 0.045, 0.02), std(0x2b2d31), 0, h, 0);
        put(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0.015, h + 0.015, 0.011);
        labelY = h + 0.08;
        break;
      case "media_box":
        // Boîtier posé sur un meuble (Hue Sync Box…).
        put(new THREE.BoxGeometry(0.16, 0.03, 0.1), std(0x1c1d20, { roughness: 0.3 }), 0, h + 0.015, 0).castShadow = true;
        put(new THREE.BoxGeometry(0.012, 0.004, 0.004), this.led, 0, h + 0.012, 0.051);
        labelY = h + 0.15;
        break;
      case "power_strip":
        put(new THREE.BoxGeometry(0.34, 0.04, 0.07), white, 0, h + 0.02, 0).castShadow = true;
        for (const x of [-0.1, 0, 0.1]) put(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 16), std(0xdcdcdc), x, h + 0.041, 0);
        put(new THREE.SphereGeometry(0.005, 8, 6), this.led, 0.155, h + 0.041, 0);
        labelY = h + 0.15;
        break;
      default:
        this.mountOnWall(0.05, 0.4);
        put(new THREE.BoxGeometry(0.08, 0.11, 0.05), white, 0, h, 0).castShadow = true;
        put(new THREE.SphereGeometry(0.01, 8, 6), this.led, 0, h + 0.035, 0.027);
    }
    this.addHitArea(0.22, h);
    this.label.position.y = labelY;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    this.led.emissive.set(entity?.state === "on" ? 0x4cd97b : 0x000000);
  }
}

// ---------------------------------------------------------------------------

class MediaView extends DeviceView {
  private screen = std(0x050505, { roughness: 0.2, emissive: 0x000000, emissiveIntensity: 1 });
  private ring?: THREE.MeshStandardMaterial;

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const add = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      this.group.add(o);
      return o;
    };
    if (this.shape === "speaker") {
      add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 32), std(0x3a3d42, { roughness: 0.9 })), 0, h + 0.045, 0);
      this.ring = std(0x111111, { emissive: 0x000000, emissiveIntensity: 2 });
      add(mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 32), this.ring, false), 0, h + 0.09, 0).rotation.x = Math.PI / 2;
      this.addHitArea(0.18, h + 0.05);
      this.label.position.y = h + 0.18;
      return;
    }
    if (this.shape === "soundbar" || this.shape === "media_box") {
      // Barre de son devant la TV, ou petit boîtier (Apple TV, Chromecast…).
      const bar = this.shape === "soundbar";
      const size: [number, number, number] = bar ? [0.9, 0.07, 0.1] : [0.1, 0.035, 0.1];
      add(mesh(new THREE.BoxGeometry(...size), std(0x1c1d20, { roughness: bar ? 0.85 : 0.3 })), 0, h + size[1] / 2, 0);
      this.ring = std(0x111111, { emissive: 0x000000, emissiveIntensity: 2 });
      add(mesh(new THREE.BoxGeometry(bar ? 0.05 : 0.012, 0.004, 0.004), this.ring, false), 0, h + 0.012, size[2] / 2 + 0.002);
      this.addHitArea(bar ? 0.35 : 0.15, h + 0.04);
      this.label.position.y = h + 0.18;
      return;
    }
    if (this.shape === "smart_display") {
      // Écran connecté (Echo Show, Nest Hub) : dalle inclinée sur un socle.
      add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.08), std(0x3a3d42, { roughness: 0.9 })), 0, h + 0.03, 0);
      const panel = new THREE.Group();
      panel.add(mesh(new THREE.BoxGeometry(0.2, 0.13, 0.012), std(0x111111, { roughness: 0.3 })));
      const screen = mesh(new THREE.PlaneGeometry(0.18, 0.11), this.screen, false);
      screen.position.z = 0.0065;
      panel.add(screen);
      panel.rotation.x = -0.25;
      add(panel, 0, h + 0.1, 0.02);
      this.addHitArea(0.2, h + 0.08);
      this.label.position.y = h + 0.25;
      return;
    }
    this.mountOnWall(0.05);
    add(mesh(new THREE.BoxGeometry(1.3, 0.76, 0.045), std(0x111111, { roughness: 0.3 })), 0, h, 0);
    add(mesh(new THREE.PlaneGeometry(1.26, 0.72), this.screen, false), 0, h, 0.0235);
    this.addHitArea(0.5, h);
    this.label.position.y = h + 0.42;
  }

  tick(_dt: number, time: number): void {
    const s = this.entity?.state;
    if (this.ring) {
      this.ring.emissive.set(s === "playing" ? 0x38b6ff : 0x000000);
      this.ring.emissiveIntensity = s === "playing" ? 1.5 + Math.sin(time * 3) : 0;
      return;
    }
    if (s === "playing") this.screen.emissive.setHSL((time * 0.05) % 1, 0.55, 0.45);
    else if (s === "paused" || s === "on" || s === "idle") this.screen.emissive.setRGB(0.12, 0.14, 0.18);
    else this.screen.emissive.setRGB(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------

class SensorView extends DeviceView {
  private led = std(0x333333, { emissive: 0x000000, emissiveIntensity: 3 });

  constructor(cfg: DeviceConfig, ctx: DeviceContext) {
    super(cfg, ctx);
    const h = this.height;
    const white = std(0xfafafa, { roughness: 0.4 });
    const dark = std(0x1a1a1a, { roughness: 0.2 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = mesh(geo, mat, false);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    let hitY = h;
    let labelY = h + 0.1;
    switch (this.shape) {
      case "motion":
        this.mountOnWall(0.05, 0.5);
        add(new THREE.BoxGeometry(0.06, 0.06, 0.045), white, 0, h, 0);
        add(new THREE.SphereGeometry(0.018, 16, 12), dark, 0, h - 0.005, 0.02);
        add(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0.02, h + 0.02, 0.023);
        break;
      case "contact":
        this.mountOnWall(0.016, 0.5);
        add(new THREE.BoxGeometry(0.022, 0.07, 0.016), white, -0.02, h, 0);
        add(new THREE.BoxGeometry(0.014, 0.05, 0.012), white, 0.012, h, 0);
        add(new THREE.SphereGeometry(0.003, 8, 6), this.led, -0.02, h + 0.028, 0.009);
        break;
      case "smoke": {
        const y = this.ctx.wallH - 0.02;
        add(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 32), white, 0, y, 0);
        add(new THREE.SphereGeometry(0.006, 8, 6), this.led, 0.03, y - 0.021, 0);
        hitY = y - 0.05;
        labelY = y + 0.05;
        break;
      }
      case "button":
        this.mountOnWall(0.012, 0.5);
        add(new THREE.BoxGeometry(0.07, 0.115, 0.012), white, 0, h, 0);
        for (const dy of [0.03, 0.01, -0.01, -0.03]) add(new THREE.BoxGeometry(0.05, 0.014, 0.004), std(0xe8e8e8), 0, h + dy, 0.008);
        add(new THREE.SphereGeometry(0.003, 8, 6), this.led, 0, h + 0.05, 0.007);
        break;
      case "bridge":
        add(new THREE.BoxGeometry(0.09, 0.026, 0.09), white, 0, h + 0.013, 0);
        add(new THREE.TorusGeometry(0.02, 0.003, 6, 24), this.led, 0, h + 0.027, 0).rotation.x = Math.PI / 2;
        hitY = h + 0.02;
        labelY = h + 0.12;
        break;
      case "hub":
        this.mountOnWall(0.03, 0.5);
        add(new THREE.BoxGeometry(0.05, 0.075, 0.03), white, 0, h, 0);
        add(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0, h + 0.025, 0.016);
        break;
      case "litter": {
        // Litière autonettoyante : socle + globe, ouverture tournée vers la pièce.
        this.mountOnWall(0.6, 0.9);
        const body = std(0xf2f2f0, { roughness: 0.35 });
        add(new THREE.BoxGeometry(0.56, 0.14, 0.6), body, 0, 0.07, 0).castShadow = true;
        const globe = add(new THREE.SphereGeometry(0.3, 32, 24), body, 0, 0.42, 0);
        globe.scale.set(0.95, 0.95, 1);
        globe.castShadow = true;
        const door = add(new THREE.CircleGeometry(0.16, 28), std(0x2a2d31, { roughness: 0.6 }), 0, 0.36, 0.29);
        door.rotation.x = -0.15;
        add(new THREE.BoxGeometry(0.3, 0.025, 0.12), std(0x7a7f86), 0, 0.15, 0.3);
        add(new THREE.SphereGeometry(0.008, 8, 6), this.led, 0.18, 0.15, 0.3);
        hitY = 0.35;
        labelY = 0.8;
        break;
      }
      case "feeder": {
        const body = std(0xf2f2f0, { roughness: 0.35 });
        add(new THREE.BoxGeometry(0.22, 0.32, 0.22), body, 0, h + 0.16, 0).castShadow = true;
        add(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), std(0xb0b5ba), 0, h + 0.33, 0);
        add(new THREE.CylinderGeometry(0.08, 0.06, 0.04, 24), std(0x8a9096), 0, h + 0.02, 0.17);
        add(new THREE.SphereGeometry(0.006, 8, 6), this.led, 0.06, h + 0.25, 0.111);
        hitY = h + 0.16;
        labelY = h + 0.45;
        break;
      }
      case "leak":
        // Détecteur de fuite posé au sol.
        add(new THREE.CylinderGeometry(0.035, 0.037, 0.02, 24), white, 0, h + 0.01, 0);
        add(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0.02, h + 0.021, 0);
        hitY = h + 0.03;
        labelY = h + 0.12;
        break;
      case "plant_sensor": {
        // Capteur planté dans un pot.
        add(new THREE.CylinderGeometry(0.1, 0.075, 0.18, 24), std(0xb5694a, { roughness: 0.9 }), 0, h + 0.09, 0).castShadow = true;
        const leaf = std(0x4f8a3c, { roughness: 0.8 });
        for (const [x, y, z, r] of [
          [0, 0.3, 0, 0.1],
          [0.06, 0.25, 0.03, 0.07],
          [-0.05, 0.26, -0.03, 0.07],
        ]) add(new THREE.SphereGeometry(r, 14, 10), leaf, x, h + y, z).castShadow = true;
        add(new THREE.BoxGeometry(0.015, 0.1, 0.006), white, 0.06, h + 0.2, 0.06);
        add(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0.06, h + 0.24, 0.064);
        hitY = h + 0.2;
        labelY = h + 0.48;
        break;
      }
      case "lock":
        // Serrure sur la porte : boîtier et bouton tournant.
        this.mountOnWall(0.06, 0.6);
        add(new THREE.BoxGeometry(0.06, 0.12, 0.05), std(0x2b2d31, { roughness: 0.3, metalness: 0.4 }), 0, h, 0);
        add(new THREE.CylinderGeometry(0.022, 0.022, 0.015, 24), std(0xb8bcc2, { metalness: 0.6, roughness: 0.3 }), 0, h + 0.01, 0.032).rotation.x = Math.PI / 2;
        add(new THREE.TorusGeometry(0.02, 0.003, 6, 24), this.led, 0, h + 0.01, 0.04);
        labelY = h + 0.14;
        break;
      case "doorbell":
        this.mountOnWall(0.025, 0.6);
        buildDoorbell(this.group, h, this.led);
        labelY = h + 0.15;
        break;
      case "siren":
        this.mountOnWall(0.08, 0.6);
        add(new THREE.BoxGeometry(0.14, 0.14, 0.05), white, 0, h, 0);
        add(new THREE.SphereGeometry(0.04, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.led, 0, h, 0.025).rotation.x = Math.PI / 2;
        labelY = h + 0.16;
        break;
      case "router":
        add(new THREE.BoxGeometry(0.24, 0.045, 0.16), std(0x2b2d31, { roughness: 0.4 }), 0, h + 0.0225, 0).castShadow = true;
        add(new THREE.BoxGeometry(0.03, 0.004, 0.004), this.led, 0, h + 0.03, 0.081);
        hitY = h + 0.04;
        labelY = h + 0.15;
        break;
      case "module":
        this.mountOnWall(0.02, 0.4);
        add(new THREE.BoxGeometry(0.045, 0.045, 0.02), std(0x2b2d31), 0, h, 0);
        add(new THREE.SphereGeometry(0.004, 8, 6), this.led, 0.015, h + 0.015, 0.011);
        labelY = h + 0.08;
        break;
      case "meter":
        // Compteur électrique (Linky) / module de mesure au tableau.
        this.mountOnWall(0.08, 0.6);
        add(new THREE.BoxGeometry(0.17, 0.25, 0.08), std(0xd8dccf, { roughness: 0.5 }), 0, h, 0);
        add(new THREE.PlaneGeometry(0.1, 0.035), dark, 0, h + 0.05, 0.0405);
        add(new THREE.SphereGeometry(0.005, 8, 6), this.led, 0.05, h + 0.09, 0.04);
        labelY = h + 0.2;
        break;
      case "wallbox":
        // Borne de recharge murale avec câble enroulé.
        this.mountOnWall(0.12, 0.6);
        add(new THREE.BoxGeometry(0.25, 0.35, 0.12), std(0x2b2d31, { roughness: 0.35 }), 0, h, 0).castShadow = true;
        add(new THREE.TorusGeometry(0.1, 0.012, 8, 28), std(0x111111), 0, h - 0.05, 0.075);
        add(new THREE.BoxGeometry(0.12, 0.012, 0.004), this.led, 0, h + 0.12, 0.061);
        labelY = h + 0.3;
        break;
      case "mower": {
        // Robot tondeuse : coque arrondie et roues.
        const shell = add(new THREE.SphereGeometry(0.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6a6f76, { roughness: 0.4 }), 0, h + 0.05, 0);
        shell.scale.set(1, 0.5, 1.3);
        shell.castShadow = true;
        for (const [x, z] of [
          [-0.2, -0.18],
          [0.2, -0.18],
        ])
          add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20), dark, x, h + 0.08, z).rotation.z = Math.PI / 2;
        add(new THREE.SphereGeometry(0.008, 8, 6), this.led, 0, h + 0.18, 0.1);
        hitY = h + 0.12;
        labelY = h + 0.35;
        break;
      }
      case "fountain": {
        // Fontaine à eau pour animaux : bol blanc et eau qui brille quand la pompe tourne.
        add(new THREE.CylinderGeometry(0.11, 0.09, 0.14, 28), white, 0, h + 0.07, 0).castShadow = true;
        const water = add(new THREE.CircleGeometry(0.09, 28), this.led, 0, h + 0.141, 0);
        water.rotation.x = -Math.PI / 2;
        hitY = h + 0.1;
        labelY = h + 0.3;
        break;
      }
      default:
        // Thermomètre / hygromètre avec petit écran
        this.mountOnWall(0.025, 0.4);
        add(new THREE.BoxGeometry(0.07, 0.07, 0.022), white, 0, h, 0);
        add(new THREE.PlaneGeometry(0.05, 0.034), dark, 0, h + 0.008, 0.0115);
        add(new THREE.SphereGeometry(0.003, 8, 6), this.led, 0.026, h - 0.026, 0.012);
    }
    this.addHitArea(0.2, hitY);
    this.label.position.y = labelY;
  }

  update(entity: HassEntity | undefined): void {
    super.update(entity);
    const s = entity?.state;
    // Couleur du voyant selon l'objet et son état.
    const leds: Partial<Record<Shape, () => number>> = {
      smoke: () => (s === "on" ? 0xff3b30 : 0),
      leak: () => (s === "on" ? 0x3b8bff : 0),
      siren: () => (s === "on" || s === "triggered" ? 0xff3b30 : 0),
      bridge: () => (entity ? 0x3d8fd6 : 0),
      router: () => (entity && s !== "off" ? 0x4cd97b : 0),
      lock: () => (s === "locked" ? 0x4cd97b : s === "jammed" ? 0xff3b30 : s === "unlocked" || s === "open" || s === "unlocking" ? 0xffb347 : 0),
      fountain: () => (s === "on" || (entity && Number(s) > 0) ? 0x5ab4ff : 0x1c4a6e),
      wallbox: () => (s === "on" || s === "charging" ? 0x4cd97b : 0),
      mower: () => (s === "mowing" || s === "on" ? 0x4cd97b : s === "error" ? 0xff4c4c : 0),
    };
    const on = s === "on" || s === "cleaning";
    this.led.emissive.set(leds[this.shape]?.() ?? (on ? 0xffb347 : 0x000000));
  }
}

// ---------------------------------------------------------------------------

export function createDeviceView(cfg: DeviceConfig, ctx: DeviceContext): DeviceView {
  const view = buildView(cfg, ctx);
  // Rotation choisie par l'utilisateur, en plus de l'orientation automatique (sauf volets et aspirateur, calés sur le plan).
  if (cfg.rotation && view.rotatable) view.group.rotation.y += THREE.MathUtils.degToRad(cfg.rotation);
  return view;
}

/** Formes fixées au plafond : leur hauteur suit le plafond, pas de réglage. */
export const CEILING_SHAPES = new Set<Shape>(["spot", "ceiling", "smoke"]);

function buildView(cfg: DeviceConfig, ctx: DeviceContext): DeviceView {
  switch (kindOf(cfg)) {
    case "light":
      return new LightView(cfg, ctx);
    case "climate":
      return new ClimateView(cfg, ctx);
    case "vacuum":
      return new VacuumView(cfg, ctx);
    case "cover":
      return new CoverView(cfg, ctx);
    case "fan":
      return new FanView(cfg, ctx);
    case "switch":
      return new SwitchView(cfg, ctx);
    case "media_player":
      return new MediaView(cfg, ctx);
    case "camera":
      return new CameraView(cfg, ctx);
    default:
      return new SensorView(cfg, ctx);
  }
}

/** Texture de halo lumineux (dégradé radial), partagée par toutes les lampes. */
export function makeHaloTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
