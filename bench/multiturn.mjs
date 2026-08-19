#!/usr/bin/env node
/**
 * Multi-turn context benchmark for terse.
 *
 * The single-turn evals measure how much terse cuts. They cannot see the risk
 * that matters over a session: a shorter reply writes less down, so the context
 * a later turn depends on may simply not be there any more. This harness runs a
 * real multi-turn conversation through `claude -p --resume` and prints only the
 * FINAL turn, so the eval scores whether the thread survived the compression.
 *
 * Two kinds of scenario, because there are two ways context can be lost:
 *   - the agent must recall a value IT computed in an earlier turn
 *   - the agent must recall a specific the USER gave in an earlier turn
 *
 * Usage: node multiturn.mjs <scenario-id> [working-dir]
 * Every turn runs in <working-dir>, so the output style staged under its
 * .claude applies to the whole conversation, not just the first turn.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const SCENARIOS = {
  // The agent computes 58, then 33; the last turn can only answer from its own
  // earlier arithmetic.
  'headroom-chain': [
    'Our p99 latency budget is 250ms. The DB call takes 180ms and the cache lookup takes 12ms. What is our remaining headroom?',
    'We are adding an auth check that takes 25ms. Recompute the headroom.',
    'What is the final remaining headroom in milliseconds? Give the number.',
  ],
  // Same shape, different domain: 48/day, then 36/day, then 30 days = 1080.
  'budget-chain': [
    'A job costs $0.004 per run and we run it 12,000 times a day. What is the daily cost?',
    'We cut the number of runs by 25%. What is the new daily cost?',
    'Using that reduced rate, what is the monthly cost over 30 days? Give the number.',
  ],
  // Specifics the user supplied in turn 1 must still be exact in turn 3.
  'config-recall': [
    'My service is called flotilla-api, its config lives at /etc/flotilla/api.yaml, and it runs as the user flt.',
    'How do I make it restart on failure with systemd?',
    'Write the exact User= and ExecStart= lines for my unit file.',
  ],
  // Constraints stated once, needed for a calculation two turns later.
  'constraint-recall': [
    'Constraints for our URL shortener: slugs are exactly 7 characters, case-sensitive alphanumeric, and we cap the table at 10 million rows.',
    'What index should I add on the slug column?',
    'Given my slug format, how many possible slugs exist, and is that enough for my row cap?',
  ],
}

const id = process.argv[2]
const workDir = process.argv[3] ?? process.cwd()
const turns = SCENARIOS[id]
if (!turns) {
  console.error(`unknown scenario "${id}". known: ${Object.keys(SCENARIOS).join(', ')}`)
  process.exit(2)
}

/**
 * Resolve the CLI as a real executable. Spawning the `.cmd` shim without a
 * shell is EINVAL on current Node, and spawning it WITH a shell would put every
 * prompt through cmd.exe quoting - where `%VAR%` and `$` in a prompt get
 * mangled. The npm package ships a native binary; prefer it, and let
 * CLAUDE_BIN override for other install layouts.
 */
function cliCandidates() {
  const out = []
  if (process.env.CLAUDE_BIN) out.push(process.env.CLAUDE_BIN)
  if (process.platform === 'win32' && process.env.APPDATA) {
    out.push(join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
  }
  if (process.env.HOME) {
    out.push(join(process.env.HOME, '.local', 'bin', 'claude'))
    out.push(join(process.env.HOME, 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
  }
  out.push('claude')
  return out.filter((p, i, a) => a.indexOf(p) === i)
}

/**
 * Run one turn, tolerating a CLI that cannot be found or spawned on the first
 * try. An earlier version resolved the binary once and gave up on ENOENT; two
 * runs of a benchmark died that way and their empty transcripts scored as
 * "the agent forgot the context", which is a measurement reporting a harness
 * failure as a finding. Try each candidate path, and retry a transient failure
 * once before believing it.
 */
function runTurn(args, cwd) {
  let lastErr = 'no candidate ran'
  for (const cli of cliCandidates()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = spawnSync(cli, args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        shell: false,
        cwd,
      })
      if (res.error?.code === 'ENOENT') {
        lastErr = `ENOENT for ${cli}`
        break // this path does not exist; try the next candidate, not again
      }
      if (!res.error && res.status === 0) return { ok: true, stdout: res.stdout }
      lastErr = res.error?.message ?? `exit ${res.status}: ${String(res.stderr).slice(0, 300)}`
    }
  }
  return { ok: false, error: lastErr }
}
let sessionId = null
let final = ''

for (const [i, prompt] of turns.entries()) {
  const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions']
  if (sessionId) args.push('--resume', sessionId)
  const res = runTurn(args, workDir)
  if (!res.ok) {
    console.error(`turn ${i + 1} failed: ${res.error}`)
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(res.stdout)
  } catch {
    console.error(`turn ${i + 1} did not return JSON: ${res.stdout.slice(0, 300)}`)
    process.exit(1)
  }
  // Every turn must continue the SAME conversation, or the benchmark is not
  // testing context at all. A resumed turn returns a new session id, so follow
  // whatever id the last turn reported rather than pinning the first one.
  sessionId = parsed.session_id ?? sessionId
  if (!sessionId) {
    console.error(`turn ${i + 1} returned no session_id; cannot continue the conversation`)
    process.exit(1)
  }
  final = String(parsed.result ?? '')
}

// Only the last turn is scored: it is the one that needs the earlier context.
process.stdout.write(final)
