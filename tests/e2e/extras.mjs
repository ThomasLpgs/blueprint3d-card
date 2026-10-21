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
