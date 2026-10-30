/**
 * Redline guards: the rules this repository states in prose, made executable.
 *
 * A rule that lives only in a document decays — nothing re-reads it. Every `it` here is one
 * assertion the organization's criteria ask a plugin repository to hold, or one invariant from
 * [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), and the comment above each block says why the
 * assertion exists rather than what it does.
 *
 * What is **not** repeated here: the display metadata, the icon's geometry and the release flow.
 * `scripts/check-release.mjs` already asserts those on every `pnpm run check`, and a second copy
 * would be the two-sources-of-truth failure this file exists to prevent.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CONTINUE_PROMPT, createRescueMessage } from '../src/messages.ts'

/**
 * Read the **committed** `package.json`.
 *
 * Anything judging what this package *promises* has to read this copy: the compatibility patrol
 * narrows the working tree to one family (`compat-swap.mjs swap --only`) to measure that family,
 * and that narrowing is a one-off measurement which is never committed. Reading the working tree
 * would report the measurement as a defect — the patrol could then never be green.
 *
 * Returns undefined where there is no history to read (a published tarball, a git-less checkout);
 * callers decide how to degrade.
 */
function readCommittedPackageJson(): { engines?: Record<string, string> } | undefined {
  const result = spawnSync('git', ['show', 'HEAD:package.json'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  if (result.status !== 0 || typeof result.stdout !== 'string') return undefined
  try {
    return JSON.parse(result.stdout) as { engines?: Record<string, string> }
  } catch {
    return undefined
  }
}

/** Drop block and line comments, so prose about a rule cannot trip the guard for that rule. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Read a repository file as UTF-8. */
function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

/** Read and parse a repository JSON file. */
function readJson(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>
}

const pkg = readJson('package.json') as {
  name?: string
  icon?: string
  files?: string[]
  engines?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
}

/**
 * Dependency layering.
 *
 * `@deepseek-ai/*` packages are provided by the host: importing them as runtime dependencies would
 * install a second copy of Cordis and of the agent itself, and the plugin would attach to a context
 * nobody is running. Peer plus dev is the only right shape — and the two must carry the same range,
 * or the tree CI installs is not the tree a consumer gets.
 */
describe('依赖分层', () => {
  it('@deepseek-ai/* 绝不进入 dependencies', () => {
    const runtimeDeps = Object.keys(pkg.dependencies ?? {})
    expect(runtimeDeps.filter((name) => name.startsWith('@deepseek-ai/'))).toEqual([])
  })

  it('每个 @deepseek-ai/* peer 都在 devDependencies 里，且区间逐字相同', () => {
    const peers = pkg.peerDependencies ?? {}
    const devs = pkg.devDependencies ?? {}
    const hosted = Object.keys(peers).filter((name) => name.startsWith('@deepseek-ai/'))
    // Discovering nothing would make the loop below vacuous — that is a broken guard, not a pass.
    expect(hosted.length).toBeGreaterThan(0)
    for (const name of hosted) expect(devs[name], name).toBe(peers[name])
  })

  it('模块依赖单向：index → runtime → machine → {detect, policy} → protocol', () => {
    // The chain is a design claim in docs/ARCHITECTURE.md, not a style preference: judgment has to
    // stay out of the entry file and the pure modules have to stay pure, or the recording replay
    // exercises something other than the shipped code.
    const rank: Record<string, number> = {
      'protocol.ts': 0,
      'policy.ts': 0,
      'messages.ts': 0,
      'detect.ts': 1,
      'machine.ts': 2,
      'runtime.ts': 3,
      'index.ts': 4,
    }
    const files = readdirSync(new URL('../src', import.meta.url)).filter((name) =>
      name.endsWith('.ts'),
    )
    const upward: string[] = []
    for (const file of files) {
      const source = read(`src/${file}`)
      for (const match of source.matchAll(/from\s+'(\.\/[^']+)'/g)) {
        const target = (match[1] ?? '').replace(/^\.\//, '')
        const from = rank[file]
        const to = rank[target]
        if (from === undefined || to === undefined) {
          upward.push(`${file} → ${target}: 未登记的模块，先把它加进这条链`)
          continue
        }
        if (to >= from) upward.push(`${file} → ${target}: 反向或同层依赖`)
      }
    }
    expect(upward).toEqual([])
  })
})

/**
 * The declared host surface.
 *
 * Consumers install a host that satisfies this range, and npm only matches a prerelease candidate
 * against a comparand naming the same `major.minor.patch` — so one family cannot cover the lines
 * this plugin runs on, and a range that loses a family silently drops those users.
 */
describe('声明面自洽', () => {
  const engine = pkg.engines?.['dsh'] ?? ''

  it('engines.dsh 是区间而不是 workspace: 协议', () => {
    expect(engine).not.toBe('')
    expect(engine).not.toContain('workspace:')
  })

  it('engines.dsh 的每一族都点名了一条具体线', () => {
    const families = engine.split('||').map((branch) => branch.trim())
    expect(families.length).toBeGreaterThan(0)
    for (const branch of families) {
      // A bare version lets the next/alpha lines blur together; a prerelease segment keeps them apart.
      expect(branch).toMatch(/^(?:>=|\^|~|=)?\s*\d+\.\d+\.\d+-[0-9A-Za-z.-]+/)
    }
  })

  it('已提交的 engines.dsh 承诺三族 —— 删掉一族等于缩窄对外承诺', () => {
    // Read the **committed** manifest, not the working tree: the compatibility patrol narrows the
    // working copy to a single family with `swap --only` to measure one family, and that measurement
    // is never committed. Judging the working tree would report the measurement as a defect.
    const committed = readCommittedPackageJson()
    if (committed === undefined) return
    const declared = committed.engines?.['dsh'] ?? ''
    const families = declared
      .split('||')
      .map((branch) => /(\d+\.\d+\.\d+)/.exec(branch)?.[0])
      .filter((tuple): tuple is string => tuple !== undefined)
    expect(families, `已提交的 engines.dsh 读不出三族：${declared}`).toHaveLength(3)
    // 0.1.7 is a real compatibility fix, not a precaution: a release once raised the floor past it
    // and declared those users incompatible.
    expect(families).toContain('0.1.7')
    // The two RC tuples are deliberately not written down: npm matches a prerelease candidate only
    // against a comparand naming the same major.minor.patch, so every host side release on a new
    // patch level forces the family to move by hand. What this holds is "do not lose a promised
    // family", not a pinned version.
    expect(families.filter((tuple) => tuple !== '0.1.7')).toHaveLength(2)
  })

  it('每个 @deepseek-ai/dsh-* 声明与 engines.dsh 逐字相同', () => {
    const declared: string[] = []
    for (const field of ['dependencies', 'peerDependencies', 'devDependencies'] as const) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh-')) declared.push(`${field}:${name} = ${range}`)
      }
    }
    expect(declared.length).toBeGreaterThan(0)
    const offenders = declared.filter((entry) => !entry.endsWith(` = ${engine}`))
    expect(offenders, `这些声明与 engines.dsh（${engine}）不同区间`).toEqual([])
  })
})

/**
 * The four dead-code switches are a floor across the organization, not a local preference: with any
 * of them off, the compiler stops being the guard that turns an unused export into a red build.
 */
describe('类型检查开关', () => {
  const tsconfig = JSON.parse(stripComments(read('tsconfig.json'))) as {
    compilerOptions?: Record<string, unknown>
  }

  it('四个死代码开关都读到 true', () => {
    for (const flag of [
      'noUnusedLocals',
      'noUnusedParameters',
      'noImplicitReturns',
      'noFallthroughCasesInSwitch',
    ]) {
      expect(tsconfig.compilerOptions?.[flag], flag).toBe(true)
    }
  })
})

/**
 * The lockfile.
 *
 * pnpm records integrity rather than tarball URLs, so any `http(s)` address at all means the file
 * was generated against a mirror: CI would then fetch from a host nobody declared, and an
 * out-of-sync mirror fails in a way that looks like a missing version.
 */
describe('锁文件', () => {
  it('pnpm-lock.yaml 里除了官方 registry 没有别的地址', () => {
    const lock = read('pnpm-lock.yaml')
    const foreign = [...new Set(lock.match(/https?:\/\/[^\s"',)]+/g) ?? [])].filter(
      (url) => !/^https?:\/\/registry\.npmjs\.org\//.test(url),
    )
    expect(foreign, `锁文件里出现了非官方源的地址：\n${foreign.join('\n')}`).toEqual([])
  })

  it('pnpm-lock.yaml 是唯一的锁文件', () => {
    // Spelled out rather than written literally: a rename sweep once turned a literal into a guard
    // that asserted the opposite of what it meant, and a self-negating guard is worse than none.
    const rivals = [['package', 'lock.json'].join('-'), 'yarn.lock', 'bun.lockb']
    for (const rival of rivals) {
      expect(existsSync(new URL(`../${rival}`, import.meta.url)), rival).toBe(false)
    }
    expect(existsSync(new URL('../pnpm-lock.yaml', import.meta.url))).toBe(true)
  })
})

/**
 * The entry file assembles; it does not decide.
 *
 * Recognition and limits are pure modules so the recorded sessions in `test/fixtures/` exercise the
 * shipped code. An entry file that reached into `detect` would move a rule into the one place the
 * recording replay cannot see.
 */
describe('红线：判断不进入口文件', () => {
  it('src/index.ts 只装配，不 import 任何判断模块', () => {
    const source = stripComments(read('src/index.ts'))
    for (const module of ['detect', 'policy', 'machine', 'protocol']) {
      expect(source, `index.ts 不该 import ./${module}`).not.toMatch(
        new RegExp(`from\\s+'\\./${module}\\.ts'`),
      )
    }
  })

  it('入口文件里没有识别判断，也没有唯一的那个副作用', () => {
    // The config keys are allowed to appear: validating a limit is assembly, and the schema has to
    // live somewhere. What must not appear is the recognition itself, or the call that acts on it.
    const source = stripComments(read('src/index.ts')).toLowerCase()
    for (const word of ['markup', 'leak', 'streak', 'candidate', 'followup']) {
      expect(source, word).not.toContain(word)
    }
  })
})

/**
 * The one side effect, and where it lives.
 *
 * The continuation is queued from `agent/turn-stopping` and nowhere else: an append from an event
 * observer is rejected, and queuing anywhere later lets a child agent settle before its parent is
 * told the run ended. Giving up writes nothing for the same reason — a message in a capped-out
 * child's inbox leaves it unsettled forever.
 */
describe('红线：唯一的副作用在 turn-stopping', () => {
  it('src/runtime.ts 只调用一次 followup，且在 agent/turn-stopping 的监听器里', () => {
    const source = stripComments(read('src/runtime.ts'))
    const calls = source.match(/\.followup\(/g) ?? []
    expect(calls).toHaveLength(1)

    const segments = source.split(/ctx\.on\(/).slice(1)
    const owner = segments.find((segment) => segment.includes('.followup('))
    expect(owner, 'followup 不在任何监听器里').toBeDefined()
    expect((owner ?? '').trimStart().startsWith("'agent/turn-stopping'")).toBe(true)
  })

  it('放弃时不写 inbox —— 那条路径只记日志', () => {
    // Asserted structurally: the `give-up` branch returns before the followup call, so no later
    // edit can quietly turn "stop" into "queue one more".
    const source = stripComments(read('src/runtime.ts'))
    const giveUp = source.indexOf("decision === 'give-up'")
    const followup = source.indexOf('.followup(')
    expect(giveUp).toBeGreaterThan(-1)
    expect(followup).toBeGreaterThan(giveUp)
  })

  it('入队失败不把已结束的一轮变成失败的', () => {
    const source = stripComments(read('src/runtime.ts'))
    expect(source).toMatch(/catch\s*\(/)
    expect(source).toMatch(/logger\.warn/)
  })
})

/**
 * What the model reads.
 *
 * The cause sits below the model, so naming it cannot change behaviour and risks having the model
 * repeat the markup. The text is fixed rather than configurable, and it carries exactly one
 * instruction and no completion clause: the cap is what bounds a rescue, so a clause inviting the
 * model to say the work is done is only a cheaper exit than doing the work.
 */
describe('红线：续跑文案中性且固定', () => {
  it('文案不提原因，也不提方言名', () => {
    for (const word of ['dsml', 'markup', 'leak', 'reasoning', 'provider']) {
      expect(CONTINUE_PROMPT.toLowerCase(), word).not.toContain(word)
    }
  })

  it('文案只给一件事，不给「已完成」的出口', () => {
    expect(CONTINUE_PROMPT).toContain('Continue with the task')
    // Negative control. The words that once let a stalled model end the run were removed on purpose;
    // restoring them is the change this assertion exists to catch, and a positive assertion cannot.
    for (const word of ['complete', 'finish', 'done', 'summar']) {
      expect(CONTINUE_PROMPT.toLowerCase(), word).not.toContain(word)
    }
  })

  it('消息带自身来源，摘要里才出现轮次', () => {
    const message = createRescueMessage(2, 3)
    const source = message.source
    expect(source?.kind).toBe('dsml-rescue')
    // Narrowed rather than cast: the augmentation on `MessageSourceMap` is what makes `summary` part
    // of this variant, and a cast would keep asserting even if that declaration were deleted.
    if (source?.kind !== 'dsml-rescue') throw new Error('the rescue message lost its own source')
    expect(source.summary).toContain('2/3')
    // The round number lives in the summary, never in the text the model reads.
    expect(CONTINUE_PROMPT).not.toContain('2/3')
  })

  it('ARCHITECTURE 引用的续跑原文与代码一致', () => {
    // The docs quote the sentence for the reader; the code owns it. A quotation nobody re-checks
    // goes stale on the first rewording, and this one is quoted precisely so it cannot be retyped.
    /** Flatten a document: blockquote markers and wrapping are presentation, not text. */
    const flatten = (source: string): string =>
      source
        .replace(/\r?\n>\s?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    expect(
      flatten(read('docs/ARCHITECTURE.md')),
      'ARCHITECTURE 引用的续跑原文与 CONTINUE_PROMPT 不再一致',
    ).toContain(flatten(CONTINUE_PROMPT))
  })
})

/**
 * The facade images, and where they live.
 *
 * The market and every installer fetch this package to read `locale/` and the icon. Facade images
 * belong in the repository and the README references them relatively — both surfaces that render a
 * README resolve that path. This repository has no `assets/` directory, so the first assertion is
 * the shape that keeps one from ever being added to `files` by accident.
 */
describe('红线：门面图不进包，README 用相对路径', () => {
  it('files 不覆盖 assets/', () => {
    const files = pkg.files ?? []
    expect(files.filter((entry) => entry === 'assets' || entry.startsWith('assets/'))).toEqual([])
  })

  it('两份门面里的图都是相对路径，没有 raw.githubusercontent.com 形态', () => {
    for (const facade of ['README.md', 'README_zh.md']) {
      const source = read(facade)
      expect(source, `${facade} 用了 raw 绝对地址`).not.toContain('raw.githubusercontent.com')
      const local = [...source.matchAll(/<img\s[^>]*src="([^"]+)"/g)]
        .map((match) => match[1] ?? '')
        .filter((src) => !/^(?:https?:)?\/\//.test(src))
      // A local path that no longer exists renders as nothing, and nothing reports it.
      for (const src of local)
        expect(existsSync(new URL(`../${src}`, import.meta.url)), src).toBe(true)
    }
  })

  it('icon.svg 被 files 覆盖 —— 市场要从包里读它', () => {
    const icon = (pkg.icon ?? '').replace(/^\.\//, '')
    expect(icon).not.toBe('')
    expect(pkg.files ?? []).toContain(icon)
  })
})

/**
 * The documentation surface.
 *
 * A broken relative link is silent: GitHub renders the text and the reader finds out by clicking.
 * The records under `.agents/notes/` are excluded — they describe a moment, and the file they name
 * may legitimately have moved since.
 */
describe('文档', () => {
  /** Every markdown file a reader may land on, excluding records and dependency trees. */
  function documents(dir = '.'): string[] {
    const found: string[] = []
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), {
      withFileTypes: true,
    })) {
      const path = dir === '.' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) {
        if (['node_modules', 'lib', '.git', '.agents', '_analysis'].includes(entry.name)) continue
        found.push(...documents(path))
        continue
      }
      if (entry.name.endsWith('.md')) found.push(path)
    }
    return found
  }

  it('相对链接都指向仓里存在的文件', () => {
    const broken: string[] = []
    for (const document of documents()) {
      const source = read(document)
      const base = document.includes('/') ? document.slice(0, document.lastIndexOf('/')) : ''
      for (const match of source.matchAll(/\]\(([^)\s]+)\)/g)) {
        const raw = match[1] ?? ''
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#') || raw.startsWith('<')) continue
        const target = raw.split('#')[0] ?? ''
        if (target === '') continue
        const resolved = base === '' ? target : `${base}/${target}`
        if (!existsSync(new URL(`../${resolved}`, import.meta.url)))
          broken.push(`${document} → ${raw}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('两份门面首行互链', () => {
    expect(read('README.md')).toMatch(/README_zh\.md/)
    expect(read('README_zh.md')).toMatch(/README\.md/)
  })

  it('配置默认值只写在 ARCHITECTURE.md，门面不抄', () => {
    // The table in ARCHITECTURE.md is the single home for the defaults; the README points at it.
    // A second copy is a value that goes stale in a place nobody re-reads.
    for (const facade of ['README.md', 'README_zh.md']) {
      const source = read(facade)
      expect(source, `${facade} 抄了配置默认值`).not.toMatch(/maxConsecutive|applyToSubagents/)
    }
    const architecture = read('docs/ARCHITECTURE.md')
    expect(architecture).toContain('maxConsecutive')
    expect(architecture).toContain('applyToSubagents')
  })
})
