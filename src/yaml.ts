// Petit sérialiseur YAML, suffisant pour la config de la carte (objets, listes, scalaires).

function scalar(v: unknown): string {
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v == null) return "null";
  const s = String(v);
  // Sans guillemets seulement pour du texte simple qui commence par une lettre
  // (sinon "-x", "1e3", "0x1F", "yes"… seraient relus comme listes, nombres ou booléens).
  return /^[A-Za-zÀ-ÿ_][\w.\-/ À-ÿ]*$/.test(s) && !/^(true|false|null|yes|no|on|off|y|n|~)$/i.test(s) && s.trim() === s
    ? s
    : JSON.stringify(s);
}

const isScalar = (v: unknown) => v === null || typeof v !== "object";

function lines(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return [`[${value.map(scalar).join(", ")}]`];
    const out: string[] = [];
    for (const item of value) {
      const sub = lines(item, indent + "  ");
      out.push(`${indent}- ${sub[0].trimStart()}`, ...sub.slice(1));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (isScalar(v) || (Array.isArray(v) && v.every(isScalar))) {
        out.push(`${indent}${k}: ${isScalar(v) ? scalar(v) : lines(v, "")[0]}`);
      } else {
        out.push(`${indent}${k}:`, ...lines(v, indent + "  "));
      }
    }
    return out;
  }
  return [indent + scalar(value)];
}

export function toYaml(value: unknown): string {
  return lines(value, "").join("\n") + "\n";
}
