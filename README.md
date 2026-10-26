<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><em>Continue a turn that ended with nothing because the model wrote its tool-call protocol markup into reasoning instead of calling a tool.</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="MIT license"></a>
  </p>

  <p>
    Changes per version → <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/releases">Releases</a> (one per npm version)
  </p>
</div>

---

## What it offers

TODO: what this plugin gives the user, and the capabilities it adds.

## Install

```shell
dsh plugin --profile <profile> add dsh-dsml-rescue
```

## Compatibility

TODO: the host line this supports, and where the dividing line is.

## Configuration

TODO: what can be configured, where it is stored, and the defaults.

## Development

```shell
pnpm install --config.node-linker=hoisted
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run check
```

## License

[MIT](LICENSE)
