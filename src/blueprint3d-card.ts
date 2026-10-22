import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DEMO_PLAN, demoDevices } from "./demo";
import { CEILING_SHAPES, createDeviceView, makeHaloTexture, type DeviceContext, type DeviceView } from "./devices";
import { House, type WallMode } from "./house";
import { icon, sceneIcon, type IconName } from "./icons";
import { PostFX, resolveQuality } from "./post";
import { readWeather, WeatherFX } from "./weather";
import { setLanguage, t } from "./i18n";
import { deviceItem, type CatalogItem } from "./catalog";
import { FURNITURE_DEFAULTS, PlanEditor, type PlanData } from "./editor";
import { entityOptions, findPowerEntity, fmtWatts, isPowerSensor, loadRegistry, modelOptions, watts, type PlatformMap } from "./entities";
import { itemName, Library } from "./library";
import { DevicePanel } from "./panel";
import { RoomPanel } from "./roompanel";
import { computeRoomStats, fmt1, heatColor, heatGradient, roomOfView, type HeatMode, type RoomStats } from "./rooms";
import { styles } from "./styles";
import { DOMAIN_TO_KIND, kindOf, needsConfirm, type FurnitureType, type BackgroundConfig, type CardConfig, type DeviceConfig, type HassEntity, type HomeAssistant } from "./types";
import { MAX_IMPORT_BYTES, parseImport } from "./importer";
import { sanitizeConfig } from "./validate";
import { toYaml } from "./yaml";

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const VERSION = "0.2.0";
const WALL_MODES: WallMode[] = ["ghost", "cutaway", "low", "full"];
const CLICK_SLOP = 6;
const LONG_PRESS_MS = 550;
const snap = (v: number) => Math.round(v * 20) / 20;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const UNDO_LIMIT = 50;

/** État du plan et des appareils, pour l'annulation. L'image de fond est gardée par référence (pas de copie). */
interface Snapshot {
  data: string;
  background?: BackgroundConfig;
}

/** JSON avec clés triées, pour retrouver notre carte dans la config du tableau de bord. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as any)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** URL du tableau de bord courant (null = tableau de bord par défaut). */
function dashboardPath(): string | null {
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return !seg || seg === "lovelace" ? null : seg;
}

class Blueprint3DCard extends HTMLElement {
  private config!: CardConfig;
  /** Config telle que reçue de Lovelace, pour la retrouver au moment d'enregistrer. */
  private rawConfig!: CardConfig;
  private _hass?: HomeAssistant;
  private devices: DeviceConfig[] = [];
  private usingDemoDevices = false;

  // DOM
  private stage!: HTMLDivElement;
  private labelsEl!: HTMLDivElement;
  private editbar!: HTMLDivElement;
  private wallBtn!: HTMLButtonElement;
  private editBtn!: HTMLButtonElement;
  private panel!: DevicePanel;

  // Three.js
  private renderer?: THREE.WebGLRenderer;
  private labelRenderer!: CSS2DRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private userMoved = false;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private house?: House;
  private views: DeviceView[] = [];
  private pickMap = new Map<THREE.Object3D, DeviceView>();
  private seen = new Map<DeviceView, HassEntity | undefined>();
  private halo?: THREE.Texture;
  private post?: PostFX;
  private weather?: WeatherFX;
  /** Couverture nuageuse actuelle (0 à 1), pour atténuer le soleil. */
  private clouds = 0;
  private quality: "high" | "low" = "high";
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  // État
  private wallMode: WallMode = "ghost";
  private editing = false;
  private editTab: "devices" | "plan" = "devices";
  private editor?: PlanEditor;
  private dirty = false;
  private planDirty = false;
  /** Annulation (Ctrl+Z) : états précédents du plan et des appareils, le dernier en haut. */
  private undoStack: Snapshot[] = [];
  private lastSnapshot?: Snapshot;
  private readonly onUndoKey = (e: KeyboardEvent) => {
    if (!this.editing || e.key.toLowerCase() !== "z" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const target = e.composedPath()[0] as HTMLElement | undefined;
    if (target?.matches?.("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    this.undo();
  };
  private saveState: "idle" | "saving" | "saved" = "idle";
  private placingEntity?: string;
  /** Objet de la bibliothèque en attente de placement (clic dans la maison). */
  private placingItem?: CatalogItem;
  private library!: Library;
  private roomPanel!: RoomPanel;
  private roomStats = new Map<string, RoomStats>();
  private heatMode: HeatMode = "off";
  /** Étage affiché. */
  private level = 0;
  /** Lueur actuelle des pièces où un mouvement est détecté (animée). */
  private roomGlow = new Map<string, number>();
  private platforms: PlatformMap = new Map();
  private deviceIds = new Map<string, string>();
  private registryLoaded = false;
  /** Capteur de puissance retenu pour chaque appareil (calculé une fois par entité). */
  private powerCache = new Map<string, string | undefined>();
  private seenPower = new Map<DeviceView, HassEntity | undefined>();
  private visible = true;
  private connected = false;
  private down?: { x: number; y: number; view?: DeviceView; timer?: number; consumed: boolean; dragged: boolean };
  private resizeObs?: ResizeObserver;
  private interObs?: IntersectionObserver;
  /** Trajet de caméra en cours (cadrage d'un appareil en édition, puis retour). */
  private camAnim?: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number };
  /** Vue d'avant le cadrage, rétablie à la fermeture de la fiche. */
  private focusSaved?: { pos: THREE.Vector3; target: THREE.Vector3 };
  private lastDeclutter = 0;
  /** Taille de chaque étiquette dépliée, mesurée quand elle l'était. */
  private labelSize = new WeakMap<HTMLElement, [number, number]>();

  // ---------- API Lovelace ----------

  static getStubConfig(): Partial<CardConfig> {
    return { title: "Ma maison" };
  }

  setConfig(config: CardConfig): void {
    if (!config || typeof config !== "object") throw new Error("Configuration invalide");
    this.rawConfig = clone(config);
    const { config: clean, warnings } = sanitizeConfig(clone(config));
    if (warnings.length) console.warn("[blueprint3d-card] Config corrigée :", warnings);
    this.config = clean;
    this.dirty = false;
    // Appareils de démo seulement avec le plan de démo ; sinon on part de zéro (mode édition).
    this.usingDemoDevices = !config.devices && !config.rooms?.length;
    this.devices = clean.devices ? clean.devices : this.usingDemoDevices ? demoDevices(this._hass) : [];
    if (this.level >= (this.config.levels?.length ?? 1)) this.level = 0;
    if (this.editing) this.ensurePlanArrays();
    if (this.editor && this.editTab === "plan") this.editor.setData(this.planData());
    if (this.renderer) this.buildWorld(this.editing);
    else if (this.connected) {
      this.initThree();
      this.updateLoop();
    }
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    setLanguage(hass.locale?.language ?? hass.language);
    if (!this.registryLoaded) {
      this.registryLoaded = true;
      // Registre des entités : marques (suggestions) et appareils (capteurs de puissance « frères »).
      loadRegistry(hass).then((reg) => {
        this.platforms = reg.platforms;
        this.deviceIds = reg.devices;
        this.powerCache.clear();
        this.seenPower.clear();
        this.syncStates();
        this.refreshLive();
      });
    }
    if (first && this.usingDemoDevices) {
      this.devices = demoDevices(hass);
      if (this.renderer) this.buildDevices();
    }
    this.syncStates();
    this.panel?.setHass(hass);
    this.updateLighting();
    this.refreshLive();
  }

  getCardSize(): number {
    return Math.ceil((this.config?.height ?? 450) / 50);
  }

  getGridOptions() {
    return { columns: 12, rows: 8, min_rows: 4, min_columns: 6 };
  }

  // ---------- Cycle de vie ----------

  connectedCallback(): void {
    this.connected = true;
    clearTimeout(this.disposeTimer);
    if (!this.shadowRoot) this.buildDom();
    if (!this.renderer && this.config) this.initThree();
    this.updateLoop();
  }

  disconnectedCallback(): void {
    this.connected = false;
    window.removeEventListener("keydown", this.onUndoKey);
    this.updateLoop();
    // HA détache/rattache souvent les cartes : on attend un peu avant de tout libérer.
    clearTimeout(this.disposeTimer);
    this.disposeTimer = window.setTimeout(() => {
      if (!this.connected) this.disposeThree();
    }, 15000);
  }

  private disposeTimer?: number;

  private disposeThree(): void {
    if (!this.renderer) return;
    this.renderer.setAnimationLoop(null);
    for (const v of this.views) v.dispose();
    this.views = [];
    this.pickMap.clear();
    this.seen.clear();
    this.house?.dispose();
    this.house = undefined;
    this.weather?.dispose();
    this.weather = undefined;
    this.scene.environment?.dispose();
    this.halo?.dispose();
    this.halo = undefined;
    this.controls.dispose();
    this.post?.dispose();
    this.post = undefined;
    this.resizeObs?.disconnect();
    this.interObs?.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labelsEl.replaceChildren();
    this.renderer = undefined;
  }

  private get plan() {
    const usingDemo = !this.config.rooms?.length;
    return {
      usingDemo,
      rooms: usingDemo ? DEMO_PLAN.rooms : this.config.rooms!,
      openings: usingDemo ? DEMO_PLAN.openings : this.config.openings ?? [],
      furniture: usingDemo ? DEMO_PLAN.furniture : this.config.furniture ?? [],
    };
  }

  private buildDom(): void {
    const root = this.attachShadow({ mode: "open" });
    root.addEventListener("keydown", (e) => {
      const target = (e as KeyboardEvent).composedPath()[0] as HTMLElement;
      if (target?.matches?.("input, textarea, select")) e.stopPropagation();
    });
    root.innerHTML = `
      <style>${styles}</style>
      <ha-card class="card">
        <div class="title" hidden></div>
        <div class="stage">
          <div class="labels"></div>
          <div class="overlay-left">
            <div class="notice" hidden></div>
            <div class="persons"></div>
            <div class="stats"></div>
            <div class="alert" hidden></div>
          </div>
          <div class="scenes"></div>
          <div class="levels" hidden></div>
          <div class="legend" hidden></div>
          <div class="toolbar">
            <button data-act="heat"></button>
            <button data-act="walls"></button>
            <button data-act="recenter"></button>
            <button data-act="edit"></button>
          </div>
          <div class="editbar" hidden>
            <span class="tabs"><button data-tab="devices"></button><button data-tab="plan"></button></span>
            <button data-act="undo" class="undo"></button>
            <button data-act="library" class="primary"></button>
            <button data-act="scenes"></button>
            <button data-act="settings"></button>
            <select data-act="pick"></select>
            <span class="hint"></span>
            <button data-act="cancel" hidden></button>
            <span class="spacer"></span>
            <span class="status"></span>
            <button data-act="import"></button>
            <button data-act="export"></button>
            <button data-act="save" class="primary"></button>
          </div>
        </div>
      </ha-card>`;
    this.stage = root.querySelector(".stage")!;
    this.labelsEl = root.querySelector(".labels")!;
    this.editbar = root.querySelector(".editbar")!;
    this.wallBtn = root.querySelector('[data-act="walls"]')!;
    this.editBtn = root.querySelector('[data-act="edit"]')!;

    this.panel = new DevicePanel({
      editing: false,
      onClose: () => this.closePanel(),
      onRemove: (cfg) => this.removeDevice(cfg),
      onMoreInfo: (entityId) =>
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true })),
      onLink: (cfg, entity) => this.updateDevice(cfg, () => (cfg.entity = entity)),
      onModel: (cfg, model) =>
        this.updateDevice(cfg, () => {
          const item = deviceItem(model);
          if (item) {
            cfg.model = item.id;
            cfg.type = item.kind;
          } else delete cfg.model;
        }),
      onLength: (cfg, length) => this.updateDevice(cfg, () => (cfg.length = length)),
      onPlacement: (cfg, field, value, commit) => this.placeDevice(cfg, field, value, commit),
      onNudge: (cfg, dir) => this.nudgeDevice(cfg, dir),
      placement: (cfg) => {
        const view = this.views.find((v) => v.cfg === cfg);
        return {
          wallH: this.config.wall_height ?? 2.5,
          height: view?.effectiveHeight ?? cfg.height ?? 0,
          rotatable: view?.rotatable ?? false,
          ceiling: !!view && CEILING_SHAPES.has(view.shape),
        };
      },
      onPower: (cfg, power) =>
        this.updateDevice(cfg, () => {
          if (/^sensor\.[a-z0-9_]+$/.test(power)) cfg.power = power;
          else delete cfg.power;
          this.powerCache.clear();
        }),
      onVacuumMap: (cfg, field, value) =>
        this.updateDevice(cfg, () => {
          if (field === "position_entity") {
            if (typeof value === "string" && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(value)) cfg.position_entity = value;
            else delete cfg.position_entity;
          } else if (field === "map_rotation") {
            const r = Number(value);
            if (r === 90 || r === 180 || r === 270) cfg.map_rotation = r;
            else delete cfg.map_rotation;
          } else if (field === "map_flip") {
            if (value === true) cfg.map_flip = true;
            else delete cfg.map_flip;
          }
        }),
      onConfirm: (cfg, confirm) =>
        this.updateDevice(cfg, () => {
          if (confirm) cfg.confirm = true;
          else delete cfg.confirm;
        }),
      platforms: () => this.platforms,
    });
    this.stage.appendChild(this.panel.el);

    this.library = new Library((item) => this.pickFromLibrary(item));
    this.stage.appendChild(this.library.el);

    this.roomPanel = new RoomPanel({
      onClose: () => this.closeRoom(),
      onDevice: (cfg) => {
        const view = this.views.find((v) => v.cfg === cfg);
        if (view) this.openPanel(view);
      },
      onToggle: (cfg) => this.toggleDevice(cfg),
      onAllLights: (cfgs, on) => this.allLights(cfgs, on),
    });
    this.stage.appendChild(this.roomPanel.el);

    root.querySelector(".levels")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-level]");
      if (btn) this.setLevel(Number(btn.dataset.level));
    });
    root.querySelector(".stats")!.addEventListener("click", (e) => {
      const mode = (e.target as HTMLElement).closest<HTMLElement>("[data-heat]")?.dataset.heat as HeatMode | undefined;
      if (!mode) return;
      this.heatMode = this.heatMode === mode ? "off" : mode;
      this.refreshLive();
      this.refreshUi();
    });
    root.querySelector(".scenes")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-scene]");
      if (btn) this.runScene(btn.dataset.scene!, btn);
    });

    root.querySelector(".toolbar")!.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "walls") {
        this.wallMode = WALL_MODES[(WALL_MODES.indexOf(this.wallMode) + 1) % WALL_MODES.length];
        this.refreshUi();
      } else if (act === "heat") {
        const modes: HeatMode[] = ["off", "temperature", "humidity", "power"];
        this.heatMode = modes[(modes.indexOf(this.heatMode) + 1) % modes.length];
        this.refreshLive();
        this.refreshUi();
      } else if (act === "recenter") {
        this.userMoved = false;
        this.fitCamera();
      }
      else if (act === "edit") this.setEditing(!this.editing);
    });
    this.editbar.querySelector("select")!.addEventListener("change", (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.closePanel();
      this.placingEntity = v || undefined;
      this.placingItem = undefined;
      this.refreshUi();
    });
    this.editbar.querySelector('[data-act="export"]')!.addEventListener("click", () => this.showExport());
    this.editbar.querySelector('[data-act="import"]')!.addEventListener("click", () => this.showImport());
    this.editbar.querySelector('[data-act="save"]')!.addEventListener("click", () => this.save());
    this.editbar.querySelector('[data-act="undo"]')!.addEventListener("click", () => this.undo());
    this.editbar.querySelector('[data-act="library"]')!.addEventListener("click", () => this.library.toggle());
    this.editbar.querySelector('[data-act="scenes"]')!.addEventListener("click", () => this.showScenesEditor());
    this.editbar.querySelector('[data-act="settings"]')!.addEventListener("click", () => this.showSettings());
    this.editbar.querySelector('[data-act="cancel"]')!.addEventListener("click", () => {
      this.placingEntity = undefined;
      this.placingItem = undefined;
      this.fillEntityPicker();
      this.refreshUi();
    });
    this.editbar.querySelector(".tabs")!.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]")?.dataset.tab;
      if (tab === "devices" || tab === "plan") this.setTab(tab);
    });
    for (const type of ["pointerdown", "wheel", "touchstart"]) {
      this.editbar.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  private refreshUi(): void {
    const root = this.shadowRoot!;
    const title = root.querySelector<HTMLElement>(".title")!;
    title.hidden = !this.config.title;
    title.textContent = this.config.title ?? "";
    this.stage.style.setProperty("--h3d-height", `${Number(this.config.height) || 450}px`);
    this.stage.classList.toggle("hide-labels", !!this.config.compact_labels);
    const label = (el: HTMLElement, name: IconName, text: string) => {
      el.innerHTML = `${icon(name)}<span class="lbl">${esc(text)}</span>`;
      el.title = text;
    };
    label(this.wallBtn, "cube", t(`walls_${this.wallMode}`));
    const heatBtn = root.querySelector<HTMLElement>('[data-act="heat"]')!;
    if (this.heatMode === "temperature") label(heatBtn, "thermometer", t("heat_temperature"));
    else if (this.heatMode === "humidity") label(heatBtn, "droplet", t("heat_humidity"));
    else if (this.heatMode === "power") label(heatBtn, "bolt", t("heat_power"));
    else label(heatBtn, "layers", t("heat_off"));
    heatBtn.classList.toggle("active", this.heatMode !== "off");
    label(this.editbar.querySelector<HTMLElement>('[data-act="scenes"]')!, "sparkles", t("scenes"));
    label(this.editbar.querySelector<HTMLElement>('[data-act="settings"]')!, "sliders", t("settings"));
    this.renderLevels();
    this.renderScenes();
    label(this.editBtn, this.editing ? "check" : "pencil", this.editing ? t("done") : t("edit"));
    this.editBtn.classList.toggle("active", this.editing);
    label(root.querySelector<HTMLElement>('[data-act="recenter"]')!, "target", t("recenter"));
    this.editbar.hidden = !this.editing;
    const inPlan = this.editing && this.editTab === "plan";
    this.wallBtn.hidden = inPlan;
    root.querySelector<HTMLElement>('[data-act="recenter"]')!.hidden = inPlan;
    for (const b of this.editbar.querySelectorAll<HTMLElement>("[data-tab]")) {
      b.classList.toggle("active", b.dataset.tab === this.editTab);
      if (b.dataset.tab === "plan") label(b, "plan", t("tab_plan"));
      else label(b, "bulb", t("tab_devices"));
    }
    this.editbar.querySelector<HTMLElement>("select")!.hidden = inPlan;
    const hint = this.editbar.querySelector<HTMLElement>(".hint")!;
    // L'aide ne s'affiche que pendant un placement ; sinon elle reste en info-bulle.
    const placing = !inPlan && (this.placingEntity || this.placingItem);
    hint.hidden = !placing;
    hint.textContent = `${t("place_hint")}${this.placingItem ? ` : ${itemName(this.placingItem)}` : ""}`;
    const cancel = this.editbar.querySelector<HTMLElement>('[data-act="cancel"]')!;
    cancel.hidden = !placing;
    label(cancel, "close", t("cancel"));
    const undoBtn = this.editbar.querySelector<HTMLButtonElement>('[data-act="undo"]')!;
    undoBtn.innerHTML = icon("undo");
    undoBtn.title = t("undo");
    undoBtn.setAttribute("aria-label", t("undo"));
    undoBtn.disabled = !this.undoStack.length;
    label(this.editbar.querySelector<HTMLElement>('[data-act="library"]')!, "book", t("library"));
    this.editbar.querySelector<HTMLElement>("select")!.title = t("drag_hint");
    const status = this.editbar.querySelector<HTMLElement>(".status")!;
    status.innerHTML =
      this.saveState === "saving" ? esc(t("saving")) : this.dirty ? esc(t("unsaved")) : this.saveState === "saved" ? `${icon("check")}${esc(t("saved"))}` : "";
    status.classList.toggle("dirty", this.dirty);
    label(this.editbar.querySelector<HTMLElement>('[data-act="export"]')!, "download", t("export"));
    label(this.editbar.querySelector<HTMLElement>('[data-act="import"]')!, "upload", t("import"));
    label(this.editbar.querySelector<HTMLElement>('[data-act="save"]')!, "save", t("save"));
    this.stage.classList.toggle("placing", !!(this.placingEntity || this.placingItem));
    // La bibliothèque s'arrête au-dessus de la barre d'édition, même sur deux lignes.
    if (this.editing) this.stage.style.setProperty("--h3d-editbar", `${this.editbar.offsetHeight}px`);
    const notice = root.querySelector<HTMLElement>(".notice")!;
    notice.hidden = !this.plan.usingDemo;
    notice.textContent = t("demo_notice");
  }

  // ---------- Three.js ----------

  private initThree(): void {
    this.quality = resolveQuality(this.config.quality);
    const high = this.quality === "high";
    // premultipliedAlpha: false — le halo (couleur sans opacité) ne doit pas éclaircir le fond de la carte.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: !high, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.5));
    // AgX : rendu plus naturel des hautes lumières (lampes chaudes sans saturation criarde).
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.classList.add("gl");
    this.stage.insertBefore(renderer.domElement, this.labelsEl);
    this.renderer = renderer;

    this.labelRenderer = new CSS2DRenderer({ element: this.labelsEl });

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xfdfbf7, 0x8a7f72, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    if (high) {
      this.post = new PostFX(renderer, this.scene, this.camera, Math.max(1, this.stage.clientWidth), Math.max(1, this.stage.clientHeight));
    }
    this.halo = makeHaloTexture();

    // Nos écouteurs passent avant ceux d'OrbitControls (pour bloquer la rotation pendant un glisser).
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", () => this.cancelPress());
    canvas.addEventListener("contextmenu", (e) => {
      const view = this.pick(e);
      if (view) {
        e.preventDefault();
        this.openPanel(view);
      }
    });

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener("start", () => {
      this.userMoved = true;
      this.camAnim = undefined;
    });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.stage);
    this.interObs = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      this.updateLoop();
    });
    this.interObs.observe(this);

    this.buildWorld();
  }

  private buildWorld(keepCamera = false): void {
    if (this.house) {
      this.scene.remove(this.house.group);
      this.house.dispose();
    }
    const { rooms, openings, furniture } = this.plan;
    const here = (o: { level?: number }) => (o.level ?? 0) === this.level;
    this.house = new House(rooms.filter(here), openings.filter(here), furniture.filter(here), this.config.wall_height ?? 2.5);
    this.scene.add(this.house.group);

    // Récepteur d'ombres sous la maquette.
    this.scene.getObjectByName("shadow-catcher")?.removeFromParent();
    const size = this.house.bounds.getSize(new THREE.Vector3());
    const center = this.house.bounds.getCenter(new THREE.Vector3());
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 3 + 10, size.z * 3 + 10),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    catcher.name = "shadow-catcher";
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(center.x, -0.241, center.z);
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    const r = Math.max(size.x, size.z) * 0.75 + 2;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.5;
    cam.far = 80;
    cam.updateProjectionMatrix();

    if (this.weather) {
      this.scene.remove(this.weather.object);
      this.weather.dispose();
    }
    this.weather = new WeatherFX(this.house.outdoorRooms);
    this.scene.add(this.weather.object);

    this.buildDevices();
    this.roomGlow.clear();
    this.refreshLive();
    if (!keepCamera) this.fitCamera();
    this.updateLighting();
    this.refreshUi();
  }

  private buildDevices(): void {
    for (const v of this.views) {
      this.scene.remove(v.group);
      v.dispose();
    }
    this.views = [];
    this.pickMap.clear();
    this.seen.clear();
    for (const cfg of this.devices) if ((cfg.level ?? 0) === this.level) this.addView(cfg);
    this.syncStates();
    if (this.editing) this.fillEntityPicker();
  }

  private addView(cfg: DeviceConfig): DeviceView {
    const ctx: DeviceContext = {
      house: this.house!,
      wallH: this.config.wall_height ?? 2.5,
      halo: this.halo!,
      stateOf: (id) => this._hass?.states[id],
      powerOf: (cfg) => this.powerOf(cfg),
    };
    const view = createDeviceView(cfg, ctx);
    for (const p of view.pickables) this.pickMap.set(p, view);
    view.label.element.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openPanel(view);
    });
    this.scene.add(view.group);
    // L'étiquette est insérée tout de suite (masquée) ; le rendu suivant la positionne et l'affiche.
    view.label.element.style.display = "none";
    this.labelsEl.appendChild(view.label.element);
    this.views.push(view);
    view.update(this._hass?.states[cfg.entity]);
    this.seen.set(view, this._hass?.states[cfg.entity]);
    return view;
  }

  private rebuildView(view: DeviceView): DeviceView {
    const i = this.views.indexOf(view);
    if (i < 0) return this.addView(view.cfg);
    this.scene.remove(view.group);
    for (const p of view.pickables) this.pickMap.delete(p);
    this.seen.delete(view);
    view.dispose();
    this.views.splice(i, 1);
    return this.addView(view.cfg);
  }

  private syncStates(): void {
    if (!this._hass) return;
    for (const view of this.views) {
      const st = this._hass.states[view.cfg.entity];
      const pw = this.powerEntityOf(view.cfg);
      const pst = pw ? this._hass.states[pw] : undefined;
      if (this.seen.get(view) !== st || this.seenPower.get(view) !== pst) {
        this.seen.set(view, st);
        this.seenPower.set(view, pst);
        view.update(st);
      }
    }
  }

  private fitCamera(): void {
    if (!this.house) return;
    this.camAnim = undefined;
    this.focusSaved = undefined;
    const box = this.house.bounds;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, 4) * 0.55;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspectFix = Math.max(1, 1.3 / Math.max(this.camera.aspect, 0.4));
    const dist = (radius / Math.tan(fov / 2)) * aspectFix * 0.95;
    const dir = new THREE.Vector3(0.18, 1.15, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.minDistance = 2;
    this.controls.maxDistance = dist * 2.5;
    this.controls.update();
  }

  private updateLighting(): void {
    if (!this.sun || !this.house) return;
    const sunState = this._hass?.states[this.config.sun_entity ?? "sun.sun"];
    const elev: number = sunState?.attributes.elevation ?? 45;
    const az: number = sunState?.attributes.azimuth ?? 200;
    const day = THREE.MathUtils.clamp((elev + 4) / 14, 0, 1);

    const theta = THREE.MathUtils.degToRad(az - (this.config.north ?? 0));
    const el = THREE.MathUtils.degToRad(Math.max(elev, 12));
    const center = this.house.bounds.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(theta) * Math.cos(el), Math.sin(el), -Math.cos(theta) * Math.cos(el));
    this.sun.position.copy(center).addScaledVector(dir, 30);
    this.sun.target.position.copy(center);

    // Jour : soleil chaud et lumière douce. Nuit : ambiance bleutée très faible, les lampes font le reste.
    // Par temps couvert, le soleil s'efface au profit d'une lumière diffuse.
    this.sun.intensity = 2.6 * day * (1 - 0.75 * this.clouds);
    this.sun.castShadow = day > 0.05;
    this.sun.color.setHSL(0.08, 0.75, 0.6 + 0.28 * day);
    this.hemi.intensity = 0.12 + 0.75 * day * (1 - 0.15 * this.clouds);
    this.hemi.color.lerpColors(new THREE.Color(0x3a4568), new THREE.Color(0xfff4e6), day);
    this.hemi.groundColor.lerpColors(new THREE.Color(0x15161c), new THREE.Color(0x9c8a74), day);
    this.scene.environmentIntensity = 0.05 + 0.3 * day;
    this.post?.setNight(1 - day);
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (!w || !h) return;
    // false : le style du canvas reste piloté par le CSS (100 %), pas en pixels fixes.
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    // Téléphone : étiquettes plus compactes, fiche en bas de l'écran.
    this.stage.classList.toggle("narrow", w < 600);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Tant que l'utilisateur n'a pas bougé la vue, elle se recadre à chaque changement de taille
    // (entrée/sortie du mode édition de HA, rotation de tablette…).
    if (!this.userMoved) this.fitCamera();
  }

  private updateLoop(): void {
    if (!this.renderer) return;
    // Pas de rendu 3D pendant l'édition du plan : l'éditeur 2D la recouvre.
    const run = this.connected && this.visible && !(this.editing && this.editTab === "plan");
    this.renderer.setAnimationLoop(run ? () => this.frame() : null);
    if (run) this.clock.getDelta();
  }

  private frame(): void {
    // Plafond à 0,25 s : sur un appareil lent, les animations gardent leur durée réelle sans sauter.
    const dt = Math.min(this.clock.getDelta(), 0.25);
    const time = this.clock.elapsedTime;
    this.tickCamera(dt);
    this.controls.update();
    this.house?.updateCutaway(this.camera, this.wallMode, dt);
    for (const v of this.views) v.tick(dt, time);
    this.house?.tickOpenings(dt);
    this.weather?.tick(dt, time);
    this.tickRooms(dt, time);
    if (this.post) this.post.render();
    else this.renderer!.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.declutter();
  }

  /**
   * Évite que les étiquettes se chevauchent (surtout sur téléphone) : les plus importantes
   * (sélectionnée, allumées, proches) restent dépliées, les autres se réduisent à une pastille
   * ou se masquent. L'appareil 3D reste cliquable dans tous les cas.
   */
  private declutter(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDeclutter < 120) return;
    this.lastDeclutter = now;
    type Box = { l: number; t: number; r: number; b: number };
    const kept: Box[] = [];
    const hits = (a: Box, pad: number) => kept.some((k) => a.l - pad < k.r && a.r + pad > k.l && a.t - pad < k.b && a.b + pad > k.t);
    const camPos = this.camera.position;
    const front = this.frontRooms();
    const items = this.views
      .filter((v) => v.label.element.style.display !== "none")
      .map((v) => {
        const el = v.labelEl;
        const room = this.house ? roomOfView(this.house, v) : undefined;
        // Toujours dépliées : l'appareil sélectionné et ceux de la pièce dont le panneau est ouvert.
        const rank = el.classList.contains("selected") || (room && room === this.roomPanel.openFor) ? 0 : 1;
        return { v, el, rank, inFront: !front || !room || front.has(room), dist: v.group.position.distanceToSquared(camPos) };
      })
      .sort((a, b) => a.rank - b.rank || a.dist - b.dist);
    // Seules les étiquettes au premier plan restent dépliées (3 sur téléphone par défaut) ;
    // les autres deviennent des pastilles, à toucher pour ouvrir la fiche.
    const narrow = this.stage.classList.contains("narrow");
    const limit = Math.round(this.config.max_labels ?? (narrow ? 3 : Infinity));
    // Demi-largeur d'une pastille réduite (icône 22 px, 18 px sur téléphone, + bordure).
    const half = narrow ? 12 : 14;
    let open = 0;
    for (const { v, el, rank, inFront } of items) {
      const a = v.label.element.getBoundingClientRect();
      const cx = (a.left + a.right) / 2;
      const by = a.bottom - 6;
      const mini = el.classList.contains("mini");
      if (!mini && !el.classList.contains("culled")) this.labelSize.set(el, [el.offsetWidth, el.offsetHeight]);
      const [w, h] = this.labelSize.get(el) ?? [90, 30];
      const full = { l: cx - w / 2, r: cx + w / 2, t: by - h, b: by };
      const dot = { l: cx - half, r: cx + half, t: by - 2 * half, b: by };
      // Marge en plus pour redéplier une pastille : évite le clignotement à la limite.
      const room = rank === 0 || (open < limit && inFront);
      const mode = room && !hits(full, mini ? 6 : 0) ? "full" : !hits(dot, 0) ? "mini" : "culled";
      if (mode === "full" && rank !== 0) open++;
      if (mode !== "culled") kept.push(mode === "full" ? full : dot);
      el.classList.toggle("mini", mode === "mini");
      el.classList.toggle("culled", mode === "culled");
    }
    // Les noms de pièces passent après les appareils.
    for (const el of this.labelsEl.querySelectorAll<HTMLElement>(".room-label")) {
      if (el.style.display === "none") continue;
      const r = el.getBoundingClientRect();
      const box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      const hidden = hits(box, 2);
      el.classList.toggle("culled", hidden);
      if (!hidden) kept.push(box);
    }
  }

  /**
   * Pièces au premier plan (la rangée la plus proche de la caméra) : seules leurs étiquettes restent
   * dépliées, celles des pièces derrière deviennent des pastilles. undefined = toutes (vue de dessus).
   */
  private frontRooms(): Set<string> | undefined {
    if (!this.house) return undefined;
    const fwd = this.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    // Caméra presque à la verticale : aucune pièce n'en cache une autre.
    if (fwd.length() < 0.35) return undefined;
    fwd.normalize();
    const depths = [...this.house.roomDepths(this.camera.position, fwd)];
    // Référence : les pièces fermées (une terrasse devant ne doit pas repousser tout l'intérieur derrière).
    const indoor = depths.filter(([, r]) => !r.outdoor);
    const values = (indoor.length ? indoor : depths).map(([, r]) => r.depth);
    const min = Math.min(...values);
    const band = Math.max(2.5, 0.35 * (Math.max(...values) - min));
    return new Set(depths.filter(([, r]) => r.depth <= min + band).map(([name]) => name));
  }

  private tickCamera(dt: number): void {
    const a = this.camAnim;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 0.6);
    const k = a.t * a.t * (3 - 2 * a.t);
    this.camera.position.lerpVectors(a.fromPos, a.toPos, k);
    this.controls.target.lerpVectors(a.fromTarget, a.toTarget, k);
    if (a.t >= 1) this.camAnim = undefined;
  }

  private moveCamera(pos: THREE.Vector3, target: THREE.Vector3): void {
    // Sans rendu (plan 2D affiché), la caméra est placée directement.
    if (this.editing && this.editTab === "plan") {
      this.camAnim = undefined;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      return;
    }
    this.camAnim = { fromPos: this.camera.position.clone(), toPos: pos, fromTarget: this.controls.target.clone(), toTarget: target, t: 0 };
  }

  /** Édition : la caméra se place face à l'appareil (face au mur s'il y est accroché), en plus près. */
  private focusDevice(view: DeviceView): void {
    if (!this.editing || this.editTab !== "devices" || !this.house) return;
    const box = new THREE.Box3().setFromObject(view.group);
    const center = box.isEmpty() ? view.group.position.clone().setY(view.effectiveHeight) : box.getCenter(new THREE.Vector3());
    const [x, y] = view.cfg.position;
    const wall = this.house.nearestWall(x, y, 0.8);
    const dir = wall ? wall.inward.clone() : this.camera.position.clone().sub(center).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    // Distance choisie pour voir ~2,6 m de large autour de l'objet, quel que soit l'écran.
    const halfV = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const tanH = Math.tan(halfV) * this.camera.aspect;
    const dist = THREE.MathUtils.clamp(1.3 / tanH, 2.2, 7);
    // Vue plongeante (40°), et toujours au-dessus des cloisons pour qu'elles ne masquent pas l'objet.
    const wallH = this.config.wall_height ?? 2.5;
    const elev = THREE.MathUtils.degToRad(40);
    const pos = center.clone().addScaledVector(dir, dist * Math.cos(elev));
    pos.y = Math.max(center.y + dist * Math.sin(elev), wallH + 0.5);
    const target = center.clone();
    // Sur téléphone, la fiche couvre la moitié basse et les boutons le haut : on décale la vue
    // pour placer l'objet dans la bande libre entre les deux (~37 % depuis le haut).
    if (this.stage.classList.contains("narrow")) {
      const look = target.clone().sub(pos).normalize();
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(look, -look.y).normalize();
      const shift = pos.distanceTo(target) * Math.tan(halfV) * 0.26;
      pos.addScaledVector(up, -shift);
      target.addScaledVector(up, -shift);
    }
    if (!this.focusSaved) this.focusSaved = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    this.controls.minDistance = 0.5;
    this.userMoved = true;
    this.moveCamera(pos, target);
  }

  private unfocus(): void {
    const saved = this.focusSaved;
    if (!saved) return;
    this.focusSaved = undefined;
    this.controls.minDistance = 2;
    this.moveCamera(saved.pos, saved.target);
  }

  /** Décale l'appareil de 5 cm vers la gauche (-1) ou la droite (+1) de l'écran, le long de son mur. */
  private nudgeDevice(cfg: DeviceConfig, dir: number): void {
    const view = this.views.find((v) => v.cfg === cfg);
    if (!view || !this.house) return;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0);
    const [x, y] = cfg.position;
    const wall = this.house.nearestWall(x, y, 0.8);
    // Contre un mur, on glisse le long du mur ; sinon selon l'axe le plus proche de l'horizontale de l'écran.
    const alongX = wall ? wall.axis === "h" : Math.abs(right.x) >= Math.abs(right.z);
    const step = 0.05 * dir * Math.sign((alongX ? right.x : right.z) || 1);
    const nx = alongX ? snap(x + step) : x;
    const ny = alongX ? y : snap(y + step);
    if (!this.house.roomAt(nx, ny)) return;
    view.moveTo(nx, ny);
    this.select(this.rebuildView(view));
    this.markDirty();
  }

  // ---------- Interaction ----------

  private ndc(e: PointerEvent | MouseEvent): THREE.Vector2 {
    const rect = this.renderer!.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  private pick(e: PointerEvent | MouseEvent): DeviceView | undefined {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects([...this.pickMap.keys()], false);
    if (hits.length) return this.pickMap.get(hits[0].object);
    // Au doigt, on tolère un appui à côté : l'appareil le plus proche à moins de 28 px.
    if (!("pointerType" in e) || e.pointerType === "mouse") return undefined;
    const rect = this.renderer!.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const p = new THREE.Vector3();
    let best: DeviceView | undefined;
    let bestD = 28;
    for (const [obj, view] of this.pickMap) {
      obj.getWorldPosition(p).project(this.camera);
      if (p.z > 1) continue;
      const d = Math.hypot(((p.x + 1) / 2) * rect.width - px, ((1 - p.y) / 2) * rect.height - py);
      if (d < bestD) {
        bestD = d;
        best = view;
      }
    }
    return best;
  }

  private floorPoint(e: PointerEvent): THREE.Vector3 | undefined {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ?? undefined;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const view = this.pick(e);
    this.down = { x: e.clientX, y: e.clientY, view, consumed: false, dragged: false };
    if (view && this.editing) {
      // En édition, on déplace l'appareil au lieu de tourner la caméra.
      this.controls.enabled = false;
      this.renderer!.domElement.setPointerCapture(e.pointerId);
    } else if (view) {
      this.down.timer = window.setTimeout(() => {
        if (this.down) this.down.consumed = true;
        this.openPanel(view);
      }, LONG_PRESS_MS);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.down;
    if (!d) {
      if (e.pointerType === "mouse") this.stage.classList.toggle("hovering", !!this.pick(e));
      return;
    }
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP;
    if (moved && d.timer) {
      clearTimeout(d.timer);
      d.timer = undefined;
    }
    if (d.view && this.editing && moved) {
      const p = this.floorPoint(e);
      if (p) {
        d.dragged = true;
        d.view.moveTo(snap(p.x), snap(p.z));
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.down;
    this.down = undefined;
    this.controls.enabled = true;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    if (d.consumed) return;
    if (d.dragged && d.view) {
      // Reconstruit pour réaccrocher au mur le plus proche.
      const view = this.rebuildView(d.view);
      this.select(view);
      this.markDirty();
      return;
    }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
    this.onClick(e, d.view);
  }

  private cancelPress(): void {
    if (this.down?.timer) clearTimeout(this.down.timer);
    this.down = undefined;
    this.controls.enabled = true;
  }

  private onClick(e: PointerEvent, view: DeviceView | undefined): void {
    if (this.editing && (this.placingEntity || this.placingItem)) {
      const p = this.floorPoint(e);
      if (!p || !this.house?.roomAt(p.x, p.z)) return;
      const item = this.placingItem;
      if (item?.category === "furniture") this.addFurniture(item.furniture, p.x, p.z);
      else if (item) this.addDevice("", snap(p.x), snap(p.z), item.id, item.kind);
      else this.addDevice(this.placingEntity!, snap(p.x), snap(p.z));
      return;
    }
    if (!view) {
      this.closePanel();
      const room = this.editing ? undefined : this.floorRoom(e);
      if (room && room !== this.roomPanel.openFor) this.openRoom(room);
      else this.closeRoom();
      return;
    }
    if (this.editing || !view.cfg.entity) {
      this.openPanel(view);
      return;
    }
    const kind = view.kind;
    const entity = this._hass?.states[view.cfg.entity];
    if (entity && ["light", "switch", "fan"].includes(kind)) {
      this.toggleDevice(view.cfg);
    } else {
      this.openPanel(view);
    }
  }

  private openPanel(view: DeviceView): void {
    this.closeRoom();
    this.select(view);
    this.panel.open(view.cfg, this._hass, this.editing);
    this.focusDevice(view);
  }

  private closePanel(): void {
    this.panel.close();
    this.select(undefined);
    this.unfocus();
  }

  private select(view: DeviceView | undefined): void {
    for (const v of this.views) v.setSelected(v === view);
  }

  // ---------- Vie de la maison : pièces, scènes, présence, alertes ----------

  private powerEntityOf(cfg: DeviceConfig): string | undefined {
    if (!cfg.entity) return undefined;
    const key = `${cfg.entity}|${cfg.power ?? ""}`;
    if (!this.powerCache.has(key)) this.powerCache.set(key, findPowerEntity(cfg, this._hass, this.deviceIds));
    return this.powerCache.get(key);
  }

  private powerOf(cfg: DeviceConfig): number | undefined {
    const id = this.powerEntityOf(cfg);
    return id ? watts(this._hass?.states[id]) : undefined;
  }

  private setLevel(level: number): void {
    const count = this.config.levels?.length ?? 1;
    if (!Number.isInteger(level) || level < 0 || level >= count || level === this.level) return;
    this.level = level;
    this.closePanel();
    this.closeRoom();
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.editor?.setLevel(level);
    if (this.renderer) this.buildWorld(true);
    this.refreshUi();
  }

  private renderLevels(): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>(".levels");
    if (!el) return;
    const levels = this.config.levels ?? [];
    el.hidden = levels.length < 2;
    el.innerHTML = levels
      .map((l, i) => `<button data-level="${i}" class="${i === this.level ? "active" : ""}">${esc(l.name)}</button>`)
      .join("");
  }

  private floorRoom(e: PointerEvent): string | undefined {
    if (!this.house) return undefined;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.house.floorMeshes, false)[0];
    return hit?.object.userData.room;
  }

  private openRoom(name: string): void {
    const stats = this.roomStats.get(name);
    if (!stats) return;
    this.panel.close();
    this.select(undefined);
    this.house?.setRoomSelected(name);
    this.roomPanel.open(stats, this._hass);
  }

  private closeRoom(): void {
    this.roomPanel?.close();
    this.house?.setRoomSelected(null);
  }

  private call(domain: string, service: string, data: Record<string, unknown>): void {
    this._hass?.callService(domain, service, data).catch((err) => console.error("[blueprint3d-card]", err));
  }

  /** Bascule un appareil, avec confirmation si l'appareil l'exige. */
  private toggleDevice(cfg: DeviceConfig): void {
    const entity = this._hass?.states[cfg.entity];
    if (!entity) return;
    if (needsConfirm(cfg) && !confirm(`${entity.attributes.friendly_name ?? cfg.entity} : ${t("confirm_action")}`)) return;
    this.call("homeassistant", "toggle", { entity_id: cfg.entity });
  }

  private allLights(cfgs: DeviceConfig[], on: boolean): void {
    // Les appareils « à confirmer » ne sont jamais actionnés en groupe sans accord explicite.
    const sensitive = cfgs.filter((c) => needsConfirm(c));
    let targets = cfgs.filter((c) => !needsConfirm(c));
    if (sensitive.length && confirm(`${sensitive.map((c) => this._hass?.states[c.entity]?.attributes.friendly_name ?? c.entity).join(", ")} : ${t("confirm_action")}`)) {
      targets = cfgs;
    }
    const ids = targets.map((c) => c.entity).filter((id) => this._hass?.states[id]);
    if (!ids.length) return;
    // light.* et switch.* (lampe sur prise) : homeassistant.turn_on/off gère les deux.
    this.call("homeassistant", on ? "turn_on" : "turn_off", { entity_id: ids });
  }

  private runScene(entityId: string, btn: HTMLElement): void {
    if (!/^(scene|script)\.[a-z0-9_]+$/.test(entityId) || !this._hass?.states[entityId]) return;
    this.call(entityId.split(".")[0], "turn_on", { entity_id: entityId });
    btn.classList.add("fired");
    setTimeout(() => btn.classList.remove("fired"), 900);
  }

  private renderScenes(): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>(".scenes");
    if (!el) return;
    const scenes = (this.config.scenes ?? []).filter((s) => this._hass?.states[s.entity]);
    el.hidden = this.editing || !scenes.length;
    el.innerHTML = scenes
      .map((s) => {
        const name = s.name ?? this._hass?.states[s.entity]?.attributes.friendly_name ?? s.entity;
        // Icône mdi:… choisie, sinon celle de l'entité dans HA, sinon devinée d'après le nom (pas d'emoji).
        const mdi = [s.icon, this._hass?.states[s.entity]?.attributes.icon].find((i) => typeof i === "string" && /^mdi:[a-z0-9-]+$/.test(i));
        const ic = mdi ? `<ha-icon icon="${esc(mdi)}"></ha-icon>` : icon(sceneIcon(String(name)));
        return `<button class="scene" data-scene="${esc(s.entity)}">${ic}${esc(name)}</button>`;
      })
      .join("");
  }

  /** Recalcule tout ce qui dépend des états : pièces, portes, alertes, chaleur, personnes. */
  private refreshLive(): void {
    if (!this.house || !this.shadowRoot) return;
    const hass = this._hass;
    this.roomStats = computeRoomStats(this.house, this.views, hass, (cfg) => this.powerOf(cfg));

    // Étiquettes de pièces (température) et carte de chaleur
    const legend = this.shadowRoot.querySelector<HTMLElement>(".legend")!;
    for (const s of this.roomStats.values()) {
      const info: { icon: IconName; text: string }[] = [];
      if (s.temp !== undefined) info.push({ icon: "thermometer", text: `${fmt1(s.temp)}°` });
      if (s.hum !== undefined) info.push({ icon: "droplet", text: `${fmt1(s.hum)} %` });
      if (this.heatMode === "power" && s.power !== undefined) info.push({ icon: "bolt", text: fmtWatts(s.power) });
      if (s.lightsOn) info.push({ icon: "bulb", text: String(s.lightsOn) });
      this.house.setRoomInfo(s.name, info);
      if (this.heatMode === "off") this.house.setRoomTint(s.name, null);
      else {
        const v = this.heatMode === "temperature" ? s.temp : this.heatMode === "power" ? s.power : s.hum;
        this.house.setRoomTint(s.name, v === undefined ? new THREE.Color(s.outdoor ? 0x8a8d91 : 0xb9bcc0) : heatColor(this.heatMode, v));
      }
    }
    if (this.heatMode === "off") legend.hidden = true;
    else {
      const g = heatGradient(this.heatMode);
      legend.hidden = false;
      legend.innerHTML = `<span>${g.min}${g.unit}</span><span class="bar" style="background:${g.css}"></span><span>${g.max}${g.unit}</span>`;
    }

    // Portes et fenêtres : capteur relié, ou capteur d'ouverture posé à côté.
    const contacts = this.views.filter((v) => v.shape === "contact" && v.cfg.entity);
    const climateRooms = new Set(
      this.views
        .filter((v) => v.kind === "climate" && hass?.states[v.cfg.entity] && hass.states[v.cfg.entity].state !== "off")
        .map((v) => this.house!.roomAt(v.group.position.x, v.group.position.z)?.name)
        .filter((n): n is string => !!n),
    );
    const alerts = new Set<string>();
    let sensored = 0;
    let opened = 0;
    for (const o of this.house.openings) {
      const sensor =
        o.cfg.sensor ?? contacts.find((v) => Math.hypot(v.cfg.position[0] - o.cfg.x, v.cfg.position[1] - o.cfg.y) < 0.8)?.cfg.entity;
      const st = sensor ? hass?.states[sensor] : undefined;
      if (st) o.target = st.state === "on" ? 1 : 0;
      const isOpen = st?.state === "on";
      if (st) sensored++;
      if (isOpen) opened++;
      const alert = isOpen && o.rooms.some((r) => climateRooms.has(r));
      o.setAlert(!!alert);
      if (alert) o.rooms.filter((r) => climateRooms.has(r)).forEach((r) => alerts.add(r));
    }
    const alertEl = this.shadowRoot.querySelector<HTMLElement>(".alert")!;
    alertEl.hidden = !alerts.size;
    alertEl.innerHTML = alerts.size ? `${icon("alert")}<span>${esc([...alerts].join(", "))} : ${esc(t("alert_open_ac"))}</span>` : "";

    // Météo sur les extérieurs
    const weatherId = this.config.weather_entity ?? Object.keys(hass?.states ?? {}).find((id) => id.startsWith("weather."));
    const w = readWeather(weatherId ? hass?.states[weatherId]?.state : undefined);
    this.weather?.setPrecip(w.precip);
    this.house.setWet(w.precip === "rain" || w.precip === "heavy" ? 1 : 0);
    if (w.clouds !== this.clouds) {
      this.clouds = w.clouds;
      this.updateLighting();
    }

    // Tuiles d'infos : consommation (compteur du logement, sinon total des appareils suivis),
    // moyennes intérieures, lumières, ouvertures. Les trois premières activent la carte de chaleur.
    const all = [...this.roomStats.values()];
    const meter = this.config.power_entity ? watts(hass?.states[this.config.power_entity]) : undefined;
    const tracked = all.reduce((sum, s) => sum + (s.power ?? 0), 0);
    const anyTracked = all.some((s) => s.power !== undefined);
    const mean = (l: (number | undefined)[]) => {
      const v = l.filter((x): x is number => x !== undefined);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
    };
    const indoor = all.filter((s) => !s.outdoor);
    const temp = mean(indoor.map((s) => s.temp));
    const hum = mean(indoor.map((s) => s.hum));
    const lights = all.reduce((n, s) => n + s.lights, 0);
    const lightsOn = all.reduce((n, s) => n + s.lightsOn, 0);
    type Tile = { icon: IconName; label: string; value: string; heat?: HeatMode; cls?: string; title?: string };
    const tiles: Tile[] = [];
    if (meter !== undefined || anyTracked) {
      tiles.push({
        icon: "bolt",
        label: t(meter !== undefined ? "stat_power" : "stat_power_tracked"),
        value: fmtWatts(meter ?? tracked),
        heat: "power",
        cls: "meter",
        title: meter !== undefined && anyTracked ? `${t("tracked_devices")} : ${fmtWatts(tracked)}` : "",
      });
    }
    if (temp !== undefined) tiles.push({ icon: "thermometer", label: t("stat_temp"), value: `${fmt1(temp)}°`, heat: "temperature" });
    if (hum !== undefined) tiles.push({ icon: "droplet", label: t("stat_hum"), value: `${fmt1(hum)} %`, heat: "humidity" });
    if (lights) tiles.push({ icon: "bulb", label: t("stat_lights"), value: `${lightsOn} / ${lights}`, cls: lightsOn ? "lit" : "" });
    if (sensored) tiles.push({ icon: "door", label: t("stat_open"), value: `${opened} / ${sensored}`, cls: opened ? "warn" : "" });
    const statsEl = this.shadowRoot.querySelector<HTMLElement>(".stats")!;
    statsEl.hidden = !tiles.length;
    statsEl.innerHTML = tiles
      .map((s) => {
        const tag = s.heat ? "button" : "div";
        const cls = ["stat", `s-${s.icon}`, s.cls ?? "", s.heat && s.heat === this.heatMode ? "active" : ""].filter(Boolean).join(" ");
        return `<${tag} class="${cls}"${s.heat ? ` data-heat="${s.heat}"` : ""} title="${esc(s.title || s.label)}">${icon(s.icon)}<span class="st"><small>${esc(s.label)}</small><b>${esc(s.value)}</b></span></${tag}>`;
      })
      .join("");

    // Personnes à la maison
    const personsEl = this.shadowRoot.querySelector<HTMLElement>(".persons")!;
    const persons = this.config.show_persons === false ? [] : Object.values(hass?.states ?? {}).filter((s) => s.entity_id.startsWith("person."));
    personsEl.hidden = !persons.length;
    personsEl.innerHTML = persons
      .map((p) => {
        const name = String(p.attributes.friendly_name ?? p.entity_id.slice(7));
        const home = p.state === "home";
        const pic = typeof p.attributes.entity_picture === "string" && /^(\/|https?:\/\/)/.test(p.attributes.entity_picture) ? p.attributes.entity_picture : "";
        const where = home ? t("home") : p.state === "not_home" ? t("away") : p.state;
        return `<span class="person ${home ? "home" : ""}" title="${esc(name)} · ${esc(where)}">${
          pic ? `<img alt="" src="${esc(pic)}">` : `<span class="initial">${esc([...name][0] ?? "?")}</span>`
        }<span class="pname">${esc(name)}</span></span>`;
      })
      .join("");

    this.roomPanel?.update(this.roomPanel.openFor ? this.roomStats.get(this.roomPanel.openFor) : undefined, hass ?? ({ states: {} } as HomeAssistant));
    this.renderScenes();
  }

  /** Lueur douce des pièces où un mouvement est détecté. */
  private tickRooms(dt: number, time: number): void {
    if (!this.house) return;
    for (const s of this.roomStats.values()) {
      const cur = this.roomGlow.get(s.name) ?? 0;
      const target = s.motion ? 1 : 0;
      if (cur === 0 && target === 0) continue;
      let next = cur + (target - cur) * (1 - Math.exp(-dt * (target ? 4 : 1.2)));
      if (Math.abs(next - target) < 0.01) next = target;
      this.roomGlow.set(s.name, next);
      this.house.setRoomGlow(s.name, next * (0.75 + 0.25 * Math.sin(time * 2.5)));
    }
  }

  /** Réglages généraux de la carte (titre, compteur, météo, qualité…). */
  private showSettings(): void {
    const c = this.config;
    const states = Object.values(this._hass?.states ?? {});
    const name = (s: HassEntity) => String(s.attributes.friendly_name ?? s.entity_id);
    const options = (list: HassEntity[], current: string | undefined, empty: string) =>
      `<option value="">${empty}</option>` +
      list
        .sort((a, b) => name(a).localeCompare(name(b)))
        .map((s) => `<option value="${esc(s.entity_id)}" ${s.entity_id === current ? "selected" : ""}>${esc(name(s))} · ${esc(s.entity_id)}</option>`)
        .join("");
    const modal = this.modal(`
      <strong class="with-ic">${icon("sliders")}${t("settings")}</strong>
      <div class="settings-grid">
        <label>${t("title_label")}<input type="text" data-k="title" maxlength="60" value="${esc(c.title ?? "")}"></label>
        <label>${t("power_entity_label")}<select data-k="power_entity">${options(states.filter(isPowerSensor), c.power_entity, t("none"))}</select></label>
        <label>${t("weather_entity_label")}<select data-k="weather_entity">${options(
          states.filter((s) => s.entity_id.startsWith("weather.")),
          c.weather_entity,
          t("auto_material"),
        )}</select></label>
        <label>${t("quality_label")}<select data-k="quality">${(["auto", "high", "low"] as const)
          .map((q) => `<option value="${q}" ${(c.quality ?? "auto") === q ? "selected" : ""}>${t(`quality_${q}`)}</option>`)
          .join("")}</select></label>
        <label>${t("wall_height_label")}<input type="number" data-k="wall_height" min="1.5" max="6" step="0.05" value="${esc(c.wall_height ?? 2.5)}"></label>
        <label>${t("north_label")}<input type="number" data-k="north" min="-360" max="360" step="1" value="${esc(c.north ?? 0)}"></label>
        <label class="wide">${t("levels_label")}<textarea data-k="levels" rows="3" placeholder="${t("levels_placeholder")}">${esc((c.levels ?? []).map((l) => l.name).join("\n"))}</textarea></label>
        <label class="check"><input type="checkbox" data-k="show_persons" ${c.show_persons === false ? "" : "checked"}> ${t("show_persons_label")}</label>
      </div>
      <div class="actions"><button data-act="apply-settings" class="primary">${t("apply")}</button><button data-act="close">${t("close")}</button></div>`);
    modal.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.act !== "apply-settings") return;
      const get = (k: string) => modal.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!;
      const next: CardConfig = {
        ...this.config,
        title: get("title").value.trim() || undefined,
        power_entity: get("power_entity").value || undefined,
        weather_entity: get("weather_entity").value || undefined,
        quality: get("quality").value as CardConfig["quality"],
        wall_height: Number(get("wall_height").value),
        north: Number(get("north").value),
        show_persons: get("show_persons").checked ? undefined : false,
        levels: modal
          .querySelector<HTMLTextAreaElement>('[data-k="levels"]')!
          .value.split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
      };
      if (!next.levels?.length || next.levels.length < 2) delete next.levels;
      // On ne supprime pas un étage qui contient encore des éléments.
      const maxUsed = Math.max(
        0,
        ...[...(this.config.rooms ?? []), ...(this.config.furniture ?? []), ...(this.config.openings ?? []), ...this.devices].map((o) => o.level ?? 0),
      );
      if ((next.levels?.length ?? 1) <= maxUsed) {
        alert(t("levels_in_use"));
        return;
      }
      if (next.quality === "auto") delete next.quality;
      const qualityChanged = (next.quality ?? "auto") !== (this.config.quality ?? "auto");
      const { config: clean } = sanitizeConfig(next);
      // Les tableaux (pièces, appareils…) restent ceux en cours d'édition.
      this.config = { ...clean, rooms: this.config.rooms, openings: this.config.openings, furniture: this.config.furniture };
      modal.remove();
      if (qualityChanged && this.renderer) {
        this.disposeThree();
        this.initThree();
        this.updateLoop();
      } else if (this.renderer) this.buildWorld(true);
      this.markDirty();
    });
  }

  private showScenesEditor(): void {
    const all = Object.values(this._hass?.states ?? {})
      .filter((s) => /^(scene|script)\./.test(s.entity_id))
      .sort((a, b) => String(a.attributes.friendly_name ?? a.entity_id).localeCompare(String(b.attributes.friendly_name ?? b.entity_id)));
    const chosen = new Set((this.config.scenes ?? []).map((s) => s.entity));
    const modal = this.modal(`
      <strong class="with-ic">${icon("sparkles")}${t("scenes")}</strong>
      <span class="muted">${t("scenes_hint")}</span>
      <div class="scene-list">${
        all.length
          ? all
              .map(
                (s) => `<label class="check"><input type="checkbox" value="${esc(s.entity_id)}" ${chosen.has(s.entity_id) ? "checked" : ""}>
                  ${esc(s.attributes.friendly_name ?? s.entity_id)} <small class="muted">${esc(s.entity_id)}</small></label>`,
              )
              .join("")
          : `<span class="muted">${t("no_scenes")}</span>`
      }</div>
      <div class="actions"><button data-act="apply-scenes" class="primary">${t("apply")}</button><button data-act="close">${t("close")}</button></div>`);
    modal.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.act !== "apply-scenes") return;
      const picked = [...modal.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")].map((i) => i.value);
      const old = new Map((this.config.scenes ?? []).map((s) => [s.entity, s]));
      // On garde l'ordre et les noms/icônes déjà choisis.
      this.config.scenes = picked.map((id) => old.get(id) ?? { entity: id });
      modal.remove();
      this.markDirty();
      this.renderScenes();
    });
  }

  // ---------- Édition ----------

  private setEditing(on: boolean): void {
    if (!on && this.editTab === "plan") this.setTab("devices");
    if (!on) window.removeEventListener("keydown", this.onUndoKey);
    this.editing = on;
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.library.hide();
    this.closePanel();
    this.closeRoom();
    if (on) {

      this.ensurePlanArrays();
      this.undoStack = [];
      this.lastSnapshot = this.snapshot();
      window.addEventListener("keydown", this.onUndoKey);
      this.fillEntityPicker();
      // On se détache de la config d'origine : les modifs vivent ici jusqu'à l'enregistrement.
      this.usingDemoDevices = false;
    }
    this.refreshUi();
  }

  private setTab(tab: "devices" | "plan"): void {
    this.editTab = tab;
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.closePanel();
    if (tab === "plan") {
      if (!this.editor) {
        this.editor = new PlanEditor(
          () => {
            this.planDirty = true;
            this.markDirty();
          },
          {
            entityOptions: (cfg) => entityOptions(this._hass, this.platforms, cfg),
            modelOptions: (cfg) => modelOptions(cfg),
            sensorOptions: (current) => {
              const list = Object.values(this._hass?.states ?? {})
                .filter((s) => s.entity_id.startsWith("binary_sensor."))
                .sort((a, b) => {
                  const pa = ["door", "window", "opening", "garage_door"].includes(a.attributes.device_class) ? 0 : 1;
                  const pb = ["door", "window", "opening", "garage_door"].includes(b.attributes.device_class) ? 0 : 1;
                  return pa - pb || String(a.attributes.friendly_name ?? a.entity_id).localeCompare(String(b.attributes.friendly_name ?? b.entity_id));
                });
              return (
                `<option value="">${t("none")}</option>` +
                list
                  .map((s) => `<option value="${esc(s.entity_id)}" ${s.entity_id === current ? "selected" : ""}>${esc(s.attributes.friendly_name ?? s.entity_id)} · ${esc(s.entity_id)}</option>`)
                  .join("")
              );
            },
          },
        );
        this.stage.appendChild(this.editor.el);
      }
      this.editor.setLevel(this.level);
      this.editor.setData(this.planData());
      this.editor.show();
    } else {
      this.editor?.hide();
      if (this.planDirty) {
        this.planDirty = false;
        this.buildWorld(true);
      }
      this.fillEntityPicker();
    }
    this.updateLoop();
    this.refreshUi();
  }

  /** Avant d'éditer : le plan de démo devient le plan de la carte, qu'on peut alors modifier. */
  private ensurePlanArrays(): void {
    const c = this.config;
    if (!c.rooms?.length) {
      c.rooms = clone(DEMO_PLAN.rooms);
      c.openings = clone(DEMO_PLAN.openings);
      c.furniture = clone(DEMO_PLAN.furniture);
    }
    c.openings ??= [];
    c.furniture ??= [];
  }

  private planData(): PlanData {
    const c = this.config;
    return {
      rooms: c.rooms!,
      openings: c.openings!,
      furniture: c.furniture!,
      devices: this.devices,
      get background() {
        return c.background;
      },
      set background(v) {
        c.background = v;
      },
    };
  }

  /** `record` : la modification est terminée et peut être annulée (pas pendant un glissement de curseur). */
  private markDirty(record = true): void {
    if (record) this.recordHistory();
    this.dirty = true;
    this.saveState = "idle";
    this.refreshUi();
  }

  private snapshot(): Snapshot {
    const c = this.config;
    return { data: JSON.stringify([c.rooms ?? [], c.openings ?? [], c.furniture ?? [], this.devices]), background: c.background ? { ...c.background } : undefined };
  }

  private recordHistory(): void {
    if (!this.editing) return;
    const now = this.snapshot();
    const prev = this.lastSnapshot;
    const same = prev && prev.data === now.data && JSON.stringify(prev.background) === JSON.stringify(now.background);
    if (prev && !same) {
      this.undoStack.push(prev);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }
    this.lastSnapshot = now;
  }

  /** Revient à l'état d'avant la dernière modification (déplacement, ajout, suppression, plan…). */
  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev || !this.editing) return;
    const [rooms, openings, furniture, devices] = JSON.parse(prev.data) as [CardConfig["rooms"], CardConfig["openings"], CardConfig["furniture"], DeviceConfig[]];
    const c = this.config;
    c.rooms = rooms;
    c.openings = openings;
    c.furniture = furniture;
    if (prev.background) c.background = { ...prev.background };
    else delete c.background;
    this.devices = devices;
    this.lastSnapshot = prev;
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.closePanel();
    this.closeRoom();
    this.buildWorld(true);
    if (this.editTab === "plan") this.editor?.setData(this.planData());
    this.planDirty = false;
    this.markDirty(false);
  }

  private fillEntityPicker(): void {
    const select = this.editbar.querySelector("select")!;
    const placed = new Set(this.devices.map((d) => d.entity));
    const states = Object.values(this._hass?.states ?? {}).filter((s) => DOMAIN_TO_KIND[s.entity_id.split(".")[0]]);
    states.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
    const opt = (s: HassEntity) =>
      `<option value="${esc(s.entity_id)}">${esc(s.attributes.friendly_name ?? s.entity_id)} · ${esc(s.entity_id)}${placed.has(s.entity_id) ? ` (${esc(t("placed"))})` : ""}</option>`;
    select.innerHTML = `<option value="">+ ${t("add_device")}…</option>` + states.map(opt).join("");
    select.value = this.placingEntity ?? "";
  }

  private pickFromLibrary(item: CatalogItem): void {
    this.closePanel();
    if (this.editTab === "plan" && this.editor) {
      if (item.category === "furniture") this.editor.startFurniture(item.furniture);
      else this.editor.startDevice(item);
      return;
    }
    // On reprend la vue d'ensemble pour choisir où poser l'objet.
    this.closePanel();
    this.placingEntity = undefined;
    this.placingItem = item;
    this.fillEntityPicker();
    this.refreshUi();
  }

  private addFurniture(type: FurnitureType, x: number, y: number): void {
    const def = FURNITURE_DEFAULTS[type];
    this.config.furniture!.push({ type, x: snap(x - def.w / 2), y: snap(y - def.d / 2), w: def.w, d: def.d, color: def.color, ...(this.level ? { level: this.level } : {}) });
    this.placingItem = undefined;
    this.buildWorld(true);
    this.markDirty();
  }

  /** Modifie un appareil (entité, modèle…) puis reconstruit sa vue 3D. */
  /** Hauteur / rotation d'un objet. Pendant le glissement, seule la 3D est refaite (la fiche reste ouverte). */
  private placeDevice(cfg: DeviceConfig, field: "height" | "rotation", value: number, commit: boolean): void {
    if (!Number.isFinite(value)) return;
    const wallH = this.config.wall_height ?? 2.5;
    const apply = () => {
      if (field === "height") cfg.height = Math.round(Math.min(Math.max(value, 0), wallH) * 100) / 100;
      else {
        const r = Math.round(Math.min(Math.max(value, -360), 360));
        if (r) cfg.rotation = r;
        else delete cfg.rotation;
      }
    };
    if (commit) {
      this.updateDevice(cfg, apply);
      return;
    }
    apply();
    const view = this.views.find((v) => v.cfg === cfg);
    if (view) {
      const next = this.rebuildView(view);
      this.select(next);
      next.update(this._hass?.states[cfg.entity]);
    }
    this.markDirty(false);
  }

  private updateDevice(cfg: DeviceConfig, change: () => void): void {
    change();
    const view = this.views.find((v) => v.cfg === cfg);
    if (view) {
      const next = this.rebuildView(view);
      this.select(next);
      next.update(this._hass?.states[cfg.entity]);
    }
    this.panel.open(cfg, this._hass, this.editing);
    this.fillEntityPicker();
    this.markDirty();
  }

  private addDevice(entity: string, x: number, y: number, model?: string, type?: DeviceConfig["type"]): void {
    const cfg: DeviceConfig = { entity, position: [x, y], ...(model ? { model } : {}), ...(type ? { type } : {}), ...(this.level ? { level: this.level } : {}) };
    this.devices.push(cfg);
    const view = this.addView(cfg);
    this.markDirty();
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.fillEntityPicker();
    this.refreshUi();
    this.openPanel(view);
  }

  private removeDevice(cfg: DeviceConfig): void {
    const i = this.devices.indexOf(cfg);
    if (i >= 0) this.devices.splice(i, 1);
    this.closePanel();
    this.buildDevices();
    this.markDirty();
  }

  private exportConfig(): CardConfig {
    const { rooms, openings, furniture } = this.plan;
    const out: CardConfig = {
      ...this.rawConfig,
      rooms,
      openings,
      furniture,
      devices: this.devices.map((d) => ({
        entity: d.entity,
        ...(d.model ? { model: d.model } : {}),
        position: d.position.map(snap) as [number, number],
        ...(d.length != null ? { length: d.length } : {}),
        ...(d.height != null ? { height: d.height } : {}),
        ...(d.rotation ? { rotation: d.rotation } : {}),
        ...(d.name ? { name: d.name } : {}),
        ...(d.confirm ? { confirm: true } : {}),
        ...(d.power ? { power: d.power } : {}),
        ...(d.position_entity ? { position_entity: d.position_entity } : {}),
        ...(d.map_rotation ? { map_rotation: d.map_rotation } : {}),
        ...(d.map_flip ? { map_flip: true } : {}),
        ...(d.level ? { level: d.level } : {}),
        ...(d.type && (!d.entity || d.type !== kindOf({ entity: d.entity })) ? { type: d.type } : {}),
      })),
      background: this.config.background,
      scenes: this.config.scenes,
      power_entity: this.config.power_entity,
      weather_entity: this.config.weather_entity,
      title: this.config.title,
      levels: this.config.levels,
      quality: this.config.quality,
      wall_height: this.config.wall_height,
      north: this.config.north,
      show_persons: this.config.show_persons,
    };
    for (const k of ["power_entity", "weather_entity", "title", "levels", "quality", "wall_height", "north", "show_persons"] as const) {
      if (out[k] === undefined) delete out[k];
    }
    if (!out.background) delete out.background;
    if (!out.scenes?.length) delete out.scenes;
    return clone(out);
  }

  /** Enregistre la carte directement dans le tableau de bord (mode « storage » de Lovelace). */
  private async save(): Promise<void> {
    const hass = this._hass;
    const next = this.exportConfig();
    this.saveState = "saving";
    this.refreshUi();
    try {
      if (!hass?.callWS) throw new Error("API WebSocket indisponible");
      const urlPath = dashboardPath();
      const lovelace = await hass.callWS<any>({ type: "lovelace/config", url_path: urlPath });
      const target = stableStringify(this.rawConfig);
      const matches: { parent: any; key: string | number }[] = [];
      const walk = (node: any) => {
        if (!node || typeof node !== "object") return;
        for (const [key, value] of Object.entries(node)) {
          const v = value as any;
          if (v && typeof v === "object" && v.type === this.rawConfig.type && stableStringify(v) === target) {
            matches.push({ parent: node, key: Array.isArray(node) ? Number(key) : key });
          } else walk(v);
        }
      };
      walk(lovelace);
      if (matches.length !== 1) throw new Error(`Carte trouvée ${matches.length} fois dans le tableau de bord`);
      matches[0].parent[matches[0].key] = next;
      await hass.callWS({ type: "lovelace/config/save", url_path: urlPath, config: lovelace });
      this.rawConfig = clone(next);
      this.dirty = false;
      this.saveState = "saved";
      this.refreshUi();
    } catch (err) {
      console.warn("[blueprint3d-card] Enregistrement automatique impossible :", err);
      this.saveState = "idle";
      this.refreshUi();
      this.showExport(t("save_failed"));
    }
  }

  private modal(html: string): HTMLDivElement {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<div>${html}</div>`;
    modal.addEventListener("pointerdown", (e) => e.stopPropagation());
    modal.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.act === "close" || e.target === modal) modal.remove();
    });
    this.stage.appendChild(modal);
    return modal;
  }

  private showExport(message?: string): void {
    const yaml = toYaml(this.exportConfig());
    const modal = this.modal(`
      <strong>${t("export")}</strong>
      <span class="muted">${esc(message ?? t("export_hint"))}</span>
      <textarea readonly spellcheck="false"></textarea>
      <div class="actions">
        <button data-act="download">⤓ ${t("download")}</button>
        <button data-act="copy">${t("copy")}</button>
        <button data-act="close">${t("close")}</button>
      </div>`);
    const ta = modal.querySelector("textarea")!;
    ta.value = yaml;
    modal.addEventListener("click", async (e) => {
      const btn = e.target as HTMLButtonElement;
      if (btn.dataset.act === "copy") {
        try {
          await navigator.clipboard.writeText(yaml);
        } catch {
          // HA servi en http : pas d'API presse-papier, on passe par la sélection.
          ta.select();
          document.execCommand("copy");
        }
        btn.textContent = t("copied");
      } else if (btn.dataset.act === "download") {
        const slug =
          (this.config.title ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "blueprint3d-card";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([yaml], { type: "text/yaml;charset=utf-8" }));
        a.download = `${slug}.yaml`;
        modal.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    });
    ta.focus();
    ta.select();
  }

  private showImport(): void {
    const modal = this.modal(`
      <strong>${t("import")}</strong>
      <span class="muted">${t("import_hint")}</span>
      <label class="file">${t("import_file")} <input type="file" accept=".yaml,.yml,.json,text/yaml,application/json,text/plain"></label>
      <textarea spellcheck="false" placeholder="rooms:\n  - name: Salon\n    x: 0\n    …"></textarea>
      <span class="error" hidden></span>
      <div class="actions">
        <button data-act="do-import" class="primary">⤒ ${t("import")}</button>
        <button data-act="close">${t("close")}</button>
      </div>`);
    const ta = modal.querySelector("textarea")!;
    const error = modal.querySelector<HTMLElement>(".error")!;
    const showError = (msg: string) => {
      error.textContent = msg;
      error.hidden = false;
    };
    modal.querySelector<HTMLInputElement>("input[type=file]")!.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > MAX_IMPORT_BYTES) return showError(t("import_err_too_big"));
      ta.value = await file.text();
      error.hidden = true;
    });
    modal.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).dataset.act !== "do-import") return;
      const res = parseImport(ta.value, this.rawConfig.type);
      if (!res.ok) return showError(`${t(`import_err_${res.error}`)}${res.detail ? ` (${res.detail})` : ""}`);
      if (!confirm(t("import_confirm"))) return;
      const warnings = this.applyImport(res.config);
      modal.querySelector("div")!.innerHTML = `
        <strong class="with-ic">${icon("check")}${t("imported")}</strong>
        <span class="muted">${t("imported_hint")}</span>
        ${warnings.length ? `<span class="error">${esc(warnings.length)} ${t("import_warnings")} : ${esc(warnings.slice(0, 5).join(" · "))}</span>` : ""}
        <div class="actions"><button data-act="close">${t("close")}</button></div>`;
    });
    ta.focus();
  }

  /** Remplace les éléments importés (pièces, appareils…) ; le reste de la config est conservé. */
  private applyImport(partial: Partial<CardConfig>): string[] {
    const merged: CardConfig = {
      ...this.config,
      devices: this.devices,
      ...partial,
      type: this.config.type,
    };
    const { config: clean, warnings } = sanitizeConfig(clone(merged));
    this.config = clean;
    this.devices = clean.devices ?? [];
    this.usingDemoDevices = false;
    this.ensurePlanArrays();
    this.placingEntity = undefined;
    this.placingItem = undefined;
    this.library.hide();
    this.closePanel();
    if (this.editor) {
      this.editor.setData(this.planData());
      this.editor.resetView();
    }
    this.planDirty = false;
    if (this.renderer) this.buildWorld();
    this.fillEntityPicker();
    this.markDirty();
    return warnings;
  }
}

if (!customElements.get("blueprint3d-card")) {
  customElements.define("blueprint3d-card", Blueprint3DCard);
  const w = window as unknown as { customCards?: unknown[] };
  w.customCards = w.customCards ?? [];
  w.customCards.push({
    type: "blueprint3d-card",
    name: "Blueprint3D Card",
    description: "Ta maison en 3D, avec tes lampes, clims, aspirateur et volets cliquables.",
    preview: true,
  });
  console.info(`%c BLUEPRINT3D-CARD %c v${VERSION} `, "background:#ff9b42;color:#fff;font-weight:700", "background:#333;color:#fff");
}
// Ancien nom du projet : garde les tableaux de bord en `custom:house-3d-card` fonctionnels.
if (!customElements.get("house-3d-card")) {
  customElements.define("house-3d-card", class extends Blueprint3DCard {});
}
