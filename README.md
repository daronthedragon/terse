<div align="center">

# terse

**One reflex for coding agents: answer first, cut the padding.**

[![Skill](https://img.shields.io/badge/type-agent%20skill-3178C6)](SKILL.md)
[![Persistence](https://img.shields.io/badge/persistence-output%20style-339933)](output-styles/terse.md)
[![Measured with](https://img.shields.io/badge/measured%20with-skillsmith-blueviolet)](https://github.com/daronthedragon/skillsmith)
[![License](https://img.shields.io/badge/license-MIT-black)](LICENSE)

</div>

---

A coding agent's answer is usually one or two lines. Everything wrapped around it — *"Great question! Let me help. Here's what's happening… I hope this helps!"* — is the reader's tax. terse is a single reflex that cuts it: **open with the answer, keep only what changes the reader's next action, stop.**

It is one behavior, not a toolkit. Like [ponytail](https://github.com/DietrichGebert/ponytail) makes an agent write less code, terse makes it write less *around* the answer. It ships as a Claude Code **output style** — folded into the system prompt for the whole session, so the reflex holds from the first turn instead of being re-injected by a hook on every prompt.

## The reflex

Instead of:

```
Great question! Let me help you with that. So, the issue you're seeing is
because the port is already in use. Here's what's happening: another process
has bound to 3000. To summarize, you'll want to free the port. I hope this helps!
```

terse does:

```
Port 3000 is already bound. Free it: `lsof -ti:3000 | xargs kill`.
```

Same answer. The receipt is the command, not three sentences restating the problem.

## Install

terse is a Claude Code **output style** — a single file that gets folded into the system prompt. No hook, no runtime, no dependency.

```bash
git clone https://github.com/daronthedragon/terse.git && node terse/install.mjs
```

That copies the style into `~/.claude/output-styles/` and sets one key in `~/.claude/settings.json`. It merges rather than overwrites — your other settings survive, the previous file is kept as `settings.json.bak`, and a malformed settings file is refused rather than clobbered. Undo restores exactly what `outputStyle` was before:

```bash
node terse/install.mjs --uninstall
```

Useful flags: `--level lite|full|ultra` picks how hard it cuts, `--project` installs into `./.claude` instead of your home directory, and `--dry-run` prints the two changes without touching anything.

**By hand**, if you would rather see it: copy `output-styles/terse.md` into `~/.claude/output-styles/`, then add one line to `~/.claude/settings.json`:

```json
{ "outputStyle": "terse" }
```

Off again by setting it to `"default"`.

Other agents (Cursor, Windsurf, Cline, or anything that reads [`AGENTS.md`](AGENTS.md)) get the same reflex from the platform rule files in this repo — see [Everywhere else](#everywhere-else).

## Levels

Three output styles ship, so you can dial how hard the reflex cuts. Each was run against the same eight prompts, so the gradient is measured rather than asserted:

| Level | Cuts | Median reply | Answer still present |
|---|---|---|---|
| [`terse-lite`](output-styles/terse-lite.md) | **−53%** | 836 chars | 24/24 |
| [`terse`](output-styles/terse.md) (default) | **−69%** | 662 chars | 40/40 |
| [`terse-ultra`](output-styles/terse-ultra.md) | **−88%** | 259 chars | 24/24 |

All three reductions are significant (p ≤ 6.6e-8), every run exited 0, and **the answer survives at every level** — including `ultra`, which cuts nearly nine tenths of the reply and still answered all 24. Pick by how much context you want left around the answer, not by how much you trust it.

Install one with `node install.mjs --level lite|full|ultra`, or copy the file yourself and change the one `outputStyle` line. Off again by setting it to `"default"`.

## Does it actually work?

A skill is worth having only if a measurement shows it changing behaviour. terse ships an eval ([`eval.json`](eval.json)) that runs eight verbosity-tempting questions — compare-and-contrast, "why does X happen", safety judgements, nuance traps like *"does the GIL prevent all parallelism?"* — with and without the output style active, through `claude -p`, and checks each answer for:

- **`answered`** — the correct answer is still present (brevity must not drop the answer)
- **`no-preamble`** — no lead-in boilerplate (*"Sure", "Great question", "Let me", "Here's"*)
- **`no-closing-summary`** — no recap tail (*"In summary", "I hope this helps"*)

Those binary checks turned out to be blind to terse's real effect (the model has no boilerplate phrases to cut), so the eval also measures the **magnitude** that matters — the length of the answer — and compares the two arms with a Mann-Whitney U test. That is the metric that shows the win.

### The measured result: −69% response length, significant

This eval measures the **shipped artifact** — the output style, staged exactly as you install it (`.claude/output-styles/terse.md` + `outputStyle` in settings), not a different form of the rules. Run against `claude -p` (Claude Code 2.1.236), 8 cases × 5 repeats, all 80 runs exited 0. Full report: [`eval-report.json`](eval-report.json), captured with [runshot](https://github.com/daronthedragon/runshot).

The effect replicates across three independent 80-run passes: 2,069 → 654 (−68.4%), 1,980 → 634 (−68.0%), and this one 2,170 → 662 (−69.5%).

<p align="center">
  <img src="assets/eval.svg" width="765"
       alt="skillsmith eval render for terse: pass-rate checks flat at 100 percent, and response length drops from 2170 to 662 characters median, minus 69 percent, significant.">
</p>

**terse cuts replies to a third — median 2,170 → 662 characters, −69%, Mann-Whitney p = 3.4e-14.** That is a real, significant behavioural change, and it is the same order as ponytail's number on the other axis: ponytail writes ~54% less *code*, terse writes ~68% less *around the answer*.

It is also faster: wall clock per reply fell 22,229 → 11,954 ms median, −46%, p = 2.5e-14 — about 1.9×. Fewer characters take less time to generate, which is the one benefit of brevity you feel rather than read. Those runs execute through a concurrency pool, so the absolute milliseconds are inflated by load and are not a single-request latency figure — both arms interleave through the same pool, so the ratio is the part that carries.

In this pass every binary check reads 100% in both arms, and answer presence is **40/40** — brevity cost nothing measurable. That has not always been true: an earlier pass of the same eval scored 37/40, all three misses on one question where terse answered by pointing at its evidence (*"Receipt above: parser rejects `{1: 2}`"*) instead of stating the answer. That case swings run to run — measured properly at twelve repeats it scores 11/12 either way — and the rule written to fix it changed nothing at p = 1.00, so it is not in the skill. The full story, including the rejected rule, is in [BENCHMARKS.md](BENCHMARKS.md).

The interesting part is *how* the measurement found it. The pass-rate checks came back flat — every arm near 100% — because the base model in headless mode **never says "Great question" or "I hope this helps" to begin with.** It has no boilerplate phrases to cut; it is verbose in a subtler way, with long explanations. A binary present/absent check is blind to that. What catches it is measuring the **magnitude** — the length of the answer — and testing the two arms with a non-parametric Mann-Whitney U. On that axis the skill's effect is unmistakable and significant.

This is the lesson worth keeping: **a skill whose whole value is "less of something" cannot be measured by a checklist.** The first version of this eval reported "no effect" from the binary checks and was wrong — it was measuring the wrong quantity. The magnitude metric is what tells the truth, and it is now part of [skillsmith](https://github.com/daronthedragon/skillsmith)'s eval for exactly this class of skill.

### The rules were rewritten against a measurement, not a hunch

The first rule set targeted boilerplate — *"Sure", "Great question", "I hope this helps"*. A strong model rarely says those, so the rules were aiming at padding that was not there. The current rules target what a strong model actually does: **over-explanation** — answering the question next to the one asked, adding the mechanism nobody requested, inflating one line into a headed list to look thorough — and they end with an explicit cut pass over the drafted reply.

That change was A/B'd, not assumed. Both rule sets were run against the same eight prompts, same repeats, same harness — the only difference being which file got staged as the output style:

| | old rules | new rules |
|---|---|---|
| median reply, skill arm | 1,159 chars | **627 chars** |
| vs. its own baseline | −41.5% | **−68.7%** |
| answer still present | 40/40 | 40/40 |

Head-to-head on identical prompts, the new rules cut **another −46%** off what the old rules left — Mann-Whitney U = 299.5, **p = 1.5e-6**, n = 40 per arm — with no loss on answer presence in that pair of runs. The old rules are not in the repo; this table is why.

## The other two benchmarks

Cutting is the easy half. The half that decides whether terse is safe to leave on is what it does when brevity is the *wrong* answer, so two more benchmarks exist and both are gated in CI:

- **Safety** ([`bench-safety.json`](bench-safety.json)) — four prompts where the user explicitly asked for length (a tutorial, a detailed explanation, a design doc, a step-by-step walkthrough), and four where a short answer is only correct if it keeps one caveat (float precision, XSS on `localStorage`, an unset variable in `rm -rf`, MD5 for passwords). terse is not supposed to *win* here; it is supposed not to break what already worked. **Result: 100% in both arms on every check.** Asked for length, terse writes as much as an unmodified agent — median 6,502 chars against 5,781, a difference the test cannot separate from noise (p = 1.00) — and keeps every safety caveat while cutting those answers 2,188 → 528 chars. The same skill cuts a padded answer by 68% and leaves a requested tutorial alone.
- **Context** ([`bench-context.json`](bench-context.json)) — the risk no single-turn eval can see. An agent's own replies are the context its later turns read, so making every reply shorter can delete the working notes the conversation depends on. [`bench/multiturn.mjs`](bench/multiturn.mjs) runs real three-turn conversations through `claude -p --resume` and scores **only the final turn**: once where the agent must recall a number it computed two turns earlier, once where it must recall a specific the user gave. **Result: 100% retention in both arms**, 24 runs, all exit 0 — the final turn was shorter with terse (157 vs 282 chars median) and still carried everything the question needed. Four scenarios of three turns is a bounded claim, not proof that nothing is ever lost in a long session.

Full methodology, and why a checklist cannot measure a brevity skill at all, is in [BENCHMARKS.md](BENCHMARKS.md).

## Keeping the claims honest

Measured claims rot: the eval gets re-run, the effect moves, and the README keeps quoting the old number. Two things stop that here.

[`verify.mjs`](verify.mjs) recomputes the medians from the committed report and fails if the README quotes anything else — it also checks that the four platform rule files have not drifted apart, that every output style's frontmatter `name` matches its filename, and that each benchmark spec points at a style file that exists. It costs nothing to run, so it runs on every push:

```bash
node verify.mjs
```

And the [benchmarks workflow](.github/workflows/benchmarks.yml) re-runs the real thing on demand with thresholds attached — `--min-reduction` for the headline effect, `--min-pass` for the safety and context floors — so if terse ever stops cutting, or starts truncating what it should not, the run fails instead of quietly reporting a smaller number.

## Why an output style, not a hook

ponytail keeps itself alive with a `UserPromptSubmit` hook: a script that re-injects its rules into the context on *every* prompt. That works, but it spends tokens each turn, adds a runtime you have to trust, and shows up as noise in the transcript.

terse takes the other door Claude Code offers. An **output style** is folded into the system prompt once, for the whole session — the same place the base instructions live — so the reflex is present from the very first token and never has to be re-asserted. No per-turn script, no injected preamble, nothing to keep running. A skill that is *purely* a behavior (not a tool it needs to call) belongs in the system prompt, and that is exactly what an output style is.

The trade-off is honest: a hook can react to what you just typed; an output style cannot. terse doesn't need to react — it is a constant stance, not a conditional one — so the cheaper, quieter mechanism is also the correct one.

## Everywhere else

The same reflex ships for non-Claude agents as plain rule files, so terse isn't Claude-only:

| Agent | File |
|---|---|
| Cursor | [`.cursor/rules/terse.md`](.cursor/rules/terse.md) |
| Windsurf | [`.windsurf/rules/terse.md`](.windsurf/rules/terse.md) |
| Cline | [`.clinerules/terse-rules.md`](.clinerules/terse-rules.md) |
| Any (AGENTS.md convention) | [`AGENTS.md`](AGENTS.md) |

Each carries the identical rule set — answer first, one receipt, cut the padding — in the format that platform reads.

## License

MIT
