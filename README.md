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

skillsmith runs each prompt in both arms, reports the pass-rate delta with a significance test, and the token cost. The result — whatever it is — goes here, from a real run, once measured. A positive delta only counts if it is significant; if the base model is already terse, the honest answer is "no effect", and that is what will be reported.

### The measured result: no effect on this model

Run against `claude -p` (Claude Code 2.1.235), 4 cases × 5 repeats, all 40 runs exited 0. Full report: [`eval-report.json`](eval-report.json).

<p align="center">
  <img src="assets/eval.svg" width="668"
       alt="skillsmith eval render for terse: every check near 100 percent in both arms, mean pass rate 100 to 98 percent, p equals 0.32 not distinguishable from noise.">
</p>

**terse shows no measurable effect here — and the report says so.** The reason is in the numbers: the base model in headless mode **already passes the `no-preamble` and `no-closing-summary` checks 100% in the baseline arm.** It does not open with "Great question" or close with "I hope this helps" to begin with, so there is no padding for terse to cut. Pooled across all applicable outcomes the difference is **60/60 vs 59/60, p = 0.32 — noise** (one skill run tripped a check, nudging it *down*, which is how noise looks).

This is the honest outcome, kept in the repo rather than hidden. It is the second behavioural reflex measured this way to come back flat, and for the same reason: a strong model in eval mode already runs its code, already answers tersely, already refuses to over-claim. The behaviours that would show a real gap are subtler, or live on weaker models, or in interactive sessions the headless harness does not capture. **A skill is worth shipping when a measurement shows it moving the needle. This one does not on this model, and pretending otherwise is exactly what the measurement exists to prevent.**

Where terse could still earn its place, untested here: a weaker or older model that pads by default, or a house-style constraint stricter than the model's default. Point the eval at that model and the number decides.



## Why a hook

A `SKILL.md` is read once and drifts out of attention as the conversation grows. The hook re-injects terse's core rules at the start of every turn, so the reflex holds instead of fading — the same mechanism ponytail uses.

## License

MIT
