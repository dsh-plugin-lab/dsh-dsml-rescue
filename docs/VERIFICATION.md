# Verification

How to convince yourself this plugin does what it claims, and what each check does **not**
establish. The design these checks protect is in [ARCHITECTURE.md](ARCHITECTURE.md).

## What runs on every change

`pnpm run check` — typecheck, build, the suites below, and the release-state invariants.

| Check | Establishes | Does not establish |
|---|---|---|
| `test/protocol.test.ts` | the markup matcher accepts every spelling of the dialect, ignores tokenizer artifacts in the token name, and rejects a sentence that quotes it | — |
| `test/detect.test.ts` | a turn counts as a stall only when it produced nothing actionable | — |
| `test/policy.test.ts` | the order of the cap, the human, and the streak reset | — |
| `test/machine.test.ts` | those answers compose across whole turns, including what ends an automatic run and that a truncated step is excluded | that the token accounting it reads matches a real provider's |
| `test/runtime.test.ts` | the plugin, mounted on a real Cordis context, translates events, excludes a spent output budget, and queues the continuation | that the host then spends a model request on it |
| `test/recording.test.ts` | the shipped machine recognizes exactly the eight stalled turns in a real transcript, and none of the other thirty | that the same holds for a route that leaks differently |

The recording fixtures are derived, not hand-written; see `scripts/derive-fixture.mjs` and the
evidence note under [.agents/notes/](../.agents/notes/).

## The end-to-end check

None of the suites above reach a provider, so they cannot prove the loop acts on the queued message.
This check does, deterministically and without a real stall: a local endpoint answers the first
request with reasoning that ends in the leaked markup — the shape a real route produced — and every
later request normally.

`scripts/mock-stall-server.mjs` is that endpoint. Run it, point a throwaway profile at it, and start
one task:

```shell
# 1. the mock provider (port, then its request log)
node scripts/mock-stall-server.mjs 18099 "$TEMP/reqs.log"

# 2. a throwaway profile, so the live ones are untouched
dsh --profile dsmltest --from-default-profile headless --dump-config
#    in $DSH_HOME/profiles/dsmltest: add the provider overlay to cordis.patch.yml
#    (api openai-completions, baseURL http://127.0.0.1:18099/v1, one model),
#    point agent-default-model at it, then link this plugin:
pnpm add "link:<this repository>" --config.node-linker=hoisted
#    and add "dsh-dsml-rescue" to dsh.profile.bundles in the profile's package.json

# 3. one task, with the mock's expected key
MOCK_API_KEY=mock-key dsh --profile dsmltest "Say hello."
```

Pass conditions, in the request log and the terminal:

- the first request is followed by a **second agent request** whose last message is
  `Continue with the task.…` — the plugin's fixed text, unchanged,
- the terminal prints the model's answer instead of stopping after reasoning,
- a `user/message` with source kind `dsml-rescue` is in that session's log.

Three requests in total are expected: the stalled step, a session-title request the host issues on
its own, and the continuation. A run giving up at the cap should instead show the stall, the cap's
worth of continuations, and then nothing.

Remove the throwaway profile and its sessions afterwards; the check must not touch a live profile.

## What still cannot be checked here

- A real route that leaks the markup differently. The end-to-end check uses one spelling; widening
  the matcher is a judgment call that needs a new recording, not a new test.
- Whether a parent agent should be told sooner. The ordering guarantee is reasoned from the
  subagent settlement contract in [ARCHITECTURE.md](ARCHITECTURE.md), not observed in a live
  parent/child pair.
