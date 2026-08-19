<div align="center">

# terse

**One reflex for coding agents: answer first, cut the padding.**

[![Skill](https://img.shields.io/badge/type-agent%20skill-3178C6)](SKILL.md)
[![Persistence](https://img.shields.io/badge/persistence-UserPromptSubmit%20hook-339933)](persist.mjs)
[![Measured with](https://img.shields.io/badge/measured%20with-skillsmith-blueviolet)](https://github.com/daronthedragon/skillsmith)
[![License](https://img.shields.io/badge/license-MIT-black)](LICENSE)

</div>

---

A coding agent's answer is usually one or two lines. Everything wrapped around it — *"Great question! Let me help. Here's what's happening… I hope this helps!"* — is the reader's tax. terse is a single reflex that cuts it: **open with the answer, keep only what changes the reader's next action, stop.**

It is one behavior, not a toolkit. Like [ponytail](https://github.com/DietrichGebert/ponytail) makes an agent write less code, terse makes it write less *around* the answer — enforced every turn by a hook, so it does not fade as the conversation grows.

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

**With [skillsmith](https://github.com/daronthedragon/skillsmith)** (also handles the persistence hook):

```bash
git clone https://github.com/daronthedragon/terse.git
```

```bash
skillsmith hook terse
```

That copies the skill into place and wires a `UserPromptSubmit` hook so terse is re-asserted on every prompt.

**Standalone** — the skill is a single [`SKILL.md`](SKILL.md). Drop it in `~/.claude/skills/terse/`, and for persistence point a `UserPromptSubmit` hook at the portable [`persist.mjs`](persist.mjs) (it reads `SKILL.md` next to itself and prints the skill's core, which the agent re-reads each turn).

## Levels

`/terse lite|full|ultra` — `lite` trims, `full` (default) cuts to answer + one receipt, `ultra` is a single sentence. Off with "stop terse".

## Does it actually work?

A skill is worth having only if a measurement shows it changing behaviour. terse ships an eval ([`eval.json`](eval.json)) that runs four padding-prone questions with and without the skill, through `claude -p`, and checks each answer for:

- **`answered`** — the correct answer is still present (brevity must not drop the answer)
- **`no-preamble`** — no lead-in boilerplate (*"Sure", "Great question", "Let me", "Here's"*)
- **`no-closing-summary`** — no recap tail (*"In summary", "I hope this helps"*)

Those binary checks turned out to be blind to terse's real effect (the model has no boilerplate phrases to cut), so the eval also measures the **magnitude** that matters — the length of the answer — and compares the two arms with a Mann-Whitney U test. That is the metric that shows the win.

### The measured result: −52% response length, significant

Run against `claude -p` (Claude Code 2.1.235), 4 cases × 5 repeats, all 40 runs exited 0. Full report: [`eval-report.json`](eval-report.json).

<p align="center">
  <img src="assets/eval.svg" width="668"
       alt="skillsmith eval render for terse: pass-rate checks unchanged at ~100 percent, but response length drops from 1297 to 622 characters median, minus 52 percent, significant at p equals 0.005.">
</p>

**terse cuts response length in half — median 1,297 → 622 characters, −52%, Mann-Whitney p = 0.005.** That is a real, significant behavioural change, and it is almost exactly ponytail's number on the other axis: ponytail writes ~54% less *code*, terse writes ~52% less *around the answer*.

The interesting part is *how* the measurement found it. The pass-rate checks came back flat — every arm near 100% — because the base model in headless mode **never says "Great question" or "I hope this helps" to begin with.** It has no boilerplate phrases to cut; it is verbose in a subtler way, with long explanations. A binary present/absent check is blind to that. What catches it is measuring the **magnitude** — the length of the answer — and testing the two arms with a non-parametric Mann-Whitney U. On that axis the skill's effect is unmistakable and significant.

This is the lesson worth keeping: **a skill whose whole value is "less of something" cannot be measured by a checklist.** The first version of this eval reported "no effect" from the binary checks and was wrong — it was measuring the wrong quantity. The magnitude metric is what tells the truth, and it is now part of [skillsmith](https://github.com/daronthedragon/skillsmith)'s eval for exactly this class of skill.



## Why a hook

A `SKILL.md` is read once and drifts out of attention as the conversation grows. The hook re-injects terse's core rules at the start of every turn, so the reflex holds instead of fading — the same mechanism ponytail uses.

## License

MIT
