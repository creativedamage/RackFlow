# Versioning and releases

## Policy

- Every release is **1.x.x** until the owner explicitly starts a new major version (e.g. "this is v2").
- Within 1.x.x:
  - **Patch** (1.0.**1**): fixes and small changes.
  - **Minor** (1.**1**.0): new features.
- The allowed major version lives in [`VERSION_MAJOR`](../VERSION_MAJOR). CI refuses to build a release whose `package.json` version has a different major. Change that file only when a new major version is decided.

## How a release happens

1. Set `version` in `package.json` (e.g. `1.0.0` → `1.1.0`).
2. Commit and push to `main`.
3. GitHub Actions (**Build & Release**) runs the version check, typecheck and tests. Then, on a macOS runner, it builds:
   - `RackFlow-<version>-arm64.dmg` and `RackFlow-<version>-x64.dmg` for people to install;
   - `RackFlow-<version>-mac-arm64.zip` and `RackFlow-<version>-mac-x64.zip`, which the app downloads to update itself.
4. It publishes GitHub Release `v<version>` with those files and auto-generated notes.

Pushes that don't change the version only run the checks. Pushing a `v*` tag, or running the workflow by hand, does the same version check.

## How installed apps update

On launch (after a few seconds) and every 4 hours, the app reads `releases/latest` from this repository. If that release is newer:

1. It downloads the zip for the Mac's architecture and unpacks it.
2. It checks that the bundle's version matches.
3. It shows **Restart to Update**.

Installing swaps `RackFlow.app` in place after the app quits, then relaunches it. If the user just quits, the swap happens on quit. If the app can't write to its folder, it links to the DMG instead.

The app is ad-hoc signed, not notarized, so it updates itself rather than through Squirrel / electron-updater, which need an Apple Developer ID. With a Developer ID you could sign and notarize in CI and keep this flow.
