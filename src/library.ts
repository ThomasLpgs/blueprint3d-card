import { CATEGORIES, DEVICE_ITEMS, FURNITURE_ITEMS, SHAPE_KEYWORDS, type CatalogItem, type Category } from "./catalog";
import { t } from "./i18n";
import { icon } from "./icons";

// Panneau « Bibliothèque » : objets connectés par marque et meubles, à poser dans la maison.

/** Marques mises en avant en tête de liste, puis les autres par ordre alphabétique. */
const FEATURED = ["Philips Hue", "TP-Link Tapo", "Govee", "IKEA"];
const BRANDS = [
  ...FEATURED,
  ...[...new Set(DEVICE_ITEMS.map((i) => i.brand))].filter((b) => !FEATURED.includes(b) && b !== "Générique").sort((a, b) => a.localeCompare(b, "fr")),
  "Générique",
];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Minuscules sans accents : « detecteur » trouve « Détecteur ». */
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function itemName(item: CatalogItem): string {
  return item.category === "furniture" ? t(`f_${item.furniture}`) : item.name;
}

export class Library {
  readonly el = document.createElement("div");
  private category: Category | "all" = "all";
  private brand: string = "all";
  private query = "";

  constructor(private onPick: (item: CatalogItem) => void) {
    this.el.className = "library";
    this.el.hidden = true;
    for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) this.el.addEventListener(type, (e) => e.stopPropagation());
    this.el.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-cat], [data-brand], [data-id], [data-act]");
      if (!target) return;
      if (target.dataset.act === "close") this.hide();
      else if (target.dataset.cat) {
        this.category = target.dataset.cat as Category | "all";
        this.renderList();
      } else if (target.dataset.brand) {
        this.brand = target.dataset.brand;
        this.renderList();
      } else if (target.dataset.id) {
        const item = [...DEVICE_ITEMS, ...FURNITURE_ITEMS].find((i) => i.id === target.dataset.id);
        if (item) {
          this.hide();
          this.onPick(item);
        }
      }
    });
    this.el.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement;
      if (target instanceof HTMLSelectElement) {
        this.brand = BRANDS.includes(target.value) ? target.value : "all";
      } else {
        this.query = target.value.trim().toLowerCase();
      }
      this.renderList();
    });
  }

  get open(): boolean {
    return !this.el.hidden;
  }

  show(): void {
    this.render();
    this.el.hidden = false;
    this.el.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }

  hide(): void {
    this.el.hidden = true;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  private render(): void {
    this.el.innerHTML = `
      <div class="lib-head">
        <strong class="with-ic">${icon("book")}${t("library")}</strong>
        <button class="icon-btn" data-act="close" title="${t("close")}">${icon("close")}</button>
      </div>
      <input type="search" placeholder="${t("search")}" value="${this.query.replace(/"/g, "&quot;")}">
      <div class="lib-chips lib-cats"></div>
      <div class="lib-chips lib-brands"></div>
      <div class="lib-grid"></div>`;
    this.renderList();
  }

  private renderList(): void {
    const cats = this.el.querySelector(".lib-cats");
    const brands = this.el.querySelector(".lib-brands");
    const grid = this.el.querySelector(".lib-grid");
    if (!cats || !brands || !grid) return;
    const chip = (attr: string, value: string, label: string, active: boolean) =>
      `<button class="chip ${active ? "active" : ""}" data-${attr}="${value}">${label}</button>`;
    cats.innerHTML =
      chip("cat", "all", t("all"), this.category === "all") +
      CATEGORIES.map((c) => chip("cat", c, t(`cat_${c}`), this.category === c)).join("");
    const showBrands = this.category !== "furniture";
    // Liste déroulante : une trentaine de marques ne tiennent pas en pastilles.
    const counts = new Map<string, number>();
    for (const i of DEVICE_ITEMS) counts.set(i.brand, (counts.get(i.brand) ?? 0) + 1);
    brands.innerHTML = showBrands
      ? `<select class="lib-brand" aria-label="${t("all_brands")}">
          <option value="all">${t("all_brands")} (${BRANDS.length} ${t("all_brands_n")})</option>
          ${BRANDS.map((b) => `<option value="${esc(b)}" ${this.brand === b ? "selected" : ""}>${esc(b === "Générique" ? t("generic") : b)} (${counts.get(b) ?? 0})</option>`).join("")}
        </select>`
      : "";

    const q = this.query;
    const items: CatalogItem[] = [...DEVICE_ITEMS, ...FURNITURE_ITEMS].filter((i) => {
      if (this.category !== "all" && i.category !== this.category) return false;
      if (i.category !== "furniture" && showBrands && this.brand !== "all") {
        if (i.brand !== this.brand) return false;
      }
      if (this.category === "all" && this.brand !== "all" && i.category === "furniture") return false;
      if (!q) return true;
      const extra = i.category === "furniture" ? "" : `${i.brand} ${i.aliases ?? ""} ${SHAPE_KEYWORDS[i.shape] ?? ""}`;
      const hay = normalize(`${itemName(i)} ${extra} ${t(`cat_${i.category}`)}`);
      return normalize(q).split(/\s+/).every((w) => hay.includes(w));
    });
    grid.innerHTML = items.length
      ? items
          .map(
            (i) => `<button class="lib-item" data-id="${i.id}" title="${esc(itemName(i))}">
              <span class="ico">${icon(i.icon)}</span>
              <span class="nm">${esc(itemName(i))}</span>
              <span class="br">${esc(i.category === "furniture" ? t("cat_furniture") : i.brand)}</span>
            </button>`,
          )
          .join("")
      : `<div class="muted">∅</div>`;
  }
}
