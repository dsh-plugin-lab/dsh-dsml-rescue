# Publishing

The flow is [.github/workflows/release.yml](../.github/workflows/release.yml). It states what it
guarantees at the top; this page only records what a release needs from a human beforehand, and how
to tell afterwards that what shipped is what merged.

## Before a release

- **Bump `version` in [package.json](../package.json) and commit it.** The flow never bumps it, and
  that is asserted rather than documented — see `findVersionWrites` in
  [scripts/check-release.mjs](../scripts/check-release.mjs).
- **Confirm the commit is on the remote.** A release reads the remote, not the working tree.
- **Once per repository**, on npmjs.com: a Trusted Publisher naming this repository, `release.yml`,
  and the environment the workflow declares. Without it, publishing fails with a 404 and nothing in
  the log says why.
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
