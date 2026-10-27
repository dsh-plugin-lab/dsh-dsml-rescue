<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><strong>A stalled turn gets another one</strong></p>
  <p><em>空转的轮次，替你续上</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/dsh-dsml-rescue"><img src="https://img.shields.io/npm/v/dsh-dsml-rescue.svg?style=flat" alt="npm"></a>
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

## Does this look familiar?

You asked for something. The model reasoned for a while. Then the turn simply ended — no answer, no
tool call, nothing. The reasoning output ended with lines like these:

```
</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
```

DSML (DeepSeek Markup Language) is how DeepSeek formats a tool call. Some provider routes hand that
markup back as **ordinary reasoning text** instead of an actual call, so the call never happens, the
turn closes with no output, and everything waits for someone to type "continue".

This plugin types it.

## What it does

- Continues a stalled turn: DSML markup at the end of the reasoning, and nothing else produced.
  Neither half alone is enough — an empty turn without the markup is a different failure.
- Sends one short, neutral line — carry on, or wrap up if the work is done.
- Backs off while you are typing.
- Gives up after a few attempts instead of burning requests.
- Covers subagents too, so a delegated task is not falsely reported as completed while it is stuck.

## Install

```bash
dsh plugin --profile web add dsh-dsml-rescue
```

Then restart `dsh --profile web`. There is nothing you need to configure — the defaults are the
intended behaviour.

Working from source: clone, `pnpm install && pnpm run build`, then
`dsh plugin --profile web add "$PWD"`.

## What it will not do

- **It does not fix the cause.** The markup leaks below the model, out of reach of any prompt. What
  it buys you is the wait, shortened.
- **It does not rescue other empty turns.** No DSML markup, no rescue: a cancellation, a failed
  request, or a reply cut off at the output limit is left alone on purpose.
- **It does not touch your conversation.** Nothing is rewritten or replayed; it adds one message and
  lets the host carry on.

## Going deeper

- Which three settings exist and what each one changes →
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#configuration)
- How a stalled turn is recognised, and the rules that must not be broken →
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- What the tests prove, and how to reproduce the whole thing locally →
  [docs/VERIFICATION.md](docs/VERIFICATION.md)

## License

[MIT](LICENSE)
