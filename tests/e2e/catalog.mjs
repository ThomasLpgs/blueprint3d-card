import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Catalogue complet : chaque objet de la bibliothèque se construit en 3D, recherche par référence, filtre par marque.
const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push("console: " + m.text()));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison&night`);
await page.waitForTimeout(2500);

// 1. Tous les objets, posés en grille dans le séjour, non reliés puis reliés à une entité allumée.
const built = await page.evaluate(async () => {
  const c = document.querySelector("blueprint3d-card");
  const { DEVICE_ITEMS } = await import("/src/catalog.ts");
  const before = c.devices.length;
  DEVICE_ITEMS.forEach((item, i) => {
    c.devices.push({ entity: "", model: item.id, type: item.kind, position: [5.5 + (i % 16) * 0.25, 3.2 + Math.floor(i / 16) * 0.25] });
  });
  c.buildDevices();
  const shapes = new Set(DEVICE_ITEMS.map((i) => i.shape));
  return { items: DEVICE_ITEMS.length, shapes: shapes.size, views: c.views.length - before };
});
check("chaque objet du catalogue se construit en 3D", built.views === built.items, JSON.stringify(built));
check("catalogue fourni (≥ 200 objets, ≥ 50 formes)", built.items >= 200 && built.shapes >= 50, JSON.stringify(built));
await page.waitForTimeout(500);
check("aucune erreur à la construction", errors.length === 0, errors.slice(0, 3).join(" | "));

// États « allumés » : lampes, serrure, fuite, rideau, ventilateur… sans erreur.
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  for (const v of c.views) {
    if (v.cfg.entity) continue;
    const st = { light: "on", fan: "on", switch: "on", cover: "closed", climate: "heat", media_player: "playing", camera: "streaming", vacuum: "docked", sensor: "on" }[v.kind];
    v.update({ entity_id: "x.y", state: v.shape === "lock" ? "unlocked" : st, attributes: { brightness: 200, rgb_color: [255, 120, 40], current_position: 30, percentage: 80 } });
  }
});
await page.waitForTimeout(1200);
check("animations des états actifs sans erreur", errors.length === 0, errors.slice(0, 3).join(" | "));
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.controls.target.set(7.4, 0.8, 4.4);
  c.camera.position.set(7.4, 4.2, 9.5);
  c.controls.update();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/catalog-all.png` });

// 2. Recherche par référence produit et par mot-clé.
await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2000);
await page.locator("[data-act=edit]").click();
await page.locator("[data-act=library]").click();
const search = async (q) => {
  await page.locator(".library input[type=search]").fill(q);
  await page.waitForTimeout(100);
  return (await page.locator(".lib-item .nm").allTextContents()).map((t) => t.trim());
};
for (const [q, expect] of [
  ["tagarp", "TÅGARP"],
  ["TÅGARP liseuse", "TÅGARP"],
  ["p1002", "Tapo P100"],
  ["T300", "Tapo T300"],
  ["7602031P7", "Hue Go portable"],
  ["8719514274617", "Hue Dimmer Switch"],
  ["pack x2 play", "Hue Play"],
  ["angle govee", "Govee lampadaire d'angle"],
  ["ruban diffuseurs", "Govee ruban RGBIC avec diffuseurs"],
  ["fuite", "Tapo T300"],
  ["serrure", "Nuki"],
  ["linky", "Compteur Linky"],
]) {
  const r = await search(q);
  check(`recherche « ${q} »`, r.some((n) => n.includes(expect)), r.slice(0, 4).join(" | "));
}

// 3. Filtre par marque (liste déroulante).
await search("");
await page.locator(".lib-brand").selectOption("IKEA");
await page.waitForTimeout(100);
const ikea = await page.locator(".lib-item .br").allTextContents();
check("filtre marque IKEA", ikea.length >= 10 && ikea.every((b) => b === "IKEA"), `${ikea.length} objets`);
await page.locator(".lib-cats [data-cat=security]").click();
const sec = await page.locator(".lib-item .nm").allTextContents();
check("catégorie Sécurité + marque gardée", sec.length === 0 || sec.every((n) => /DIRIGERA|serrure|sonnette/i.test(n)), sec.join(" | "));
await page.locator(".lib-brand").selectOption("all");
await page.waitForTimeout(100);
const allSec = await page.locator(".lib-item .nm").allTextContents();
check("catégorie Sécurité (toutes marques)", allSec.length >= 10 && allSec.some((n) => n.includes("Nuki")), `${allSec.length} objets`);
await page.screenshot({ path: `${out}/catalog-library.png` });

// 4. Pose du TÅGARP depuis la bibliothèque.
await page.locator(".lib-cats [data-cat=all]").click();
await search("tagarp");
await page.locator(".lib-item", { hasText: "TÅGARP" }).click();
const p = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const v = c.camera.position.clone().set(8.5, 0, 5.2).project(c.camera);
  const r = c.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
});
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
const last = await page.evaluate(() => document.querySelector("blueprint3d-card").devices.at(-1));
check("TÅGARP posé au sol", last?.model === "ikea_tagarp" && last.type === "light", JSON.stringify(last));
// Pas d'intégration imposée : les suggestions proposent toutes les lampes (ampoule Hue, Tapo… dans le lampadaire).
const groups = await page.locator(".panel select[data-field=link] optgroup").evaluateAll((gs) => gs.map((g) => g.label));
check("liaison proposée pour le TÅGARP", groups.length > 0, groups.join(" | "));

// 5. Noms piégés : la bibliothèque échappe les noms.
const xss = await page.evaluate(async () => {
  const { DEVICE_ITEMS } = await import("/src/catalog.ts");
  return DEVICE_ITEMS.filter((i) => /[<>"]/.test(i.name + i.brand + (i.aliases ?? ""))).map((i) => i.id);
});
check("aucun caractère HTML dans le catalogue", xss.length === 0, xss.join(","));

check("aucune erreur JS", errors.length === 0, errors.slice(0, 5).join(" | "));
await browser.close();
