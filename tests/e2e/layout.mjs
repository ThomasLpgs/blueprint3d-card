import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Mise en page dans HA : la carte ne doit jamais grandir toute seule (mode édition du tableau de bord).
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
const errors = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/dev/index.html?plan=maison`);
await page.waitForTimeout(2500);

const size = () =>
  page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), dist: Math.round(c.camera.position.distanceTo(c.controls.target) * 100) / 100 };
  });
const before = await size();

// Comme le mode édition de HA : la carte est placée dans un conteneur sans hauteur, avec bordure et marge.
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const wrap = c.parentElement;
  wrap.style.height = "auto";
  const edit = document.createElement("div");
  edit.id = "edit-wrapper";
  edit.style.cssText = "border:2px dashed #888;padding:6px;height:auto;overflow:visible";
  wrap.replaceChild(edit, c);
  edit.appendChild(c);
  // Un élément dans le flux sous le canvas (thème ou carte-mod qui ajoute un liseré, etc.) :
  // avec un canvas dans le flux, chaque redimensionnement agrandissait la carte de quelques pixels.
  const extra = document.createElement("div");
  extra.id = "extra";
  extra.style.height = "4px";
  c.shadowRoot.querySelector(".stage").appendChild(extra);
});
await page.waitForTimeout(400);
const s1 = await size();
await page.waitForTimeout(1500);
const s2 = await size();
check("mode édition HA : la hauteur ne grandit pas en boucle", s1.h === s2.h && s2.h < 900, `${s1.h} → ${s2.h} px`);
check("mode édition HA : la vue n'est pas zoomée à l'infini", s2.dist < before.dist * 3, `${before.dist} → ${s2.dist}`);

// Retour à l'affichage normal (« Terminé ») : la vue se recadre sans recharger la page.
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const edit = document.getElementById("edit-wrapper");
  edit.parentElement.style.height = "";
  edit.parentElement.replaceChild(c, edit);
  c.shadowRoot.getElementById("extra").remove();
});
await page.waitForTimeout(800);
const s3 = await size();
check("sortie du mode édition : taille d'origine", Math.abs(s3.h - before.h) <= 2 && Math.abs(s3.w - before.w) <= 2, `${before.w}x${before.h} → ${s3.w}x${s3.h}`);
check("sortie du mode édition : vue recadrée comme au départ", Math.abs(s3.dist - before.dist) < 0.05, `${before.dist} → ${s3.dist}`);
const canvas = await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  const cv = c.shadowRoot.querySelector(".stage > canvas.gl");
  const st = c.shadowRoot.querySelector(".stage").getBoundingClientRect();
  const r = cv.getBoundingClientRect();
  return { cw: Math.round(r.width), ch: Math.round(r.height), sw: Math.round(st.width), sh: Math.round(st.height) };
});
check("le canvas 3D remplit exactement la zone", canvas.cw === canvas.sw && canvas.ch === canvas.sh, JSON.stringify(canvas));

// Une vue déplacée par l'utilisateur est conservée lors d'un redimensionnement.
// Sans inertie, pour comparer des positions figées (le rendu logiciel des tests est lent).
await page.evaluate(() => (document.querySelector("blueprint3d-card").controls.enableDamping = false));
await page.mouse.move(600, 450);
await page.mouse.down();
await page.mouse.move(700, 470, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(600);
const moved = await page.evaluate(() => document.querySelector("blueprint3d-card").camera.position.toArray().map((v) => Math.round(v * 100)));
await page.setViewportSize({ width: 1000, height: 800 });
await page.waitForTimeout(600);
const after = await page.evaluate(() => document.querySelector("blueprint3d-card").camera.position.toArray().map((v) => Math.round(v * 100)));
check("vue de l'utilisateur gardée au redimensionnement", moved.join() === after.join(), `${moved} / ${after}`);

check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
