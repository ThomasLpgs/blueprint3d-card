import type { CardConfig } from "../src/types";

// Maison de plain-pied d'exemple (≈ 11,5 × 9 m + terrasse), pour la démo et les tests.
// Origine : angle haut-gauche de la chambre 1 ; x vers la droite, y vers le bas, en mètres.
export const MAISON: CardConfig = {
  type: "custom:blueprint3d-card",
  title: "Maison",
  north: 0,
  rooms: [
    { name: "Chambre 1", x: 0, y: 0, w: 3.8, d: 3.6, floor: "#b89a78" },
    { name: "Salle de bain", x: 3.8, y: 0, w: 2.2, d: 2.4, floor: "#cfd8dc" },
    { name: "Entrée", x: 6, y: 0, w: 2, d: 3.6, floor: "#c4b49c" },
    { name: "Cuisine", x: 8, y: 0, w: 3.5, d: 3.6, floor: "#d5d8da" },
    { name: "Couloir", x: 3.8, y: 2.4, w: 1.2, d: 6.6, floor: "#c4b49c" },
    { name: "WC", x: 5, y: 2.4, w: 1, d: 1.2, floor: "#d5d8da" },
    { name: "Bureau", x: 0, y: 3.6, w: 3.8, d: 2.6, floor: "#b89a78" },
    { name: "Chambre 2", x: 0, y: 6.2, w: 3.8, d: 2.8, floor: "#b89a78" },
    { name: "Séjour", x: 5, y: 3.6, w: 6.5, d: 5.4, floor: "#d9d6d0" },
    { name: "Terrasse", x: 5, y: 9, w: 6.5, d: 2.5, outdoor: true },
  ],
  openings: [
    { type: "door", x: 6.55, y: 0, width: 0.9 },
    { type: "door", x: 8, y: 1.4, width: 0.8 },
    { type: "door", x: 6.6, y: 3.6, width: 1.0 },
    { type: "door", x: 5, y: 4.5, width: 0.9 },
    { type: "door", x: 5, y: 2.6, width: 0.7 },
    { type: "door", x: 4.2, y: 2.4, width: 0.7 },
    { type: "door", x: 3.8, y: 2.6, width: 0.8 },
    { type: "door", x: 3.8, y: 4.5, width: 0.8 },
    { type: "door", x: 3.8, y: 7.2, width: 0.8 },
    { type: "glass_door", x: 6.5, y: 9, width: 2.4 },
    { type: "window", x: 0, y: 1.2, width: 1.2 },
    { type: "window", x: 0, y: 4.3, width: 1.0 },
    { type: "window", x: 0, y: 7.0, width: 1.2 },
    { type: "window", x: 4.5, y: 0, width: 0.6 },
    { type: "window", x: 9.0, y: 0, width: 1.4 },
    { type: "window", x: 11.5, y: 5.5, width: 1.4 },
  ],
  furniture: [
    // Chambres et bureau
    { type: "bed", x: 1.2, y: 0.1, w: 1.6, d: 2.0, color: "#e9e2d6" },
    { type: "box", x: 0.1, y: 2.9, w: 1.8, d: 0.6, h: 2.0, color: "#d9cbb6" },
    { type: "table", x: 0.1, y: 3.8, w: 0.7, d: 1.6, color: "#9c7b55" },
    { type: "bed", x: 0.1, y: 6.6, w: 1.0, d: 2.0, color: "#e9e2d6" },
    // Salle de bain et WC
    { type: "box", x: 3.9, y: 0.1, w: 0.75, d: 1.7, h: 0.55, color: "#f4f7f8" },
    { type: "box", x: 5.3, y: 0.1, w: 0.6, d: 0.45, h: 0.85, color: "#f4f7f8" },
    { type: "box", x: 5.3, y: 3.0, w: 0.38, d: 0.55, h: 0.42, color: "#f4f7f8" },
    // Cuisine : plan de travail, colonne frigo, îlot
    { type: "box", x: 8.1, y: 0.05, w: 3.3, d: 0.62, h: 0.9, color: "#f2f2f0" },
    { type: "box", x: 10.85, y: 0.7, w: 0.6, d: 0.65, h: 2.0, color: "#e9e4dc" },
    { type: "box", x: 9.0, y: 2.2, w: 1.8, d: 0.8, h: 0.9, color: "#b8946a" },
    // Séjour : table à manger, meuble TV, canapé face à la TV, table basse
    { type: "table", x: 5.6, y: 4.2, w: 1.6, d: 0.9, h: 0.75, color: "#8a6a4a" },
    { type: "box", x: 8.2, y: 3.7, w: 1.8, d: 0.42, h: 0.5, color: "#3a3a3a" },
    { type: "sofa", x: 8.0, y: 6.8, w: 2.2, d: 0.9, color: "#5b6b7a" },
    { type: "table", x: 8.5, y: 5.8, w: 1.2, d: 0.6, h: 0.42, color: "#8a6a4a" },
    // Terrasse
    { type: "table", x: 9.5, y: 9.6, w: 1.0, d: 1.0, h: 0.72, color: "#6b6b6b" },
  ],
};
