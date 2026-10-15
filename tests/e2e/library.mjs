import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";


const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push("console: " + m.text()));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison&night`);
await page.waitForTimeout(2000);
await page.locator("[data-act=edit]").click();
await page.waitForTimeout(300);

// Point du sol (x, y du plan) → pixel à l'écran
const floorPx = async (x, y, h = 0) => {
  await page.waitForFunction(() => !document.querySelector("blueprint3d-card").camAnim);
  return page.evaluate(
    ([x, y, h]) => {
      const c = document.querySelector("blueprint3d-card");
      const v = c.camera.position.clone().set(x, h, y).project(c.camera);
      const r = c.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, y, h],
  );
};
const devices = () => page.evaluate(() => document.querySelector("blueprint3d-card").devices.map((d) => ({ ...d })));

// 1. Bibliothèque
await page.locator("[data-act=library]").click();
const total = await page.locator(".lib-item").count();
check("bibliothèque ouverte", total > 60, `${total} objets`);
await page.locator(".lib-cats [data-cat=pets]").click();
const pets = await page.locator(".lib-item").allTextContents();
check("catégorie Animaux avec litière", pets.some((t) => t.includes("Litter-Robot")), pets.map((t) => t.trim().replace(/\s+/g, " ")).join(" | "));
await page.locator(".lib-cats [data-cat=all]").click();
await page.locator(".library input[type=search]").fill("hue go");
const found = await page.locator(".lib-item").allTextContents();
check("recherche « hue go »", found.length >= 1 && found[0].includes("Hue Go"), found.map((t) => t.trim().replace(/\s+/g, " ")).join(" | "));

// 2. Pose d'une Hue Go dans le séjour (3D) puis liaison
await page.locator(".lib-item", { hasText: "Hue Go" }).first().click();
let p = await floorPx(7.6, 5.6);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
let list = await devices();
let last = list[list.length - 1];
check("Hue Go posée (non reliée)", last.model === "hue_go" && last.entity === "", JSON.stringify(last));
const groups = await page.locator(".panel select[data-field=link] optgroup").evaluateAll((gs) => gs.map((g) => g.label + ": " + [...g.children].map((o) => o.value).slice(0, 3).join(",")));
check("suggestions Hue en premier", groups[0]?.includes("light.hue_go_salon"), groups[0]);
await page.locator(".panel select[data-field=link]").selectOption("light.hue_go_salon");
await page.waitForTimeout(300);
list = await devices();
check("Hue Go reliée", list[list.length - 1].entity === "light.hue_go_salon");
const goLabel = await page.evaluate(() => [...document.querySelector("blueprint3d-card").shadowRoot.querySelectorAll(".dev-label")].map((l) => l.textContent.trim()).filter((t) => t.includes("Go")));
check("étiquette mise à jour", goLabel.some((t) => t.includes("Hue Go salon")), JSON.stringify(goLabel));

// 3. Plusieurs objets en 3D : Govee Hexa, ruban Tapo, rétroéclairage TV, caméra, capteur
const place = async (search, x, y, entity) => {
  await page.locator("[data-act=library]").click();
  await page.locator(".library input[type=search]").fill(search);
  await page.locator(".lib-item").first().click();
  const pt = await floorPx(x, y);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(250);
  if (entity) await page.locator(".panel select[data-field=link]").selectOption(entity);
  await page.waitForTimeout(250);
  const l = await devices();
  return l[l.length - 1];
};
const hexa = await place("hexa", 5.4, 3.9, "light.govee_hexa");
check("Govee Hexa", hexa.model === "govee_hexa" && hexa.entity === "light.govee_hexa");
const strip = await place("L900", 2.0, 8.8, "light.ruban_led_tapo");
check("ruban Tapo L900", strip.model === "tapo_l900");
const tv = await place("Envisual", 9.6, 3.9, "light.govee_tv_backlight");
check("rétroéclairage Govee TV", tv.model === "govee_tv");
const cam = await place("C200", 11.3, 8.8, "camera.tapo_c200_salon");
check("caméra Tapo C200", cam.model === "tapo_c200");
const camImg = await page.locator(".panel img.cam").count();
check("aperçu caméra dans la fiche", camImg === 1);
const motion = await page.locator("[data-act=library]").click().then(() => null);
void motion;
await page.locator(".library input[type=search]").fill("fauteuil");
await page.locator(".lib-item").first().click();
const furnBefore = await page.evaluate(() => document.querySelector("blueprint3d-card").config.furniture.length);
p = await floorPx(8.2, 6.6);
const under = await page.evaluate(([x, y]) => { const el = document.querySelector("blueprint3d-card").shadowRoot.elementFromPoint(x, y); return el.tagName + "." + el.className; }, [p.x, p.y]);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(500);
const furnAfter = await page.evaluate(() => document.querySelector("blueprint3d-card").config.furniture);
check("fauteuil ajouté en 3D", furnAfter.length === furnBefore + 1 && furnAfter.at(-1).type === "armchair");
await page.locator("[data-act=close]").first().click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/lib-3d.png` });

// 4. Litière depuis l'onglet Plan
await page.locator("[data-tab=plan]").click();
await page.waitForTimeout(300);
await page.locator("[data-act=library]").click();
await page.locator(".lib-cats [data-cat=pets]").click();
await page.locator(".library input[type=search]").fill("");
await page.locator(".lib-item", { hasText: "Litter-Robot" }).click();
const pt = await page.evaluate(() => {
  const ed = document.querySelector("blueprint3d-card").editor;
  const r = ed.canvas.getBoundingClientRect();
  return { x: r.left + 5.7 * ed.scale + ed.ox, y: r.top + 7.1 * ed.scale + ed.oy };
});
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(300);
const litterOpts = await page.locator(".plan-props select[data-prop=entity] optgroup").first().evaluate((g) => [...g.children].map((o) => o.value));
check("suggestions Litter-Robot", litterOpts.includes("vacuum.litter_robot_4"), litterOpts.join(","));
await page.locator(".plan-props select[data-prop=entity]").selectOption("vacuum.litter_robot_4");
list = await devices();
last = list[list.length - 1];
check("litière posée et reliée", last.model === "litter_robot_4" && last.entity === "vacuum.litter_robot_4", JSON.stringify(last));
await page.screenshot({ path: `${out}/lib-plan.png` });

// 5. Retour en 3D + fiche litière (commandes « vacuum »)
await page.locator("[data-tab=devices]").click();
await page.waitForTimeout(800);
await page.locator(".dev-label", { hasText: "Litter-Robot 4" }).click();
await page.waitForTimeout(300);
const litterBtns = await page.locator(".panel [data-svc]").allTextContents();
check("fiche litière avec commandes", litterBtns.some((t) => t.includes("Démarrer")), litterBtns.join(" | "));

// 6. Enregistrement
await page.locator("[data-act=save]").click();
await page.waitForTimeout(800);
const saved = await page.evaluate(() => window.dashboard().views[0].cards[0].devices.filter((d) => d.model));
check("modèles enregistrés", saved.length >= 6, saved.map((d) => `${d.model}=${d.entity}`).join(", "));

// Terminer et capture finale
await page.locator("[data-act=edit]").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/lib-final.png` });
console.log(errors.length ? "ERREURS:\n" + errors.join("\n") : "aucune erreur console");
await browser.close();
