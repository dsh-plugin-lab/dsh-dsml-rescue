/**
 * The install check's rules, held where the recorded sessions cannot reach them.
 *
 * `scripts/doctor.mjs` answers a question no test run can: *is this plugin mounted, and is the
 * build the one in `src/`?* It exists because an unmounted plugin has no code running and so
 * cannot report its own absence — the failure is silent by construction, and the obvious repair
 * (`add` the same package again) is a no-op for a package that is already a dependency.
 *
 * The two `inspect*` functions are pure, so these assertions are about the rules rather than about
 * a filesystem: which inputs read as mounted, and which read as "looks installed, will not load".
 */

import { describe, expect, it } from 'vitest'

import { FAIL, OK, inspectProfile } from '../scripts/doctor.mjs'
import type { Finding } from '../scripts/doctor.mjs'

const NAME = 'dsh-dsml-rescue'

/** A profile manifest with the given dependency and bundle list. */
function manifest(
  options: { dependency?: boolean; bundles?: string[] } = {},
): Record<string, unknown> {
  const { dependency = false, bundles = [] } = options
  return {
    name: 'dsh-profile-test',
    dependencies: dependency ? { [NAME]: `link:/somewhere/${NAME}` } : {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', ...bundles] } },
  }
}

/** The levels a finding list ends up with. */
function levels(findings: Finding[]): string[] {
  return findings.map((finding) => finding.level)
}

describe('挂载状态', () => {
  it('依赖 + bundle 行 = 会加载', () => {
    const findings = inspectProfile({
      manifest: manifest({ dependency: true, bundles: [NAME] }),
      patchText: undefined,
    })
    expect(levels(findings)).toEqual([OK])
  })

  it('只有依赖、没有 bundle 行 = 不会加载（就是这次遇到的那种形态）', () => {
    const findings = inspectProfile({
      manifest: manifest({ dependency: true }),
      patchText: undefined,
    })
    expect(levels(findings)).toContain(FAIL)
    expect(findings[0]?.message).toContain('will not load')
  })

  it('判红时点名「重装修不好」—— 这正是最容易走错的修法', () => {
    const findings = inspectProfile({
      manifest: manifest({ dependency: true }),
      patchText: undefined,
    })
    const failure = findings.find((finding) => finding.level === FAIL)
    expect(failure?.hint).toMatch(/does not repair|remove/)
  })

  it('profile patch 里有一行也算挂上 —— 那是另一条合法路径', () => {
    const findings = inspectProfile({
      manifest: manifest({ dependency: true }),
      patchText: "- id: 'dsh-dsml-rescue'\n  name: 'dsh-dsml-rescue'\n",
    })
    expect(levels(findings)).toEqual([OK])
    expect(findings[0]?.message).toContain('cordis.patch.yml')
  })

  it('注释里提到包名不算挂载 —— 否则这个检查会被自己的说明文字骗过', () => {
    const findings = inspectProfile({
      manifest: manifest({ dependency: true }),
      patchText: '# dsh-dsml-rescue is inserted by the bundle layer\n[]\n',
    })
    expect(levels(findings)).toContain(FAIL)
  })

  it('压根没装 = 直接判红，并给出安装命令', () => {
    const findings = inspectProfile({ manifest: manifest(), patchText: undefined })
    expect(levels(findings)).toEqual([FAIL])
    expect(findings[0]?.message).toContain('not in this profile')
  })
})
