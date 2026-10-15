import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";


const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
const XSS = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;

async function fresh(url = `${BASE}/dev/index.html?plan=maison`) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1500);
  return { page, errors };
}
const card = "document.querySelector('blueprint3d-card')";

// ---------- 1. Injection HTML via les entités (noms, attributs) ----------
{
  const { page, errors } = await fresh();
  await page.evaluate((XSS) => {
    const c = document.querySelector("blueprint3d-card");
    const h = c._hass;
    const st = h.states;
    st["light.salon"] = { ...st["light.salon"], attributes: { ...st["light.salon"].attributes, friendly_name: XSS, min_color_temp_kelvin: `1"><b id=pwn>`, color_temp_kelvin: XSS } };
    st["climate.salon"] = {
      ...st["climate.salon"],
      attributes: { ...st["climate.salon"].attributes, friendly_name: XSS, hvac_modes: ["cool", XSS], fan_modes: [XSS], target_temp_step: `1"><img src=x onerror=window.__xss=99>`, temperature: XSS },
    };
    st["media_player.tv"] = { ...st["media_player.tv"], attributes: { ...st["media_player.tv"].attributes, media_title: XSS, media_artist: XSS } };
    st["sensor.temperature_salon"] = { ...st["sensor.temperature_salon"], state: XSS, attributes: { unit_of_measurement: XSS, friendly_name: XSS } };
    st["camera.tapo_c200_salon"] = { ...st["camera.tapo_c200_salon"], attributes: { friendly_name: XSS, entity_picture: `x" onerror="window.__xss=7` } };
    c.hass = { ...h, states: { ...st } };
  }, XSS);
  await page.waitForTimeout(300);
  // Ouvre toutes les fiches via les étiquettes
  const n = await page.locator(".dev-label").count();
  for (let i = 0; i < n; i++) {
    await page.locator(".dev-label").nth(i).click({ force: true }).catch(() => {});
    await page.waitForTimeout(60);
  }
  // Mode édition : liste d'entités, fiches avec liaison, éditeur 2D
  await page.locator("[data-act=edit]").click();
  await page.locator(".dev-label").first().click({ force: true });
  await page.locator("[data-tab=plan]").click();
  await page.waitForTimeout(300);
  const xss = await page.evaluate(() => [window.__xss, !!document.querySelector("blueprint3d-card").shadowRoot.querySelector("#pwn")]);
  check("aucune injection HTML depuis les entités", !xss[0] && !xss[1], JSON.stringify(xss));
  check("pas d'erreur JS", errors.length === 0, errors.join(" | "));
  await page.close();
}

// ---------- 2. Config invalide ou malveillante ----------
{
  const { page, errors } = await fresh();
  const warnings = [];
  page.on("console", (m) => m.type() === "warning" && warnings.push(m.text()));
  const res = await page.evaluate((XSS) => {
    const c = document.querySelector("blueprint3d-card");
    c.setConfig({
      type: "custom:blueprint3d-card",
      height: "abc",
      wall_height: 999,
      rooms: [
        { name: XSS, x: 0, y: 0, w: 4, d: 3, floor: `#fff"><img src=x onerror="window.__xss=5">` },
        { name: "cassée", x: "abc", y: 0, w: 2, d: 2 },
        null,
        { name: "énorme", x: 0, y: 0, w: 1e12, d: 3 },
      ],
      openings: [{ type: "porte", x: 1, y: 0 }, { type: "door", x: 2, y: 0, width: -5 }],
      furniture: [{ type: XSS, x: 1, y: 1, w: 1, d: 1, color: `red;background:url(javascript:alert(1))` }],
      devices: [
        { entity: "light.salon", position: "x" },
        { entity: "light.salon); alert(1", position: [1, 1] },
        { entity: "light.salon", position: [1, 1], model: "../../etc", type: XSS },
      ],
      background: { image: "javascript:alert(1)", x: 0, y: 0, w: 5, d: 5 },
    });
    return {
      rooms: c.config.rooms.length,
      bigRoom: c.config.rooms.find((r) => r.name === "énorme")?.w,
      openings: c.config.openings,
      furn: c.config.furniture[0],
      devices: c.devices,
      background: c.config.background,
      wall: c.config.wall_height,
      height: c.config.height,
    };
  }, XSS);
  await page.waitForTimeout(500);
  check("pièces invalides ignorées", res.rooms === 2, `rooms=${res.rooms}`);
  check("tailles absurdes plafonnées", res.bigRoom === 200 && res.wall === 6, `w=${res.bigRoom} wall=${res.wall}`);
  check("ouvertures invalides filtrées", res.openings.length === 1 && res.openings[0].width === 0.2, JSON.stringify(res.openings));
  check("type/couleur de meuble douteux retirés", !res.furn.type && !res.furn.color, JSON.stringify(res.furn));
  check("entités invalides rejetées", res.devices.length === 1 && !res.devices[0].model && !res.devices[0].type, JSON.stringify(res.devices));
  check("calque javascript: refusé", !res.background);
  check("hauteur invalide ignorée", res.height === undefined);
  // Ouvre l'éditeur sur cette config
  await page.locator("[data-act=edit]").click();
  await page.locator("[data-tab=plan]").click();
  await page.waitForTimeout(200);
  const ed = await page.evaluate(() => {
    const e = document.querySelector("blueprint3d-card").editor;
    const r = e.canvas.getBoundingClientRect();
    return { x: r.left + 2 * e.scale + e.ox, y: r.top + 2.5 * e.scale + e.oy };
  });
  await page.mouse.click(ed.x, ed.y);
  await page.waitForTimeout(200);
  const xss = await page.evaluate(() => window.__xss);
  check("config malveillante sans effet", !xss, String(xss));
  check("carte toujours affichée, sans erreur JS", errors.length === 0 && (await page.locator("canvas").count()) >= 1, errors.join(" | "));
  check("avertissements dans la console", warnings.some((w) => w.includes("Config corrigée")), `${warnings.length} avertissement(s)`);
  await page.close();
}

// ---------- 3. Confirmation avant action ----------
{
  const { page } = await fresh();
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c.devices.find((d) => d.entity === "light.salon").confirm = true;
  });
  const stateOf = () => page.evaluate(() => document.querySelector("blueprint3d-card")._hass.states["light.salon"].state);
  const before = await stateOf();
  page.once("dialog", (d) => d.dismiss());
  await page.locator(".dev-label", { hasText: "Salon" }).first().click();
  await page.locator(".panel .switch").click();
  await page.waitForTimeout(300);
  check("refus de la confirmation → rien ne bouge", (await stateOf()) === before, before);
  page.once("dialog", (d) => d.accept());
  await page.locator(".panel .switch").click();
  await page.waitForTimeout(300);
  check("confirmation acceptée → action faite", (await stateOf()) !== before, await stateOf());
  await page.close();
}

// ---------- 3 bis. Serrure / vanne : confirmation imposée, même sans l'option ----------
{
  const { page } = await fresh();
  const calls = await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const h = c._hass;
    window.__calls = [];
    const states = {
      ...h.states,
      "lock.porte_entree": { entity_id: "lock.porte_entree", state: "locked", attributes: { friendly_name: "Serrure test" }, last_changed: "", last_updated: "" },
      "valve.arrosage": { entity_id: "valve.arrosage", state: "closed", attributes: { friendly_name: "Vanne test" }, last_changed: "", last_updated: "" },
    };
    // Config piégée : la serrure et la vanne déclarées comme simples interrupteurs (clic = bascule).
    c.devices.push({ entity: "lock.porte_entree", type: "switch", position: [6.3, 6.4] });
    c.devices.push({ entity: "valve.arrosage", type: "switch", position: [2.8, 7.2] });
    c.hass = { ...h, states, callService: async (...a) => window.__calls.push(a) };
    c.buildDevices();
    return window.__calls.length;
  });
  let dialogs = 0;
  page.on("dialog", (d) => {
    dialogs++;
    d.dismiss();
  });
  for (const name of ["Serrure test", "Vanne test"]) {
    await page.locator(".dev-label", { hasText: name }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".panel .switch").click();
    await page.waitForTimeout(200);
    await page.locator(".panel [data-act=close]").click();
  }
  const after = await page.evaluate(() => window.__calls.length);
  check("serrure / vanne : confirmation demandée, refus → aucun appel", dialogs >= 2 && after === calls, `${dialogs} demande(s), ${after - calls} appel(s)`);
  await page.close();
}

// ---------- 4. Enregistrement : échecs et cas ambigus ----------
{
  const { page } = await fresh(`${BASE}/dev/index.html?plan=maison&edit`);
  await page.waitForTimeout(500);
  // a) L'API refuse (ex. compte non admin)
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c._hass.callWS = async (msg) => {
      if (msg.type === "lovelace/config/save") throw new Error("Unauthorized");
      return window.dashboard();
    };
  });
  await page.locator("[data-act=save]").click();
  await page.waitForTimeout(400);
  const modal = await page.locator(".modal").textContent().catch(() => "");
  check("refus de sauvegarde → export proposé", modal.includes("Enregistrement automatique impossible"));
  await page.locator(".modal [data-act=close]").click();
  // b) Deux cartes identiques dans le tableau de bord → on ne touche à rien
  let saved = false;
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    const d = window.dashboard();
    d.views[0].cards.push(structuredClone(d.views[0].cards[0]));
    c._hass.callWS = async (msg) => {
      if (msg.type === "lovelace/config/save") window.__saved = true;
      return structuredClone(d);
    };
  });
  await page.locator("[data-act=save]").click();
  await page.waitForTimeout(400);
  saved = await page.evaluate(() => !!window.__saved);
  check("carte en double → aucune écriture", !saved);
  await page.locator(".modal [data-act=close]").click().catch(() => {});
  // c) Carte introuvable (config modifiée ailleurs entre-temps) → aucune écriture
  await page.evaluate(() => {
    const c = document.querySelector("blueprint3d-card");
    c._hass.callWS = async (msg) => {
      if (msg.type === "lovelace/config/save") window.__saved2 = true;
      return { views: [{ cards: [{ type: "custom:blueprint3d-card", title: "autre" }] }] };
    };
  });
  await page.locator("[data-act=save]").click();
  await page.waitForTimeout(400);
  check("carte introuvable → aucune écriture", !(await page.evaluate(() => !!window.__saved2)));
  // d) Les autres cartes du tableau de bord sont préservées
  await page.locator(".modal [data-act=close]").click().catch(() => {});
  const other = await page.evaluate(async () => {
    const c = document.querySelector("blueprint3d-card");
    const dash = { views: [{ cards: [{ type: "entities", entities: ["light.salon"] }, structuredClone(c.rawConfig)] }, { title: "Vue 2", cards: [{ type: "markdown", content: "ok" }] }] };
    let out;
    c._hass.callWS = async (msg) => {
      if (msg.type === "lovelace/config/save") out = msg.config;
      return structuredClone(dash);
    };
    await c.save();
    return out && { first: out.views[0].cards[0], view2: out.views[1], replaced: out.views[0].cards[1].rooms?.length };
  });
  check("seule notre carte est remplacée", other && other.first.type === "entities" && other.view2.cards[0].content === "ok" && other.replaced > 0, JSON.stringify(other));
  await page.close();
}

// ---------- 5. Clavier : la saisie dans la carte ne déclenche pas les raccourcis HA ----------
{
  const { page } = await fresh(`${BASE}/dev/index.html?plan=maison&edit=plan`);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__keys = 0;
    document.addEventListener("keydown", () => window.__keys++);
  });
  await page.locator("[data-act=library]").click();
  await page.locator(".library input[type=search]").type("cellier");
  await page.locator("[data-act=close]").first().click();
  const pt = await page.evaluate(() => {
    const e = document.querySelector("blueprint3d-card").editor;
    const r = e.canvas.getBoundingClientRect();
    return { x: r.left + 2.7 * e.scale + e.ox, y: r.top + 7.0 * e.scale + e.oy };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.locator(".plan-props input[data-prop=name]").type("abc e c m");
  await page.keyboard.press("Escape");
  const keys = await page.evaluate(() => window.__keys);
  check("aucune touche ne remonte à Home Assistant", keys === 0, `${keys} touche(s)`);
  await page.close();
}

// ---------- 6. Libération WebGL après détachement, puis retour ----------
{
  const { page, errors } = await fresh();
  const res = await page.evaluate(async () => {
    const c = document.querySelector("blueprint3d-card");
    const parent = c.parentElement;
    c.remove();
    c.disposeThree();
    const freed = !c.renderer;
    parent.appendChild(c);
    await new Promise((r) => setTimeout(r, 800));
    return { freed, back: !!c.renderer, canvas: c.shadowRoot.querySelectorAll("canvas").length, labels: c.shadowRoot.querySelectorAll(".dev-label").length };
  });
  check("contexte WebGL libéré puis recréé", res.freed && res.back && res.canvas === 1 && res.labels > 5, JSON.stringify(res));
  check("pas d'erreur JS", errors.length === 0, errors.join(" | "));
  await page.close();
}

await browser.close();
