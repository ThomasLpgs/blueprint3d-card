export const styles = `
:host {
  display: block;
  height: 100%;
  --h3d-accent: var(--primary-color, #ff9b42);
  --h3d-text: var(--primary-text-color, #1f2328);
  --h3d-muted: var(--secondary-text-color, #6b7280);
  --h3d-surface: color-mix(in srgb, var(--card-background-color, #ffffff) 88%, transparent);
  --h3d-border: color-mix(in srgb, var(--h3d-text) 12%, transparent);
}
[hidden] { display: none !important; }
ha-card, .card {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}
.title {
  padding: 12px 16px 0;
  font-size: 1.15rem;
  font-weight: 500;
  color: var(--h3d-text);
}
.stage {
  position: relative;
  flex: 1;
  min-height: var(--h3d-height, 450px);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background: radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--h3d-text) 6%, transparent), transparent 70%);
}
/* Le canvas est hors du flux : sa taille suit la carte sans jamais l'agrandir
   (sinon boucle de redimensionnement dans le mode édition de HA). */
.stage > canvas.gl { position: absolute; inset: 0; width: 100% !important; height: 100% !important; display: block; outline: none; }
.stage.placing { cursor: crosshair; }
/* Pendant un placement, les étiquettes laissent passer le clic jusqu'au sol. */
.stage.placing .dev-label { pointer-events: none; opacity: 0.6; }
.stage.hovering { cursor: pointer; }
.labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }

.room-label {
  font: 600 10px/1 system-ui, sans-serif;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(40, 32, 24, 0.55);
  pointer-events: none;
  white-space: nowrap;
}

.dev-anchor { pointer-events: none; height: 0; display: flex; justify-content: center; align-items: flex-end; }
.dev-label {
  --dev-color: var(--h3d-accent);
  translate: 0 -6px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px 4px 6px;
  border-radius: 999px;
  background: var(--h3d-surface);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--h3d-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  color: var(--h3d-text);
  font: 500 11px/1.15 system-ui, sans-serif;
  white-space: nowrap;
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.2s;
}
.dev-label:hover { transform: scale(1.06); }
.dev-label .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: color-mix(in srgb, var(--h3d-text) 25%, transparent);
  flex: none;
}
.dev-label.on .dot { background: var(--dev-color); box-shadow: 0 0 8px var(--dev-color); }
.dev-label .txt { display: flex; flex-direction: column; }
.dev-label .s { font-size: 10px; color: var(--h3d-muted); }
.dev-label.unavailable { opacity: 0.55; }
.dev-label.selected { box-shadow: 0 0 0 2px var(--h3d-accent), 0 2px 10px rgba(0, 0, 0, 0.2); }
.hide-labels .dev-label .txt { display: none; }
.hide-labels .dev-label { padding: 5px; }
.dev-label { position: relative; }
/* Étiquettes qui se chevauchent : réduites à une pastille, ou masquées (l'objet 3D reste cliquable). */
.dev-label.mini { padding: 5px; gap: 0; }
.dev-label.mini .txt { display: none; }
.dev-label.mini::after { content: ""; position: absolute; inset: -8px; border-radius: 50%; }
.dev-label.culled, .room-label.culled { visibility: hidden; pointer-events: none; }
/* Téléphone : étiquettes compactes (l'état reste affiché pour les capteurs et clims). */
.narrow .dev-label { font-size: 10px; padding: 3px 7px 3px 5px; gap: 4px; }
.narrow .dev-label:not(.kind-sensor):not(.kind-climate) .s { display: none; }
.narrow .dev-label .dot { width: 7px; height: 7px; }
/* Téléphone : la fiche s'ouvre en bas, la scène reste visible au-dessus. */
.narrow .panel { top: auto; bottom: 10px; left: 10px; right: 10px; width: auto; max-height: 50%; }
/* Téléphone : barre d'outils à droite, infos (présence, compteur, alertes) à gauche, sans se chevaucher. */
.narrow .toolbar { max-width: calc(58% - 10px); }
.narrow .overlay-left { max-width: calc(42% - 16px); }
.panel-edit.nudge-row { border-top: none; border-bottom: 1px solid var(--h3d-border); padding-top: 0; }
.nudge-row .row { flex-direction: row; align-items: center; justify-content: space-between; }
.panel-edit .nudge { display: flex; gap: 8px; }
.panel-edit .nudge .round { touch-action: none; }

.toolbar {
  position: absolute;
  top: 10px; right: 10px;
  display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;
  z-index: 2;
}
.toolbar button, .editbar button, .editbar select, .panel button.chip, .modal button {
  font: 500 12px system-ui, sans-serif;
  color: var(--h3d-text);
  background: var(--h3d-surface);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--h3d-border);
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}
.toolbar button:hover, .editbar button:hover { border-color: var(--h3d-accent); }
.toolbar button.active { background: var(--h3d-accent); color: #fff; border-color: transparent; }

.editbar {
  position: absolute;
  left: 10px; right: 10px; bottom: 10px;
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
  z-index: 2;
}
.editbar select { max-width: 260px; }
.editbar .hint {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  font: 12px system-ui, sans-serif;
  color: var(--h3d-text);
  background: var(--h3d-surface);
  padding: 6px 10px;
  border-radius: 8px;
}

.notice {
  position: absolute; left: 10px; top: 10px; z-index: 1;
  font: 12px system-ui, sans-serif;
  color: var(--h3d-muted);
  background: var(--h3d-surface);
  padding: 6px 10px; border-radius: 8px;
  max-width: 55%;
}

.panel {
  position: absolute;
  top: 54px; right: 10px;
  width: min(290px, calc(100% - 20px));
  max-height: calc(100% - 64px);
  overflow: auto;
  z-index: 3;
  background: var(--card-background-color, #fff);
  color: var(--h3d-text);
  border-radius: 16px;
  border: 1px solid var(--h3d-border);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  font: 13px system-ui, sans-serif;
  transition: opacity 0.18s, transform 0.18s;
}
.panel.hidden { opacity: 0; transform: translateY(-6px) scale(0.98); pointer-events: none; }
.panel-head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; }
.panel-title { flex: 1; min-width: 0; }
.pn { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps { color: var(--h3d-muted); font-size: 12px; margin-top: 2px; }
.panel-body { padding: 4px 14px 8px; display: flex; flex-direction: column; gap: 12px; }
.panel-body:empty { display: none; }
.panel-foot { display: flex; justify-content: space-between; padding: 4px 8px 10px; }
.panel .row { display: flex; flex-direction: column; gap: 6px; }
.panel label { display: flex; justify-content: space-between; font-size: 12px; color: var(--h3d-muted); }
.panel input[type="range"] { width: 100%; accent-color: var(--h3d-accent); }
.panel input[type="range"].kelvin {
  accent-color: #ffd9a8;
  -webkit-appearance: none; appearance: none; height: 8px; border-radius: 99px;
  background: linear-gradient(90deg, #ff9f4a, #fff4e5, #bcd7ff);
}
.panel input[type="range"].kelvin::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 2px solid rgba(0,0,0,0.25);
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.panel button.chip.active { background: var(--h3d-accent); color: #fff; border-color: transparent; }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.swatch { width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--h3d-border); cursor: pointer; padding: 0; }
.swatches input[type="color"] { width: 28px; height: 28px; border: none; padding: 0; background: none; cursor: pointer; }
.thermo { flex-direction: row !important; align-items: center; justify-content: space-between; }
.round {
  width: 40px; height: 40px; border-radius: 50%; font-size: 20px;
  border: 1px solid var(--h3d-border); background: transparent; color: var(--h3d-text); cursor: pointer;
}
.big { font-size: 34px; font-weight: 300; text-align: center; }
.big small { font-size: 18px; }
.big .muted { font-size: 12px; }
.center { text-align: center; }
.muted { color: var(--h3d-muted); font-size: 12px; }
.icon-btn { border: none; background: transparent; color: var(--h3d-muted); font-size: 14px; cursor: pointer; padding: 4px; }
.link { border: none; background: transparent; color: var(--h3d-accent); cursor: pointer; font: 500 12px system-ui, sans-serif; padding: 6px; }
.link.danger { color: var(--error-color, #db4437); }
.switch {
  width: 42px; height: 24px; border-radius: 99px; border: none; cursor: pointer; padding: 2px;
  background: color-mix(in srgb, var(--h3d-text) 20%, transparent);
  transition: background 0.2s;
}
.switch span { display: block; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
.switch.on { background: var(--h3d-accent); }
.switch.on span { transform: translateX(18px); }

.modal {
  position: absolute; inset: 0; z-index: 4;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.modal > div {
  background: var(--card-background-color, #fff); color: var(--h3d-text);
  border-radius: 16px; padding: 16px; width: min(560px, calc(100% - 32px));
  display: flex; flex-direction: column; gap: 10px; font: 13px system-ui, sans-serif;
}
.modal textarea {
  width: 100%; box-sizing: border-box; height: 260px; resize: vertical;
  font: 12px ui-monospace, monospace; border-radius: 8px; padding: 8px;
  border: 1px solid var(--h3d-border); background: transparent; color: var(--h3d-text);
}
.modal .actions { display: flex; justify-content: flex-end; gap: 8px; }
.modal .actions button.primary { background: var(--h3d-accent); color: #fff; border-color: transparent; }
.modal .error { color: var(--error-color, #db4437); font-size: 12px; }
.modal label.file { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--h3d-muted); }

.plan-editor {
  position: absolute; inset: 0; z-index: 2; outline: none;
  background: var(--card-background-color, #fff);
}
.plan-editor canvas { display: block; touch-action: none; }
.plan-tools {
  position: absolute; top: 10px; left: 10px; right: 120px;
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.plan-tools .group { display: inline-flex; gap: 4px; align-items: center; }
.plan-tools button, .plan-tools select, .plan-props button {
  font: 500 12px system-ui, sans-serif; color: var(--h3d-text);
  background: var(--h3d-surface); border: 1px solid var(--h3d-border);
  border-radius: 8px; padding: 5px 9px; cursor: pointer;
  display: inline-flex; gap: 5px; align-items: center;
}
.plan-tools button.active { background: var(--h3d-accent); color: #fff; border-color: transparent; }
@media (max-width: 720px) { .plan-tools button span { display: none; } }
.plan-hint {
  position: absolute; left: 10px; bottom: 58px;
  font: 12px system-ui, sans-serif; color: var(--h3d-muted);
  background: var(--h3d-surface); padding: 4px 8px; border-radius: 6px;
  pointer-events: none; max-width: calc(100% - 300px);
}
.plan-props {
  position: absolute; top: 54px; right: 10px; width: 230px;
  max-height: calc(100% - 120px); overflow: auto;
  background: var(--card-background-color, #fff); color: var(--h3d-text);
  border: 1px solid var(--h3d-border); border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 12px; display: flex; flex-direction: column; gap: 8px;
  font: 12px system-ui, sans-serif;
}
.plan-props .ptitle { font-weight: 600; font-size: 14px; }
.plan-props label { display: flex; flex-direction: column; gap: 3px; color: var(--h3d-muted); }
.plan-props label.check { flex-direction: row; align-items: center; gap: 6px; padding-top: 14px; }
.plan-props label.file { cursor: pointer; color: var(--h3d-accent); }
.plan-props label.file input { font-size: 11px; color: var(--h3d-muted); }
.plan-props input[type="text"], .plan-props input[type="number"], .plan-props select {
  font: 13px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 6px; padding: 5px 6px; width: 100%; box-sizing: border-box;
}
.plan-props input[type="color"] { width: 100%; height: 30px; border: 1px solid var(--h3d-border); border-radius: 6px; padding: 2px; background: transparent; }
.plan-props .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.plan-props .pactions { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; }
.plan-props button.danger { color: var(--error-color, #db4437); }
.editbar .tabs { display: inline-flex; border: 1px solid var(--h3d-border); border-radius: 999px; overflow: hidden; }
.editbar .tabs button { border: none; border-radius: 0; }
.editbar .tabs button.active { background: var(--h3d-accent); color: #fff; }
.editbar .spacer { flex: 1; }
.editbar .status { font: 12px system-ui, sans-serif; color: var(--h3d-muted); }
.editbar .status.dirty { color: var(--warning-color, #e0a030); }
.editbar button.primary { background: var(--h3d-accent); color: #fff; border-color: transparent; }
.toolbar { z-index: 3; }
.editbar { z-index: 3; }
@media (max-width: 720px) { .plan-props { top: auto; bottom: 56px; width: calc(100% - 20px); max-height: 45%; } .plan-hint { display: none; } }

.library {
  position: absolute; top: 10px; left: 10px; bottom: 58px; z-index: 4;
  width: min(360px, calc(100% - 20px));
  background: var(--card-background-color, #fff); color: var(--h3d-text);
  border: 1px solid var(--h3d-border); border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  font: 13px system-ui, sans-serif;
}
.library .lib-head { display: flex; justify-content: space-between; align-items: center; }
.library input[type="search"] {
  font: 13px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 8px; padding: 7px 9px;
}
.lib-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.lib-chips:empty { display: none; }
.lib-brand {
  font: 500 12px system-ui, sans-serif; border: 1px solid var(--h3d-border); border-radius: 8px; padding: 5px 8px; width: 100%;
}
.lib-chips .chip {
  font: 500 11px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 999px; padding: 3px 9px; cursor: pointer;
}
.lib-chips .chip.active { background: var(--h3d-accent); color: #fff; border-color: transparent; }
.lib-grid {
  flex: 1; overflow: auto; display: grid; gap: 6px; align-content: start;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
}
.lib-item {
  display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center;
  padding: 8px 4px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--h3d-border); background: transparent; color: var(--h3d-text);
}
.lib-item:hover { border-color: var(--h3d-accent); background: color-mix(in srgb, var(--h3d-accent) 8%, transparent); }
.lib-item .ico { font-size: 22px; line-height: 1.2; }
.lib-item .nm { font: 500 11px/1.2 system-ui, sans-serif; }
.lib-item .br { font-size: 10px; color: var(--h3d-muted); }
.panel-edit { display: flex; flex-direction: column; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--h3d-border); }
.panel-edit select, .panel-edit input {
  font: 12px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 6px; padding: 5px; width: 100%;
}
.panel img.cam { width: 100%; border-radius: 10px; display: block; background: #000; }
.dev-label.unlinked { border-style: dashed; opacity: 0.85; }
.dev-label.unlinked .s { color: var(--warning-color, #e0a030); }
.panel-edit label.check { flex-direction: row; justify-content: flex-start; gap: 6px; align-items: center; color: var(--h3d-text); }
.panel-edit label.check input { width: auto; }
.panel-edit label output { float: right; font-variant-numeric: tabular-nums; color: var(--h3d-muted); }
.panel-edit input[type="range"] { padding: 0; border: none; accent-color: var(--h3d-accent); }
.panel-edit .presets { display: flex; gap: 4px; flex-wrap: wrap; }
.panel-edit .presets .chip {
  font: 500 11px system-ui, sans-serif; color: var(--h3d-text); background: transparent; cursor: pointer;
  border: 1px solid var(--h3d-border); border-radius: 999px; padding: 3px 9px;
}
.panel-edit .presets .chip:hover { border-color: var(--h3d-accent); }

.room-label.selected { color: var(--h3d-accent); font-size: 12px; }
.room-label.with-info { color: rgba(40, 32, 24, 0.75); }
.overlay-left {
  position: absolute; top: 10px; left: 10px; z-index: 2;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start; max-width: 55%;
  pointer-events: none;
}
.persons { display: flex; flex-wrap: wrap; gap: 4px; }
.persons:empty { display: none; }
.person {
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 2px;
  border-radius: 999px; background: var(--h3d-surface); border: 1px solid var(--h3d-border);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  font: 500 11px system-ui, sans-serif; color: var(--h3d-muted); pointer-events: auto;
}
.person img, .person .initial {
  width: 22px; height: 22px; border-radius: 50%; object-fit: cover; filter: grayscale(1); opacity: 0.6;
  display: inline-flex; align-items: center; justify-content: center; background: var(--h3d-border); color: var(--h3d-text);
}
.person.home { color: var(--h3d-text); }
.person.home img, .person.home .initial { filter: none; opacity: 1; box-shadow: 0 0 0 2px #4cd97b; }
.alert {
  font: 600 12px system-ui, sans-serif; color: #fff; background: #d93b30;
  padding: 6px 10px; border-radius: 8px; box-shadow: 0 4px 14px rgba(217, 59, 48, 0.35);
  animation: h3d-pulse 1.6s ease-in-out infinite;
}
@keyframes h3d-pulse { 50% { box-shadow: 0 4px 22px rgba(217, 59, 48, 0.6); } }
.overlay-left .notice { position: static; max-width: none; }
.scenes {
  position: absolute; left: 10px; bottom: 10px; right: 10px; z-index: 2;
  display: flex; gap: 6px; flex-wrap: wrap;
}
.scenes .scene {
  font: 500 12px system-ui, sans-serif; color: var(--h3d-text);
  background: var(--h3d-surface); border: 1px solid var(--h3d-border); border-radius: 999px;
  padding: 7px 12px; cursor: pointer; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  transition: transform 0.15s, background 0.2s;
}
.scenes .scene:hover { border-color: var(--h3d-accent); }
.scenes .scene.fired { background: var(--h3d-accent); color: #fff; transform: scale(0.96); }
.legend {
  position: absolute; left: 50%; transform: translateX(-50%); bottom: 56px; z-index: 2;
  display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 999px;
  background: var(--h3d-surface); border: 1px solid var(--h3d-border);
  font: 11px system-ui, sans-serif; color: var(--h3d-text);
}
.legend .bar { width: 140px; height: 8px; border-radius: 99px; }
.toolbar button.active { background: var(--h3d-accent); color: #fff; border-color: transparent; }
.chip-info {
  font: 500 12px system-ui, sans-serif; padding: 4px 9px; border-radius: 999px;
  background: color-mix(in srgb, var(--h3d-text) 7%, transparent);
}
.chip-info.motion { background: color-mix(in srgb, #ffb347 30%, transparent); }
.room-list { display: flex; flex-direction: column; gap: 2px; }
.room-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--h3d-border); }
.room-row:last-child { border-bottom: none; }
.room-row .dot { width: 8px; height: 8px; border-radius: 50%; background: color-mix(in srgb, var(--h3d-text) 25%, transparent); flex: none; }
.room-row .dot.on { background: var(--h3d-accent); box-shadow: 0 0 6px var(--h3d-accent); }
.room-row .row-name { flex: 1; text-align: left; color: var(--h3d-text); display: flex; flex-direction: column; padding: 2px 0; }
.room-row .row-name small { color: var(--h3d-muted); font-weight: 400; }
.scene-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow: auto; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.settings-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--h3d-muted); }
.settings-grid label.wide { grid-column: 1 / -1; }
.settings-grid textarea {
  font: 13px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 6px; padding: 6px; resize: vertical;
}
.levels {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 3;
  display: inline-flex; border: 1px solid var(--h3d-border); border-radius: 999px; overflow: hidden;
  background: var(--h3d-surface); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.levels button { font: 600 12px system-ui, sans-serif; color: var(--h3d-text); background: transparent; border: none; padding: 6px 14px; cursor: pointer; }
.levels button.active { background: var(--h3d-accent); color: #fff; }
.settings-grid label.check { flex-direction: row; align-items: center; grid-column: 1 / -1; color: var(--h3d-text); }
.settings-grid input[type="text"], .settings-grid input[type="number"], .settings-grid select {
  font: 13px system-ui, sans-serif; color: var(--h3d-text); background: transparent;
  border: 1px solid var(--h3d-border); border-radius: 6px; padding: 6px;
}
@media (max-width: 600px) { .settings-grid { grid-template-columns: 1fr; } }
.meter {
  font: 600 12px system-ui, sans-serif; color: var(--h3d-text); pointer-events: auto;
  background: var(--h3d-surface); border: 1px solid var(--h3d-border); border-radius: 999px; padding: 4px 10px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.scene-list label.check { display: flex; gap: 8px; align-items: center; }

/* Listes déroulantes : couleurs du thème HA, y compris la liste ouverte (sinon texte clair sur fond blanc en thème sombre). */
:host select,
:host option,
:host optgroup {
  background-color: var(--card-background-color, #fff) !important;
  color: var(--primary-text-color, #1f2328) !important;
}
:host optgroup { font-weight: 600; color: var(--secondary-text-color, #6b7280) !important; }
:host option { font-weight: 400; }
:host input[type="text"], :host input[type="number"], :host input[type="search"], :host textarea {
  background-color: var(--card-background-color, #fff);
  color: var(--primary-text-color, #1f2328);
}
`;
