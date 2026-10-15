import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Hue Play Gradient Light Tube : posé sur un meuble sans être aspiré par le mur, visible, accrochable au mur.
const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);

await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);

// Le meuble TV du séjour : x 8,2 → 10, y 3,7 → 4,12, haut de 0,5 m ; mur du séjour en y = 3,6.
const add = (cfg) =>
  page.evaluate((cfg) => {
    const c = document.querySelector("blueprint3d-card");
    c.devices.push(cfg);
    c.buildDevices();
    const v = c.views.find((v) => v.cfg === cfg);
    const box = new v.group.position.constructor();
    const size = new v.group.position.constructor();
    // Boîte des objets visibles (sans la zone cliquable ni le halo).
    const parts = [];
    v.group.traverse((o) => o.isMesh && o.visible && o.geometry.type !== "PlaneGeometry" && parts.push(o));
    const b = parts.reduce((acc, m) => acc.expandByObject(m), new c.house.bounds.constructor());
    b.getSize(size);
    b.getCenter(box);
    return {
      shape: v.shape,
      x: v.group.position.x,
      z: v.group.position.z,
      rot: v.group.rotation.y,
      height: v.effectiveHeight,
      size: size.toArray().map((n) => +n.toFixed(3)),
      bottom: +b.min.y.toFixed(3),
    };
  }, cfg);

const onStand = await add({ entity: "", model: "hue_play_tube", type: "light", position: [9.1, 3.95] });
check("forme « tube » dédiée", onStand.shape === "tube", onStand.shape);
check("pas aspiré par le mur (reste sur le meuble)", Math.abs(onStand.z - 3.95) < 1e-6 && Math.abs(onStand.x - 9.1) < 1e-6, JSON.stringify(onStand));
check("posé sur le dessus du meuble TV (0,5 m)", Math.abs(onStand.height - 0.5) < 0.02 && Math.abs(onStand.bottom - 0.5) < 0.02, `h=${onStand.height}, bas=${onStand.bottom}`);
check("modèle visible : 75 cm de long, plus de 4 cm d'épaisseur", Math.abs(onStand.size[0] - 0.75) < 0.03 && onStand.size[1] > 0.04, JSON.stringify(onStand.size));

const large = await add({ entity: "", model: "hue_play_tube_large", type: "light", position: [6.0, 7.0] });
check("version large : 125 cm, posée au sol hors meuble", Math.abs(large.size[0] - 1.25) < 0.03 && large.height === 0, JSON.stringify(large));

const onWall = await add({ entity: "", model: "hue_play_tube", type: "light", position: [5.5, 3.68], height: 1.2 });
check("contre le mur (< 15 cm) : accroché, tourné vers la pièce", onWall.z > 3.6 && onWall.z < 3.7 && Math.abs(onWall.rot) < 1e-6, JSON.stringify(onWall));

const rotated = await add({ entity: "", model: "hue_play_tube", type: "light", position: [7.5, 6.5], rotation: 90 });
check("rotation libre", Math.abs(rotated.rot - Math.PI / 2) < 1e-6, String(rotated.rot));

// Les rubans gardent leur accroche au mur.
const strip = await add({ entity: "", model: "hue_lightstrip", type: "light", position: [9.1, 4.0] });
check("ruban LED toujours accroché au mur", strip.z < 3.7, JSON.stringify(strip));

// Fiche d'édition : la longueur se règle aussi pour le tube.
await page.locator("[data-act=edit]").click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.openPanel(c.views.find((v) => v.cfg.model === "hue_play_tube"));
});
await page.waitForTimeout(200);
check("longueur réglable dans la fiche", (await page.locator(".panel input[data-field=length]").count()) === 1);
await page.waitForFunction(() => !document.querySelector("blueprint3d-card").camAnim);
await page.screenshot({ path: `${out}/tube.png` });

check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
