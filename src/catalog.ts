import type { IconName } from "./icons";
import type { DeviceKind, FurnitureType } from "./types";

// Bibliothèque d'objets : appareils connectés (avec leur forme 3D) et meubles.
// Les "platforms" sont les noms d'intégrations HA, utilisés pour suggérer les bonnes entités.

export type Shape =
  // éclairage
  | "pendant"
  | "bulb"
  | "spot"
  | "ceiling"
  | "table_lamp"
  | "floor_lamp"
  | "go"
  | "bar"
  | "strip"
  | "tube"
  | "hexa"
  | "tv_backlight"
  | "torchiere"
  | "corner_lamp"
  | "lantern"
  | "wall_light"
  | "garden_spot"
  | "string_lights"
  | "desk_lamp"
  // prises, capteurs, boutons
  | "plug"
  | "button"
  | "motion"
  | "contact"
  | "thermo"
  | "smoke"
  | "leak"
  | "plant_sensor"
  | "meter"
  | "module"
  | "wall_switch"
  | "power_strip"
  // sécurité, accès
  | "lock"
  | "doorbell"
  | "siren"
  // caméras, hubs, multimédia
  | "camera"
  | "camera_dome"
  | "bridge"
  | "hub"
  | "speaker"
  | "tv"
  | "smart_display"
  | "soundbar"
  | "media_box"
  | "router"
  // gros équipements
  | "ac"
  | "vacuum"
  | "shutter"
  | "fan"
  | "fan_stand"
  | "purifier"
  | "thermostat"
  | "valve"
  | "heater"
  | "blind"
  | "curtain"
  | "wallbox"
  | "mower"
  // animaux
  | "litter"
  | "feeder"
  | "fountain";

export type Category = "lighting" | "plugs" | "sensors" | "security" | "cameras" | "climate" | "media" | "pets" | "garden" | "hubs" | "furniture";

export interface DeviceItem {
  id: string;
  name: string;
  brand: string;
  category: Exclude<Category, "furniture">;
  kind: DeviceKind;
  shape: Shape;
  /** Domaines HA qu'on peut relier à cet objet (le premier est le plus naturel). */
  domains: string[];
  platforms?: string[];
  height?: number;
  length?: number;
  /** Mots-clés de recherche en plus du nom (références, surnoms, packs…). */
  aliases?: string;
  /** Objet décoratif (pont, hub) : pas besoin d'entité. */
  decorative?: boolean;
  icon: IconName;
}

export interface FurnitureItem {
  id: string;
  category: "furniture";
  furniture: FurnitureType;
  icon: IconName;
}

export type CatalogItem = DeviceItem | FurnitureItem;

const HUE = ["hue"];
const TAPO = ["tplink", "tapo", "tapo_control", "tplink_tapo"];
const GOVEE = ["govee", "govee_light_local", "govee_ble", "govee_lan", "govee_cloud"];
/** Zigbee / Matter : ZHA, Zigbee2MQTT (mqtt), deCONZ, Matter, HomeKit. */
const ZB = ["zha", "mqtt", "deconz", "matter", "homekit_controller"];
const IKEA = ["tradfri", "dirigera_platform", ...ZB];
const AQARA = ["xiaomi_aqara", "aqara", ...ZB];
const XIAOMI = ["xiaomi_miio", "xiaomi_home", "xiaomi_ble", "miot"];
const SHELLY = ["shelly"];
const SWITCHBOT = ["switchbot", "switchbot_cloud"];
const NETATMO = ["netatmo"];
const SONOFF = ["sonoff", "ewelink", ...ZB];
const LIGHT = ["light", "switch"];
const BIN = ["binary_sensor"];
const TEMP = ["sensor"];
const PLUG = ["switch", "light"];
const BTN = ["event", "sensor", "binary_sensor"];
const LOCK = ["lock", "binary_sensor", "sensor"];
const CAM = ["camera"];
const BELL = ["camera", "binary_sensor", "event"];

type ItemSpec = Omit<DeviceItem, "brand">;

/** Raccourci : les objets d'une marque partagent la marque et les intégrations HA. */
const brand = (name: string, platforms: string[] | undefined, items: ItemSpec[]): DeviceItem[] =>
  items.map((i) => ({ ...i, brand: name, ...(platforms && !("platforms" in i) ? { platforms } : {}) }));

export const DEVICE_ITEMS: DeviceItem[] = [
  // ---- Philips Hue ----
  ...brand("Philips Hue", HUE, [
    { id: "hue_color_a60", name: "Hue White & Color A60 (E27)", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb", aliases: "ampoule couleur ambiance" },
    { id: "hue_white_a60", name: "Hue White A60 (E27)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb" },
    { id: "hue_ambiance_e14", name: "Hue White Ambiance E14 (flamme)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb", aliases: "bougie lustre" },
    { id: "hue_filament", name: "Hue Filament (ampoule vintage)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb", aliases: "edison globe st64 g93" },
    { id: "hue_lightguide", name: "Hue Lightguide (ampoule déco)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb" },
    { id: "hue_gu10", name: "Hue spot GU10", category: "lighting", kind: "light", shape: "spot", domains: LIGHT, icon: "sun" },
    { id: "hue_centris", name: "Hue Centris (plafonnier + spots)", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "ring" },
    { id: "hue_being", name: "Hue Being (plafonnier)", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "ring" },
    { id: "hue_enrave", name: "Hue Enrave (plafonnier)", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "ring" },
    { id: "hue_surimu", name: "Hue Surimu (panneau)", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "square", aliases: "dalle panneau carré rond" },
    { id: "hue_ensis", name: "Hue Ensis (suspension)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb" },
    { id: "hue_go", name: "Hue Go (lampe portable, modèle rond)", category: "lighting", kind: "light", shape: "go", domains: LIGHT, height: 0.75, icon: "moon" },
    { id: "hue_go_2021", name: "Hue Go portable (à poignée)", category: "lighting", kind: "light", shape: "lantern", domains: LIGHT, height: 0.75, icon: "lantern", aliases: "7602031p7 lanterne nomade batterie extérieur" },
    { id: "hue_bloom", name: "Hue Bloom (lampe d'ambiance)", category: "lighting", kind: "light", shape: "go", domains: LIGHT, height: 0.5, icon: "ring" },
    { id: "hue_iris", name: "Hue Iris (lampe d'ambiance)", category: "lighting", kind: "light", shape: "go", domains: LIGHT, height: 0.5, icon: "ring" },
    { id: "hue_flourish", name: "Hue Flourish (lampe de table)", category: "lighting", kind: "light", shape: "table_lamp", domains: LIGHT, height: 0.75, icon: "sofa" },
    { id: "hue_twilight", name: "Hue Twilight (lampe de chevet)", category: "lighting", kind: "light", shape: "table_lamp", domains: LIGHT, height: 0.5, icon: "bed", aliases: "réveil lumineux" },
    { id: "hue_play", name: "Hue Play (barre lumineuse)", category: "lighting", kind: "light", shape: "bar", domains: LIGHT, height: 0.5, icon: "bar", aliases: "7820230p7 pack x2 duo" },
    { id: "hue_play_tube", name: "Hue Play Gradient Light Tube (compact, 75 cm)", category: "lighting", kind: "light", shape: "tube", domains: LIGHT, length: 0.75, icon: "bar", aliases: "tube gradient tv meuble compact" },
    { id: "hue_play_tube_large", name: "Hue Play Gradient Light Tube (large, 125 cm)", category: "lighting", kind: "light", shape: "tube", domains: LIGHT, length: 1.25, icon: "bar", aliases: "tube gradient tv meuble large" },
    { id: "hue_lightstrip", name: "Hue Lightstrip Plus", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 2, icon: "wave", aliases: "ruban bande" },
    { id: "hue_gradient_strip", name: "Hue Gradient Lightstrip", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 2, icon: "rainbow" },
    { id: "hue_gradient_tv", name: "Hue Play Gradient (TV)", category: "lighting", kind: "light", shape: "tv_backlight", domains: LIGHT, height: 0.95, icon: "tv", aliases: "ambilight sync" },
    { id: "hue_signe", name: "Hue Signe (lampadaire)", category: "lighting", kind: "light", shape: "corner_lamp", domains: LIGHT, height: 0, icon: "candle", aliases: "gradient colonne" },
    { id: "hue_appear", name: "Hue Appear / Nyro (applique ext.)", category: "garden", kind: "light", shape: "wall_light", domains: LIGHT, height: 1.8, icon: "lantern", aliases: "applique murale extérieure lucca" },
    { id: "hue_lily", name: "Hue Lily (spot de jardin)", category: "garden", kind: "light", shape: "garden_spot", domains: LIGHT, height: 0, icon: "spot", aliases: "piquet projecteur" },
    { id: "hue_festavia", name: "Hue Festavia (guirlande)", category: "lighting", kind: "light", shape: "string_lights", domains: LIGHT, height: 2.1, length: 3, icon: "sparkles", aliases: "noel sapin" },
    { id: "hue_plug", name: "Hue Smart Plug", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug" },
    { id: "hue_wall_module", name: "Hue Wall Switch Module", category: "plugs", kind: "sensor", shape: "module", domains: BTN, height: 1.1, icon: "square", aliases: "interrupteur mural micromodule" },
    { id: "hue_motion", name: "Hue Motion Sensor (détecteur de mouvement)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "hue_outdoor_motion", name: "Hue Outdoor Motion Sensor (extérieur)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "hue_contact", name: "Hue Secure (contact)", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door" },
    { id: "hue_dimmer", name: "Hue Dimmer Switch (nouveau modèle)", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "sliders", aliases: "8719514274617 télécommande variateur v2 2021" },
    { id: "hue_tap_dial", name: "Hue Tap Dial Switch", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "sliders", aliases: "molette" },
    { id: "hue_button", name: "Hue Smart Button", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "ring" },
    { id: "hue_secure_cam", name: "Hue Secure (caméra)", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.2, icon: "camera" },
    { id: "hue_bridge", name: "Hue Bridge", category: "hubs", kind: "sensor", shape: "bridge", domains: ["binary_sensor", "sensor"], height: 0.75, decorative: true, icon: "hexagon", aliases: "pont pro" },
    { id: "hue_sync_box", name: "Hue Play HDMI Sync Box", category: "media", kind: "switch", shape: "media_box", domains: ["switch", "select"], height: 0.55, icon: "strip" },
  ]),

  // ---- TP-Link Tapo ----
  ...brand("TP-Link Tapo", TAPO, [
    { id: "tapo_l530", name: "Tapo L530E (ampoule couleur)", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb", aliases: "l535" },
    { id: "tapo_l510", name: "Tapo L510E (ampoule blanche)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb", aliases: "l520 l610" },
    { id: "tapo_l630", name: "Tapo L630 (spot GU10)", category: "lighting", kind: "light", shape: "spot", domains: LIGHT, icon: "sun" },
    { id: "tapo_l900", name: "Tapo L900 (ruban LED)", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 5, icon: "wave" },
    { id: "tapo_l920", name: "Tapo L920 / L930 (ruban LED multizone)", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 5, icon: "rainbow", aliases: "rgbic rgbw" },
    { id: "tapo_p100", name: "Tapo P100 (prise)", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug", aliases: "p1002 p105 pack x2 x4" },
    { id: "tapo_p110", name: "Tapo P110 / P115 (prise + conso)", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug", aliases: "p110m p1102 énergie consommation" },
    { id: "tapo_p300", name: "Tapo P300 (multiprise)", category: "plugs", kind: "switch", shape: "power_strip", domains: PLUG, height: 0, icon: "plug", aliases: "p304m bloc" },
    { id: "tapo_p400m", name: "Tapo P400M (prise extérieure)", category: "garden", kind: "switch", shape: "plug", domains: PLUG, icon: "plug", aliases: "p400 extérieur jardin" },
    { id: "tapo_s220", name: "Tapo S220 (interrupteur mural)", category: "plugs", kind: "switch", shape: "wall_switch", domains: ["switch", "light"], height: 1.1, icon: "sliders", aliases: "s210 s500d variateur" },
    { id: "tapo_t310", name: "Tapo T310 (temp. / humidité)", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer", aliases: "t315 écran" },
    { id: "tapo_t100", name: "Tapo T100 (mouvement)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "tapo_t110", name: "Tapo T110 (contact)", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door" },
    { id: "tapo_t300", name: "Tapo T300 (détecteur de fuite d'eau)", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet", aliases: "inondation eau" },
    { id: "tapo_s200", name: "Tapo S200B (bouton)", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "ring", aliases: "s200d" },
    { id: "tapo_ke100", name: "Tapo KE100 (tête thermostatique)", category: "climate", kind: "climate", shape: "valve", domains: ["climate"], height: 0.45, icon: "thermometer", aliases: "radiateur vanne" },
    { id: "tapo_c200", name: "Tapo C200 (caméra 360°)", category: "cameras", kind: "camera", shape: "camera_dome", domains: CAM, height: 0.9, icon: "camera", aliases: "c210 c211 c220" },
    { id: "tapo_c100", name: "Tapo C100 (caméra)", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.2, icon: "camera", aliases: "c110 c120" },
    { id: "tapo_c320", name: "Tapo C310 / C320WS (caméra extérieure)", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.4, icon: "camera", aliases: "c500 c510w c520ws c420 extérieur" },
    { id: "tapo_d230", name: "Tapo D230S1 (sonnette vidéo)", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell", aliases: "d225 d235 interphone" },
    { id: "tapo_rv10", name: "Tapo RV10 (aspirateur robot)", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "rv20 rv30" },
    { id: "tapo_h100", name: "Tapo H100 (hub)", category: "hubs", kind: "sensor", shape: "hub", domains: ["binary_sensor", "sensor"], height: 0.3, decorative: true, icon: "ring", aliases: "h200 sirène" },
  ]),

  // ---- Govee ----
  ...brand("Govee", GOVEE, [
    { id: "govee_bulb", name: "Govee ampoule Wi-Fi (E27)", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb" },
    { id: "govee_strip", name: "Govee ruban LED RGBIC", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 5, icon: "rainbow", aliases: "bande" },
    { id: "govee_strip_cover", name: "Govee ruban RGBIC avec diffuseurs", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 3, icon: "rainbow", aliases: "covers cache profilé couvercle" },
    { id: "govee_neon", name: "Govee Neon Rope Light", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 1.6, length: 3, icon: "wave", aliases: "néon corde" },
    { id: "govee_tv", name: "Govee Envisual TV Backlight", category: "lighting", kind: "light", shape: "tv_backlight", domains: LIGHT, height: 0.95, icon: "tv", aliases: "dreamview t2 caméra" },
    { id: "govee_flow", name: "Govee Flow Pro (barres lumineuses)", category: "lighting", kind: "light", shape: "bar", domains: LIGHT, height: 0.5, icon: "bar", aliases: "light bars g1" },
    { id: "govee_lyra", name: "Govee Lyra (lampadaire)", category: "lighting", kind: "light", shape: "floor_lamp", domains: LIGHT, height: 0, icon: "candle" },
    { id: "govee_corner", name: "Govee lampadaire d'angle RGBICW", category: "lighting", kind: "light", shape: "corner_lamp", domains: LIGHT, height: 0, icon: "plan", aliases: "corner floor lamp h6076 colonne" },
    { id: "govee_uplighter", name: "Govee lampadaire Uplighter", category: "lighting", kind: "light", shape: "torchiere", domains: LIGHT, height: 0, icon: "candle", aliases: "vasque halogène" },
    { id: "govee_hexa", name: "Govee Glide Hexa (panneaux)", category: "lighting", kind: "light", shape: "hexa", domains: LIGHT, height: 1.6, icon: "hexagon", aliases: "hexagones" },
    { id: "govee_glide", name: "Govee Glide (barres murales)", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 1.8, length: 1.2, icon: "bar", aliases: "wall light" },
    { id: "govee_table", name: "Govee lampe de table", category: "lighting", kind: "light", shape: "table_lamp", domains: LIGHT, height: 0.5, icon: "sofa", aliases: "table lamp 2" },
    { id: "govee_curtain", name: "Govee rideau lumineux", category: "lighting", kind: "light", shape: "string_lights", domains: LIGHT, height: 2.2, length: 1.5, icon: "sparkles", aliases: "curtain lights guirlande" },
    { id: "govee_outdoor_string", name: "Govee guirlande extérieure", category: "garden", kind: "light", shape: "string_lights", domains: LIGHT, height: 2.2, length: 4, icon: "sparkles", aliases: "string lights terrasse balcon guinguette" },
    { id: "govee_permanent", name: "Govee Permanent Outdoor Lights", category: "garden", kind: "light", shape: "strip", domains: LIGHT, height: 2.5, length: 5, icon: "home", aliases: "façade gouttière" },
    { id: "govee_outdoor_wall", name: "Govee applique extérieure", category: "garden", kind: "light", shape: "wall_light", domains: LIGHT, height: 1.8, icon: "lantern" },
    { id: "govee_spot", name: "Govee spots de jardin", category: "garden", kind: "light", shape: "garden_spot", domains: LIGHT, height: 0, icon: "spot", aliases: "outdoor spot lights piquet" },
    { id: "govee_plug", name: "Govee prise Wi-Fi", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug" },
    { id: "govee_h5075", name: "Govee H5075 (thermo-hygromètre)", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer", aliases: "h5179 h5100" },
    { id: "govee_leak", name: "Govee détecteur de fuite", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet", aliases: "h5054 eau" },
    { id: "govee_purifier", name: "Govee purificateur d'air", category: "climate", kind: "fan", shape: "purifier", domains: ["fan", "switch"], height: 0, icon: "wind", aliases: "h7126 air" },
    { id: "govee_heater", name: "Govee radiateur soufflant", category: "climate", kind: "climate", shape: "heater", domains: ["climate", "switch"], height: 0.35, icon: "flame", aliases: "h7130 chauffage" },
    { id: "govee_humidifier", name: "Govee humidificateur", category: "climate", kind: "fan", shape: "purifier", domains: ["humidifier", "switch", "fan"], height: 0, icon: "wind" },
  ]),

  // ---- IKEA ----
  ...brand("IKEA", IKEA, [
    { id: "ikea_tagarp", name: "TÅGARP (lampadaire vasque + liseuse)", category: "lighting", kind: "light", shape: "torchiere", domains: LIGHT, platforms: undefined, height: 0, icon: "candle", aliases: "tagarp hektar uplight lampadaire liseuse grande petite ampoule" },
    { id: "ikea_bulb", name: "TRÅDFRI / KAJPLATS ampoule E27", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb", aliases: "tradfri kajplats" },
    { id: "ikea_gu10", name: "TRÅDFRI / KAJPLATS spot GU10", category: "lighting", kind: "light", shape: "spot", domains: LIGHT, icon: "sun", aliases: "tradfri kajplats" },
    { id: "ikea_panel", name: "FLOALT / ORMANÄS (panneau)", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "square", aliases: "floalt ormanas dalle" },
    { id: "ikea_varmblixt", name: "VARMBLIXT (lampe d'ambiance)", category: "lighting", kind: "light", shape: "go", domains: LIGHT, height: 0.75, icon: "ring" },
    { id: "ikea_desk", name: "Lampe de bureau à bras", category: "lighting", kind: "light", shape: "desk_lamp", domains: LIGHT, platforms: undefined, height: 0.75, icon: "bulb", aliases: "forså forsa tertial" },
    { id: "ikea_outlet", name: "TRETAKT / INSPELNING (prise)", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug", aliases: "tretakt inspelning conso" },
    { id: "ikea_rodret", name: "RODRET / STYRBAR (télécommande)", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "sliders", aliases: "rodret styrbar somrig variateur" },
    { id: "ikea_vallhorn", name: "VALLHORN (mouvement)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye", aliases: "myggspray" },
    { id: "ikea_parasoll", name: "PARASOLL (contact)", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door", aliases: "myggbett" },
    { id: "ikea_badring", name: "BADRING (détecteur de fuite)", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet" },
    { id: "ikea_vindstyrka", name: "VINDSTYRKA (qualité de l'air)", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, height: 0.75, icon: "leaf", aliases: "timmerflotte pm2.5 co2" },
    { id: "ikea_starkvind", name: "STARKVIND (purificateur d'air)", category: "climate", kind: "fan", shape: "purifier", domains: ["fan"], height: 0, icon: "wind", aliases: "förnuftig fornuftig" },
    { id: "ikea_blind", name: "FYRTUR / PRAKTLYSING (store)", category: "climate", kind: "cover", shape: "blind", domains: ["cover"], icon: "window", aliases: "kadrilj tredansen store enrouleur" },
    { id: "ikea_symfonisk", name: "SYMFONISK (enceinte)", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], platforms: ["sonos"], height: 0.75, icon: "speaker", aliases: "sonos cadre lampe" },
    { id: "ikea_dirigera", name: "DIRIGERA (hub)", category: "hubs", kind: "sensor", shape: "bridge", domains: ["binary_sensor", "sensor"], height: 0.75, decorative: true, icon: "hexagon", aliases: "passerelle tradfri" },
  ]),

  // ---- Aqara ----
  ...brand("Aqara", AQARA, [
    { id: "aqara_fp2", name: "Aqara FP2 (présence mmWave)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "wifi", aliases: "radar présence fp1e" },
    { id: "aqara_p1", name: "Aqara Motion P1 / P2", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "aqara_contact", name: "Aqara capteur porte / fenêtre", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door", aliases: "p2" },
    { id: "aqara_t1", name: "Aqara température / humidité", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer", aliases: "t1 w100 tvoc" },
    { id: "aqara_leak", name: "Aqara détecteur de fuite", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet" },
    { id: "aqara_smoke", name: "Aqara détecteur de fumée", category: "sensors", kind: "sensor", shape: "smoke", domains: BIN, icon: "flame" },
    { id: "aqara_mini", name: "Aqara Mini Switch / Cube", category: "sensors", kind: "sensor", shape: "button", domains: BTN, height: 1.1, icon: "ring", aliases: "bouton cube" },
    { id: "aqara_h1", name: "Aqara H1 (interrupteur mural)", category: "plugs", kind: "switch", shape: "wall_switch", domains: ["switch", "light"], height: 1.1, icon: "sliders" },
    { id: "aqara_plug", name: "Aqara prise", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug" },
    { id: "aqara_e1_valve", name: "Aqara E1 (tête thermostatique)", category: "climate", kind: "climate", shape: "valve", domains: ["climate"], height: 0.45, icon: "thermometer" },
    { id: "aqara_curtain", name: "Aqara Curtain Driver E1 (rideau)", category: "climate", kind: "cover", shape: "curtain", domains: ["cover"], icon: "hexagon", aliases: "rideaux moteur" },
    { id: "aqara_shade", name: "Aqara Roller Shade E1 (store)", category: "climate", kind: "cover", shape: "blind", domains: ["cover"], icon: "window" },
    { id: "aqara_u200", name: "Aqara U100 / U200 (serrure)", category: "security", kind: "sensor", shape: "lock", domains: LOCK, height: 1.05, icon: "lock", aliases: "serrure connectée" },
    { id: "aqara_g4", name: "Aqara G4 (sonnette vidéo)", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell" },
    { id: "aqara_g3", name: "Aqara Camera Hub G3", category: "cameras", kind: "camera", shape: "camera_dome", domains: CAM, height: 0.9, icon: "camera", aliases: "g5 pro" },
    { id: "aqara_m3", name: "Aqara Hub M2 / M3", category: "hubs", kind: "sensor", shape: "bridge", domains: ["binary_sensor", "sensor"], height: 0.75, decorative: true, icon: "hexagon" },
  ]),

  // ---- Xiaomi et robots ----
  ...brand("Xiaomi", XIAOMI, [
    { id: "xiaomi_thermo", name: "Xiaomi Mi thermo-hygromètre 2", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer", aliases: "lywsd03mmc atc ble" },
    { id: "xiaomi_flora", name: "Xiaomi Mi Flora (capteur de plante)", category: "sensors", kind: "sensor", shape: "plant_sensor", domains: TEMP, height: 0, icon: "leaf", aliases: "plante humidité sol arrosage" },
    { id: "xiaomi_purifier", name: "Xiaomi purificateur d'air 4", category: "climate", kind: "fan", shape: "purifier", domains: ["fan"], height: 0, icon: "wind", aliases: "air purifier" },
    { id: "xiaomi_fan", name: "Xiaomi ventilateur sur pied", category: "climate", kind: "fan", shape: "fan_stand", domains: ["fan"], height: 0, icon: "fan", aliases: "standing fan" },
    { id: "xiaomi_vacuum", name: "Xiaomi robot aspirateur", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "mi robot x10 s10" },
    { id: "xiaomi_lamp", name: "Xiaomi lampe de bureau", category: "lighting", kind: "light", shape: "desk_lamp", domains: LIGHT, height: 0.75, icon: "bulb", aliases: "mi desk lamp" },
  ]),
  ...brand("Roborock", ["roborock", "xiaomi_miio"], [
    { id: "roborock", name: "Roborock (S8, Qrevo…)", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "s7 s8 q7 q8 qrevo saros" },
  ]),
  ...brand("Dreame", ["dreame_vacuum", "xiaomi_miio"], [
    { id: "dreame", name: "Dreame (L10s, L20…)", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "l10 l20 x40 d10" },
  ]),
  ...brand("iRobot", ["roomba"], [{ id: "roomba", name: "Roomba", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "braava combo j7" }]),
  ...brand("Ecovacs", ["ecovacs"], [{ id: "deebot", name: "Deebot", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum", aliases: "t20 x2" }]),

  // ---- Autres éclairages ----
  ...brand("Nanoleaf", ["nanoleaf", ...ZB], [
    { id: "nanoleaf_shapes", name: "Nanoleaf Shapes (hexagones)", category: "lighting", kind: "light", shape: "hexa", domains: LIGHT, height: 1.6, icon: "hexagon", aliases: "canvas triangles" },
    { id: "nanoleaf_lines", name: "Nanoleaf Lines", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 1.7, length: 1.2, icon: "strip" },
    { id: "nanoleaf_bulb", name: "Nanoleaf Essentials (ampoule)", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb" },
  ]),
  ...brand("LIFX", ["lifx"], [
    { id: "lifx_bulb", name: "LIFX ampoule couleur", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb" },
    { id: "lifx_beam", name: "LIFX Beam", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 1.7, length: 1.2, icon: "strip" },
  ]),
  ...brand("WiZ", ["wiz"], [{ id: "wiz_bulb", name: "WiZ ampoule", category: "lighting", kind: "light", shape: "bulb", domains: LIGHT, icon: "bulb" }]),
  ...brand("Yeelight", ["yeelight"], [
    { id: "yeelight_ceiling", name: "Yeelight plafonnier", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "ring" },
    { id: "yeelight_bedside", name: "Yeelight lampe de chevet", category: "lighting", kind: "light", shape: "go", domains: LIGHT, height: 0.5, icon: "ring" },
    { id: "yeelight_screenbar", name: "Yeelight barre d'écran", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 1.2, length: 0.5, icon: "monitor", aliases: "screen bar moniteur" },
  ]),

  // ---- Prises, modules, interrupteurs ----
  ...brand("Shelly", SHELLY, [
    { id: "shelly_1", name: "Shelly 1 / 1PM (module)", category: "plugs", kind: "switch", shape: "module", domains: ["switch", "light"], height: 1.1, icon: "square", aliases: "plus mini relais encastré" },
    { id: "shelly_2pm", name: "Shelly 2PM (volet roulant)", category: "climate", kind: "cover", shape: "shutter", domains: ["cover"], icon: "window", aliases: "plus 2pm gen3 volet" },
    { id: "shelly_dimmer", name: "Shelly Dimmer (variateur)", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb" },
    { id: "shelly_plug", name: "Shelly Plug S", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug" },
    { id: "shelly_em", name: "Shelly EM / Pro 3EM (compteur)", category: "sensors", kind: "sensor", shape: "meter", domains: TEMP, height: 1.4, icon: "bolt", aliases: "énergie consommation tableau électrique" },
    { id: "shelly_ht", name: "Shelly H&T", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer" },
    { id: "shelly_flood", name: "Shelly Flood", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet" },
    { id: "shelly_door", name: "Shelly Door/Window", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door", aliases: "blu" },
  ]),
  ...brand("Sonoff", SONOFF, [
    { id: "sonoff_basic", name: "Sonoff Basic / Mini (module)", category: "plugs", kind: "switch", shape: "module", domains: ["switch", "light"], height: 1.1, icon: "square", aliases: "zbmini relais" },
    { id: "sonoff_s26", name: "Sonoff S26 (prise)", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug", aliases: "s60" },
    { id: "sonoff_snzb02", name: "Sonoff SNZB-02 (température)", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer" },
    { id: "sonoff_snzb03", name: "Sonoff SNZB-03 (mouvement)", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "sonoff_snzb04", name: "Sonoff SNZB-04 (contact)", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door" },
    { id: "sonoff_dongle", name: "Sonoff ZBDongle (clé Zigbee)", category: "hubs", kind: "sensor", shape: "module", domains: ["sensor"], height: 0.75, decorative: true, icon: "plug", aliases: "zigbee usb skyconnect" },
  ]),
  ...brand("Meross", ["meross_lan", "meross_cloud"], [{ id: "meross_plug", name: "Meross prise", category: "plugs", kind: "switch", shape: "plug", domains: PLUG, icon: "plug" }]),
  ...brand("Legrand", ["netatmo", ...ZB], [
    { id: "legrand_switch", name: "Céliane with Netatmo (interrupteur)", category: "plugs", kind: "switch", shape: "wall_switch", domains: ["light", "switch"], height: 1.1, icon: "sliders", aliases: "celiane dooxie mosaic" },
    { id: "legrand_shutter", name: "Céliane with Netatmo (volet)", category: "climate", kind: "cover", shape: "shutter", domains: ["cover"], icon: "window" },
  ]),
  ...brand("SwitchBot", SWITCHBOT, [
    { id: "switchbot_bot", name: "SwitchBot Bot (pousse-bouton)", category: "plugs", kind: "switch", shape: "module", domains: ["switch"], height: 1.1, icon: "ring" },
    { id: "switchbot_curtain", name: "SwitchBot Curtain (rideau)", category: "climate", kind: "cover", shape: "curtain", domains: ["cover"], icon: "hexagon" },
    { id: "switchbot_blind", name: "SwitchBot Blind Tilt / Roller Shade", category: "climate", kind: "cover", shape: "blind", domains: ["cover"], icon: "window" },
    { id: "switchbot_meter", name: "SwitchBot Meter", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer" },
    { id: "switchbot_lock", name: "SwitchBot Lock Pro (serrure)", category: "security", kind: "sensor", shape: "lock", domains: LOCK, height: 1.05, icon: "lock" },
    { id: "switchbot_hub", name: "SwitchBot Hub 2", category: "hubs", kind: "sensor", shape: "hub", domains: ["sensor"], height: 1.2, decorative: true, icon: "ring" },
  ]),

  // ---- Climat & énergie ----
  ...brand("Netatmo", NETATMO, [
    { id: "netatmo_thermostat", name: "Netatmo thermostat", category: "climate", kind: "climate", shape: "thermostat", domains: ["climate"], height: 1.5, icon: "thermometer" },
    { id: "netatmo_valve", name: "Netatmo tête thermostatique", category: "climate", kind: "climate", shape: "valve", domains: ["climate"], height: 0.45, icon: "thermometer" },
    { id: "netatmo_station", name: "Netatmo station météo", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "cloud", aliases: "co2 pluviomètre anémomètre" },
    { id: "netatmo_cam", name: "Netatmo caméra intérieure", category: "cameras", kind: "camera", shape: "camera_dome", domains: CAM, height: 0.9, icon: "camera", aliases: "welcome" },
    { id: "netatmo_presence", name: "Netatmo caméra extérieure", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.4, icon: "camera", aliases: "presence projecteur" },
    { id: "netatmo_doorbell", name: "Netatmo sonnette vidéo", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell" },
    { id: "netatmo_smoke", name: "Netatmo détecteur de fumée", category: "sensors", kind: "sensor", shape: "smoke", domains: BIN, icon: "flame", aliases: "co monoxyde" },
    { id: "netatmo_siren", name: "Netatmo sirène", category: "security", kind: "sensor", shape: "siren", domains: ["siren", "binary_sensor"], height: 2.1, icon: "siren" },
  ]),
  ...brand("tado°", ["tado"], [
    { id: "tado_thermostat", name: "tado° thermostat", category: "climate", kind: "climate", shape: "thermostat", domains: ["climate"], height: 1.5, icon: "thermometer" },
    { id: "tado_valve", name: "tado° tête thermostatique", category: "climate", kind: "climate", shape: "valve", domains: ["climate"], height: 0.45, icon: "thermometer" },
  ]),
  ...brand("Atlantic / Thermor", ["overkiz", "cozytouch"], [
    { id: "atlantic_heater", name: "Radiateur connecté (Cozytouch)", category: "climate", kind: "climate", shape: "heater", domains: ["climate"], height: 0.35, icon: "flame", aliases: "atlantic thermor sauter chauffage électrique" },
    { id: "atlantic_water", name: "Chauffe-eau connecté (Cozytouch)", category: "climate", kind: "sensor", shape: "module", domains: ["water_heater", "sensor"], height: 1.6, icon: "shower", aliases: "ballon cumulus" },
  ]),
  ...brand("Somfy", ["overkiz", "somfy_mylink"], [
    { id: "somfy_shutter", name: "Somfy volet roulant (TaHoma)", category: "climate", kind: "cover", shape: "shutter", domains: ["cover"], icon: "window", aliases: "io rts tahoma" },
    { id: "somfy_blind", name: "Somfy store intérieur", category: "climate", kind: "cover", shape: "blind", domains: ["cover"], icon: "window" },
    { id: "somfy_tahoma", name: "Somfy TaHoma (box)", category: "hubs", kind: "sensor", shape: "bridge", domains: ["sensor"], height: 0.75, decorative: true, icon: "hexagon" },
  ]),
  ...brand("Daikin", ["daikin", "onecta"], [{ id: "daikin_ac", name: "Daikin (climatiseur)", category: "climate", kind: "climate", shape: "ac", domains: ["climate"], icon: "climate", aliases: "pompe à chaleur" }]),
  ...brand("Mitsubishi", ["melcloud", "mitsubishi"], [{ id: "mitsubishi_ac", name: "Mitsubishi (climatiseur)", category: "climate", kind: "climate", shape: "ac", domains: ["climate"], icon: "climate", aliases: "melcloud" }]),
  ...brand("Dyson", ["dyson_local", "dyson_cloud"], [
    { id: "dyson_pure", name: "Dyson Purifier / Pure Cool", category: "climate", kind: "fan", shape: "purifier", domains: ["fan"], height: 0, icon: "wind", aliases: "hot cool" },
  ]),
  ...brand("Enedis", ["linky", "zlinky", ...ZB], [
    { id: "linky", name: "Compteur Linky", category: "sensors", kind: "sensor", shape: "meter", domains: TEMP, height: 1.4, icon: "bolt", aliases: "zlinky lixee tic téléinfo électricité" },
  ]),
  ...brand("Wallbox", ["wallbox", "zaptec", "easee"], [
    { id: "wallbox", name: "Borne de recharge (Wallbox, Zaptec…)", category: "garden", kind: "sensor", shape: "wallbox", domains: ["sensor", "switch", "binary_sensor"], height: 1.2, icon: "battery", aliases: "voiture électrique ve easee pulsar" },
  ]),

  // ---- Sécurité ----
  ...brand("Nuki", ["nuki"], [{ id: "nuki_lock", name: "Nuki Smart Lock", category: "security", kind: "sensor", shape: "lock", domains: LOCK, height: 1.05, icon: "lock", aliases: "serrure" }]),
  ...brand("Ring", ["ring"], [
    { id: "ring_doorbell", name: "Ring Video Doorbell", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell", aliases: "sonnette" },
    { id: "ring_cam", name: "Ring Indoor / Stick Up Cam", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.2, icon: "camera" },
  ]),
  ...brand("Eufy", ["eufy_security"], [
    { id: "eufy_cam", name: "eufyCam", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.4, icon: "camera" },
    { id: "eufy_doorbell", name: "eufy sonnette vidéo", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell" },
  ]),
  ...brand("Reolink", ["reolink"], [
    { id: "reolink_cam", name: "Reolink caméra", category: "cameras", kind: "camera", shape: "camera", domains: CAM, height: 2.4, icon: "camera", aliases: "e1 rlc argus" },
    { id: "reolink_doorbell", name: "Reolink sonnette vidéo", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell" },
  ]),

  // ---- Multimédia ----
  ...brand("Sonos", ["sonos"], [
    { id: "sonos_era100", name: "Sonos One / Era 100", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker", aliases: "era 300 five move roam" },
    { id: "sonos_beam", name: "Sonos Beam / Arc / Ray", category: "media", kind: "media_player", shape: "soundbar", domains: ["media_player"], height: 0.5, icon: "speaker", aliases: "barre de son" },
  ]),
  ...brand("Amazon", ["alexa_media"], [
    { id: "echo_dot", name: "Echo Dot", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker", aliases: "alexa echo pop" },
    { id: "echo_studio", name: "Echo / Echo Studio", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker", aliases: "alexa" },
    { id: "echo_show", name: "Echo Show (écran)", category: "media", kind: "media_player", shape: "smart_display", domains: ["media_player"], height: 0.75, icon: "monitor", aliases: "alexa écran" },
    { id: "fire_tv", name: "Fire TV Stick / Cube", category: "media", kind: "media_player", shape: "media_box", domains: ["media_player", "remote"], platforms: ["androidtv", "alexa_media"], height: 0.55, icon: "strip" },
  ]),
  ...brand("Google", ["cast"], [
    { id: "nest_mini", name: "Nest Mini / Nest Audio", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker", aliases: "google home" },
    { id: "nest_hub", name: "Nest Hub (écran)", category: "media", kind: "media_player", shape: "smart_display", domains: ["media_player"], height: 0.75, icon: "monitor" },
    { id: "chromecast", name: "Chromecast / Google TV Streamer", category: "media", kind: "media_player", shape: "media_box", domains: ["media_player"], height: 0.55, icon: "strip" },
    { id: "nest_thermostat", name: "Nest Thermostat", category: "climate", kind: "climate", shape: "thermostat", domains: ["climate"], platforms: ["nest"], height: 1.5, icon: "thermometer" },
    { id: "nest_cam", name: "Nest Cam", category: "cameras", kind: "camera", shape: "camera", domains: CAM, platforms: ["nest"], height: 2.2, icon: "camera" },
    { id: "nest_doorbell", name: "Nest Doorbell", category: "security", kind: "camera", shape: "doorbell", domains: BELL, platforms: ["nest"], height: 1.4, icon: "bell" },
    { id: "nest_protect", name: "Nest Protect (fumée / CO)", category: "sensors", kind: "sensor", shape: "smoke", domains: BIN, platforms: ["nest"], icon: "flame" },
  ]),
  ...brand("Apple", ["homekit_controller", "apple_tv"], [
    { id: "homepod", name: "HomePod / HomePod mini", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker" },
    { id: "apple_tv", name: "Apple TV", category: "media", kind: "media_player", shape: "media_box", domains: ["media_player", "remote"], height: 0.55, icon: "strip" },
  ]),
  ...brand("Samsung / LG / Sony", ["samsungtv", "webostv", "braviatv", "philips_js", "androidtv_remote"], [
    { id: "smart_tv", name: "Smart TV (Samsung, LG, Sony, Philips)", category: "media", kind: "media_player", shape: "tv", domains: ["media_player", "remote"], icon: "tv", aliases: "télé oled qled ambilight webos tizen" },
  ]),
  ...brand("Box internet", ["freebox", "orange_livebox", "sfr_box", "bbox", "fritzbox", "unifi"], [
    { id: "box_internet", name: "Box internet (Freebox, Livebox…)", category: "hubs", kind: "sensor", shape: "router", domains: ["sensor", "binary_sensor", "device_tracker"], height: 0.75, decorative: true, icon: "wifi", aliases: "freebox livebox bbox sfr routeur wifi" },
  ]),

  // ---- Animaux ----
  // Litter-Robot (intégration officielle litterrobot) : entité vacuum pour le cycle, capteurs pour le bac.
  ...brand("Whisker", ["litterrobot"], [
    { id: "litter_robot_4", name: "Litter-Robot 4", category: "pets", kind: "sensor", shape: "litter", domains: ["vacuum", "sensor", "binary_sensor", "switch", "select"], icon: "paw", aliases: "litter robot 3" },
    { id: "feeder_robot", name: "Feeder-Robot (distributeur)", category: "pets", kind: "sensor", shape: "feeder", domains: ["sensor", "binary_sensor", "button", "switch"], height: 0, icon: "bowl" },
  ]),
  ...brand("Petkit", ["petkit"], [
    { id: "petkit_pura_max", name: "Petkit Pura Max", category: "pets", kind: "sensor", shape: "litter", domains: ["sensor", "binary_sensor", "switch", "select", "vacuum"], icon: "paw", aliases: "pura x" },
    { id: "petkit_feeder", name: "Petkit Fresh Element (distributeur)", category: "pets", kind: "sensor", shape: "feeder", domains: ["sensor", "binary_sensor", "button", "switch"], height: 0, icon: "bowl", aliases: "solo mini" },
    { id: "petkit_fountain", name: "Petkit Eversweet (fontaine)", category: "pets", kind: "sensor", shape: "fountain", domains: ["sensor", "binary_sensor", "switch"], height: 0, icon: "droplet", aliases: "fontaine à eau chat" },
  ]),

  // ---- Jardin ----
  ...brand("Husqvarna / Gardena", ["husqvarna_automower", "gardena_bluetooth"], [
    { id: "automower", name: "Robot tondeuse (Automower…)", category: "garden", kind: "sensor", shape: "mower", domains: ["lawn_mower", "sensor"], height: 0, icon: "leaf", aliases: "gardena worx landroid segway navimow tonte pelouse" },
    { id: "gardena_valve", name: "Arrosage connecté", category: "garden", kind: "switch", shape: "module", domains: ["valve", "switch"], height: 0.3, icon: "shower", aliases: "vanne irrigation" },
  ]),

  // ---- Génériques ----
  ...brand("Générique", undefined, [
    { id: "gen_pendant", name: "Suspension", category: "lighting", kind: "light", shape: "pendant", domains: LIGHT, icon: "bulb" },
    { id: "gen_ceiling", name: "Plafonnier", category: "lighting", kind: "light", shape: "ceiling", domains: LIGHT, icon: "ring" },
    { id: "gen_spot", name: "Spot encastré", category: "lighting", kind: "light", shape: "spot", domains: LIGHT, icon: "sun" },
    { id: "gen_table_lamp", name: "Lampe de chevet", category: "lighting", kind: "light", shape: "table_lamp", domains: LIGHT, height: 0.5, icon: "sofa" },
    { id: "gen_desk_lamp", name: "Lampe de bureau", category: "lighting", kind: "light", shape: "desk_lamp", domains: LIGHT, height: 0.75, icon: "bulb" },
    { id: "gen_floor_lamp", name: "Lampadaire", category: "lighting", kind: "light", shape: "floor_lamp", domains: LIGHT, height: 0, icon: "candle" },
    { id: "gen_torchiere", name: "Lampadaire vasque + liseuse", category: "lighting", kind: "light", shape: "torchiere", domains: LIGHT, height: 0, icon: "candle", aliases: "halogène uplight" },
    { id: "gen_corner", name: "Lampadaire d'angle LED", category: "lighting", kind: "light", shape: "corner_lamp", domains: LIGHT, height: 0, icon: "plan" },
    { id: "gen_wall_light", name: "Applique murale", category: "lighting", kind: "light", shape: "wall_light", domains: LIGHT, height: 1.8, icon: "lantern" },
    { id: "gen_strip", name: "Ruban LED", category: "lighting", kind: "light", shape: "strip", domains: LIGHT, height: 2.4, length: 2, icon: "wave" },
    { id: "gen_string", name: "Guirlande lumineuse", category: "lighting", kind: "light", shape: "string_lights", domains: LIGHT, height: 2.1, length: 2, icon: "sparkles" },
    { id: "gen_garden_spot", name: "Spot de jardin", category: "garden", kind: "light", shape: "garden_spot", domains: LIGHT, height: 0, icon: "spot" },
    { id: "gen_plug", name: "Prise connectée", category: "plugs", kind: "switch", shape: "plug", domains: ["switch", "light", "input_boolean"], icon: "plug" },
    { id: "gen_power_strip", name: "Multiprise connectée", category: "plugs", kind: "switch", shape: "power_strip", domains: PLUG, height: 0, icon: "plug" },
    { id: "gen_wall_switch", name: "Interrupteur connecté", category: "plugs", kind: "switch", shape: "wall_switch", domains: ["switch", "light"], height: 1.1, icon: "sliders" },
    { id: "gen_module", name: "Module encastré (relais)", category: "plugs", kind: "switch", shape: "module", domains: ["switch", "light"], height: 1.1, icon: "square" },
    { id: "gen_motion", name: "Détecteur de mouvement", category: "sensors", kind: "sensor", shape: "motion", domains: BIN, height: 2.0, icon: "eye" },
    { id: "gen_contact", name: "Capteur d'ouverture", category: "sensors", kind: "sensor", shape: "contact", domains: BIN, height: 1.2, icon: "door" },
    { id: "gen_thermo", name: "Thermomètre / hygromètre", category: "sensors", kind: "sensor", shape: "thermo", domains: TEMP, icon: "thermometer" },
    { id: "gen_smoke", name: "Détecteur de fumée", category: "sensors", kind: "sensor", shape: "smoke", domains: BIN, icon: "flame" },
    { id: "gen_leak", name: "Détecteur de fuite d'eau", category: "sensors", kind: "sensor", shape: "leak", domains: BIN, height: 0, icon: "droplet" },
    { id: "gen_meter", name: "Compteur d'énergie", category: "sensors", kind: "sensor", shape: "meter", domains: TEMP, height: 1.4, icon: "bolt" },
    { id: "gen_lock", name: "Serrure connectée", category: "security", kind: "sensor", shape: "lock", domains: LOCK, height: 1.05, icon: "lock" },
    { id: "gen_doorbell", name: "Sonnette vidéo", category: "security", kind: "camera", shape: "doorbell", domains: BELL, height: 1.4, icon: "bell" },
    { id: "gen_siren", name: "Sirène / alarme", category: "security", kind: "sensor", shape: "siren", domains: ["siren", "alarm_control_panel", "binary_sensor"], height: 2.1, icon: "siren" },
    { id: "gen_camera", name: "Caméra", category: "cameras", kind: "camera", shape: "camera", domains: CAM, icon: "camera" },
    { id: "gen_ac", name: "Climatiseur mural", category: "climate", kind: "climate", shape: "ac", domains: ["climate"], icon: "climate" },
    { id: "gen_thermostat", name: "Thermostat", category: "climate", kind: "climate", shape: "thermostat", domains: ["climate"], height: 1.5, icon: "thermometer" },
    { id: "gen_valve", name: "Tête thermostatique", category: "climate", kind: "climate", shape: "valve", domains: ["climate"], height: 0.45, icon: "thermometer" },
    { id: "gen_heater", name: "Radiateur électrique", category: "climate", kind: "climate", shape: "heater", domains: ["climate", "switch"], height: 0.35, icon: "flame" },
    { id: "gen_vacuum", name: "Aspirateur robot", category: "climate", kind: "vacuum", shape: "vacuum", domains: ["vacuum"], icon: "vacuum" },
    { id: "gen_fan", name: "Ventilateur de plafond", category: "climate", kind: "fan", shape: "fan", domains: ["fan"], icon: "fan" },
    { id: "gen_fan_stand", name: "Ventilateur sur pied", category: "climate", kind: "fan", shape: "fan_stand", domains: ["fan", "switch"], height: 0, icon: "fan" },
    { id: "gen_purifier", name: "Purificateur d'air", category: "climate", kind: "fan", shape: "purifier", domains: ["fan", "switch"], height: 0, icon: "wind", aliases: "déshumidificateur humidificateur" },
    { id: "gen_shutter", name: "Volet roulant", category: "climate", kind: "cover", shape: "shutter", domains: ["cover"], icon: "window" },
    { id: "gen_blind", name: "Store intérieur", category: "climate", kind: "cover", shape: "blind", domains: ["cover"], icon: "window", aliases: "enrouleur" },
    { id: "gen_curtain", name: "Rideaux motorisés", category: "climate", kind: "cover", shape: "curtain", domains: ["cover"], icon: "hexagon" },
    { id: "gen_tv", name: "Télévision", category: "media", kind: "media_player", shape: "tv", domains: ["media_player"], icon: "tv" },
    { id: "gen_speaker", name: "Enceinte connectée", category: "media", kind: "media_player", shape: "speaker", domains: ["media_player"], height: 0.75, icon: "speaker" },
    { id: "gen_soundbar", name: "Barre de son", category: "media", kind: "media_player", shape: "soundbar", domains: ["media_player"], height: 0.5, icon: "speaker" },
    { id: "gen_display", name: "Écran connecté", category: "media", kind: "media_player", shape: "smart_display", domains: ["media_player"], height: 0.75, icon: "monitor", aliases: "tablette" },
    { id: "gen_router", name: "Routeur / box", category: "hubs", kind: "sensor", shape: "router", domains: ["sensor", "binary_sensor"], height: 0.75, decorative: true, icon: "wifi" },
    { id: "gen_litter", name: "Litière connectée", category: "pets", kind: "sensor", shape: "litter", domains: ["sensor", "binary_sensor", "vacuum", "switch", "select"], icon: "paw", aliases: "catlink" },
    { id: "gen_feeder", name: "Distributeur de croquettes", category: "pets", kind: "sensor", shape: "feeder", domains: ["sensor", "binary_sensor", "button", "switch"], platforms: ["petkit", "litterrobot"], height: 0, icon: "bowl", aliases: "petlibro" },
    { id: "gen_fountain", name: "Fontaine à eau", category: "pets", kind: "sensor", shape: "fountain", domains: ["sensor", "binary_sensor", "switch"], height: 0, icon: "droplet" },
  ]),
];

const FURNITURE_ICONS: Record<FurnitureType, IconName> = {
  sofa: "sofa",
  armchair: "sofa",
  bed: "bed",
  nightstand: "wardrobe",
  table: "table",
  desk: "monitor",
  chair: "chair",
  wardrobe: "wardrobe",
  bookcase: "book",
  tv_stand: "tv",
  rug: "square",
  kitchen: "kitchen",
  fridge: "fridge",
  washer: "washer",
  toilet: "toilet",
  washbasin: "droplet",
  shower: "shower",
  bathtub: "bath",
  plant: "leaf",
  box: "cube",
};

export const FURNITURE_ITEMS: FurnitureItem[] = (Object.keys(FURNITURE_ICONS) as FurnitureType[]).map((f) => ({
  id: `f_${f}`,
  category: "furniture",
  furniture: f,
  icon: FURNITURE_ICONS[f],
}));

/** Mots-clés de recherche (en français) selon la forme, en plus du nom et de la marque. */
export const SHAPE_KEYWORDS: Partial<Record<Shape, string>> = {
  pendant: "ampoule lampe lumière suspension plafond",
  bulb: "ampoule lampe lumière e27 couleur",
  spot: "spot ampoule lumière gu10 encastré plafond",
  ceiling: "plafonnier lumière lampe plafond",
  table_lamp: "lampe chevet bureau table lumière",
  floor_lamp: "lampadaire lampe lumière sol",
  go: "lampe portable ambiance lumière",
  bar: "barre lumière ambiance tv",
  strip: "ruban bande led lumière",
  hexa: "panneaux hexagones murale led lumière",
  tv_backlight: "rétroéclairage télé tv led ambilight",
  plug: "prise connectée électrique",
  button: "bouton interrupteur télécommande variateur",
  motion: "détecteur capteur mouvement présence pir",
  contact: "capteur ouverture porte fenêtre contact",
  thermo: "capteur température humidité thermomètre hygromètre",
  smoke: "détecteur fumée incendie alarme",
  camera: "caméra surveillance vidéo",
  camera_dome: "caméra surveillance vidéo 360 motorisée",
  bridge: "pont passerelle hub",
  hub: "hub passerelle",
  speaker: "enceinte assistant vocal musique",
  tv: "télévision télé écran",
  ac: "clim climatisation climatiseur chauffage pompe à chaleur",
  vacuum: "aspirateur robot ménage",
  shutter: "volet roulant store",
  fan: "ventilateur",
  litter: "litière chat animal",
  feeder: "distributeur croquettes gamelle chat chien animal",
  fountain: "fontaine eau chat chien animal",
  torchiere: "lampadaire vasque liseuse lampe lumière sol",
  corner_lamp: "lampadaire angle colonne led lumière sol",
  lantern: "lampe portable baladeuse lumière",
  wall_light: "applique murale lumière lampe",
  garden_spot: "spot jardin extérieur projecteur lumière",
  string_lights: "guirlande lumineuse lumière déco",
  desk_lamp: "lampe bureau architecte lumière",
  leak: "détecteur fuite eau inondation",
  plant_sensor: "capteur plante sol arrosage",
  meter: "compteur énergie électricité consommation",
  module: "module relais encastré",
  wall_switch: "interrupteur mural variateur",
  power_strip: "multiprise prise",
  lock: "serrure porte verrou",
  doorbell: "sonnette interphone porte caméra",
  siren: "sirène alarme",
  smart_display: "écran assistant vocal",
  soundbar: "barre de son enceinte home cinéma",
  media_box: "box tv lecteur multimédia",
  router: "box internet routeur wifi",
  fan_stand: "ventilateur pied",
  purifier: "purificateur air humidificateur",
  thermostat: "thermostat chauffage",
  valve: "tête thermostatique radiateur vanne chauffage",
  heater: "radiateur chauffage",
  blind: "store enrouleur fenêtre",
  curtain: "rideau rideaux fenêtre",
  wallbox: "borne recharge voiture électrique",
  mower: "tondeuse robot jardin pelouse",
};

export const CATEGORIES: Category[] = ["lighting", "plugs", "sensors", "security", "cameras", "climate", "media", "pets", "garden", "hubs", "furniture"];

const BY_ID = new Map<string, DeviceItem>(DEVICE_ITEMS.map((i) => [i.id, i]));

export function deviceItem(model: string | undefined): DeviceItem | undefined {
  return model ? BY_ID.get(model) : undefined;
}

/** Forme par défaut quand l'appareil n'a pas de modèle de bibliothèque. */
export const DEFAULT_SHAPE: Record<DeviceKind, Shape> = {
  light: "pendant",
  climate: "ac",
  vacuum: "vacuum",
  cover: "shutter",
  fan: "fan",
  switch: "plug",
  media_player: "tv",
  camera: "camera",
  sensor: "thermo",
};
