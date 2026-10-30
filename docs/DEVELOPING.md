# Developing RackFlow

Notes for working on the code. End users install the DMG from Releases (see the README).

```bash
npm ci            # .npmrc sets legacy-peer-deps
npm run dev       # run from source with live reload
npm test          # core engine tests
npm run typecheck
npm run dist:mac  # DMG + zip in dist/ (on a Mac)
```

## Project layout

```
src/
  core/        Platform-free engine: signals, compatibility matrix, model, validation
               rules, rack layout, catalog, patch-bay templates/binding/layout/SVG (+ tests)
  main/        Electron main: window, native menu, file dialogs, user library, PDF/print
  preload/     Secure IPC bridge (contextIsolation, sandbox) + typed API contract
  renderer/    React UI: diagram (React Flow), rack view, inspector, builders, patch labels
examples/      Demo project
scripts/       make-demo.ts (regenerates the demo from the core API)
docs/          ARCHITECTURE.md
```


## Releasing

See [VERSIONING.md](VERSIONING.md). In short: bump `version` in `package.json`, push to `main`, and the **Build & Release** workflow builds the DMGs and zips on a macOS runner and publishes release `vX.Y.Z`. Installed copies pick it up automatically.
