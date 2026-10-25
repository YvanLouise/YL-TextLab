import { existsSync, lstatSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const dryRun = process.argv.includes('--dry-run')
const targets = ['dist', 'test-results', 'playwright-report', 'coverage']

function sizeOf(path) {
  if (lstatSync(path).isSymbolicLink()) return 0
  if (!statSync(path).isDirectory()) return statSync(path).size
  return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0)
}

let total = 0
for (const name of targets) {
  const target = resolve(root, name)
  if (!existsSync(target)) continue
  const resolved = realpathSync(target)
  const inside = relative(root, resolved)
  if (lstatSync(target).isSymbolicLink() || inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || resolved !== target) {
    throw new Error(`Refusing to clean an unexpected path: ${target}`)
  }
  const bytes = sizeOf(target)
  console.log(`${dryRun ? 'Would remove' : 'Removing'} ${target} (${bytes} bytes)`)
  if (!dryRun) rmSync(target, { recursive: true })
  total += bytes
}
console.log(`${dryRun ? 'Reclaimable' : 'Reclaimed'}: ${total} bytes`)
