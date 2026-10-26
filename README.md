<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><strong>Continue the turn a model stalled by writing tool-call markup into its reasoning</strong></p>
  <p><em>把"思考里写了工具调用标记、于是什么都没发生"的那一回合续上</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="MIT License"></a>
  </p>

  <p>
    Per-version changes → <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/releases">Releases</a>
  </p>

  <p>
    <strong><a href="README.md">English</a></strong> · <a href="README_zh.md">简体中文</a>
  </p>
</div>

---

Some provider routes deliver a model's tool call as **reasoning text carrying the call's own markup**
instead of a structured call. The call never happens, the turn closes having produced nothing, and
the conversation waits for someone to type "continue". This plugin types it for you.

## What it does

- Continues a turn that closed with leaked protocol markup and **nothing else**.
- Sends one neutral sentence: take the next step, or close out with a summary.
- Waits for you — if you are already typing, it stays out of the way.
- Stops after a few attempts instead of spending requests forever.
- Covers child agents too, so a delegated run is not reported finished while it is stuck.

## Getting started

**Prerequisites**: DSH on its current RC line; Node `>= 20`. The only source for the compatible range
is `engines.dsh` in [package.json](package.json).

```bash
dsh plugin --profile web add dsh-dsml-rescue
```

Restart `dsh --profile web`. Nothing to configure: the defaults are the intended behaviour.

From source: `git clone`, then `pnpm install && pnpm run build`, then
`dsh plugin --profile web add "$PWD"`.

## What it will not do

- **It does not fix the cause.** The leak happens below the model, so no prompt prevents it; this
  plugin only shortens the pause that follows.
- **It does not rescue turns that ended empty for other reasons.** No markup, no rescue — a
  cancellation, a failure, or a step cut off at its output ceiling all stay untouched.
- **It does not touch your conversation.** Nothing is rewritten or re-sent; it adds one message and
  lets the host run.

## Configuration

Three keys, all optional: `enabled`, `maxConsecutive`, `applyToSubagents`. Defaults, and what moving
each one changes → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#configuration).

## Under the hood

How a stall is recognized, why the continuation is queued where it is, and what must not change →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
What each check establishes, and a repeatable end-to-end run → [docs/VERIFICATION.md](docs/VERIFICATION.md).

## License

[MIT](LICENSE)
