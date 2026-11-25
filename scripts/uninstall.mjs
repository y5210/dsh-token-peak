/**
 * Removes dsh-token-peak from a DSH profile's package.json: the dependency row
 * and the bundle entry. Plugin files themselves are left in place; delete the
 * plugin folder manually after restarting DSH.
 *
 * Usage:
 *   node scripts/uninstall.mjs --profile desktop
 *   DSH_HOME=E:/dsh node scripts/uninstall.mjs --profile desktop
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const profile = arg('--profile') || process.env.DSH_PROFILE || 'desktop'
const home = process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh')
const pkgPath = join(home, 'profiles', profile, 'package.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
let changed = false

if (pkg.dependencies && pkg.dependencies['dsh-token-peak']) {
  delete pkg.dependencies['dsh-token-peak']
  changed = true
}

const bundles = pkg.dsh?.profile?.bundles
if (Array.isArray(bundles)) {
  const next = bundles.filter((item) => item !== 'dsh-token-peak')
  if (next.length !== bundles.length) {
    pkg.dsh.profile.bundles = next
    changed = true
  }
}

if (!changed) {
  console.log('dsh-token-peak: not registered in', pkgPath)
} else {
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('dsh-token-peak: removed from', pkgPath, '— restart DSH to apply')
}
