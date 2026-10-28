# dsh-dsml-rescue — maintenance index

## Status

- Version: the `version` field in [package.json](package.json)
- Published on npm; releases go through the workflow — see [docs/PUBLISHING.md](docs/PUBLISHING.md)

## Commands

```shell
pnpm run check          # typecheck + build + test + the release-state checks
pnpm run lint           # ESLint
pnpm run format:check   # formatting
pnpm run check:release  # the release-state invariants on their own
pnpm run doctor         # is the plugin mounted in a profile, and is lib/ current? (exit 1 = no)
pnpm run check:declaration  # does the declared host range still cover the line users install? (network)
node scripts/derive-fixture.mjs <recording.jsonl> <fixture.jsonl>  # rebuild a test fixture
```

## Where things are

| Question | File |
|---|---|
| What does it decide, and which constraints are binding? | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| How do I prove it works, and what does each check miss? | [docs/VERIFICATION.md](docs/VERIFICATION.md) |
| How do I publish? | [docs/PUBLISHING.md](docs/PUBLISHING.md) |
| Why was a rule chosen? | [.agents/notes/](.agents/notes/) |
| What does a user see? | [README.md](README.md) · [README_zh.md](README_zh.md) |
| What must a plugin repository look like? | [plugin conventions](https://github.com/dsh-plugin-lab/.github/blob/main/docs/plugin-conventions.md) |
| Does something count as a defect? | [criteria](https://github.com/dsh-plugin-lab/.github/blob/main/docs/criteria.md) |

The rules themselves live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and nowhere else —
including the configuration defaults, which the README links to instead of copying. The one thing
the two READMEs own is the user-facing summary: what it does, how to install it, what it refuses.
A fact is written down in ARCHITECTURE first and summarised in the READMEs after; the READMEs never
state a rule the architecture does not.

## Rebuilding a fixture

`test/fixtures/` is derived, never hand-edited. To refresh it from a new recording:

```shell
node scripts/derive-fixture.mjs "_analysis/session.v4.jsonl" "test/fixtures/stall-run.jsonl"
```

Then re-read the recording for the turns that actually stall and update the expectations in
[test/recording.test.ts](test/recording.test.ts). Do not read them off the code's output: that makes
the suite agree with whatever bug it has.

## To do

- [ ] Confirm the ordering guarantee against a live parent/child pair: the reasoning is derived from
      the subagent settlement contract, not observed. See
      [docs/VERIFICATION.md](docs/VERIFICATION.md#what-still-cannot-be-checked-here).
- [ ] The draft Release holds only tooling and documentation PRs so far; leave it until a change
      reaches the artifact — see [docs/PUBLISHING.md](docs/PUBLISHING.md#which-changes-deserve-a-release).

## Known traps

One line each, plus where the rule itself lives — the reasoning is not repeated here.

- **Never write to the inbox when giving up.** A leftover message leaves a capped-out child
  unsettled forever. →
  [where the continuation is queued](docs/ARCHITECTURE.md#where-the-continuation-is-queued)
  ([why](.agents/notes/2026-10-26-turn-stopping-and-settlement.md))
- **A `session/event` listener cannot append.** It runs while the log entry is still open. → the
  [same section](docs/ARCHITECTURE.md#where-the-continuation-is-queued).
- **Do not judge a stall from `turn/end`.** That seam cannot see the end reason, so widening it would
  rescue cancellations. → [the decision](docs/ARCHITECTURE.md#the-decision)
- **Fixtures are trimmed.** They keep only what detection reads; changing what the machine needs
  means editing `scripts/derive-fixture.mjs` and re-deriving, not editing the fixture.
- **`_analysis/` is git-ignored and holds tens of megabytes.** Do not add it to `files`.
- **A dependency without a bundle-list entry never loads, and nothing says so.** The loader mounts
  only what `dsh.profile.bundles` (or a patch row) names, and re-running `add` does not repair a lost
  entry — it skips packages that are already dependencies. Repair is remove-then-add; check with
  `pnpm run doctor`. → [the install check](docs/VERIFICATION.md#the-install-check)
- **`lib/` is the code a `link:` install runs.** Editing `src/` without `pnpm run build` changes
  nothing at runtime, with no error — `pnpm run doctor` compares the two.
