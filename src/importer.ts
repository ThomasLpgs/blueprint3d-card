import { load } from "js-yaml";
import type { CardConfig } from "./types";

// Lecture d'une config importée (YAML ou JSON) : la config de la carte seule,
// ou un tableau de bord complet dans lequel on retrouve la carte.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportResult = { ok: true; config: Partial<CardConfig> } | { ok: false; error: "too_big" | "syntax" | "not_object" | "no_card" | "other_card"; detail?: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Cherche la première carte de ce type dans une config de tableau de bord. */
function findCard(node: unknown, type: string, depth = 0): Record<string, unknown> | undefined {
  if (depth > 20 || !node || typeof node !== "object") return undefined;
  if (isObject(node) && node.type === type) return node;
  for (const v of Object.values(node)) {
    const found = findCard(v, type, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function parseImport(text: string, cardType: string): ImportResult {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) return { ok: false, error: "too_big" };
  let data: unknown;
  try {
    // js-yaml 4 : schéma par défaut sans types JavaScript exécutables ; le JSON est aussi du YAML valide.
    data = load(text, { json: true });
  } catch (err) {
    return { ok: false, error: "syntax", detail: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
  if (!isObject(data)) return { ok: false, error: "not_object" };

  let card: Record<string, unknown> | undefined = data;
  if (Array.isArray(data.views) || Array.isArray(data.cards) || Array.isArray(data.sections)) card = findCard(data, cardType);
  if (!card) return { ok: false, error: "no_card" };
  if (card.type !== undefined && card.type !== cardType) return { ok: false, error: "other_card", detail: String(card.type) };

  const looksLikePlan = ["rooms", "devices", "openings", "furniture"].some((k) => k in card!);
  if (!looksLikePlan) return { ok: false, error: "no_card" };
  // Copie des seules clés connues : rien d'autre (ni __proto__, ni options inconnues) n'est repris.
  const keys = ["title", "height", "wall_height", "sun_entity", "north", "compact_labels", "max_labels","rooms", "openings", "furniture", "devices", "background", "scenes", "show_persons", "quality", "power_entity", "weather_entity", "levels"] as const;
  const config: Partial<CardConfig> = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(card, k)) (config as Record<string, unknown>)[k] = card[k];
  return { ok: true, config };
}
