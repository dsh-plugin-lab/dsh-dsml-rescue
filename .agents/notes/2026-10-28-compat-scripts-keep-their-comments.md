# 决策：兼容性巡检脚本的注释不译（2026-10-28）

状态：生效

## 问题

`scripts/check-declaration.mjs`、`compat-swap.mjs`、`report-compat-failure.mjs` 的注释不是英文，
本仓其余代码与文档是英文。翻译，还是原样保留？

## 决策

原样保留，只改必须改的两处：

- `report-compat-failure.mjs` 的恢复文本指向一份不在这里的决策记录 → 改指
  [docs/PUBLISHING.md](../../docs/PUBLISHING.md)。
- 同文件的 `--line` 白名单只认 dist-tag，而巡检矩阵有两条腿按版本前缀定位族 → 补上两个前缀。

## 替代方案（强制）

- **译成英文**：四百余行散文，每句都可能改掉一处判据的措辞；而一致性的价值高于语言统一。
- **自己重写**：两个实现必然分叉。

## 影响

`scripts/` 与 `src/` 注释语言不同。改这几个脚本的判据时，需同批同步给其他持有同一份脚本的仓。
