#!/usr/bin/env node
/**
 * Check the repo's own invariants, so a claim cannot drift from its evidence.
 *
 * The failure this exists to prevent is specific and has happened: the eval is
 * re-run, the effect changes, and the README keeps quoting the old number. A
 * measured claim is only worth something if something checks that the claim
 * still matches the measurement. This does that, plus the boring consistency
 * checks nobody remembers by hand.
 *
 *   node verify.mjs        exits non-zero on the first broken invariant
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const problems = []
const checks = []
const ok = (msg) => checks.push(`  ok    ${msg}`)
const bad = (msg) => {
  problems.push(msg)
  checks.push(`  FAIL  ${msg}`)
}

const read = (p) => readFileSync(join(HERE, p), 'utf8')
/** Parse JSON without letting a truncated or half-written file throw a stack
 * trace at the user. A checker that crashes tells you less than one that says
 * which file is broken. */
const readJson = (p) => {
  try {
    return { value: JSON.parse(read(p)) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---------------------------------------------------------- README vs report
// The headline number in the README must be the number in the committed report.
const reportPath = join(HERE, 'eval-report.json')
if (!existsSync(reportPath)) {
  bad('eval-report.json is missing, so the README cannot be checked against it')
} else if (readJson('eval-report.json').error) {
  bad(`eval-report.json is not readable JSON: ${readJson('eval-report.json').error}`)
} else {
  const report = readJson('eval-report.json').value
  const len = (arm) =>
    report.results.filter((r) => r.arm === arm).map((r) => r.transcript.trim().length)
  const base = Math.round(median(len('baseline')))
  const skill = Math.round(median(len('skill')))
  const pct = Math.round((1 - skill / base) * 100)
  const readme = read('README.md')

  // Numbers are written with thousands separators in prose; accept either form.
  const asWritten = (n) => new RegExp(`\\b${n.toLocaleString('en-US').replace(',', ',?')}\\b`)
  if (!asWritten(base).test(readme)) bad(`README does not quote the measured baseline median (${base.toLocaleString()})`)
  else ok(`README quotes the baseline median ${base.toLocaleString()}`)

  if (!asWritten(skill).test(readme)) bad(`README does not quote the measured skill median (${skill.toLocaleString()})`)
  else ok(`README quotes the skill median ${skill.toLocaleString()}`)

  // Accept the ASCII hyphen or a real minus sign, either side of the digits.
  if (!new RegExp(`[-−]${pct}%`).test(readme)) bad(`README does not quote the measured reduction (-${pct}%)`)
  else ok(`README quotes the reduction -${pct}%`)

  const exits = [...new Set(report.results.map((r) => r.exitCode))]
  if (exits.some((e) => e !== 0)) bad(`the committed report contains failed runs (exit codes ${exits.join(', ')})`)
  else ok(`all ${report.results.length} runs in the committed report exited 0`)

  // The latency claim drifted once while the length claim stayed correct,
  // because only the length was ever checked. Any number the README quotes
  // from this report has to be checkable, or it is only a matter of time.
  const wall = report.metrics?.find((m) => m.name === 'wall clock')?.comparison
  if (wall) {
    const wallPct = Math.round(-wall.delta * 100)
    if (/wall clock per reply fell/.test(readme)) {
      const wb = Math.round(wall.medianBaseline)
      const ws = Math.round(wall.medianSkill)
      const quotes = (n) => new RegExp(`\\b${n.toLocaleString('en-US').replace(',', ',?')}\\b`).test(readme)
      if (!quotes(wb) || !quotes(ws)) bad(`README quotes a wall-clock pair the report does not show (${wb.toLocaleString()} → ${ws.toLocaleString()} ms)`)
      else if (!new RegExp(`[-−]${wallPct}%`).test(readme)) bad(`README does not quote the measured latency reduction (-${wallPct}%)`)
      else ok(`README quotes the latency ${wb.toLocaleString()} → ${ws.toLocaleString()} ms (-${wallPct}%)`)
    }
  }

  // Answer presence is the one number where being wrong matters most: it is the
  // claim that brevity did not cost correctness.
  const skillRuns = report.results.filter((r) => r.arm === 'skill')
  const answered = skillRuns.filter((r) => r.checks.find((c) => c.id === 'answered')?.passed).length
  const claim = new RegExp(`\\*\\*${answered}/${skillRuns.length}\\*\\*`).test(readme)
  if (/answer presence is/.test(readme) && !claim) {
    bad(`README states an answer-presence figure other than the measured ${answered}/${skillRuns.length}`)
  } else if (claim) {
    ok(`README quotes answer presence ${answered}/${skillRuns.length}`)
  }
}

// ------------------------------------------------------ platform rule parity
// Every platform file ships the same rules, or one of them is quietly stale.
const platform = ['AGENTS.md', '.cursor/rules/terse.md', '.windsurf/rules/terse.md', '.clinerules/terse-rules.md']
const missing = platform.filter((p) => !existsSync(join(HERE, p)))
if (missing.length) bad(`missing platform rule files: ${missing.join(', ')}`)
else {
  const bodies = new Set(platform.map((p) => read(p).replace(/\r\n/g, '\n').trim()))
  if (bodies.size !== 1) bad(`the ${platform.length} platform rule files are not identical (${bodies.size} distinct versions)`)
  else ok(`all ${platform.length} platform rule files carry identical rules`)
}

// ------------------------------------------------------- core rule parity
// The rules live in six files: the shipped output style, SKILL.md, and four
// platform rule files. Nothing stops one of them from quietly losing a rule
// during an edit, and a skill whose Cursor copy says something different from
// its Claude copy is not one skill any more. Each core directive is identified
// by a phrase that must survive in every file that carries the rules.
const CORE = [
  { id: 'answer-first', probe: /answer, result, or decision/i },
  { id: 'one-receipt', probe: /one receipt/i },
  { id: 'no-closing-summary', probe: /closing summary/i },
  { id: 'cut-hedges', probe: /hedge/i },
  { id: 'exempt-long-form', probe: /tutorial/i },
]
const RULE_FILES = ['output-styles/terse.md', 'SKILL.md', ...platform]
for (const rule of CORE) {
  const missingIn = RULE_FILES.filter((f) => existsSync(join(HERE, f)) && !rule.probe.test(read(f)))
  if (missingIn.length) bad(`rule "${rule.id}" is missing from: ${missingIn.join(', ')}`)
}
if (!CORE.some((r) => RULE_FILES.some((f) => !r.probe.test(read(f))))) {
  ok(`all ${CORE.length} core rules present in all ${RULE_FILES.length} rule files`)
}

// ---------------------------------------------------------- output styles
// Claude Code reads `name` from the frontmatter; if it disagrees with the
// filename, `outputStyle: "<file>"` silently fails to match.
const stylesDir = join(HERE, 'output-styles')
const styles = existsSync(stylesDir) ? readdirSync(stylesDir).filter((f) => f.endsWith('.md')) : []
if (styles.length === 0) bad('no output styles found')
for (const file of styles) {
  const raw = read(join('output-styles', file))
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!fm) {
    bad(`${file} has no frontmatter block`)
    continue
  }
  const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1]?.trim()
  const expected = file.replace(/\.md$/, '')
  if (name !== expected) bad(`${file} declares name "${name}", which will not match outputStyle "${expected}"`)
  else if (!/^description:\s*\S/m.test(fm[1])) bad(`${file} has no description`)
  else ok(`${file} declares name "${name}" with a description`)
}

// ------------------------------------------------------------- bench specs
// Each spec must point at a style file that exists, or the run measures nothing.
for (const spec of ['eval.json', 'bench-safety.json', 'bench-context.json']) {
  if (!existsSync(join(HERE, spec))) {
    bad(`${spec} is missing`)
    continue
  }
  const { value: parsed, error } = readJson(spec)
  if (error) {
    bad(`${spec} is not readable JSON: ${error}`)
    continue
  }
  const styleFile = parsed.outputStyle?.file
  if (!styleFile) bad(`${spec} does not stage an output style`)
  else if (!existsSync(join(HERE, styleFile))) bad(`${spec} points at ${styleFile}, which does not exist`)
  else ok(`${spec} stages ${styleFile} (${parsed.cases.length} cases)`)
}

process.stdout.write(`\n  terse verify\n\n${checks.join('\n')}\n\n`)
if (problems.length) {
  process.stdout.write(`  ${problems.length} problem(s).\n\n`)
  process.exit(1)
}
process.stdout.write('  Everything the README claims matches what the report measured.\n\n')
