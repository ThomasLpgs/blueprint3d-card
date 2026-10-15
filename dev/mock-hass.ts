import type { HassEntity, HomeAssistant } from "../src/types";

// Faux Home Assistant pour développer sans instance : les services modifient les états localement.

const e = (entity_id: string, state: string, attributes: Record<string, unknown>): HassEntity => ({
  entity_id,
  state,
  attributes,
});

const colorLight = { supported_color_modes: ["color_temp", "hs"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 };

let states: Record<string, HassEntity> = Object.fromEntries(
  [
    e("light.salon", "on", { friendly_name: "Salon", brightness: 200, color_temp_kelvin: 2700, ...colorLight }),
    e("light.salle_a_manger", "on", { friendly_name: "Salle à manger", brightness: 150, rgb_color: [255, 150, 80], ...colorLight }),
    e("light.cuisine", "off", { friendly_name: "Cuisine", ...colorLight }),
    e("light.chambre", "off", { friendly_name: "Chambre", supported_color_modes: ["brightness"] }),
    e("light.salle_de_bain", "on", { friendly_name: "Salle de bain", brightness: 255, color_temp_kelvin: 5000, ...colorLight }),
    e("light.entree", "off", { friendly_name: "Entrée", supported_color_modes: ["onoff"] }),
    e("climate.salon", "cool", {
      friendly_name: "Clim salon",
      hvac_modes: ["off", "cool", "heat", "dry", "fan_only", "auto"],
      temperature: 22,
      current_temperature: 26.5,
      min_temp: 16,
      max_temp: 30,
      target_temp_step: 0.5,
      fan_modes: ["auto", "low", "medium", "high"],
      fan_mode: "auto",
      hvac_action: "cooling",
    }),
    e("climate.chambre", "off", {
      friendly_name: "Clim chambre",
      hvac_modes: ["off", "cool", "heat"],
      temperature: 20,
      current_temperature: 23,
      min_temp: 16,
      max_temp: 30,
    }),
    e("vacuum.robot", "cleaning", { friendly_name: "Robot", battery_level: 76 }),
    e("cover.volet_salon", "open", { friendly_name: "Volet salon", current_position: 70 }),
    e("media_player.tv", "playing", { friendly_name: "TV", volume_level: 0.3, media_title: "Le Bureau des Légendes" }),
    e("sensor.temperature_salon", "23.4", { friendly_name: "Température", unit_of_measurement: "°C", device_class: "temperature" }),
    e("fan.chambre", "off", { friendly_name: "Ventilateur", percentage: 0 }),
    e("switch.prise_cafe", "off", { friendly_name: "Machine à café" }),
    e("binary_sensor.porte_entree", "off", { friendly_name: "Porte d'entrée", device_class: "door" }),
    e("light.hue_go_salon", "on", { friendly_name: "Hue Go salon", brightness: 180, rgb_color: [255, 80, 200], ...colorLight }),
    e("light.ruban_led_tapo", "on", { friendly_name: "Ruban LED bureau", brightness: 220, rgb_color: [80, 140, 255], ...colorLight }),
    e("light.govee_tv_backlight", "on", { friendly_name: "Govee TV", brightness: 200, rgb_color: [120, 60, 255], ...colorLight }),
    e("light.govee_hexa", "on", { friendly_name: "Govee Hexa", brightness: 230, rgb_color: [0, 220, 180], ...colorLight }),
    e("camera.tapo_c200_salon", "idle", {
      friendly_name: "Caméra salon",
      entity_picture: "/dev/camera.svg?token=demo",
    }),
    e("binary_sensor.mouvement_couloir", "on", { friendly_name: "Mouvement couloir", device_class: "motion" }),
    e("sensor.tapo_t310_temperature", "21.8", { friendly_name: "Tapo T310 chambre", unit_of_measurement: "°C", device_class: "temperature" }),
    e("vacuum.litter_robot_4", "docked", { friendly_name: "Litter-Robot 4" }),
    e("person.thomas", "home", { friendly_name: "Thomas" }),
    e("sensor.prise_cafe_puissance", "1450", { friendly_name: "Machine à café · puissance", unit_of_measurement: "W", device_class: "power" }),
    e("sensor.tv_puissance", "96", { friendly_name: "TV · puissance", unit_of_measurement: "W", device_class: "power" }),
    e("sensor.linky_puissance", "2.31", { friendly_name: "Linky · puissance apparente", unit_of_measurement: "kW", device_class: "power" }),
    e("weather.maison", new URLSearchParams(location.search).get("weather") ?? "rainy", { friendly_name: "Météo maison", temperature: 14 }),
    e("camera.xiaomi_map", "idle", {
      friendly_name: "Carte de l'aspirateur",
      charger: { x: 25000, y: 25000 },
      vacuum_position: { x: 26200, y: 23400, a: 90 },
      path: { path: [[{ x: 25000, y: 25000 }, { x: 25600, y: 24600 }, { x: 26200, y: 24200 }, { x: 26200, y: 23400 }]] },
    }),
    e("person.camille", "not_home", { friendly_name: "Camille" }),
    e("scene.soiree", "2026-10-14T18:00:00", { friendly_name: "Soirée" }),
    e("scene.cinema", "2026-10-14T18:00:00", { friendly_name: "Cinéma" }),
    e("script.tout_eteindre", "off", { friendly_name: "Tout éteindre" }),
    e("binary_sensor.baie_terrasse", "on", { friendly_name: "Baie vitrée terrasse", device_class: "door" }),
    e("binary_sensor.fenetre_chambre", "off", { friendly_name: "Fenêtre chambre", device_class: "window" }),
    e("sensor.humidite_sdb", "68", { friendly_name: "Humidité salle d'eau", unit_of_measurement: "%", device_class: "humidity" }),
    e("sensor.temperature_sdb", "24.5", { friendly_name: "Température salle d'eau", unit_of_measurement: "°C", device_class: "temperature" }),
    e("sensor.litter_robot_4_waste_drawer", "45", { friendly_name: "Litter-Robot bac à déchets", unit_of_measurement: "%" }),
    // ?night dans l'URL pour tester le rendu de nuit.
    new URLSearchParams(location.search).has("night")
      ? e("sun.sun", "below_horizon", { elevation: -12, azimuth: 300 })
      : e("sun.sun", "above_horizon", { elevation: 38, azimuth: 215 }),
  ].map((s) => [s.entity_id, s]),
);

function set(id: string, state: string, attrs: Record<string, unknown> = {}) {
  const old = states[id];
  states = { ...states, [id]: { ...old, state, attributes: { ...old.attributes, ...attrs } } };
}

export function createMockHass(onChange: (hass: HomeAssistant) => void): HomeAssistant {
  const hass: HomeAssistant = {
    get states() {
      return states;
    },
    language: "fr",
    async callService(domain, service, data = {}) {
      console.log("[mock] callService", domain, service, data);
      if (Array.isArray(data.entity_id)) {
        for (const one of data.entity_id) await hass.callService(domain, service, { ...data, entity_id: one });
        return;
      }
      const id = data.entity_id as string;
      const cur = states[id];
      if (!cur) return;
      const d = id.split(".")[0];
      if (service === "toggle") set(id, cur.state === "on" ? "off" : "on", d === "light" && cur.state !== "on" ? { brightness: cur.attributes.brightness ?? 255 } : {});
      else if (service === "turn_on") {
        const attrs: Record<string, unknown> = {};
        if (data.brightness_pct != null) attrs.brightness = Math.round((Number(data.brightness_pct) / 100) * 255);
        if (data.color_temp_kelvin != null) Object.assign(attrs, { color_temp_kelvin: data.color_temp_kelvin, rgb_color: undefined });
        if (data.rgb_color != null) attrs.rgb_color = data.rgb_color;
        set(id, "on", attrs);
      } else if (service === "turn_off") set(id, "off");
      else if (d === "scene" || d === "script") set(id, new Date().toISOString());
      else if (service === "set_hvac_mode") set(id, data.hvac_mode as string);
      else if (service === "set_temperature") set(id, cur.state, { temperature: data.temperature });
      else if (service === "set_fan_mode") set(id, cur.state, { fan_mode: data.fan_mode });
      else if (service === "start") set(id, "cleaning");
      else if (service === "pause") set(id, "paused");
      else if (service === "return_to_base") {
        set(id, "returning");
        setTimeout(() => {
          set(id, "docked");
          onChange(hass);
        }, 6000);
      } else if (service === "open_cover") set(id, "open", { current_position: 100 });
      else if (service === "close_cover") set(id, "closed", { current_position: 0 });
      else if (service === "set_cover_position") {
        const p = Number(data.position);
        set(id, p > 0 ? "open" : "closed", { current_position: p });
      } else if (service === "set_percentage") set(id, Number(data.percentage) > 0 ? "on" : "off", { percentage: data.percentage });
      else if (service === "media_play_pause") set(id, cur.state === "playing" ? "paused" : "playing");
      else if (service === "volume_set") set(id, cur.state, { volume_level: data.volume_level });
      onChange(hass);
    },
  };
  return hass;
}
