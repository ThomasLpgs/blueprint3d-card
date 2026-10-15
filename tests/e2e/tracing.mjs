import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

const out = process.argv[2] ?? "tests/e2e/out";
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
await page.goto(`${BASE}/dev/index.html?plan=maison&edit=plan`);
await page.waitForTimeout(1500);
await page.locator("[data-tool=background]").click();
// Image de test : un plan factice 400×300 dessiné dans un canvas
const png = await page.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 400; c.height = 300;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 300);
  g.strokeStyle = "#c00"; g.lineWidth = 6; g.strokeRect(20, 20, 360, 260);
  g.font = "40px sans-serif"; g.fillStyle = "#c00"; g.fillText("PLAN TEST", 90, 160);
  return c.toDataURL("image/png");
});
const buf = Buffer.from(png.split(",")[1], "base64");
await page.locator(".plan-props input[type=file]").setInputFiles({ name: "plan.png", mimeType: "image/png", buffer: buf });
await page.waitForTimeout(800);
const bg = await page.evaluate(() => { const b = document.querySelector("blueprint3d-card").config.background; return b && { ...b, image: b.image.slice(0, 30) + "…", len: b.image.length }; });
console.log(bg ? "OK   calque chargé " + JSON.stringify(bg) : "FAIL calque");
// Redimensionnement par le coin sud-est : proportions conservées
const before = await page.evaluate(() => ({ ...document.querySelector("blueprint3d-card").config.background }));
const pt = (x, y) => page.evaluate(([x, y]) => { const ed = document.querySelector("blueprint3d-card").editor; const r = ed.canvas.getBoundingClientRect(); return { x: r.left + x * ed.scale + ed.ox, y: r.top + y * ed.scale + ed.oy }; }, [x, y]);
const a = await pt(before.x + before.w, before.y + before.d);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x - 80, a.y - 40, { steps: 5 }); await page.mouse.up();
const after = await page.evaluate(() => ({ ...document.querySelector("blueprint3d-card").config.background }));
const ratioOk = Math.abs(after.d / after.w - before.d / before.w) < 0.02;
console.log(`${ratioOk && after.w < before.w ? "OK  " : "FAIL"} calque redimensionné avec proportions w ${before.w}→${after.w} d ${before.d}→${after.d}`);
await page.screenshot({ path: `${out}/t-bg.png` });
await browser.close();
