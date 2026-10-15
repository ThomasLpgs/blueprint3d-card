import { CATEGORIES, DEVICE_ITEMS, deviceItem } from "./catalog";
import { t } from "./i18n";
import { DOMAIN_TO_KIND, kindOf, type DeviceConfig, type HassEntity, type HomeAssistant } from "./types";

// Listes déroulantes pour relier un objet à une entité HA et choisir son modèle 3D.

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** entity_id → intégration (hue, tplink, govee…), lu dans le registre des entités. */
export type PlatformMap = Map<string, string>;

export interface Registry {
  platforms: PlatformMap;
  /** entity_id → identifiant de l'appareil HA (pour retrouver ses capteurs « frères »). */
  devices: Map<string, string>;
}

export async function loadRegistry(hass: HomeAssistant): Promise<Registry> {
  const reg: Registry = { platforms: new Map(), devices: new Map() };
  if (!hass.callWS) return reg;
  try {
    const res = await hass.callWS<{ entities: { ei: string; pl: string; di?: string }[] }>({ type: "config/entity_registry/list_for_display" });
    for (const e of res.entities ?? []) {
      if (typeof e.ei !== "string") continue;
      if (typeof e.pl === "string") reg.platforms.set(e.ei, e.pl);
      if (typeof e.di === "string") reg.devices.set(e.ei, e.di);
    }
  } catch {
    try {
      const list = await hass.callWS<{ entity_id: string; platform: string; device_id?: string }[]>({ type: "config/entity_registry/list" });
      for (const e of list) {
        reg.platforms.set(e.entity_id, e.platform);
        if (e.device_id) reg.devices.set(e.entity_id, e.device_id);
      }
    } catch {
      // Pas d'accès au registre : on proposera simplement les entités par domaine.
    }
  }
  return reg;
}

/** Puissance en watts d'un capteur (W ou kW), sinon undefined. */
export function watts(e: HassEntity | undefined): number | undefined {
  if (!e) return undefined;
  const v = Number(e.state);
  if (!Number.isFinite(v)) return undefined;
  const unit = e.attributes.unit_of_measurement;
  if (unit === "kW") return v * 1000;
  if (unit === "W" || e.attributes.device_class === "power") return v;
  return undefined;
}

export function isPowerSensor(e: HassEntity): boolean {
  return e.entity_id.startsWith("sensor.") && (e.attributes.device_class === "power" || ["W", "kW"].includes(e.attributes.unit_of_measurement));
}

/** Capteur de puissance d'un appareil : celui configuré, sinon un capteur « W » du même appareil HA. */
export function findPowerEntity(cfg: DeviceConfig, hass: HomeAssistant | undefined, devices: Map<string, string>): string | undefined {
  if (cfg.power) return hass?.states[cfg.power] ? cfg.power : undefined;
  const id = devices.get(cfg.entity);
  if (!id || !hass) return undefined;
  for (const [entity, dev] of devices) {
    if (dev === id && entity !== cfg.entity && hass.states[entity] && isPowerSensor(hass.states[entity])) return entity;
  }
  return undefined;
}

export const fmtWatts = (w: number) => (Math.abs(w) >= 1000 ? `${(Math.round(w / 10) / 100).toString().replace(".", ",")} kW` : `${Math.round(w)} W`);

export function powerOptions(hass: HomeAssistant | undefined, current: string | undefined): string {
  const list = Object.values(hass?.states ?? {})
    .filter(isPowerSensor)
    .sort((a, b) => String(a.attributes.friendly_name ?? a.entity_id).localeCompare(String(b.attributes.friendly_name ?? b.entity_id)));
  return (
    `<option value="">${t("auto_material")}</option>` +
    list.map((s) => `<option value="${esc(s.entity_id)}" ${s.entity_id === current ? "selected" : ""}>${esc(s.attributes.friendly_name ?? s.entity_id)} · ${esc(s.state)} ${esc(s.attributes.unit_of_measurement ?? "")}</option>`).join("")
  );
}

const domainOf = (id: string) => id.split(".")[0];

export function entityOptions(hass: HomeAssistant | undefined, platforms: PlatformMap, cfg: DeviceConfig): string {
  const states = Object.values(hass?.states ?? {});
  const item = deviceItem(cfg.model);
  const kind = kindOf(cfg);
  const domains = item?.domains ?? Object.keys(DOMAIN_TO_KIND).filter((d) => DOMAIN_TO_KIND[d] === kind);
  const wantedPlatforms = item?.platforms ?? [];
  const name = (s: HassEntity) => String(s.attributes.friendly_name ?? s.entity_id);
  const sortByName = (a: HassEntity, b: HassEntity) => name(a).localeCompare(name(b));

  const compatible = states.filter((s) => domains.includes(domainOf(s.entity_id)));
  // Pour un thermomètre, on met les capteurs de température / humidité en avant.
  const preferred = (s: HassEntity) =>
    item?.shape !== "thermo" || ["temperature", "humidity"].includes(s.attributes.device_class);
  const suggested = compatible
    .filter((s) => (wantedPlatforms.length ? wantedPlatforms.includes(platforms.get(s.entity_id) ?? "") : false) && preferred(s))
    .sort(sortByName);
  const rest = compatible.filter((s) => !suggested.includes(s)).sort((a, b) => Number(preferred(b)) - Number(preferred(a)) || sortByName(a, b));
  const others = states
    .filter((s) => !domains.includes(domainOf(s.entity_id)) && DOMAIN_TO_KIND[domainOf(s.entity_id)])
    .sort(sortByName);

  const opt = (s: HassEntity) =>
    `<option value="${esc(s.entity_id)}" ${s.entity_id === cfg.entity ? "selected" : ""}>${esc(name(s))} · ${esc(s.entity_id)}</option>`;
  const group = (label: string, list: HassEntity[]) => (list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join("")}</optgroup>` : "");
  // Entité configurée mais absente de HA : on la garde dans la liste.
  const missing = cfg.entity && !hass?.states[cfg.entity] ? `<option value="${esc(cfg.entity)}" selected>${esc(cfg.entity)} (?)</option>` : "";
  return (
    `<option value="" ${!cfg.entity ? "selected" : ""}>${t("none")}</option>` +
    missing +
    group(`★ ${t("suggestions")}${item && item.brand !== "Générique" ? ` (${item.brand})` : ""}`, suggested) +
    group(t("compatible"), rest) +
    group(t("other_entities"), others)
  );
}

export function modelOptions(cfg: DeviceConfig): string {
  const kind = kindOf(cfg);
  const opt = (i: (typeof DEVICE_ITEMS)[number]) =>
    `<option value="${i.id}" ${i.id === cfg.model ? "selected" : ""}>${esc(i.name)}${i.brand !== "Générique" ? ` — ${esc(i.brand)}` : ""}</option>`;
  // Les modèles du même type d'abord, puis tous les autres par catégorie.
  const same = DEVICE_ITEMS.filter((i) => i.kind === kind);
  const groups = CATEGORIES.filter((c) => c !== "furniture")
    .map((c) => {
      const list = DEVICE_ITEMS.filter((i) => i.category === c && i.kind !== kind);
      return list.length ? `<optgroup label="${esc(t(`cat_${c}`))}">${list.map(opt).join("")}</optgroup>` : "";
    })
    .join("");
  return `<option value="" ${!cfg.model ? "selected" : ""}>${t("model_default")}</option>` + `<optgroup label="★">${same.map(opt).join("")}</optgroup>` + groups;
}
