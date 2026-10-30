# RackFlow – Technical Specification (Electron edition)

A cross-platform desktop design tool for AVL system integrators. It aims to feel as easy as Whimsical and be as precise as ConnectCAD. This edition replaces the earlier Swift/SwiftUI scaffold and keeps the same domain model, rules and file format.

## 1. Pillars

| Pillar | In practice |
|---|---|
| Diagram-first | Drag a device in and start wiring. No setup, layers or classes. |
| Database-driven | Devices, ports and cables are structured data. Diagram, racks, patch labels and the issues list are all views of one `Project`. |
| Correct by construction | Invalid connections are prevented while you drag a wire, not reported afterwards. |
| Self-contained | One installable app (macOS .dmg, Windows .exe). No server, Docker or account. `.rackflow` files are plain JSON. |

## 2. Architecture

```
┌───────────── Renderer (Chromium, sandboxed, no Node) ─────────────┐
│ React 19 + zustand store (Immer snapshots → undo/redo)             │
│  Toolbar · Sidebar (library) · DiagramView (React Flow)            │
│  RackView (DOM) · PatchLabels (SVG) · Inspector · Builders (modal) │
│  platform.ts → window.rackflow  (or browser shim for web/tests)    │
└───────────────┬────────────────────────────────────────────────────┘
                │ typed IPC (src/preload/api.d.ts) via contextBridge
┌───────────────▼──────────── Main process (Node) ───────────────────┐
│ Window, native menu & accelerators, open/save dialogs, atomic save,│
│ recent docs, unsaved-changes prompt, .rackflow file association,   │
│ user library (JSON per item), printToPDF / print at 1:1            │
└────────────────────────────────────────────────────────────────────┘
        Both import the platform-free engine:  src/core  (TypeScript)
```

**Security:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a strict CSP, and external links opened in the browser. The renderer can only call the methods declared in `RackflowAPI`.

**Why Electron:** it gives one codebase for macOS and Windows (many integrators use Windows), a mature canvas ecosystem (React Flow), and Chromium's PDF engine for exact-scale label output. It is also fully testable headless: the UI runs in plain Chromium through the browser shim, which is how it is verified.

## 3. Canvas strategy

| View | Technology | Why |
|---|---|---|
| Wiring diagram | **React Flow (@xyflow/react 12)** with a custom `DeviceNode` | Production-grade pan/zoom/pinch, selection, marquee, snapping, minimap, per-port handles, connection lines and `isValidConnection`, without reinventing a scene graph. Nodes are DOM, so text is crisp and accessible. |
| Rack elevation | Plain DOM, absolutely positioned | Bounded size (≤ 60 U), so the DOM is fastest to build and needs no canvas maths. HTML5 drag and drop shows a live snap "ghost". |
| Patch strips | SVG in millimetre units (`viewBox` in mm) | The screen preview uses the same geometry and font-fit maths as the export, so what you see is what prints. |

**Wiring interaction:**

1. On `onConnectStart`, `candidates(project, origin)` runs the cheap ("live") rules against every port.
2. Node components read that map: valid ports ring green, caution ports amber, and all others dim to 28 %.
3. `isValidConnection` refuses drops onto anything not in the map.
4. `WiringHint` validates the hovered target and shows the reason, e.g. "✓ HDMI 2.0 · HDMI Ultra High Speed" or "✕ Speaker-level output must not feed a line input".
5. On drop, `connect()` normalises direction, auto-labels the cable (V-0001, A-0001…) and picks the best-fitting cable type.

**Performance plan:** React Flow virtualises off-screen nodes (`onlyRenderVisibleElements` can be enabled for very large drawings). The candidate scan is O(ports) per drag start. Beyond about 5k ports it should move to a worker and pre-filter by domain.

## 4. Data model (`src/core/model.ts`)

```
Project { schemaVersion, info, equipment[], cables[], racks[], patchBays[] }
EquipmentInstance { id, tag "DSP-01", product (embedded snapshot), position, rackPlacement?, room, notes }
ProductDefinition { key, manufacturer, model, category, physical, power, ports[], source, revision }
PortTemplate { id, label, connector, gender, direction, signals[], group, face, maxConnections, powerCapacityWatts? }
Cable { id, label "V-0012", from: PortAddress, to: PortAddress, specKey?, lengthMeters?, notes }
Rack { id, name, spec { rackUnits, mountingDepthMM, maxLoadKG, coolingCapacityBTU }, accessories[] }
PatchBay { id, name, equipment, template (snapshot), format, style, cells[] }
```

- **Plain JSON, immutable updates.** Every edit is `apply(label, draft => …)` through Immer. The previous state goes on the undo stack (up to 200 steps), and structural sharing keeps that cheap. Diagram moves commit once on drag stop, so they produce one undo step. Text fields commit on blur or Enter.
- **Branded string IDs** (`EquipmentId`, `CableId`, …) catch ID mix-ups at compile time.
- **Embedded product snapshots** keep files portable and stop catalog updates from silently changing a signed-off drawing.
- **Signal type, connector and gender are separate.** An RJ45 can carry Ethernet, Dante or HDBaseT.
- **Saves are atomic** (write to a temp file, then rename). Migrations hook into `parseProject` via `schemaVersion`.

## 5. Product database

- **Built-in catalog**: about 2,300 products across all 350 manufacturers in the directory.
  - `core/catalog.ts` holds 15 `GENERIC_PRODUCTS`, which are also the test fixtures.
  - `core/catalog/*.ts` holds the manufacturer catalog, split by discipline: video, audio consoles, install audio and loudspeakers, mics/wireless/intercom/conferencing, displays/distribution/control, lighting, network/power/infrastructure, plus extras.
  - Entries are written in a compact DSL (`catalog/dsl.ts`). For example, `P(maker, model, category, summary, '4 hdmiIn, hdmiOut, lan, dc12', {ru, w, kg})` expands port tokens into typed ports and fills in default power.
  - Model names and I/O follow each manufacturer's published range. Weight, depth and power are approximate, so every entry carries `verified: false` and a `dataNote`.
  - The Inspector and Product Builder show that note. The builder has a checkbox to mark a product as checked once the user has compared it with the spec sheet.
  - Tests check that every entry is valid, every key is unique, every maker name matches the directory exactly, and every powered device has a power inlet.
- **User inventory:** one JSON file per product in `userData/Products`. User keys shadow built-ins, so "Duplicate" forks a catalog item.
- **Search:** `ProductLibrary.search` does accent-folded, token-AND search with relevance ranking, plus category, signal-domain and rack-mountable filters. It is fine to about 10k items. Beyond that, swap in SQLite FTS5 (`better-sqlite3` in main, queried over IPC) behind the same interface.
- **Product builder:** identity; physical (U, half-width, W×H×D, weight, mounting); power (voltages, typical/max W, efficiency, PoE, BTU calculated or overridden); and a port table (connector, gender, direction, multi-signal picker with connector suggestions, group, face, reorder). It includes 13 quick presets, "Add series" ("16 × Mic In {n}"), duplicate, a live node preview, and validation that gates Save.

### 5.1a Manufacturer directory (`core/manufacturers.ts`)

- 350+ AVL manufacturers across audio, video, display and projection, lighting, control, networking, conferencing, broadcast, infrastructure, rigging and power. Each entry has a name, categories and product-line aliases, so "dLive" resolves to Allen & Heath, "ATEM" to Blackmagic Design and "grandMA3" to MA Lighting. A test ensures no alias collides with another maker's name.
- `ManufacturerDirectory` merges built-in makers, user-added makers (`userData/Manufacturers.json`) and any maker named by a saved product. It provides exact lookup, alias resolution and ranked search (names before aliases, with a category filter).
- **Product builder:** the Manufacturer field is a searchable picker. It warns when a product line was typed instead of a maker (e.g. "ATEM" → use Blackmagic Design). An unlisted name becomes a new user manufacturer when the product is saved, with categories guessed from the product category.
- **Sidebar Makers tab:** browse, search and filter makers, see each maker's products (draggable), "+ New ⟨maker⟩ product", and "+ Add Manufacturer".
- **Scope:** the directory holds names only. Product specs are never inferred from it.

## 6. Validation engine (`src/core/validation`)

```ts
interface ConnectionRule { id: string; gate?: boolean; live?: boolean; evaluate(ctx): ValidationIssue[] }
```

Rules run in order. An error from a *gate* rule stops evaluation, so there is no follow-on noise.

| Rule | Gate | Live | Example |
|---|---|---|---|
| self-connection | ✓ | ✓ | same port → error; same device → loopback warning |
| domain | ✓ | ✓ | **signal ↔ AC receptacle → error** |
| direction | ✓ | ✓ | input→input / output→output → error |
| signal | | ✓ | compatibility matrix (below) |
| occupancy | | ✓ | port already used → error |
| connector | | | **SDI (BNC) cable on an HDMI port → error**; mismatched connectors without a chosen cable → info |
| cable-rating | | | Premium HDMI carrying HDMI 2.1 → warning |
| cable-length | | | HDMI over 5 m → warning; **Cat6A over 100 m → error** |
| power-capacity | | ✓ | device max draw above outlet rating → warning |

**Compatibility matrix** (`core/compatibility.ts`), by signal family and tier:

- HDMI and DisplayPort negotiate down (degraded); HDMI↔DVI is degraded (no audio); HDMI→DP is incompatible.
- SDI does not negotiate: a lower rate into a higher-rate input is fine, a higher rate into a lower-rate input is incompatible.
- Mic↔line is degraded. Speaker level into anything but a loudspeaker is incompatible. Low-Z↔70/100 V is incompatible.
- IP protocols over Ethernet are exact. Dante↔AES67 is degraded. sACN↔Art-Net is incompatible.
- Power voltages must match.

**Auditor** (`audit(project)`), debounced 150 ms after each edit, checks:

- every cable;
- duplicate tags and labels;
- unpowered devices and non-rackable items placed in racks;
- rack checks;
- stale patch labels.

Results feed the toolbar badge and the Design Rule Check panel, where clicking an issue selects its subject.

## 7. Rack engine (`core/rack.ts`)

- Units are 1-based from the bottom. Half-width devices take left or right slots.
- **Conflicts:** overlapping units on the same face, or front and rear devices whose combined depth exceeds the mounting depth.
- `nearestFreeStart` searches outward from the cursor; it drives the live drop ghost.
- **Analytics:** used U; weight; typical and maximum watts; amps at a given voltage; BTU/hr (typical × (1 − efficiency) × 3.412, or the published figure); centre of gravity; heat and weight per U.
- **Checks:** bounds, overlap, depth, load rating, top-heavy (centre of gravity above 50 % of height), cooling capacity, and hot spots (three consecutive U above 500 BTU/hr).

## 8. Patch bay labeling (`core/patchbay`, `renderer/patch`)

- **Geometry:** `centre(i) = firstCentre + i·pitch + ⌊i/bankSize⌋·bankGap`. This covers continuous strips, banked strips and custom panels.
- **Binding:** `makePatchProduct` turns a template into equipment with one rear port per channel (`r1.c01` …). Top rows are inputs fed by sources, bottom rows are outputs, and single-row panels are bidirectional. Bays are wired like any device, so the validator applies to them. `refreshLabels` renders the tokens `{tag} {port} {signal} {cable} {room} {ch} {model}` from what is cabled to each rear port. **Manual overrides survive refresh**, and the auditor reports labels that have gone stale.
- **Template library:** generic templates for every format, plus Bittree, Neutrik, ADC, Canare and Redco families at common sizes. Their geometry is **nominal** and flagged `dimensionsVerified: false`. The UI badges these templates and shows a banner before printing. Each entry needs verifying against the manufacturer's strip template for a specific part number.
- **Template builder:** single to quad rows, shared or per-row geometry, banks and gaps, lines per cell, rear connector and direction, normalling. **Measure mode** derives the pitch from caliper readings. A to-scale preview shows channel-centre ticks and a dimension readout, and geometry problems are checked.
- **Output:** `layoutLabels` places strips on pages in millimetres at 1:1 and splits strips wider than the printable area at channel boundaries, marked "(cont.)". It adds cut marks and captions, and fits fonts conservatively (`textLength` compresses but never stretches). The export formats are:
  - **SVG:** width and height in mm, viewBox in mm.
  - **PDF:** HTML with CSS `@page { size: W mm H mm }`, rendered by `printToPDF({ preferCSSPageSize: true })`. Verified: Letter landscape produces an exact 792 × 612 pt MediaBox.
  - **Print:** Chromium print with no margins and 100 % scale.

### 8.6 PatchCAD-style editor (v0.3)

- **Model additions:** `PatchBay.location`; `spans` (group titles over a channel range per strip); `normals` (one band per top/bottom row pair, with per-channel `none | half | full | parallel`, seeded from the template's normalling); `rowFill` (strip colour); and `LabelCell.style` (bold, italic, underline, strike, size, font, colour, fill, align). Older files are upgraded on open by `upgradeBay`.
- **Editing operations** (`core/patchbay/editing.ts`, all pure and undoable): style and toggle a range, fill a series (`{n} {nn} {A} {a}`), merge a title (overlapping titles are trimmed, not deleted), remove titles, set or cycle normalling, copy and paste TSV, clear.
- **UI:**
  - A project info bar (name, location, client, revision, bay count).
  - A formatting toolbar.
  - Stacked bays, each with a header (index, name, location, make, model, type, points), a channel ruler, title bands with bracket lines, cell rows, and a clickable normalling row.
  - A Make/Model/Type/Rows/Holes template browser in the right panel.
  - Keyboard: arrows, ⇧-extend, type-to-edit, Enter, Tab, Delete, ⌘B/I/U/G, ⌘A, and copy/cut/paste.
- **Print:** titles print as bracketed bands; styles and fills carry through; normalling symbols print along the strip's lower edge (this can be turned off). Over-wide strips are split into balanced pieces (48 → 24 + 24), on bank boundaries where possible.

## 9. Testing

- `npm test` runs the vitest suite. It has 46 tests covering every requirement's must-block case, the compatibility matrix, connect auto-labelling and cable choice, rack overlap, depth and analytics, strip geometry, measure mode, label binding with manual overrides, strip splitting and SVG scale, catalog validity (including manufacturer-catalog integrity), and the JSON round trip.
- The UI has been verified end to end in headless Chromium against the production build:
  - load the demo;
  - start a wire and confirm that only the 3 valid HDMI inputs light up while the rest dim;
  - drop to create V-0004;
  - attempt an invalid drop and confirm it is refused;
  - undo;
  - check the rack, patch, product builder and template builder views;
  - confirm there are no console errors.
- Next: Playwright-for-Electron smoke tests in CI, plus golden-file SVG and PDF tests.

- **Real Electron (Linux build, headless, via Playwright `_electron`):** context isolation (no `require` or `process` in the renderer); the preload bridge; the open-file event; native menu → renderer commands; user-library IPC; the window title tracking the document; and `printToPDF` producing an exact 1224 × 792 pt tabloid page.
- **macOS package:** built with electron-builder (`--mac --arm64`) and ad-hoc signed (every Mach-O and nested helper carries an ADHOC code directory), so Apple Silicon will launch it. Notarization requires an Apple Developer ID.

## 10. Roadmap

| Milestone | Scope |
|---|---|
| 0.2 | Electron rebuild of all features, plus the demo project |
| 0.3 | Cable schedule table and CSV/XLSX export; diagram sheets/pages; multi-select align and distribute; copy/paste; product revision updates |
| 0.4 (this) | Manufacturer catalog of ~2,300 products across 350 makers, with unverified-spec flags |
| 0.5 | Spec-sheet verification workflow and catalog updates; SQLite/FTS5 import pipeline; DB25/multipin breakouts for TT bays; tie-lines and signal-path tracing |
| 0.6 | Title blocks and PDF drawing sets; PoE budgets; IP and Dante address schedules |
| 1.0 | Signed and notarised builds with auto-update; collaboration; DWG/DXF export |
