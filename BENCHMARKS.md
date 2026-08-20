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

### It is not a one-model result

Every number above comes from one model, which is a weaker claim than it looks:
a style that only bites on one model has found a quirk, not a behaviour. The
same eight prompts, same harness, run against Sonnet:

| model | median without | median with | change | pass rate |
|---|---|---|---|---|
| default | 2,170 | 662 | **−69%** | 100% both arms |
| Sonnet | 1,078 | 314 | **−71%** | 100% both arms |

Sonnet is markedly terser to begin with — its baseline reply is half the length
— and terse still takes 71% out of what remains. The effect is not a quirk of
one model's verbosity; it survives a model that was already brief.

### The three levels are a real gradient

`lite`, `full` and `ultra` were three files making a claim about each other. Run
against the same eight prompts, they turn out to be ordered the way the names
suggest:

| level | median reply | reduction | p | answer present |
|---|---|---|---|---|
| `terse-lite` | 836 | −53.5% | 6.6e-8 | 24/24 |
| `terse` | 662 | −69.5% | 3.4e-14 | 40/40 |
| `terse-ultra` | 259 | −87.6% | 2.9e-9 | 24/24 |

Every run exited 0 and every reduction is significant. The line worth noting is
the last column: **`ultra` removes seven eighths of the reply and still answers
every question.** The compression is coming out of the explanation at all three
settings, which is the only reason a level that aggressive is safe to ship.

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

### Multi-turn context — no degradation

The question this benchmark was built for: does making every reply shorter cost
the conversation the context a later turn needs? Three-turn conversations, only
the final turn scored, 24 runs, all exit 0:

| scenario | what turn 3 needs | without | with terse |
|---|---|---|---|
| `headroom-chain` | a number the agent computed in turn 2 | 100% | **100%** |
| `budget-chain` | a rate the agent derived in turn 2 | 100% | **100%** |
| `config-recall` | the service name and user from turn 1 | 100% | **100%** |
| `constraint-recall` | the slug format and row cap from turn 1 | 100% | **100%** |

**Mean retention 100% in both arms.** The final turn was shorter with terse
(157 vs 282 characters median) and still carried everything the question needed.
On these scenarios, the compression comes out of the prose, not the thread.

That is a bounded claim, and worth stating as one: four scenarios, three turns
each. It shows no degradation where a chain of computed values and a set of
stated constraints have to survive two turns. It does not prove nothing is ever
lost in a fifty-turn session, and no result here should be read that way.

### A rule that did not earn its place

An 80-run pass showed terse missing the `answered` check three times out of
forty, and all three misses looked like one behaviour. Asked whether JSON keys
can be numbers, terse answered by pointing at its own evidence — *"Receipt
above: parser rejects `{1: 2}`"*, *"Confirmed by the parse above"* — instead of
saying the answer. The baseline missed zero, so terse was causing it, and the
final message had stopped being self-contained.

The obvious fix was a fourth rule: *say the answer in words, even when a
receipt proves it.* Measured against the same eight prompts, it looked right —
the failing case went from 2/5 to 5/5 and the overall rate from 37/40 to 40/40.

Neither difference was significant at that sample (answered p = 0.078, length
p = 0.17), so it went to a focused test instead of into the file: the one
decisive case, twelve repeats per arm, both versions.

| | with the rule | without it |
|---|---|---|
| `json-number-keys` answered | 11/12 | 11/12 |
| two-proportion | \- | delta 0.0pp, **p = 1.00** |

**The rule changes nothing measurable, and it is not in the skill.** The
original 2/5 was noise on a case that varies a lot run to run — the same
version scored 11/12 when measured properly. This is the second time in this
project a plausible mechanism with a real-looking first result dissolved under
more data, and the reason every rule here has to survive a measurement rather
than an argument. A prompt only holds so many instructions; one that buys
nothing is not free.

### Deeper still — six turns with distraction

Three turns is a short conversation, and "no degradation at three turns" is a
weaker statement than it sounds. A second context benchmark
([`bench-context-deep.json`](bench-context-deep.json)) doubles the depth and
puts unrelated work in between, so the facts the last turn needs are pushed
well back rather than sitting one exchange away:

| scenario | what turn 6 requires |
|---|---|
| `deep-budget` | a cost the agent computed in turn 2, carried across three unrelated turns |
| `deep-constraint` | the window stated in turn 1 **and** the estimate it computed in turn 5 |
| `deep-identity` | `flt`, `8443` and the config path, given once in turn 1, needed verbatim in turn 6 |

Turns 3 and 4 are deliberately off-topic — cache TTLs, Prometheus, log
rotation, TLS termination — because the risk is not that an agent forgets the
last thing said, it is that compression leaves nothing to come back to once
other work has intervened.

#### Result at six turns

| scenario | what turn 6 requires | without | with terse |
|---|---|---|---|
| `deep-constraint` | the window from turn 1 and the estimate from turn 5 | 67% / 100% | **100% / 100%** |
| `deep-identity` | three identifiers given once in turn 1 | 100% | **100%** |
| `deep-budget` | a cost the agent computed in turn 2 | 100% | **100%** |

`deep-budget` took a second pass to settle. The first run showed terse missing
it once in three, on a reply that read `4200.0 200.0` — fourteen characters, no
words, wrong numbers. At six repeats per arm it came back 100% against 100%,
every terse reply carrying the 3,600 it had computed four turns earlier:

```
$400 under, with the cache.

40% cache      3600  under by 400
```

The final turn was 69 characters against the baseline's 200, and the number
survived. One miss in three is the sample size that has produced two false
findings in this project already, which is why it was re-measured rather than
written up.

`deep-constraint` is the interesting row: the **baseline** lost the maintenance
window one time in three, and terse did not. Nothing here suggests compression
costs recall; the one direction the evidence points is mildly the other way.

### Preservation — the exemption holds

Four prompts that explicitly ask for length: a beginner's tutorial, a detailed
explanation with the maths, a design doc, a step-by-step walkthrough. 24 runs,
all exit 0:

| | without terse | with terse |
|---|---|---|
| every content check (13 of them) | 100% | **100%** |
| median reply | 5,781 chars | **6,502 chars** |
| Mann-Whitney on length | — | p = 1.00, indistinguishable |

**When you ask for length, terse writes as much as an unmodified agent** — 12%
more here, which the test cannot separate from noise — and covers every
required topic: creating, merging and deleting branches; the hash function and
the false-positive maths; tradeoffs and a rollout plan; heap profiling in
numbered steps. Its long-form replies ran 1,003 to 9,882 characters.

Set beside the compression result, that is the whole design in two numbers: the
same skill cuts a padded answer by 68% and leaves a requested tutorial alone.
The exemption is not a disclaimer in the prompt, it is measured behaviour.

### Three times the harness blamed the skill

This benchmark took four attempts, and the three failures are more instructive
than the result. Each time the harness broke, its own error text was scored as
the agent's reply — short, missing the expected words, indistinguishable from
truncation:

| what actually happened | what the numbers said |
|---|---|
| 20 runs killed at a 240s timeout | "terse truncates tutorials" |
| the CLI would not spawn (`ENOENT`) | "terse forgets the conversation" |
| an auto-update left the native binary half-installed | "terse refuses to write long content" |

The third was the most convincing: ten of twelve runs returned *"This version of
claude.exe is not compatible with the version of Windows you're running"*, and
the table showed a tidy collapse to 0% with a median reply length of 248
characters. It looked exactly like a skill that truncates.

All three were caught by reading exit codes and transcripts that the report did
not surface. It surfaces them now — [skillsmith](https://github.com/daronthedragon/skillsmith)
prints a contamination warning above the table whenever a run did not exit 0,
and its CI gate fails outright when more than one run in ten failed to execute,
because a green build on error-message transcripts launders a broken harness
into a result.

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
