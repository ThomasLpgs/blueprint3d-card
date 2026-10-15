import { defineConfig } from "vite";

// `npm run dev` sert la page de démo (dev/index.html) avec un faux Home Assistant.
// `npm run build` produit un seul fichier dist/blueprint3d-card.js, Three.js inclus,
// à déposer dans /config/www/ ou à installer via HACS.
export default defineConfig({
  server: { port: 5199 },
  build: {
    lib: {
      entry: "src/blueprint3d-card.ts",
      formats: ["es"],
      fileName: () => "blueprint3d-card.js",
    },
    target: "es2021",
    sourcemap: false,
  },
});
