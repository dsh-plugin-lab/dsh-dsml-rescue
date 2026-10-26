<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><em>When a model writes its tool-call protocol markup into reasoning, the turn ends with nothing. This continues it.</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat&logo=none" alt="MIT license"></a>
  </p>

  <p>
    Changes per version → <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/releases">Releases</a> (one per npm version)
  </p>
</div>

---

## What it offers

Some provider routes deliver a model's tool-call dialect as ordinary reasoning text instead of a structured tool call. The call never happens, the turn closes having produced nothing, and the conversation simply stops until someone types "continue".

This plugin notices that specific ending and continues the turn for you.

- Continues a turn that closed with leaked protocol markup and nothing else.
- Sends one neutral sentence: take the next step, or close out with a summary.
- Reads your own prompts first — if you are already typing, it stays out of the way.
- Stops after a few attempts instead of spending requests forever.
- Covers child agents too, so a delegated run is not reported finished while it is stuck.

It shortens the pause; it does not fix the route that leaks the markup. See [What it does not do](#what-it-does-not-do).

## Install

```shell
dsh plugin --profile <profile> add dsh-dsml-rescue
```

Nothing to configure: the defaults are the intended behaviour. Every knob and its default live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#configuration).

## What it does not do

- **It does not fix the cause.** The leak happens below the model, so no prompt can prevent it; this plugin only shortens the pause that follows.
- **It does not rescue turns that ended empty for other reasons.** No markup, no rescue.
- **It does not touch your conversation.** Nothing is rewritten, trimmed, or re-sent; it adds one message and lets the host run.

## Compatibility

The supported host line is `engines.dsh` in [package.json](package.json), which is the single source for it.

## Development

```shell
pnpm install --config.node-linker=hoisted
pnpm run check    # typecheck + build + test + release-state checks
```

How the pieces fit, and why the judgment lives where it does → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Maintainer index → [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
