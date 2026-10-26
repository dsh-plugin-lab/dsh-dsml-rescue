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
