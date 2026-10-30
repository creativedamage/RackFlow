// Version policy guard (used by CI and `npm run version:check`).
// All releases stay on the major version in VERSION_MAJOR until the owner
// explicitly moves to a new major (e.g. 2.x.x) by editing that file.
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const allowed = readFileSync(new URL('../VERSION_MAJOR', import.meta.url), 'utf8').trim()
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version)
if (!m) { console.error(`package.json version "${pkg.version}" must be MAJOR.MINOR.PATCH`); process.exit(1) }
if (m[1] !== allowed) {
  console.error(`Version ${pkg.version} breaks the policy: releases must be ${allowed}.x.x until VERSION_MAJOR is changed.`)
  process.exit(1)
}
console.log(`Version ${pkg.version} OK (major ${allowed}).`)
