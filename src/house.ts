import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { fabricTexture, floorTexture, guessFloor, repeated, woodGrainTexture } from "./textures";
import type { FurnitureConfig, OpeningConfig, RoomConfig } from "./types";

// Construit la maison à partir du plan : sols, murs (générés depuis les pièces),
// portes, fenêtres, garde-corps et meubles. Le plan (x, y) devient la scène (x, hauteur, z = y).

export const WALL_T = 0.12;
const LOW_H = 0.32;
const DOOR_H = 2.05;
const SILL_H = 0.9;
const WINDOW_TOP = 2.1;
const FRAME = 0.05;
const EPS = 0.001;

export type WallMode = "cutaway" | "low" | "full";

/** Hauteur par défaut des meubles « simples » (blocs). */
const FURNITURE_HEIGHT: Partial<Record<string, number>> = {
  nightstand: 0.5,
  wardrobe: 2.0,
  tv_stand: 0.45,
  fridge: 1.85,
  box: 0.8,
};

interface WallPart {
  mesh: THREE.Mesh;
  y0: number;
  h: number;
}

/** Un tronçon de mur (ou d'ouverture) qui se rabaisse en bloc. */
interface WallPiece {
  parts: WallPart[];
  exterior: boolean;
  /** Normale horizontale vers l'extérieur (nulle pour un mur intérieur). */
  normal: THREE.Vector3;
  center: THREE.Vector3;
  /** 0 = pleine hauteur, 1 = rabaissé. */
  t: number;
  target: number;
}

interface Line {
  axis: "h" | "v"; // h : y constant (mur parallèle à x) ; v : x constant
  pos: number;
  spans: [number, number][];
  cuts: number[];
  openings: { a: number; b: number; cfg: OpeningConfig }[];
}

export interface WallHit {
  axis: "h" | "v";
  pos: number;
  /** Direction horizontale vers l'intérieur de la pièce où se trouve le point. */
  inward: THREE.Vector3;
  pieceIndex: number;
  opening?: { a: number; b: number; cfg: OpeningConfig };
}

/** Battant de porte ou de fenêtre animé (ouvert par défaut, ou piloté par un capteur). */
export interface OpeningView {
  cfg: OpeningConfig;
  /** Pièces fermées de part et d'autre (pour l'alerte « fenêtre ouverte + clim »). */
  rooms: string[];
  /** 0 = fermé, 1 = ouvert. */
  open: number;
  target: number;
  apply(open: number): void;
  setAlert(on: boolean): void;
}

interface RoomFloor {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  base: THREE.Color;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export class House {
  readonly group = new THREE.Group();
  private furnitureGroups: THREE.Group[] = [];
  readonly floorMeshes: THREE.Mesh[] = [];
  readonly bounds = new THREE.Box3();
  readonly openings: OpeningView[] = [];
  /** Pièces fermées (les espaces extérieurs n'ont pas de murs). */
  private indoor: RoomConfig[];
  private pieces: WallPiece[] = [];
  private lines: Line[] = [];
  private floors = new Map<string, RoomFloor[]>();
  private roomLabels = new Map<string, { el: HTMLElement; name: string }>();
  private glow = new Map<string, number>();
  private wallMat = new THREE.MeshStandardMaterial({ color: 0xefe9e0, roughness: 0.95 });
  private trimMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.5 });
  private frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f3f0, roughness: 0.4 });
  private doorMat = new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.55 });
  private glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6f5,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  constructor(
    private rooms: RoomConfig[],
    openings: OpeningConfig[],
    furniture: FurnitureConfig[],
    private wallH: number,
  ) {
    this.indoor = rooms.filter((r) => !r.outdoor);
    this.buildFloors();
    this.collectLines(openings);
    this.buildWalls();
    this.buildRailings();
    for (const f of furniture) this.buildFurniture(f);
    this.bounds.setFromObject(this.group);
  }

  // ---------- Requêtes ----------

  roomAt(x: number, y: number): RoomConfig | undefined {
    return [...this.indoor, ...this.rooms].find((r) => x > r.x - EPS && x < r.x + r.w + EPS && y > r.y - EPS && y < r.y + r.d + EPS);
  }

  /** Noms des pièces (une pièce en L n'apparaît qu'une fois). */
  get roomNames(): string[] {
    return [...new Set(this.rooms.map((r) => r.name))];
  }

  roomArea(name: string): number {
    return this.rooms.filter((r) => r.name === name).reduce((s, r) => s + r.w * r.d, 0);
  }

  get outdoorRooms(): RoomConfig[] {
    return this.rooms.filter((r) => r.outdoor);
  }

  /** Sol extérieur mouillé (0 à 1) : plus brillant (la couleur reste gérée par setRoomTint). */
  setWet(v: number): void {
    for (const r of this.outdoorRooms) {
      for (const f of this.floors.get(r.name) ?? []) {
        f.mat.roughness = 0.7 - 0.5 * v;
        f.mat.envMapIntensity = 1 + 1.5 * v;
      }
    }
  }

  isOutdoor(name: string): boolean {
    return this.rooms.some((r) => r.name === name && r.outdoor);
  }

  private indoorAt(x: number, y: number): RoomConfig | undefined {
    return this.indoor.find((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.d);
  }

  private inside(x: number, y: number): boolean {
    return !!this.indoorAt(x, y);
  }

  /** Mur le plus proche d'un point du plan (pour accrocher clim, volets, TV…). */
  nearestWall(x: number, y: number, maxDist = 0.6): WallHit | undefined {
    let best: { line: Line; dist: number } | undefined;
    for (const line of this.lines) {
      const [along, across] = line.axis === "h" ? [x, y] : [y, x];
      const dist = Math.abs(across - line.pos);
      if (dist > maxDist) continue;
      if (!line.spans.some(([a, b]) => along >= a - 0.05 && along <= b + 0.05)) continue;
      if (!best || dist < best.dist) best = { line, dist };
    }
    if (!best) return undefined;
    const { line } = best;
    const along = line.axis === "h" ? x : y;
    // L'intérieur est le côté où se trouve le point ; s'il est sur la ligne, le côté qui a une pièce.
    let side = Math.sign((line.axis === "h" ? y : x) - line.pos);
    if (side === 0) {
      const probe = (s: number) =>
        line.axis === "h" ? this.inside(along, line.pos + s * 0.05) : this.inside(line.pos + s * 0.05, along);
      side = probe(1) ? 1 : -1;
    }
    const inward = line.axis === "h" ? new THREE.Vector3(0, 0, side) : new THREE.Vector3(side, 0, 0);
    const opening = line.openings.find((o) => along >= o.a - 0.1 && along <= o.b + 0.1);
    const planPoint = line.axis === "h" ? new THREE.Vector3(along, 1, line.pos) : new THREE.Vector3(line.pos, 1, along);
    let pieceIndex = -1;
    let bestD = Infinity;
    this.pieces.forEach((p, i) => {
      const d = p.center.distanceTo(planPoint);
      if (d < bestD) {
        bestD = d;
        pieceIndex = i;
      }
    });
    return { axis: line.axis, pos: line.pos, inward, pieceIndex, opening };
  }

  /** 0 = mur plein, 1 = mur rabaissé. */
  pieceLowness(index: number): number {
    return this.pieces[index]?.t ?? 0;
  }

  // ---------- Pièces : teinte (carte de chaleur), lueur (présence), étiquette ----------

  /** Teinte le sol d'une pièce (null = couleur d'origine). */
  setRoomTint(name: string, color: THREE.Color | null): void {
    for (const f of this.floors.get(name) ?? []) {
      if (color) f.mat.color.copy(color);
      else f.mat.color.copy(f.base);
    }
  }

  /** Lueur du sol (0 à 1), animée par l'appelant. */
  setRoomGlow(name: string, v: number, color: THREE.ColorRepresentation = 0xffc48a): void {
    if ((this.glow.get(name) ?? 0) === v) return;
    this.glow.set(name, v);
    for (const f of this.floors.get(name) ?? []) {
      f.mat.emissive.set(color);
      f.mat.emissiveIntensity = v * 0.35;
    }
  }

  /** Texte ajouté sous le nom de la pièce (ex. « 21,5 °C »). */
  setRoomInfo(name: string, info: string | null): void {
    const l = this.roomLabels.get(name);
    if (!l) return;
    l.el.textContent = info ? `${l.name} · ${info}` : l.name;
    l.el.classList.toggle("with-info", !!info);
  }

  setRoomSelected(name: string | null): void {
    for (const [room, label] of this.roomLabels) label.el.classList.toggle("selected", room === name);
  }

  // ---------- Murs coupés selon la caméra ----------

  updateCutaway(camera: THREE.Camera, mode: WallMode, dt: number): void {
    const toCam = new THREE.Vector3();
    for (const p of this.pieces) {
      if (mode === "full") p.target = 0;
      else if (mode === "low") p.target = 1;
      else if (!p.exterior) p.target = 0;
      else {
        toCam.subVectors(camera.position, p.center).setY(0).normalize();
        p.target = p.normal.dot(toCam) > 0.05 ? 1 : 0;
      }
      if (p.t === p.target) continue;
      const step = dt * 4;
      p.t = p.t < p.target ? Math.min(p.target, p.t + step) : Math.max(p.target, p.t - step);
      const ease = p.t * p.t * (3 - 2 * p.t);
      const cap = this.wallH - ease * (this.wallH - LOW_H);
      for (const part of p.parts) {
        if (part.y0 >= cap - EPS) {
          part.mesh.visible = false;
        } else {
          part.mesh.visible = true;
          part.mesh.scale.y = Math.max(0.001, Math.min(part.h, cap - part.y0) / part.h);
        }
      }
    }
  }

  /** Anime les battants vers leur position cible. */
  tickOpenings(dt: number): void {
    for (const o of this.openings) {
      if (o.open === o.target) continue;
      const k = 1 - Math.exp(-dt * 5);
      o.open += (o.target - o.open) * k;
      if (Math.abs(o.open - o.target) < 0.005) o.open = o.target;
      o.apply(o.open);
    }
  }

  // ---------- Construction ----------

  private buildFloors(): void {
    for (const r of this.rooms) {
      const kind = r.material ?? guessFloor(r.name, r.outdoor);
      const base = new THREE.Color(r.floor ?? (r.outdoor ? "#b49a7c" : kind === "tiles" ? "#d9d6d0" : "#c9a77c"));
      const mat = new THREE.MeshStandardMaterial({
        color: base,
        map: repeated(floorTexture(kind), kind, r.w, r.d),
        roughness: kind === "tiles" ? 0.35 : kind === "carpet" ? 1 : 0.7,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.06, r.d), mat);
      // Les extérieurs sont un peu plus bas (seuil), et légèrement décalés pour éviter le scintillement.
      mesh.position.set(r.x + r.w / 2, r.outdoor ? -0.05 : -0.03, r.y + r.d / 2);
      mesh.receiveShadow = true;
      mesh.userData.room = r.name;
      this.group.add(mesh);
      this.floorMeshes.push(mesh);
      const list = this.floors.get(r.name) ?? [];
      list.push({ mesh, mat, base: base.clone() });
      this.floors.set(r.name, list);

      const biggest = this.rooms.filter((o) => o.name === r.name).reduce((a, b) => (b.w * b.d > a.w * a.d ? b : a));
      if (biggest !== r) continue;
      const el = document.createElement("div");
      el.className = "room-label";
      el.textContent = r.name;
      this.roomLabels.set(r.name, { el, name: r.name });
      const label = new CSS2DObject(el);
      label.position.set(r.x + r.w / 2, 0.02, r.y + r.d / 2);
      this.group.add(label);
    }
    // Socle façon maquette, qui suit la forme du logement.
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.7 });
    for (const r of this.rooms) {
      const m = r.outdoor ? 0 : WALL_T / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(r.w + 2 * m, 0.18, r.d + 2 * m), baseMat);
      base.position.set(r.x + r.w / 2, -0.17, r.y + r.d / 2);
      base.receiveShadow = true;
      this.group.add(base);
    }
  }

  private collectLines(openings: OpeningConfig[]): void {
    const map = new Map<string, Line>();
    const get = (axis: "h" | "v", pos: number) => {
      const key = axis + r2(pos);
      let line = map.get(key);
      if (!line) {
        line = { axis, pos: r2(pos), spans: [], cuts: [], openings: [] };
        map.set(key, line);
      }
      return line;
    };
    for (const r of this.indoor) {
      for (const y of [r.y, r.y + r.d]) get("h", y).spans.push([r2(r.x), r2(r.x + r.w)]);
      for (const x of [r.x, r.x + r.w]) get("v", x).spans.push([r2(r.y), r2(r.y + r.d)]);
    }
    // Fusion des tronçons qui se chevauchent ; les bords de pièces servent de points de coupe.
    for (const line of map.values()) {
      line.cuts = [...new Set(line.spans.flat())];
      const sorted = line.spans.sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const s of sorted) {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1] + EPS) last[1] = Math.max(last[1], s[1]);
        else merged.push([s[0], s[1]]);
      }
      line.spans = merged;
    }
    this.lines = [...map.values()];

    for (const o of openings) {
      let best: { line: Line; dist: number } | undefined;
      for (const line of this.lines) {
        const [along, across] = line.axis === "h" ? [o.x, o.y] : [o.y, o.x];
        const dist = Math.abs(across - line.pos);
        if (dist > 0.25 || !line.spans.some(([a, b]) => along > a && along < b)) continue;
        if (!best || dist < best.dist) best = { line, dist };
      }
      if (!best) {
        console.warn("[blueprint3d-card] Ouverture hors d'un mur, ignorée :", o);
        continue;
      }
      const along = best.line.axis === "h" ? o.x : o.y;
      const w = o.width ?? (o.type === "door" ? 0.9 : 1.2);
      best.line.openings.push({ a: r2(along - w / 2), b: r2(along + w / 2), cfg: o });
    }
  }

  private classify(line: Line, at: number): { exterior: boolean; normal: THREE.Vector3; rooms: string[] } | undefined {
    const probe = (s: number) =>
      line.axis === "h" ? this.indoorAt(at, line.pos + s * 0.05) : this.indoorAt(line.pos + s * 0.05, at);
    const plus = probe(1);
    const minus = probe(-1);
    if (!plus && !minus) return undefined;
    // Deux rectangles du même nom forment une seule pièce (en L, en T…) : pas de mur entre eux.
    if (plus && minus && plus.name === minus.name) return undefined;
    const rooms = [plus?.name, minus?.name].filter((n): n is string => !!n);
    if (plus && minus) return { exterior: false, normal: new THREE.Vector3(), rooms };
    const s = plus ? -1 : 1; // l'extérieur est du côté sans pièce
    return {
      exterior: true,
      normal: line.axis === "h" ? new THREE.Vector3(0, 0, s) : new THREE.Vector3(s, 0, 0),
      rooms,
    };
  }

  private buildWalls(): void {
    for (const line of this.lines) {
      for (const [a, b] of line.spans) {
        const openings = line.openings.filter((o) => o.b > a && o.a < b).sort((p, q) => p.a - q.a);
        const cuts = new Set<number>([a, b]);
        for (const c of line.cuts) if (c > a && c < b) cuts.add(c);
        for (const o of openings) {
          cuts.add(Math.max(a, o.a));
          cuts.add(Math.min(b, o.b));
        }
        const pts = [...cuts].sort((p, q) => p - q);

        // Morceaux élémentaires, regroupés quand ils ont le même type.
        type Chunk = { a: number; b: number; opening?: (typeof openings)[number]; cls: NonNullable<ReturnType<House["classify"]>> };
        const chunks: Chunk[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i];
          const q = pts[i + 1];
          if (q - p < EPS) continue;
          const mid = (p + q) / 2;
          const opening = openings.find((o) => mid > o.a && mid < o.b);
          const cls = this.classify(line, mid);
          if (!cls) continue;
          const last = chunks[chunks.length - 1];
          if (last && !opening && !last.opening && Math.abs(last.b - p) < EPS && last.cls.exterior === cls.exterior && last.cls.normal.equals(cls.normal)) {
            last.b = q;
          } else {
            chunks.push({ a: p, b: q, opening, cls });
          }
        }

        for (const c of chunks) {
          const piece: WallPiece = { parts: [], exterior: c.cls.exterior, normal: c.cls.normal, center: new THREE.Vector3(), t: 0, target: 0 };
          if (!c.opening) {
            // Prolonge de la demi-épaisseur aux bouts du mur pour fermer les angles.
            const ea = Math.abs(c.a - a) < EPS ? WALL_T / 2 : 0;
            const eb = Math.abs(c.b - b) < EPS ? WALL_T / 2 : 0;
            this.addPart(piece, line, c.a - ea, c.b + eb, 0, this.wallH, this.wallMat);
            // Plinthes de part et d'autre.
            this.addPart(piece, line, c.a - ea, c.b + eb, 0, 0.07, this.trimMat, WALL_T + 0.022);
          } else {
            this.buildOpening(piece, line, c.a, c.b, c.opening.cfg, c.cls);
          }
          const mid = (c.a + c.b) / 2;
          piece.center = line.axis === "h" ? new THREE.Vector3(mid, 1, line.pos) : new THREE.Vector3(line.pos, 1, mid);
          this.pieces.push(piece);
        }
      }
    }
  }

  /** Porte, porte-fenêtre ou fenêtre : linteau, allège, cadre et battant animé. */
  private buildOpening(piece: WallPiece, line: Line, a: number, b: number, cfg: OpeningConfig, cls: NonNullable<ReturnType<House["classify"]>>): void {
    const isWindow = cfg.type === "window";
    const top = isWindow ? WINDOW_TOP : DOOR_H;
    const bottom = isWindow ? SILL_H : 0;
    this.addPart(piece, line, a, b, top, this.wallH - top, this.wallMat);
    if (isWindow) {
      this.addPart(piece, line, a, b, 0, SILL_H, this.wallMat);
      this.addPart(piece, line, a, b, 0, 0.07, this.trimMat, WALL_T + 0.022);
      this.addPart(piece, line, a - 0.03, b + 0.03, SILL_H - 0.025, 0.035, this.trimMat, WALL_T + 0.07);
    }
    // Cadre (dormant)
    const ft = isWindow || cfg.type === "glass_door" ? 0.07 : WALL_T + 0.02;
    this.addPart(piece, line, a, a + FRAME, bottom, top - bottom, this.frameMat, ft);
    this.addPart(piece, line, b - FRAME, b, bottom, top - bottom, this.frameMat, ft);
    this.addPart(piece, line, a, b, top - FRAME, FRAME, this.frameMat, ft);
    if (isWindow) this.addPart(piece, line, a, b, bottom, FRAME, this.frameMat, ft);

    // Côté vers lequel s'ouvre le battant : l'intérieur pour un mur extérieur.
    const sideVec = line.axis === "h" ? new THREE.Vector3(0, 0, cls.exterior ? -cls.normal.z : 1) : new THREE.Vector3(cls.exterior ? -cls.normal.x : 1, 0, 0);
    const width = b - a - 2 * FRAME;
    const leafH = top - bottom - (isWindow ? 2 * FRAME : FRAME);
    const pivot = new THREE.Group();
    const hinge = line.axis === "h" ? new THREE.Vector3(a + FRAME, bottom + (isWindow ? FRAME : 0), line.pos) : new THREE.Vector3(line.pos, bottom + (isWindow ? FRAME : 0), a + FRAME);
    pivot.position.copy(hinge);
    this.group.add(pivot);

    const sliding = cfg.type === "glass_door" && b - a > 1.3;
    const leafW = sliding ? width / 2 + 0.02 : width;
    const glassy = isWindow || cfg.type === "glass_door";
    const leafGeo = new THREE.BoxGeometry(line.axis === "h" ? leafW : 0.035, leafH, line.axis === "h" ? 0.035 : leafW);
    // Géométrie décalée : la charnière est au bord du battant, la base à y = 0.
    leafGeo.translate(line.axis === "h" ? leafW / 2 : 0, leafH / 2, line.axis === "h" ? 0 : leafW / 2);
    const leaf = new THREE.Mesh(leafGeo, glassy ? this.glassMat : this.doorMat.clone());
    leaf.castShadow = !glassy;
    leaf.receiveShadow = !glassy;
    pivot.add(leaf);
    piece.parts.push({ mesh: leaf, y0: bottom, h: leafH });
    let fixedPane: THREE.Mesh | undefined;
    if (sliding) {
      // Baie coulissante : un vantail fixe, l'autre glisse devant.
      fixedPane = leaf.clone();
      fixedPane.position.set(line.axis === "h" ? leafW - 0.04 : -0.04, 0, line.axis === "h" ? -0.04 : leafW - 0.04);
      pivot.add(fixedPane);
      piece.parts.push({ mesh: fixedPane, y0: bottom, h: leafH });
    }
    if (glassy) {
      // Montants du battant vitré
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(line.axis === "h" ? leafW : 0.045, 0.04, line.axis === "h" ? 0.045 : leafW),
        this.frameMat,
      );
      edge.geometry.translate(line.axis === "h" ? leafW / 2 : 0, 0.02, line.axis === "h" ? 0 : leafW / 2);
      const edgeTop = edge.clone();
      edgeTop.position.y = leafH - 0.04;
      pivot.add(edge, edgeTop);
      piece.parts.push({ mesh: edge, y0: bottom, h: 0.04 }, { mesh: edgeTop, y0: bottom + leafH - 0.04, h: 0.04 });
    }
    // Portes intérieures ouvertes par défaut ; portes d'entrée, fenêtres et baies fermées.
    const defaultOpen = cfg.type === "door" && !cls.exterior ? 1 : 0;
    const maxAngle = isWindow ? Math.PI / 3 : Math.PI / 2;
    const s = line.axis === "h" ? Math.sign(sideVec.z) || 1 : Math.sign(sideVec.x) || 1;
    const view: OpeningView = {
      cfg,
      rooms: cls.rooms,
      open: defaultOpen,
      target: defaultOpen,
      apply: (t) => {
        if (sliding) {
          const shift = t * (leafW - 0.06);
          leaf.position.set(line.axis === "h" ? shift : 0, 0, line.axis === "h" ? 0 : shift);
        } else {
          // Rotation autour de la charnière, vers l'intérieur de la pièce.
          pivot.rotation.y = (line.axis === "h" ? -s : s) * t * maxAngle;
        }
      },
      setAlert: (on) => {
        const m = leaf.material as THREE.MeshStandardMaterial;
        if (glassy) m.emissive?.set(on ? 0xff3b30 : 0x000000);
        else m.emissive.set(on ? 0x661010 : 0x000000);
        if (fixedPane) (fixedPane.material as THREE.MeshStandardMaterial).emissive?.set(on ? 0xff3b30 : 0x000000);
      },
    };
    if (glassy) {
      // Le verre est partagé : on lui donne son propre matériau pour pouvoir le teinter en cas d'alerte.
      leaf.material = this.glassMat.clone();
      if (fixedPane) fixedPane.material = leaf.material;
    }
    view.apply(view.open);
    this.openings.push(view);
  }

  private addPart(piece: WallPiece, line: Line, a: number, b: number, y0: number, h: number, mat: THREE.Material, thickness = WALL_T, shadows = true): void {
    if (h <= EPS || b - a <= EPS) return;
    const len = b - a;
    const geo = line.axis === "h" ? new THREE.BoxGeometry(len, h, thickness) : new THREE.BoxGeometry(thickness, h, len);
    geo.translate(0, h / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    const mid = (a + b) / 2;
    if (line.axis === "h") mesh.position.set(mid, y0, line.pos);
    else mesh.position.set(line.pos, y0, mid);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    this.group.add(mesh);
    piece.parts.push({ mesh, y0, h });
  }

  /** Garde-corps vitrés sur les bords des extérieurs qui ne touchent pas une pièce. */
  private buildRailings(): void {
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xd9ecf5, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
    const rail = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.4, metalness: 0.6 });
    const H = 1.0;
    for (const r of this.rooms.filter((o) => o.outdoor)) {
      const edges: [number, number, number, number][] = [
        [r.x, r.y, r.x + r.w, r.y],
        [r.x, r.y + r.d, r.x + r.w, r.y + r.d],
        [r.x, r.y, r.x, r.y + r.d],
        [r.x + r.w, r.y, r.x + r.w, r.y + r.d],
      ];
      for (const [x1, y1, x2, y2] of edges) {
        const horizontal = y1 === y2;
        const len = horizontal ? x2 - x1 : y2 - y1;
        const n = Math.max(1, Math.round(len / 0.1));
        // On découpe le bord par pas de 10 cm et on garde les tronçons qui ne longent ni une pièce ni un autre extérieur.
        let start: number | null = null;
        const flush = (end: number) => {
          if (start === null || end - start < 0.15) return;
          const a = start;
          const segLen = end - a;
          const cx = horizontal ? x1 + a + segLen / 2 : x1;
          const cz = horizontal ? y1 : y1 + a + segLen / 2;
          const pane = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? segLen : 0.015, H - 0.05, horizontal ? 0.015 : segLen), glass);
          pane.position.set(cx, (H - 0.05) / 2, cz);
          const top = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? segLen : 0.045, 0.04, horizontal ? 0.045 : segLen), rail);
          top.position.set(cx, H, cz);
          top.castShadow = true;
          this.group.add(pane, top);
        };
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * len;
          const px = horizontal ? x1 + t : x1;
          const py = horizontal ? y1 : y1 + t;
          const off = 0.08;
          const outside = (dx: number, dy: number) => !this.rooms.some((o) => o !== r && px + dx > o.x && px + dx < o.x + o.w && py + dy > o.y && py + dy < o.y + o.d);
          const free = i < n && (horizontal ? outside(0.05, -off) && outside(0.05, off) : outside(-off, 0.05) && outside(off, 0.05));
          if (free && start === null) start = t;
          if (!free && start !== null) {
            flush(t);
            start = null;
          }
        }
        if (start !== null) flush(len);
      }
    }
  }

  private buildFurniture(f: FurnitureConfig): void {
    const color = new THREE.Color(f.color ?? "#a08c74");
    const woodTex = woodGrainTexture();
    const fabric = fabricTexture();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const soft = (c: THREE.ColorRepresentation = color) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, map: fabric });
    const wood = (c: THREE.ColorRepresentation = color) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, map: woodTex });
    const g = new THREE.Group();
    /** Boîte aux arêtes arrondies (posée sur y). */
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = mat, radius = 0.015) => {
      const r = Math.max(0.001, Math.min(radius, w / 2.2, h / 2.2, d / 2.2));
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);
      mesh.position.set(x, y + h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const { w, d } = f;
    // Côté collé au mur : celui le plus proche d'un bord de la pièce.
    const room = this.roomAt(f.x + w / 2, f.y + d / 2);
    const gaps = room
      ? { top: f.y - room.y, bottom: room.y + room.d - (f.y + d), left: f.x - room.x, right: room.x + room.w - (f.x + w) }
      : { top: 0, bottom: 1, left: 1, right: 1 };
    const nearestSide = Object.entries(gaps).sort((a, b) => a[1] - b[1])[0][0];

    switch (f.type ?? "box") {
      case "desk":
      case "table": {
        const h = f.h ?? 0.75;
        const top = wood();
        box(w, 0.04, d, 0, h - 0.04, 0, top, 0.01);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.5 });
        const lx = w / 2 - 0.06;
        const lz = d / 2 - 0.06;
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.04, h - 0.04, 0.04, sx * lx, 0, sz * lz, legMat, 0.01);
        break;
      }
      case "armchair":
      case "sofa": {
        const h = f.h ?? 0.82;
        const fabricMat = soft();
        const cushionMat = soft(color.clone().offsetHSL(0, 0, 0.05));
        const horizontal = w >= d;
        const len = horizontal ? w : d;
        const depth = horizontal ? d : w;
        const arm = 0.16;
        const backT = 0.2;
        // Repère local : x le long du canapé, z vers l'avant (opposé au dossier).
        const local = new THREE.Group();
        const lbox = (bw: number, bh: number, bd: number, x: number, y: number, z: number, m: THREE.Material, r = 0.05) => {
          const mesh = box(bw, bh, bd, x, y, z, m, r);
          g.remove(mesh);
          local.add(mesh);
        };
        lbox(len, 0.2, depth, 0, 0.06, 0, fabricMat, 0.04);
        // Pieds
        const feet = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.5 });
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) lbox(0.04, 0.06, 0.04, sx * (len / 2 - 0.08), 0, sz * (depth / 2 - 0.08), feet, 0.01);
        lbox(len, h - 0.26, backT, 0, 0.26, -depth / 2 + backT / 2, fabricMat, 0.06);
        for (const sx of [-1, 1]) lbox(arm, 0.36, depth, sx * (len / 2 - arm / 2), 0.26, 0, fabricMat, 0.06);
        // Coussins d'assise et de dossier
        const inner = len - 2 * arm;
        const n = Math.max(1, Math.round(inner / 0.75));
        const cw = inner / n;
        for (let i = 0; i < n; i++) {
          const cx = -inner / 2 + cw * (i + 0.5);
          lbox(cw - 0.02, 0.14, depth - backT - 0.04, cx, 0.26, backT / 2, cushionMat, 0.06);
          lbox(cw - 0.03, 0.38, 0.14, cx, 0.4, -depth / 2 + backT + 0.05, cushionMat, 0.06);
        }
        // Orientation : dossier contre le mur le plus proche.
        if (horizontal) local.rotation.y = gaps.bottom < gaps.top ? Math.PI : 0;
        else local.rotation.y = gaps.right < gaps.left ? Math.PI / 2 : -Math.PI / 2;
        g.add(local);
        break;
      }
      case "bed": {
        const frame = wood(0x8a6a4d);
        const sheet = soft(0xf6f3ee);
        const duvet = soft(color);
        const pillow = soft(0xffffff);
        const alongY = d >= w;
        const len = alongY ? d : w;
        const wid = alongY ? w : d;
        const local = new THREE.Group();
        const lbox = (bw: number, bh: number, bd: number, x: number, y: number, z: number, m: THREE.Material, r = 0.04) => {
          const mesh = box(bw, bh, bd, x, y, z, m, r);
          g.remove(mesh);
          local.add(mesh);
        };
        // Repère local : x en largeur, z le long du lit, tête vers -z.
        lbox(wid, 0.28, len, 0, 0, 0, frame, 0.02);
        lbox(wid - 0.06, 0.2, len - 0.06, 0, 0.28, 0, sheet, 0.06);
        lbox(wid + 0.02, 0.9, 0.08, 0, 0, -len / 2 + 0.04, frame, 0.02);
        lbox(wid - 0.02, 0.07, len * 0.68, 0, 0.47, len * 0.14, duvet, 0.05);
        // Plaid replié au pied du lit
        lbox(wid - 0.01, 0.03, 0.32, 0, 0.53, len / 2 - 0.3, soft(color.clone().offsetHSL(0.05, -0.1, -0.15)), 0.015);
        const np = wid > 1.2 ? 2 : 1;
        for (let i = 0; i < np; i++) {
          const px = np === 1 ? 0 : (i === 0 ? -1 : 1) * (wid / 4 - 0.01);
          lbox(np === 1 ? wid - 0.25 : wid / 2 - 0.14, 0.12, 0.38, px, 0.47, -len / 2 + 0.32, pillow, 0.06);
        }
        // Tête de lit contre le mur le plus proche
        if (alongY) local.rotation.y = gaps.top <= gaps.bottom ? 0 : Math.PI;
        else local.rotation.y = gaps.left <= gaps.right ? -Math.PI / 2 : Math.PI / 2;
        g.add(local);
        break;
      }
      case "chair": {
        const h = f.h ?? 0.85;
        const seat = wood();
        box(w, 0.045, d, 0, 0.42, 0, seat, 0.012);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.4, metalness: 0.4 });
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(0.03, 0.42, 0.03, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), legMat, 0.008);
        // Dossier du côté opposé au mur le plus proche (la chaise fait face au mur / au bureau).
        if (nearestSide === "top") box(w, h - 0.47, 0.035, 0, 0.47, d / 2 - 0.02, seat, 0.012);
        else if (nearestSide === "bottom") box(w, h - 0.47, 0.035, 0, 0.47, -d / 2 + 0.02, seat, 0.012);
        else if (nearestSide === "left") box(0.035, h - 0.47, d, w / 2 - 0.02, 0.47, 0, seat, 0.012);
        else box(0.035, h - 0.47, d, -w / 2 + 0.02, 0.47, 0, seat, 0.012);
        break;
      }
      case "kitchen": {
        const h = f.h ?? 0.9;
        box(w, h - 0.04, d, 0, 0, 0, new THREE.MeshStandardMaterial({ color, roughness: 0.35 }), 0.008);
        box(w + 0.02, 0.04, d + 0.02, 0, h - 0.04, 0, wood(0xc49a6c), 0.005);
        // Socle en retrait
        break;
      }
      case "wardrobe":
      case "bookcase":
      case "nightstand":
      case "tv_stand": {
        const h = f.h ?? FURNITURE_HEIGHT[f.type!] ?? 1.9;
        const body = wood();
        box(w, h, d, 0, 0, 0, body, 0.012);
        if (f.type === "bookcase") {
          const shelf = wood(color.clone().offsetHSL(0, 0, -0.25));
          for (let y = 0.35; y < h - 0.1; y += 0.38) box(w + 0.01, 0.025, d + 0.01, 0, y, 0, shelf, 0.005);
          // Quelques livres
          const books = [0x8b3a3a, 0x2f4f6f, 0xc9a227, 0x3d6b4f, 0x6b4f8a];
          let k = 0;
          for (let y = 0.375; y < h - 0.35; y += 0.38) {
            let x = -w / 2 + 0.05;
            while (x < w / 2 - 0.12) {
              const bw = 0.03 + ((k * 37) % 5) * 0.008;
              const bh = 0.2 + ((k * 13) % 4) * 0.025;
              box(bw, bh, d * 0.7, x + bw / 2, y, 0, new THREE.MeshStandardMaterial({ color: books[k % books.length], roughness: 0.8 }), 0.004);
              x += bw + 0.004 + (k % 7 === 0 ? 0.08 : 0);
              k++;
            }
          }
        }
        break;
      }
      case "plant": {
        const r = Math.min(w, d) / 2;
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.42, 0.34, 28), new THREE.MeshStandardMaterial({ color: 0xc4a484, roughness: 0.85 }));
        pot.position.y = 0.17;
        pot.castShadow = true;
        g.add(pot);
        const leafMat = (k: number) => new THREE.MeshStandardMaterial({ color: new THREE.Color(f.color ?? 0x4f8a3c).offsetHSL(k * 0.02, 0, k * 0.04), roughness: 0.85, flatShading: true });
        const blobs: [number, number, number, number][] = [
          [0, 0.34 + r * 0.9, 0, r * 0.85],
          [r * 0.45, 0.34 + r * 0.6, r * 0.2, r * 0.55],
          [-r * 0.4, 0.34 + r * 0.7, -r * 0.25, r * 0.6],
          [r * 0.1, 0.34 + r * 1.5, -r * 0.1, r * 0.5],
        ];
        blobs.forEach(([x, y, z, rr], i) => {
          const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), leafMat(i - 1));
          leaves.position.set(x, y, z);
          leaves.castShadow = true;
          g.add(leaves);
        });
        break;
      }
      case "washer": {
        const h = f.h ?? 0.85;
        box(w, h, d, 0, 0, 0, new THREE.MeshStandardMaterial({ color, roughness: 0.3 }), 0.02);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.15, metalness: 0.3 }));
        lid.position.y = h + 0.005;
        g.add(lid);
        break;
      }
      case "fridge":
        box(w, f.h ?? 1.85, d, 0, 0, 0, new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.2 }), 0.02);
        break;
      case "toilet": {
        // Réservoir contre le mur le plus proche, cuvette devant.
        const white = new THREE.MeshStandardMaterial({ color: f.color ?? 0xf4f7f8, roughness: 0.15 });
        const alongZ = nearestSide === "top" || nearestSide === "bottom";
        const s = nearestSide === "top" || nearestSide === "left" ? -1 : 1;
        const tankD = 0.18;
        if (alongZ) box(w, 0.8, tankD, 0, 0, s * (d / 2 - tankD / 2), white, 0.03);
        else box(tankD, 0.8, d, s * (w / 2 - tankD / 2), 0, 0, white, 0.03);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.45, Math.min(w, d) * 0.35, 0.4, 28), white);
        bowl.position.set(alongZ ? 0 : (-s * tankD) / 2, 0.2, alongZ ? (-s * tankD) / 2 : 0);
        bowl.castShadow = true;
        g.add(bowl);
        break;
      }
      case "washbasin": {
        const h = f.h ?? 0.85;
        box(w, h - 0.05, d, 0, 0, 0, wood(), 0.01);
        box(w + 0.02, 0.05, d + 0.02, 0, h - 0.05, 0, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }), 0.015);
        break;
      }
      case "shower": {
        box(w, 0.05, d, 0, 0, 0, new THREE.MeshStandardMaterial({ color: f.color ?? 0xf4f7f8, roughness: 0.25 }), 0.01);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, d), new THREE.MeshPhysicalMaterial({ color: 0xd2e8f5, transparent: true, opacity: 0.13, roughness: 0.05, depthWrite: false }));
        glass.position.y = 1.05;
        g.add(glass);
        break;
      }
      case "bathtub": {
        box(w, 0.55, d, 0, 0, 0, new THREE.MeshStandardMaterial({ color: f.color ?? 0xf4f7f8, roughness: 0.2 }), 0.06);
        const water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.01, d - 0.12), new THREE.MeshStandardMaterial({ color: 0xa8cfe0, roughness: 0.05 }));
        water.position.y = 0.555;
        g.add(water);
        break;
      }
      case "rug": {
        const rug = new THREE.Mesh(new RoundedBoxGeometry(w, f.h ?? 0.014, d, 2, 0.006), soft());
        rug.position.y = (f.h ?? 0.014) / 2;
        rug.receiveShadow = true;
        g.add(rug);
        break;
      }
      default:
        box(w, f.h ?? FURNITURE_HEIGHT[f.type ?? "box"] ?? 0.8, d, 0, 0, 0, mat, 0.02);
    }
    g.position.set(f.x + w / 2, 0, f.y + d / 2);
    this.group.add(g);
    this.furnitureGroups.push(g);
  }

  /** Hauteur du dessus du meuble au point (x, y) du plan, 0 s'il n'y en a pas (tapis ignorés). */
  surfaceAt(x: number, y: number): number {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, this.wallH, y), new THREE.Vector3(0, -1, 0), 0, this.wallH);
    this.group.updateMatrixWorld();
    const hit = ray.intersectObjects(this.furnitureGroups, true)[0];
    const top = hit ? this.wallH - hit.distance : 0;
    return top > 0.05 ? Math.round(top * 100) / 100 : 0;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          // Les textures répétées sont des copies propres à cette maison.
          if ((m as THREE.MeshStandardMaterial).map && m !== this.wallMat) (m as THREE.MeshStandardMaterial).map!.dispose();
          m.dispose();
        });
      }
      if (o instanceof CSS2DObject) o.element.remove();
    });
  }
}
