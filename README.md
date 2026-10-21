# Blueprint3D Card

**English** · [Français](README.fr.md)

A Lovelace card for Home Assistant: your home in 3D, with your lights, air conditioners, vacuum, blinds, TV and sensors. Click a device to control it.

![Blueprint3D Card: demo house in 3D](docs/screenshot.png)

- The house is **built from a simple floor plan** (rectangular rooms in metres). No Blender needed.
- Walls are generated automatically, and the ones facing the camera lower themselves so you can see inside.
- Lights that are on **actually light up the room**, with their colour and brightness.
- The AC blows air, the robot vacuum moves around, the blinds go up and down.
- The sun follows `sun.sun`: shadows during the day, dim ambience at night.
- A click **toggles** a light, plug or fan. A long press, right-click or click on the label **opens the control panel**.
- An **edit mode** lets you place and move devices with the mouse, then export the YAML config.

## Installation

### HACS

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=ThomasLpgs&repository=blueprint3d-card&category=plugin)

1. In HACS, open **⋮ → Custom repositories** and add `https://github.com/ThomasLpgs/blueprint3d-card` with the **Dashboard** category. The button above does the same.
2. Search for **Blueprint3D Card** and click **Download**. HACS adds the resource for you.
3. Reload the page (clear the companion app cache on your phone), then [add the card to a dashboard](#add-the-card-to-a-dashboard).

Updates then show up in HACS.

### Manual

1. Download `blueprint3d-card.js` from the [latest release](https://github.com/ThomasLpgs/blueprint3d-card/releases/latest) (or run `npm install` then `npm run build`, which writes it to `dist/`).
2. Copy `blueprint3d-card.js` to `/config/www/` on Home Assistant.
3. Go to **Settings → Dashboards → ⋮ → Resources** and add `/local/blueprint3d-card.js` as a **JavaScript module**.
4. [Add the card to a dashboard](#add-the-card-to-a-dashboard).

### Add the card to a dashboard

The card works best on its own full-screen dashboard:

1. **Create the dashboard**: **Settings → Dashboards → + Add dashboard → New dashboard from scratch**. Give it a title (e.g. `3D Home`) and an icon (e.g. `mdi:home-floor-3`), keep **Show in sidebar** ticked, then **Create**.
2. Open it from the sidebar and click the pencil ✏️ (top right) to edit it.
3. **Make it full screen**: click the pencil next to the view's name, set **View type** to **Panel (single card)**, then **Save**.
4. **Add the card**: click **+ Add card**, then in the **By card** tab either:
   - search for `blueprint3d` and pick **Blueprint3D Card** (searching for `type: custom:…` finds nothing: the search looks at the card's name), or
   - scroll to the very bottom of the list, pick **Manual**, replace the content with `type: custom:blueprint3d-card`.

   Both give the same card. Click **Save**, then **Done**.

On an empty config, the card shows a demo apartment. Click **✎ Edit** in the card to draw your plan, then **💾 Save**. Your home is stored in the dashboard config (✏️ → ⋮ → **Raw configuration editor**), not in the JS file, so updating the card never loses it.

## Configuration

With no rooms configured, the card shows a demo apartment and places your real entities in it automatically.

The interface is in French when Home Assistant is set to French, and in English otherwise.

```yaml
type: custom:blueprint3d-card
title: My home
height: 500          # height in px (masonry view)
wall_height: 2.5     # m
sun_entity: sun.sun  # day/night lighting
north: 0             # angle (°) between the top of the plan and north
compact_labels: false
max_labels: 3        # labels expanded in the foreground (default: 3 on phones, all on large screens)
rooms:               # rectangles in metres, x to the right, y downwards
  - name: Living room
    x: 0
    y: 0
    w: 6
    d: 4.5
    floor: "#c9a77c"
  - name: Kitchen
    x: 6
    y: 0
    w: 3.5
    d: 4.5
openings:            # centre of the opening, placed on a wall
  - type: door
    x: 6
    y: 2.8
    width: 1.2
  - type: window
    x: 2.2
    y: 0
    width: 2.2
furniture:           # optional: sofa, bed, table, box
  - type: sofa
    x: 0.6
    y: 3.2
    w: 2.6
    d: 0.95
devices:
  - entity: light.living_room
    position: [2, 1.8]       # [x, y] on the plan
  - entity: climate.living_room
    position: [4.2, 0.15]    # close to a wall: snaps to it
  - entity: vacuum.robot
    position: [1.3, 0.8]     # dock location
  - entity: cover.living_room_blind
    position: [2.2, 0]       # on a window: takes its width
    height: 2.3              # optional
    name: Blind              # optional
```

- **L-shaped room**: two rectangles side by side **with the same name**. No wall is created between them.
- **Balcony, terrace**: add `outdoor: true` for a floor without walls.
- **Openings**: `door` (doorway), `glass_door` (glazed French door) or `window` (window with a sill).

A full example house is in `examples/maison.yaml`. To view it locally: `npm run dev`, then open `/dev/index.html?plan=maison`.

### Supported devices

| Domain | 3D rendering | Click | Control panel |
|---|---|---|---|
| `light` | Pendant with real coloured light | Toggle | Brightness, colour temperature, colour |
| `climate` | Wall split unit, blue or orange airflow | Panel | Mode, target temperature, fan |
| `vacuum` | Robot and dock, animated movement | Panel | Start, pause or stop, dock, locate (according to what the vacuum supports) |
| `cover` | Roller blind on the window | Panel | Open, stop, close, position |
| `fan` | Spinning ceiling fan | Toggle | Speed |
| `switch`, `input_boolean` | Plug with LED | Toggle | — |
| `media_player` | TV whose screen animates while playing | Panel | Play, track, volume |
| `sensor`, `binary_sensor` | Small box with a label | Panel | Value |

Without a position source, the robot's movement is **simulated**: it wanders around its room while cleaning (see *Vacuum* below for the real position).

## Everyday use

- **Room panel**: click a room's floor to open it. It lists the room's devices, temperature, humidity, detected motion and power use, with "All on" and "All off" buttons. Devices marked "confirmation" are never triggered as a group without approval.
- **Scenes**: buttons at the bottom of the card run `scene.*` or `script.*`. Pick them with **🎬 Scenes** in edit mode.
- **Live doors and windows**: interior doors are open, the others closed. A door leaf follows its contact sensor, either linked in the 2D editor or placed within 80 cm. An **alert** shows when a window is open while the room's AC is running.
- **Heatmap** (🌡️ button): floors are coloured by temperature, humidity or power use. A legend shows the scale.
- **Presence**: people (`person.*`) are shown, in colour when they're home. A room glows softly when motion is detected in it.
- **Energy**: each device's power is shown (e.g. "45 W"). The plug's sensor (Tapo P110, Hue…) is found automatically in the same HA device. The home meter (Linky…) is set in **⚙ Settings**.
- **Vacuum**: with Xiaomi Cloud Map Extractor (or any entity exposing `vacuum_position` and `charger`), the robot follows its real position and draws its path. The dock is the reference point; rotation and mirroring are set in its panel.
- **Cameras**: the panel shows the live stream with Home Assistant's player (WebRTC or HLS), otherwise a snapshot refreshed every 3 s.
- **Floors**: declare them in ⚙ Settings (one name per line), then a selector appears at the top of the card. The 2D editor shows the floor below as dotted lines.
- **Weather**: rain or snow on the terrace and balcony (wet, shiny floor), and a dimmed sun when it's overcast, based on `weather.*`.
- **Rendering**: procedural parquet, tiles and decking, contact shadows, lamp glow, natural tone mapping, baseboards, frames, door leaves and glass railings. Furniture has rounded edges and cushions. Quality is set with `quality: auto | high | low`.

## Editing

Click **✎ Edit**. Two tabs appear at the bottom of the card, along with the 📚 Library, 🎬 Scenes and ⚙ Settings buttons (title, meter, weather, quality, ceiling height, north, floors, people).

### 💡 Devices (3D view)

1. Pick an entity from the list, then click in the house to place it.
2. Drag a device to move it. Click it to remove it.
3. The device panel has height presets (Floor / Furniture / Wall / Ceiling), a height slider and a rotation. On a phone, the camera zooms to the device and ◀ ▶ ▼ ▲ buttons nudge it.

### 📐 Plan (2D view)

| Tool | Usage |
|---|---|
| ↖ Select | Click to select, drag to move, handles to resize. Mouse wheel to zoom, drag on empty space to pan. `Del` deletes, arrow keys move by 5 cm (`Shift`: 50 cm). |
| ▭ Room | Drag to draw a room. Moving a room takes its furniture, devices and doors with it. |
| Door, French door, window | Click a wall to place the opening, then slide it along the wall or adjust its width with its handles. |
| ▣ Furniture | Pick the type (sofa, bed, table, desk, chair, wardrobe, kitchen unit, plant, block), then drag to draw it. A single click places it at its default size. |
| ⧉ Overlay | Load an image of your floor plan (PNG or JPG, or a screenshot of the PDF). Align it with the handles, then trace your rooms over it. |

The right-hand panel sets each element's properties: name, dimensions to the centimetre, floor colour, outdoor, type, height, etc. It also lets you duplicate, rotate or delete.

### 📚 Object library

The **📚 Library** button (in edit mode, in both tabs) offers about 250 objects, with search, categories and a brand filter:

| Category | Examples |
|---|---|
| Lighting | Hue A60, GU10, Go, Iris, Play, Lightstrip, Gradient TV, Signe, Being · Tapo L530, L510, L630, L900, L920 · Govee bulb, strip, Envisual TV, Lyra, Glide Hexa, table lamp · pendant, ceiling light, spotlight, floor lamp… |
| Plugs | Hue Smart Plug, Tapo P100 and P110, Govee, generic |
| Sensors | Hue Motion, Secure, Dimmer · Tapo T100, T110, T310, S200B · Govee H5075 · smoke… |
| Cameras | Tapo C200, C100, generic (snapshot preview in the panel) |
| Climate & cleaning | Air conditioner, vacuum (incl. Tapo RV10), fan, blind |
| Media | TV, Echo Dot, Nest Mini |
| Pets | Litter-Robot 4, Petkit Pura Max, generic litter box, food dispenser |
| Bridges & hubs | Hue Bridge, Tapo H100 |
| Furniture | Sofa, armchair, bed, bedside table, desk, chair, wardrobe, bookcase, TV stand, rug, kitchen, fridge, washing machine, toilet, sink, shower, bathtub, plant… |

To place an object, pick it and click in the house. Its panel opens so you can **link it to a Home Assistant entity**. Entities from the same brand are suggested first, based on the integration (hue, tplink, govee, litterrobot…).

You can link an object to an entity of another type, for example a bedside lamp plugged into a Tapo plug (`switch.*`). The panel then shows the linked entity's controls.

For a sensitive device (garage door, water heater…), tick **Ask for confirmation before acting** in its panel, or add `confirm: true` to the config. Locks, alarm panels, valves, sirens and water heaters always ask for confirmation.

### Saving

- **💾 Save** writes the config directly to the dashboard. This needs a UI-managed dashboard (not YAML mode) and an admin account.
- Otherwise, the card shows the YAML to paste into the card editor.

### Import and export

- **⤓ Export config** shows the full YAML (plan, furniture, devices, overlay), to copy or **download** as a `.yaml` file. Handy to back up your home or share it.
- **⤒ Import** accepts YAML or JSON, pasted or loaded from a `.yaml`, `.yml` or `.json` file. It can be the card config alone, or a full dashboard config: the card finds its own config in it.
- Imported content replaces the plan and devices, but nothing is saved until you click **💾 Save**.
- **Import safeguards**:
  - 5 MB maximum;
  - no executable YAML tags;
  - only known keys are kept;
  - the config goes through the same validation as when the card loads;
  - an invalid file or another card's config is rejected with a clear message.

## Security

- **No data leaves Home Assistant.** The card only talks to your instance, through the dashboard's `hass` object. No server, no account, no external calls.
- **Limited actions**: the card only calls services on the linked entity (`toggle`, `turn_on`, `set_temperature`, `open_cover`…). Sensitive domains (locks, alarms, valves, sirens, water heaters) always require confirmation.
- **Escaped text**: everything that comes from entities (names, attributes) or from the config is escaped before display.
- **Validated config**: the config is checked on load (types, ranges, entity_id, colours, overlay URL). An invalid value is ignored with a console warning, without crashing the card.
- **Careful saving**: it only replaces this card, and only if it is found exactly once in the dashboard. Otherwise, the card offers the YAML export.
- **Keyboard shortcuts**: typing in the card doesn't trigger Home Assistant's shortcuts.

## Development

```sh
npm install
npm run dev     # http://localhost:5199/dev/index.html (fake Home Assistant)
                # ?plan=maison: the example house; ?night: night rendering;
                # ?edit / ?edit=plan: opens edit mode directly
npm run build   # dist/blueprint3d-card.js
npm run test:e2e  # ~200 end-to-end checks (Edge by default, H3D_BROWSER=chrome otherwise)
npm run check   # types + dependency audit + tests
```

To publish a version: set the same number in `package.json` and `VERSION` (`src/blueprint3d-card.ts`), then push a `vX.Y.Z` tag. The `release.yml` workflow builds the card and attaches `blueprint3d-card.js` to the GitHub release, which HACS then offers as an update.

| File | Role |
|---|---|
| `src/blueprint3d-card.ts` | The Lovelace element: scene, camera, interactions, edit mode |
| `src/house.ts` | Builds floors, walls, openings and furniture, and cuts walls according to the camera |
| `src/devices.ts` | 3D rendering and animation of each device type |
| `src/panel.ts` | Control panel |
| `src/editor.ts` | 2D plan editor (rooms, openings, furniture, overlay) |
| `src/catalog.ts` | Object library (models, 3D shapes, brands) |
| `src/library.ts` | Library panel |
| `src/entities.ts` | Picking the entity to link (suggestions by brand) |
| `src/validate.ts` | Config validation |
| `src/importer.ts` | Reading imported files (YAML / JSON) |
| `dev/` | Demo page with a fake `hass` |

Inspired by [house-control](https://github.com/0xProbabillity/house-control) (MIT).
