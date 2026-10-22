import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Points 6 à 10 : énergie, aspirateur réel, caméra en direct, étages, météo.
const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
const errors = [];

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/dev/index.html?plan=maison${query}`);
  await page.waitForTimeout(2500);
  return page;
}
const setState = (page, id, state, attrs) =>
  page.evaluate(
    ([id, state, attrs]) => {
      const c = document.querySelector("blueprint3d-card");
      const h = c._hass;
      const cur = h.states[id];
      h.states[id] = { ...cur, state, attributes: { ...cur.attributes, ...(attrs ?? {}) } };
      c.hass = { ...h, states: { ...h.states } };
    },
    [id, state, attrs],
  );
const labelText = (page, needle) =>
  page.evaluate((n) => [...document.querySelector("blueprint3d-card").shadowRoot.querySelectorAll(".dev-label")].map((l) => l.textContent).find((t) => t.includes(n)), needle);

// ---------- 6. Énergie ----------
{
  const page = await open("");
  const tv = await labelText(page, "TV");
  check("puissance trouvée via l'appareil HA (TV)", tv?.includes("96 W"), tv);
  const cafe = await labelText(page, "café");
  check("puissance en kW (prise P110)", cafe?.includes("1,45 kW"), cafe);
  const meter = await page.locator(".meter").textContent();
  check("compteur du logement", meter.includes("2,31 kW"), meter);
  await setState(page, "sensor.tv_puissance", "120");
  await page.waitForTimeout(300);
  check("mise à jour en direct de la puissance", (await labelText(page, "TV"))?.includes("120 W"));
  for (let i = 0; i < 3; i++) await page.locator("[data-act=heat]").click();
  await page.waitForTimeout(300);
  const legend = await page.locator(".legend").textContent();
  check("carte de chaleur « énergie »", (await page.locator("[data-act=heat]").textContent()).includes("Énergie") && legend.includes("W"), legend);
  await page.close();
}

// ---------- Rendu : murs transparents, tuiles d'infos, icônes ----------
{
  const page = await open("");
  const walls = () =>
    page.evaluate(() => {
      const pieces = document.querySelector("blueprint3d-card").house.pieces;
      return {
        ghost: pieces.filter((p) => p.fade === 1).length,
        ghostIntact: pieces.filter((p) => p.fade === 1).every((p) => p.parts.every((x) => x.mesh.visible && x.mesh.scale.y === 1)),
        ghostSeeThrough: pieces.filter((p) => p.fade === 1).every((p) => p.mats.every((m) => m.mat.transparent && m.mat.opacity < 0.5)),
        lowered: pieces.filter((p) => p.t === 1).length,
        opaqueAgain: pieces.every((p) => p.fade > 0 || p.mats.every((m) => m.mat.transparent === m.transparent && m.mat.opacity === m.opacity)),
      };
    });
  const w1 = await walls();
  check("murs côté caméra estompés (pleine hauteur, translucides)", w1.ghost > 0 && w1.ghostIntact && w1.ghostSeeThrough && w1.lowered === 0, JSON.stringify(w1));
  await page.locator("[data-act=walls]").click();
  await page.waitForTimeout(800);
  const w2 = await walls();
  check("mode « coupe » : murs rabaissés et de nouveau opaques", w2.ghost === 0 && w2.lowered > 0 && w2.opaqueAgain, JSON.stringify(w2));

  const tiles = await page.locator(".stats .stat").allTextContents();
  check("tuiles d'infos (conso, intérieur, humidité, lumières, ouvertures)", tiles.length === 5 && tiles.some((t) => t.includes("2,31 kW")), tiles.join(" | "));
  await page.locator(".stat[data-heat=temperature]").click();
  await page.waitForTimeout(200);
  const on = await page.evaluate(() => {
    const root = document.querySelector("blueprint3d-card").shadowRoot;
    return { legend: !root.querySelector(".legend").hidden, active: root.querySelector(".stat[data-heat=temperature]").classList.contains("active"), btn: root.querySelector("[data-act=heat]").textContent };
  });
  check("tuile température → carte de chaleur", on.legend && on.active && on.btn.includes("Température"), JSON.stringify(on));
  await page.locator(".stat[data-heat=temperature]").click();
  await page.waitForTimeout(200);
  check("second appui : carte de chaleur coupée", await page.locator(".legend").isHidden());

  const ui = await page.evaluate(() => {
    const root = document.querySelector("blueprint3d-card").shadowRoot;
    return {
      bars: root.querySelector(".toolbar").textContent + root.querySelector(".editbar").textContent + root.querySelector(".stats").textContent,
      icons: root.querySelectorAll(".toolbar svg.ic, .dev-label .dot svg.ic").length,
      room: [...root.querySelectorAll(".room-label")].map((l) => l.textContent).find((t) => t.startsWith("Séjour")),
    };
  });
  check("aucun emoji dans les barres", !/\p{Extended_Pictographic}/u.test(ui.bars), ui.bars);
  check("icônes au trait (barre + pastilles)", ui.icons > 10, String(ui.icons));
  check("étiquette de pièce avec température", ui.room?.includes("°"), ui.room);

  // Étiquettes dépliées seulement pour les pièces au premier plan ; les autres en pastilles.
  const labelsByRoom = () =>
    page.evaluate(() => {
      const c = document.querySelector("blueprint3d-card");
      c.declutter(true);
      const front = c.frontRooms();
      const rows = c.views.map((v) => ({ room: c.house.roomAt(v.group.position.x, v.group.position.z)?.name, full: !v.labelEl.classList.contains("mini") && !v.labelEl.classList.contains("culled") }));
      return { front: [...front], fullBehind: rows.filter((r) => r.full && r.room && !front.has(r.room)).length, full: rows.filter((r) => r.full).length, mini: rows.filter((r) => !r.full).length };
    });
  const l1 = await labelsByRoom();
  check("pièces du fond : pastilles seulement", l1.fullBehind === 0 && l1.mini > 0 && l1.full > 0, JSON.stringify(l1));
  await page.evaluate(() => document.querySelector("blueprint3d-card").openRoom("Cuisine"));
  await page.waitForTimeout(200);
  const kitchen = await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c.declutter(true);
    return c.views.filter((v) => c.house.roomAt(v.group.position.x, v.group.position.z)?.name === "Cuisine").some((v) => !v.labelEl.classList.contains("mini") && !v.labelEl.classList.contains("culled"));
  });
  // (deux appareils qui se chevauchent à l'écran gardent une pastille : au moins un se déplie)
  check("pièce ouverte : ses étiquettes se déplient", kitchen && !l1.front.includes("Cuisine"), l1.front.join(", "));
  await page.close();
}

// ---------- 7. Aspirateur : position réelle ----------
{
  const page = await open("&realvacuum");
  await page.waitForTimeout(2500);
  const pos = () =>
    page.evaluate(() => {
      const v = document.querySelector("blueprint3d-card").views.find((v) => v.cfg.entity === "vacuum.robot");
      return { x: v.robot.position.x - v.dock.x, z: v.robot.position.z - v.dock.z, trail: v.trail?.geometry.attributes.position.count ?? 0 };
    });
  let p = await pos();
  check("robot à sa vraie position (1,2 m ; 1,6 m de la base)", Math.abs(p.x - 1.2) < 0.08 && Math.abs(p.z - 1.6) < 0.08, JSON.stringify(p));
  check("trajet tracé au sol", p.trail === 4, `${p.trail} points`);
  await setState(page, "camera.xiaomi_map", "idle", { vacuum_position: { x: 25000, y: 25000 } });
  await page.waitForTimeout(3000);
  p = await pos();
  check("retour à la base suivi en direct", Math.hypot(p.x, p.z) < 0.1, JSON.stringify(p));
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const cfg = c.devices.find((d) => d.entity === "vacuum.robot");
    cfg.map_rotation = 90;
    c.buildDevices();
  });
  await setState(page, "camera.xiaomi_map", "idle", { vacuum_position: { x: 26000, y: 25000 } });
  await page.waitForTimeout(3000);
  p = await pos();
  check("rotation de la carte (90°)", Math.abs(p.x) < 0.08 && Math.abs(p.z - 1) < 0.08, JSON.stringify(p));
  // Xiaomi X20+ : start + stop + return_home, sans pause ni locate.
  await setState(page, "vacuum.robot", "docked", { supported_features: 8192 | 8 | 16 });
  await page.locator(".dev-label", { hasText: "Robot" }).first().click();
  await page.waitForTimeout(300);
  const svcs = await page.locator(".panel [data-svc]").evaluateAll((els) => els.map((b) => b.dataset.svc));
  check(
    "boutons aspirateur selon supported_features",
    svcs.join(",") === "vacuum.start,vacuum.stop,vacuum.return_to_base",
    svcs.join(","),
  );
  await page.close();
}

// ---------- TV LG sur barre de son : volume +/− au lieu du curseur ----------
{
  const page = await open("");
  // webOS avec sortie ARC : pause, sourdine, précédent, suivant, source, lecture, volume +/− (pas de volume_set).
  await setState(page, "media_player.tv", "playing", { supported_features: 1 | 8 | 16 | 32 | 256 | 512 | 1024 | 2048 | 16384, is_volume_muted: false });
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    window.__calls = [];
    c.hass = { ...c._hass, callService: async (...a) => window.__calls.push(a) };
  });
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c.openPanel(c.views.find((v) => v.cfg.entity === "media_player.tv"));
  });
  await page.waitForTimeout(300);
  const tv = await page.evaluate(() => {
    const p = document.querySelector("blueprint3d-card").shadowRoot.querySelector(".panel");
    return { slider: !!p.querySelector("input[data-field=volume]"), svcs: [...p.querySelectorAll("[data-svc]")].map((b) => b.dataset.svc), mute: !!p.querySelector("[data-act=mute]") };
  });
  check("TV sans volume_set : pas de curseur, boutons − / + et sourdine", !tv.slider && tv.svcs.includes("media_player.volume_up") && tv.svcs.includes("media_player.volume_down") && tv.mute, JSON.stringify(tv));
  await page.locator(".panel [data-svc='media_player.volume_up']").click();
  await page.locator(".panel [data-act=mute]").click();
  const calls = await page.evaluate(() => window.__calls.map(([d, s, data]) => `${d}.${s}:${JSON.stringify(data)}`));
  check(
    "volume + et sourdine envoyés à la TV",
    calls.some((c) => c.startsWith("media_player.volume_up:") && c.includes("media_player.tv")) && calls.some((c) => c.startsWith("media_player.volume_mute:") && c.includes('"is_volume_muted":true')),
    calls.join(" | "),
  );
  // Avec volume_set (bit 4) : le curseur revient.
  await setState(page, "media_player.tv", "playing", { supported_features: 4 | 8 | 1024 | 1 | 16384 });
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c.openPanel(c.views.find((v) => v.cfg.entity === "media_player.tv"));
  });
  await page.waitForTimeout(300);
  check("TV avec volume_set : curseur affiché", (await page.locator(".panel input[data-field=volume]").count()) === 1);
  await page.close();
}

// ---------- 8. Caméra ----------
{
  const page = await open("");
  await page.locator(".dev-label", { hasText: "Caméra salon" }).first().click();
  await page.waitForTimeout(300);
  const src1 = await page.locator(".panel img.cam").getAttribute("src");
  check("aperçu caméra (image servie par HA)", src1?.startsWith("/dev/camera.svg?token=demo&_="), src1);
  await page.waitForTimeout(3500);
  const src2 = await page.locator(".panel img.cam").getAttribute("src");
  check("image rafraîchie toutes les 3 s", src1 !== src2);
  await page.locator(".panel [data-act=close]").click();
  // Image piégée : refusée
  await setState(page, "camera.tapo_c200_salon", "idle", { entity_picture: "javascript:alert(1)" });
  await page.locator(".dev-label", { hasText: "Caméra salon" }).first().click();
  await page.waitForTimeout(300);
  check("entity_picture javascript: refusée", (await page.locator(".panel img.cam").count()) === 0);
  await page.locator(".panel [data-act=close]").click();
  // Dans HA : le lecteur natif ha-camera-stream est utilisé
  await page.evaluate(() => {
    customElements.define("ha-camera-stream", class extends HTMLElement {});
  });
  await setState(page, "camera.tapo_c200_salon", "streaming", { entity_picture: "/dev/camera.svg?token=2" });
  await page.locator(".dev-label", { hasText: "Caméra salon" }).first().click();
  await page.waitForTimeout(300);
  const stream = await page.evaluate(() => {
    const el = document.querySelector("blueprint3d-card").shadowRoot.querySelector(".panel ha-camera-stream");
    return el && { entity: el.stateObj?.entity_id, hass: !!el.hass, muted: el.muted };
  });
  check("flux en direct via ha-camera-stream", stream?.entity === "camera.tapo_c200_salon" && stream.hass && stream.muted, JSON.stringify(stream));
  await page.close();
}

// ---------- 9. Étages ----------
{
  const page = await open("&levels&edit");
  const buttons = await page.locator(".levels button").allTextContents();
  check("sélecteur d'étages", buttons.join("|") === "RDC|Étage", buttons.join("|"));
  const before = await page.evaluate(() => document.querySelector("blueprint3d-card").house.roomNames.length);
  await page.locator(".levels button", { hasText: "Étage" }).click();
  await page.waitForTimeout(400);
  let s = await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    return { rooms: c.house.roomNames.length, views: c.views.length, level: c.level };
  });
  check("étage vide affiché seul", s.rooms === 0 && s.views === 0 && s.level === 1, JSON.stringify(s));
  // Dessine une pièce à l'étage
  await page.locator("[data-tab=plan]").click();
  await page.waitForTimeout(300);
  await page.locator("[data-tool=room]").click();
  const pts = await page.evaluate(() => {
    const e = document.querySelector("blueprint3d-card").editor;
    const r = e.canvas.getBoundingClientRect();
    return [0, 4, 3, 8].map((v, i) => (i % 2 === 0 ? r.left + v * e.scale + e.ox : r.top + v * e.scale + e.oy));
  });
  await page.mouse.move(pts[0], pts[1]);
  await page.mouse.down();
  await page.mouse.move(pts[2], pts[3], { steps: 5 });
  await page.mouse.up();
  const room = await page.evaluate(() => document.querySelector("blueprint3d-card").config.rooms.at(-1));
  check("nouvelle pièce rattachée à l'étage", room.level === 1, JSON.stringify(room));
  await page.locator("[data-tab=devices]").click();
  await page.waitForTimeout(400);
  s = await page.evaluate(() => document.querySelector("blueprint3d-card").house.roomNames.length);
  check("la pièce apparaît en 3D à l'étage", s === 1);
  await page.locator(".levels button", { hasText: "RDC" }).click();
  await page.waitForTimeout(400);
  s = await page.evaluate(() => document.querySelector("blueprint3d-card").house.roomNames.length);
  check("retour au RDC intact", s === before, `${s}/${before}`);
  const exported = await page.evaluate(() => document.querySelector("blueprint3d-card").exportConfig());
  check("étages exportés", exported.levels?.length === 2 && exported.rooms.some((r) => r.level === 1));
  // Supprimer un étage encore occupé : refusé
  page.once("dialog", (d) => d.accept());
  await page.locator("[data-act=settings]").click();
  await page.locator('.modal [data-k="levels"]').fill("RDC");
  await page.locator(".modal [data-act=apply-settings]").click();
  await page.waitForTimeout(200);
  const lv = await page.evaluate(() => document.querySelector("blueprint3d-card").config.levels?.length);
  check("suppression d'un étage occupé refusée", lv === 2, String(lv));
  await page.locator(".modal [data-act=close]").click();
  // Nom d'étage piégé
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c.config.levels[1].name = '<img src=x onerror="window.__xss=1">';
    c.refreshUi();
  });
  check("nom d'étage échappé", !(await page.evaluate(() => window.__xss)));
  await page.close();
}

// ---------- 10. Météo ----------
{
  const page = await open("");
  const w = () =>
    page.evaluate(() => {
      const c = document.querySelector("blueprint3d-card");
      return { visible: c.weather.object.visible, count: c.weather.count, sun: Math.round(c.sun.intensity * 100) / 100, clouds: c.clouds };
    });
  let s = await w();
  check("pluie sur les extérieurs", s.visible && s.count > 100, JSON.stringify(s));
  await page.screenshot({ path: `${out}/weather-rain.png` });
  const rainySun = s.sun;
  await setState(page, "weather.maison", "sunny");
  await page.waitForTimeout(300);
  s = await w();
  check("soleil : plus de pluie, soleil plus fort", !s.visible && s.sun > rainySun, JSON.stringify(s));
  await setState(page, "weather.maison", "snowy");
  await page.waitForTimeout(300);
  s = await w();
  check("neige", s.visible && s.clouds > 0.5, JSON.stringify(s));
  await page.close();
}

check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
