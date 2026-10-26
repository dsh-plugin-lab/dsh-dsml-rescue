# dsh-dsml-rescue — maintenance index

## Status

- Version: the `version` field in [package.json](package.json)
- Not published yet

## Commands

```shell
pnpm run check          # typecheck + build + test + the release-state check
pnpm run lint           # ESLint
pnpm run format:check   # formatting
pnpm run check:release  # the release-state invariants on their own
```

## Releasing

The flow is [.github/workflows/release.yml](.github/workflows/release.yml); it says at the top what
it guarantees and what is deliberately this repository's own business. Two things it relies on you
having done:

- **Before** a release, bump `version` in [package.json](package.json) and commit it. The flow never
  bumps it, and that is asserted rather than merely documented.
- **Once** per repository, on npmjs.com: a Trusted Publisher for this package, naming this
  repository, `release.yml` and the environment name the workflow declares. Without it, publishing
  fails with a 404 and nothing in the logs says why.

Labels on merged pull requests decide what the release body says. Which labels exist is this
repository's own business; the family only fixes how a draft is turned into a body.

## Document map

- What it offers → [README.md](README.md)
- Design → [docs/](docs/)
- Decisions and their evidence → [.agents/notes/](.agents/notes/)
- Cross-repository conventions → [plugin-conventions](https://github.com/dsh-plugin-lab/.github/blob/main/docs/plugin-conventions.md)
- Whether something counts as a defect → [criteria](https://github.com/dsh-plugin-lab/.github/blob/main/docs/criteria.md)

## To do

- TODO

## Known traps

- TODO
