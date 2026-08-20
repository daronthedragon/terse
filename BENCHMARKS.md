# Benchmarks

terse makes one claim — *replies get shorter without getting worse* — and that
claim splits into three questions a single number cannot answer:

| Benchmark | Question | Spec | What failure looks like |
|---|---|---|---|
| **Compression** | Does it actually cut? | [`eval.json`](eval.json) | replies are the same length as the baseline |
| **Safety** | Does it know when *not* to cut? | [`bench-safety.json`](bench-safety.json) | a requested tutorial comes back truncated, or a caveat is dropped |
| **Context** | Does the conversation survive it? | [`bench-context.json`](bench-context.json) | turn 3 can no longer use what turn 1 established |

All three run through [skillsmith](https://github.com/daronthedragon/skillsmith),
which stages the **shipped artifact** — the output style, exactly as
[`install.mjs`](install.mjs) installs it — into a fresh temp project for every
single run, and runs an identical baseline arm with an empty `.claude`. Nothing
is compared against a paraphrase of the rules; the file under test is the file
you install.

## How a run works

Each run is one `claude -p` invocation in its own throwaway working directory,
so no run can see another's state. The two arms are interleaved through the same
concurrency pool, so load affects both equally. Every result keeps its full
transcript, so any number below can be recomputed from the committed report
without paying for the calls again:

```bash
skillsmith eval eval-report.json --render
```

Pass/fail checks are regexes over the reply. Magnitude metrics (length, wall
clock) are compared with a **Mann-Whitney U test** — non-parametric, because
reply lengths are not normally distributed and a mean would be dragged around by
one long answer.

The wall-clock figure needs one caveat stated plainly: runs execute through a
bounded concurrency pool, so the absolute milliseconds are inflated by load and
are not a latency benchmark you could quote for a single interactive request.
Both arms interleave through *the same* pool, so the load applies equally and
the ratio between them is the part worth reading.

## Why pass/fail checks are not enough

The first version of this eval reported "no effect" and was wrong. It checked
for boilerplate — *"Sure", "Great question", "I hope this helps"* — and a strong
model in headless mode does not say those things to begin with. There was no
boilerplate to cut, so every check read the same in both arms while the actual
behaviour changed enormously.

What a brevity skill does is change a *magnitude*, and a checklist cannot see a
magnitude. That is why the compression benchmark reports a median and a p-value
rather than a pass rate, and why the questions are chosen to *invite*
over-explanation — compare-and-contrast, "why does X happen", nuance traps —
instead of short factual lookups, which cannot show over-explanation at all.

## Why the safety benchmark exists

Every brevity instruction has an obvious failure mode: it fires when it should
not. The dangerous version of terse is not one that cuts too little, it is one
that truncates a tutorial the user explicitly asked for, or answers "yes" to
*"can I use `==` on floats?"* without the caveat that makes the answer safe.

So the safety benchmark measures the opposite of the headline: four cases where
the user **asked for length** (a tutorial, a detailed explanation, a design doc,
a step-by-step walkthrough) and four where a short answer is only correct if it
keeps one specific caveat (float precision, XSS on `localStorage`, an unset
variable in `rm -rf`, MD5 for passwords). Here terse is not supposed to win
anything. It is supposed not to break what already worked, which is why CI gates
it with a pass-rate floor (`--min-pass`) rather than a "beat the baseline" test.

## Why the context benchmark exists

The subtlest risk is one no single-turn eval can see. An agent's own replies
*are* the context its later turns read. Make every reply shorter and you may be
deleting the working notes the conversation depends on — the answer to turn 5
was in the part of turn 2 that got cut.

[`bench/multiturn.mjs`](bench/multiturn.mjs) runs real multi-turn conversations
through `claude -p --resume`, in the staged directory so the style applies to
every turn, and prints **only the final turn** — the one that needs the earlier
context. Two kinds of scenario, because context is lost in two ways:

- **The agent must recall what it computed.** It works out 58ms of headroom,
  then 33ms after a change, and the last turn asks for the number. If the
  intermediate value was compressed away, the chain breaks.
- **The agent must recall what the user said.** A service name, a config path, a
  slug format and a row cap, stated once and needed two turns later.

## Results

### Compression — replicated

Two independent 80-run passes of [`eval.json`](eval.json), all runs exit 0:

| pass | median without | median with | change | p |
|---|---|---|---|---|
| first | 2,069 | 654 | −68.4% | 2.7e-14 |
| second | 1,980 | 634 | −68.0% | 2.2e-14 |

One run is an anecdote; two that agree within half a point are a result. The
second pass also carried the wall-clock metric: **24,765 → 11,593 ms median,
−53%, p = 4.6e-14** — the shorter reply is roughly 2.1× faster to produce, with
the concurrency caveat above.

### Caveat retention — no loss

Four questions where a short answer is only correct if it keeps one caveat.
40 runs, all exit 0:

| question | caveat that must survive | without | with terse |
|---|---|---|---|
| `==` on floats | precision / `isclose` | 100% | **100%** |
| JWTs in `localStorage` | XSS | 100% | **100%** |
| `rm -rf $DIR/` | unset or empty variable | 100% | **100%** |
| MD5 for passwords | use bcrypt/argon2/scrypt | 100% | **100%** |

terse cut these replies from 2,188 to 528 characters median and kept every
caveat. This is the result the whole safety benchmark exists to check: the
compression comes out of the explanation, not out of the warning.

### What a timeout taught the harness

The first pass of the preservation half was invalid, and it is worth recording
why. Twenty of eighty runs exited 124 — killed at a 240-second timeout — and
every one was a long-form case. The baseline hit the limit nearly twice as
often as terse (13 runs to 7), because it writes more and therefore takes
longer. A killed run leaves a near-empty transcript, which scored as *"the
reply was too short"*: the harness's own limit, reported as the skill
truncating. The timeout is now 900 seconds.

The runs that did finish already answer the question the benchmark was built to
ask. Asked for a tutorial, a design doc or a step-by-step walkthrough, terse
produced **2,900 to 10,199 characters**. Whatever else it does, it does not
answer "write me a tutorial" with one line.

## Reproducing

```bash
git clone https://github.com/daronthedragon/skillsmith.git && cd skillsmith && npm ci && npm run build
```

```bash
cd ../terse && node ../skillsmith/dist/index.js eval eval.json --json > eval-report.json
```

Or run all three with the thresholds enforced, the way CI does — see
[`.github/workflows/benchmarks.yml`](.github/workflows/benchmarks.yml). The gates
are what keep the numbers in the README from rotting: if terse ever stops
cutting, or starts truncating what it should not, the run exits non-zero instead
of quietly reporting a smaller effect.
