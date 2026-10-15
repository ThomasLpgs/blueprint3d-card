import { chromium } from "playwright-core";
// Lancé par tests/e2e/run.mjs (npm run test:e2e) : la page de démo est servie sur BASE.
const BASE = process.env.H3D_URL ?? "http://localhost:5199";
const CHANNEL = process.env.H3D_BROWSER ?? "msedge";

// Lisibilité en thème sombre : listes déroulantes, options et champs suivent les couleurs du thème.
const browser = await chromium.launch({ channel: CHANNEL, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const check = (label, ok, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${label} ${extra}`);
const errors = [];

// Luminance relative et contraste WCAG entre deux couleurs « rgb(r, g, b) ».
const lum = (c) => {
  const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const scheme of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, colorScheme: scheme });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/dev/index.html?plan=maison&edit`);
  await page.waitForTimeout(1500);
  await page.locator("[data-act=settings]").click();
  await page.waitForTimeout(200);
  const styles = await page.evaluate(() => {
    const root = document.querySelector("blueprint3d-card").shadowRoot;
    const pick = (el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, fg: cs.color };
    };
    const select = root.querySelector('.modal select[data-k="power_entity"]');
    return {
      select: pick(select),
      option: pick(select.querySelector("option:last-child")),
      input: pick(root.querySelector('.modal input[data-k="title"]')),
      picker: pick(root.querySelector(".editbar select")),
    };
  });
  for (const [name, s] of Object.entries(styles)) {
    const c = contrast(s.bg, s.fg);
    check(`thème ${scheme} : ${name} lisible`, c >= 4.5 && !s.bg.includes("0, 0, 0, 0"), `contraste ${c.toFixed(1)} (${s.fg} sur ${s.bg})`);
  }
  await page.close();
}
check("aucune erreur JS", errors.length === 0, errors.join(" | "));
await browser.close();
