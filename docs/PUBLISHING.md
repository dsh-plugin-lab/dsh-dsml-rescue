# Publishing

The flow is [.github/workflows/release.yml](../.github/workflows/release.yml). It states what it
guarantees at the top; this page only records what a release needs from a human beforehand, and how
to tell afterwards that what shipped is what merged.

## The first release was manual, and only that one

`0.1.0` was published by hand with an interactive `npm login`, because npm attaches a Trusted
Publisher to a package that already exists. Everything after it goes through the workflow, with no
token anywhere.

That first publish left the OIDC path unproven, so `0.2.0` is the release that validates it: the
Trusted Publisher requires one successful publish before its deadline, and a manual publish cannot
satisfy that.

## Before a release

- **Bump `version` in [package.json](../package.json) and commit it.** The flow never bumps it, and
  that is asserted rather than documented — see `findVersionWrites` in
  [scripts/check-release.mjs](../scripts/check-release.mjs).
- **Confirm the commit is on the remote.** A release reads the remote, not the working tree.
- **The npm side names an environment, and it must be the workflow's word.** This repository uses
  `release`, and [release.yml](../.github/workflows/release.yml) declares that same word. Two fields
  on the npm form decide whether publishing works at all, and a mismatch fails with a 404 and no
  explanation:
  - **Environment name** is the field that matters.
  - **Label** is a free-text display name and is matched against nothing.

  Read the configured value on npmjs.com rather than trusting this page — the platform owns it.
- Run `pnpm run check` locally. It ends with the release-state invariants, which are the part CI
  cannot catch: display metadata, icon, exported locale files, and declaration self-consistency.

## Does the declaration still cover the line users install?

`engines.dsh` and every `@deepseek-ai/dsh-*` edge name the host the plugin runs on. That range is not
a fact about this repository — it is a claim about npm, and npm moves. `pnpm run check:declaration`
asks npm itself whether the claim still holds:

```shell
pnpm run check:declaration              # every declared line
pnpm run check:declaration -- --line next   # one line
```

It judges the **declared** lines rather than the newest release: a dist-tag that has moved past a
declared family is a prompt to re-examine the floor, not a failure. Nothing here decides semver by
hand — the ranges are matched by npm's own implementation, because a hand-rolled comparison of
prerelease ranges produces false greens.

Exit codes: `0` every declared range covers every target line, `1` one does not, `2` usage or
precondition (no network, no registry) — and a precondition failure is reported as such rather than
as "the range does not cover", which would read an infrastructure fault as a declaration problem.

The other half of the question is what npm is actually serving **now**, and whether the code still
runs against it. [scripts/compat-swap.mjs](../scripts/compat-swap.mjs) rewrites the declared ranges
onto one line and reinstalls:

```shell
node scripts/compat-swap.mjs check                 # the live version of each managed package per line
node scripts/compat-swap.mjs swap --line next      # rewrite package.json onto that line, then install
node scripts/compat-swap.mjs verify --line next    # assert node_modules really landed there
```

Three details are load-bearing. The rewrite **preserves the operator** — it only moves version
numbers, so `^` stays `^` and the union stays a union; whatever shape `package.json` uses, the swap
does not silently convert it. `engines.dsh` is swapped in the same pass as the dependency edges,
because the redline that asserts they are byte-identical would otherwise go red for a reason that has
nothing to do with compatibility. And `verify` exists because an install can leave `node_modules` on
the old versions while appearing to succeed, which would run the suite against dependencies nobody
declared — a green result about the wrong tree.

`node scripts/compat-swap.mjs selftest` runs the range-rewriting table offline, and
[test/compat-swap.test.ts](../test/compat-swap.test.ts) holds it to that.

## Which changes deserve a release

None of them, if they cannot change what npm serves: documentation, tests, CI, and tooling under
`.agents/`, `.github/`, `docs/`, `scripts/`, and `test/` merge and stop there. That is not etiquette
here — [scripts/release-guard.mjs](../scripts/release-guard.mjs) decides it from the paths since the
last tag, and [release.yml](../.github/workflows/release.yml) refuses to publish when it finds no
artifact change. The draft Release keeps accumulating those PRs; it goes out with the next change
that does reach the artifact.

What the guard cannot see is a behaviour-preserving edit inside shipped code — a renamed constant, a
moved string. That one is a human's answer, so the rule is: if it changes nothing a user can notice,
let the draft wait.

## After a release

- The version on npm matches the merged commit, and the market listing shows the new version with
  its title and icon. A missing title or icon means the package dropped a file the market reads,
  which `pnpm run check:release` would have caught.
- The draft release for the tag is deleted by the flow; a leftover draft is a defect.
- A merged version that is not on npm is invisible from inside this repository — the market's drift
  report is what surfaces it.

## Not this repository's business

Job layout, matrix, and the check chain before publishing are per-repository choices; the shared
guarantees are in the [plugin conventions](https://github.com/dsh-plugin-lab/.github/blob/main/docs/plugin-conventions.md).
