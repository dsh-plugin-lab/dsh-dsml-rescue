<p align="center">
  <img src="icon.svg" alt="dsh-dsml-rescue" width="80" height="80">
</p>

<h1 align="center">dsh-dsml-rescue</h1>

<div align="center">
  <p><strong>空转的轮次，替你续上</strong></p>
  <p><em>A stalled turn gets another one</em></p>

  <p>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white" alt="powered by dsh"></a>
  </p>

  <p>
    <a href="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml"><img src="https://github.com/dsh-plugin-lab/dsh-dsml-rescue/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/dsh-dsml-rescue"><img src="https://img.shields.io/npm/v/dsh-dsml-rescue.svg?style=flat" alt="npm"></a>
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

## 这场景眼熟吗

你提了要求，模型推理了一会儿，然后这一轮就这么结束了——没有回复、没有工具调用，什么都没有。推理过程的最后几行是这样：

```
</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>
```

DSML（DeepSeek Markup Language）是 DeepSeek 表示工具调用的协议标记。某些 provider 路由会把这段标记当成**普通推理文本**返回，而不是真的发出调用；于是调用没有发生，这一轮空着结束，所有人都在等一句「继续」。

这个插件替你把这句「继续」发出去。

## 它做什么

- 只救空转的轮次：推理过程末尾带着 DSML 标记，而且没有产出任何别的内容。
- 发一句很短、很中性的话：接着做，或者已经做完就收尾。
- 你正在打字时它让开。
- 连着几次没救回来就收手，不会一直烧请求。
- 子代理也管：被派出去的任务不会在卡住时被误报为已完成。

## 安装

```bash
dsh plugin --profile web add dsh-dsml-rescue
```

然后重启 `dsh --profile web`。不需要配置，默认值就是预期行为。

从源码装：先 clone，`pnpm install && pnpm run build`，再 `dsh plugin --profile web add "$PWD"`。

## 它不会做什么

- **不修根因。** 标记泄漏发生在模型之下，提示词够不着。它换来的只有那段等待被缩短。
- **不救别的空转轮次。** 没有 DSML 标记就不出手：你主动取消、请求失败、回复被输出上限截断，这些都刻意不碰。
- **不动你的对话。** 不改写、不重放历史，只多加一条消息，剩下的交给宿主。

## 想了解更多

- 有哪三个配置项、各自会改变什么 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#configuration)
- 怎么认定一个空转轮次、哪些规则不能破 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 测试能证明什么、怎么在本机完整复现 → [docs/VERIFICATION.md](docs/VERIFICATION.md)

## 许可

[MIT](LICENSE)
