# dsh-dsml-rescue architecture

What this plugin decides, where that decision lives, and which constraints it must keep. It is the
only place the rules are written down: the code comments explain one line, and the notes under
[.agents/notes/](../.agents/notes/) record why a rule exists. Change a rule here first, then the code.

## The failure it answers

A model emits a tool call. On some provider routes that call arrives as **reasoning text** carrying
**DSML markup** — DeepSeek Markup Language, the dialect DeepSeek uses to express a tool call —
instead of a structured tool call, so the harness sees a message with no tool call and no visible
text. The step ends, the turn closes as `completed`, and the agent goes idle with nothing shown. The
model believes it acted; nobody received the action.

Three facts from the recordings this plugin was built against
([evidence](../.agents/notes/the-stall-evidence.md)) shape every rule below:

- the leaked DSML markup sits at the **end** of the reasoning stream and carries the token
  `｜｜DSML｜｜`, whose bars every sample we hold writes full-width,
- the closing message carries **only** reasoning — no text block, no tool call,
- the turn is recorded `completed`, so nothing downstream treats it as a failure.

## Detection

A turn is a rescue candidate when all three hold:

1. it closed normally,
2. its closing message produced nothing actionable — a `tool-call` or a text block with
   non-whitespace content would have ended that,
3. its reasoning ends with leaked DSML markup.

"Actionable" has three edges worth naming, because the word alone invites the wrong reading.
Reasoning **never** counts as actionable, however long it is: that is where the leak lives, not
where the work lands. An **unknown** block type does count, deliberately — a provider that adds a
content kind this plugin has never seen is likelier to have produced output than nothing, and a false
rescue costs one request. And an empty reasoning stream is **not** a leak: a turn that produced
nothing at all is a different failure and stays out of scope.

The third condition is deliberately narrow. A turn that ended empty for any other reason is left
alone, because a rescue would spend a request to hide a different failure. The marker is read from
[a normalization pass](../src/protocol.ts) rather than a list of spellings, so full-width bars,
ASCII bars and mixed case all arrive as one form — that is a property of the matcher, not something
every sample shows: every marker we have on record writes the bars full-width.

Matching is limited to the **last three non-blank lines** and requires the line to open with `<`.
Both limits exist for the same reason: a model *discussing* this failure quotes the markup
mid-sentence, and that must not count as suffering from it.

For the same reason the matcher anchors on the **marker**, never on the token name after it. This is
a robustness argument rather than an observation: a byte-level tokenizer writes a space or
underscore as `▁` (U+2581), and NFKC does not fold it, so a hypothetical
`</｜｜DSML｜｜tool▁calls>` would defeat a matcher expecting a specific token — it does not defeat
one that stops at the marker. No recording we hold contains that spelling yet.

## The decision

Detection answers "is this a stall". A separate step answers "what now", because the two change for
different reasons: recognition follows new evidence, limits follow the operator's patience.

| Situation | Decision | Effect on the streak |
|---|---|---|
| candidate, rescue budget left, nobody waiting | continue the turn | +1 |
| candidate, a human prompt already queued | stay out of the way | unchanged |
| candidate, rescue budget spent | stop | cleared |
| a human prompt arrives | nothing | cleared |
| the closing step spent its whole output ceiling | nothing | cleared |
| not a candidate | nothing | cleared |
| turn ended aborted or errored | nothing | cleared |

The streak clears on two facts only: human input, because the human now owns the conversation, and
a turn that ended abnormally, because a different failure is a different failure. The plugin's own
notices never clear it.

Three orderings are load-bearing. The rescue cap outranks a waiting human, so a spent cap is always
recorded rather than deferred forever. An abnormal turn clears the streak: continuing a turn that
failed for its own reason would hide the cause. And **a step that was cut off at its output ceiling
is not a stall**: it owes an answer it never got to write, so continuing it would buy another ceiling
to be cut off from.

That last exclusion cannot come from the seam, which carries no stop reason, and the host's own
`max-tokens` reading arrives one event later — after the decision is made. It is therefore derived
from accounting both sides already publish: the closing message's output-token count against the
ceiling the session last requested. Equality means the model was cut off rather than finished. The
comparison fails open: an unknown ceiling or a missing count reports "not exhausted", because a
wrong `true` would silence the rescue this plugin exists for, while a wrong `false` only costs the
streak one attempt.

## Where the continuation is queued

The continuation is queued from the host's turn-stopping seam, and only there. Three constraints
meet at that point:

- **append reentrancy** — an observer of an appended event cannot append again, so a session-event
  listener is the wrong place,
- **turn continuation** — the loop asks its inbox whether more work is pending immediately after
  closing a turn, so a message queued before that question opens the next turn at once,
- **child settlement** — a child agent counts as settled only while it is idle *and* its inbox is
  empty, so queueing here keeps a child unsettled and its parent uninformed until the run really
  ends. This is what makes "tell the parent only after the retries are spent" true without extra
  code.

The reverse follows: **giving up writes nothing.** A message in a capped-out child's inbox would
leave it permanently unsettled. Giving up is a log line, and the visible trace is the last
continuation's own summary.

The seam also carries a contract this plugin relies on rather than re-checks: **the loop offers
turn-stopping only for a turn it is closing normally.** A cancelled or failed turn throws instead,
so no offer arrives. Re-deriving that locally would need state the seam does not have — the turn's
own verdict — and any such flag would describe the *previous* turn, because the offer is dispatched
before `turn/end` is appended. An abnormal close therefore stays observable only through the streak
reset, and never through a rescue decision. The output-ceiling case is the exception that *is*
handled at the seam, because it leaves the turn normal and only accounting can tell it apart.

## The message

One fixed sentence, and it never mentions the cause. The cause sits below the model, so stating it
cannot change behaviour, and naming the markup risks having the model repeat it. The sentence gives
one instruction (take the next step) and one legal exit (summarize if finished), so a continuation
cannot become an open-ended loop:

> Continue with the task. Take the next concrete step now, using a tool if needed. If the work is
> complete, reply with a short summary.

[src/messages.ts](../src/messages.ts) is the live source of that text — this block is a quotation,
and a redline test fails the build if the two ever disagree. It is fixed rather than configurable:
a rewording is a code change with its own review, not a setting.

The message carries its own source kind, so it is durable, attributable, and visibly not something
a human typed. Its one-line summary (`Auto-continue 2/3`) names the round, which is the only place
the round number appears.

## Configuration

Every key, its default, and what changes when you move it. This table is the only place the values
are written down; the README links here instead of copying it.

| Key | Default | Effect |
|---|---|---|
| `enabled` | `true` | Turn the plugin off without uninstalling it. |
| `maxConsecutive` | `3` | Continuations allowed in a row for one agent. Each costs one model request, so this is the only spend control. Must be at least 1. |
| `applyToSubagents` | `true` | Whether child agents continue too. Turning it off means a stuck child settles immediately and its parent is told the run ended. |

Values are validated by the schema in [src/index.ts](../src/index.ts); a cap below one is rejected
at load rather than silently never continuing.

## Invariants

Breaking any of these is a defect, not a preference.

- **No append from an event observer.** The inbox splice happens at turn-stopping only.
- **No write to the inbox when the rescue budget is spent.** See the settlement constraint above.
- **No throw from a listener.** A listener error would turn a finished turn into a failed one.
- **The message stays neutral and fixed.** No cause, no round number in the text.
- **Judgment stays out of the entry file.** Recognition and limits are pure modules, so the recorded
  sessions in `test/fixtures/` exercise the shipped code rather than a test-only copy.

## Package layout

| File | Answers |
|---|---|
| [src/protocol.ts](../src/protocol.ts) | Does this text end with leaked markup? |
| [src/detect.ts](../src/detect.ts) | Does this finished turn count as a stall? |
| [src/policy.ts](../src/policy.ts) | Continue, stay out of the way, or stop? |
| [src/machine.ts](../src/machine.ts) | How do those answers compose across a whole turn? |
| [src/messages.ts](../src/messages.ts) | What does the model read, and how is it attributed? |
| [src/runtime.ts](../src/runtime.ts) | Which host events feed the machine, and where is the one side effect? |
| [src/index.ts](../src/index.ts) | What does the loader read? |

Dependencies point one way: `index → runtime → machine → {detect, policy} → protocol`. Only `runtime`
and `messages` touch the host.

## Verification

What each check establishes, and what it leaves open, is [docs/VERIFICATION.md](VERIFICATION.md) —
including the counts the recording replay asserts. Two facts about the arrangement matter here:

- The replay runs the **shipped** machine over trimmed real transcripts, not a test-only copy, which
  is why judgment may not move into the entry file.
- Fixtures are derived, never hand-written: [scripts/derive-fixture.mjs](../scripts/derive-fixture.mjs)
  is the provenance, and the raw recordings stay out of the repository.
