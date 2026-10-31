# RackFlow

AVL system design for the Mac.

- **Wiring diagrams** with live connection validation, patching multiples and colour-coded system groups
- **Rack elevations** with snapping and weight, power and heat analytics
- **Building power**: circuits, breakers and load roll-up from the wall to every device
- **Patch bay labels** generated from your wiring, laid out PatchCAD-style and printed at exact scale
- **Schedule**: every cable and device as an editable spreadsheet, with bulk renumbering and CSV export
- **A gear library** of about 2,300 products from 350+ manufacturers, plus builders for custom gear, wall plates and floor boxes

## Download

**[⬇︎ Download the latest RackFlow for Mac](https://github.com/creativedamage/RackFlow/releases/latest)**

On the release page, pick the DMG for your Mac:

| Your Mac | File |
|---|---|
| Apple Silicon (M1, M2, M3, M4…) | `RackFlow-x.y.z-arm64.dmg` |
| Intel | `RackFlow-x.y.z-x64.dmg` |

(Not sure which? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple Silicon.)

## Install

1. Open the DMG and drag **RackFlow** into **Applications**.
2. Open RackFlow from Applications. The first time, macOS says it can't check the developer, because the app isn't notarized by Apple yet.
   Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to RackFlow. You only need to do this once.
3. Optional: **File → Open…** `examples/Demo Conference Room.rackflow` from this repository to explore a finished project.

## Updates

RackFlow keeps itself up to date. Shortly after it opens, and every few hours while it runs, it checks this repository for a newer release. If there is one, it downloads it in the background and a **Restart to Update** button appears in the toolbar:

- **Restart Now** installs it and reopens RackFlow on the new version (you're asked to save first if you have unsaved changes).
- **Later**: the update installs when you next quit, so the next launch is current.
- **RackFlow → Check for Updates…** checks straight away.

Keep RackFlow in **Applications** so it can update itself. If it can't write there, it offers the new DMG instead.

## Using it

| Do this | How |
|---|---|
| Add gear | Drag from the left library onto the diagram, **double-click** an item in the Equipment tab, or **click** a product in the Makers tab. Clicked items land in the middle of the current view (on the Wiring Diagram even when you're on another page); ⌘Z undoes. |
| Wire | Drag from a port dot. Valid targets ring **green**, ones that work with caveats ring **amber**, and invalid ones dim and refuse the drop. The bottom hint says why. |
| Pan / zoom | Two-finger scroll pans, pinch zooms (⌘-scroll with a mouse). Drag on empty canvas to box-select. |
| Patch multiples | **Shift-click** ports to pick them (numbered badges show the order; they can be on different devices). Then drag from any picked port to the first destination. The rest land on the following ports of that device, skipping ports that are in use or incompatible. One ⌘Z undoes the batch, and Esc clears the picks. |
| Rack | ⌘2. Drag devices from "Not yet racked" into a rack; the ghost shows exactly where it will snap. Double-click a device to flip front/rear. |
| Rack panels | Drag **Blank**, **Logo**, **Brush**, **Vent**, **Lacing bar**, **Shelf** or **Drawer** panels from the Panels bar into a rack. Click one to change its height, type or label. Logo blanks take your own image (**Upload Image…**, PNG or SVG) on a black, white or silver panel. **Blanks ▾** fills the gaps between devices (or all empty space) with blank panels. |
| Print rack elevations | **Print / Export…** on the Rack page draws CAD-style elevations: rack names above, ears and screws, tag on the left, maker / model / type in the middle, blank, brush, vent and logo panels drawn and labelled. Choose sheet size, front / rear / both, which racks, and a title block (project, client, designer, revision, date, sheet, your logo). PDF, SVG or print. |
| Tidy Up | **✨ Tidy Up** (⌥⌘L) re-arranges the diagram by signal flow: sources on the left, destinations on the right, groups kept together, separate systems stacked, network switches and PDUs in a row underneath. Every wire gets its own lane so parallel runs don't stack or cross. With several devices selected it tidies just those. **Auto-tidy** does it whenever you add a device or cable. ⌘Z undoes it. |
| Wire style | **All wires** draws every run. **Smart** turns long or tangled runs into short labelled stubs at each end ("V-0012 ▸ VSW-001 · In 3"), like a CAD drawing. **Stubs** does that for every wire. Select a cable to see it in full. |
| Print wiring diagrams | **Print…** on the diagram makes a CAD-style drawing: device blocks with tag, maker, model and type, a connector badge on every port (BNC, HDMI, RJ45…), the cable number and FROM-TO tags at both ends of every wire, dashed room zones and off-sheet arrows for long runs. Use one sheet for everything, one per group or one per room. Wires that leave a sheet name the device, port and sheet they go to. Same title block, PDF, SVG or print. |
| Patch labels | ⌘3 opens a PatchCAD-style editor. Add bays from the **Templates** panel. Click or drag to select cells, type to edit (Tab for the next cell), **⌘B/I/U** to format, **⌘G** to merge cells into a group title, **123 / ABC / Σ Fill** to number cells, and the ↕ ↓ ‖ buttons (or clicking a symbol) to set normalling. Colours apply per cell or per strip. Copy and paste works with Excel and Numbers. **⟳ From wiring** fills untyped cells from the cables on each bay's rear ports. **Print / Export…** shows a 1:1 preview for PDF, SVG or printing. |
| Gear | The **Equipment** tab holds about 2,300 products (Blackmagic, Ross, DiGiCo, Allen & Heath, Yamaha, Shure, Sennheiser, QSC, Extron, Crestron, Clear-Com, Riedel, L-Acoustics, d&b, Robe, MA Lighting and many more). Search by model (e.g. "SM58", "ATEM", "dLive"), filter by category or signal, and click a category heading to collapse it or **Show all** to expand it. |
| Manufacturers | The **Makers** tab lists 350+ AVL manufacturers, each with its products grouped by category. Search by name or product line (e.g. "dLive" finds Allen & Heath, "ATEM" finds Blackmagic Design), filter by category, expand a maker to see and drag its products, or click **+ New ⟨maker⟩ product**. **+ Add Manufacturer** adds one that isn't listed. |
| Building power | Search **receptacle** (or open the **Building Power** category) and drop in a wall/floor outlet, twist-lock (L5-20/30, L6, L14, L21), Cam-Lok company switch or generator. Set its **panel, circuit and breaker** in the Inspector. Wire a PDU's or device's plug to it ("Plugged in directly" when the cord is attached). The Inspector totals the load of everything downstream, through PDUs, distros and UPSs, against the breaker and its 80% continuous limit. Overloaded circuits are flagged, and every device shows which circuit it's fed from. |
| Find a device | **🔍 Find Device…** (⇧⌘F) searches by brand, model, part number or type, and forgives typos. If the device isn't in the library, build it from the manufacturer's spec sheet: paste the **Connections** section, give it the tech-specs page address, or (with your own Anthropic API key) let **AI lookup** find the specs online. Every port is listed for review: change the quantity, label, connector, direction or signal, delete extras, add missing ones, tick **These ports are correct**, then **Save & Add to Diagram**. **Open in Full Editor…** gives you everything else. |
| Edit devices | Double-click a device on the diagram, right-click it, press ⌘E, or select it and click **Edit Device…**. **Save to This Device Only** changes just that one (it's badged *Edited*). **Save to Library & Update All** changes the product and every placed copy. Built-in and manufacturer products can be edited too: right-click them (or hover and click **Edit**) in the Equipment or Makers tab. Your version replaces the built-in one and is badged *Edited*, and **Revert** brings back the original. |
| Patch bays | On the Patch Labels page, click **+ Add Patch Bay** and then **Add** on any template, or use **Add** / double-click in the library's Patch Bays tab. Every bay is also placed on the Wiring Diagram. Patch bay jacks are passive, so any row can take a source or a destination, and bay-to-bay tie lines work. A signal above the bay's rating (e.g. 12G into a 3G bay) is a warning, not a block. |
| Network patch panels | The Patch Bays tab has RJ45 panels: Leviton eXtreme Cat6 / Cat6A and GigaMax Cat5e (24-port 1RU and 48-port 2RU as 2×24), Leviton QuickPort and Panduit Mini-Com keystone panels, and generic punch-down, feed-through (incl. 48-port high-density) and keystone panels, plus fiber LC and XLR feed-through panels. These are wired on **both sides**: the front jack (patch cord to the switch) on the left of the card and the rear termination (punch-down, coupler or keystone) on the right, numbered straight through (Port 1–48). **Layout…** on a bay (or **Change Layout…** in the Inspector) changes rows (**+ Add 1RU Row**), sockets per row, termination (punch-down, feed-through, keystone punch-down, keystone coupler), category (Cat5e / Cat6 / Cat6A / Cat8, shielded) and applies it to that bay, keeping its labels. Cables pick the panel's category automatically (patch cords at the front, horizontal punch-down cable at the rear), you can change the cable type in the Inspector or Schedule, and a lower-category cable on a higher-rated panel is flagged. |
| Wall plates & floor boxes | **+ Wall Plate** / **+ Floor Box** under the library opens the builder: choose a style (1–4 gang, Decora, 2–8 compartment, poke-thru, stage pocket), add inserts (XLR, RJ45, HDMI, USB-C, BNC, NL4, DMX, etherCON, fiber, power…), label them, and pick how each is terminated on the back. On the diagram, room-side jacks are on the left and tie lines on the right. Plates are passive. A floor box with receptacles is also a building power source. **Edit Device…** reopens the builder. |
| Custom gear | **+ New Custom Product**, or right-click a library item and choose **Duplicate as Custom**. Delete one with right-click → **Delete Product…** or **Delete Product…** in its editor. **★ My custom & edited** in the category filter lists only yours. The Manufacturer field searches the directory. If you type a maker that isn't listed, choose **+ Add as a new manufacturer** and it's saved to your list along with the product. |
| Custom panels | **Patch Bays → + New Patch Bay Template**, or **New… / Customize…** in the Templates panel, opens a PatchCAD-style editor. *The Important Stuff* tab sets rows, sockets per row, lines per strip, Mono Spaced or Paired layout (and pair spacing), and strip padding (left/right/top/bottom). It also sets the distance from strip to socket, the socket diameter and the strip height. Below that is a width for **every cell**, with **Add Gap at Cursor**, **Add Gap in the Middle**, **Delete Gap** and **Repeat Till End**, **Set all to** and **Fit total to**, and a live total label width and preview. The *Fonts* tab sets default label styling and *Notes* holds part numbers. **Save**, **Save As…**, **Delete Template…** and **Share Template…** (a .rftemplate.json, opened with **Import…** in the Templates panel). A caliper "Measure a physical panel" helper is still there. |
| Schedule (spreadsheet) | **Schedule** (⌘4) shows every cable and every device as a spreadsheet. Click, Shift-click or drag to select. Type or press Enter to edit and Tab to move. Copy and paste blocks to and from Excel, Numbers or Google Sheets, ⌘D fills down and Delete clears. Click a header to sort, and filter by text or system. In Cables you can edit Label, Cable Type (dropdown of cables that fit), Length and Notes. In Devices you can edit Tag, Room and Notes. **Renumber…** relabels cables per system (video, audio, network, power…) with your own prefix, start number, digit count and separator. It can number in source, destination, label or drawing order, for all, selected or filtered rows, and keeps every label unique. **Export CSV** on both tabs. Every bulk change is one undo. |
| Undo / redo | ⌘Z / ⇧⌘Z or the toolbar arrows; hover them to see what will be undone. In a text field you're typing in, ⌘Z undoes the typing; once you've stopped editing it undoes the document. Bulk changes (renumber, patch multiples, grouping, adding gear) show a notification with an **Undo** button. |
| Groups | Select devices and press **⌘G** (or **Group** in the Inspector or in the Groups panel at the top left of the diagram). The system (Audio, Video, Lighting, Network…) is detected for you and can be changed, including a custom colour. Groups draw a coloured, labelled frame. Drag the label to move the whole group, double-click it to select its members, and use ◉ to spotlight one group and dim the rest. **Auto-group by system** sorts every ungrouped device. **⇧⌘G** ungroups. The Inspector and the Schedule's Devices sheet have a Group column. |
| Locations | A device's **Room** now shows on its card under the tag. With several devices selected, the Inspector sets the room for all of them at once. |
| Design check | The toolbar pill shows error and warning counts. Click it for a list you can filter (All, Errors, Warnings, Notes); click an issue to jump to it. |

Your custom products, manufacturers and templates are kept in `~/Library/Application Support/RackFlow/`, so updating the app never touches them.

## Data caveats

- **Catalog specs are approximate.** Model names and I/O follow each manufacturer's published range. Weight, depth and power are approximate, and some I/O is simplified (for example, card-slot frames list their fixed ports only). Every catalog product shows a "check the spec sheet" note in the Inspector. Before ordering or doing load calculations, **Duplicate** the product, correct it from the spec sheet and tick the "I've checked these specs" box. Product ranges change, so a current model may be missing or a listed one discontinued.
- **Patch bay templates** from Bittree, Neutrik, ADC, Canare and Redco use nominal strip dimensions and are flagged in the app. Verify them against the manufacturer's label template before printing a full run, or measure the real panel in the Template Builder.
