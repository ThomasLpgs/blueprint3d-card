// Lance toutes les suites de bout en bout contre la page de démo (faux Home Assistant).
// Usage : npm run test:e2e        (navigateur : Edge par défaut, H3D_BROWSER=chrome pour Chrome)
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const PORT = 5298;
const server = await createServer({ root, configFile: join(root, "vite.config.ts"), server: { port: PORT, strictPort: true, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const base = `http://127.0.0.1:${PORT}`;

const only = process.argv[2];
const suites = readdirSync(here).filter((f) => f.endsWith(".mjs") && f !== "run.mjs" && (!only || f.includes(only)));
let ok = 0;
let failed = 0;
const failures = [];

for (const suite of suites) {
  const output = await new Promise((resolve) => {
    let text = "";
    const child = spawn(process.execPath, [join(here, suite), out], { cwd: root, env: { ...process.env, H3D_URL: base } });
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("close", (code) => resolve({ text, code }));
  });
  const lines = output.text.split("\n");
  const pass = lines.filter((l) => l.startsWith("OK")).length;
  const fail = lines.filter((l) => l.startsWith("FAIL"));
  // Une suite qui plante avant la fin compte comme un échec.
  const crashed = output.code !== 0 && !lines.some((l) => l.includes("aucune erreur"));
  ok += pass;
  failed += fail.length + (crashed && !fail.length ? 1 : 0);
  console.log(`${fail.length || crashed ? "✗" : "✓"} ${suite.padEnd(22)} ${pass} OK${fail.length ? `, ${fail.length} échec(s)` : ""}${crashed ? " (arrêt prématuré)" : ""}`);
  for (const f of fail) failures.push(`  ${suite}: ${f}`);
  if (crashed) failures.push(`  ${suite}: ${lines.filter((l) => /Error|error/.test(l)).slice(0, 3).join(" | ")}`);
}

await server.close();
console.log(`\n${ok} contrôles OK, ${failed} échec(s)`);
if (failures.length) console.log(failures.join("\n"));
process.exit(failed ? 1 : 0);
