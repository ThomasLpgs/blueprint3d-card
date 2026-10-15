import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Placement fin dans le décor : hauteur (curseur + raccourcis), rotation, longueur, enregistrement et validation.
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);
await page.locator("[data-act=edit]").click();
await page.waitForTimeout(300);

// Pose d'un ruban LED et d'un pont Hue (non reliés), puis ouverture de la fiche du ruban.
const setup = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.devices.push({ entity: "", model: "hue_lightstrip", type: "light", position: [7.2, 3.0] });
  c.devices.push({ entity: "", model: "hue_bridge", type: "sensor", position: [8.0, 5.0] });
  c.buildDevices();
  const strip = c.views.find((v) => v.cfg.model === "hue_lightstrip");
  c.openPanel(strip);
  return { h: strip.effectiveHeight };
});
await page.waitForTimeout(300);
check("ruban posé à 2,40 m par défaut", Math.abs(setup.h - 2.4) < 0.01, JSON.stringify(setup));
const panelHas = await page.evaluate(() => {
  const p = document.querySelector("blueprint3d-card").shadowRoot.querySelector(".panel");
  return { height: !!p.querySelector("input[data-field=height]"), rotation: !!p.querySelector("input[data-field=rotation]"), presets: p.querySelectorAll("[data-act=h-preset]").length, length: !!p.querySelector("input[data-field=length]") };
});
check("fiche : hauteur, rotation, raccourcis, longueur", panelHas.height && panelHas.rotation && panelHas.presets === 4 && panelHas.length, JSON.stringify(panelHas));

// Glissement du curseur : aperçu en direct, la fiche reste ouverte.
const stripY = () =>
  page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const v = c.views.find((v) => v.cfg.model === "hue_lightstrip");
    const box = new (v.group.position.constructor)();
    let maxY = -1;
    v.group.traverse((o) => o.isMesh && o.visible !== false && o.geometry?.boundingSphere !== undefined && (maxY = Math.max(maxY, o.position.y)));
    return { cfg: v.cfg.height, h: v.effectiveHeight, maxY, panel: !!c.shadowRoot.querySelector(".panel input[data-field=height]") };
  });
await page.locator(".panel input[data-field=height]").fill("1.2");
await page.waitForTimeout(200);
let s = await stripY();
check("curseur : ruban descendu à 1,20 m", s.cfg === 1.2 && Math.abs(s.h - 1.2) < 0.01 && s.panel, JSON.stringify(s));
const out = await page.locator(".panel-edit label output").first().textContent();
check("valeur affichée (1,20 m)", out.includes("1,20"), out);

// Raccourcis : Sol / Plafond (borné au plafond).
await page.locator(".panel [data-act=h-preset]", { hasText: "Sol" }).click();
await page.waitForTimeout(200);
s = await stripY();
check("raccourci « Sol »", s.cfg === 0, JSON.stringify(s));
await page.locator(".panel [data-act=h-preset]", { hasText: "Plafond" }).click();
await page.waitForTimeout(200);
s = await stripY();
check("raccourci « Plafond » (2,35 m sous un plafond de 2,50 m)", s.cfg === 2.35, JSON.stringify(s));

// Pont Hue : posé sur un meuble, descendu au sol, tourné.
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.openPanel(c.views.find((v) => v.cfg.model === "hue_bridge"));
});
await page.waitForTimeout(200);
await page.locator(".panel [data-act=h-preset]", { hasText: "Sol" }).click();
await page.locator(".panel input[data-field=rotation]").fill("90");
await page.waitForTimeout(200);
const bridge = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const v = c.views.find((v) => v.cfg.model === "hue_bridge");
  return { height: v.cfg.height, rotation: v.cfg.rotation, rotY: Math.round((v.group.rotation.y * 180) / Math.PI) };
});
check("pont Hue au sol et tourné de 90°", bridge.height === 0 && bridge.rotation === 90 && bridge.rotY === 90, JSON.stringify(bridge));

// Plafonnier : pas de curseur de hauteur (il suit le plafond).
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.devices.push({ entity: "", model: "gen_ceiling", type: "light", position: [7.5, 4.0] });
  c.buildDevices();
  c.openPanel(c.views.find((v) => v.cfg.model === "gen_ceiling"));
});
await page.waitForTimeout(200);
check("plafonnier : pas de réglage de hauteur", (await page.locator(".panel input[data-field=height]").count()) === 0);

// Export : hauteur et rotation conservées ; un re-import les garde.
const exported = await page.evaluate(() => document.querySelector("blueprint3d-card").exportConfig().devices.filter((d) => d.model === "hue_bridge" || d.model === "hue_lightstrip"));
check("export : hauteur et rotation", exported.some((d) => d.model === "hue_bridge" && d.height === 0 && d.rotation === 90) && exported.some((d) => d.height === 2.35), JSON.stringify(exported));

// Validation : valeurs piégées ou hors limites rejetées.
const validated = await page.evaluate(async () => {
  const { sanitizeConfig } = await import("/src/validate.ts");
  const r = sanitizeConfig({
    type: "custom:blueprint3d-card",
    devices: [
      { entity: "light.a", position: [1, 1], rotation: "90deg", height: 99 },
      { entity: "light.b", position: [1, 1], rotation: 1e9 },
      { entity: "light.c", position: [1, 1], rotation: 45.4, height: 1.1 },
      { entity: "light.d", position: [1, 1], rotation: 0 },
    ],
  });
  return (r.config ?? r).devices.map((d) => ({ r: d.rotation, h: d.height }));
});
check(
  "validation de la rotation / hauteur",
  // Texte refusé, hauteur bornée à 6 m, rotation ramenée entre -180° et 180°.
  validated[0].r === undefined && validated[0].h === 6 && Math.abs(validated[1].r ?? 0) <= 180 && validated[2].r === 45 && validated[2].h === 1.1 && validated[3].r === undefined,
  JSON.stringify(validated),
);

check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
