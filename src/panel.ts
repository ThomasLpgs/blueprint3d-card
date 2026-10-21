import { deviceItem } from "./catalog";
import { entityName, stateText, isActive } from "./devices";
import { entityOptions, modelOptions, powerOptions, type PlatformMap } from "./entities";
import { t } from "./i18n";
import { DOMAIN_TO_KIND, kindOf, needsConfirm, type DeviceConfig, type DeviceKind, type HassEntity, type HomeAssistant } from "./types";

// Fiche de contrôle d'un appareil, affichée par-dessus la scène.

const COLOR_MODES = ["hs", "rgb", "rgbw", "rgbww", "xy"];
const SWATCHES = ["#ffb36b", "#fff1d6", "#ffffff", "#ff5a5a", "#ffd34d", "#5ee08a", "#4cb8ff", "#9b6bff", "#ff6bd6"];

export interface PanelOptions {
  editing: boolean;
  onRemove(cfg: DeviceConfig): void;
  onMoreInfo(entityId: string): void;
  onClose(): void;
  onLink(cfg: DeviceConfig, entity: string): void;
  onModel(cfg: DeviceConfig, model: string): void;
  onLength(cfg: DeviceConfig, length: number): void;
  /** Hauteur / rotation : `commit` = false pendant le glissement du curseur (aperçu en direct). */
  onPlacement(cfg: DeviceConfig, field: "height" | "rotation", value: number, commit: boolean): void;
  /** Décale l'objet d'un cran vers la gauche (-1) ou la droite (+1) de l'écran. */
  onNudge(cfg: DeviceConfig, dir: number): void;
  /** Hauteur sous plafond, hauteur actuelle de l'objet et réglages possibles. */
  placement(cfg: DeviceConfig): { wallH: number; height: number; rotatable: boolean; ceiling: boolean };
  onConfirm(cfg: DeviceConfig, confirm: boolean): void;
  onPower(cfg: DeviceConfig, power: string): void;
  onVacuumMap(cfg: DeviceConfig, field: string, value: string | boolean): void;
  platforms(): PlatformMap;
}

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class DevicePanel {
  readonly el = document.createElement("div");
  private cfg?: DeviceConfig;
  private hass?: HomeAssistant;
  private busy = false;
  /** Dernier état affiché, pour ne redessiner que si l'entité change. */
  private shown?: HassEntity;
  /** Appui maintenu sur un bouton « Décaler » : répétition. */
  private nudgeDelay?: number;
  private nudgeRepeat?: number;

  constructor(private opts: PanelOptions) {
    this.el.className = "panel hidden";
    this.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.busy = true;
    });
    this.el.addEventListener("pointerdown", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act="nudge"]');
      if (!b) return;
      b.setPointerCapture?.(e.pointerId);
      this.startNudge(b);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      this.el.addEventListener(type, () => {
        this.busy = false;
        this.stopNudge();
      });
    }
    this.el.addEventListener("click", (e) => this.onClick(e));
    this.el.addEventListener("change", (e) => this.onChange(e));
    this.el.addEventListener("input", (e) => this.onInput(e));
  }

  get openFor(): DeviceConfig | undefined {
    return this.cfg;
  }

  open(cfg: DeviceConfig, hass: HomeAssistant | undefined, editing: boolean): void {
    this.cfg = cfg;
    this.opts.editing = editing;
    this.hass = hass;
    this.render();
    this.el.classList.remove("hidden");
  }

  close(): void {
    this.cfg = undefined;
    this.stopNudge();
    this.stopCamera();
    this.el.classList.add("hidden");
  }

  private camTimer?: number;

  private startNudge(b: HTMLElement): void {
    this.stopNudge();
    this.nudge(b);
    this.nudgeDelay = window.setTimeout(() => (this.nudgeRepeat = window.setInterval(() => this.nudge(b), 90)), 400);
  }

  private stopNudge(): void {
    clearTimeout(this.nudgeDelay);
    clearInterval(this.nudgeRepeat);
    this.nudgeDelay = this.nudgeRepeat = undefined;
  }

  private nudge(b: HTMLElement): void {
    if (!this.cfg) return this.stopNudge();
    const dx = Number(b.dataset.dx ?? 0);
    if (dx) this.opts.onNudge(this.cfg, dx);
    const dh = Number(b.dataset.dh ?? 0);
    const input = this.el.querySelector<HTMLInputElement>('input[data-field="height"]');
    if (dh && input) {
      const v = Math.min(Number(input.max), Math.max(0, Math.round((Number(input.value) + dh * 0.05) * 100) / 100));
      input.value = String(v);
      this.onInput({ target: input } as unknown as Event);
    }
  }

  private stopCamera(): void {
    clearInterval(this.camTimer);
    this.camTimer = undefined;
  }

  /** Flux en direct avec le lecteur de Home Assistant ; à défaut, image rafraîchie toutes les 3 s. */
  private mountCamera(e: HassEntity): void {
    const slot = this.el.querySelector(".cam-slot");
    if (!slot || !this.hass) return;
    if (customElements.get("ha-camera-stream")) {
      const stream = document.createElement("ha-camera-stream") as HTMLElement & Record<string, unknown>;
      stream.hass = this.hass;
      stream.stateObj = e;
      stream.muted = true;
      stream.controls = true;
      stream.className = "cam";
      slot.appendChild(stream);
      return;
    }
    const picture = String(e.attributes.entity_picture ?? "");
    // Seulement une image servie par HA (chemin relatif) ou en http(s), jamais javascript:/data:.
    if (!/^(\/|https?:\/\/)/.test(picture)) return;
    const img = document.createElement("img");
    img.className = "cam";
    img.alt = "";
    const sep = picture.includes("?") ? "&" : "?";
    const refresh = () => (img.src = `${picture}${sep}_=${Date.now()}`);
    refresh();
    slot.appendChild(img);
    this.camTimer = window.setInterval(() => {
      if (!img.isConnected) return this.stopCamera();
      refresh();
    }, 3000);
  }

  setHass(hass: HomeAssistant): void {
    this.hass = hass;
    if (!this.cfg || this.busy) return;
    const entity = hass.states[this.cfg.entity];
    if (entity === this.shown) return;
    // Une liste déroulante ouverte ou un champ en cours de saisie ne doit pas être détruit.
    const active = (this.el.getRootNode() as ShadowRoot).activeElement;
    if (active && this.el.contains(active) && active.matches("select, input")) return;
    this.render();
  }

  private get entity(): HassEntity | undefined {
    return this.cfg ? this.hass?.states[this.cfg.entity] : undefined;
  }

  private call(domain: string, service: string, data: Record<string, unknown> = {}): void {
    if (!this.hass || !this.cfg?.entity) return;
    if (needsConfirm(this.cfg) && !confirm(`${entityName(this.cfg, this.entity)} : ${t("confirm_action")}`)) {
      this.render();
      return;
    }
    this.hass.callService(domain, service, { entity_id: this.cfg.entity, ...data }).catch((err) => {
      console.error("[blueprint3d-card]", err);
    });
  }

  private render(): void {
    const cfg = this.cfg!;
    const e = this.entity;
    this.shown = e;
    this.stopCamera();
    // Les commandes suivent le type de l'entité reliée (ex. litière reliée à un « vacuum »).
    const kind = (cfg.entity && DOMAIN_TO_KIND[cfg.entity.split(".")[0]]) || kindOf(cfg);
    const toggleable = ["light", "fan", "switch", "media_player"].includes(kind) && !!e;
    this.el.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">
          <div class="pn">${esc(entityName(cfg, e))}</div>
          <div class="ps">${esc(stateText(kind, e))}</div>
        </div>
        ${toggleable ? `<button class="switch ${isActive(kind, e) ? "on" : ""}" data-act="toggle" title="${t("toggle")}"><span></span></button>` : ""}
        <button class="icon-btn" data-act="close" title="${t("close")}">✕</button>
      </div>
      ${this.opts.editing ? this.nudgeRow(cfg) : ""}
      <div class="panel-body">${
        e ? this.body(kind, e) : `<div class="muted">${cfg.entity ? esc(cfg.entity) : this.opts.editing ? t("link_hint") : t("unlinked_hint")}</div>`
      }</div>
      ${this.opts.editing ? this.editSection(cfg) : ""}
      <div class="panel-foot">
        ${e ? `<button class="link" data-act="more">${t("more_info")}</button>` : ""}
        ${this.opts.editing ? `<button class="link danger" data-act="remove">${t("remove")}</button>` : ""}
      </div>`;
    if (e && kind === "camera") this.mountCamera(e);
  }

  /** Mode édition : boutons pour décaler l'objet (gauche/droite le long du mur, haut/bas). */
  private nudgeRow(cfg: DeviceConfig): string {
    const pl = this.opts.placement(cfg);
    return `<div class="panel-edit nudge-row">
      <div class="row"><label>${t("nudge")}</label>
        <div class="nudge">
          <button class="round" data-act="nudge" data-dx="-1" title="${t("nudge_left")}">◀</button>
          <button class="round" data-act="nudge" data-dx="1" title="${t("nudge_right")}">▶</button>
          ${pl.ceiling ? "" : `<button class="round" data-act="nudge" data-dh="-1" title="${t("nudge_down")}">▼</button>
          <button class="round" data-act="nudge" data-dh="1" title="${t("nudge_up")}">▲</button>`}
        </div>
      </div>
    </div>`;
  }

  /** En mode édition : relier à une entité, choisir le modèle 3D, longueur des rubans. */
  private editSection(cfg: DeviceConfig): string {
    const shape = deviceItem(cfg.model)?.shape;
    const strip = shape === "strip" || shape === "string_lights" || shape === "tube";
    const pl = this.opts.placement(cfg);
    const fmt = (v: number) => v.toFixed(2).replace(".", ",");
    const presets: [string, number][] = [
      [t("h_floor"), 0],
      [t("h_furniture"), 0.75],
      [t("h_wall"), 1.5],
      [t("h_ceiling"), Math.max(0, pl.wallH - 0.15)],
    ];
    const height = pl.ceiling
      ? ""
      : `<div class="row"><label>${t("height")} <output>${fmt(pl.height)} m</output></label>
          <input type="range" data-field="height" data-unit="m" min="0" max="${pl.wallH.toFixed(2)}" step="0.05" value="${pl.height.toFixed(2)}">
          <div class="presets">${presets.map(([n, h]) => `<button class="chip" data-act="h-preset" data-h="${h.toFixed(2)}">${esc(n)}</button>`).join("")}</div>
        </div>`;
    const rotation = pl.rotatable
      ? `<div class="row"><label>${t("rotation")} <output>${cfg.rotation ?? 0}°</output></label>
          <input type="range" data-field="rotation" data-unit="°" min="-180" max="180" step="15" value="${cfg.rotation ?? 0}">
        </div>`
      : "";
    return `<div class="panel-edit">
      <div class="row"><label>${t("link_entity")}</label><select data-field="link">${entityOptions(this.hass, this.opts.platforms(), cfg)}</select></div>
      <div class="row"><label>${t("model")}</label><select data-field="model">${modelOptions(cfg)}</select></div>
      ${height}
      ${rotation}
      ${strip ? `<div class="row"><label>${t("length")} (m)</label><input type="number" data-field="length" min="0.3" max="30" step="0.1" value="${esc(cfg.length ?? "")}" placeholder="${deviceItem(cfg.model)?.length ?? 2}"></div>` : ""}
      <div class="row"><label>${t("power_sensor")}</label><select data-field="power">${powerOptions(this.hass, cfg.power)}</select></div>
      ${kindOf(cfg) === "vacuum" ? this.vacuumSection(cfg) : ""}
      <label class="check"><input type="checkbox" data-field="confirm" ${cfg.confirm ? "checked" : ""}> ${t("confirm_option")}</label>
    </div>`;
  }

  /** Aspirateur : entité de la carte (position réelle) et orientation de cette carte. */
  private vacuumSection(cfg: DeviceConfig): string {
    const maps = Object.values(this.hass?.states ?? {}).filter((s) => s.attributes.vacuum_position && s.attributes.charger);
    return `<div class="row"><label>${t("vacuum_map")}</label><select data-field="position_entity">
        <option value="">${t("vacuum_simulated")}</option>
        ${maps.map((s) => `<option value="${esc(s.entity_id)}" ${s.entity_id === cfg.position_entity ? "selected" : ""}>${esc(s.attributes.friendly_name ?? s.entity_id)}</option>`).join("")}
      </select></div>
      ${
        cfg.position_entity
          ? `<div class="row"><label>${t("vacuum_rotation")}</label><select data-field="map_rotation">${[0, 90, 180, 270]
              .map((r) => `<option value="${r}" ${(cfg.map_rotation ?? 0) === r ? "selected" : ""}>${r}°</option>`)
              .join("")}</select></div>
      <label class="check"><input type="checkbox" data-field="map_flip" ${cfg.map_flip ? "checked" : ""}> ${t("vacuum_flip")}</label>
      <div class="muted">${t("vacuum_calibration_hint")}</div>`
          : `<div class="muted">${t("vacuum_map_hint")}</div>`
      }`;
  }

  private body(kind: DeviceKind, e: HassEntity): string {
    const a = e.attributes;
    switch (kind) {
      case "light": {
        const modes: string[] = a.supported_color_modes ?? [];
        const dimmable = modes.some((m) => m !== "onoff");
        const pct = typeof a.brightness === "number" ? Math.round((a.brightness / 255) * 100) : 0;
        let html = "";
        if (dimmable) html += slider("brightness", t("brightness"), pct, 1, 100, 1, "%");
        if (modes.includes("color_temp")) {
          const min = Number(a.min_color_temp_kelvin) || 2000;
          const max = Number(a.max_color_temp_kelvin) || 6500;
          html += slider("kelvin", t("color_temp"), Number(a.color_temp_kelvin) || Math.round((min + max) / 2), min, max, 50, "K", "kelvin");
        }
        if (modes.some((m) => COLOR_MODES.includes(m))) {
          html += `<div class="row"><label>${t("color")}</label><div class="swatches">
            ${SWATCHES.map((c) => `<button class="swatch" style="background:${c}" data-act="rgb" data-color="${c}"></button>`).join("")}
            <input type="color" data-field="rgb" value="${rgbToHex(a.rgb_color) ?? "#ffffff"}">
          </div></div>`;
        }
        return html;
      }
      case "climate": {
        const modes: string[] = a.hvac_modes ?? [];
        const step = Number(a.target_temp_step) > 0 ? Number(a.target_temp_step) : a.temperature_unit === "°F" ? 1 : 0.5;
        let html = `<div class="chips">${modes
          .map((m) => `<button class="chip ${e.state === m ? "active" : ""}" data-act="hvac" data-mode="${esc(m)}">${esc(t(m))}</button>`)
          .join("")}</div>`;
        if (a.temperature != null) {
          html += `<div class="row thermo">
            <button class="round" data-act="temp" data-delta="${-step}">−</button>
            <div class="big">${esc(a.temperature)}<small>°</small>
              ${a.current_temperature != null ? `<div class="muted">${t("current")} ${esc(a.current_temperature)}°</div>` : ""}
            </div>
            <button class="round" data-act="temp" data-delta="${step}">+</button>
          </div>`;
        }
        if (Array.isArray(a.fan_modes) && a.fan_modes.length) {
          html += `<div class="row"><label>${t("fan_mode")}</label><div class="chips">${(a.fan_modes as string[])
            .map((m) => `<button class="chip ${a.fan_mode === m ? "active" : ""}" data-act="fanmode" data-mode="${esc(m)}">${esc(m)}</button>`)
            .join("")}</div></div>`;
        }
        return html;
      }
      case "vacuum": {
        const battery = a.battery_level != null ? `<div class="muted">${t("battery")} ${esc(a.battery_level)} %</div>` : "";
        // Bits VacuumEntityFeature de HA ; sans supported_features on affiche tout.
        const f = typeof a.supported_features === "number" ? a.supported_features : -1;
        const has = (bit: number) => (f & bit) !== 0;
        return `${battery}<div class="chips">
          ${has(8192) ? `<button class="chip" data-act="svc" data-svc="vacuum.start">▶ ${t("start")}</button>` : ""}
          ${has(4) ? `<button class="chip" data-act="svc" data-svc="vacuum.pause">❚❚ ${t("pause")}</button>`
            : has(8) ? `<button class="chip" data-act="svc" data-svc="vacuum.stop">■ ${t("stop")}</button>` : ""}
          ${has(16) ? `<button class="chip" data-act="svc" data-svc="vacuum.return_to_base">⌂ ${t("dock")}</button>` : ""}
          ${has(512) ? `<button class="chip" data-act="svc" data-svc="vacuum.locate">◎ ${t("locate")}</button>` : ""}
        </div>`;
      }
      case "cover": {
        let html = `<div class="chips">
          <button class="chip" data-act="svc" data-svc="cover.open_cover">▲ ${t("open")}</button>
          <button class="chip" data-act="svc" data-svc="cover.stop_cover">■ ${t("stop")}</button>
          <button class="chip" data-act="svc" data-svc="cover.close_cover">▼ ${t("closed")}</button>
        </div>`;
        if (typeof a.current_position === "number") html += slider("position", t("position"), a.current_position, 0, 100, 1, "%");
        return html;
      }
      case "fan":
        return typeof a.percentage === "number" || e.state === "on"
          ? slider("percentage", t("speed"), Number(a.percentage) || 0, 0, 100, Number(a.percentage_step) || 1, "%")
          : "";
      case "media_player": {
        let html = `<div class="chips">
          <button class="chip" data-act="svc" data-svc="media_player.media_previous_track">⏮</button>
          <button class="chip" data-act="svc" data-svc="media_player.media_play_pause">⏯</button>
          <button class="chip" data-act="svc" data-svc="media_player.media_next_track">⏭</button>
        </div>`;
        if (a.media_title) html = `<div class="muted">${esc(a.media_artist ? `${a.media_artist} — ` : "")}${esc(a.media_title)}</div>` + html;
        if (typeof a.volume_level === "number") html += slider("volume", t("volume"), Math.round(a.volume_level * 100), 0, 100, 1, "%");
        return html;
      }
      case "sensor":
        return `<div class="big center">${esc(stateText("sensor", e))}</div>`;
      case "camera":
        // Emplacement du flux : rempli après le rendu (lecteur HA en direct, sinon image rafraîchie).
        return a.entity_picture ? `<div class="cam-slot"></div>` : "";
      default:
        return "";
    }
  }

  private onClick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!btn || !this.cfg) return;
    const a = this.entity?.attributes ?? {};
    switch (btn.dataset.act) {
      case "close":
        this.opts.onClose();
        break;
      case "toggle":
        this.call("homeassistant", "toggle");
        break;
      case "rgb":
        this.call("light", "turn_on", { rgb_color: hexToRgb(btn.dataset.color!) });
        break;
      case "hvac":
        this.call("climate", "set_hvac_mode", { hvac_mode: btn.dataset.mode });
        break;
      case "fanmode":
        this.call("climate", "set_fan_mode", { fan_mode: btn.dataset.mode });
        break;
      case "temp": {
        const next = Math.round(((Number(a.temperature) || 20) + Number(btn.dataset.delta)) * 10) / 10;
        const clamped = Math.min(Number(a.max_temp) || 35, Math.max(Number(a.min_temp) || 7, next));
        this.call("climate", "set_temperature", { temperature: clamped });
        break;
      }
      case "svc": {
        const [d, s] = btn.dataset.svc!.split(".");
        this.call(d, s);
        break;
      }
      case "more":
        this.opts.onMoreInfo(this.cfg.entity);
        break;
      case "remove":
        this.opts.onRemove(this.cfg);
        break;
      case "nudge":
        // Clavier (Entrée/Espace) : pas de pointerdown, on décale ici.
        if ((ev as MouseEvent).detail === 0) this.nudge(btn);
        break;
      case "nudge":
        // Clavier (Entrée/Espace) : pas de pointerdown, on décale ici.
        if ((ev as MouseEvent).detail === 0) this.nudge(btn);
        break;
      case "h-preset": {
        const h = Number(btn.dataset.h);
        if (Number.isFinite(h)) this.opts.onPlacement(this.cfg, "height", h, true);
        break;
      }
    }
  }

  private onInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const out = input.closest(".row")?.querySelector("output");
    if (out && input.type === "range") {
      const unit = input.dataset.unit ?? "";
      out.textContent = unit === "m" ? `${Number(input.value).toFixed(2).replace(".", ",")} m` : unit === "°" ? `${input.value}°` : `${input.value} ${unit}`;
    }
    // Hauteur / rotation : aperçu en direct pendant le glissement.
    const field = input.dataset.field;
    if (this.cfg && (field === "height" || field === "rotation") && Number.isFinite(Number(input.value))) {
      this.opts.onPlacement(this.cfg, field, Number(input.value), false);
    }
  }

  private onChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const v = Number(input.value);
    switch (input.dataset.field) {
      case "link":
        this.opts.onLink(this.cfg!, input.value);
        break;
      case "model":
        this.opts.onModel(this.cfg!, input.value);
        break;
      case "length":
        if (v > 0 && v <= 30) this.opts.onLength(this.cfg!, v);
        break;
      case "height":
      case "rotation":
        if (Number.isFinite(v)) this.opts.onPlacement(this.cfg!, input.dataset.field, v, true);
        break;
      case "confirm":
        this.opts.onConfirm(this.cfg!, input.checked);
        break;
      case "power":
        this.opts.onPower(this.cfg!, input.value);
        break;
      case "position_entity":
      case "map_rotation":
      case "map_flip":
        this.opts.onVacuumMap(this.cfg!, input.dataset.field, input.type === "checkbox" ? input.checked : input.value);
        break;
      case "brightness":
        this.call("light", "turn_on", { brightness_pct: v });
        break;
      case "kelvin":
        this.call("light", "turn_on", { color_temp_kelvin: v });
        break;
      case "rgb":
        this.call("light", "turn_on", { rgb_color: hexToRgb(input.value) });
        break;
      case "position":
        this.call("cover", "set_cover_position", { position: v });
        break;
      case "percentage":
        this.call("fan", "set_percentage", { percentage: v });
        break;
      case "volume":
        this.call("media_player", "volume_set", { volume_level: v / 100 });
        break;
    }
    this.busy = false;
  }
}

function slider(field: string, label: string, value: number, min: number, max: number, step: number, unit: string, cls = ""): string {
  // Les valeurs viennent des attributs d'entités : on les force en nombres avant de les insérer.
  [value, min, max, step] = [value, min, max, step].map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
  return `<div class="row">
    <label>${label}<output>${value} ${unit}</output></label>
    <input type="range" class="${cls}" data-field="${field}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${value}">
  </div>`;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: unknown): string | undefined {
  if (!Array.isArray(rgb)) return undefined;
  return "#" + rgb.map((v: number) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
