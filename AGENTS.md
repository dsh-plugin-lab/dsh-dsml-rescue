# dsh-dsml-rescue — maintenance index

## Status

- Version: the `version` field in [package.json](package.json)
- Not published yet

## Commands

```shell
pnpm run check          # typecheck + build + test + the release-state checks
pnpm run lint           # ESLint
pnpm run format:check   # formatting
pnpm run check:release  # the release-state invariants on their own
node scripts/derive-fixture.mjs <recording.jsonl> <fixture.jsonl>  # rebuild a test fixture
```

## Where things are

| Question | File |
|---|---|
| What does it decide, and which constraints are binding? | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| How do I prove it works, and what does each check miss? | [docs/VERIFICATION.md](docs/VERIFICATION.md) |
| How do I publish? | [docs/PUBLISHING.md](docs/PUBLISHING.md) |
| Why was a rule chosen? | [.agents/notes/](.agents/notes/) |
| What does a user see? | [README.md](README.md) |
| What must a plugin repository look like? | [plugin conventions](https://github.com/dsh-plugin-lab/.github/blob/main/docs/plugin-conventions.md) |
| Does something count as a defect? | [criteria](https://github.com/dsh-plugin-lab/.github/blob/main/docs/criteria.md) |

The rules themselves live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and nowhere else —
including the configuration defaults, which the README links to instead of copying.

## Rebuilding a fixture

`test/fixtures/` is derived, never hand-edited. To refresh it from a new recording:

```shell
node scripts/derive-fixture.mjs "_analysis/session.v4.jsonl" "test/fixtures/stall-run.jsonl"
```

Then re-read the recording for the turns that actually stall and update the expectations in
[test/recording.test.ts](test/recording.test.ts). Do not read them off the code's output: that makes
the suite agree with whatever bug it has.

## To do

- [ ] Publish to npm, and add the Trusted Publisher on npmjs.com (see [docs/PUBLISHING.md](docs/PUBLISHING.md)).
- [ ] Confirm the ordering guarantee against a live parent/child pair: the reasoning is derived from
      the subagent settlement contract, not observed. See
      [docs/VERIFICATION.md](docs/VERIFICATION.md#what-still-cannot-be-checked-here).

## Known traps

- **Never write to the inbox when giving up.** A child agent settles only while its inbox is empty,
  so a leftover message leaves it unsettled forever and its parent never learns the run ended. See
  [the turn-stopping decision](.agents/notes/2026-10-26-turn-stopping-and-settlement.md).
- **A `session/event` listener cannot append.** It runs while the log entry is still open.
- **Do not judge a stall from `turn/end`.** The end reason is not in the turn-stopping payload, so
  that seam sees every offer as a completed turn; an aborted turn's close clears the streak instead.
  Widening it would rescue cancellations.
- **Fixtures are trimmed.** They keep only what detection reads; changing what the machine needs
  means editing `scripts/derive-fixture.mjs` and re-deriving, not editing the fixture.
- **`_analysis/` is git-ignored and holds tens of megabytes.** Do not add it to `files`.
