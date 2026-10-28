#!/usr/bin/env node
/**
 * Install check — will this plugin actually run, and is it the code you just wrote?
 *
 * Why this exists, and why it is **not** a runtime warning: an unmounted plugin has no code
 * running, so it cannot report its own absence. The failure is silent by construction. A profile
 * can list the package under `dependencies` and still never load it — the loader only mounts a
 * package whose name is in `dsh.profile.bundles` (or that a profile patch inserts explicitly).
 * A dependency alone contributes no patch layer and produces no diagnostic anywhere.
 *
 * Worse, the obvious repair does not work: re-running `dsh plugin add <same package>` skips
 * packages that are already dependencies, so a lost bundle row is never restored by re-adding.
 * The repair is remove-then-add, and this check prints exactly that.
 *
 * Two groups of checks:
 * - **Mount state** — reads a profile's `package.json` and `cordis.patch.yml`.
 * - **Artifact freshness** — a `link:` install runs `lib/` from this checkout, so a stale build
 *   silently runs code that is not in `src/`. Only applies when run from a repository checkout.
 *
 * Usage:
 *   node scripts/doctor.mjs                        # $DSH_HOME, $DSH_PROFILE, else ~/.dsh + web
 *   node scripts/doctor.mjs --profile web --home C:/Users/me/.dsh
 *   node scripts/doctor.mjs --json                 # machine-readable
 *
 * Exit codes: 0 = mounted and current / 1 = not mounted, or the build is stale / 2 = precondition
 * missing (no readable profile manifest).
 *
 * @module dsh-dsml-rescue/doctor
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The package this doctor is about; also the bundle-list entry the loader needs. */
export const PACKAGE = 'dsh-dsml-rescue'

/** One line of the report. */
export const OK = 'ok'
export const FAIL = 'fail'
export const NOTE = 'note'

/**
 * Read one file as UTF-8, or undefined when it is absent or unreadable.
 * @param {string} path - file to read.
 * @returns {string | undefined} the text, or undefined.
 */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Read and parse a JSON file.
 * @param {string} path - file to read.
 * @returns {{ value?: any, error?: string }} the parsed value, or why it failed.
 */
function readJson(path) {
  const text = readText(path)
  if (text === undefined) return { error: `cannot read ${path}` }
  try {
    return { value: JSON.parse(text) }
  } catch (error) {
    return { error: `${path} is not valid JSON: ${String(error)}` }
  }
}

/**
 * Whether a profile patch inserts this package as a row of its own.
 *
 * A patch row is a second, legitimate way to mount the plugin, so a profile that uses it does not
 * need the bundle-list entry. The check is textual on purpose: reading YAML would mean shipping a
 * parser to answer one question, and a comment mentioning the name must not count as a mount —
 * hence the requirement that the name sits on an `id:`/`name:` line that starts a list item.
 * @param {string | undefined} patchText - the profile's cordis.patch.yml.
 * @param {string} name - package name.
 * @returns {boolean} whether a row mounts it.
 */
function patchMounts(patchText, name) {
  if (patchText === undefined) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const row = new RegExp(`^\\s*-?\\s*(?:id|name)\\s*:\\s*['"]?${escaped}['"]?\\s*$`, 'm')
  return row.test(patchText)
}

/**
 * Judge whether the plugin is mounted, from the profile's own two files.
 *
 * Pure apart from nothing: it takes the manifest and the patch text and returns findings, so the
 * rules can be tested without a home directory.
 * @param {{ manifest: any, patchText: string | undefined, name?: string }} input - the profile state.
 * @returns {{ level: string, message: string, hint?: string }[]} findings, most important first.
 */
export function inspectProfile({ manifest, patchText, name = PACKAGE }) {
  const findings = []
  const dependencies = manifest?.dependencies ?? {}
  const bundles = manifest?.dsh?.profile?.bundles ?? []
  const inDependencies = Object.hasOwn(dependencies, name)
  const inBundles = Array.isArray(bundles) && bundles.includes(name)
  const viaPatch = patchMounts(patchText, name)

  if (!inDependencies && !viaPatch) {
    findings.push({
      level: FAIL,
      message: `${name} is not in this profile at all`,
      hint: `install it: dsh plugin --profile <profile> add ${name}`,
    })
    return findings
  }

  if (inBundles) {
    findings.push({
      level: OK,
      message: `${name} is in dsh.profile.bundles — the loader mounts it`,
    })
  } else if (viaPatch) {
    findings.push({
      level: OK,
      message: `${name} is mounted by a row in the profile's cordis.patch.yml`,
      hint: 'a patch row is enough; the bundle-list entry is only needed for a bundle install',
    })
  } else {
    findings.push({
      level: FAIL,
      message: `${name} is a dependency but is NOT in dsh.profile.bundles — it will not load`,
      hint: 'reinstalling does not repair this: `add` skips packages that are already dependencies. Run remove, then add.',
    })
  }

  if (!inDependencies && viaPatch) {
    findings.push({
      level: NOTE,
      message: 'no dependency entry: the loader resolves the row from somewhere else',
    })
  }

  return findings
}

/**
 * Whether the built artifact predates the newest source file.
 *
 * A `link:` install reads `lib/` straight out of the checkout, so the build is the code that runs.
 * Editing `src/` without rebuilding therefore changes nothing at runtime, with no error anywhere.
 * Reports nothing when either side is absent (an installed copy has no `src/`).
 * @param {string} repoRoot - the package directory.
 * @returns {{ level: string, message: string, hint?: string }[]} findings.
 */
export function inspectArtifacts(repoRoot) {
  const libDir = join(repoRoot, 'lib')
  const srcDir = join(repoRoot, 'src')
  if (!existsSync(libDir) || !existsSync(srcDir)) return []

  /** The newest mtime of every file under `dir` with one of the given extensions. */
  const newest = (dir, extensions) => {
    let time = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        time = Math.max(time, newest(path, extensions))
        continue
      }
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue
      try {
        time = Math.max(time, statSync(path).mtimeMs)
      } catch {
        /* a file that vanished mid-scan is not a finding */
      }
    }
    return time
  }

  const built = newest(libDir, ['.js'])
  const source = newest(srcDir, ['.ts'])
  if (built === 0) {
    return [
      {
        level: FAIL,
        message: 'lib/ holds no built JavaScript, so a link install has nothing to load',
        hint: 'run `pnpm run build`',
      },
    ]
  }
  if (source > built) {
    return [
      {
        level: FAIL,
        message: 'src/ is newer than lib/ — a link install runs the stale build',
        hint: 'run `pnpm run build`, then reload the plugin entry or restart the host',
      },
    ]
  }
  return [{ level: OK, message: 'the built artifact is current with src/' }]
}

/**
 * Resolve the profile directory this run should inspect.
 * @param {{ profile?: string, home?: string }} options - command-line options.
 * @returns {{ profile: string, dir: string, home: string }} the resolved location.
 */
export function resolveProfile(options = {}) {
  const home = resolve(options.home ?? process.env['DSH_HOME'] ?? join(homedir(), '.dsh'))
  const profile = options.profile ?? process.env['DSH_PROFILE'] ?? 'web'
  return { profile, dir: join(home, 'profiles', profile), home }
}

/** Parse `--key value` and `--key=value` flags. */
function parseArgs(argv) {
  const options = { json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? ''
    if (argument === '--json') {
      options.json = true
      continue
    }
    const match = /^--(profile|home)(?:=(.*))?$/.exec(argument)
    if (match === null) continue
    const key = match[1]
    const inline = match[2]
    if (inline !== undefined) options[key] = inline
    else {
      options[key] = argv[index + 1]
      index += 1
    }
  }
  return options
}

/** Run the report. */
function main() {
  const options = parseArgs(process.argv.slice(2))
  const { profile, dir, home } = resolveProfile(options)
  const manifestPath = join(dir, 'package.json')
  const parsed = readJson(manifestPath)
  if (parsed.error !== undefined) {
    process.stderr.write(`doctor: ${parsed.error}\n`)
    process.stderr.write(`doctor: is the profile name right? (home ${home}, profile ${profile})\n`)
    process.exit(2)
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const findings = [
    ...inspectProfile({
      manifest: parsed.value,
      patchText: readText(join(dir, 'cordis.patch.yml')),
    }),
    ...inspectArtifacts(repoRoot),
  ]
  const failed = findings.some((finding) => finding.level === FAIL)

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ profile, home, mounted: !failed, findings }, undefined, 2)}\n`,
    )
  } else {
    process.stdout.write(`doctor: profile ${profile} (${dir})\n`)
    for (const finding of findings) {
      const mark = finding.level === OK ? 'ok  ' : finding.level === FAIL ? 'FAIL' : 'note'
      process.stdout.write(`  ${mark}  ${finding.message}\n`)
      if (finding.hint !== undefined) process.stdout.write(`        ${finding.hint}\n`)
    }
  }
  process.exit(failed ? 1 : 0)
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
}
