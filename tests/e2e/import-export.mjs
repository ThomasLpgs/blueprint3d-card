import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

import { readFileSync } from "node:fs";

const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
page.on("dialog", (d) => d.accept());

await page.goto(`${BASE}/dev/index.html?plan=maison&edit`);
await page.waitForTimeout(1800);
const state = () =>
  page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    return { rooms: c.config.rooms.length, openings: c.config.openings.length, furniture: c.config.furniture.length, devices: c.devices.length, names: c.config.rooms.map((r) => r.name), dirty: c.dirty, labels: c.shadowRoot.querySelectorAll(".room-label").length };
  });
const initial = await state();

// 1. Export → téléchargement d'un fichier .yaml
await page.locator("[data-act=export]").click();
const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".modal [data-act=download]").click()]);
const file = `${out}/export-test.yaml`;
await download.saveAs(file);
const yaml = readFileSync(file, "utf8");
check("export téléchargé", download.suggestedFilename() === "maison.yaml" && yaml.includes("rooms:") && yaml.includes("Séjour"), `${download.suggestedFilename()} · ${yaml.length} car.`);
await page.locator(".modal [data-act=close]").click();

// 2. On casse le plan, puis on réimporte le fichier exporté → retour à l'identique
await page.evaluate(() => {
  const c = document.querySelector("blueprint3d-card");
  c.config.rooms.splice(0, 5);
  c.devices.splice(0, 5);
});
const importText = async (text, viaFile = false) => {
  await page.locator("[data-act=import]").click();
  if (viaFile) await page.locator(".modal input[type=file]").setInputFiles({ name: "plan.yaml", mimeType: "text/yaml", buffer: Buffer.from(text) });
  else await page.locator(".modal textarea").fill(text);
  await page.waitForTimeout(150);
  await page.locator(".modal [data-act=do-import]").click();
  await page.waitForTimeout(600);
  const msg = (await page.locator(".modal").textContent()) ?? "";
  await page.locator(".modal [data-act=close]").first().click();
  return msg;
};
let msg = await importText(yaml, true);
let after = await state();
check("réimport du fichier exporté (via fichier)", msg.includes("Config importée") && after.rooms === initial.rooms && after.devices === initial.devices && after.openings === initial.openings && after.furniture === initial.furniture, JSON.stringify({ initial: [initial.rooms, initial.devices], after: [after.rooms, after.devices] }));
check("import → modifications non enregistrées", after.dirty === true);
check("3D reconstruite après import", after.labels >= 9, `${after.labels} pièces affichées`);

// 3. Import d'un tableau de bord complet (plusieurs cartes) en JSON
const dash = JSON.stringify({
  views: [
    { title: "Accueil", cards: [{ type: "entities", entities: ["light.salon"] }] },
    {
      title: "Maison",
      sections: [{ cards: [{ type: "custom:blueprint3d-card", title: "Studio", rooms: [{ name: "Studio", x: 0, y: 0, w: 5, d: 4 }], devices: [{ entity: "light.salon", position: [2, 2] }] }] }],
    },
  ],
});
msg = await importText(dash);
after = await state();
check("import d'un tableau de bord complet (JSON)", after.rooms === 1 && after.names[0] === "Studio" && after.devices === 1, JSON.stringify(after.names));

// 4. Erreurs et fichiers piégés
const tryBad = async (label, text, expect) => {
  await page.locator("[data-act=import]").click();
  await page.locator(".modal textarea").fill(text);
  await page.locator(".modal [data-act=do-import]").click();
  await page.waitForTimeout(200);
  const err = (await page.locator(".modal .error").textContent()) ?? "";
  await page.locator(".modal [data-act=close]").first().click();
  const s = await state();
  check(label, err.includes(expect) && s.rooms === 1, err);
};
await tryBad("YAML invalide refusé", "rooms: [ {name: 'a', x: 0", "invalide");
await tryBad("tag JavaScript refusé (!!js/function)", "rooms: !!js/function 'function(){ window.__pwn = 1 }'", "invalide");
await tryBad("config d'une autre carte refusée", "type: entities\nrooms: []", "autre carte");
await tryBad("liste refusée", "- a\n- b", "pas une liste");
await tryBad("texte sans plan refusé", "title: coucou", "Aucune config");
await tryBad("fichier trop gros refusé", "rooms: []\n# " + "x".repeat(5.5 * 1024 * 1024), "trop gros");

// 5. Pollution de prototype + injection HTML dans les noms
msg = await importText(`__proto__:\n  polluted: oui\nconstructor:\n  prototype:\n    polluted2: oui\nrooms:\n  - name: "<img src=x onerror=window.__xss=1>"\n    x: 0\n    y: 0\n    w: 3\n    d: 3\n    floor: "#fff\\"><img src=x onerror=window.__xss=2>"\n    __proto__: { evil: 1 }\ndevices:\n  - entity: "light.salon"\n    position: [1, 1]\n    name: "<b id=pwn>x</b>"`);
await page.locator("[data-tab=plan]").click();
await page.waitForTimeout(300);
const ed = await page.evaluate(() => {
  const e = document.querySelector("blueprint3d-card").editor;
  const r = e.canvas.getBoundingClientRect();
  return { x: r.left + 1.5 * e.scale + e.ox, y: r.top + 2.5 * e.scale + e.oy };
});
await page.mouse.click(ed.x, ed.y);
await page.waitForTimeout(200);
const sec = await page.evaluate(() => ({
  polluted: ({}).polluted ?? ({}).polluted2 ?? ({}).evil,
  xss: window.__xss,
  pwn: !!document.querySelector("blueprint3d-card").shadowRoot.querySelector("#pwn"),
  floor: document.querySelector("blueprint3d-card").config.rooms[0].floor,
}));
check("aucune pollution de prototype", sec.polluted === undefined);
check("aucune injection HTML depuis un import", !sec.xss && !sec.pwn, JSON.stringify(sec));
check("couleur piégée rejetée", sec.floor === undefined);
await page.locator("[data-tab=devices]").click();

// 6. Import puis Enregistrer → le tableau de bord est mis à jour
await importText(yaml);
await page.locator("[data-act=save]").click();
await page.waitForTimeout(800);
const saved = await page.evaluate(() => window.dashboard().views[0].cards[0].rooms.length);
check("import puis enregistrement", saved === initial.rooms, `rooms=${saved}`);

await page.screenshot({ path: `${out}/import.png` });
check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
