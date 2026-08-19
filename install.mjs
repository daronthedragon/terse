#!/usr/bin/env node
/**
 * Install terse as a Claude Code output style.
 *
 * Installing by hand means copying a file and then editing settings.json, and
 * editing settings.json by hand is where people lose their other settings. This
 * merges one key into whatever is already there, keeps a backup, and can undo
 * itself.
 *
 *   node install.mjs                  install the default level, user-wide
 *   node install.mjs --level ultra    install terse-ultra instead
 *   node install.mjs --project        install into ./.claude instead of ~/.claude
 *   node install.mjs --uninstall      restore the previous outputStyle
 *   node install.mjs --dry-run        print what would change, touch nothing
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LEVELS = { lite: 'terse-lite', full: 'terse', ultra: 'terse-ultra' }

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valueOf = (f, fallback) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback
}

const level = valueOf('--level', 'full')
const styleName = LEVELS[level]
if (!styleName) {
  console.error(`unknown --level "${level}". Use one of: ${Object.keys(LEVELS).join(', ')}`)
  process.exit(2)
}

const dryRun = has('--dry-run')
const root = has('--project') ? join(process.cwd(), '.claude') : join(homedir(), '.claude')
const settingsPath = join(root, 'settings.json')
const stylesDir = join(root, 'output-styles')
const source = join(HERE, 'output-styles', `${styleName}.md`)

/** Read settings.json, treating "missing" and "empty" as an empty object, but a
 * malformed file as a hard stop - overwriting it would lose real settings. */
function readSettings() {
  if (!existsSync(settingsPath)) return {}
  const raw = readFileSync(settingsPath, 'utf8').trim()
  if (raw === '') return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('settings.json is not a JSON object')
    }
    return parsed
  } catch (err) {
    console.error(`refusing to touch ${settingsPath}: ${err.message}`)
    console.error('fix or move that file, then run this again.')
    process.exit(1)
  }
}

const settings = readSettings()
const previous = settings.outputStyle

if (has('--uninstall')) {
  // Put back whatever was there before, or drop the key entirely.
  const restored = { ...settings }
  const backup = restored.__terseBackup
  if (backup === undefined) delete restored.outputStyle
  else restored.outputStyle = backup
  delete restored.__terseBackup
  if (dryRun) {
    console.log(`would write ${settingsPath}: outputStyle -> ${restored.outputStyle ?? '(removed)'}`)
    process.exit(0)
  }
  writeFileSync(settingsPath, JSON.stringify(restored, null, 2) + '\n', 'utf8')
  console.log(`uninstalled. outputStyle is now ${restored.outputStyle ?? 'unset (default)'}`)
  process.exit(0)
}

if (!existsSync(source)) {
  console.error(`missing ${source} - run this from a checkout of the terse repo.`)
  process.exit(1)
}

const dest = join(stylesDir, `${styleName}.md`)
if (dryRun) {
  console.log(`would copy  ${source}\n         -> ${dest}`)
  console.log(`would set   outputStyle: "${previous ?? '(unset)'}" -> "${styleName}"  in ${settingsPath}`)
  process.exit(0)
}

mkdirSync(stylesDir, { recursive: true })
copyFileSync(source, dest)

// Back up the whole settings file before rewriting it, and remember the one key
// we replace so --uninstall can put it back exactly.
if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak`)
const next = { ...settings, outputStyle: styleName }
if (previous !== undefined && previous !== styleName) next.__terseBackup = previous
writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n', 'utf8')

console.log(`installed ${styleName}`)
console.log(`  style     ${dest}`)
console.log(`  settings  ${settingsPath}  (outputStyle: ${previous ?? 'unset'} -> ${styleName})`)
if (existsSync(`${settingsPath}.bak`)) console.log(`  backup    ${settingsPath}.bak`)
console.log(`\nundo with: node install.mjs --uninstall${has('--project') ? ' --project' : ''}`)
