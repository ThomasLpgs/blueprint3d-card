import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Téléphone : étiquettes sans chevauchement, appui tolérant, cadrage et décalage en mode édition.
const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);
const idle = () => page.waitForFunction(() => !document.querySelector("blueprint3d-card").camAnim);

// ---------- 1. Étiquettes ----------
const labels = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const root = c.shadowRoot;
  const shown = [...root.querySelectorAll(".dev-label")].filter((l) => l.parentElement.style.display !== "none" && !l.classList.contains("culled"));
  const rooms = [...root.querySelectorAll(".room-label")].filter((l) => l.style.display !== "none" && !l.classList.contains("culled"));
  const rect = (l) => l.getBoundingClientRect();
  const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
  let devPairs = 0;
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (overlap(rect(shown[i]), rect(shown[j]))) devPairs++;
  let roomPairs = 0;
  for (const r of rooms) for (const d of shown) if (overlap(rect(r), rect(d))) roomPairs++;
  return {
    narrow: root.querySelector(".stage").classList.contains("narrow"),
    total: root.querySelectorAll(".dev-label").length,
    full: shown.filter((l) => !l.classList.contains("mini")).length,
    mini: shown.filter((l) => l.classList.contains("mini")).length,
    devPairs,
    roomPairs,
  };
});
check("mode téléphone détecté", labels.narrow);
check("aucune étiquette d'appareil ne se chevauche", labels.devPairs === 0, JSON.stringify(labels));
check("aucun nom de pièce sous une étiquette", labels.roomPairs === 0);
check("seulement 3 étiquettes dépliées sur téléphone, le reste en pastilles", labels.full === 3 && labels.mini > 0, `${labels.full} dépliées, ${labels.mini} pastilles / ${labels.total}`);
// Les 3 dépliées sont les plus proches de la caméra (premier plan).
const nearest = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const shown = c.views.filter((v) => v.label.element.style.display !== "none");
  const byDist = [...shown].sort((a, b) => a.group.position.distanceTo(c.camera.position) - b.group.position.distanceTo(c.camera.position));
  const full = shown.filter((v) => !v.labelEl.classList.contains("mini") && !v.labelEl.classList.contains("culled"));
  // Chaque étiquette dépliée est parmi les plus proches (une proche peut être masquée par chevauchement).
  const rank = full.map((v) => byDist.indexOf(v));
  return { rank, names: full.map((v) => v.cfg.entity) };
});
check("les étiquettes dépliées sont au premier plan", nearest.rank.every((r) => r < 6), JSON.stringify(nearest));
// Option max_labels : 0 → toutes en pastilles.
const zero = await page.evaluate(async () => {
  const c = document.querySelector("blueprint3d-card");
  c.config.max_labels = 0;
  c.declutter(true);
  const n = [...c.shadowRoot.querySelectorAll(".dev-label")].filter((l) => l.parentElement.style.display !== "none" && !l.classList.contains("mini") && !l.classList.contains("culled")).length;
  delete c.config.max_labels;
  c.declutter(true);
  return n;
});
check("option max_labels respectée", zero === 0, String(zero));
await page.screenshot({ path: `${out}/mobile-labels.png` });

// ---------- 2. Appui à côté d'une lampe ----------
// Point à l'écran de la lampe de la cuisine, décalé de 18 px. Les étiquettes sont masquées le temps du test :
// le navigateur « aimante » sinon l'appui vers l'étiquette voisine (comportement normal d'un téléphone).
const tapAt = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.shadowRoot.querySelector(".labels").style.display = "none";
  const v = c.views.find((v) => v.cfg.entity === "light.cuisine");
  const r = c.renderer.domElement.getBoundingClientRect();
  const p = v.pickables[0].getWorldPosition(v.group.position.clone()).project(c.camera);
  const x = r.left + ((p.x + 1) / 2) * r.width;
  const y = r.top + ((1 - p.y) / 2) * r.height;
  for (const [dx, dy] of [[18, 0], [-18, 0], [0, 18], [13, 13], [-13, 13]]) {
    const el = c.shadowRoot.elementFromPoint(x + dx, y + dy);
    if (el?.tagName === "CANVAS") return { x: x + dx, y: y + dy };
  }
  return null;
});
const before = await page.evaluate(() => document.querySelector("blueprint3d-card")._hass.states["light.cuisine"].state);
if (tapAt) {
  await page.touchscreen.tap(tapAt.x, tapAt.y);
  await page.waitForTimeout(400);
}
const afterTap = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.shadowRoot.querySelector(".labels").style.display = "";
  return c._hass.states["light.cuisine"].state;
});
check("appui à 18 px de la lampe → bascule", !!tapAt && afterTap !== before, `${before} → ${afterTap}`);

// ---------- 3. Édition : cadrage face au mur ----------
await page.locator("[data-act=edit]").tap();
await page.waitForTimeout(300);
const overview = await page.evaluate(() => document.querySelector("blueprint3d-card").camera.position.toArray());
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.openPanel(c.views.find((v) => v.cfg.entity === "climate.salon"));
});
await page.waitForTimeout(100);
await idle();
const focus = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const v = c.views.find((v) => v.cfg.entity === "climate.salon");
  const cam = c.camera.position;
  const dev = v.group.position;
  const panel = c.shadowRoot.querySelector(".panel").getBoundingClientRect();
  const stage = c.shadowRoot.querySelector(".stage").getBoundingClientRect();
  const p = dev.clone().setY(v.effectiveHeight).project(c.camera);
  return {
    dx: cam.x - dev.x,
    dz: cam.z - dev.z,
    dist: cam.distanceTo(dev),
    devX: dev.x,
    devZ: dev.z,
    screenY: stage.top + ((1 - p.y) / 2) * stage.height,
    panelTop: panel.top,
    panelBottom: panel.bottom,
    stageBottom: stage.bottom,
  };
});
// La clim est sur le mur est (x = 11,5) : la caméra doit être côté pièce (x plus petit), en face.
check("caméra face au mur de la clim", focus.dx < -1 && Math.abs(focus.dz) < 0.3, JSON.stringify(focus));
const overviewDist = Math.hypot(...overview.map((v, i) => v - [focus.devX, 0, focus.devZ][i]));
check("caméra rapprochée", focus.dist < overviewDist * 0.6, `${focus.dist.toFixed(2)} m (vue d'ensemble : ${overviewDist.toFixed(2)} m)`);
check("fiche en bas de l'écran", focus.panelBottom > focus.stageBottom - 20 && focus.panelTop > 200, `${focus.panelTop}–${focus.panelBottom}`);
check("objet visible au-dessus de la fiche", focus.screenY > 150 && focus.screenY < focus.panelTop - 20, `y=${Math.round(focus.screenY)}`);
await page.screenshot({ path: `${out}/mobile-focus.png` });

// ---------- 4. Décaler ----------
const pos = () => page.evaluate(() => {
  const d = document.querySelector("blueprint3d-card").devices.find((d) => d.entity === "climate.salon");
  return { x: d.position[0], y: d.position[1], h: d.height };
});
const p0 = await pos();
await page.locator(".panel [data-act=nudge][data-dx='1']").tap();
await page.waitForTimeout(150);
const p1 = await pos();
await page.locator(".panel [data-act=nudge][data-dx='-1']").tap();
await page.locator(".panel [data-act=nudge][data-dx='-1']").tap();
await page.waitForTimeout(150);
const p2 = await pos();
check("▶ décale de 5 cm le long du mur", p1.x === p0.x && Math.abs(Math.abs(p1.y - p0.y) - 0.05) < 1e-6, `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
check("◀ repart dans l'autre sens", Math.abs(p2.y - (p0.y - (p1.y - p0.y))) < 1e-6, JSON.stringify(p2));
await page.locator(".panel [data-act=nudge][data-dh='1']").tap();
await page.waitForTimeout(150);
const p3 = await pos();
check("▲ monte de 5 cm", p3.h !== undefined && Math.abs(p3.h - ((p0.h ?? p3.h - 0.05) + 0.05)) < 1e-6, `${p0.h} → ${p3.h}`);
const dirty = await page.evaluate(() => document.querySelector("blueprint3d-card").dirty);
check("modification à enregistrer", dirty);

// ---------- 5. Retour à la vue d'ensemble ----------
await page.locator(".panel [data-act=close]").tap();
await page.waitForTimeout(100);
await idle();
const back = await page.evaluate(() => document.querySelector("blueprint3d-card").camera.position.toArray());
check("fermer la fiche → vue d'ensemble", back.every((v, i) => Math.abs(v - overview[i]) < 0.05), JSON.stringify(back.map((v) => +v.toFixed(2))));

check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
