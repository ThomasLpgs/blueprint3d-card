import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";


const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);

const st = (id) => page.evaluate((id) => document.querySelector("blueprint3d-card")._hass.states[id]?.state, id);
const setState = (id, state, attrs) =>
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
const floorPx = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const c = document.querySelector("blueprint3d-card");
      const v = c.camera.position.clone().set(x, 0, y).project(c.camera);
      const r = c.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    [x, y],
  );

// ---------- 1. Fiche de pièce ----------
let p = await floorPx(3.0, 5.8); // Bureau, coin libre
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
const roomTitle = await page.locator(".room-panel:not(.hidden) .pn").textContent().catch(() => "");
check("clic sur le sol → fiche de la pièce", roomTitle === "Bureau", roomTitle);
const rows = await page.locator(".room-panel .room-row").count();
check("appareils de la pièce listés", rows >= 1, `${rows} appareil(s)`);
// Séjour : tout éteindre
p = await floorPx(7.0, 7.5);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
check("fiche du séjour", (await page.locator(".room-panel:not(.hidden) .pn").textContent()) === "Séjour");
const chips = await page.locator(".room-panel .chip-info").allTextContents();
check("température affichée", chips.some((c) => c.includes("°C")), chips.join(" | "));
await page.locator(".room-panel [data-act=all-off]").click();
await page.waitForTimeout(400);
const after = await Promise.all(["light.salon", "light.salle_a_manger"].map(st));
check("« Tout éteindre » éteint les lampes de la pièce", after.every((s) => s === "off"), after.join(","));
await page.locator(".room-panel [data-act=all-on]").click();
await page.waitForTimeout(400);
check("« Tout allumer »", (await st("light.salon")) === "on");
// Appareil protégé par confirmation : exclu si on refuse
await page.evaluate(() => (document.querySelector("blueprint3d-card").devices.find((d) => d.entity === "light.salon").confirm = true));
page.once("dialog", (d) => d.dismiss());
await page.locator(".room-panel [data-act=all-off]").click();
await page.waitForTimeout(400);
check("appareil « à confirmer » épargné si refus", (await st("light.salon")) === "on" && (await st("light.cuisine")) === "off");
await page.locator(".room-panel [data-act=close]").click();

// ---------- 2. Scènes ----------
const scenes = await page.locator(".scenes .scene").allTextContents();
check("barre de scènes", scenes.length === 3, scenes.map((s) => s.trim()).join(" | "));
const before = await st("scene.soiree");
await page.locator(".scenes .scene", { hasText: "Soirée" }).click();
await page.waitForTimeout(300);
check("clic sur une scène → scene.turn_on", (await st("scene.soiree")) !== before);

// ---------- 3. Portes / fenêtres + alerte ----------
const opening = () =>
  page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const o = c.house.openings.find((o) => o.cfg.sensor === "binary_sensor.baie_terrasse");
    return { open: o.open, target: o.target, alert: !c.shadowRoot.querySelector(".alert").hidden };
  });
let o = await opening();
check("baie ouverte (capteur on) + alerte clim", o.target === 1 && o.alert, JSON.stringify(o));
await setState("binary_sensor.baie_terrasse", "off");
await page.waitForTimeout(4000);
o = await opening();
check("capteur off → baie se referme, alerte levée", o.target === 0 && o.open < 0.1 && !o.alert, JSON.stringify(o));
await setState("binary_sensor.baie_terrasse", "on");
await setState("climate.salon", "off");
await page.waitForTimeout(200);
o = await opening();
check("clim éteinte → pas d'alerte", o.target === 1 && !o.alert, JSON.stringify(o));
const doors = await page.evaluate(() => document.querySelector("blueprint3d-card").house.openings.filter((o) => o.cfg.type === "door").map((o) => o.open));
check("portes intérieures ouvertes par défaut", doors.filter((v) => v === 1).length >= 5, doors.join(","));

// ---------- 4. Carte de chaleur ----------
await page.locator("[data-act=heat]").click();
await page.waitForTimeout(300);
const heat = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const f = c.house.floors.get("Salle de bain")[0];
  return { legend: !c.shadowRoot.querySelector(".legend").hidden, tinted: !f.mat.color.equals(f.base), label: c.shadowRoot.querySelector(".toolbar [data-act=heat]").textContent };
});
check("mode température : légende + sols teintés", heat.legend && heat.tinted, heat.label);
await page.screenshot({ path: `${out}/feat-heat.png` });
await page.locator("[data-act=heat]").click();
await page.waitForTimeout(300);
const hum = await page.evaluate(() => [...document.querySelector("blueprint3d-card").shadowRoot.querySelectorAll(".room-label")].map((l) => l.textContent).find((t) => t.includes("Salle de bain")));
check("mode humidité : valeur dans l'étiquette", hum?.includes("68"), hum);
// humidité → énergie → normal
await page.locator("[data-act=heat]").click();
await page.locator("[data-act=heat]").click();
const reset = await page.evaluate(() => {
  const f = document.querySelector("blueprint3d-card").house.floors.get("Salle de bain")[0];
  return f.mat.color.equals(f.base);
});
check("retour au rendu normal", reset);

// ---------- 5. Présence ----------
const persons = await page.locator(".person").allTextContents();
const homeCount = await page.locator(".person.home").count();
check("personnes affichées", persons.length === 2 && homeCount === 1, persons.join(" | "));
await page.waitForTimeout(800);
const glow = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  return Object.fromEntries([...c.roomGlow.entries()].map(([k, v]) => [k, Math.round(v * 100) / 100]));
});
const glowRoom = Object.entries(glow).find(([, v]) => v > 0.3)?.[0];
check("mouvement → la pièce s'illumine", !!glowRoom, JSON.stringify(glow));
await setState("binary_sensor.mouvement_couloir", "off");
await page.waitForTimeout(9000);
const glow2 = await page.evaluate((r) => document.querySelector("blueprint3d-card").roomGlow.get(r), glowRoom);
check("fin du mouvement → la lueur s'éteint", glow2 < 0.1, String(glow2));

// ---------- Sécurité ----------
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const h = c._hass;
  const XSS = '<img src=x onerror="window.__xss=1">';
  h.states["person.thomas"] = { ...h.states["person.thomas"], attributes: { friendly_name: XSS, entity_picture: "javascript:alert(1)" } };
  h.states["scene.cinema"] = { ...h.states["scene.cinema"], attributes: { friendly_name: XSS } };
  h.states["sensor.temperature_salon"] = { ...h.states["sensor.temperature_salon"], state: "<b>22</b>" };
  c.config.scenes.push({ entity: "scene.cinema", name: XSS, icon: XSS });
  c.hass = { ...h, states: { ...h.states } };
});
await page.waitForTimeout(300);
p = await floorPx(7.0, 7.5);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(300);
const sec = await page.evaluate(() => ({
  xss: window.__xss,
  img: [...document.querySelector("blueprint3d-card").shadowRoot.querySelectorAll(".person img")].map((i) => i.getAttribute("src")),
}));
check("aucune injection (personnes, scènes, pièces)", !sec.xss && !sec.img.some((s) => s?.startsWith("javascript")), JSON.stringify(sec));
const badScene = await page.evaluate(async () => {
  const c = document.querySelector("blueprint3d-card");
  const calls = [];
  const orig = c._hass.callService;
  c._hass.callService = async (...a) => (calls.push(a), orig.apply(c._hass, a));
  const fake = document.createElement("button");
  c.runScene("lock.porte_entree", fake);
  c.runScene("scene.inexistante", fake);
  c._hass.callService = orig;
  return calls.length;
});
check("scènes : seules scene.*/script.* existantes sont lancées", badScene === 0, `${badScene} appel(s)`);

await page.screenshot({ path: `${out}/feat-final.png` });
check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
