// electron-builder afterPack: if the release build compiled the Liquid Glass icon
// (build/Assets.car, from build/RackFlow.icon with Xcode 26's actool), put it in
// the app and point Info.plist at it. macOS 26 then shows the native icon; older
// macOS keeps using icon.icns. Without Assets.car nothing changes.
const { existsSync, copyFileSync } = require('fs')
const { join } = require('path')
const { execFileSync } = require('child_process')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const car = join(context.packager.projectDir, 'build', 'Assets.car')
  if (!existsSync(car)) return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents')
  copyFileSync(car, join(app, 'Resources', 'Assets.car'))
  try {
    execFileSync('plutil', ['-replace', 'CFBundleIconName', '-string', 'RackFlow', join(app, 'Info.plist')])
    console.log('  • Liquid Glass icon added (Assets.car, CFBundleIconName = RackFlow)')
  } catch (e) {
    console.warn('  • could not set CFBundleIconName:', e.message)
  }
}
