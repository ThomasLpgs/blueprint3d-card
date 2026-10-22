import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Annulation : bouton flèche et Ctrl+Z après un déplacement, une suppression, une modification du plan 2D.
const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);
await page.locator("[data-act=edit]").click();
await page.waitForTimeout(300);
const undoBtn = page.locator(".editbar [data-act=undo]");
check("bouton annuler inactif au départ", await undoBtn.isDisabled());

const ENTITY = "light.salon";
const pos = () => page.evaluate((id) => document.querySelector("blueprint3d-card").devices.find((d) => d.entity === id).position.join(","), ENTITY);
// Point à l'écran de la zone cliquable de l'appareil.
const screenOf = () =>
  page.evaluate((id) => {
    const c = document.querySelector("blueprint3d-card");
    const v = c.views.find((v) => v.cfg.entity === id);
    const p = v.pickables[0].getWorldPosition(new v.group.position.constructor()).project(c.camera);
    const r = c.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }, ENTITY);

// 1. Glisser un appareil, puis annuler avec la flèche.
const before = await pos();
const s = await screenOf();
await page.mouse.move(s.x, s.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(s.x + i * 12, s.y + i * 6);
await page.mouse.up();
await page.waitForTimeout(300);
const moved = await pos();
check("appareil déplacé à la souris", moved !== before, `${before} → ${moved}`);
check("bouton annuler actif après le déplacement", await undoBtn.isEnabled());
await undoBtn.click();
await page.waitForTimeout(300);
check("flèche annuler : position d'origine", (await pos()) === before, await pos());
check("plus rien à annuler", await undoBtn.isDisabled());

// 2. Supprimer un appareil, puis Ctrl+Z.
const count = () => page.evaluate(() => document.querySelector("blueprint3d-card").devices.length);
const n0 = await count();
await page.evaluate((id) => {
  const c = document.querySelector("blueprint3d-card");
  c.removeDevice(c.devices.find((d) => d.entity === id));
}, ENTITY);
check("appareil supprimé", (await count()) === n0 - 1);
await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
const restored = await page.evaluate((id) => {
  const c = document.querySelector("blueprint3d-card");
  return { cfg: c.devices.some((d) => d.entity === id), view: c.views.some((v) => v.cfg.entity === id) };
}, ENTITY);
check("Ctrl+Z : appareil revenu (config + 3D)", (await count()) === n0 && restored.cfg && restored.view, JSON.stringify(restored));

// 3. Plan 2D : déplacer une pièce au clavier, Ctrl+Z la remet en place.
await page.locator("[data-tab=plan]").click();
await page.waitForTimeout(400);
const room0 = () => page.evaluate(() => document.querySelector("blueprint3d-card").config.rooms[0].x);
const x0 = await room0();
await page.evaluate(() => {
  const ed = document.querySelector("blueprint3d-card").editor;
  ed.sel = { kind: "room", index: 0 };
  ed.el.focus();
});
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
const x1 = await room0();
check("pièce décalée dans le plan", x1 > x0, `${x0} → ${x1}`);
await page.keyboard.press("Control+z");
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
const x2 = await room0();
const drawn = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  return c.editor.data.rooms === c.config.rooms;
});
check("Ctrl+Z ×2 : pièce revenue, plan à jour", x2 === x0 && drawn, `${x2}`);

// 4. Ctrl+Z dans un champ texte : laissé au navigateur.
await page.locator("[data-tab=devices]").click();
await page.waitForTimeout(600);
const stack = () => page.evaluate(() => document.querySelector("blueprint3d-card").undoStack.length);
await page.evaluate(() => document.querySelector("blueprint3d-card").devices[0].position[0] += 0.5);
await page.evaluate(() => document.querySelector("blueprint3d-card").markDirty());
const before4 = await stack();
await page.locator("[data-act=settings]").click();
await page.locator('.modal input[data-k="title"]').focus();
await page.keyboard.press("Control+z");
check("Ctrl+Z dans un champ : pas d'annulation du plan", (await stack()) === before4, `${before4}`);
await page.screenshot({ path: `${out}/undo.png` });

console.log(errors.length ? "ERREURS:\n" + errors.join("\n") : "aucune erreur console");
await browser.close();
