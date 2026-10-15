import { entityName, isActive, stateText } from "./devices";
import { t } from "./i18n";
import { fmtWatts } from "./entities";
import { fmt1, type RoomStats } from "./rooms";
import { DOMAIN_TO_KIND, kindOf, type DeviceConfig, type HomeAssistant } from "./types";

// Fiche d'une pièce : ses appareils, tout allumer / éteindre, température et humidité.

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface RoomPanelOptions {
  onClose(): void;
  onDevice(cfg: DeviceConfig): void;
  /** Bascule un appareil (avec confirmation éventuelle, gérée par la carte). */
  onToggle(cfg: DeviceConfig): void;
  /** Toutes les lumières de la pièce. */
  onAllLights(cfgs: DeviceConfig[], on: boolean): void;
}

const TOGGLEABLE = ["light", "switch", "fan", "media_player"];

export class RoomPanel {
  readonly el = document.createElement("div");
  private room?: RoomStats;
  private hass?: HomeAssistant;
  private signature = "";

  constructor(private opts: RoomPanelOptions) {
    this.el.className = "panel room-panel hidden";
    this.el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.el.addEventListener("click", (e) => this.onClick(e));
  }

  get openFor(): string | undefined {
    return this.room?.name;
  }

  open(room: RoomStats, hass: HomeAssistant | undefined): void {
    this.room = room;
    this.hass = hass;
    this.render();
    this.el.classList.remove("hidden");
  }

  close(): void {
    this.room = undefined;
    this.el.classList.add("hidden");
  }

  /** Redessine seulement si l'état d'un appareil de la pièce (ou ses mesures) a changé. */
  update(room: RoomStats | undefined, hass: HomeAssistant): void {
    if (!this.room) return;
    if (!room) return this.close();
    this.room = room;
    this.hass = hass;
    if (this.computeSignature() !== this.signature) this.render();
  }

  private computeSignature(): string {
    const r = this.room!;
    return [r.temp, r.hum, r.motion, r.power, ...r.devices.map((d) => `${d.entity}:${this.hass?.states[d.entity]?.state}:${this.hass?.states[d.entity]?.attributes.brightness}`)].join("|");
  }

  private kind(cfg: DeviceConfig) {
    return (cfg.entity && DOMAIN_TO_KIND[cfg.entity.split(".")[0]]) || kindOf(cfg);
  }

  private render(): void {
    const r = this.room!;
    this.signature = this.computeSignature();
    const lights = r.devices.filter((d) => d.entity && this.kind(d) === "light");
    const chips = [
      r.temp !== undefined ? `<span class="chip-info">🌡️ ${fmt1(r.temp)} °C</span>` : "",
      r.hum !== undefined ? `<span class="chip-info">💧 ${fmt1(r.hum)} %</span>` : "",
      r.motion ? `<span class="chip-info motion">👋 ${t("motion")}</span>` : "",
      r.power !== undefined ? `<span class="chip-info">⚡ ${fmtWatts(r.power)}</span>` : "",
      lights.length ? `<span class="chip-info">💡 ${lights.filter((d) => this.hass?.states[d.entity]?.state === "on").length}/${lights.length}</span>` : "",
    ].join("");
    const rows = r.devices
      .map((d, i) => {
        const e = this.hass?.states[d.entity];
        const kind = this.kind(d);
        const toggle = e && TOGGLEABLE.includes(kind);
        return `<div class="room-row">
          <span class="dot ${isActive(kind, e) ? "on" : ""}"></span>
          <button class="link row-name" data-act="device" data-i="${i}">${esc(entityName(d, e))}<small>${esc(d.entity ? stateText(kind, e) : t("unlinked"))}</small></button>
          ${toggle ? `<button class="switch ${isActive(kind, e) ? "on" : ""}" data-act="toggle" data-i="${i}" title="${t("toggle")}"><span></span></button>` : ""}
        </div>`;
      })
      .join("");
    this.el.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">
          <div class="pn">${esc(r.name)}</div>
          <div class="ps">${fmt1(r.area)} m² · ${r.devices.length} ${t("devices_count")}</div>
        </div>
        <button class="icon-btn" data-act="close" title="${t("close")}">✕</button>
      </div>
      <div class="panel-body">
        ${chips ? `<div class="chips">${chips}</div>` : ""}
        ${
          lights.length
            ? `<div class="chips"><button class="chip" data-act="all-on">💡 ${t("all_on")}</button><button class="chip" data-act="all-off">🌙 ${t("all_off")}</button></div>`
            : ""
        }
        <div class="room-list">${rows || `<div class="muted">${t("no_devices")}</div>`}</div>
      </div>`;
  }

  private onClick(ev: Event): void {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!btn || !this.room) return;
    const cfg = btn.dataset.i !== undefined ? this.room.devices[Number(btn.dataset.i)] : undefined;
    const lights = this.room.devices.filter((d) => d.entity && this.kind(d) === "light");
    switch (btn.dataset.act) {
      case "close":
        this.opts.onClose();
        break;
      case "device":
        if (cfg) this.opts.onDevice(cfg);
        break;
      case "toggle":
        if (cfg) this.opts.onToggle(cfg);
        break;
      case "all-on":
        this.opts.onAllLights(lights, true);
        break;
      case "all-off":
        this.opts.onAllLights(lights, false);
        break;
    }
  }
}
