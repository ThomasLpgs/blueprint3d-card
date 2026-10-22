// Icônes au trait (24 × 24, couleur du texte) : remplacent les emojis, dont le rendu
// change d'un appareil à l'autre. Uniquement des tracés (« d » SVG), pour pouvoir aussi
// les dessiner dans le canvas du plan 2D (Path2D). Chaînes constantes, sûres pour innerHTML.

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`
    : `M${x} ${y}h${w}v${h}h${-w}Z`;

const PATHS = {
  // Interface
  thermometer: ["M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z"],
  droplet: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"],
  bolt: ["M13 2 4 14h7l-1 8 9-12h-7l1-8Z"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Z", "m3 13 9 5 9-5"],
  cube: ["M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7L12 2.5Z", "M3.5 7 12 11.5 20.5 7M12 11.5v10"],
  target: [circle(12, 12, 7), circle(12, 12, 2), "M12 2v3M12 19v3M2 12h3M19 12h3"],
  pencil: ["M4 20h4L19 9l-4-4L4 16v4Z", "m13.5 6.5 4 4"],
  check: ["m5 12.5 4.5 4.5L19 7"],
  close: ["M6 6l12 12M18 6 6 18"],
  plus: ["M12 5v14M5 12h14"],
  minus: ["M5 12h14"],
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  alert: ["M12 3.5 2.5 20h19L12 3.5Z", "M12 10v4.5M12 17.5v.01"],
  sparkles: ["M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8L11 3Z", "M19 15v4M17 17h4"],
  book: ["M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z", "M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"],
  sliders: ["M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1", circle(15, 6, 2), circle(9, 12, 2), circle(17, 18, 2)],
  download: ["M12 4v11M7 10l5 5 5-5M5 20h14"],
  upload: ["M12 15V4M7 9l5-5 5 5M5 20h14"],
  save: ["M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1Z", "M8 3v5h7V3M8 21v-7h8v7"],
  plan: [rect(3, 3, 18, 18, 1.5), "M3 12h8v9M11 3v5M15 12h6"],
  cursor: ["M5 3l13 7-6 1.5L9.5 18 5 3Z"],
  image: [rect(3, 4, 18, 16, 2), circle(9, 9.5, 1.8), "m3 17 5-4.5 4 3.5 3-2.5 6 5"],
  play: ["M7 4.5v15l12-7.5L7 4.5Z"],
  pause: ["M8 5v14M16 5v14"],
  playpause: ["M4 5v14l8-7-8-7Z", "M16 5v14M20 5v14"],
  stop: [rect(6, 6, 12, 12, 2)],
  prev: ["M18 5v14L8 12l10-7Z", "M6 5v14"],
  next: ["M6 5v14l10-7L6 5Z", "M18 5v14"],
  left: ["M15 5l-7 7 7 7"],
  right: ["M9 5l7 7-7 7"],
  up: ["M5 15l7-7 7 7"],
  down: ["M5 9l7 7 7-7"],
  home: ["M3 11 12 3.5 21 11", "M5.5 9.5V20h13V9.5", "M10 20v-5h4v5"],
  moon: ["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"],
  sun: [circle(12, 12, 4), "M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"],
  volume: ["M4 9h3.5L12 5v14l-4.5-4H4Z", "M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"],
  mute: ["M4 9h3.5L12 5v14l-4.5-4H4Z", "M16 9.5l5 5M21 9.5l-5 5"],
  film: [rect(3, 4, 18, 16, 2), "M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"],
  // Appareils
  bulb: ["M9 18h6M10 21h4", "M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z"],
  spot: [rect(8, 3, 8, 5, 1), "M10 8 6 20h12L14 8"],
  ring: [circle(12, 12, 8.5), circle(12, 12, 4)],
  candle: [rect(8.5, 10, 7, 11, 1), "M12 3c1.5 1.6 1.8 3 .8 4.2-.5.6-1.6.6-2 0-.6-1 .2-2.6 1.2-4.2Z"],
  lantern: ["M9 3h6M10 3v2M14 3v2", rect(7, 5, 10, 14, 3), "M9 21h6M12 9v6"],
  strip: [rect(2.5, 9, 19, 6, 2), "M7 12h.01M12 12h.01M17 12h.01"],
  rainbow: ["M3 18a9 9 0 0 1 18 0", "M6.5 18a5.5 5.5 0 0 1 11 0", "M10 18a2 2 0 0 1 4 0"],
  wave: ["M2 12c2-3.5 4-3.5 6 0s4 3.5 6 0 4-3.5 6 0"],
  bar: [rect(9, 3, 6, 18, 2)],
  hexagon: ["M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3L12 2.5Z"],
  square: [rect(4, 4, 16, 16, 2)],
  door: ["M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18", "M14.5 12v.01"],
  glassdoor: [rect(4, 3, 16, 18, 1), "M12 3v18M9.5 11v2M14.5 11v2"],
  window: [rect(4, 3, 16, 18, 1), "M12 3v18M4 12h16"],
  climate: ["M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7", "m9 4 3 2 3-2M9 20l3-2 3 2"],
  flame: ["M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2.5 2-3 4.5-2.5 6.5C10 10.5 9 9 9 7.5 7 9.5 6 12 6 15a6 6 0 0 0 6 6Z"],
  wind: ["M3 8h11a3 3 0 1 0-3-3", "M3 12h16a3 3 0 1 1-3 3", "M3 16h7"],
  cover: ["M4 3h16M5.5 3v18M18.5 3v18M5.5 8h13M5.5 12h13M5.5 16h13"],
  fan: [circle(12, 12, 1.6), "M12 10.4C11 6 12 3 14.5 3S17.5 7 13.4 11M13.6 12C18 11 21 12 21 14.5S17 17.5 13 13.4M12 13.6C13 18 12 21 9.5 21S6.5 17 10.6 13M10.4 12C6 13 3 12 3 9.5S7 6.5 11 10.6"],
  plug: ["M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v4"],
  battery: [rect(3, 7, 16, 10, 2), "M21 10.5v3M7 10v4M10.5 10v4"],
  tv: [rect(3, 5, 18, 12, 2), "M8 21h8"],
  monitor: [rect(3, 4, 18, 12, 2), "M8 20h8M12 16v4"],
  speaker: [rect(6, 2.5, 12, 19, 2), circle(12, 14, 3.2), "M12 7v.01"],
  wifi: ["M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 15.8a5 5 0 0 1 6.4 0M12 19.5h.01"],
  camera: [rect(3, 7, 12, 10, 2), "m15 11 6-3.5v9L15 13"],
  vacuum: [circle(12, 12, 8.5), circle(12, 12, 3), "M12 3.5V6"],
  gauge: ["M3 12h4l3-7 4 14 3-7h4"],
  eye: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z", circle(12, 12, 2.8)],
  walk: [circle(13, 4.5, 1.8), "m9 21 2.5-6.5L9 11.5l2-4.5h3l2 4 3 1.5M11.5 14.5l3 2.5V21"],
  lock: [rect(5, 11, 14, 10, 2), "M8 11V7a4 4 0 0 1 8 0v4"],
  bell: ["M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z", "M10 20.5a2 2 0 0 0 4 0"],
  siren: ["M6 18v-6a6 6 0 0 1 12 0v6", rect(4, 18, 16, 3, 1), "M12 2v1.5M3.5 6l1.2 1M20.5 6l-1.2 1"],
  cloud: ["M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z"],
  leaf: ["M5 19C5 10 10 5 20 4c0 10-5 15-14 15Z", "M5 19c3-4 6-7 10-10"],
  paw: [circle(6, 11, 1.8), circle(10, 6.5, 1.8), circle(14, 6.5, 1.8), circle(18, 11, 1.8), "M8.5 17.5c0-2.5 1.6-4.5 3.5-4.5s3.5 2 3.5 4.5c0 1.6-1.2 2.5-3.5 2.5s-3.5-.9-3.5-2.5Z"],
  bowl: ["M3 11h18c0 4.5-4 8-9 8s-9-3.5-9-8Z", "M8 7c1-1 3-1 4 0s3 1 4 0"],
  shower: ["M4 21V6a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v2", "M10 8h8", "M11 12v1.5M14 12v1.5M17 12v1.5M12.5 16v1.5M15.5 16v1.5"],
  // Meubles
  sofa: ["M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4", "M4 11a2 2 0 0 1 2 2v1h12v-1a2 2 0 1 1 4 0v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2Z", "M5 18v1.5M19 18v1.5"],
  bed: ["M3 19V6M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5", circle(7, 11, 1.8)],
  table: ["M2.5 8h19M5 8v12M19 8v12M5 13h14"],
  chair: ["M7 3v18M7 13h10v8"],
  wardrobe: [rect(5, 3, 14, 18, 1.5), "M12 3v18M10 11v2M14 11v2"],
  kitchen: ["M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6Z", "M2 10h2M20 10h2M9 6c0-1 1-1 1-2M14 6c0-1 1-1 1-2"],
  fridge: [rect(6, 2.5, 12, 19, 2), "M6 10h12M9 6v2M9 13v3"],
  washer: [rect(4, 2.5, 16, 19, 2), circle(12, 13, 4.5), "M7.5 6h.01M10.5 6h.01"],
  toilet: ["M6 3h5v8H6Z", "M6 11h13c0 3.5-3 6-7 6v4H8v-4.5C6.8 15.5 6 13.5 6 11Z"],
  bath: ["M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2Z", "M6 12V5.5a2.5 2.5 0 0 1 5 0", "M7 19l-1 2M17 19l1 2"],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): string {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]
    .map((d) => `<path d="${d}"/>`)
    .join("")}</svg>`;
}

const path2d = new Map<IconName, Path2D[]>();

/** Dessine l'icône dans un canvas, centrée sur (x, y), de côté `size` pixels. */
export function drawIcon(g: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string): void {
  let paths = path2d.get(name);
  if (!paths) {
    paths = PATHS[name].map((d) => new Path2D(d));
    path2d.set(name, paths);
  }
  const k = size / 24;
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(k, k);
  g.strokeStyle = color;
  g.lineWidth = 2.2;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const p of paths) g.stroke(p);
  g.restore();
}

/** Icône d'une scène sans icône choisie, devinée d'après son nom. */
export function sceneIcon(name: string): IconName {
  if (/teindre|\boff\b|nuit|night|dodo|sleep|coucher/i.test(name)) return "moon";
  if (/cin[eé]|movie|film|t[eé]l[eé]|\btv\b/i.test(name)) return "film";
  if (/soir|relax|evening|chill|ambiance|lecture/i.test(name)) return "sofa";
  if (/matin|morning|r[eé]veil|wake|jour\b|day/i.test(name)) return "sun";
  if (/part|leave|absent|away/i.test(name)) return "home";
  return "sparkles";
}
