import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";


const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({
  channel: CHANNEL,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
const card = () => page.evaluateHandle(() => document.querySelector("blueprint3d-card"));

await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);

// 1. Clic sur l'étiquette d'une lampe → fiche ; bouton → allume
await page.locator(".dev-label", { hasText: "Cuisine" }).click();
await page.waitForTimeout(300);
const panelVisible = await page.locator(".panel:not(.hidden)").count();
check("fiche ouverte au clic sur l'étiquette", panelVisible === 1);
await page.locator(".panel .switch").click();
await page.waitForTimeout(300);
const kitchenState = await page.evaluate(() => document.querySelector("blueprint3d-card")._hass.states["light.cuisine"].state);
check("lampe cuisine allumée via la fiche", kitchenState === "on", kitchenState);
await page.locator(".panel [data-act=close]").click();

// 2. Clic direct sur la lampe en 3D (projection de sa position à l'écran)
const salonPx = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const v = c.views.find((v) => v.cfg.entity === "light.salon");
  const p = v.pickables[0].getWorldPosition(new v.group.position.constructor());
  p.project(c.camera);
  const r = c.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
});
await page.mouse.click(salonPx.x, salonPx.y);
await page.waitForTimeout(300);
const salon = await page.evaluate(() => document.querySelector("blueprint3d-card")._hass.states["light.salon"].state);
check("clic 3D sur la lampe du salon → éteinte", salon === "off", salon);

// 3. Mode édition → onglet Plan
await page.locator("[data-act=edit]").click();
await page.locator("[data-tab=plan]").click();
await page.waitForTimeout(400);
const roomsBefore = await page.evaluate(() => document.querySelector("blueprint3d-card").config.rooms.length);
const toScreen = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const ed = document.querySelector("blueprint3d-card").editor;
      const r = ed.canvas.getBoundingClientRect();
      return { x: r.left + x * ed.scale + ed.ox, y: r.top + y * ed.scale + ed.oy };
    },
    [x, y],
  );

// Dessin d'une pièce de 2 × 2 m sous le bureau
await page.locator("[data-tool=room]").click();
let a = await toScreen(-1.5, 1);
let b = await toScreen(0.5, 3);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
await page.mouse.move(b.x, b.y, { steps: 4 });
await page.mouse.up();
const newRoom = await page.evaluate(() => {
  const r = document.querySelector("blueprint3d-card").config.rooms;
  return r[r.length - 1];
});
check("pièce dessinée", newRoom && newRoom.w === 2 && newRoom.d === 2 && newRoom.x === -1.5 && newRoom.y === 1, JSON.stringify(newRoom));

// Déplacement de la pièce de +1 m en x
a = await toScreen(-0.5, 2);
b = await toScreen(0.5, 2);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 6 });
await page.mouse.up();
const moved = await page.evaluate(() => {
  const r = document.querySelector("blueprint3d-card").config.rooms;
  return r[r.length - 1];
});
check("pièce déplacée", moved.x === -0.5, JSON.stringify(moved));

// Redimensionnement par la poignée est (x = 3 → 4)
a = await toScreen(1.5, 2);
b = await toScreen(2.5, 2);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 6 });
await page.mouse.up();
const resized = await page.evaluate(() => {
  const r = document.querySelector("blueprint3d-card").config.rooms;
  return r[r.length - 1];
});
check("pièce agrandie", resized.w === 3, JSON.stringify(resized));

// Renommage via le panneau
await page.locator(".plan-props input[data-prop=name]").fill("Cellier");
await page.locator(".plan-props input[data-prop=name]").press("Enter");
await page.locator(".plan-props input[data-prop=x]").click();
const renamed = await page.evaluate(() => {
  const r = document.querySelector("blueprint3d-card").config.rooms;
  return r[r.length - 1].name;
});
check("pièce renommée", renamed === "Cellier", renamed);

// Porte sur le mur haut de la nouvelle pièce
await page.locator("[data-tool=door]").click();
a = await toScreen(0.5, 3);
await page.mouse.click(a.x, a.y);
const door = await page.evaluate(() => {
  const o = document.querySelector("blueprint3d-card").config.openings;
  return o[o.length - 1];
});
check("porte posée sur le mur", door && door.y === 3 && door.type === "door", JSON.stringify(door));

// Meuble : une plante
await page.locator("select[data-act=ftype]").selectOption("plant");
a = await toScreen(0.5, 2);
await page.mouse.click(a.x, a.y);
const plant = await page.evaluate(() => {
  const f = document.querySelector("blueprint3d-card").config.furniture;
  return f[f.length - 1];
});
check("plante ajoutée", plant && plant.type === "plant", JSON.stringify(plant));

// Suppression au clavier
await page.keyboard.press("Delete");
const furnCount = await page.evaluate(() => document.querySelector("blueprint3d-card").config.furniture.length);
check("plante supprimée avec Suppr", !(await page.evaluate(() => document.querySelector("blueprint3d-card").config.furniture.some((f) => f.type === "plant"))), String(furnCount));

await page.screenshot({ path: `${out}/t-plan.png` });

// 4. Enregistrer → faux tableau de bord mis à jour
await page.locator("[data-act=save]").click();
await page.waitForTimeout(800);
const saved = await page.evaluate(() => window.dashboard().views[0].cards[0]);
check("enregistré dans le tableau de bord", saved.rooms.some((r) => r.name === "Cellier"), `rooms=${saved.rooms.length}`);
const status = await page.locator(".editbar .status").textContent();
check("statut « Enregistré »", /Enregistr/.test(status), status);

// 5. Retour en 3D : la nouvelle pièce est construite
await page.locator("[data-tab=devices]").click();
await page.waitForTimeout(1200);
const labels = await page.locator(".room-label").allTextContents();
check("pièce visible en 3D", labels.includes("Cellier"), labels.join(", "));
await page.screenshot({ path: `${out}/t-3d.png` });

console.log(errors.length ? "ERREURS:\n" + errors.join("\n") : "aucune erreur console");
void roomsBefore;
await browser.close();
