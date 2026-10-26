# dsh-dsml-rescue architecture

What this plugin decides, where that decision lives, and which constraints it must keep. It is the
only place the rules are written down: the code comments explain one line, and the notes under
[.agents/notes/](../.agents/notes/) record why a rule exists. Change a rule here first, then the code.

## The failure it answers

A model emits a tool call. On some provider routes that call arrives as **reasoning text** carrying
the dialect's own markup instead of a structured tool call, so the harness sees a message with no
tool call and no visible text. The step ends, the turn closes as `completed`, and the agent goes
idle with nothing shown. The model believes it acted; nobody received the action.

Three facts from the recording this plugin was built against
([evidence](../.agents/notes/the-stall-evidence.md)) shape every rule below:

- the leaked markup is always at the **end** of the reasoning stream, and carries the token
  `｜｜DSML｜｜` in full-width or ASCII bars,
- the closing message carries **only** reasoning — no text block, no tool call,
- the turn is recorded `completed`, so nothing downstream treats it as a failure.

## Detection

A turn is a rescue candidate when all three hold:

1. it closed normally,
2. its closing message produced nothing actionable — a `tool-call` or a text block with
   non-whitespace content would have ended that,
3. its reasoning ends with leaked protocol markup.

The third condition is deliberately narrow. A turn that ended empty for any other reason is left
alone, because a rescue would spend a request to hide a different failure. The marker is read from
[a normalization pass](../src/protocol.ts) rather than a list of spellings: full-width bars,
ASCII bars, and mixed case all collapse to one form.

Matching is limited to the **last few non-blank lines** and requires the line to open with `<`. Both
limits exist for the same reason: a model *discussing* this failure quotes the markup mid-sentence,
and that must not count as suffering from it.

## The decision

Detection answers "is this a stall". A separate step answers "what now", because the two change for
different reasons: recognition follows new evidence, limits follow the operator's patience.

| Situation | Decision | Effect on the streak |
|---|---|---|
| candidate, budget left, nobody waiting | continue the turn | +1 |
| candidate, a human prompt already queued | stay out of the way | unchanged |
| candidate, budget spent | stop | cleared |
| not a candidate | nothing | cleared |
| turn ended aborted, errored, or at its token ceiling | nothing | cleared |

Two orderings are load-bearing. The cap outranks a waiting human, so a spent budget is always
recorded rather than deferred forever. And an abnormal turn clears the streak: continuing a turn
that failed for its own reason would hide the cause.

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

## The message

One fixed sentence, and it never mentions the cause. The cause sits below the model, so stating it
cannot change behaviour, and naming the markup risks having the model repeat it. The sentence gives
one instruction (take the next step) and one legal exit (summarize if finished), so a continuation
cannot become an open-ended loop.

The message carries its own source kind, so it is durable, attributable, and visibly not something
a human typed. Its one-line summary names the round, which is the only place the round number
appears.

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
- **No write to the inbox when the budget is spent.** See the settlement constraint above.
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

- Unit suites per layer, in `test/`.
- **Recording replay** — [test/recording.test.ts](../test/recording.test.ts) runs two real
  transcripts through the shipped machine. The expectations were read off the recordings, not off
  the code: eight specific turns must be recognized and thirty must not be.
- Fixtures are derived, not hand-written: [scripts/derive-fixture.mjs](../scripts/derive-fixture.mjs)
  is the provenance, and the raw recordings stay out of the repository.
