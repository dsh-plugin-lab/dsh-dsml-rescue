/**
 * The type face of [doctor.mjs](doctor.mjs).
 *
 * Why hand-write this instead of turning on `allowJs`: `test/doctor.test.ts` imports the module so
 * the suite and the CLI read **one** set of rules, and enabling `allowJs` would drag every other
 * `.mjs` in this directory into the strict check — that is a separate question from this one.
 *
 * **Change this file in the same commit as the implementation.** A drift is not silent:
 * `pnpm run typecheck` fails, and so does [../test/doctor.test.ts](../test/doctor.test.ts).
 */

/** The package this doctor is about; also the bundle-list entry the loader needs. */
export const PACKAGE: string

/** A finding that the check passed. */
export const OK: 'ok'
/** A finding that the plugin will not do its job. */
export const FAIL: 'fail'
/** A finding worth reading that is not a failure. */
export const NOTE: 'note'

/** One line of the report. */
export interface Finding {
  /** `ok`, `fail`, or `note`. */
  level: string
  /** What was established. */
  message: string
  /** What to do about it, when there is something to do. */
  hint?: string
}

/**
 * Judge whether the plugin is mounted, from the profile's own two files.
 *
 * @param input - the profile's manifest and patch text.
 * @returns findings, the decisive one first; empty only for a manifest that is not an object.
 */
export function inspectProfile(input: {
  manifest: unknown
  patchText: string | undefined
  name?: string
}): Finding[]

/**
 * Whether the built artifact predates the newest source file.
 *
 * @param repoRoot - the package directory.
 * @returns one finding; empty when either `lib/` or `src/` is absent.
 */
export function inspectArtifacts(repoRoot: string): Finding[]

/**
 * Resolve the profile directory this run should inspect.
 *
 * @param options - `--profile` and `--home` as given on the command line.
 * @returns the profile name, its directory, and the resolved home.
 */
export function resolveProfile(options?: { profile?: string; home?: string }): {
  profile: string
  dir: string
  home: string
}
