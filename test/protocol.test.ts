import { describe, expect, it } from 'vitest'

import { hasLeakedProtocolTail } from '../src/protocol.ts'

/** The dialect as the model actually emitted it: full-width bars. */
const FULL_WIDTH = '</｜｜DSML｜｜ calls>'

describe('hasLeakedProtocolTail', () => {
  it('detects the full-width closing tokens', () => {
    expect(hasLeakedProtocolTail(`Let me proceed.\n${FULL_WIDTH}`)).toBe(true)
  })

  it('detects a truncated tail with no closing bracket', () => {
    // The recording contains exactly this: the stream stopped mid-token.
    expect(hasLeakedProtocolTail('Let me check.\n</｜｜DSML｜｜ parameter')).toBe(true)
  })

  it('detects the ASCII-pipe spelling of the same dialect', () => {
    expect(hasLeakedProtocolTail('ok\n<||DSML|| invoke>')).toBe(true)
  })

  it('ignores case in the marker', () => {
    expect(hasLeakedProtocolTail('ok\n<||dsml|| invoke>')).toBe(true)
  })

  it('detects markup a few blank lines above the end', () => {
    expect(hasLeakedProtocolTail(`done\n<||DSML|| calls>\n\n\n`)).toBe(true)
  })

  it('does not treat a sentence that quotes the marker as a leak', () => {
    // This is the regression that matters: a model explaining the failure mode
    // must not be mistaken for one suffering from it.
    const explaining =
      'The turn ended without output because it wrote </｜｜DSML｜｜ parameter> into reasoning.'
    expect(hasLeakedProtocolTail(explaining)).toBe(false)
  })

  it('does not look past the trailing window', () => {
    const buried = `<||DSML|| calls>\nthen I wrote several more lines\nthat push it out of the window\nand end here`
    expect(hasLeakedProtocolTail(buried)).toBe(false)
  })

  it('reports no leak for empty reasoning', () => {
    expect(hasLeakedProtocolTail('')).toBe(false)
    expect(hasLeakedProtocolTail('\n\n  \n')).toBe(false)
  })
})
