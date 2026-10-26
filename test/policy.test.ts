import { describe, expect, it } from 'vitest'

import { evaluate } from '../src/policy.ts'

const base = { candidate: true, consecutive: 0, maxConsecutive: 3, humanPending: false }

describe('evaluate', () => {
  it('rescues while the cap remains and counts the rescue', () => {
    expect(evaluate(base)).toEqual({ decision: 'rescue', consecutive: 1 })
    expect(evaluate({ ...base, consecutive: 2 })).toEqual({ decision: 'rescue', consecutive: 3 })
  })

  it('gives up at the cap and clears the streak for the next incident', () => {
    expect(evaluate({ ...base, consecutive: 3 })).toEqual({ decision: 'give-up', consecutive: 0 })
    // A cap of one still allows exactly one rescue.
    expect(evaluate({ ...base, maxConsecutive: 1, consecutive: 1 })).toEqual({
      decision: 'give-up',
      consecutive: 0,
    })
  })

  it('gives way to a waiting human without spending budget', () => {
    expect(evaluate({ ...base, humanPending: true })).toEqual({ decision: 'yield', consecutive: 0 })
    expect(evaluate({ ...base, consecutive: 1, humanPending: true })).toEqual({
      decision: 'yield',
      consecutive: 1,
    })
  })

  it('resets the streak on any turn that is not a candidate', () => {
    expect(evaluate({ ...base, candidate: false, consecutive: 2 })).toEqual({
      decision: 'ignore',
      consecutive: 0,
    })
  })

  it('lets the cap outrank a waiting human so the streak cannot stay unbounded', () => {
    expect(evaluate({ ...base, consecutive: 3, humanPending: true })).toEqual({
      decision: 'give-up',
      consecutive: 0,
    })
  })
})
