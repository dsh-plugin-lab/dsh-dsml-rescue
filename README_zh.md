<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><strong>把"思考里写了工具调用标记、于是什么都没发生"的那一回合续上</strong></p>
  <p><em>Continue the turn a model stalled by writing tool-call markup into its reasoning</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat" alt="MIT License"></a>
  </p>

  <p>
    每个版本改了什么 → <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/releases">Releases</a>
  </p>

  <p>
    <a href="README.md">English</a> · <strong><a href="README_zh.md">简体中文</a></strong>
  </p>
</div>

---

有些 provider 路由会把模型的工具调用当成**普通思考文本**吐回来，里面夹着调用本身的协议标记。于是调用没有发生，回合以"什么都没产出"结束，会话就停在那儿等人敲一句"继续"。这个插件替你敲。

## 它做什么

- 只续一种回合：以泄漏的协议标记结束、且**没有产出任何别的**内容的回合。
- 只发一句中性的话：要么执行下一步，要么收尾给结论。
- 让着你：你已经在打字时它不插话。
- 续几次就停，不会无限花请求。
- 子 agent 也管，被派出去的活儿不会"卡着却被告知已结束"。

## 开始用

**前置**：DSH 当前 RC 线；Node `>= 20`。兼容区间的唯一来源是 [package.json](package.json) 里的 `engines.dsh`。

```bash
dsh plugin --profile web add dsh-dsml-rescue
```

重启 `dsh --profile web` 即可。不需要配置，默认值就是预期行为。

从源码装：`git clone` 后 `pnpm install && pnpm run build`，再 `dsh plugin --profile web add "$PWD"`。

## 它不做什么

- **不修根因。** 泄漏发生在模型之下，任何提示词都规避不了；本插件只把随之而来的停顿缩短。
- **不救其他空转。** 没有标记就不救——用户主动取消、请求失败、以及输出被长度截断后停在原地的回合，都不碰。
- **不动你的对话。** 不改写、不重发；只多加一条消息，然后交给宿主继续跑。

## 配置

三个键，都可选：`enabled`、`maxConsecutive`、`applyToSubagents`。默认值以及改动各自的影响 →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#configuration)。

## 内部实现

怎么认定一次空转、续跑消息为什么排在那个位置、哪些约束不能破 →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
每项检查能证明什么、以及可复现的端到端验法 → [docs/VERIFICATION.md](docs/VERIFICATION.md)。

## 许可

[MIT](LICENSE)
