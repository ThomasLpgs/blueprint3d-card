import { deviceItem, type DeviceItem } from "./catalog";
import { WALL_T } from "./house";
import { t } from "./i18n";
import {
  FURNITURE_TYPES,
  kindOf,
  type BackgroundConfig,
  type DeviceConfig,
  type FurnitureConfig,
  type FurnitureType,
  type OpeningConfig,
  type RoomConfig,
} from "./types";

// Éditeur de plan 2D (vue du dessus) : pièces, ouvertures, meubles, appareils et calque.
// Il modifie directement les tableaux qu'on lui passe, puis prévient via onChange().

export interface PlanData {
  rooms: RoomConfig[];
  openings: OpeningConfig[];
  furniture: FurnitureConfig[];
  devices: DeviceConfig[];
  background?: BackgroundConfig;
}

type Tool = "select" | "room" | "door" | "glass_door" | "window" | "furniture" | "device" | "background";

export interface EditorHooks {
  /** <option> des entités HA qu'on peut relier à cet appareil. */
  entityOptions(cfg: DeviceConfig): string;
  modelOptions(cfg: DeviceConfig): string;
  /** <option> des capteurs d'ouverture (binary_sensor). */
  sensorOptions(current: string | undefined): string;
}
type SelKind = "room" | "furniture" | "opening" | "device" | "background";
type Sel = { kind: SelKind; index: number } | null;
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "a" | "b";
type Rect = { x: number; y: number; w: number; d: number };
type Edge = { axis: "h" | "v"; pos: number; a: number; b: number };

const SNAP = 0.05;
const MIN = 0.2;
const snap = (v: number) => Math.round(Math.round(v / SNAP) * SNAP * 100) / 100;
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

export const FURNITURE_DEFAULTS: Record<FurnitureType, { w: number; d: number; color: string }> = {
  sofa: { w: 2.0, d: 0.9, color: "#5b6b7a" },
  bed: { w: 1.6, d: 2.0, color: "#e9e2d6" },
  table: { w: 1.4, d: 0.8, color: "#9c7b55" },
  desk: { w: 1.2, d: 0.6, color: "#9c7b55" },
  chair: { w: 0.45, d: 0.45, color: "#2f2f2f" },
  wardrobe: { w: 1.2, d: 0.6, color: "#d9cbb6" },
  kitchen: { w: 2.4, d: 0.62, color: "#f2f2f0" },
  plant: { w: 0.45, d: 0.45, color: "#4f8a3c" },
  box: { w: 1.0, d: 0.5, color: "#a08c74" },
  armchair: { w: 0.85, d: 0.85, color: "#6b7a8a" },
  nightstand: { w: 0.45, d: 0.4, color: "#c9b49a" },
  bookcase: { w: 0.9, d: 0.35, color: "#c9b49a" },
  tv_stand: { w: 1.6, d: 0.4, color: "#3a3a3a" },
  rug: { w: 2.0, d: 1.4, color: "#b8a48c" },
  fridge: { w: 0.6, d: 0.65, color: "#dcdcdc" },
  washer: { w: 0.6, d: 0.6, color: "#f4f4f4" },
  toilet: { w: 0.38, d: 0.65, color: "#f4f7f8" },
  washbasin: { w: 0.6, d: 0.45, color: "#f4f7f8" },
  shower: { w: 0.9, d: 0.9, color: "#f4f7f8" },
  bathtub: { w: 1.7, d: 0.75, color: "#f4f7f8" },
};

const OPENING_WIDTH: Record<OpeningConfig["type"], number> = { door: 0.9, glass_door: 0.9, window: 1.2 };
const ROOM_COLORS = ["#c9a77c", "#b89a78", "#cfd8dc", "#d9d6d0", "#c4b49c", "#d5d8da"];

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class PlanEditor {
  readonly el = document.createElement("div");
  private canvas = document.createElement("canvas");
  private g = this.canvas.getContext("2d")!;
  private toolsEl = document.createElement("div");
  private propsEl = document.createElement("div");
  private hintEl = document.createElement("div");
  private data!: PlanData;

  private scale = 50;
  private ox = 0;
  private oy = 0;
  private tool: Tool = "select";
  private furnitureType: FurnitureType = "sofa";
  private pendingDevice?: DeviceItem;
  /** Étage affiché ; les nouveaux éléments y sont rattachés. */
  private level = 0;
  private sel: Sel = null;
  private drag?:
    | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
    | { type: "move"; start: [number, number]; items: { obj: any; x: number; y: number; pos?: boolean }[]; moved: boolean }
    | { type: "resize"; handle: Handle; obj: Rect; orig: Rect; lock?: number }
    | { type: "create"; start: [number, number]; cur: [number, number] }
    | { type: "slide"; obj: OpeningConfig }
    | { type: "owidth"; obj: OpeningConfig };
  private pointer: [number, number] = [0, 0];
  private bgImg?: HTMLImageElement;
  private bgSrc?: string;
  private resizeObs = new ResizeObserver(() => this.resize());
  private fitted = false;

  constructor(
    private onChange: () => void,
    private hooks: EditorHooks,
  ) {
    this.el.className = "plan-editor";
    this.el.tabIndex = 0;
    this.toolsEl.className = "plan-tools";
    this.propsEl.className = "plan-props";
    this.hintEl.className = "plan-hint";
    this.el.append(this.canvas, this.toolsEl, this.propsEl, this.hintEl);
    this.resizeObs.observe(this.el);

    this.canvas.addEventListener("pointerdown", (e) => this.onDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.onUp(e));
    this.canvas.addEventListener("pointercancel", () => (this.drag = undefined));
    this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    this.toolsEl.addEventListener("click", (e) => this.onToolClick(e));
    this.toolsEl.addEventListener("change", (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.act === "ftype") {
        this.furnitureType = t.value as FurnitureType;
        this.setTool("furniture");
      }
    });
    this.propsEl.addEventListener("change", (e) => this.onPropChange(e));
    this.propsEl.addEventListener("click", (e) => this.onPropClick(e));
    this.propsEl.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  setData(data: PlanData): void {
    this.data = data;
    this.sel = null;
    this.renderTools();
    this.renderProps();
    if (!this.fitted) requestAnimationFrame(() => this.fit());
    this.draw();
  }

  /** Depuis la bibliothèque : dessiner un meuble de ce type. */
  startFurniture(type: FurnitureType): void {
    this.furnitureType = type;
    this.setTool("furniture");
  }

  /** Depuis la bibliothèque : poser un objet connecté au prochain clic. */
  startDevice(item: DeviceItem): void {
    this.pendingDevice = item;
    this.setTool("device");
  }

  setLevel(level: number): void {
    this.level = level;
    this.sel = null;
    this.renderProps();
    this.draw();
  }

  private on = (o: { level?: number }) => (o.level ?? 0) === this.level;

  /** Rattache un nouvel élément à l'étage affiché. */
  private stamp<T extends { level?: number }>(o: T): T {
    if (this.level > 0) o.level = this.level;
    return o;
  }

  /** Recadre la vue au prochain affichage (après un import). */
  resetView(): void {
    this.fitted = false;
    if (!this.el.hidden) this.fit();
  }

  get background(): BackgroundConfig | undefined {
    return this.data.background;
  }

  show(): void {
    this.el.hidden = false;
    this.resize();
    if (!this.fitted) this.fit();
    this.el.focus({ preventScroll: true });
  }

  hide(): void {
    this.el.hidden = true;
  }

  // ---------- Repère ----------

  private toWorld(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left - this.ox) / this.scale, (e.clientY - r.top - this.oy) / this.scale];
  }

  private sx(x: number): number {
    return x * this.scale + this.ox;
  }

  private sy(y: number): number {
    return y * this.scale + this.oy;
  }

  private resize(): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.draw();
  }

  fit(): void {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h || !this.data) return;
    const rects: Rect[] = [...this.data.rooms, ...this.data.furniture].filter(this.on);
    if (this.data.background) rects.push(this.data.background);
    if (!rects.length) rects.push({ x: 0, y: 0, w: 8, d: 6 });
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.d));
    // Marges : barre d'outils en haut, panneau de propriétés à droite.
    const padL = 24;
    const padR = w > 700 ? 260 : 24;
    const padT = 64;
    const padB = 70;
    this.scale = Math.max(10, Math.min((w - padL - padR) / (maxX - minX), (h - padT - padB) / (maxY - minY)));
    this.ox = padL + (w - padL - padR - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.oy = padT + (h - padT - padB - (maxY - minY) * this.scale) / 2 - minY * this.scale;
    this.fitted = true;
    this.draw();
  }

  // ---------- Géométrie ----------

  private edges(): Edge[] {
    const out: Edge[] = [];
    for (const r of this.data.rooms) {
      if (r.outdoor || !this.on(r)) continue;
      out.push(
        { axis: "h", pos: r.y, a: r.x, b: r.x + r.w },
        { axis: "h", pos: r.y + r.d, a: r.x, b: r.x + r.w },
        { axis: "v", pos: r.x, a: r.y, b: r.y + r.d },
        { axis: "v", pos: r.x + r.w, a: r.y, b: r.y + r.d },
      );
    }
    return out;
  }

  private nearestEdge(x: number, y: number, max: number): { edge: Edge; along: number; dist: number } | undefined {
    let best: { edge: Edge; along: number; dist: number } | undefined;
    for (const e of this.edges()) {
      const [al, ac] = e.axis === "h" ? [x, y] : [y, x];
      const along = Math.min(e.b, Math.max(e.a, al));
      const dist = Math.hypot(al - along, ac - e.pos);
      if (dist <= max && (!best || dist < best.dist)) best = { edge: e, along, dist };
    }
    return best;
  }

  private openingAxis(o: OpeningConfig): "h" | "v" {
    return this.nearestEdge(o.x, o.y, 0.3)?.edge.axis ?? "h";
  }

  private selObj(): any {
    const s = this.sel;
    if (!s) return undefined;
    switch (s.kind) {
      case "room":
        return this.data.rooms[s.index];
      case "furniture":
        return this.data.furniture[s.index];
      case "opening":
        return this.data.openings[s.index];
      case "device":
        return this.data.devices[s.index];
      case "background":
        return this.data.background;
    }
  }

  private handles(): { id: Handle; x: number; y: number }[] {
    const s = this.sel;
    const obj = this.selObj();
    if (!s || !obj) return [];
    if (s.kind === "opening") {
      const o = obj as OpeningConfig;
      const half = (o.width ?? OPENING_WIDTH[o.type]) / 2;
      return this.openingAxis(o) === "h"
        ? [
            { id: "a", x: o.x - half, y: o.y },
            { id: "b", x: o.x + half, y: o.y },
          ]
        : [
            { id: "a", x: o.x, y: o.y - half },
            { id: "b", x: o.x, y: o.y + half },
          ];
    }
    if (s.kind === "device") return [];
    const r = obj as Rect;
    const all: { id: Handle; x: number; y: number }[] = [
      { id: "nw", x: r.x, y: r.y },
      { id: "n", x: r.x + r.w / 2, y: r.y },
      { id: "ne", x: r.x + r.w, y: r.y },
      { id: "e", x: r.x + r.w, y: r.y + r.d / 2 },
      { id: "se", x: r.x + r.w, y: r.y + r.d },
      { id: "s", x: r.x + r.w / 2, y: r.y + r.d },
      { id: "sw", x: r.x, y: r.y + r.d },
      { id: "w", x: r.x, y: r.y + r.d / 2 },
    ];
    return s.kind === "background" ? all.filter((h) => h.id.length === 2) : all;
  }

  private hit(x: number, y: number): Sel {
    const tol = 8 / this.scale;
    if (this.tool === "background") {
      const b = this.data.background;
      return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.d ? { kind: "background", index: 0 } : null;
    }
    const devs = this.data.devices;
    for (let i = devs.length - 1; i >= 0; i--) {
      if (!this.on(devs[i])) continue;
      const [dx, dy] = devs[i].position;
      if (Math.hypot(dx - x, dy - y) < 11 / this.scale) return { kind: "device", index: i };
    }
    const ops = this.data.openings;
    for (let i = ops.length - 1; i >= 0; i--) {
      const o = ops[i];
      if (!this.on(o)) continue;
      const half = (o.width ?? OPENING_WIDTH[o.type]) / 2;
      const [al, ac] = this.openingAxis(o) === "h" ? [x - o.x, y - o.y] : [y - o.y, x - o.x];
      if (Math.abs(al) <= half + tol && Math.abs(ac) <= WALL_T / 2 + tol) return { kind: "opening", index: i };
    }
    const inRect = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d;
    const furn = this.data.furniture;
    for (let i = furn.length - 1; i >= 0; i--) if (this.on(furn[i]) && inRect(furn[i])) return { kind: "furniture", index: i };
    let best: Sel = null;
    let bestArea = Infinity;
    this.data.rooms.forEach((r, i) => {
      if (this.on(r) && inRect(r) && r.w * r.d < bestArea) {
        best = { kind: "room", index: i };
        bestArea = r.w * r.d;
      }
    });
    return best;
  }

  // ---------- Souris ----------

  private onDown(e: PointerEvent): void {
    this.el.focus({ preventScroll: true });
    const [x, y] = this.toWorld(e);
    this.canvas.setPointerCapture(e.pointerId);
    const panButton = e.button === 1 || e.button === 2;
    if (panButton) {
      this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
      return;
    }

    if (this.tool === "room" || this.tool === "furniture") {
      const p: [number, number] = [snap(x), snap(y)];
      this.drag = { type: "create", start: p, cur: p };
      return;
    }
    if (this.tool === "device" && this.pendingDevice) {
      const item = this.pendingDevice;
      this.data.devices.push(this.stamp<DeviceConfig>({ entity: "", model: item.id, type: item.kind, position: [snap(x), snap(y)] }));
      this.pendingDevice = undefined;
      this.select({ kind: "device", index: this.data.devices.length - 1 });
      this.setTool("select");
      this.commit();
      return;
    }
    if (this.tool === "door" || this.tool === "glass_door" || this.tool === "window") {
      const near = this.nearestEdge(x, y, 0.6);
      if (near) {
        const along = snap(near.along);
        const o: OpeningConfig =
          near.edge.axis === "h"
            ? { type: this.tool, x: along, y: r2(near.edge.pos), width: OPENING_WIDTH[this.tool] }
            : { type: this.tool, x: r2(near.edge.pos), y: along, width: OPENING_WIDTH[this.tool] };
        this.data.openings.push(this.stamp(o));
        this.select({ kind: "opening", index: this.data.openings.length - 1 });
        this.setTool("select");
        this.commit();
      }
      return;
    }

    // Poignées de la sélection d'abord.
    const tol = 9 / this.scale;
    const h = this.handles().find((hd) => Math.abs(hd.x - x) < tol && Math.abs(hd.y - y) < tol);
    if (h) {
      const obj = this.selObj();
      if (this.sel!.kind === "opening") this.drag = { type: "owidth", obj };
      else {
        const lock = this.sel!.kind === "background" ? obj.d / obj.w : undefined;
        this.drag = { type: "resize", handle: h.id, obj, orig: { x: obj.x, y: obj.y, w: obj.w, d: obj.d }, lock };
      }
      return;
    }

    const hit = this.hit(x, y);
    this.select(hit);
    if (!hit) {
      this.drag = { type: "pan", sx: e.clientX, sy: e.clientY, ox: this.ox, oy: this.oy };
      return;
    }
    const obj = this.selObj();
    if (hit.kind === "opening") {
      this.drag = { type: "slide", obj };
      return;
    }
    const items: { obj: any; x: number; y: number; pos?: boolean }[] = [];
    const add = (o: any, pos = false) => items.push(pos ? { obj: o, x: o.position[0], y: o.position[1], pos } : { obj: o, x: o.x, y: o.y });
    add(obj, hit.kind === "device");
    if (hit.kind === "room") {
      // Une pièce emmène son contenu : meubles, appareils, et ouvertures posées sur ses murs.
      const r = obj as RoomConfig;
      const inside = (px: number, py: number) => px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.d;
      const onEdge = (px: number, py: number) =>
        ((Math.abs(px - r.x) < 0.02 || Math.abs(px - r.x - r.w) < 0.02) && py >= r.y && py <= r.y + r.d) ||
        ((Math.abs(py - r.y) < 0.02 || Math.abs(py - r.y - r.d) < 0.02) && px >= r.x && px <= r.x + r.w);
      for (const f of this.data.furniture) if (this.on(f) && inside(f.x + f.w / 2, f.y + f.d / 2)) add(f);
      for (const d of this.data.devices) if (this.on(d) && inside(d.position[0], d.position[1])) add(d, true);
      for (const o of this.data.openings) if (this.on(o) && onEdge(o.x, o.y)) add(o);
    }
    this.drag = { type: "move", start: [x, y], items, moved: false };
  }

  private onMove(e: PointerEvent): void {
    const [x, y] = this.toWorld(e);
    this.pointer = [x, y];
    const d = this.drag;
    if (!d) {
      this.updateCursor(x, y);
      this.drawCoords();
      return;
    }
    switch (d.type) {
      case "pan":
        this.ox = d.ox + e.clientX - d.sx;
        this.oy = d.oy + e.clientY - d.sy;
        break;
      case "create":
        d.cur = [snap(x), snap(y)];
        break;
      case "move": {
        const dx = snap(x - d.start[0]);
        const dy = snap(y - d.start[1]);
        if (dx || dy) d.moved = true;
        for (const it of d.items) {
          if (it.pos) it.obj.position = [r2(it.x + dx), r2(it.y + dy)];
          else {
            it.obj.x = r2(it.x + dx);
            it.obj.y = r2(it.y + dy);
          }
        }
        break;
      }
      case "resize":
        this.applyResize(d.obj, d.orig, d.handle, x, y, d.lock);
        break;
      case "slide": {
        const near = this.nearestEdge(x, y, 2);
        if (near) {
          const along = snap(near.along);
          if (near.edge.axis === "h") {
            d.obj.x = along;
            d.obj.y = r2(near.edge.pos);
          } else {
            d.obj.x = r2(near.edge.pos);
            d.obj.y = along;
          }
        }
        break;
      }
      case "owidth": {
        const along = this.openingAxis(d.obj) === "h" ? x - d.obj.x : y - d.obj.y;
        d.obj.width = Math.max(0.4, snap(Math.abs(along) * 2));
        break;
      }
    }
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = undefined;
    if (!d) return;
    if (d.type === "create") {
      const [x0, y0] = d.start;
      const [x1, y1] = d.cur;
      let rect: Rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: r2(Math.abs(x1 - x0)), d: r2(Math.abs(y1 - y0)) };
      if (this.tool === "room") {
        if (rect.w < MIN || rect.d < MIN) rect = { x: x0, y: y0, w: 3, d: 3 };
        const n = this.data.rooms.filter((r) => !r.outdoor && this.on(r)).length + 1;
        this.data.rooms.push(
          this.stamp<RoomConfig>({
            name: `${t("room")} ${n}`,
            ...rect,
            floor: ROOM_COLORS[n % ROOM_COLORS.length],
          }),
        );
        this.select({ kind: "room", index: this.data.rooms.length - 1 });
      } else {
        const def = FURNITURE_DEFAULTS[this.furnitureType];
        if (rect.w < MIN || rect.d < MIN) rect = { x: x0, y: y0, w: def.w, d: def.d };
        this.data.furniture.push(this.stamp<FurnitureConfig>({ type: this.furnitureType, ...rect, color: def.color }));
        this.select({ kind: "furniture", index: this.data.furniture.length - 1 });
      }
      this.setTool("select");
      this.commit();
      return;
    }
    if (d.type === "pan") {
      this.draw();
      return;
    }
    if (d.type === "move" && !d.moved) {
      this.draw();
      return;
    }
    void e;
    this.renderProps();
    this.commit();
  }

  private applyResize(obj: Rect, o: Rect, h: Handle, x: number, y: number, lock?: number): void {
    let x0 = o.x;
    let y0 = o.y;
    let x1 = o.x + o.w;
    let y1 = o.y + o.d;
    const sx = lock ? x : snap(x);
    const sy = lock ? y : snap(y);
    if (h.includes("w")) x0 = Math.min(sx, x1 - MIN);
    if (h.includes("e")) x1 = Math.max(sx, x0 + MIN);
    if (h.includes("n")) y0 = Math.min(sy, y1 - MIN);
    if (h.includes("s")) y1 = Math.max(sy, y0 + MIN);
    if (lock) {
      // Calque : on garde les proportions de l'image.
      const w = x1 - x0;
      const dNew = w * lock;
      if (h.includes("n")) y0 = y1 - dNew;
      else y1 = y0 + dNew;
    }
    obj.x = r2(x0);
    obj.y = r2(y0);
    obj.w = r2(x1 - x0);
    obj.d = r2(y1 - y0);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    const next = Math.min(400, Math.max(8, this.scale * k));
    this.ox = mx - ((mx - this.ox) * next) / this.scale;
    this.oy = my - ((my - this.oy) * next) / this.scale;
    this.scale = next;
    this.draw();
  }

  private zoom(k: number): void {
    const mx = this.el.clientWidth / 2;
    const my = this.el.clientHeight / 2;
    const next = Math.min(400, Math.max(8, this.scale * k));
    this.ox = mx - ((mx - this.ox) * next) / this.scale;
    this.oy = my - ((my - this.oy) * next) / this.scale;
    this.scale = next;
    this.draw();
  }

  private updateCursor(x: number, y: number): void {
    let c = "default";
    if (this.tool === "room" || this.tool === "furniture" || this.tool === "device") c = "crosshair";
    else if (this.tool === "door" || this.tool === "glass_door" || this.tool === "window") {
      c = this.nearestEdge(x, y, 0.6) ? "copy" : "not-allowed";
    } else {
      const tol = 9 / this.scale;
      const h = this.handles().find((hd) => Math.abs(hd.x - x) < tol && Math.abs(hd.y - y) < tol);
      if (h) {
        const map: Record<string, string> = { n: "ns", s: "ns", e: "ew", w: "ew", nw: "nwse", se: "nwse", ne: "nesw", sw: "nesw" };
        c = map[h.id] ? `${map[h.id]}-resize` : "ew-resize";
        if (h.id === "a" || h.id === "b") c = this.openingAxis(this.selObj()) === "h" ? "ew-resize" : "ns-resize";
      } else if (this.hit(x, y)) c = "move";
      else c = "grab";
    }
    this.canvas.style.cursor = c;
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    if (["Escape", "Delete", "Backspace"].includes(e.key) || e.key.startsWith("Arrow")) e.stopPropagation();
    if (e.key === "Escape") {
      this.select(null);
      this.setTool("select");
    } else if ((e.key === "Delete" || e.key === "Backspace") && this.sel) {
      e.preventDefault();
      this.deleteSel();
    } else if (e.key.startsWith("Arrow") && this.sel) {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : SNAP;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      const obj = this.selObj();
      if (this.sel.kind === "device") obj.position = [r2(obj.position[0] + dx), r2(obj.position[1] + dy)];
      else {
        obj.x = r2(obj.x + dx);
        obj.y = r2(obj.y + dy);
      }
      this.renderProps();
      this.commit();
    }
  }

  // ---------- Sélection et modifications ----------

  private select(sel: Sel): void {
    this.sel = sel;
    this.renderProps();
    this.draw();
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    if (tool === "background") this.sel = { kind: "background", index: 0 };
    else if (this.sel?.kind === "background") this.sel = null;
    this.renderTools();
    this.renderProps();
    this.draw();
  }

  private commit(): void {
    this.draw();
    this.onChange();
  }

  private deleteSel(): void {
    const s = this.sel;
    if (!s) return;
    if (s.kind === "room") {
      this.data.rooms.splice(s.index, 1);
      const orphans = this.data.openings.filter((o) => !this.nearestEdge(o.x, o.y, 0.05));
      for (const o of orphans) this.data.openings.splice(this.data.openings.indexOf(o), 1);
    }
    else if (s.kind === "furniture") this.data.furniture.splice(s.index, 1);
    else if (s.kind === "opening") this.data.openings.splice(s.index, 1);
    else if (s.kind === "device") this.data.devices.splice(s.index, 1);
    else if (s.kind === "background") {
      this.data.background = undefined;
      this.bgImg = undefined;
      this.bgSrc = undefined;
    }
    this.sel = s.kind === "background" ? s : null;
    this.renderProps();
    this.commit();
  }

  private onToolClick(e: Event): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-tool], [data-act]");
    if (!btn) return;
    if (btn.dataset.tool) this.setTool(btn.dataset.tool as Tool);
    else if (btn.dataset.act === "zin") this.zoom(1.25);
    else if (btn.dataset.act === "zout") this.zoom(0.8);
    else if (btn.dataset.act === "fit") this.fit();
  }

  private renderTools(): void {
    const tool = (id: Tool, icon: string) =>
      `<button data-tool="${id}" class="${this.tool === id ? "active" : ""}" title="${t(`tool_${id}`)}">${icon}<span>${t(`tool_${id}`)}</span></button>`;
    this.toolsEl.innerHTML = `
      ${tool("select", "↖")}
      ${tool("room", "▭")}
      ${tool("door", "◜")}
      ${tool("glass_door", "◫")}
      ${tool("window", "☰")}
      <span class="group">
        ${tool("furniture", "▣")}
        <select data-act="ftype" title="${t("type")}">
          ${FURNITURE_TYPES.map((f) => `<option value="${f}" ${f === this.furnitureType ? "selected" : ""}>${t(`f_${f}`)}</option>`).join("")}
        </select>
      </span>
      ${tool("background", "⧉")}
      <span class="group">
        <button data-act="zout" title="−">−</button>
        <button data-act="zin" title="+">+</button>
        <button data-act="fit" title="${t("fit")}">⤢</button>
      </span>`;
    const hints: Record<Tool, string> = {
      select: "hint_select",
      room: "hint_room",
      door: "hint_opening",
      glass_door: "hint_opening",
      window: "hint_opening",
      furniture: "hint_furniture",
      device: "place_hint",
      background: "hint_background",
    };
    this.hintEl.textContent = t(hints[this.tool]) + (this.tool === "device" && this.pendingDevice ? ` : ${this.pendingDevice.name}` : "");
  }

  private renderProps(): void {
    const s = this.sel;
    const obj = this.selObj();
    if (!s || (!obj && s.kind !== "background")) {
      this.propsEl.hidden = true;
      return;
    }
    this.propsEl.hidden = false;
    const num = (prop: string, label: string, v: number, step = 0.05) =>
      `<label>${label}<input type="number" data-prop="${prop}" step="${step}" value="${r2(v)}"></label>`;
    const geom = (o: Rect) => `<div class="grid2">${num("x", "x", o.x)}${num("y", "y", o.y)}${num("w", t("width"), o.w)}${num("d", t("depth"), o.d)}</div>`;
    let html = "";
    let actions = `<button data-act="delete" class="danger">${t("delete")}</button>`;
    switch (s.kind) {
      case "room": {
        const r = obj as RoomConfig;
        html = `<div class="ptitle">${t("room")}</div>
          <label>${t("name")}<input type="text" data-prop="name" value="${esc(r.name)}"></label>
          ${geom(r)}
          <div class="grid2">
            <label>${t("floor_color")}<input type="color" data-prop="floor" value="${esc(r.floor ?? (r.outdoor ? "#b8b0a3" : "#cbb79c"))}"></label>
            <label class="check"><input type="checkbox" data-prop="outdoor" ${r.outdoor ? "checked" : ""}>${t("outdoor")}</label>
          </div>
          <label>${t("floor_material")}<select data-prop="material">${["", "wood", "tiles", "carpet", "concrete", "deck"]
            .map((m) => `<option value="${m}" ${(r.material ?? "") === m ? "selected" : ""}>${t(m ? `mat_${m}` : "auto_material")}</option>`)
            .join("")}</select></label>
          <div class="muted">${fmt(r.w * r.d)} m²</div>`;
        actions = `<button data-act="duplicate">${t("duplicate")}</button>` + actions;
        break;
      }
      case "furniture": {
        const f = obj as FurnitureConfig;
        html = `<div class="ptitle">${esc(t(`f_${f.type ?? "box"}`))}</div>
          <label>${t("type")}<select data-prop="type">${FURNITURE_TYPES.map(
            (ft) => `<option value="${ft}" ${ft === (f.type ?? "box") ? "selected" : ""}>${t(`f_${ft}`)}</option>`,
          ).join("")}</select></label>
          ${geom(f)}
          <div class="grid2">
            ${num("h", t("height"), f.h ?? 0, 0.05).replace(`value="0"`, `value="" placeholder="auto"`)}
            <label>${t("color")}<input type="color" data-prop="color" value="${esc(f.color ?? "#a08c74")}"></label>
          </div>`;
        actions = `<button data-act="rotate">${t("rotate")}</button><button data-act="duplicate">${t("duplicate")}</button>` + actions;
        break;
      }
      case "opening": {
        const o = obj as OpeningConfig;
        html = `<div class="ptitle">${esc(t(o.type))}</div>
          <label>${t("type")}<select data-prop="type">${(["door", "glass_door", "window"] as const)
            .map((ty) => `<option value="${ty}" ${ty === o.type ? "selected" : ""}>${t(ty)}</option>`)
            .join("")}</select></label>
          <div class="grid2">${num("x", "x", o.x)}${num("y", "y", o.y)}</div>
          ${num("width", t("width"), o.width ?? OPENING_WIDTH[o.type])}
          <label>${t("opening_sensor")}<select data-prop="sensor">${this.hooks.sensorOptions(o.sensor)}</select></label>
          <div class="muted">${t("opening_sensor_hint")}</div>`;
        break;
      }
      case "device": {
        const d = obj as DeviceConfig;
        const item = deviceItem(d.model);
        html = `<div class="ptitle">${item?.icon ?? ""} ${esc(d.name ?? item?.name ?? d.entity)}</div>
          <div class="muted">${esc(d.entity || t("unlinked"))} · ${esc(kindOf(d))}</div>
          <label>${t("link_entity")}<select data-prop="entity">${this.hooks.entityOptions(d)}</select></label>
          <label>${t("model")}<select data-prop="model">${this.hooks.modelOptions(d)}</select></label>
          ${item?.shape === "strip" ? `<label>${t("length")} (m)<input type="number" data-prop="length" min="0.3" step="0.1" value="${esc(d.length ?? "")}" placeholder="${esc(item.length ?? 2)}"></label>` : ""}
          <label>${t("name")}<input type="text" data-prop="name" value="${esc(d.name ?? "")}" placeholder="auto"></label>
          <div class="grid2">${num("px", "x", d.position[0])}${num("py", "y", d.position[1])}</div>
          <label>${t("height")}<input type="number" data-prop="height" step="0.05" value="${esc(d.height ?? "")}" placeholder="auto"></label>`;
        break;
      }
      case "background": {
        const b = obj as BackgroundConfig | undefined;
        html = `<div class="ptitle">${t("tool_background")}</div>
          <label class="file">${t("choose_image")}<input type="file" accept="image/*" data-prop="file"></label>
          <label>${t("image_url")}<input type="text" data-prop="image" value="${b && !b.image.startsWith("data:") ? esc(b.image) : ""}" placeholder="/local/plan.png"></label>`;
        if (b) {
          html += `${geom(b)}
            <label>${t("opacity")}<input type="range" data-prop="opacity" min="0.1" max="1" step="0.05" value="${esc(b.opacity ?? 0.5)}"></label>`;
        } else actions = "";
        break;
      }
    }
    this.propsEl.innerHTML = `${html}<div class="pactions">${actions}</div>`;
  }

  private onPropChange(e: Event): void {
    const input = e.target as HTMLInputElement;
    const prop = input.dataset.prop;
    if (!prop || !this.sel) return;
    const obj = this.selObj();
    const v = input.type === "checkbox" ? input.checked : input.value;
    const n = Number(v);

    if (prop === "file") {
      this.loadImageFile(input.files?.[0]);
      return;
    }
    if (prop === "image") {
      this.setBackgroundImage(String(v).trim());
      return;
    }
    switch (this.sel.kind) {
      case "device":
        if (prop === "px" || prop === "py") {
          const i = prop === "px" ? 0 : 1;
          if (Number.isFinite(n)) obj.position[i] = r2(n);
        } else if (prop === "height") {
          if (v === "") delete obj.height;
          else if (Number.isFinite(n)) obj.height = r2(n);
        } else if (prop === "name") {
          if (v) obj.name = v;
          else delete obj.name;
        } else if (prop === "entity") {
          obj.entity = String(v);
        } else if (prop === "model") {
          const item = deviceItem(String(v));
          if (item) {
            obj.model = item.id;
            obj.type = item.kind;
          } else delete obj.model;
        } else if (prop === "length") {
          if (v === "") delete obj.length;
          else if (n > 0) obj.length = r2(n);
        }
        this.renderProps();
        break;
      default:
        if (["x", "y", "w", "d", "width", "h", "opacity"].includes(prop)) {
          if (v === "" && prop === "h") delete obj.h;
          else if (Number.isFinite(n)) {
            obj[prop] = ["w", "d", "width"].includes(prop) ? Math.max(MIN, r2(n)) : r2(n);
            if (this.sel.kind === "background" && prop === "w" && this.bgImg) {
              obj.d = r2((obj.w * this.bgImg.naturalHeight) / this.bgImg.naturalWidth);
            }
          }
        } else if (prop === "outdoor") {
          if (v) obj.outdoor = true;
          else delete obj.outdoor;
        } else if (prop === "sensor") {
          if (/^binary_sensor\.[a-z0-9_]+$/.test(String(v))) obj.sensor = v;
          else delete obj.sensor;
        } else if (prop === "material") {
          if (["wood", "tiles", "carpet", "concrete", "deck"].includes(String(v))) obj.material = v;
          else delete obj.material;
        } else if (prop === "floor" || prop === "color") {
          if (/^#[0-9a-f]{6}$/i.test(String(v))) obj[prop] = v;
        } else if (prop === "name") {
          obj.name = String(v).slice(0, 60);
        } else if (prop === "type") {
          obj.type = v;
        }
    }
    if (prop === "type" || prop === "outdoor" || prop === "w") this.renderProps();
    this.commit();
  }

  private onPropClick(e: Event): void {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    const obj = this.selObj();
    if (!act || !this.sel) return;
    if (act === "delete") this.deleteSel();
    else if (act === "duplicate" && obj) {
      const copy = { ...JSON.parse(JSON.stringify(obj)), x: r2(obj.x + 0.5), y: r2(obj.y + 0.5) };
      if (this.sel.kind === "room") {
        this.data.rooms.push(copy);
        this.select({ kind: "room", index: this.data.rooms.length - 1 });
      } else {
        this.data.furniture.push(copy);
        this.select({ kind: "furniture", index: this.data.furniture.length - 1 });
      }
      this.commit();
    } else if (act === "rotate" && obj) {
      const cx = obj.x + obj.w / 2;
      const cy = obj.y + obj.d / 2;
      [obj.w, obj.d] = [obj.d, obj.w];
      obj.x = snap(cx - obj.w / 2);
      obj.y = snap(cy - obj.d / 2);
      this.renderProps();
      this.commit();
    }
  }

  // ---------- Calque ----------

  private loadImageFile(file: File | undefined): void {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert(t("image_only"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Réduit l'image pour qu'elle tienne dans la config du tableau de bord.
        const max = 1200;
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext("2d")!;
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        this.setBackgroundImage(c.toDataURL("image/jpeg", 0.72));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  private setBackgroundImage(src: string): void {
    if (!src || !/^(data:image\/(png|jpeg|webp|gif);base64,|https?:\/\/|\/)/i.test(src)) {
      if (src) alert(t("image_only"));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalHeight / img.naturalWidth;
      const rects = this.data.rooms;
      const width = rects.length
        ? Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)) + 2
        : 10;
      const old = this.data.background;
      const x = old?.x ?? (rects.length ? Math.min(...rects.map((r) => r.x)) - 1 : 0);
      const y = old?.y ?? (rects.length ? Math.min(...rects.map((r) => r.y)) - 1 : 0);
      const w = old?.w ?? r2(width);
      this.data.background = { image: src, x: r2(x), y: r2(y), w, d: r2(w * ratio), opacity: old?.opacity ?? 0.5 };
      this.bgImg = img;
      this.bgSrc = src;
      this.sel = { kind: "background", index: 0 };
      this.renderProps();
      this.commit();
    };
    img.onerror = () => alert(t("image_only"));
    img.src = src;
  }

  // ---------- Dessin ----------

  private css(name: string, fallback: string): string {
    return getComputedStyle(this.el).getPropertyValue(name).trim() || fallback;
  }

  draw(): void {
    if (!this.data || this.el.hidden) return;
    const g = this.g;
    const dpr = this.canvas.width / Math.max(1, this.el.clientWidth);
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = this.css("--card-background-color", "#ffffff");
    const text = this.css("--primary-text-color", "#1f2328");
    const accent = this.css("--primary-color", "#ff9b42");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // Calque
    const b = this.data.background;
    if (b) {
      if (this.bgSrc !== b.image) {
        this.bgSrc = b.image;
        this.bgImg = new Image();
        this.bgImg.onload = () => this.draw();
        this.bgImg.src = b.image;
      }
      if (this.bgImg?.complete && this.bgImg.naturalWidth) {
        g.globalAlpha = b.opacity ?? 0.5;
        g.drawImage(this.bgImg, this.sx(b.x), this.sy(b.y), b.w * this.scale, b.d * this.scale);
        g.globalAlpha = 1;
      }
    }

    // Grille (50 cm, 1 m plus marqué)
    const step = this.scale < 25 ? 1 : 0.5;
    const x0 = Math.floor(-this.ox / this.scale / step) * step;
    const y0 = Math.floor(-this.oy / this.scale / step) * step;
    g.lineWidth = 1;
    for (let x = x0; this.sx(x) < W; x += step) {
      g.strokeStyle = Math.abs(x % 1) < 0.01 ? "rgba(128,128,128,0.22)" : "rgba(128,128,128,0.1)";
      g.beginPath();
      g.moveTo(Math.round(this.sx(x)) + 0.5, 0);
      g.lineTo(Math.round(this.sx(x)) + 0.5, H);
      g.stroke();
    }
    for (let y = y0; this.sy(y) < H; y += step) {
      g.strokeStyle = Math.abs(y % 1) < 0.01 ? "rgba(128,128,128,0.22)" : "rgba(128,128,128,0.1)";
      g.beginPath();
      g.moveTo(0, Math.round(this.sy(y)) + 0.5);
      g.lineTo(W, Math.round(this.sy(y)) + 0.5);
      g.stroke();
    }

    // Étage du dessous en pointillés, pour aligner les murs.
    if (this.level > 0) {
      g.setLineDash([4, 4]);
      g.strokeStyle = "rgba(120,120,120,0.55)";
      g.lineWidth = 1.5;
      for (const r of this.data.rooms) {
        if ((r.level ?? 0) === this.level - 1) g.strokeRect(this.sx(r.x), this.sy(r.y), r.w * this.scale, r.d * this.scale);
      }
      g.setLineDash([]);
    }

    // Sols
    for (const r of this.data.rooms.filter(this.on)) {
      g.globalAlpha = r.outdoor ? 0.35 : 0.6;
      g.fillStyle = r.floor ?? (r.outdoor ? "#b8b0a3" : "#cbb79c");
      g.fillRect(this.sx(r.x), this.sy(r.y), r.w * this.scale, r.d * this.scale);
      g.globalAlpha = 1;
      if (r.outdoor) {
        g.setLineDash([5, 4]);
        g.strokeStyle = "rgba(100,100,100,0.6)";
        g.lineWidth = 1;
        g.strokeRect(this.sx(r.x), this.sy(r.y), r.w * this.scale, r.d * this.scale);
        g.setLineDash([]);
      }
    }
    // Murs
    g.strokeStyle = text;
    g.globalAlpha = 0.85;
    g.lineWidth = Math.max(2, WALL_T * this.scale);
    g.lineJoin = "miter";
    for (const r of this.data.rooms.filter(this.on)) {
      if (!r.outdoor) g.strokeRect(this.sx(r.x), this.sy(r.y), r.w * this.scale, r.d * this.scale);
    }
    g.globalAlpha = 1;

    // Ouvertures
    for (const o of this.data.openings.filter(this.on)) this.drawOpening(o, bg);

    // Meubles
    g.font = "10px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of this.data.furniture.filter(this.on)) {
      const x = this.sx(f.x);
      const y = this.sy(f.y);
      const w = f.w * this.scale;
      const h = f.d * this.scale;
      g.fillStyle = f.color ?? "#a08c74";
      g.globalAlpha = 0.85;
      if (f.type === "plant") {
        g.beginPath();
        g.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1;
      if (f.type !== "plant") g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (w > 44 && h > 14) {
        g.fillStyle = luminance(f.color ?? "#a08c74") > 0.6 ? "#333" : "#fff";
        g.fillText(t(`f_${f.type ?? "box"}`), x + w / 2, y + h / 2);
      }
    }

    // Noms et surfaces des pièces
    g.fillStyle = text;
    const named = new Set<string>();
    const rooms = this.data.rooms.filter(this.on).sort((a, b2) => b2.w * b2.d - a.w * a.d);
    for (const r of rooms) {
      if (named.has(r.name)) continue;
      named.add(r.name);
      const cx = this.sx(r.x + r.w / 2);
      const cy = this.sy(r.y + r.d / 2);
      const area = this.data.rooms.filter((o) => this.on(o) && o.name === r.name).reduce((s, o) => s + o.w * o.d, 0);
      g.font = "600 12px system-ui, sans-serif";
      g.fillText(r.name, cx, cy - 7);
      g.font = "11px system-ui, sans-serif";
      g.globalAlpha = 0.65;
      g.fillText(`${fmt(area)} m²`, cx, cy + 8);
      g.globalAlpha = 1;
    }

    // Appareils
    for (const d of this.data.devices.filter(this.on)) {
      const x = this.sx(d.position[0]);
      const y = this.sy(d.position[1]);
      const item = deviceItem(d.model);
      g.beginPath();
      g.arc(x, y, item ? 9 : 6, 0, Math.PI * 2);
      g.fillStyle = d.entity ? accent : "#9aa0a6";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = bg;
      g.stroke();
      if (item) {
        g.font = "10px system-ui, sans-serif";
        g.fillText(item.icon, x, y + 1);
      }
    }

    // Sélection
    const sel = this.selObj();
    if (this.sel && sel) {
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      if (this.sel.kind === "device") {
        g.beginPath();
        g.arc(this.sx(sel.position[0]), this.sy(sel.position[1]), 11, 0, Math.PI * 2);
        g.stroke();
        g.font = "11px system-ui, sans-serif";
        g.fillStyle = text;
        g.fillText(sel.name ?? sel.entity, this.sx(sel.position[0]), this.sy(sel.position[1]) - 18);
      } else if (this.sel.kind !== "opening") {
        g.strokeRect(this.sx(sel.x) - 2, this.sy(sel.y) - 2, sel.w * this.scale + 4, sel.d * this.scale + 4);
        // Cotes
        g.setLineDash([]);
        g.font = "11px system-ui, sans-serif";
        g.fillStyle = accent;
        g.fillText(`${fmt(sel.w)} m`, this.sx(sel.x + sel.w / 2), this.sy(sel.y) - 12);
        g.save();
        g.translate(this.sx(sel.x) - 12, this.sy(sel.y + sel.d / 2));
        g.rotate(-Math.PI / 2);
        g.fillText(`${fmt(sel.d)} m`, 0, 0);
        g.restore();
      }
      g.setLineDash([]);
      for (const h of this.handles()) {
        g.fillStyle = bg;
        g.strokeStyle = accent;
        g.lineWidth = 2;
        g.fillRect(this.sx(h.x) - 5, this.sy(h.y) - 5, 10, 10);
        g.strokeRect(this.sx(h.x) - 5, this.sy(h.y) - 5, 10, 10);
      }
    }

    // Aperçu de création
    const d = this.drag;
    if (d?.type === "create") {
      const [ax, ay] = d.start;
      const [bx, by] = d.cur;
      g.setLineDash([6, 4]);
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.fillStyle = "rgba(255,155,66,0.12)";
      const rx = this.sx(Math.min(ax, bx));
      const ry = this.sy(Math.min(ay, by));
      const rw = Math.abs(bx - ax) * this.scale;
      const rh = Math.abs(by - ay) * this.scale;
      g.fillRect(rx, ry, rw, rh);
      g.strokeRect(rx, ry, rw, rh);
      g.setLineDash([]);
      g.fillStyle = accent;
      g.font = "11px system-ui, sans-serif";
      g.fillText(`${fmt(Math.abs(bx - ax))} × ${fmt(Math.abs(by - ay))} m`, rx + rw / 2, ry - 10);
    }

    this.drawCoords();
  }

  private drawOpening(o: OpeningConfig, bg: string): void {
    const g = this.g;
    const axis = this.openingAxis(o);
    const half = (o.width ?? OPENING_WIDTH[o.type]) / 2;
    const [x1, y1, x2, y2] = axis === "h" ? [o.x - half, o.y, o.x + half, o.y] : [o.x, o.y - half, o.x, o.y + half];
    const line = (ax: number, ay: number, bx: number, by: number) => {
      g.beginPath();
      g.moveTo(this.sx(ax), this.sy(ay));
      g.lineTo(this.sx(bx), this.sy(by));
      g.stroke();
    };
    // Trou dans le mur
    g.strokeStyle = bg;
    g.lineWidth = Math.max(2, WALL_T * this.scale) + 2;
    g.lineCap = "butt";
    line(x1, y1, x2, y2);
    const off = (WALL_T / 2) * 0.6;
    if (o.type === "door") {
      g.strokeStyle = "#e08a3c";
      g.lineWidth = 1.5;
      // Battant en quart de cercle, ouvert du côté de la pièce la plus proche.
      const inside = this.data.rooms.find((r) => !r.outdoor && o.x + (axis === "v" ? 0.1 : 0) > r.x && o.x + (axis === "v" ? 0.1 : 0) < r.x + r.w && o.y + (axis === "h" ? 0.1 : 0) > r.y && o.y + (axis === "h" ? 0.1 : 0) < r.y + r.d);
      const s = inside ? 1 : -1;
      const w = half * 2 * this.scale;
      g.beginPath();
      if (axis === "h") {
        g.moveTo(this.sx(x1), this.sy(y1));
        g.lineTo(this.sx(x1), this.sy(y1) + s * w);
        g.moveTo(this.sx(x1), this.sy(y1) + s * w);
        g.arc(this.sx(x1), this.sy(y1), w, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0, s > 0);
      } else {
        g.moveTo(this.sx(x1), this.sy(y1));
        g.lineTo(this.sx(x1) + s * w, this.sy(y1));
        g.moveTo(this.sx(x1) + s * w, this.sy(y1));
        g.arc(this.sx(x1), this.sy(y1), w, s > 0 ? 0 : Math.PI, Math.PI / 2, s < 0);
      }
      g.setLineDash([3, 3]);
      g.stroke();
      g.setLineDash([]);
    } else {
      g.strokeStyle = o.type === "glass_door" ? "#3d8fd6" : "#7fb8e6";
      g.lineWidth = o.type === "glass_door" ? 2 : 1.5;
      const n = o.type === "glass_door" ? [-off, off] : [-off, 0, off];
      for (const k of n) {
        if (axis === "h") line(x1, y1 + k, x2, y2 + k);
        else line(x1 + k, y1, x2 + k, y2);
      }
    }
  }

  private drawCoords(): void {
    const g = this.g;
    const H = this.el.clientHeight;
    const text = `x ${fmt(this.pointer[0])}  y ${fmt(this.pointer[1])}`;
    g.font = "11px ui-monospace, monospace";
    g.textAlign = "left";
    const w = g.measureText(text).width + 12;
    g.fillStyle = this.css("--card-background-color", "#ffffff");
    const W = this.el.clientWidth;
    g.fillRect(W - w - 10, H - 84, w, 18);
    g.fillStyle = this.css("--secondary-text-color", "#6b7280");
    g.textBaseline = "middle";
    g.fillText(text, W - w - 4, H - 75);
    g.textAlign = "center";
  }

  dispose(): void {
    this.resizeObs.disconnect();
  }
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (!Number.isFinite(n)) return 0.5;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
